import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData, useSearchParams } from "@remix-run/react";
import { db } from "~/db/index.server";
import { analyticsAccounts, analyticsMetrics } from "~/db/schema.server";
import { eq, desc, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { ArrowLeft, Plus, TrendingUp, Users, Eye, Heart, MessageCircle } from "lucide-react";
import AnalyticsChart from "~/components/AnalyticsChart";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const selectedAccountId = url.searchParams.get("account") || "";

  const accounts = db.select().from(analyticsAccounts).all();

  let activeAccount = null;
  let metrics: any[] = [];

  if (selectedAccountId) {
    activeAccount = db.select().from(analyticsAccounts).where(eq(analyticsAccounts.id, selectedAccountId)).get();
    if (activeAccount) {
      metrics = db.select()
        .from(analyticsMetrics)
        .where(eq(analyticsMetrics.accountId, selectedAccountId))
        .orderBy(desc(analyticsMetrics.date))
        .all();
    }
  } else if (accounts.length > 0) {
    activeAccount = accounts[0];
    metrics = db.select()
      .from(analyticsMetrics)
      .where(eq(analyticsMetrics.accountId, activeAccount.id))
      .orderBy(desc(analyticsMetrics.date))
      .all();
  }

  // Calculate totals
  const totals = {
    followers: 0, views: 0, likes: 0, comments: 0, shares: 0, posts: 0, revenue: 0,
  };
  for (const m of metrics) {
    totals.followers += m.followers || 0;
    totals.views += m.views || 0;
    totals.likes += m.likes || 0;
    totals.comments += m.comments || 0;
    totals.shares += m.shares || 0;
    totals.posts += m.posts || 0;
    totals.revenue += m.revenue || 0;
  }

  // Latest values
  const latest = metrics[0] || null;

  return json({
    accounts,
    activeAccount,
    metrics: metrics.reverse(), // chronological for chart
    totals,
    latest,
    selectedAccountId: activeAccount?.id || "",
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "add-metric") {
    const accountId = formData.get("accountId") as string;
    const date = formData.get("date") as string;

    if (!accountId || !date) {
      return json({ error: "请选择账号和日期" }, { status: 400 });
    }

    db.insert(analyticsMetrics).values({
      id: uuid(),
      accountId,
      date,
      followers: parseInt(formData.get("followers") as string) || 0,
      views: parseInt(formData.get("views") as string) || 0,
      likes: parseInt(formData.get("likes") as string) || 0,
      comments: parseInt(formData.get("comments") as string) || 0,
      shares: parseInt(formData.get("shares") as string) || 0,
      posts: parseInt(formData.get("posts") as string) || 0,
      revenue: parseInt(formData.get("revenue") as string) || 0,
    }).run();
  }

  if (intent === "delete-metric") {
    const id = formData.get("id") as string;
    db.delete(analyticsMetrics).where(eq(analyticsMetrics.id, id)).run();
  }

  return redirect(`/analytics?account=${formData.get("accountId")}`);
}

export default function AnalyticsDashboard() {
  const { accounts, activeAccount, metrics, totals, latest, selectedAccountId } = useLoaderData<typeof loader>();
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">数据分析</h1>
          <p className="text-sm text-gray-500">自媒体运营数据监控</p>
        </div>
        <a
          href="/analytics/accounts"
          className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          管理账号
        </a>
      </div>

      {/* Account selector */}
      {accounts.length > 0 && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {accounts.map((acc) => (
            <a
              key={acc.id}
              href={`/analytics?account=${acc.id}`}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full transition-colors ${
                selectedAccountId === acc.id
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <span className="text-xs opacity-70">{acc.platform}</span>
              {acc.accountName}
            </a>
          ))}
        </div>
      )}

      {!activeAccount ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <TrendingUp size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400 mb-3">还没有添加账号</p>
          <a
            href="/analytics/accounts"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700"
          >
            <Plus size={14} />
            添加第一个账号
          </a>
        </div>
      ) : (
        <>
          {/* Latest stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <MetricCard icon={Users} label="粉丝" value={latest?.followers || 0} />
            <MetricCard icon={Eye} label="播放量(总)" value={totals.views} />
            <MetricCard icon={Heart} label="点赞(总)" value={totals.likes} />
            <MetricCard icon={MessageCircle} label="评论(总)" value={totals.comments} />
          </div>

          {/* Chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <h2 className="font-semibold text-gray-900 mb-4">趋势图</h2>
            <AnalyticsChart
              data={metrics}
              metrics={["followers", "views", "likes"]}
              type="line"
            />
          </div>

          {/* Add data form + recent entries */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Add metric form */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4">添加数据</h2>
              <Form method="post" className="space-y-3">
                <input type="hidden" name="intent" value="add-metric" />
                <input type="hidden" name="accountId" value={activeAccount.id} />

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">日期</label>
                  <input
                    type="date"
                    name="date"
                    defaultValue={today}
                    required
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">粉丝</label>
                    <input type="number" name="followers" defaultValue="0" className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">播放量</label>
                    <input type="number" name="views" defaultValue="0" className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">点赞</label>
                    <input type="number" name="likes" defaultValue="0" className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">评论</label>
                    <input type="number" name="comments" defaultValue="0" className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">分享</label>
                    <input type="number" name="shares" defaultValue="0" className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">发布数</label>
                    <input type="number" name="posts" defaultValue="0" className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
                >
                  添加记录
                </button>
              </Form>
            </div>

            {/* Recent entries */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4">最近记录</h2>
              {metrics.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">暂无数据</p>
              ) : (
                <ul className="space-y-2 max-h-[400px] overflow-auto">
                  {metrics.slice().reverse().slice(0, 10).map((m) => (
                    <li key={m.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 text-sm">
                      <span className="text-gray-600">{m.date}</span>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>粉 {m.followers}</span>
                        <span>播 {m.views}</span>
                        <span>赞 {m.likes}</span>
                      </div>
                      <Form method="post" className="inline">
                        <input type="hidden" name="intent" value="delete-metric" />
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="accountId" value={activeAccount.id} />
                        <button type="submit" className="text-gray-300 hover:text-red-500 text-xs"
                          onClick={(e) => !confirm("删除此记录？") && e.preventDefault()}>
                          删除
                        </button>
                      </Form>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-gray-400" />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-xl font-bold text-gray-900">{value.toLocaleString()}</p>
    </div>
  );
}
