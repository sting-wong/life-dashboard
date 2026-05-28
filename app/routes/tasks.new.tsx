import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { db } from "~/db/index.server";
import { tasks, goals } from "~/db/schema.server";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { ArrowLeft } from "lucide-react";

export async function loader({ request }: LoaderFunctionArgs) {
  const allGoals = db.select().from(goals).where(eq(goals.status, "active")).all();
  return json({ goals: allGoals });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const title = formData.get("title") as string;
  if (!title?.trim()) return json({ error: "标题不能为空" }, { status: 400 });

  const now = new Date().toISOString();
  db.insert(tasks).values({
    id: uuid(),
    title: title.trim(),
    description: (formData.get("description") as string) || "",
    status: ((formData.get("status") as string) || "todo") as "todo" | "in_progress" | "done",
    priority: ((formData.get("priority") as string) || "medium") as "low" | "medium" | "high" | "urgent",
    dueDate: (formData.get("dueDate") as string) || null,
    goalId: (formData.get("goalId") as string) || null,
    createdAt: now,
    updatedAt: now,
  }).run();

  return redirect("/tasks");
}

export default function NewTask() {
  const { goals: goalList } = useLoaderData<typeof loader>();

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <Link to="/tasks" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft size={16} />
        返回任务列表
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">新建任务</h1>

      <Form method="post" className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">标题 *</label>
          <input
            type="text"
            name="title"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="输入任务标题"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
          <textarea
            name="description"
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="输入任务描述（可选）"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
            <select
              name="status"
              defaultValue="todo"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="todo">待办</option>
              <option value="in_progress">进行中</option>
              <option value="done">已完成</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">优先级</label>
            <select
              name="priority"
              defaultValue="medium"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
              <option value="urgent">紧急</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">截止日期</label>
          <input
            type="date"
            name="dueDate"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">关联目标</label>
          <select
            name="goalId"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="">无</option>
            {goalList.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="px-6 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            创建任务
          </button>
          <a
            href="/tasks"
            className="px-6 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            取消
          </a>
        </div>
      </Form>
    </div>
  );
}
