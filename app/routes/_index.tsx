import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData, useFetcher } from "@remix-run/react";
import type { ReactNode } from "react";
import { db } from "~/db/index.server";
import { tasks, goals, notes, habits, habitLogs, analyticsAccounts, analyticsMetrics, scheduleBlocks } from "~/db/schema.server";
import { desc, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { cn } from "~/lib/utils";
import {
  Plus, ListTodo, CheckCircle2,
  TrendingUp, Edit3, Target,
  AlertCircle, Flame, Link2, Loader2, Check, CalendarClock,
} from "lucide-react";
import FocusTimer from "~/components/FocusTimer";
import { useState, useEffect, useRef } from "react";

export async function loader({ request }: LoaderFunctionArgs) {
  const now = new Date().toISOString().split("T")[0];
  const ms7d = Date.now() - 7 * 86400000;

  const allTasks = db.select().from(tasks).all();
  const allGoals = db.select().from(goals).all();
  const allNotes = db.select().from(notes).all();

  const todayTasks = allTasks.filter((t) => t.dueDate?.split("T")[0] === now);
  const inProgressTasks = allTasks.filter((t) => t.status === "in_progress");
  const doneToday = allTasks.filter((t) => t.status === "done" && t.updatedAt?.split("T")[0] === now);

  const weekDoneTotal = allTasks.filter((t) => {
    if (t.status !== "done" || !t.updatedAt) return false;
    return new Date(t.updatedAt).getTime() > Date.now() - 7 * 86400000;
  }).length;

  const activeGoals = allGoals.filter((g) => g.status === "active").map((goal) => {
    const goalTasks = allTasks.filter((t) => t.goalId === goal.id);
    const doneCount = goalTasks.filter((t) => t.status === "done").length;
    return { ...goal, taskCount: goalTasks.length, doneCount, progress: goalTasks.length > 0 ? Math.round((doneCount / goalTasks.length) * 100) : 0 };
  });

  // ─── Pending tasks for the todo list ───
  const goalMap = new Map(allGoals.map((g) => [g.id, g.title]));
  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  const pendingTasks = allTasks
    .filter((t) => t.status !== "done")
    .sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2))
    .map((t) => ({
      ...t,
      goalTitle: t.goalId ? goalMap.get(t.goalId) : undefined,
      isOverdue: t.dueDate ? t.dueDate.split("T")[0] < now : false,
    }));

  // ─── Insights data ───
  const notesThisWeek = allNotes.filter((n) => new Date(n.createdAt).getTime() > ms7d).length;
  const notesToday = allNotes.filter((n) => n.createdAt?.split("T")[0] === now).length;
  const completedGoals = allGoals.filter((g) => g.status === "completed").length;
  const avgGoalProgress = activeGoals.length > 0
    ? Math.round(activeGoals.reduce((s, g) => s + g.progress, 0) / activeGoals.length)
    : 0;

  // Habits for today — single batch query instead of N+1
  const allHabits = db.select().from(habits).orderBy(desc(habits.createdAt)).all();
  const allHabitLogs = db
    .select({ habitId: habitLogs.habitId, date: habitLogs.date, completed: habitLogs.completed })
    .from(habitLogs)
    .where(eq(habitLogs.completed, true))
    .orderBy(desc(habitLogs.date))
    .all();

  // Group logs by habitId for O(1) lookup
  const logsByHabit = new Map<string, string[]>();
  const todayLogSet = new Set<string>();
  for (const log of allHabitLogs) {
    if (log.date === now) todayLogSet.add(log.habitId);
    if (!logsByHabit.has(log.habitId)) logsByHabit.set(log.habitId, []);
    logsByHabit.get(log.habitId)!.push(log.date);
  }

  const habitsWithToday = allHabits.map((h) => {
    const completedToday = todayLogSet.has(h.id);
    const logs = logsByHabit.get(h.id) ?? [];
    let streak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    if (!completedToday) cursor.setDate(cursor.getDate() - 1);
    for (const date of logs) {
      const expected = cursor.toISOString().split("T")[0];
      if (date === expected) { streak++; cursor.setDate(cursor.getDate() - 1); }
      else if (date < expected) break;
    }
    return { ...h, completedToday, streak };
  });

  // Notes created trend (last 7 days — no longer needed for sparkline, kept for future use)

  // Analytics: default account + last 14 entries
  const allAccounts = db.select().from(analyticsAccounts).all();
  const defaultAccount = allAccounts[0] ?? null;
  let analyticsData: { account: typeof defaultAccount; metrics: { date: string; followers: number; views: number; likes: number }[] } | null = null;
  if (defaultAccount) {
    const recentMetrics = db
      .select({ date: analyticsMetrics.date, followers: analyticsMetrics.followers, views: analyticsMetrics.views, likes: analyticsMetrics.likes })
      .from(analyticsMetrics)
      .where(eq(analyticsMetrics.accountId, defaultAccount.id))
      .orderBy(desc(analyticsMetrics.date))
      .limit(14)
      .all()
      .reverse(); // chronological
    analyticsData = { account: defaultAccount, metrics: recentMetrics as { date: string; followers: number; views: number; likes: number }[] };
  }

  // ─── Today's schedule blocks ───
  const todaySchedule = db.select().from(scheduleBlocks)
    .where(eq(scheduleBlocks.date, now))
    .all()
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const isNewUser = allTasks.length === 0 && allNotes.length === 0 && allHabits.length === 0 && todaySchedule.length === 0;

  return json({
    stats: { totalTasks: allTasks.length, todayTasks: todayTasks.length, inProgress: inProgressTasks.length, doneToday: doneToday.length, activeGoals: activeGoals.length },
    pendingTasks,
    activeGoals: activeGoals.slice(0, 4),
    habits: habitsWithToday,
    insights: {
      totalNotes: allNotes.length,
      notesThisWeek,
      notesToday,
      completedGoals,
      avgGoalProgress,
      weekDoneTotal,
    },
    analyticsData,
    hasMultipleAccounts: allAccounts.length > 1,
    todaySchedule,
    isNewUser,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "quick-task") {
    const title = formData.get("title") as string;
    if (!title?.trim()) return json({ error: "Title is required" }, { status: 400 });
    const now = new Date().toISOString();
    db.insert(tasks).values({ id: uuid(), title: title.trim(), status: "todo", priority: "medium", createdAt: now, updatedAt: now }).run();
  } else if (intent === "complete-task") {
    const taskId = formData.get("taskId") as string;
    if (taskId) {
      db.update(tasks).set({ status: "done", updatedAt: new Date().toISOString() }).where(eq(tasks.id, taskId)).run();
    }
  } else if (intent === "quick-link") {
    const url = (formData.get("url") as string)?.trim();
    const title = (formData.get("title") as string)?.trim();
    const ogImage = (formData.get("ogImage") as string) || null;
    if (url && title) {
      const now = new Date().toISOString();
      db.insert(notes).values({
        id: uuid(),
        title,
        content: "",
        categoryId: null,
        type: "link",
        sourceUrl: url,
        ogImage,
        createdAt: now,
        updatedAt: now,
      }).run();
    }
    return json({ ok: true });
  }
  return redirect("/");
}

// ─── Task row component ───

function TaskRow({ task }: { task: any }) {
  const fetcher = useFetcher();
  const priorityConfig: Record<string, { color: string; label: string }> = {
    urgent: { color: "bg-red-500", label: "紧急" },
    high: { color: "bg-orange-500", label: "高" },
    medium: { color: "bg-primary-500", label: "中" },
    low: { color: "bg-gray-300", label: "低" },
  };
  const pc = priorityConfig[task.priority] || priorityConfig.medium;
  const isCompleting = fetcher.state !== "idle";

  return (
    <div className={cn(
      "flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-[#F4F6F5] transition-colors group",
      isCompleting && "opacity-40 pointer-events-none"
    )}>
      {/* Complete button */}
      <fetcher.Form method="post" className="shrink-0">
        <input type="hidden" name="intent" value="complete-task" />
        <input type="hidden" name="taskId" value={task.id} />
        <button
          type="submit"
          className="w-5 h-5 flex items-center justify-center rounded-full border-2 border-[#D1D5DB] hover:border-primary-500 hover:bg-primary-50 transition-colors group/btn"
          title="标记完成"
          aria-label="标记完成"
        >
          {task.status === "in_progress" && (
            <div className="w-2 h-2 rounded-full bg-primary-600 group-hover/btn:hidden" />
          )}
          <CheckCircle2
            size={12}
            className={cn(
              "text-primary-500 hidden group-hover/btn:block",
              task.status !== "in_progress" && "group-hover:block"
            )}
          />
        </button>
      </fetcher.Form>

      {/* Content — clicking navigates to detail */}
      <Link to={`/tasks/${task.id}`} className="flex-1 min-w-0 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-[13px] truncate",
              task.status === "in_progress" ? "text-gray-900 font-medium" : "text-gray-700"
            )}>
              {task.title}
            </span>
            {task.isOverdue && (
              <span className="text-[10px] font-medium text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5">
                <AlertCircle size={9} />过期
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {task.dueDate && (
              <span className="text-[10px] text-[#8A8F98]">
                {task.dueDate.split("T")[0]}
              </span>
            )}
            {task.goalTitle && (
              <span className="text-[10px] text-primary-500 bg-primary-50 px-1.5 py-0.5 rounded-full truncate max-w-[120px]">
                {task.goalTitle}
              </span>
            )}
          </div>
        </div>

        {/* Priority dot + status badge */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("w-1.5 h-1.5 rounded-full", pc.color)} title={pc.label} />
          <span className={cn(
            "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
            task.status === "in_progress"
              ? "bg-primary-50 text-primary-700"
              : "bg-gray-100 text-gray-500"
          )}>
            {task.status === "in_progress" ? "进行中" : "待办"}
          </span>
        </div>
      </Link>
    </div>
  );
}

export default function Dashboard() {
  const { stats, pendingTasks, activeGoals, habits: habitList, insights, analyticsData, todaySchedule, isNewUser } = useLoaderData<typeof loader>();
  const analyticsLast = analyticsData?.metrics[analyticsData.metrics.length - 1];

  // Today's status — localStorage persisted
  const todayKey = `daily-status-${new Date().toISOString().split("T")[0]}`;
  const [statusText, setStatusText] = useState("");
  const [editingStatus, setEditingStatus] = useState(false);
  const [statusDraft, setStatusDraft] = useState("");
  const statusInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setStatusText(localStorage.getItem(todayKey) || "");
  }, [todayKey]);

  const saveStatus = () => {
    const val = statusDraft.trim();
    setStatusText(val);
    if (val) localStorage.setItem(todayKey, val);
    else localStorage.removeItem(todayKey);
    setEditingStatus(false);
  };

  const openEdit = () => {
    setStatusDraft(statusText);
    setEditingStatus(true);
    setTimeout(() => statusInputRef.current?.focus(), 50);
  };

  const todayStr = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">

      {/* ─── Header ─── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-[#8A8F98] font-medium mb-1">{todayStr}</p>
            {editingStatus ? (
              <input
                ref={statusInputRef}
                type="text"
                value={statusDraft}
                onChange={(e) => setStatusDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveStatus();
                  if (e.key === "Escape") setEditingStatus(false);
                }}
                onBlur={saveStatus}
                maxLength={60}
                placeholder="今天想做什么？"
                className="text-[20px] md:text-[22px] font-bold text-gray-900 tracking-tight bg-transparent border-none focus:outline-none w-full placeholder:text-gray-300"
              />
            ) : (
              <button onClick={openEdit} className="text-left group flex items-baseline gap-2 w-full">
                <h1 className={cn(
                  "text-[20px] md:text-[22px] font-bold tracking-tight transition-colors break-words text-left",
                  statusText ? "text-gray-900" : "text-gray-300"
                )}>
                  {statusText || "今天想做什么？"}
                </h1>
                <span className="hidden md:inline text-[11px] text-[#C0C5CC] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">点击编辑</span>
              </button>
            )}
          </div>
          {/* 桌面端：按钮横排；移动端：只显示主按钮 */}
          <div className="flex items-center gap-2 shrink-0 pt-1">
            <span className="hidden md:block"><QuickLinkSave /></span>
            <Link to="/tasks/new" className="btn-primary flex items-center gap-1.5 text-[13px]">
              <Plus size={14} /><span>新建任务</span>
            </Link>
          </div>
        </div>
        {/* 移动端：收藏链接降级为次要小按钮 */}
        <div className="md:hidden">
          <QuickLinkSave />
        </div>
      </div>

      {/* ─── Stat Cards or Onboarding ─── */}
      {isNewUser ? (
        <div className="bg-white rounded-2xl border border-[#E8ECEA] p-5">
          <p className="text-[13px] font-bold text-gray-900 mb-3">开始使用 — 完成这三步</p>
          <div className="space-y-2">
            <Link to="/tasks/new" className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#F4F6F5] transition-colors group">
              <div className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center shrink-0 group-hover:border-primary-400 transition-colors">
                <ListTodo size={14} className="text-gray-400 group-hover:text-primary-500" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-gray-700">创建第一个任务</p>
                <p className="text-[11px] text-[#8A8F98]">记录你今天最重要的事</p>
              </div>
              <svg className="ml-auto text-gray-300 group-hover:text-primary-400 transition-colors" width="16" height="16" viewBox="0 0 12 12" fill="none"><path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </Link>
            <Link to="/schedule" className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#F4F6F5] transition-colors group">
              <div className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center shrink-0 group-hover:border-primary-400 transition-colors">
                <CalendarClock size={14} className="text-gray-400 group-hover:text-primary-500" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-gray-700">安排今天的日程</p>
                <p className="text-[11px] text-[#8A8F98]">用时间块规划每个时间段</p>
              </div>
              <svg className="ml-auto text-gray-300 group-hover:text-primary-400 transition-colors" width="16" height="16" viewBox="0 0 12 12" fill="none"><path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </Link>
            <Link to="/habits" className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#F4F6F5] transition-colors group">
              <div className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center shrink-0 group-hover:border-primary-400 transition-colors">
                <Flame size={14} className="text-gray-400 group-hover:text-primary-500" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-gray-700">建立一个习惯</p>
                <p className="text-[11px] text-[#8A8F98]">每天坚持，积累连击天数</p>
              </div>
              <svg className="ml-auto text-gray-300 group-hover:text-primary-400 transition-colors" width="16" height="16" viewBox="0 0 12 12" fill="none"><path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Primary card */}
        <Link to="/tasks" className="relative rounded-[20px] bg-primary-700 p-5 overflow-hidden flex flex-col justify-between min-h-[130px] hover:bg-primary-800 transition-colors group">
          <div className="absolute inset-0 opacity-[0.07]" style={{
            backgroundImage: `radial-gradient(circle at 80% 20%, white 1.5px, transparent 1.5px), radial-gradient(circle at 20% 80%, white 1px, transparent 1px)`,
            backgroundSize: "36px 36px, 24px 24px",
          }} />
          <div className="relative flex items-center justify-between">
            <div className="w-9 h-9 rounded-[12px] bg-white/15 flex items-center justify-center">
              <ListTodo size={17} className="text-white" strokeWidth={1.8} />
            </div>
            <div className="w-7 h-7 rounded-full border border-white/20 flex items-center justify-center opacity-60 group-hover:opacity-100 transition-opacity">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 9.5L9.5 2.5M9.5 2.5H4M9.5 2.5V8" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </div>
          <div className="relative">
            <p className="text-[36px] font-bold text-white leading-none">{stats.totalTasks}</p>
            <p className="text-[13px] text-white/60 mt-1">总任务数</p>
            {stats.doneToday > 0 && (
              <p className="text-[11px] text-white/50 mt-1 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
                今日完成 {stats.doneToday} 项
              </p>
            )}
          </div>
        </Link>

        {/* Secondary cards */}
        <StatCard
          icon={<Target size={17} strokeWidth={1.8} />}
          label="活跃目标"
          value={stats.activeGoals}
          sub={insights.avgGoalProgress > 0 ? `平均进度 ${insights.avgGoalProgress}%` : "暂无进度"}
          href="/goals"
        />
        <StatCard
          icon={<Edit3 size={17} strokeWidth={1.8} />}
          label="笔记总数"
          value={insights.totalNotes}
          sub={insights.notesThisWeek > 0 ? `本周新增 ${insights.notesThisWeek} 篇` : "本周暂无新增"}
          href="/notes"
        />
        <StatCard
          icon={<TrendingUp size={17} strokeWidth={1.8} />}
          label="本周完成"
          value={insights.weekDoneTotal}
          sub={`进行中 ${stats.inProgress} 项`}
          href="/tasks"
        />
      </div>
      )}

      {/* ─── Main Grid ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* ─── Left: Task List ─── */}
        <div className="md:col-span-2 flex flex-col gap-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-bold text-gray-900">任务清单</h2>
                <span className="text-[11px] text-[#8A8F98] bg-[#F4F6F5] px-2 py-0.5 rounded-full">
                  {pendingTasks.length} 项待处理
                </span>
              </div>
              <Link to="/tasks" className="text-[12px] text-primary-600 font-semibold hover:text-primary-700 flex items-center gap-1">
                查看全部
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </Link>
            </div>

            {pendingTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14">
                <div className="w-12 h-12 rounded-2xl bg-primary-50 flex items-center justify-center mb-3">
                  <CheckCircle2 size={22} className="text-primary-400" />
                </div>
                <p className="text-[14px] font-semibold text-gray-600">所有任务已完成</p>
                <p className="text-[12px] text-[#8A8F98] mt-1">通过下方快速添加新任务</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {pendingTasks.filter((t) => t.status === "in_progress").length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] font-bold text-[#8A8F98] uppercase tracking-[0.14em] px-2 mb-1.5">进行中</p>
                    {pendingTasks.filter((t) => t.status === "in_progress").map((task) => (
                      <TaskRow key={task.id} task={task} />
                    ))}
                  </div>
                )}
                {pendingTasks.filter((t) => t.status === "todo").length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-[#8A8F98] uppercase tracking-[0.14em] px-2 mb-1.5">待办</p>
                    {pendingTasks.filter((t) => t.status === "todo").map((task) => (
                      <TaskRow key={task.id} task={task} />
                    ))}
                  </div>
                )}
              </div>
            )}

            <Form method="post" className="flex gap-2 mt-4 pt-4 border-t border-[#F0F2F1]">
              <input type="hidden" name="intent" value="quick-task" />
              <input
                type="text" name="title"
                placeholder="快速添加任务..."
                className="flex-1 bg-[#F8FAF9] border border-[#E8ECEA] rounded-xl px-3.5 py-2 text-[13px] placeholder:text-[#B0B5BC] focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-300 transition-all"
              />
              <button type="submit" className="btn-primary !py-2 !px-4 !text-[12px] shrink-0 flex items-center gap-1">
                <Plus size={13} />添加
              </button>
            </Form>
          </div>

          {/* ─── Active Goals ─── */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[15px] font-bold text-gray-900">活跃目标</h2>
              <Link to="/goals" className="text-[12px] text-primary-600 font-semibold hover:text-primary-700">全部</Link>
            </div>
            {activeGoals.length === 0 ? (
              <p className="text-[13px] text-[#8A8F98] py-4 text-center">暂无活跃目标</p>
            ) : (
              <div className="space-y-3">
                {activeGoals.map((goal) => (
                  <Link key={goal.id} to={`/goals/${goal.id}`} className="flex items-center gap-4 p-3 rounded-2xl hover:bg-[#F8FAF9] transition-colors group">
                    <div className="w-9 h-9 rounded-[12px] bg-primary-50 flex items-center justify-center shrink-0">
                      <Target size={15} className="text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[13px] font-semibold text-gray-900 truncate">{goal.title}</span>
                        <span className="text-[12px] font-bold text-primary-600 ml-2 shrink-0">{goal.progress}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-[#EEF1F0] rounded-full overflow-hidden">
                        <div className="h-full bg-primary-500 rounded-full transition-all duration-500" style={{ width: `${goal.progress}%` }} />
                      </div>
                      <p className="text-[11px] text-[#8A8F98] mt-1">{goal.doneCount}/{goal.taskCount} 项任务完成</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─── Right Column ─── */}
        <div className="flex flex-col gap-4">

          {/* Today's Schedule */}
          <TodayScheduleCard blocks={todaySchedule} />

          {/* Focus Timer */}
          <FocusTimer tasks={pendingTasks.slice(0, 10).map((t) => ({ id: t.id, title: t.title }))} />

          {/* Today's Habits */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[15px] font-bold text-gray-900">今日习惯</h3>
              <Link to="/habits" className="text-[12px] text-primary-600 font-semibold hover:text-primary-700">全部</Link>
            </div>
            {habitList.length === 0 ? (
              <p className="text-[13px] text-[#8A8F98] py-4 text-center">暂无习惯</p>
            ) : (
              <div className="space-y-1">
                {habitList.slice(0, 6).map((habit) => (
                  <Link
                    key={habit.id}
                    to={`/habits/${habit.id}`}
                    className={cn(
                      "flex items-center gap-3 px-2 py-2.5 rounded-xl transition-colors",
                      habit.completedToday ? "bg-primary-50/60" : "hover:bg-[#F8FAF9]"
                    )}
                  >
                    <div
                      className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                      style={habit.completedToday
                        ? { backgroundColor: habit.color || "#1A7A4A", borderColor: habit.color || "#1A7A4A" }
                        : { borderColor: "#D1D5DB" }}
                    >
                      {habit.completedToday && (
                        <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
                          <path d="M3 8l3.5 3.5L13 5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span className={cn(
                      "text-[13px] flex-1 truncate",
                      habit.completedToday ? "text-gray-400 line-through" : "text-gray-700 font-medium"
                    )}>
                      {habit.title}
                    </span>
                    {habit.streak > 0 && (
                      <span className="flex items-center gap-0.5 text-[11px] font-semibold text-orange-500 shrink-0">
                        <Flame size={11} />
                        {habit.streak}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Analytics snippet — only when data exists */}
          {analyticsLast && (
            <Link to="/analytics" className="card p-5 hover:shadow-card-hover transition-all group">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[15px] font-bold text-gray-900">自媒体数据</h3>
                <span className="text-[11px] text-[#8A8F98] bg-[#F4F6F5] px-2 py-0.5 rounded-full">
                  {analyticsData!.account?.platform}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="text-center p-2 rounded-xl bg-blue-50">
                  <p className="text-[18px] font-bold text-blue-600">{(analyticsLast.followers ?? 0).toLocaleString()}</p>
                  <p className="text-[10px] text-blue-400 mt-0.5">粉丝</p>
                </div>
                <div className="text-center p-2 rounded-xl bg-violet-50">
                  <p className="text-[18px] font-bold text-violet-600">{(analyticsLast.views ?? 0).toLocaleString()}</p>
                  <p className="text-[10px] text-violet-400 mt-0.5">播放</p>
                </div>
                <div className="text-center p-2 rounded-xl bg-red-50">
                  <p className="text-[18px] font-bold text-red-500">{(analyticsLast.likes ?? 0).toLocaleString()}</p>
                  <p className="text-[10px] text-red-400 mt-0.5">点赞</p>
                </div>
              </div>
              <p className="text-[11px] text-[#8A8F98] mt-2.5 text-right group-hover:text-primary-600 transition-colors">查看详情 →</p>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function QuickLinkSave() {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<{ title: string; image: string } | null>(null);
  const [parseError, setParseError] = useState("");
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Auto-parse when URL looks complete
  const tryParse = async (val: string) => {
    const trimmed = val.trim();
    if (!trimmed || !/^https?:\/\/.{4}/i.test(trimmed)) return;
    setParsing(true);
    setParseError("");
    setParsed(null);
    try {
      const res = await fetch("/api/fetch-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "解析失败");
      setParsed({ title: data.title, image: data.image });
    } catch (err: any) {
      setParseError(err.message || "无法解析");
    } finally {
      setParsing(false);
    }
  };

  const handleSave = () => {
    if (!url.trim() || !parsed) return;
    fetcher.submit(
      { intent: "quick-link", url: url.trim(), title: parsed.title, ogImage: parsed.image || "" },
      { method: "post", action: "/" }
    );
    setSaved(true);
    setTimeout(() => {
      setOpen(false);
      setUrl("");
      setParsed(null);
      setSaved(false);
    }, 1200);
  };

  const openPanel = () => {
    setOpen(true);
    setUrl("");
    setParsed(null);
    setParseError("");
    setSaved(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={openPanel}
        className="btn-outline-green text-[13px] flex items-center gap-1.5"
      >
        <Link2 size={13} />收藏链接
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-80 max-w-sm bg-white rounded-2xl shadow-[0_16px_48px_rgba(15,23,42,0.12)] border border-[#E8ECEA] p-4 z-50">
          <p className="text-[13px] font-semibold text-gray-800 mb-3">快速收藏链接</p>

          <div className="flex gap-2 mb-3">
            <input
              ref={inputRef}
              type="url"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setParsed(null); setParseError(""); }}
              onBlur={() => tryParse(url)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); tryParse(url); } }}
              placeholder="粘贴链接..."
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            {parsing && <Loader2 size={16} className="animate-spin text-[#8A8F98] self-center shrink-0" />}
          </div>

          {parseError && (
            <p className="text-[11px] text-red-500 mb-2">{parseError}</p>
          )}

          {parsed && (
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#F8FAF9] mb-3">
              {parsed.image && (
                <img src={parsed.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              )}
              <p className="text-[12px] font-medium text-gray-800 line-clamp-2 flex-1">{parsed.title}</p>
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={!parsed || saved}
            className={cn(
              "w-full py-2 rounded-xl text-[13px] font-semibold transition-all flex items-center justify-center gap-1.5",
              saved
                ? "bg-green-500 text-white"
                : parsed
                  ? "bg-primary-600 hover:bg-primary-700 text-white"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
            )}
          >
            {saved ? <><Check size={14} />已保存</> : "保存到笔记"}
          </button>
        </div>
      )}
    </div>
  );
}

function TodayScheduleCard({ blocks }: { blocks: any[] }) {
  const [currentTime, setCurrentTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentTime(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
    };
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const nowMin = toMin(currentTime);

  const activeBlock = blocks.find((b) => toMin(b.startTime) <= nowMin && nowMin < toMin(b.endTime));
  const upcomingBlocks = blocks.filter((b) => toMin(b.startTime) > nowMin).slice(0, 2);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[15px] font-bold text-gray-900 flex items-center gap-1.5">
          <CalendarClock size={15} className="text-primary-600" />
          今日日程
        </h3>
        <Link to="/schedule" className="text-[12px] text-primary-600 font-semibold hover:text-primary-700">查看全部</Link>
      </div>

      {blocks.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-[12px] text-[#8A8F98] mb-2">今天还没有日程安排</p>
          <Link to="/schedule" className="text-[12px] text-primary-600 hover:text-primary-700 font-medium">
            去规划今天 →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Active block */}
          {activeBlock && (
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl"
              style={{ backgroundColor: `${activeBlock.color}15`, borderLeft: `3px solid ${activeBlock.color}` }}>
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-gray-900 truncate">{activeBlock.title}</p>
                <p className="text-[10px] text-[#8A8F98]">{activeBlock.startTime}–{activeBlock.endTime}</p>
              </div>
              <span className="text-[9px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full shrink-0">进行中</span>
            </div>
          )}

          {/* Upcoming blocks */}
          {upcomingBlocks.map((b) => (
            <div key={b.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-[#F8FAF9] transition-colors">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-gray-700 truncate">{b.title}</p>
                <p className="text-[10px] text-[#8A8F98]">{b.startTime}–{b.endTime}</p>
              </div>
            </div>
          ))}

          {!activeBlock && upcomingBlocks.length === 0 && (
            <p className="text-[12px] text-[#8A8F98] text-center py-2">今日日程已全部完成 🎉</p>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub, href }: {
  icon: ReactNode; label: string; value: number; sub: string; href: string;
}) {
  return (
    <Link to={href} className="card p-5 flex flex-col justify-between min-h-[130px] hover:shadow-card-hover transition-all group">
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 rounded-[12px] bg-primary-50 flex items-center justify-center text-primary-600">
          {icon}
        </div>
        <div className="w-7 h-7 rounded-full border border-[#E8ECEA] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 9.5L9.5 2.5M9.5 2.5H4M9.5 2.5V8" stroke="#8A8F98" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
      </div>
      <div>
        <p className="text-[36px] font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-[13px] text-[#8A8F98] mt-1">{label}</p>
        <p className="text-[11px] text-[#B0B5BC] mt-0.5">{sub}</p>
      </div>
    </Link>
  );
}
