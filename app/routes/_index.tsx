import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData, useFetcher } from "@remix-run/react";
import { db } from "~/db/index.server";
import { tasks, goals, notes, habits, habitLogs, analyticsAccounts, analyticsMetrics, scheduleBlocks } from "~/db/schema.server";
import { desc, eq, and, isNull, ne } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { cn, getPriorityColor, getPriorityLabel } from "~/lib/utils";
import {
  CheckCircle2, Circle, Clock, CalendarClock, Timer, Flame,
  Link2, Loader2, Check, Plus,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { getCurrentBlock, getNextBlock, getVisibleBlocks } from "~/lib/schedule.server";
import { calcStreak } from "~/lib/habits.server";

// ── Helpers ──────────────────────────────────────────────
function getLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const today = getLocalDateString(new Date());

  // ── Schedule blocks ───────────────────────────────────
  const blocks = db.select().from(scheduleBlocks)
    .where(eq(scheduleBlocks.date, today))
    .all();

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const currentBlock = getCurrentBlock(blocks, nowMin);
  const nextBlock = getNextBlock(blocks, nowMin);
  const visibleBlocks = getVisibleBlocks(blocks, nowMin);
  const completedCount = blocks.filter((b) => b.completed).length;
  const totalCount = blocks.length;
  const remainingCount = blocks.filter((b) => !b.completed).length;

  // ── Habits (new: habitsWithStatus; legacy: habits list) ──
  const allHabits = db.select().from(habits).orderBy(desc(habits.createdAt)).all();
  const todayLogs = db.select().from(habitLogs)
    .where(eq(habitLogs.date, today))
    .all();
  const allLogs = db.select({ date: habitLogs.date, habitId: habitLogs.habitId })
    .from(habitLogs)
    .where(eq(habitLogs.completed, true))
    .all();

  const habitsWithStatus = allHabits.map((habit) => {
    const todayLog = todayLogs.find((l) => l.habitId === habit.id);
    const logsForHabit = allLogs.filter((l) => l.habitId === habit.id);
    return {
      ...habit,
      completedToday: !!todayLog?.completed,
      streak: calcStreak(logsForHabit, today),
    };
  });

  // Legacy habits format for old UI
  const todayLogSet = new Set(todayLogs.filter((l) => l.completed).map((l) => l.habitId));
  const logsByHabit = new Map<string, string[]>();
  for (const log of allLogs) {
    if (!logsByHabit.has(log.habitId)) logsByHabit.set(log.habitId, []);
    logsByHabit.get(log.habitId)!.push(log.date);
  }
  const habitsLegacy = allHabits.map((h) => {
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

  // ── Week tasks (new groups) ───────────────────────────
  const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  const nowDate = new Date();
  const daysUntilSunday = nowDate.getDay() === 0 ? 0 : 7 - nowDate.getDay();
  const weekEnd = getLocalDateString(new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() + daysUntilSunday));

  const openTasks = db.select().from(tasks)
    .where(and(isNull(tasks.parentId), ne(tasks.status, "done")))
    .all()
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));

  const urgentTasks = openTasks.filter((t) => {
    const due = t.dueDate?.split("T")[0] ?? null;
    return due && due <= today;
  });
  const weekTasks = openTasks.filter((t) => {
    const due = t.dueDate?.split("T")[0] ?? null;
    return due && due > today && due <= weekEnd;
  });
  const noDateTasks = openTasks.filter((t) => !t.dueDate);
  const weekTaskGroups = { urgentTasks, weekTasks, noDateTasks };

  // ── Goals (new: goalsWithProgress; legacy: activeGoals + stats) ──
  const allTasks = db.select().from(tasks).all();
  const allGoals = db.select().from(goals).all();
  const allNotes = db.select().from(notes).all();
  const ms7d = Date.now() - 7 * 86400000;
  const nowStr = today;

  const activeGoalsLegacy = allGoals.filter((g) => g.status === "active").map((goal) => {
    const goalTasks = allTasks.filter((t) => t.goalId === goal.id);
    const doneCount = goalTasks.filter((t) => t.status === "done").length;
    return { ...goal, taskCount: goalTasks.length, doneCount, progress: goalTasks.length > 0 ? Math.round((doneCount / goalTasks.length) * 100) : 0 };
  });

  const goalMap = new Map(allGoals.map((g) => [g.id, g.title]));
  const priorityOrderLegacy: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  const pendingTasks = allTasks
    .filter((t) => t.status !== "done")
    .sort((a, b) => (priorityOrderLegacy[a.priority] ?? 2) - (priorityOrderLegacy[b.priority] ?? 2))
    .map((t) => ({
      ...t,
      goalTitle: t.goalId ? goalMap.get(t.goalId) : undefined,
      isOverdue: t.dueDate ? t.dueDate.split("T")[0] < nowStr : false,
    }));

  const todayTasksLegacy = allTasks.filter((t) => t.dueDate?.split("T")[0] === nowStr);
  const inProgressTasks = allTasks.filter((t) => t.status === "in_progress");
  const doneToday = allTasks.filter((t) => t.status === "done" && t.updatedAt?.split("T")[0] === nowStr);
  const weekDoneTotal = allTasks.filter((t) => {
    if (t.status !== "done" || !t.updatedAt) return false;
    return new Date(t.updatedAt).getTime() > Date.now() - 7 * 86400000;
  }).length;

  const notesThisWeek = allNotes.filter((n) => new Date(n.createdAt).getTime() > ms7d).length;
  const notesToday = allNotes.filter((n) => n.createdAt?.split("T")[0] === nowStr).length;
  const completedGoals = allGoals.filter((g) => g.status === "completed").length;
  const avgGoalProgress = activeGoalsLegacy.length > 0
    ? Math.round(activeGoalsLegacy.reduce((s, g) => s + g.progress, 0) / activeGoalsLegacy.length)
    : 0;

  const isNewUser = allTasks.length === 0 && allNotes.length === 0 && allHabits.length === 0 && blocks.length === 0;

  // ── Goals progress (new format) ───────────────────────
  const activeGoalsNew = db.select().from(goals).where(eq(goals.status, "active")).all();
  const goalsWithProgress = activeGoalsNew.map((goal) => {
    const goalTasks = db.select({ status: tasks.status }).from(tasks).where(eq(tasks.goalId, goal.id)).all();
    const doneCount = goalTasks.filter((t) => t.status === "done").length;
    return {
      id: goal.id,
      title: goal.title,
      taskCount: goalTasks.length,
      doneCount,
      progress: goalTasks.length > 0 ? Math.round((doneCount / goalTasks.length) * 100) : 0,
    };
  });

  // ── Analytics (new: summary; legacy: single account) ─
  const allAccounts = db.select().from(analyticsAccounts).all();
  const analyticsSummary = allAccounts.map((account) => {
    const latest = db.select().from(analyticsMetrics)
      .where(eq(analyticsMetrics.accountId, account.id))
      .orderBy(analyticsMetrics.date)
      .all()
      .at(-1) ?? null;
    return { id: account.id, platform: account.platform, accountName: account.accountName, latest };
  });

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
      .reverse();
    analyticsData = { account: defaultAccount, metrics: recentMetrics as { date: string; followers: number; views: number; likes: number }[] };
  }

  const todaySchedule = blocks.slice().sort((a, b) => a.startTime.localeCompare(b.startTime));

  return json({
    // ── New fields (for upcoming new UI) ──
    today,
    currentBlock,
    nextBlock,
    visibleBlocks,
    completedCount,
    totalCount,
    remainingCount,
    nowMin,
    habitsWithStatus,
    weekTaskGroups,
    goalsWithProgress,
    analyticsSummary,
    // ── Legacy fields (for existing UI — removed in Task 4) ──
    stats: { totalTasks: allTasks.length, todayTasks: todayTasksLegacy.length, inProgress: inProgressTasks.length, doneToday: doneToday.length, activeGoals: activeGoalsLegacy.length },
    pendingTasks,
    activeGoals: activeGoalsLegacy.slice(0, 4),
    habits: habitsLegacy,
    insights: { totalNotes: allNotes.length, notesThisWeek, notesToday, completedGoals, avgGoalProgress, weekDoneTotal },
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
  } else if (intent === "complete-task") {
    // Temporary: supports legacy TaskRow until Task 4 removes it
    const taskId = formData.get("taskId") as string;
    if (taskId) {
      db.update(tasks).set({ status: "done", updatedAt: new Date().toISOString() }).where(eq(tasks.id, taskId)).run();
    }
  } else if (intent === "focus-complete") {
    const blockId = formData.get("blockId") as string;
    if (blockId) {
      const now = new Date().toISOString();
      db.update(scheduleBlocks)
        .set({ completed: true, updatedAt: now })
        .where(eq(scheduleBlocks.id, blockId))
        .run();
    }
  } else if (intent === "habit-toggle") {
    const habitId = formData.get("habitId") as string;
    const date = formData.get("date") as string;
    if (habitId && date) {
      const existing = db.select().from(habitLogs)
        .where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.date, date)))
        .get();
      if (existing) {
        db.update(habitLogs)
          .set({ completed: !existing.completed })
          .where(eq(habitLogs.id, existing.id))
          .run();
      } else {
        const { v4: uuidv4 } = await import("uuid");
        db.insert(habitLogs).values({ id: uuidv4(), habitId, date, completed: true }).run();
      }
    }
  } else if (intent === "task-toggle") {
    const taskId = formData.get("taskId") as string;
    if (taskId) {
      const now = new Date().toISOString();
      const current = db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, taskId)).get();
      if (current) {
        db.update(tasks)
          .set({ status: current.status === "done" ? "todo" : "done", updatedAt: now })
          .where(eq(tasks.id, taskId))
          .run();
      }
    }
  }

  return redirect("/");
}

// ── Block type labels ────────────────────────────────────
const BLOCK_TYPE_LABELS: Record<string, string> = {
  focus: "专注", break: "休息", meal: "用餐", free: "自由", routine: "日常",
};

const BLOCK_TYPE_BG: Record<string, string> = {
  focus: "bg-primary-600", break: "bg-sky-400", meal: "bg-amber-400",
  free: "bg-violet-400", routine: "bg-gray-400",
};

// ── Focus timer (localStorage, client-only) ──────────────
function FocusTimer({ blockId }: { blockId: string }) {
  const STORAGE_KEY = `focus-timer-${blockId}`;
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.running && saved.startAt) {
        const elapsedNow = Math.floor((Date.now() - saved.startAt) / 1000);
        startRef.current = saved.startAt;
        setElapsed(elapsedNow);
        setRunning(true);
      } else {
        setElapsed(saved.elapsed ?? 0);
      }
    }
  }, [STORAGE_KEY]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - (startRef.current ?? Date.now())) / 1000));
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  const toggle = () => {
    if (!running) {
      const startAt = Date.now() - elapsed * 1000;
      startRef.current = startAt;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ running: true, startAt, elapsed }));
      setRunning(true);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ running: false, elapsed }));
      setRunning(false);
    }
  };

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setRunning(false);
    setElapsed(0);
    startRef.current = null;
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/20">
      <Timer size={13} className="text-white/60 shrink-0" />
      <span className="text-[13px] font-mono font-semibold text-white/90 w-12">{mm}:{ss}</span>
      <button
        onClick={toggle}
        className="px-3 py-1.5 text-[11px] font-semibold rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
      >
        {running ? "暂停" : elapsed > 0 ? "继续" : "专注"}
      </button>
      {elapsed > 0 && !running && (
        <button onClick={reset} className="px-2 py-1.5 text-[11px] text-white/50 hover:text-white/80 transition-colors">重置</button>
      )}
    </div>
  );
}

// ── Focus block card ─────────────────────────────────────
function FocusCard({
  currentBlock, nextBlock, today, remainingCount, totalCount,
}: {
  currentBlock: any; nextBlock: any; today: string;
  remainingCount: number; totalCount: number;
}) {
  const fetcher = useFetcher();

  if (totalCount === 0) {
    return (
      <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <p className="text-[11px] font-bold text-[#8A8F98] uppercase tracking-wider mb-3">当下焦点</p>
        <div className="text-center py-4">
          <CalendarClock size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-[13px] font-semibold text-gray-700 mb-1">今天还没有日程</p>
          <p className="text-[12px] text-gray-400 mb-4">生成今日计划，开始行动</p>
          <div className="flex gap-2 justify-center">
            <Form method="post" action="/schedule">
              <input type="hidden" name="intent" value="apply-template" />
              <input type="hidden" name="date" value={today} />
              <button type="submit" className="px-4 py-2 bg-primary-600 text-white text-[12px] font-semibold rounded-full hover:bg-primary-700 transition-colors">
                应用常用模板
              </button>
            </Form>
            <Link to={`/schedule?date=${today}`} className="px-4 py-2 border border-gray-200 text-gray-600 text-[12px] font-medium rounded-full hover:bg-gray-50 transition-colors">
              新建时间块
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (currentBlock) {
    const isCompleting = fetcher.state !== "idle";
    const alreadyDone = currentBlock.completed;
    return (
      <div className="rounded-2xl p-5 text-white" style={{ background: currentBlock.blockType === 'focus' ? 'linear-gradient(135deg, #1A7A4A 0%, #1f9457 100%)' : currentBlock.color }}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[11px] font-bold text-white/70 uppercase tracking-wider">当下焦点</p>
          <span className="flex items-center gap-1 text-[10px] font-semibold text-white bg-white/20 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse" />
            进行中
          </span>
        </div>
        <p className="text-[11px] text-white/60 mt-2">
          {currentBlock.startTime} – {currentBlock.endTime} · {BLOCK_TYPE_LABELS[currentBlock.blockType] ?? currentBlock.blockType}
        </p>
        <p className="text-[18px] font-bold text-white leading-tight mt-1">{currentBlock.title}</p>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="focus-complete" />
            <input type="hidden" name="blockId" value={currentBlock.id} />
            <button
              type="submit"
              disabled={alreadyDone || isCompleting}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-full transition-colors",
                alreadyDone ? "bg-white/20 text-white/50 cursor-default" : "bg-white text-gray-800 hover:bg-white/90"
              )}
            >
              {alreadyDone ? <CheckCircle2 size={13} /> : <Circle size={13} />}
              {alreadyDone ? "已完成" : "标记完成"}
            </button>
          </fetcher.Form>
        </div>
        <FocusTimer blockId={currentBlock.id} />
        {nextBlock && (
          <p className="text-[11px] text-white/50 mt-3">
            下一个 → {nextBlock.startTime} {nextBlock.title}
          </p>
        )}
      </div>
    );
  }

  if (nextBlock) {
    return (
      <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <p className="text-[11px] font-bold text-[#8A8F98] uppercase tracking-wider mb-3">当下焦点</p>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
            <Clock size={15} className="text-gray-400" />
          </div>
          <div>
            <p className="text-[12px] text-gray-400">当前无进行中时间块</p>
            <p className="text-[13px] font-semibold text-gray-800 mt-0.5">
              下一个：{nextBlock.startTime} {nextBlock.title}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">{BLOCK_TYPE_LABELS[nextBlock.blockType] ?? nextBlock.blockType}</p>
          </div>
        </div>
        <Link to={`/schedule?date=${today}`} className="mt-4 inline-block text-[12px] text-primary-600 hover:text-primary-700">
          查看完整日程 →
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <p className="text-[11px] font-bold text-[#8A8F98] uppercase tracking-wider mb-3">当下焦点</p>
      {remainingCount > 0 ? (
        <div className="flex items-center gap-3">
          <Clock size={22} className="text-amber-400 shrink-0" />
          <div>
            <p className="text-[13px] font-semibold text-gray-800">今日时间已结束</p>
            <p className="text-[12px] text-gray-400 mt-0.5">还有 {remainingCount} 个时间块未标记完成</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <CheckCircle2 size={22} className="text-primary-500 shrink-0" />
          <div>
            <p className="text-[13px] font-semibold text-gray-800">今日日程已全部完成 🎉</p>
            <p className="text-[12px] text-gray-400 mt-0.5">共 {totalCount} 个时间块</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Status bar ───────────────────────────────────────────
function StatusBar({ remainingCount, totalCount, today }: { remainingCount: number; totalCount: number; today: string }) {
  const dateLabel = new Date(today + "T12:00:00").toLocaleDateString("zh-CN", {
    month: "long", day: "numeric", weekday: "long",
  });
  return (
    <div className="mb-4 bg-white rounded-2xl px-4 py-2.5 flex items-center gap-3 flex-wrap" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <span className="text-[13px] font-semibold text-gray-700">{dateLabel}</span>
      <span className="text-[#E8ECEA]">·</span>
      {totalCount === 0 ? (
        <span className="text-[12px] text-gray-400">今天还没有时间块</span>
      ) : remainingCount === 0 ? (
        <span className="text-[12px] text-primary-600 font-medium">今日时间块全部完成</span>
      ) : (
        <span className="text-[12px] text-amber-600 font-medium">今日还剩 {remainingCount} 个时间块</span>
      )}
    </div>
  );
}

// ── Goals card ───────────────────────────────────────────
function GoalsCard({
  goalsWithProgress,
}: {
  goalsWithProgress: Array<{ id: string; title: string; taskCount: number; doneCount: number; progress: number }>;
}) {
  if (goalsWithProgress.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <p className="text-[11px] font-bold text-[#8A8F98] uppercase tracking-wider mb-3">目标进度</p>
        <div className="text-center py-3">
          <p className="text-[13px] text-gray-400 mb-2">还没有进行中的目标</p>
          <Link to="/goals/new" className="text-[12px] text-primary-600 hover:text-primary-700 font-medium">新建目标 →</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold text-[#8A8F98] uppercase tracking-wider">目标进度</p>
        <Link to="/goals" className="text-[11px] text-primary-600 hover:text-primary-700">全部 →</Link>
      </div>
      <div className="flex flex-col gap-3">
        {goalsWithProgress.map((goal) => (
          <Link key={goal.id} to={`/goals/${goal.id}`} className="group block">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[13px] font-medium text-gray-700 group-hover:text-primary-600 truncate flex-1 pr-2 transition-colors">{goal.title}</span>
              <span className="text-[11px] font-semibold text-gray-500 shrink-0">{goal.progress}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${goal.progress}%` }} />
            </div>
            {goal.taskCount > 0 ? (
              <p className="text-[10px] text-gray-400 mt-0.5">{goal.doneCount} / {goal.taskCount} 个任务已完成</p>
            ) : (
              <p className="text-[10px] text-gray-400 mt-0.5">未关联任务</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Week tasks ───────────────────────────────────────────
type TaskItem = {
  id: string; title: string; priority: string; dueDate: string | null; status: string;
};

function TaskRow({ task }: { task: TaskItem }) {
  const fetcher = useFetcher();
  const optimisticDone = fetcher.state !== "idle" ? true : task.status === "done";
  return (
    <div className={cn("flex items-start gap-2.5 py-1.5", optimisticDone && "opacity-50")}>
      <fetcher.Form method="post" className="shrink-0 mt-0.5">
        <input type="hidden" name="intent" value="task-toggle" />
        <input type="hidden" name="taskId" value={task.id} />
        <button type="submit" className="p-1 -m-1 text-gray-300 hover:text-primary-500 transition-colors">
          {optimisticDone ? <CheckCircle2 size={15} className="text-primary-400" /> : <Circle size={15} />}
        </button>
      </fetcher.Form>
      <div className="flex-1 min-w-0">
        <p className={cn("text-[13px] leading-snug truncate", optimisticDone ? "line-through text-gray-400" : "text-gray-700")}>
          {task.title}
        </p>
      </div>
      <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 mt-0.5", getPriorityColor(task.priority))}>
        {getPriorityLabel(task.priority)}
      </span>
    </div>
  );
}

function TaskGroup({ label, tasks: groupTasks, urgent }: { label: string; tasks: TaskItem[]; urgent?: boolean }) {
  if (groupTasks.length === 0) return null;
  const visible = groupTasks.slice(0, 3);
  const hidden = groupTasks.length - 3;
  return (
    <div className="mb-3 last:mb-0">
      <p className={cn("text-[10px] font-bold uppercase tracking-wider mb-1", urgent ? "text-red-500" : "text-[#8A8F98]")}>{label}</p>
      <div className="divide-y divide-gray-50">
        {visible.map((t) => <TaskRow key={t.id} task={t} />)}
      </div>
      {hidden > 0 && (
        <Link to="/tasks" className="text-[11px] text-gray-400 hover:text-primary-600 mt-1 inline-block">还有 {hidden} 个 →</Link>
      )}
    </div>
  );
}

function WeekTasksCard({
  weekTaskGroups,
}: {
  weekTaskGroups: { urgentTasks: TaskItem[]; weekTasks: TaskItem[]; noDateTasks: TaskItem[] };
}) {
  const total = weekTaskGroups.urgentTasks.length + weekTaskGroups.weekTasks.length + weekTaskGroups.noDateTasks.length;
  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold text-[#8A8F98] uppercase tracking-wider">本周任务</p>
        <Link to="/tasks" className="text-[11px] text-primary-600 hover:text-primary-700">全部 →</Link>
      </div>
      {total === 0 ? (
        <div className="text-center py-3">
          <p className="text-[13px] text-gray-400 mb-2">本周没有待办任务</p>
          <Link to="/tasks/new" className="text-[12px] text-primary-600 hover:text-primary-700 font-medium">新建任务 →</Link>
        </div>
      ) : (
        <>
          <TaskGroup label="逾期 / 今日" tasks={weekTaskGroups.urgentTasks} urgent />
          <TaskGroup label="本周其余" tasks={weekTaskGroups.weekTasks} />
          <TaskGroup label="无截止日期" tasks={weekTaskGroups.noDateTasks} />
        </>
      )}
    </div>
  );
}

// ── Habits card ──────────────────────────────────────────
function HabitsCard({
  habitsWithStatus, today,
}: {
  habitsWithStatus: Array<{ id: string; title: string; color: string | null; icon: string | null; completedToday: boolean; streak: number }>;
  today: string;
}) {
  const fetcher = useFetcher();
  const pendingHabitId = fetcher.state !== "idle" ? (fetcher.formData?.get("habitId") as string | null) : null;
  const optimisticCompletedCount = habitsWithStatus.filter((h) =>
    pendingHabitId === h.id ? !h.completedToday : h.completedToday
  ).length;

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold text-[#8A8F98] uppercase tracking-wider">今日习惯</p>
        <Link to="/habits" className="text-[11px] text-primary-600 hover:text-primary-700">管理 →</Link>
      </div>
      {habitsWithStatus.length === 0 ? (
        <div className="text-center py-3">
          <p className="text-[13px] text-gray-400 mb-2">还没有习惯</p>
          <Link to="/habits/new" className="text-[12px] text-primary-600 hover:text-primary-700 font-medium">添加第一个习惯 →</Link>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {habitsWithStatus.map((habit) => {
            const dotColor = habit.color ?? "#1A7A4A";
            const optimisticDone = pendingHabitId === habit.id ? !habit.completedToday : habit.completedToday;
            return (
              <div key={habit.id} className={cn("flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all", optimisticDone ? "bg-[#f5f4f0] opacity-80" : "bg-white")}>
                <fetcher.Form method="post" className="shrink-0">
                  <input type="hidden" name="intent" value="habit-toggle" />
                  <input type="hidden" name="habitId" value={habit.id} />
                  <input type="hidden" name="date" value={today} />
                  <button
                    type="submit"
                    className="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors"
                    style={{ borderColor: dotColor, backgroundColor: optimisticDone ? dotColor : "transparent" }}
                  >
                    {optimisticDone && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </fetcher.Form>
                <span className="text-sm">{habit.icon ?? ""}</span>
                <span className={cn("text-[13px] font-medium flex-1 truncate", optimisticDone ? "line-through text-gray-400" : "text-gray-700")}>
                  {habit.title}
                </span>
                {habit.streak > 0 && (
                  <span className="flex items-center gap-0.5 text-[11px] font-semibold text-amber-500 shrink-0">
                    <Flame size={11} />{habit.streak}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {habitsWithStatus.length > 0 && (
        <p className="text-[11px] text-gray-400 mt-3 text-right">{optimisticCompletedCount} / {habitsWithStatus.length} 已完成</p>
      )}
    </div>
  );
}

// ── Rhythm bar ───────────────────────────────────────────
function RhythmBar({ visibleBlocks, nowMin, totalCount, today }: {
  visibleBlocks: any[]; nowMin: number; totalCount: number; today: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold text-[#8A8F98] uppercase tracking-wider">今日节奏</p>
        <Link to={`/schedule?date=${today}`} className="text-[11px] text-primary-600 hover:text-primary-700">查看完整 →</Link>
      </div>
      {totalCount === 0 ? (
        <p className="text-[13px] text-gray-400 text-center py-3">今天还没有时间块</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {visibleBlocks.map((block) => {
            const s = timeToMin(block.startTime);
            const e = timeToMin(block.endTime);
            const isDone = block.completed;
            const isNow = !isDone && s <= nowMin && nowMin < e;
            const isPast = !isDone && e <= nowMin;
            const colorClass = BLOCK_TYPE_BG[block.blockType] ?? "bg-gray-400";
            return (
              <div
                key={block.id}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all",
                  isNow ? "bg-primary-50 border border-primary-200" : isPast ? "bg-amber-50" : isDone ? "opacity-50" : "bg-gray-50"
                )}
              >
                <span className={cn("w-2 h-2 rounded-full shrink-0", isPast ? "bg-amber-400" : colorClass, isNow && "ring-2 ring-primary-400 ring-offset-1")} />
                <span className="text-[11px] text-gray-400 w-[84px] shrink-0 font-mono">{block.startTime}–{block.endTime}</span>
                <span className={cn("text-[13px] font-medium flex-1 truncate", isDone ? "line-through text-gray-400" : isNow ? "text-primary-700 font-semibold" : isPast ? "text-amber-700" : "text-gray-700")}>
                  {block.title}
                </span>
                {isDone && <CheckCircle2 size={13} className="text-primary-400 shrink-0" />}
                {isNow && <span className="text-[10px] font-bold text-primary-600 bg-primary-100 px-1.5 py-0.5 rounded-full shrink-0">进行中</span>}
                {isPast && <span className="text-[10px] font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full shrink-0">未完成</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Analytics card ───────────────────────────────────────
type AnalyticsAccount = {
  id: string; platform: string; accountName: string;
  latest: { followers?: number | null; views?: number | null; likes?: number | null } | null;
};

function AnalyticsCard({ analyticsSummary }: { analyticsSummary: AnalyticsAccount[] }) {
  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold text-[#8A8F98] uppercase tracking-wider">数据摘要</p>
        <Link to="/analytics" className="text-[11px] text-primary-600 hover:text-primary-700">详情 →</Link>
      </div>
      {analyticsSummary.length === 0 ? (
        <div className="text-center py-3">
          <p className="text-[13px] text-gray-400 mb-2">还没有关联账户</p>
          <Link to="/analytics/accounts" className="text-[12px] text-primary-600 hover:text-primary-700 font-medium">添加账户 →</Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {analyticsSummary.map((acc) => (
            <div key={acc.id}>
              <p className="text-[11px] font-semibold text-gray-500 mb-1 truncate">{acc.platform} · {acc.accountName}</p>
              {acc.latest ? (
                <div className="flex gap-3">
                  {acc.latest.followers != null && (
                    <span className="text-[12px] text-gray-700">
                      <span className="font-semibold">{acc.latest.followers.toLocaleString()}</span>
                      <span className="text-gray-400 ml-0.5">粉</span>
                    </span>
                  )}
                  {acc.latest.views != null && (
                    <span className="text-[12px] text-gray-700">
                      <span className="font-semibold">{acc.latest.views.toLocaleString()}</span>
                      <span className="text-gray-400 ml-0.5">播</span>
                    </span>
                  )}
                  {acc.latest.likes != null && (
                    <span className="text-[12px] text-gray-700">
                      <span className="font-semibold">{acc.latest.likes.toLocaleString()}</span>
                      <span className="text-gray-400 ml-0.5">赞</span>
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-gray-400">暂无数据</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Quick link save ──────────────────────────────────────
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

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const tryParse = async (val: string) => {
    const trimmed = val.trim();
    if (!trimmed || !/^https?:\/\/.{4}/i.test(trimmed)) return;
    setParsing(true);
    setParseError("");
    setParsed(null);
    try {
      const res = await fetch("/api/fetch-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: trimmed }) });
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
    fetcher.submit({ intent: "quick-link", url: url.trim(), title: parsed.title, ogImage: parsed.image || "" }, { method: "post", action: "/" });
    setSaved(true);
    setTimeout(() => { setOpen(false); setUrl(""); setParsed(null); setSaved(false); }, 1200);
  };

  const openPanel = () => {
    setOpen(true); setUrl(""); setParsed(null); setParseError(""); setSaved(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button type="button" onClick={openPanel} className="btn-outline-green text-[13px] flex items-center gap-1.5">
        <Link2 size={13} />收藏链接
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-80 max-w-sm bg-white rounded-2xl shadow-[0_16px_48px_rgba(15,23,42,0.12)] border border-[#E8ECEA] p-4 z-50">
          <p className="text-[13px] font-semibold text-gray-800 mb-3">快速收藏链接</p>
          <div className="flex gap-2 mb-3">
            <input
              ref={inputRef} type="url" value={url}
              onChange={(e) => { setUrl(e.target.value); setParsed(null); setParseError(""); }}
              onBlur={() => tryParse(url)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); tryParse(url); } }}
              placeholder="粘贴链接..."
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            {parsing && <Loader2 size={16} className="animate-spin text-[#8A8F98] self-center shrink-0" />}
          </div>
          {parseError && <p className="text-[11px] text-red-500 mb-2">{parseError}</p>}
          {parsed && (
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#F8FAF9] mb-3">
              {parsed.image && <img src={parsed.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
              <p className="text-[12px] font-medium text-gray-800 line-clamp-2 flex-1">{parsed.title}</p>
            </div>
          )}
          <button
            type="button" onClick={handleSave} disabled={!parsed || saved}
            className={cn("w-full py-2 rounded-xl text-[13px] font-semibold transition-all flex items-center justify-center gap-1.5",
              saved ? "bg-green-500 text-white" : parsed ? "bg-primary-600 hover:bg-primary-700 text-white" : "bg-gray-100 text-gray-400 cursor-not-allowed"
            )}
          >
            {saved ? <><Check size={14} />已保存</> : "保存到笔记"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Quick actions bar ────────────────────────────────────
function QuickActionsBar() {
  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      <Link to="/tasks/new" className="btn-primary flex items-center gap-1.5 text-[13px]">
        <Plus size={14} />新建任务
      </Link>
      <QuickLinkSave />
      <Link to="/notes/new" className="btn-outline flex items-center gap-1.5 text-[13px]">
        快速记录
      </Link>
      <Link to="/api-keys" className="btn-outline flex items-center gap-1.5 text-[13px]">
        密钥账号
      </Link>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────
export default function Dashboard() {
  const { today, currentBlock, nextBlock, visibleBlocks, remainingCount, totalCount, nowMin, habitsWithStatus, weekTaskGroups, goalsWithProgress, analyticsSummary } = useLoaderData<typeof loader>();

  return (
    <div className="p-5 md:p-8 max-w-5xl mx-auto">
      <StatusBar remainingCount={remainingCount} totalCount={totalCount} today={today} />

      {/* Quick actions — desktop only at top */}
      <div className="hidden md:block mb-5">
        <QuickActionsBar />
      </div>

      <div className="flex flex-col md:flex-row md:items-start gap-4">
        {/* Left column */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <FocusCard currentBlock={currentBlock} nextBlock={nextBlock} today={today} remainingCount={remainingCount} totalCount={totalCount} />

          {/* Mobile: quick actions after FocusCard */}
          <div className="md:hidden">
            <QuickActionsBar />
          </div>

          {/* Mobile: habits before RhythmBar */}
          <div className="md:hidden">
            <HabitsCard habitsWithStatus={habitsWithStatus} today={today} />
          </div>

          <RhythmBar visibleBlocks={visibleBlocks} nowMin={nowMin} totalCount={totalCount} today={today} />

          {/* Mobile: remaining right-column cards below RhythmBar */}
          <div className="md:hidden flex flex-col gap-4">
            <WeekTasksCard weekTaskGroups={weekTaskGroups} />
            <GoalsCard goalsWithProgress={goalsWithProgress} />
            <AnalyticsCard analyticsSummary={analyticsSummary} />
          </div>
        </div>

        {/* Right column — desktop only */}
        <div className="homepage-sidebar shrink-0 hidden md:flex flex-col gap-4">
          <HabitsCard habitsWithStatus={habitsWithStatus} today={today} />
          <WeekTasksCard weekTaskGroups={weekTaskGroups} />
          <GoalsCard goalsWithProgress={goalsWithProgress} />
          <AnalyticsCard analyticsSummary={analyticsSummary} />
        </div>
      </div>
    </div>
  );
}
