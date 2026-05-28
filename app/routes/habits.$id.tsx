import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { db } from "~/db/index.server";
import { habits, habitLogs } from "~/db/schema.server";
import { eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { ArrowLeft, Trash2, Flame, Trophy } from "lucide-react";
import { cn, formatDate, getFrequencyLabel } from "~/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from "recharts";

export async function loader({ params }: LoaderFunctionArgs) {
  const habit = db.select().from(habits).where(eq(habits.id, params.id!)).get();
  if (!habit) throw new Response("Not Found", { status: 404 });

  const logs = db
    .select()
    .from(habitLogs)
    .where(eq(habitLogs.habitId, habit.id))
    .all();

  // Calculate streak
  const completedLogs = logs.filter((l) => l.completed).sort((a, b) => b.date.localeCompare(a.date));
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  const completedToday = completedLogs.some((l) => l.date === todayStr);
  let checkDate = new Date(today);
  if (!completedToday) checkDate.setDate(checkDate.getDate() - 1);

  for (const log of completedLogs) {
    const expectedStr = checkDate.toISOString().split("T")[0];
    if (log.date === expectedStr) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (log.date < expectedStr) {
      break;
    }
  }

  // Build heatmap data (last 90 days)
  const heatmapData: { date: string; completed: boolean }[] = [];
  const logMap = new Map(logs.map((l) => [l.date, l.completed]));

  for (let i = 0; i < 90; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    heatmapData.push({
      date: dateStr,
      completed: !!logMap.get(dateStr),
    });
  }

  const totalCompletions = completedLogs.length;
  const completionRate = logs.length > 0
    ? Math.round((totalCompletions / logs.length) * 100)
    : 0;

  // Weekly data: last 8 weeks
  const weeklyData: { week: string; count: number }[] = [];
  for (let w = 7; w >= 0; w--) {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - w * 7 - today.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const startStr = weekStart.toISOString().split("T")[0];
    const endStr = weekEnd.toISOString().split("T")[0];
    const count = completedLogs.filter((l) => l.date >= startStr && l.date <= endStr).length;
    // Label: M/D format for week start
    const label = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
    weeklyData.push({ week: label, count });
  }

  // Monthly data: last 6 months
  const monthlyData: { month: string; rate: number; count: number; total: number }[] = [];
  for (let m = 5; m >= 0; m--) {
    const d = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthLogs = logs.filter((l) => l.date.startsWith(monthStr));
    const monthCompleted = monthLogs.filter((l) => l.completed).length;
    const rate = monthLogs.length > 0 ? Math.round((monthCompleted / monthLogs.length) * 100) : 0;
    const label = `${d.getMonth() + 1}月`;
    monthlyData.push({ month: label, rate, count: monthCompleted, total: monthLogs.length });
  }

  // Milestone: highest reached milestone
  const milestones = [100, 30, 7];
  const milestone = milestones.find((m) => streak >= m) || null;

  return json({ habit, logs, streak, heatmapData, totalCompletions, completionRate, today: todayStr, weeklyData, monthlyData, milestone });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "update") {
    const now = new Date().toISOString();
    db.update(habits)
      .set({
        title: (formData.get("title") as string).trim(),
        description: (formData.get("description") as string) || "",
        frequency: ((formData.get("frequency") as string) || "daily") as "daily" | "weekly" | "monthly",
        color: (formData.get("color") as string) || null,
        updatedAt: now,
      })
      .where(eq(habits.id, params.id!))
      .run();
    return redirect(`/habits/${params.id}`);
  }

  if (intent === "toggle-today") {
    const today = new Date().toISOString().split("T")[0];
    const existing = db
      .select()
      .from(habitLogs)
      .where(and(eq(habitLogs.habitId, params.id!), eq(habitLogs.date, today)))
      .get();

    if (existing) {
      db.update(habitLogs)
        .set({ completed: !existing.completed })
        .where(eq(habitLogs.id, existing.id))
        .run();
    } else {
      db.insert(habitLogs).values({
        id: uuid(),
        habitId: params.id!,
        date: today,
        completed: true,
      }).run();
    }
    return redirect(`/habits/${params.id}`);
  }

  if (intent === "delete") {
    db.delete(habitLogs).where(eq(habitLogs.habitId, params.id!)).run();
    db.delete(habits).where(eq(habits.id, params.id!)).run();
    return redirect("/habits");
  }

  return redirect(`/habits/${params.id}`);
}

export default function HabitDetail() {
  const { habit, streak, heatmapData, totalCompletions, completionRate, weeklyData, monthlyData, milestone } =
    useLoaderData<typeof loader>();
  const color = habit.color || "#1A7A4A";

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link to="/habits" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft size={16} />
        返回习惯列表
      </Link>

      {/* Milestone banner */}
      {milestone && (
        <div className="mb-6 bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center gap-3">
          <span className="text-2xl">🏆</span>
          <div>
            <p className="font-semibold text-orange-700">里程碑达成！</p>
            <p className="text-sm text-orange-600">已连续坚持 {streak} 天，突破 {milestone} 天里程碑</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">{habit.title}</h1>
            <span
              className="text-[11px] px-2 py-0.5 rounded-full"
              style={{ backgroundColor: color + "18", color }}
            >
              {getFrequencyLabel(habit.frequency)}
            </span>
          </div>
          {habit.description && (
            <p className="text-sm text-gray-500 mt-1">{habit.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Today toggle */}
          <Form method="post">
            <input type="hidden" name="intent" value="toggle-today" />
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors"
              style={{
                backgroundColor: heatmapData[0]?.completed ? color : "transparent",
                color: heatmapData[0]?.completed ? "#fff" : color,
                borderColor: color,
              }}
            >
              {heatmapData[0]?.completed ? "✓ 今日已完成" : "○ 标记完成"}
            </button>
          </Form>

          {/* Delete */}
          <Form method="post">
            <input type="hidden" name="intent" value="delete" />
            <button
              type="submit"
              className="p-2 text-gray-400 hover:text-red-500 transition-colors"
              onClick={(e) => !confirm("确定删除这个习惯？") && e.preventDefault()}
            >
              <Trash2 size={16} />
            </button>
          </Form>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Flame size={18} className={streak > 0 ? "text-orange-500" : "text-gray-300"} />
            <span className={cn("text-2xl font-bold", streak > 0 ? "text-orange-500" : "text-gray-400")}>
              {streak}
            </span>
          </div>
          <p className="text-xs text-gray-400">连续天数</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <span className="text-2xl font-bold text-gray-900">{totalCompletions}</span>
          <p className="text-xs text-gray-400">累计完成</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <span className="text-2xl font-bold text-gray-900">{completionRate}%</span>
          <p className="text-xs text-gray-400">完成率</p>
        </div>
      </div>

      {/* Weekly bar chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h3 className="text-sm font-medium text-gray-700 mb-4">近 8 周完成次数</h3>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={weeklyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E7EB" }}
              formatter={(value: number) => [`${value} 次`, "完成"]}
            />
            <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly line chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h3 className="text-sm font-medium text-gray-700 mb-4">近 6 个月完成率</h3>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={monthlyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E7EB" }}
              formatter={(value: number) => [`${value}%`, "完成率"]}
            />
            <Line
              type="monotone"
              dataKey="rate"
              stroke={color}
              strokeWidth={2}
              dot={{ r: 4, fill: color, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Heatmap */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-3">最近 90 天</h3>
        <div className="grid grid-cols-15 gap-1">
          {heatmapData.map((day) => (
            <div
              key={day.date}
              className="w-full aspect-square rounded-sm"
              style={{ backgroundColor: day.completed ? color : "#F4F6F5" }}
              title={`${day.date}: ${day.completed ? "已完成" : "未完成"}`}
            />
          ))}
        </div>
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1 text-[11px] text-gray-400">
            <span className="block w-3 h-3 rounded-sm" style={{ backgroundColor: "#F4F6F5" }} />
            未完成
          </div>
          <div className="flex items-center gap-1 text-[11px] text-gray-400">
            已完成
            <span className="block w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
          </div>
        </div>
      </div>

      {/* Edit form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-medium text-gray-700 mb-4">编辑习惯</h3>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="update" />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
            <input
              type="text"
              name="title"
              defaultValue={habit.title}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
            <textarea
              name="description"
              rows={2}
              defaultValue={habit.description || ""}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">频率</label>
            <select
              name="frequency"
              defaultValue={habit.frequency}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="daily">每天</option>
              <option value="weekly">每周</option>
              <option value="monthly">每月</option>
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="px-6 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              保存修改
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}
