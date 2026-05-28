import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData, useFetcher } from "@remix-run/react";
import { db } from "~/db/index.server";
import { tasks, goals } from "~/db/schema.server";
import { eq, asc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { ArrowLeft, Trash2, Plus, GripVertical, CheckCircle2, Circle } from "lucide-react";
import { getStatusLabel, getPriorityLabel, formatDate, cn } from "~/lib/utils";
import { useState, useRef } from "react";

export async function loader({ params }: LoaderFunctionArgs) {
  const task = db.select().from(tasks).where(eq(tasks.id, params.id!)).get();
  if (!task) throw new Response("Not Found", { status: 404 });

  const allGoals = db.select().from(goals).all();
  const relatedGoal = task.goalId ? db.select().from(goals).where(eq(goals.id, task.goalId)).get() : null;

  // Fetch subtasks ordered by sortOrder
  const subtasks = db
    .select()
    .from(tasks)
    .where(eq(tasks.parentId, params.id!))
    .orderBy(asc(tasks.sortOrder))
    .all();

  return json({ task, allGoals, relatedGoal, subtasks });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "update") {
    const title = formData.get("title") as string;
    if (!title?.trim()) return json({ error: "标题不能为空" }, { status: 400 });

    const now = new Date().toISOString();
    db.update(tasks)
      .set({
        title: title.trim(),
        description: formData.get("description") as string,
        status: formData.get("status") as "todo" | "in_progress" | "done",
        priority: formData.get("priority") as "low" | "medium" | "high" | "urgent",
        dueDate: (formData.get("dueDate") as string) || null,
        goalId: (formData.get("goalId") as string) || null,
        updatedAt: now,
      })
      .where(eq(tasks.id, params.id!))
      .run();
  }

  if (intent === "delete") {
    // Delete subtasks first
    db.delete(tasks).where(eq(tasks.parentId, params.id!)).run();
    db.delete(tasks).where(eq(tasks.id, params.id!)).run();
    return redirect("/tasks");
  }

  if (intent === "create-subtask") {
    const title = formData.get("subtaskTitle") as string;
    if (title?.trim()) {
      // Get current max sortOrder for subtasks
      const existing = db.select().from(tasks).where(eq(tasks.parentId, params.id!)).all();
      const maxOrder = existing.length > 0 ? Math.max(...existing.map((t) => t.sortOrder)) : -1;
      const now = new Date().toISOString();
      db.insert(tasks).values({
        id: uuid(),
        title: title.trim(),
        description: "",
        status: "todo",
        priority: "medium",
        parentId: params.id!,
        sortOrder: maxOrder + 1,
        createdAt: now,
        updatedAt: now,
      }).run();
    }
  }

  if (intent === "toggle-subtask") {
    const subtaskId = formData.get("subtaskId") as string;
    const subtask = db.select().from(tasks).where(eq(tasks.id, subtaskId)).get();
    if (subtask) {
      const newStatus = subtask.status === "done" ? "todo" : "done";
      db.update(tasks)
        .set({ status: newStatus, updatedAt: new Date().toISOString() })
        .where(eq(tasks.id, subtaskId))
        .run();
    }
  }

  if (intent === "delete-subtask") {
    const subtaskId = formData.get("subtaskId") as string;
    db.delete(tasks).where(eq(tasks.id, subtaskId)).run();
  }

  if (intent === "reorder-subtasks") {
    const orderedIds = JSON.parse(formData.get("orderedIds") as string) as string[];
    orderedIds.forEach((id, index) => {
      db.update(tasks).set({ sortOrder: index }).where(eq(tasks.id, id)).run();
    });
  }

  return redirect(`/tasks/${params.id}`);
}

function SubtaskList({ subtasks, parentId }: { subtasks: Array<{ id: string; title: string; status: string; sortOrder: number }>; parentId: string }) {
  const fetcher = useFetcher();
  const [items, setItems] = useState(subtasks);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // Sync with server data when subtasks prop changes
  const [prevSubtasks, setPrevSubtasks] = useState(subtasks);
  if (subtasks !== prevSubtasks) {
    setPrevSubtasks(subtasks);
    setItems(subtasks);
  }

  const handleDragStart = (index: number) => {
    dragItem.current = index;
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
    if (dragItem.current === null || dragItem.current === index) return;
    const newItems = [...items];
    const dragged = newItems.splice(dragItem.current, 1)[0];
    newItems.splice(index, 0, dragged);
    dragItem.current = index;
    setItems(newItems);
  };

  const handleDragEnd = () => {
    if (dragItem.current === null) return;
    dragItem.current = null;
    dragOverItem.current = null;
    // Persist new order
    fetcher.submit(
      { intent: "reorder-subtasks", orderedIds: JSON.stringify(items.map((t) => t.id)) },
      { method: "post", action: `/tasks/${parentId}` }
    );
  };

  return (
    <div className="space-y-1.5">
      {items.map((subtask, index) => (
        <div
          key={subtask.id}
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragEnter={() => handleDragEnter(index)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => e.preventDefault()}
          className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg border border-gray-100 group cursor-default"
        >
          <span className="text-gray-300 cursor-grab active:cursor-grabbing shrink-0">
            <GripVertical size={14} />
          </span>

          <fetcher.Form method="post" action={`/tasks/${parentId}`} className="shrink-0">
            <input type="hidden" name="intent" value="toggle-subtask" />
            <input type="hidden" name="subtaskId" value={subtask.id} />
            <button type="submit" className={cn(
              "transition-colors",
              subtask.status === "done" ? "text-green-500" : "text-gray-300 hover:text-primary-500"
            )}>
              {subtask.status === "done" ? <CheckCircle2 size={16} /> : <Circle size={16} />}
            </button>
          </fetcher.Form>

          <span className={cn(
            "flex-1 text-sm transition-all",
            subtask.status === "done" ? "text-gray-400 line-through" : "text-gray-700"
          )}>
            {subtask.title}
          </span>

          <fetcher.Form method="post" action={`/tasks/${parentId}`} className="opacity-0 group-hover:opacity-100 shrink-0">
            <input type="hidden" name="intent" value="delete-subtask" />
            <input type="hidden" name="subtaskId" value={subtask.id} />
            <button type="submit" className="p-1 text-gray-300 hover:text-red-500 transition-colors">
              <Trash2 size={12} />
            </button>
          </fetcher.Form>
        </div>
      ))}
    </div>
  );
}

export default function TaskDetail() {
  const { task, allGoals, relatedGoal, subtasks } = useLoaderData<typeof loader>();
  const [showSubtaskInput, setShowSubtaskInput] = useState(false);
  const doneCount = subtasks.filter((s) => s.status === "done").length;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <Link
        to="/tasks"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft size={16} />
        返回任务列表
      </Link>

      <Form method="post" className="space-y-4">
        <input type="hidden" name="intent" value="update" />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">标题 *</label>
          <input
            type="text"
            name="title"
            defaultValue={task.title}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
          <textarea
            name="description"
            rows={4}
            defaultValue={task.description || ""}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
            <select
              name="status"
              defaultValue={task.status}
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
              defaultValue={task.priority}
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
            defaultValue={task.dueDate ? task.dueDate.split("T")[0] : ""}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">关联目标</label>
          <select
            name="goalId"
            defaultValue={task.goalId || ""}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="">无</option>
            {allGoals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            className="px-6 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            保存
          </button>
        </div>
      </Form>

      <Form method="post" className="flex justify-end -mt-10">
        <input type="hidden" name="intent" value="delete" />
        <button
          type="submit"
          className="flex items-center gap-1 px-4 py-2 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
          onClick={(e) => !confirm("确定删除此任务？子任务也会一并删除。") && e.preventDefault()}
        >
          <Trash2 size={16} />
          删除
        </button>
      </Form>

      {/* Subtasks */}
      <div className="mt-8 pt-6 border-t border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-700">子任务</h3>
            {subtasks.length > 0 && (
              <span className="text-xs text-gray-400">{doneCount}/{subtasks.length}</span>
            )}
          </div>
          <button
            onClick={() => setShowSubtaskInput(!showSubtaskInput)}
            className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
          >
            <Plus size={13} />
            添加子任务
          </button>
        </div>

        {/* Progress bar for subtasks */}
        {subtasks.length > 0 && (
          <div className="mb-3">
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 rounded-full transition-all duration-300"
                style={{ width: `${subtasks.length > 0 ? Math.round((doneCount / subtasks.length) * 100) : 0}%` }}
              />
            </div>
          </div>
        )}

        {showSubtaskInput && (
          <Form method="post" className="mb-3 flex gap-2" onSubmit={() => setShowSubtaskInput(false)}>
            <input type="hidden" name="intent" value="create-subtask" />
            <input
              type="text"
              name="subtaskTitle"
              placeholder="子任务标题"
              autoFocus
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <button type="submit" className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700">
              添加
            </button>
            <button type="button" onClick={() => setShowSubtaskInput(false)} className="px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">
              取消
            </button>
          </Form>
        )}

        {subtasks.length === 0 && !showSubtaskInput ? (
          <p className="text-sm text-gray-400 text-center py-4">暂无子任务，点击"添加子任务"开始</p>
        ) : (
          <SubtaskList subtasks={subtasks} parentId={task.id} />
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-gray-100">
        <p className="text-sm text-gray-500">
          创建于 {formatDate(task.createdAt)}
          {task.createdAt !== task.updatedAt && ` · 更新于 ${formatDate(task.updatedAt)}`}
        </p>
        {relatedGoal && (
          <p className="text-sm text-gray-500 mt-1">
            关联目标：<Link to={`/goals/${relatedGoal.id}`} className="text-primary-600 hover:underline">{relatedGoal.title}</Link>
          </p>
        )}
      </div>
    </div>
  );
}
