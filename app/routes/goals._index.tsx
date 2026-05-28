import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { db } from "~/db/index.server";
import { goals, tasks } from "~/db/schema.server";
import { eq, desc, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { formatDate, getStatusColor, getStatusLabel, cn } from "~/lib/utils";
import { Plus, Target, ArrowRight } from "lucide-react";

export async function loader({ request }: LoaderFunctionArgs) {
  const allGoals = db.select().from(goals).orderBy(desc(goals.createdAt)).all();

  // Get task counts for each goal
  const goalsWithProgress = allGoals.map((goal) => {
    const goalTasks = db.select().from(tasks).where(eq(tasks.goalId, goal.id)).all();
    const doneCount = goalTasks.filter((t) => t.status === "done").length;
    return {
      ...goal,
      taskCount: goalTasks.length,
      doneCount,
      progress: goalTasks.length > 0 ? Math.round((doneCount / goalTasks.length) * 100) : 0,
    };
  });

  return json({ goals: goalsWithProgress });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create") {
    const title = formData.get("title") as string;
    if (!title?.trim()) return json({ error: "标题不能为空" }, { status: 400 });

    const now = new Date().toISOString();
    db.insert(goals).values({
      id: uuid(),
      title: title.trim(),
      description: formData.get("description") as string || "",
      status: "active",
      startDate: (formData.get("startDate") as string) || null,
      endDate: (formData.get("endDate") as string) || null,
      createdAt: now,
      updatedAt: now,
    }).run();
  }

  return redirect("/goals");
}

export default function GoalsList() {
  const { goals: goalList } = useLoaderData<typeof loader>();

  const activeGoals = goalList.filter((g) => g.status === "active");
  const completedGoals = goalList.filter((g) => g.status === "completed");
  const cancelledGoals = goalList.filter((g) => g.status === "cancelled");

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">目标</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/goals/new"
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus size={16} />
            新建目标
          </Link>
        </div>
      </div>

      {/* Quick create form */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-3">快速创建目标</h3>
        <Form method="post" className="flex gap-2">
          <input type="hidden" name="intent" value="create" />
          <input
            type="text"
            name="title"
            placeholder="输入目标名称..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700"
          >
            创建
          </button>
        </Form>
      </div>

      {/* Active goals */}
      {activeGoals.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">进行中</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeGoals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} />
            ))}
          </div>
        </div>
      )}

      {/* Completed goals */}
      {completedGoals.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">已完成</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {completedGoals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} />
            ))}
          </div>
        </div>
      )}

      {goalList.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Target size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400 mb-2">还没有目标</p>
          <p className="text-sm text-gray-400">创建目标来跟踪你的长期进展</p>
        </div>
      )}
    </div>
  );
}

function GoalCard({ goal }: { goal: any }) {
  return (
    <Link
      to={`/goals/${goal.id}`}
      className="block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className={cn(
          "font-semibold",
          goal.status === "completed" ? "text-gray-400 line-through" : "text-gray-900"
        )}>
          {goal.title}
        </h3>
        <span className={cn(
          "text-xs px-2 py-0.5 rounded-full",
          goal.status === "active" ? "bg-blue-50 text-blue-600" :
          goal.status === "completed" ? "bg-green-50 text-green-600" : "bg-gray-50 text-gray-500"
        )}>
          {goal.status === "active" ? "进行中" : goal.status === "completed" ? "已完成" : "已取消"}
        </span>
      </div>

      {goal.description && (
        <p className="text-sm text-gray-500 mb-3 line-clamp-2">{goal.description}</p>
      )}

      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400">
          任务进度: {goal.doneCount}/{goal.taskCount}
        </span>
        <span className="text-xs font-medium text-primary-600">{goal.progress}%</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            goal.status === "completed" ? "bg-green-500" : "bg-primary-500"
          )}
          style={{ width: `${goal.progress}%` }}
        />
      </div>

      {goal.endDate && (
        <p className="text-xs text-gray-400 mt-2">截止: {formatDate(goal.endDate)}</p>
      )}
    </Link>
  );
}
