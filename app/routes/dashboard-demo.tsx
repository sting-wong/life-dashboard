import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData, useFetcher } from "@remix-run/react";
import { db } from "~/db/index.server";
import { scheduleBlocks, habits, habitLogs, tasks, goals, analyticsAccounts, analyticsMetrics } from "~/db/schema.server";
import { eq, and, isNull, ne } from "drizzle-orm";
import { getPriorityColor, getPriorityLabel, cn } from "~/lib/utils";
import { getCurrentBlock, getNextBlock, getVisibleBlocks } from "~/lib/schedule.server";
import { calcStreak } from "~/lib/habits.server";
import { CheckCircle2, Circle, Clock, CalendarClock, Timer, Flame } from "lucide-react";
import { useState, useEffect, useRef } from "react";

// ── Helpers ──────────────────────────────────────────────
function getLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Client-safe time parser — mirrors schedule.server.ts but usable in components
function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// ── Loader ───────────────────────────────────────────────
export async function loader({ request }: LoaderFunctionArgs) {
  const today = getLocalDateString(new Date());

  const blocks = db.select().from(scheduleBlocks)
    .where(eq(scheduleBlocks.date, today))
    .all();

  const allHabits = db.select().from(habits).all();
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

  // ── Week tasks ─────────────────────────────────────────
  const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

  // 本周日（周日 = 0，本周最后一天）
  const nowDate = new Date();
  const daysUntilSunday = nowDate.getDay() === 0 ? 0 : 7 - nowDate.getDay();
  const weekEnd = getLocalDateString(new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() + daysUntilSunday));

  const openTasks = db.select().from(tasks)
    .where(and(isNull(tasks.parentId), ne(tasks.status, "done")))
    .all()
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));

  const urgentTasks = openTasks.filter((t) => {
    const due = t.dueDate?.split("T")[0] ?? null;
    return due && due <= today;       // 逾期 + 今日
  });
  const weekTasks = openTasks.filter((t) => {
    const due = t.dueDate?.split("T")[0] ?? null;
    return due && due > today && due <= weekEnd;
  });
  const noDateTasks = openTasks.filter((t) => !t.dueDate);
  const weekTaskGroups = { urgentTasks, weekTasks, noDateTasks };

  // ── Goals progress ────────────────────────────────────
  const activeGoals = db.select().from(goals).where(eq(goals.status, "active")).all();
  const goalsWithProgress = activeGoals.map((goal) => {
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

  // ── Analytics summary ─────────────────────────────────
  const allAccounts = db.select().from(analyticsAccounts).all();
  const analyticsSummary = allAccounts.map((account) => {
    const latest = db.select().from(analyticsMetrics)
      .where(eq(analyticsMetrics.accountId, account.id))
      .orderBy(analyticsMetrics.date)
      .all()
      .at(-1) ?? null;
    return { id: account.id, platform: account.platform, accountName: account.accountName, latest };
  });

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const currentBlock = getCurrentBlock(blocks, nowMin);
  const nextBlock = getNextBlock(blocks, nowMin);
  const visibleBlocks = getVisibleBlocks(blocks, nowMin);
  const completedCount = blocks.filter((b) => b.completed).length;
  const totalCount = blocks.length;
  const remainingCount = blocks.filter((b) => !b.completed).length;

  return json({ today, blocks, currentBlock, nextBlock, visibleBlocks, completedCount, totalCount, remainingCount, nowMin, habitsWithStatus, weekTaskGroups, goalsWithProgress, analyticsSummary });
}

// ── Action ───────────────────────────────────────────────
export async function action({ request }: ActionFunctionArgs) {
  const fd = await request.formData();
  const intent = fd.get("intent") as string;
  const now = new Date().toISOString();

  if (intent === "focus-complete") {
    const blockId = fd.get("blockId") as string;
    db.update(scheduleBlocks)
      .set({ completed: true, updatedAt: now })
      .where(eq(scheduleBlocks.id, blockId))
      .run();
  }

  if (intent === "habit-toggle") {
    const habitId = fd.get("habitId") as string;
    const date = fd.get("date") as string;
    const existing = db.select().from(habitLogs)
      .where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.date, date)))
      .get();
    if (existing) {
      db.update(habitLogs)
        .set({ completed: !existing.completed })
        .where(eq(habitLogs.id, existing.id))
        .run();
    } else {
      const { v4: uuid } = await import("uuid");
      db.insert(habitLogs).values({ id: uuid(), habitId, date, completed: true }).run();
    }
  }

  if (intent === "task-toggle") {
    const taskId = fd.get("taskId") as string;
    const current = db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, taskId)).get();
    if (current) {
      db.update(tasks)
        .set({ status: current.status === "done" ? "todo" : "done", updatedAt: now })
        .where(eq(tasks.id, taskId))
        .run();
    }
  }

  return json({ ok: true });
}

// ── Block type label ─────────────────────────────────────
const BLOCK_TYPE_LABELS: Record<string, string> = {
  focus: "专注", break: "休息", meal: "用餐", free: "自由", routine: "日常",
};

// ── Focus timer (localStorage, client-only) ──────────────
function FocusTimer({ blockId }: { blockId: string }) {
  const STORAGE_KEY = `focus-timer-${blockId}`;
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0); // seconds
  const startRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Restore state from localStorage on mount
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

  // Tick
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

  // No blocks at all today
  if (totalCount === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#E8ECEA] p-5">
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

  // Active block
  if (currentBlock) {
    const isCompleting = fetcher.state !== "idle";
    const alreadyDone = currentBlock.completed;
    return (
      <div
        className="rounded-2xl p-5 text-white"
        style={{ backgroundColor: currentBlock.color }}
      >
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
                alreadyDone
                  ? "bg-white/20 text-white/50 cursor-default"
                  : "bg-white text-gray-800 hover:bg-white/90"
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

  // Gap between blocks — show next block
  if (nextBlock) {
    return (
      <div className="bg-white rounded-2xl border border-[#E8ECEA] p-5">
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
            <p className="text-[11px] text-gray-400 mt-0.5">
              {BLOCK_TYPE_LABELS[nextBlock.blockType] ?? nextBlock.blockType}
            </p>
          </div>
        </div>
        <Link to={`/schedule?date=${today}`} className="mt-4 inline-block text-[12px] text-primary-600 hover:text-primary-700">
          查看完整日程 →
        </Link>
      </div>
    );
  }

  // All blocks done for today (or today's time past last block)
  return (
    <div className="bg-white rounded-2xl border border-[#E8ECEA] p-5">
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
    <div className="mb-4 bg-white rounded-2xl border border-[#E8ECEA] px-4 py-2.5 flex items-center gap-3 flex-wrap">
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

// ── Goals Progress ───────────────────────────────────
function GoalsCard({
  goalsWithProgress,
}: {
  goalsWithProgress: Array<{
    id: string; title: string; taskCount: number; doneCount: number; progress: number;
  }>;
}) {
  if (goalsWithProgress.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#E8ECEA] p-5">
        <p className="text-[11px] font-bold text-[#8A8F98] uppercase tracking-wider mb-3">目标进度</p>
        <div className="text-center py-3">
          <p className="text-[13px] text-gray-400 mb-2">还没有进行中的目标</p>
          <Link to="/goals/new" className="text-[12px] text-primary-600 hover:text-primary-700 font-medium">
            新建目标 →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#E8ECEA] p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold text-[#8A8F98] uppercase tracking-wider">目标进度</p>
        <Link to="/goals" className="text-[11px] text-primary-600 hover:text-primary-700">全部 →</Link>
      </div>
      <div className="flex flex-col gap-3">
        {goalsWithProgress.map((goal) => (
          <Link key={goal.id} to={`/goals/${goal.id}`} className="group block">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[13px] font-medium text-gray-700 group-hover:text-primary-600 truncate flex-1 pr-2 transition-colors">
                {goal.title}
              </span>
              <span className="text-[11px] font-semibold text-gray-500 shrink-0">
                {goal.progress}%
              </span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 rounded-full transition-all"
                style={{ width: `${goal.progress}%` }}
              />
            </div>
            {goal.taskCount > 0 ? (
              <p className="text-[10px] text-gray-400 mt-0.5">
                {goal.doneCount} / {goal.taskCount} 个任务已完成
              </p>
            ) : (
              <p className="text-[10px] text-gray-400 mt-0.5">未关联任务</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Week Tasks ───────────────────────────────────────
type TaskItem = {
  id: string; title: string; priority: string; dueDate: string | null; status: string;
};

function TaskRow({ task }: { task: TaskItem }) {
  const fetcher = useFetcher();
  const optimisticDone =
    fetcher.state !== "idle" ? true : task.status === "done";

  return (
    <div className={cn("flex items-start gap-2.5 py-1.5", optimisticDone && "opacity-50")}>
      <fetcher.Form method="post" className="shrink-0 mt-0.5">
        <input type="hidden" name="intent" value="task-toggle" />
        <input type="hidden" name="taskId" value={task.id} />
        <button type="submit" className="p-1 -m-1 text-gray-300 hover:text-primary-500 transition-colors">
          {optimisticDone
            ? <CheckCircle2 size={15} className="text-primary-400" />
            : <Circle size={15} />}
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

function TaskGroup({ label, tasks, urgent }: { label: string; tasks: TaskItem[]; urgent?: boolean }) {
  if (tasks.length === 0) return null;
  const visible = tasks.slice(0, 3);
  const hidden = tasks.length - 3;
  return (
    <div className="mb-3 last:mb-0">
      <p className={cn(
        "text-[10px] font-bold uppercase tracking-wider mb-1",
        urgent ? "text-red-500" : "text-[#8A8F98]"
      )}>{label}</p>
      <div className="divide-y divide-gray-50">
        {visible.map((t) => <TaskRow key={t.id} task={t} />)}
      </div>
      {hidden > 0 && (
        <Link to="/tasks" className="text-[11px] text-gray-400 hover:text-primary-600 mt-1 inline-block">
          还有 {hidden} 个 →
        </Link>
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
    <div className="bg-white rounded-2xl border border-[#E8ECEA] p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold text-[#8A8F98] uppercase tracking-wider">本周任务</p>
        <Link to="/tasks" className="text-[11px] text-primary-600 hover:text-primary-700">
          全部 →
        </Link>
      </div>

      {total === 0 ? (
        <div className="text-center py-3">
          <p className="text-[13px] text-gray-400 mb-2">本周没有待办任务</p>
          <Link to="/tasks/new" className="text-[12px] text-primary-600 hover:text-primary-700 font-medium">
            新建任务 →
          </Link>
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

// ── Today's Habits ───────────────────────────────────
function HabitsCard({
  habitsWithStatus,
  today,
}: {
  habitsWithStatus: Array<{
    id: string; title: string; color: string | null;
    icon: string | null; completedToday: boolean; streak: number;
  }>;
  today: string;
}) {
  const fetcher = useFetcher();
  const pendingHabitId =
    fetcher.state !== "idle" ? (fetcher.formData?.get("habitId") as string | null) : null;

  const optimisticCompletedCount = habitsWithStatus.filter((h) =>
    pendingHabitId === h.id ? !h.completedToday : h.completedToday
  ).length;

  return (
    <div className="bg-white rounded-2xl border border-[#E8ECEA] p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold text-[#8A8F98] uppercase tracking-wider">今日习惯</p>
        <Link to="/habits" className="text-[11px] text-primary-600 hover:text-primary-700">
          管理 →
        </Link>
      </div>

      {habitsWithStatus.length === 0 ? (
        <div className="text-center py-3">
          <p className="text-[13px] text-gray-400 mb-2">还没有习惯</p>
          <Link
            to="/habits/new"
            className="text-[12px] text-primary-600 hover:text-primary-700 font-medium"
          >
            添加第一个习惯 →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {habitsWithStatus.map((habit) => {
            const dotColor = habit.color ?? "#1A7A4A";
            const optimisticDone =
              pendingHabitId === habit.id ? !habit.completedToday : habit.completedToday;

            return (
              <div
                key={habit.id}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all",
                  optimisticDone ? "bg-gray-50 opacity-80" : "bg-white"
                )}
              >
                {/* toggle button */}
                <fetcher.Form method="post" className="shrink-0">
                  <input type="hidden" name="intent" value="habit-toggle" />
                  <input type="hidden" name="habitId" value={habit.id} />
                  <input type="hidden" name="date" value={today} />
                  <button
                    type="submit"
                    className="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors"
                    style={{
                      borderColor: dotColor,
                      backgroundColor: optimisticDone ? dotColor : "transparent",
                    }}
                  >
                    {optimisticDone && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </fetcher.Form>

                {/* icon + title */}
                <span className="text-sm">{habit.icon ?? ""}</span>
                <span
                  className={cn(
                    "text-[13px] font-medium flex-1 truncate",
                    optimisticDone ? "line-through text-gray-400" : "text-gray-700"
                  )}
                >
                  {habit.title}
                </span>

                {/* streak */}
                {habit.streak > 0 && (
                  <span className="flex items-center gap-0.5 text-[11px] font-semibold text-amber-500 shrink-0">
                    <Flame size={11} />
                    {habit.streak}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* summary */}
      {habitsWithStatus.length > 0 && (
        <p className="text-[11px] text-gray-400 mt-3 text-right">
          {optimisticCompletedCount} / {habitsWithStatus.length} 已完成
        </p>
      )}
    </div>
  );
}

// ── Today's Rhythm ───────────────────────────────────
const BLOCK_TYPE_BG: Record<string, string> = {
  focus: "bg-primary-600",
  break: "bg-sky-400",
  meal: "bg-amber-400",
  free: "bg-violet-400",
  routine: "bg-gray-400",
};

function RhythmBar({
  visibleBlocks,
  nowMin,
  totalCount,
  today,
}: {
  visibleBlocks: any[];
  nowMin: number;
  totalCount: number;
  today: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#E8ECEA] p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold text-[#8A8F98] uppercase tracking-wider">今日节奏</p>
        <Link
          to={`/schedule?date=${today}`}
          className="text-[11px] text-primary-600 hover:text-primary-700"
        >
          查看完整 →
        </Link>
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
                  isNow
                    ? "bg-primary-50 border border-primary-200"
                    : isPast
                    ? "bg-amber-50"
                    : isDone
                    ? "opacity-50"
                    : "bg-gray-50"
                )}
              >
                {/* color dot */}
                <span
                  className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    isPast ? "bg-amber-400" : colorClass,
                    isNow && "ring-2 ring-primary-400 ring-offset-1"
                  )}
                />

                {/* time */}
                <span className="text-[11px] text-gray-400 w-[84px] shrink-0 font-mono">
                  {block.startTime}–{block.endTime}
                </span>

                {/* title */}
                <span
                  className={cn(
                    "text-[13px] font-medium flex-1 truncate",
                    isDone
                      ? "line-through text-gray-400"
                      : isNow
                      ? "text-primary-700 font-semibold"
                      : isPast
                      ? "text-amber-700"
                      : "text-gray-700"
                  )}
                >
                  {block.title}
                </span>

                {/* status badge */}
                {isDone && <CheckCircle2 size={13} className="text-primary-400 shrink-0" />}
                {isNow && (
                  <span className="text-[10px] font-bold text-primary-600 bg-primary-100 px-1.5 py-0.5 rounded-full shrink-0">
                    进行中
                  </span>
                )}
                {isPast && (
                  <span className="text-[10px] font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full shrink-0">
                    未完成
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Analytics Summary ────────────────────────────────
type AnalyticsAccount = {
  id: string; platform: string; accountName: string;
  latest: { followers?: number | null; views?: number | null; likes?: number | null } | null;
};

function AnalyticsCard({ analyticsSummary }: { analyticsSummary: AnalyticsAccount[] }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E8ECEA] p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold text-[#8A8F98] uppercase tracking-wider">数据摘要</p>
        <Link to="/analytics" className="text-[11px] text-primary-600 hover:text-primary-700">
          详情 →
        </Link>
      </div>

      {analyticsSummary.length === 0 ? (
        <div className="text-center py-3">
          <p className="text-[13px] text-gray-400 mb-2">还没有关联账户</p>
          <Link to="/analytics/accounts" className="text-[12px] text-primary-600 hover:text-primary-700 font-medium">
            添加账户 →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {analyticsSummary.map((acc) => (
            <div key={acc.id}>
              <p className="text-[11px] font-semibold text-gray-500 mb-1 truncate">
                {acc.platform} · {acc.accountName}
              </p>
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

// ── Placeholder card ─────────────────────────────────────
function PlaceholderCard({ title }: { title: string }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E8ECEA] p-4">
      <p className="text-[11px] font-bold text-[#8A8F98] uppercase tracking-wider mb-3">{title}</p>
      <div className="h-16 bg-gray-50 rounded-xl flex items-center justify-center">
        <span className="text-[12px] text-gray-300">即将接入数据</span>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────
export default function DashboardDemo() {
  const { today, currentBlock, nextBlock, visibleBlocks, remainingCount, totalCount, nowMin, habitsWithStatus, weekTaskGroups, goalsWithProgress, analyticsSummary } = useLoaderData<typeof loader>();

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">行动驾驶舱</h1>
          <p className="text-sm text-[#8A8F98] mt-0.5">
            Demo — 与旧首页 <Link to="/" className="text-primary-600 underline">/</Link> 对比
          </p>
        </div>
      </div>

      <StatusBar remainingCount={remainingCount} totalCount={totalCount} today={today} />

      <div className="flex flex-col md:flex-row md:items-start gap-4">
        {/* Left column */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <FocusCard
            currentBlock={currentBlock}
            nextBlock={nextBlock}
            today={today}
            remainingCount={remainingCount}
            totalCount={totalCount}
          />
          <div className="md:hidden">
            <HabitsCard habitsWithStatus={habitsWithStatus} today={today} />
          </div>
          <RhythmBar visibleBlocks={visibleBlocks} nowMin={nowMin} totalCount={totalCount} today={today} />
        </div>

        {/* Right column */}
        <div className="dashboard-demo-sidebar shrink-0 flex flex-col gap-4">
          <div className="hidden md:block">
            <HabitsCard habitsWithStatus={habitsWithStatus} today={today} />
          </div>
          <WeekTasksCard weekTaskGroups={weekTaskGroups} />
          <GoalsCard goalsWithProgress={goalsWithProgress} />
          <AnalyticsCard analyticsSummary={analyticsSummary} />
        </div>
      </div>
    </div>
  );
}
