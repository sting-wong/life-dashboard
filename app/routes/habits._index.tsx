import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { db } from "~/db/index.server";
import { habits, habitLogs } from "~/db/schema.server";
import { eq, desc, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { Plus, CheckSquare, Flame, Circle } from "lucide-react";
import { cn, getFrequencyLabel } from "~/lib/utils";

const HABIT_COLORS = [
  "#1A7A4A", "#2563EB", "#D97706", "#DC2626", "#7C3AED",
  "#0891B2", "#BE185D", "#4F46E5", "#65A30D", "#EA580C",
];

function getStreak(habitId: string, frequency: string): number {
  const logs = db
    .select({ date: habitLogs.date, completed: habitLogs.completed })
    .from(habitLogs)
    .where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.completed, true)))
    .orderBy(desc(habitLogs.date))
    .all();

  if (logs.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  let checkDate = new Date(today);

  // If today isn't completed yet, streak is based on yesterday
  const todayStr = today.toISOString().split("T")[0];
  const completedToday = logs.some((l) => l.date === todayStr);
  if (!completedToday) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  for (const log of logs) {
    const expectedStr = checkDate.toISOString().split("T")[0];
    if (log.date === expectedStr) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (log.date < expectedStr) {
      break;
    }
  }

  return streak;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const allHabits = db.select().from(habits).orderBy(desc(habits.createdAt)).all();
  const today = new Date().toISOString().split("T")[0];

  const habitsWithStatus = allHabits.map((habit) => {
    const todayLog = db
      .select()
      .from(habitLogs)
      .where(and(eq(habitLogs.habitId, habit.id), eq(habitLogs.date, today)))
      .get();

    return {
      ...habit,
      completedToday: !!todayLog?.completed,
      streak: getStreak(habit.id, habit.frequency),
    };
  });

  return json({ habits: habitsWithStatus });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "toggle") {
    const habitId = formData.get("habitId") as string;
    const today = new Date().toISOString().split("T")[0];

    const existing = db
      .select()
      .from(habitLogs)
      .where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.date, today)))
      .get();

    if (existing) {
      db.update(habitLogs)
        .set({ completed: !existing.completed })
        .where(eq(habitLogs.id, existing.id))
        .run();
    } else {
      db.insert(habitLogs).values({
        id: uuid(),
        habitId,
        date: today,
        completed: true,
      }).run();
    }

    return redirect("/habits");
  }

  if (intent === "delete") {
    const habitId = formData.get("habitId") as string;
    db.delete(habitLogs).where(eq(habitLogs.habitId, habitId)).run();
    db.delete(habits).where(eq(habits.id, habitId)).run();
    return redirect("/habits");
  }

  return redirect("/habits");
}

export default function HabitsList() {
  const { habits: habitList } = useLoaderData<typeof loader>();

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">习惯</h1>
        <Link
          to="/habits/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus size={16} />
          新建习惯
        </Link>
      </div>

      {habitList.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {habitList.map((habit) => (
            <HabitCard key={habit.id} habit={habit} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <CheckSquare size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400 mb-2">还没有习惯</p>
          <p className="text-sm text-gray-400">创建每日习惯，开始追踪你的进步</p>
        </div>
      )}
    </div>
  );
}

function HabitCard({ habit }: { habit: any }) {
  const color = habit.color || HABIT_COLORS[0];

  return (
    <div
      className={cn(
        "bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 group",
        habit.completedToday && "border-green-200 bg-green-50/50"
      )}
    >
      {/* Toggle button */}
      <Form method="post" className="shrink-0">
        <input type="hidden" name="intent" value="toggle" />
        <input type="hidden" name="habitId" value={habit.id} />
        <button
          type="submit"
          className={cn(
            "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors",
            habit.completedToday
              ? "bg-green-500 border-green-500 text-white"
              : "border-gray-300 hover:border-green-400 text-transparent hover:text-green-300"
          )}
          style={habit.completedToday ? { backgroundColor: color, borderColor: color } : {}}
        >
          {habit.completedToday ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8l3.5 3.5L13 5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <Circle size={16} className="text-gray-300 group-hover:text-green-400" />
          )}
        </button>
      </Form>

      {/* Content */}
      <Link to={`/habits/${habit.id}`} className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className={cn(
            "font-medium text-sm",
            habit.completedToday ? "text-gray-500 line-through" : "text-gray-900"
          )}>
            {habit.title}
          </h3>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: color + "18", color }}
          >
            {getFrequencyLabel(habit.frequency)}
          </span>
        </div>
        {habit.description && (
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{habit.description}</p>
        )}
      </Link>

      {/* Streak */}
      <div className="flex items-center gap-1 shrink-0">
        <Flame size={14} className={habit.streak > 0 ? "text-orange-500" : "text-gray-300"} />
        <span className={cn("text-sm font-semibold", habit.streak > 0 ? "text-orange-500" : "text-gray-400")}>
          {habit.streak}
        </span>
      </div>

      {/* Delete */}
      <Form method="post" className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <input type="hidden" name="intent" value="delete" />
        <input type="hidden" name="habitId" value={habit.id} />
        <button
          type="submit"
          className="text-xs text-gray-400 hover:text-red-500"
          onClick={(e) => !confirm("确定删除这个习惯？") && e.preventDefault()}
        >
          删除
        </button>
      </Form>
    </div>
  );
}
