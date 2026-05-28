import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { db } from "~/db/index.server";
import { analyticsAccounts } from "~/db/schema.server";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { ArrowLeft, Plus, Trash2, ExternalLink } from "lucide-react";

const PLATFORMS = ["小红书", "抖音", "B站", "微博", "YouTube", "Instagram", "Twitter/X", "其他"];

export async function loader({ request }: LoaderFunctionArgs) {
  const accounts = db.select().from(analyticsAccounts).all();
  return json({ accounts });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "add") {
    const platform = formData.get("platform") as string;
    const accountName = formData.get("accountName") as string;
    const url = formData.get("url") as string;

    if (!platform?.trim() || !accountName?.trim()) {
      return json({ error: "平台和账号名不能为空" }, { status: 400 });
    }

    db.insert(analyticsAccounts).values({
      id: uuid(),
      platform: platform.trim(),
      accountName: accountName.trim(),
      url: url?.trim() || null,
      createdAt: new Date().toISOString(),
    }).run();
  }

  if (intent === "delete") {
    const id = formData.get("id") as string;
    db.delete(analyticsAccounts).where(eq(analyticsAccounts.id, id)).run();
  }

  return redirect("/analytics/accounts");
}

export default function AnalyticsAccounts() {
  const { accounts } = useLoaderData<typeof loader>();

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link to="/analytics" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft size={16} />
        返回数据分析
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">账号管理</h1>

      <Form method="post" className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <input type="hidden" name="intent" value="add" />
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">平台 *</label>
            <select
              name="platform"
              required
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">账号名 *</label>
            <input
              type="text"
              name="accountName"
              required
              placeholder="如：我的日常vlog"
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">链接</label>
            <input
              type="url"
              name="url"
              placeholder="https://..."
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
        <button
          type="submit"
          className="flex items-center gap-1.5 px-4 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus size={14} />
          添加账号
        </button>
      </Form>

      {accounts.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-8">暂无账号</p>
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-3"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                  {account.platform}
                </span>
                <span className="text-sm font-medium text-gray-900">{account.accountName}</span>
                {account.url && (
                  <a href={account.url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-600">
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
              <Form method="post">
                <input type="hidden" name="intent" value="delete" />
                <input type="hidden" name="id" value={account.id} />
                <button
                  type="submit"
                  className="text-gray-300 hover:text-red-500 transition-colors"
                  onClick={(e) => !confirm("删除此账号及其所有数据？") && e.preventDefault()}
                >
                  <Trash2 size={14} />
                </button>
              </Form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
