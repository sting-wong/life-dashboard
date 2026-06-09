import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData, useFetcher } from "@remix-run/react";
import { db } from "~/db/index.server";
import { tasks } from "~/db/schema.server";
import { eq, asc, isNull } from "drizzle-orm";
import {
  getStatusColor, getStatusLabel, getPriorityColor, getPriorityLabel,
  formatDateShort, cn
} from "~/lib/utils";
import { Plus, Search, Trash2, Edit3, CheckCircle2, Circle, GripVertical } from "lucide-react";
import { useState, useRef } from "react";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") || "all";
  const priorityFilter = url.searchParams.get("priority") || "all";
  const searchQuery = url.searchParams.get("q") || "";

  // Only top-level tasks (no parent), ordered by sortOrder then createdAt
  const allTopLevel = db
    .select()
    .from(tasks)
    .where(isNull(tasks.parentId))
    .orderBy(asc(tasks.sortOrder))
    .all();

  let filtered = allTopLevel;
  if (statusFilter !== "all") {
    filtered = filtered.filter((t) => t.status === statusFilter);
  }
  if (priorityFilter !== "all") {
    filtered = filtered.filter((t) => t.priority === priorityFilter);
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter((t) =>
      t.title.toLowerCase().includes(q) ||
      (t.description && t.description.toLowerCase().includes(q))
    );
  }

  // Batch count subtasks per parent — fetch all tasks with a parentId
  const allSubtasks = db
    .select({ parentId: tasks.parentId, status: tasks.status })
    .from(tasks)
    .all()
    .filter((t) => t.parentId !== null);

  // Build subtask count map
  const subtaskCountMap: Record<string, { total: number; done: number }> = {};
  for (const t of allSubtasks) {
    if (!t.parentId) continue;
    if (!subtaskCountMap[t.parentId]) subtaskCountMap[t.parentId] = { total: 0, done: 0 };
    subtaskCountMap[t.parentId].total++;
    if (t.status === "done") subtaskCountMap[t.parentId].done++;
  }

  return json({ tasks: filtered, statusFilter, priorityFilter, searchQuery, subtaskCountMap });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const taskId = formData.get("taskId") as string;

  if (intent === "toggle-status") {
    const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
    if (!task) return json({ error: "Task not found" }, { status: 404 });
    const newStatus = task.status === "done" ? "todo" : "done";
    db.update(tasks)
      .set({ status: newStatus, updatedAt: new Date().toISOString() })
      .where(eq(tasks.id, taskId))
      .run();
  }

  if (intent === "delete") {
    // Delete subtasks first
    db.delete(tasks).where(eq(tasks.parentId, taskId)).run();
    db.delete(tasks).where(eq(tasks.id, taskId)).run();
  }

  if (intent === "reorder") {
    const orderedIds = JSON.parse(formData.get("orderedIds") as string) as string[];
    orderedIds.forEach((id, index) => {
      db.update(tasks).set({ sortOrder: index }).where(eq(tasks.id, id)).run();
    });
    return json({ ok: true });
  }

  return redirect(`/tasks${new URL(request.url).search}`);
}

export default function TaskList() {
  const { tasks: taskList, statusFilter, priorityFilter, searchQuery, subtaskCountMap } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [items, setItems] = useState(taskList);
  const dragItem = useRef<number | null>(null);

  // Sync items when loader data changes
  const [prevTaskList, setPrevTaskList] = useState(taskList);
  if (taskList !== prevTaskList) {
    setPrevTaskList(taskList);
    setItems(taskList);
  }

  const handleDragStart = (index: number) => {
    dragItem.current = index;
  };

  const handleDragEnter = (index: number) => {
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
    fetcher.submit(
      { intent: "reorder", orderedIds: JSON.stringify(items.map((t) => t.id)) },
      { method: "post" }
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">任务</h1>
        <Link
          to="/tasks/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus size={16} />
          新建任务
        </Link>
      </div>

      {/* Filters — only when there are tasks */}
      {taskList.length > 0 && <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Form method="get" className="flex gap-2 items-center">
              <input
                type="text"
                name="q"
                defaultValue={searchQuery}
                placeholder="搜索任务..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <input type="hidden" name="status" value={statusFilter} />
              <input type="hidden" name="priority" value={priorityFilter} />
              <button type="submit" className="px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200">
                搜索
              </button>
            </Form>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {["all", "todo", "in_progress", "done"].map((s) => (
              <Link
                key={s}
                to={`/tasks?status=${s}&priority=${priorityFilter}&q=${searchQuery}`}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-lg border transition-colors",
                  statusFilter === s
                    ? "bg-primary-50 text-primary-700 border-primary-200"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                )}
              >
                {{ all: "全部", todo: "待办", in_progress: "进行中", done: "已完成" }[s]}
              </Link>
            ))}
          </div>
        </div>
      </div>}

      {/* Task List */}
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 size={22} className="text-primary-400" />
            </div>
            <p className="text-[14px] font-semibold text-gray-700 mb-1">还没有任务</p>
            <p className="text-[12px] text-gray-500 mb-4">创建任务后，你可以设置优先级、截止日期和子任务</p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              {[
                { title: "规划今天的工作", priority: "high" },
                { title: "完成一件重要的事", priority: "urgent" },
                { title: "复盘昨天的进展", priority: "medium" },
              ].map((t) => (
                <Link key={t.title} to={`/tasks/new?title=${encodeURIComponent(t.title)}&priority=${t.priority}`}
                  className="px-3 py-2 border border-dashed border-gray-200 rounded-xl text-[12px] text-gray-500 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 transition-colors">
                  + {t.title}
                </Link>
              ))}
            </div>
          </div>
        ) : (
          items.map((task, index) => {
            const sub = subtaskCountMap[task.id];
            return (
              <div
                key={task.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragEnter={() => handleDragEnter(index)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow group"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-gray-200 group-hover:text-gray-400 cursor-grab active:cursor-grabbing shrink-0 transition-colors">
                    <GripVertical size={16} />
                  </span>

                  <Form method="post" className="mt-0.5 shrink-0">
                    <input type="hidden" name="intent" value="toggle-status" />
                    <input type="hidden" name="taskId" value={task.id} />
                    <button type="submit" className={cn(
                      "transition-colors",
                      task.status === "done" ? "text-green-500" : "text-gray-300 hover:text-primary-500"
                    )}>
                      {task.status === "done" ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                    </button>
                  </Form>

                  <Link to={`/tasks/${task.id}`} className="flex-1 min-w-0">
                    <h3 className={cn(
                      "text-sm font-medium",
                      task.status === "done" ? "text-gray-400 line-through" : "text-gray-900"
                    )}>
                      {task.title}
                    </h3>
                    {task.description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-1">{task.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full border", getPriorityColor(task.priority))}>
                        {getPriorityLabel(task.priority)}
                      </span>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full", getStatusColor(task.status))}>
                        {getStatusLabel(task.status)}
                      </span>
                      {task.dueDate && (
                        <span className="text-xs text-gray-400">{formatDateShort(task.dueDate)}</span>
                      )}
                      {sub && sub.total > 0 && (
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          sub.done === sub.total ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-500"
                        )}>
                          {sub.done}/{sub.total} 子任务
                        </span>
                      )}
                    </div>
                  </Link>

                  <div className="flex items-center gap-1 shrink-0">
                    <Link
                      to={`/tasks/${task.id}`}
                      className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                    >
                      <Edit3 size={14} />
                    </Link>
                    <Form method="post">
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="taskId" value={task.id} />
                      <button type="submit" className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"
                        onClick={(e) => !confirm("确定删除此任务？") && e.preventDefault()}>
                        <Trash2 size={14} />
                      </button>
                    </Form>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
