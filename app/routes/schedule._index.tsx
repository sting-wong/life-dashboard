import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData, useNavigate, useFetcher } from "@remix-run/react";
import { db } from "~/db/index.server";
import { scheduleBlocks, tasks } from "~/db/schema.server";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { cn } from "~/lib/utils";
import {
  Plus, ChevronLeft, ChevronRight,
  CheckCircle2, Circle, Trash2, Edit3, Sparkles,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";

// ─── Default template blocks ───────────────────────────
const DEFAULT_TEMPLATE = [
  { title: "晨间启动：投简历 + 规划", startTime: "08:00", endTime: "08:30", blockType: "routine" as const, color: "#8B5CF6" },
  { title: "Prompt Canvas 内容规划", startTime: "08:30", endTime: "09:45", blockType: "focus" as const, color: "#1A7A4A" },
  { title: "休息", startTime: "09:45", endTime: "10:00", blockType: "break" as const, color: "#6B7280" },
  { title: "智界Talks 内容撰写", startTime: "10:00", endTime: "11:15", blockType: "focus" as const, color: "#1A7A4A" },
  { title: "休息", startTime: "11:15", endTime: "11:30", blockType: "break" as const, color: "#6B7280" },
  { title: "Code X / Vibe Coding", startTime: "11:30", endTime: "12:30", blockType: "focus" as const, color: "#0EA5E9" },
  { title: "午休", startTime: "12:30", endTime: "14:30", blockType: "meal" as const, color: "#F59E0B" },
  { title: "自由创作时间", startTime: "14:30", endTime: "16:30", blockType: "free" as const, color: "#EC4899" },
  { title: "Code X / Vibe Coding（续）", startTime: "16:30", endTime: "17:30", blockType: "focus" as const, color: "#0EA5E9" },
  { title: "晚饭", startTime: "17:30", endTime: "18:30", blockType: "meal" as const, color: "#F59E0B" },
  { title: "深度学习 / 开发", startTime: "18:30", endTime: "20:00", blockType: "focus" as const, color: "#1A7A4A" },
  { title: "自由创作时间②", startTime: "20:00", endTime: "21:30", blockType: "free" as const, color: "#EC4899" },
  { title: "复盘 + 明日规划", startTime: "21:30", endTime: "22:00", blockType: "routine" as const, color: "#8B5CF6" },
];

const BLOCK_TYPE_LABELS: Record<string, string> = {
  focus: "专注", break: "休息", meal: "用餐", free: "自由", routine: "日常",
};

function timeToMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function snapToFive(min: number): number {
  return Math.round(min / 5) * 5;
}

const TIMELINE_START = 480;  // 08:00
const TIMELINE_END = 1320;   // 22:00
const TIMELINE_DURATION = TIMELINE_END - TIMELINE_START;
const PX_PER_MIN = 1.5;

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date") || new Date().toISOString().split("T")[0];

  const blocks = db.select().from(scheduleBlocks)
    .where(eq(scheduleBlocks.date, dateParam))
    .all()
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const pendingTasks = db.select({ id: tasks.id, title: tasks.title, status: tasks.status })
    .from(tasks)
    .all()
    .filter((t) => t.status !== "done");

  const completedCount = blocks.filter((b) => b.completed).length;
  const totalCount = blocks.length;

  return json({ blocks, pendingTasks, date: dateParam, completedCount, totalCount });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const date = (formData.get("date") as string) || new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();

  if (intent === "apply-template") {
    for (const tpl of DEFAULT_TEMPLATE) {
      db.insert(scheduleBlocks).values({
        id: uuid(), date, title: tpl.title,
        startTime: tpl.startTime, endTime: tpl.endTime,
        blockType: tpl.blockType, color: tpl.color,
        completed: false, templateName: "工作日",
        createdAt: now, updatedAt: now,
      }).run();
    }
  }

  if (intent === "create-block") {
    const title = (formData.get("title") as string)?.trim();
    if (title) {
      db.insert(scheduleBlocks).values({
        id: uuid(), date, title,
        description: (formData.get("description") as string) || null,
        startTime: formData.get("startTime") as string,
        endTime: formData.get("endTime") as string,
        color: (formData.get("color") as string) || "#1A7A4A",
        taskIds: (formData.get("taskIds") as string) || null,
        blockType: (formData.get("blockType") as any) || "focus",
        completed: false, createdAt: now, updatedAt: now,
      }).run();
    }
  }

  if (intent === "toggle-complete") {
    const blockId = formData.get("blockId") as string;
    const block = db.select().from(scheduleBlocks).where(eq(scheduleBlocks.id, blockId)).get();
    if (block) {
      db.update(scheduleBlocks).set({ completed: !block.completed, updatedAt: now })
        .where(eq(scheduleBlocks.id, blockId)).run();
    }
  }

  if (intent === "delete-block") {
    const blockId = formData.get("blockId") as string;
    db.delete(scheduleBlocks).where(eq(scheduleBlocks.id, blockId)).run();
  }

  if (intent === "update-block") {
    const blockId = formData.get("blockId") as string;
    const updateData: Record<string, any> = { updatedAt: now };
    const title = (formData.get("title") as string)?.trim();
    if (title) updateData.title = title;
    const startTime = formData.get("startTime") as string;
    const endTime = formData.get("endTime") as string;
    if (startTime) updateData.startTime = startTime;
    if (endTime) updateData.endTime = endTime;
    const blockType = formData.get("blockType") as string;
    if (blockType) updateData.blockType = blockType;
    const color = formData.get("color") as string;
    if (color) updateData.color = color;
    const description = formData.get("description") as string;
    if (description !== null) updateData.description = description || null;
    const taskIds = formData.get("taskIds") as string;
    if (taskIds !== null) updateData.taskIds = taskIds || null;
    db.update(scheduleBlocks).set(updateData).where(eq(scheduleBlocks.id, blockId)).run();
  }

  // For drag updates (isDrag=1), return JSON so useFetcher doesn't navigate
  if (formData.get("isDrag") === "1") return json({ ok: true });

  return redirect(`/schedule?date=${date}`);
}

// ─── Block card with drag-to-move and drag-to-resize ──
function BlockCard({
  block,
  isActive,
  pendingTasks,
  date,
}: {
  block: any;
  isActive: boolean;
  pendingTasks: { id: string; title: string }[];
  date: string;
}) {
  const fetcher = useFetcher();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(block.title);
  const [editStart, setEditStart] = useState(block.startTime);
  const [editEnd, setEditEnd] = useState(block.endTime);
  const [editType, setEditType] = useState(block.blockType);
  const [editColor, setEditColor] = useState(block.color);
  const [editDesc, setEditDesc] = useState(block.description || "");

  const origStartMin = timeToMin(block.startTime);
  const origEndMin = timeToMin(block.endTime);
  const origTop = (origStartMin - TIMELINE_START) * PX_PER_MIN;
  const origHeight = Math.max((origEndMin - origStartMin) * PX_PER_MIN, 28);

  // Use refs for drag state to avoid stale closure issues
  const localTopRef = useRef(origTop);
  const localHeightRef = useRef(origHeight);
  const [localTop, setLocalTop] = useState(origTop);
  const [localHeight, setLocalHeight] = useState(origHeight);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // Sync when block prop changes (after server update)
  const prevBlockRef = useRef(block);
  if (prevBlockRef.current !== block) {
    prevBlockRef.current = block;
    localTopRef.current = origTop;
    localHeightRef.current = origHeight;
    setLocalTop(origTop);
    setLocalHeight(origHeight);
  }

  // Drag to move
  const handleMoveStart = (e: React.MouseEvent) => {
    if (editing) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setExpanded(false);
    const startY = e.clientY;
    const origTopSnap = localTopRef.current;
    const duration = origEndMin - origStartMin;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientY - startY;
      const rawTop = origTopSnap + delta;
      const clampedTop = Math.max(0, Math.min(rawTop, (TIMELINE_DURATION - duration) * PX_PER_MIN));
      const snapped = Math.round(snapToFive(Math.round(clampedTop / PX_PER_MIN)) * PX_PER_MIN);
      localTopRef.current = snapped;
      setLocalTop(snapped);
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setIsDragging(false);
      const newStartMin = TIMELINE_START + snapToFive(Math.round(localTopRef.current / PX_PER_MIN));
      const newEndMin = newStartMin + duration;
      fetcher.submit(
        {
          intent: "update-block", blockId: block.id, date,
          startTime: minToTime(newStartMin), endTime: minToTime(newEndMin),
          title: block.title, blockType: block.blockType, color: block.color,
          description: block.description || "", taskIds: block.taskIds || "",
          isDrag: "1",
        },
        { method: "post" }
      );
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // Drag to resize (bottom handle)
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const startY = e.clientY;
    const origH = localHeightRef.current;
    const startMin = TIMELINE_START + snapToFive(Math.round(localTopRef.current / PX_PER_MIN));

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientY - startY;
      const rawH = origH + delta;
      const minH = 15 * PX_PER_MIN;
      const maxH = (TIMELINE_END - startMin) * PX_PER_MIN;
      const clampedH = Math.max(minH, Math.min(rawH, maxH));
      const snapped = Math.round(snapToFive(Math.round(clampedH / PX_PER_MIN)) * PX_PER_MIN);
      localHeightRef.current = snapped;
      setLocalHeight(snapped);
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setIsResizing(false);
      const durationMin = snapToFive(Math.round(localHeightRef.current / PX_PER_MIN));
      const newEndMin = startMin + durationMin;
      fetcher.submit(
        {
          intent: "update-block", blockId: block.id, date,
          startTime: minToTime(startMin), endTime: minToTime(newEndMin),
          title: block.title, blockType: block.blockType, color: block.color,
          description: block.description || "", taskIds: block.taskIds || "",
          isDrag: "1",
        },
        { method: "post" }
      );
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const linkedTasks = block.taskIds
    ? (() => { try { return JSON.parse(block.taskIds) as string[]; } catch { return []; } })()
    : [];

  // Compute display times from local state
  const displayStartMin = TIMELINE_START + snapToFive(Math.round(localTop / PX_PER_MIN));
  const displayDuration = snapToFive(Math.round(localHeight / PX_PER_MIN));
  const displayEndMin = displayStartMin + displayDuration;

  return (
    <div
      className={cn(
        "absolute left-0 right-0 mx-1 rounded-xl border-l-4 transition-shadow overflow-hidden",
        isDragging || isResizing ? "shadow-xl z-30 opacity-90 cursor-grabbing" : "shadow-sm hover:shadow-md z-10",
        isActive && !isDragging && !isResizing ? "shadow-[0_4px_20px_rgba(26,122,74,0.25)] z-20" : "",
        block.completed && "opacity-50"
      )}
      style={{
        top: `${localTop}px`,
        height: `${localHeight}px`,
        backgroundColor: `${block.color}18`,
        borderLeftColor: block.color,
        userSelect: "none",
      }}
      onClick={() => !editing && !isDragging && !isResizing && setExpanded(!expanded)}
    >
      {/* Drag handle area (header) */}
      <div
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 min-h-[28px]",
          !editing && "cursor-grab active:cursor-grabbing"
        )}
        onMouseDown={handleMoveStart}
      >
        {isActive && (
          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        )}
        <span
          className={cn("text-[11px] font-semibold truncate flex-1", block.completed && "line-through")}
          style={{ color: block.color }}
        >
          {minToTime(displayStartMin)}–{minToTime(displayEndMin)} {block.title}
        </span>
        {isActive && (
          <span className="shrink-0 text-[9px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">
            进行中
          </span>
        )}
      </div>

      {/* Expanded panel */}
      {expanded && localHeight >= 60 && (
        <div className="px-2 pb-2" onClick={(e) => e.stopPropagation()}>
          {!editing ? (
            <div className="space-y-1.5">
              {block.description && (
                <p className="text-[11px] text-gray-500">{block.description}</p>
              )}
              {linkedTasks.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {linkedTasks.map((tid: string) => {
                    const t = pendingTasks.find((p) => p.id === tid);
                    return t ? (
                      <span key={tid} className="text-[10px] bg-white/60 px-1.5 py-0.5 rounded-full text-gray-600">
                        {t.title}
                      </span>
                    ) : null;
                  })}
                </div>
              )}
              <div className="flex items-center gap-1.5 pt-0.5">
                <Form method="post">
                  <input type="hidden" name="intent" value="toggle-complete" />
                  <input type="hidden" name="blockId" value={block.id} />
                  <input type="hidden" name="date" value={date} />
                  <button type="submit" className="p-1 rounded-lg hover:bg-white/50 transition-colors" title="标记完成">
                    {block.completed
                      ? <CheckCircle2 size={13} className="text-green-600" />
                      : <Circle size={13} className="text-gray-400" />}
                  </button>
                </Form>
                <button onClick={() => setEditing(true)} className="p-1 rounded-lg hover:bg-white/50 transition-colors" title="编辑">
                  <Edit3 size={13} className="text-gray-500" />
                </button>
                <Form method="post" className="ml-auto">
                  <input type="hidden" name="intent" value="delete-block" />
                  <input type="hidden" name="blockId" value={block.id} />
                  <input type="hidden" name="date" value={date} />
                  <button type="submit" className="p-1 rounded-lg hover:bg-red-50 transition-colors" title="删除"
                    onClick={(e) => !confirm("删除此时间块？") && e.preventDefault()}>
                    <Trash2 size={13} className="text-red-400" />
                  </button>
                </Form>
              </div>
            </div>
          ) : (
            <Form method="post" className="space-y-1.5">
              <input type="hidden" name="intent" value="update-block" />
              <input type="hidden" name="blockId" value={block.id} />
              <input type="hidden" name="date" value={date} />
              <input type="text" name="title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-2 py-1 text-[12px] border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-400" />
              <div className="flex gap-1">
                <input type="time" name="startTime" value={editStart} onChange={(e) => setEditStart(e.target.value)}
                  className="flex-1 px-1.5 py-1 text-[11px] border border-gray-200 rounded-lg focus:outline-none" />
                <input type="time" name="endTime" value={editEnd} onChange={(e) => setEditEnd(e.target.value)}
                  className="flex-1 px-1.5 py-1 text-[11px] border border-gray-200 rounded-lg focus:outline-none" />
              </div>
              <select name="blockType" value={editType} onChange={(e) => setEditType(e.target.value)}
                className="w-full px-2 py-1 text-[11px] border border-gray-200 rounded-lg focus:outline-none">
                {Object.entries(BLOCK_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <input type="hidden" name="color" value={editColor} />
              <input type="hidden" name="description" value={editDesc} />
              <input type="hidden" name="taskIds" value={block.taskIds || ""} />
              <div className="flex gap-1.5">
                <button type="submit" className="flex-1 py-1 text-[11px] font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700">保存</button>
                <button type="button" onClick={() => setEditing(false)} className="flex-1 py-1 text-[11px] text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200">取消</button>
              </div>
            </Form>
          )}
        </div>
      )}

      {/* Resize handle at bottom */}
      {!editing && (
        <div
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
          onMouseDown={handleResizeStart}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-8 h-0.5 rounded-full bg-current opacity-40" style={{ color: block.color }} />
        </div>
      )}
    </div>
  );
}

// ─── Add block form ────────────────────────────────────
function AddBlockForm({ date, pendingTasks, onClose }: {
  date: string;
  pendingTasks: { id: string; title: string }[];
  onClose: () => void;
}) {
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5">
        <h3 className="text-[15px] font-bold text-gray-900 mb-4">添加时间块</h3>
        <Form method="post" className="space-y-3" onSubmit={onClose}>
          <input type="hidden" name="intent" value="create-block" />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="taskIds" value={JSON.stringify(selectedTasks)} />

          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">标题 *</label>
            <input type="text" name="title" required placeholder="时间块名称"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-[12px] font-medium text-gray-600 mb-1">开始时间</label>
              <input type="time" name="startTime" defaultValue="09:00"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
            </div>
            <div className="flex-1">
              <label className="block text-[12px] font-medium text-gray-600 mb-1">结束时间</label>
              <input type="time" name="endTime" defaultValue="10:00"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-[12px] font-medium text-gray-600 mb-1">类型</label>
              <select name="blockType"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
                {Object.entries(BLOCK_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[12px] font-medium text-gray-600 mb-1">颜色</label>
              <div className="flex gap-1.5 flex-wrap pt-1">
                {["#1A7A4A", "#0EA5E9", "#8B5CF6", "#EC4899", "#F59E0B", "#6B7280"].map((c) => (
                  <label key={c} className="cursor-pointer">
                    <input type="radio" name="color" value={c} defaultChecked={c === "#1A7A4A"} className="sr-only" />
                    <span className="block w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: c }} />
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">备注</label>
            <input type="text" name="description" placeholder="可选"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>

          {pendingTasks.length > 0 && (
            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1.5">关联任务</label>
              <div className="max-h-32 overflow-auto space-y-1 border border-gray-100 rounded-xl p-2">
                {pendingTasks.slice(0, 15).map((t) => (
                  <label key={t.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded-lg">
                    <input type="checkbox" checked={selectedTasks.includes(t.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedTasks((p) => [...p, t.id]);
                        else setSelectedTasks((p) => p.filter((id) => id !== t.id));
                      }}
                      className="rounded text-primary-600" />
                    <span className="text-[12px] text-gray-700 truncate">{t.title}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="submit" className="flex-1 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 transition-colors">添加</button>
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">取消</button>
          </div>
        </Form>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────
export default function SchedulePage() {
  const { blocks, pendingTasks, date, completedCount, totalCount } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [showAddForm, setShowAddForm] = useState(false);
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

  const isToday = date === new Date().toISOString().split("T")[0];
  const currentMin = timeToMin(currentTime);

  const goDate = (offset: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + offset);
    navigate(`/schedule?date=${d.toISOString().split("T")[0]}`);
  };

  const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("zh-CN", {
    month: "long", day: "numeric", weekday: "long",
  });

  const hours = Array.from({ length: 15 }, (_, i) => i + 8);
  const nowTop = isToday && currentMin >= TIMELINE_START && currentMin <= TIMELINE_END
    ? (currentMin - TIMELINE_START) * PX_PER_MIN
    : null;

  // Progress bar color
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const progressColor = progressPct >= 80 ? "#1A7A4A" : progressPct >= 50 ? "#3B82F6" : "#9CA3AF";

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">日程规划</h1>
          <p className="text-sm text-[#8A8F98] mt-0.5">专注每个时间段，减少干扰</p>
        </div>
        <button onClick={() => setShowAddForm(true)} className="btn-primary flex items-center gap-1.5 text-[13px]">
          <Plus size={14} />添加时间块
        </button>
      </div>

      {/* Date nav */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => goDate(-1)} className="w-8 h-8 rounded-full bg-white border border-[#E8ECEA] flex items-center justify-center hover:bg-gray-50 transition-colors">
          <ChevronLeft size={15} className="text-gray-500" />
        </button>
        <div className="flex-1 text-center">
          <span className="text-[14px] font-semibold text-gray-900">{dateLabel}</span>
          {isToday && (
            <span className="ml-2 text-[11px] font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">今天</span>
          )}
        </div>
        <button onClick={() => goDate(1)} className="w-8 h-8 rounded-full bg-white border border-[#E8ECEA] flex items-center justify-center hover:bg-gray-50 transition-colors">
          <ChevronRight size={15} className="text-gray-500" />
        </button>
        {!isToday && (
          <button onClick={() => navigate("/schedule")} className="text-[12px] text-primary-600 font-medium hover:text-primary-700">
            回今天
          </button>
        )}
      </div>

      {/* Completion progress bar */}
      {totalCount > 0 && (
        <div className="mb-4 bg-white rounded-xl border border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[12px] font-medium text-gray-600">今日完成进度</span>
            <span className="text-[12px] font-semibold" style={{ color: progressColor }}>
              {completedCount}/{totalCount} 个时间块
            </span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%`, backgroundColor: progressColor }}
            />
          </div>
        </div>
      )}

      {/* Empty state */}
      {blocks.length === 0 && (
        <div className="mb-5 rounded-2xl border border-dashed border-primary-200 bg-primary-50/50 p-5 text-center">
          <Sparkles size={28} className="mx-auto text-primary-400 mb-2" />
          <p className="text-[14px] font-semibold text-gray-800 mb-1">还没有时间块</p>
          <p className="text-[12px] text-[#8A8F98] mb-3">应用你的工作日模板，快速开始规划</p>
          <Form method="post">
            <input type="hidden" name="intent" value="apply-template" />
            <input type="hidden" name="date" value={date} />
            <button type="submit" className="inline-flex items-center gap-1.5 px-5 py-2 bg-primary-600 text-white text-[13px] font-semibold rounded-full hover:bg-primary-700 transition-colors">
              <Sparkles size={13} />应用工作日模板
            </button>
          </Form>
        </div>
      )}

      {/* Timeline */}
      <div className="card overflow-hidden">
        <div className="flex">
          {/* Hour labels */}
          <div className="w-12 shrink-0 border-r border-[#F0F2F1]">
            {hours.map((h) => (
              <div key={h} className="flex items-start justify-end pr-2 text-[10px] text-[#8A8F98] font-medium"
                style={{ height: `${60 * PX_PER_MIN}px` }}>
                <span className="-mt-2">{String(h).padStart(2, "0")}:00</span>
              </div>
            ))}
          </div>

          {/* Blocks area */}
          <div className="flex-1 relative" style={{ height: `${TIMELINE_DURATION * PX_PER_MIN}px` }}>
            {/* Hour grid lines */}
            {hours.map((h) => (
              <div key={h} className="absolute left-0 right-0 border-t border-[#F0F2F1]"
                style={{ top: `${(h * 60 - TIMELINE_START) * PX_PER_MIN}px` }} />
            ))}
            {/* Half-hour lines */}
            {hours.map((h) => (
              <div key={`${h}-30`} className="absolute left-0 right-0 border-t border-dashed border-[#F4F6F5]"
                style={{ top: `${(h * 60 + 30 - TIMELINE_START) * PX_PER_MIN}px` }} />
            ))}

            {/* Current time indicator */}
            {nowTop !== null && (
              <div className="absolute left-0 right-0 z-30 flex items-center gap-1 pointer-events-none"
                style={{ top: `${nowTop}px` }}>
                <div className="w-2 h-2 rounded-full bg-red-500 shrink-0 -ml-1" />
                <div className="flex-1 h-px bg-red-400" />
                <span className="text-[10px] font-bold text-red-500 pr-1">{currentTime}</span>
              </div>
            )}

            {/* Block cards */}
            {blocks.map((block) => {
              const startMin = timeToMin(block.startTime);
              const endMin = timeToMin(block.endTime);
              const isActive = isToday && currentMin >= startMin && currentMin < endMin;
              return (
                <BlockCard
                  key={block.id}
                  block={block}
                  isActive={isActive}
                  pendingTasks={pendingTasks}
                  date={date}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Stats row */}
      {blocks.length > 0 && (
        <div className="flex items-center gap-4 mt-4 px-1 flex-wrap">
          {(["focus", "break", "meal", "free", "routine"] as const).map((type) => {
            const count = blocks.filter((b) => b.blockType === type).length;
            if (!count) return null;
            const colors: Record<string, string> = {
              focus: "text-primary-600", break: "text-gray-500",
              meal: "text-amber-500", free: "text-pink-500", routine: "text-violet-500",
            };
            return (
              <div key={type} className="flex items-center gap-1">
                <span className={cn("text-[11px] font-semibold", colors[type])}>{BLOCK_TYPE_LABELS[type]}</span>
                <span className="text-[11px] text-[#8A8F98]">×{count}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Add form modal */}
      {showAddForm && (
        <AddBlockForm date={date} pendingTasks={pendingTasks} onClose={() => setShowAddForm(false)} />
      )}
    </div>
  );
}
