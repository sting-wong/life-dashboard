import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { db } from "~/db/index.server";
import { goals, tasks } from "~/db/schema.server";
import { eq, desc, and } from "drizzle-orm";
import { ArrowLeft, Trash2, Plus } from "lucide-react";
import { formatDate, getStatusColor, getStatusLabel, getPriorityLabel, cn } from "~/lib/utils";

export async function loader({ params }: LoaderFunctionArgs) {
  const goal = db.select().from(goals).where(eq(goals.id, params.id!)).get();
  if (!goal) throw new Response("Not Found", { status: 404 });

  const relatedTasks = db
    .select()
    .from(tasks)
    .where(eq(tasks.goalId, params.id!))
    .orderBy(desc(tasks.createdAt))
    .all();

  const doneCount = relatedTasks.filter((t) => t.status === "done").length;
  const progress = relatedTasks.length > 0 ? Math.round((doneCount / relatedTasks.length) * 100) : 0;

  return json({ goal, tasks: relatedTasks, doneCount, progress });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "update") {
    const title = formData.get("title") as string;
    if (!title?.trim()) return json({ error: "标题不能为空" }, { status: 400 });

    db.update(goals)
      .set({
        title: title.trim(),
        description: formData.get("description") as string || "",
        status: ((formData.get("status") as string) || "active") as "active" | "completed" | "cancelled",
        startDate: (formData.get("startDate") as string) || null,
        endDate: (formData.get("endDate") as string) || null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(goals.id, params.id!))
      .run();
  }

  if (intent === "delete") {
    // Unlink all tasks from this goal
    db.update(tasks).set({ goalId: null }).where(eq(tasks.goalId, params.id!)).run();
    db.delete(goals).where(eq(goals.id, params.id!)).run();
    return redirect("/goals");
  }

  return redirect(`/goals/${params.id}`);
}

export default function GoalDetail() {
  const { goal, tasks: relatedTasks, doneCount, progress } = useLoaderData<typeof loader>();

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <Link to="/goals" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft size={16} />
        返回目标列表
      </Link>

      <Form method="post" className="space-y-4">
        <input type="hidden" name="intent" value="update" />

        <div>
          <input
            type="text"
            name="title"
            defaultValue={goal.title}
            required
            className="w-full text-2xl font-bold text-gray-900 border-none px-0 focus:outline-none focus:ring-0"
          />
        </div>

        <div>
          <textarea
            name="description"
            rows={2}
            defaultValue={goal.description || ""}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="目标描述（可选）"
          />
        </div>

        <div className="flex items-center gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">状态</label>
            <select
              name="status"
              defaultValue={goal.status}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="active">进行中</option>
              <option value="completed">已完成</option>
              <option value="cancelled">已取消</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">开始日期</label>
            <input
              type="date"
              name="startDate"
              defaultValue={goal.startDate ? goal.startDate.split("T")[0] : ""}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">截止日期</label>
            <input
              type="date"
              name="endDate"
              defaultValue={goal.endDate ? goal.endDate.split("T")[0] : ""}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">总体进度</span>
            <span className="text-sm font-medium text-primary-600">{progress}%</span>
          </div>
          <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                goal.status === "completed" ? "bg-green-500" :
                goal.status === "cancelled" ? "bg-gray-400" : "bg-primary-500"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            已完成 {doneCount}/{relatedTasks.length} 个任务
          </p>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            className="px-6 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700"
          >
            保存
          </button>
        </div>
      </Form>

      <Form method="post" className="flex justify-end -mt-10">
        <input type="hidden" name="intent" value="delete" />
        <button
          type="submit"
          className="flex items-center gap-1 px-4 py-2 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50"
          onClick={(e) => !confirm("确定删除此目标？关联的任务不会被删除。") && e.preventDefault()}
        >
          <Trash2 size={16} />
          删除
        </button>
      </Form>

      {/* Related tasks */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">关联任务</h2>
          <Link
            to={`/tasks/new`}
            className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
          >
            <Plus size={14} />
            新建任务
          </Link>
        </div>

        {relatedTasks.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-8 text-center">
            <p className="text-sm text-gray-400">还没有关联任务</p>
          </div>
        ) : (
          <div className="space-y-2">
            {relatedTasks.map((task) => (
              <Link
                key={task.id}
                to={`/tasks/${task.id}`}
                className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:shadow-sm transition-shadow"
              >
                <span className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  task.priority === "urgent" ? "bg-red-500" :
                  task.priority === "high" ? "bg-orange-500" :
                  task.priority === "medium" ? "bg-blue-500" : "bg-gray-400"
                )} />
                <span className={cn(
                  "flex-1 text-sm",
                  task.status === "done" ? "text-gray-400 line-through" : "text-gray-900"
                )}>
                  {task.title}
                </span>
                <span className={cn("text-xs px-2 py-0.5 rounded-full", getStatusColor(task.status))}>
                  {getStatusLabel(task.status)}
                </span>
                {task.dueDate && (
                  <span className="text-xs text-gray-400">{formatDate(task.dueDate)}</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          创建于 {formatDate(goal.createdAt)} · 更新于 {formatDate(goal.updatedAt)}
        </p>
      </div>
    </div>
  );
}
