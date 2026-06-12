import { useEffect, useState } from "react";
import { useFetcher } from "@remix-run/react";
import { X } from "lucide-react";
import { cn } from "~/lib/utils";

type Tab = "task" | "note";

export default function QuickCapture() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("task");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState<"high" | "medium" | "low">("medium");
  const fetcher = useFetcher();

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "n") { e.preventDefault(); setOpen(v => !v); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("open-quick-capture", onOpen);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("open-quick-capture", onOpen); window.removeEventListener("keydown", onKey); };
  }, []);

  // 提交成功后关闭
  const prevState = useState(fetcher.state)[0];
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && (fetcher.data as any).ok) {
      setOpen(false);
      setTitle("");
      setContent("");
    }
  }, [fetcher.state, fetcher.data]);

  const handleSubmit = () => {
    if (!title.trim()) return;
    if (tab === "task") {
      fetcher.submit(
        { intent: "quick-create", title, priority },
        { method: "post", action: "/tasks" }
      );
    } else {
      fetcher.submit(
        { intent: "quick-create", title, content },
        { method: "post", action: "/notes" }
      );
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={() => setOpen(false)} />
      <div className="fixed bottom-0 left-0 right-0 z-[61] bg-white rounded-t-2xl shadow-xl p-4 animate-slide-up"
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
        {/* Tab + 关闭 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-2">
            {(["task", "note"] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={cn("px-3 py-1 rounded-full text-sm font-medium transition-colors",
                  tab === t ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-500")}>
                {t === "task" ? "任务" : "笔记"}
              </button>
            ))}
          </div>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* 标题 */}
        <input
          autoFocus
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder={tab === "task" ? "任务标题..." : "笔记标题..."}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary-400 mb-2"
        />

        {/* 任务优先级 */}
        {tab === "task" && (
          <div className="flex gap-2 mb-3">
            {(["high", "medium", "low"] as const).map((p) => (
              <button key={p} onClick={() => setPriority(p)}
                className={cn("flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                  priority === p
                    ? p === "high" ? "bg-red-50 border-red-400 text-red-600"
                      : p === "medium" ? "bg-yellow-50 border-yellow-400 text-yellow-600"
                      : "bg-green-50 border-green-400 text-green-600"
                    : "border-gray-200 text-gray-400")}>
                {p === "high" ? "高优先级" : p === "medium" ? "中优先级" : "低优先级"}
              </button>
            ))}
          </div>
        )}

        {/* 笔记内容 */}
        {tab === "note" && (
          <textarea value={content} onChange={(e) => setContent(e.target.value)}
            placeholder="内容（可选）..." rows={3}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary-400 resize-none mb-3" />
        )}

        <button onClick={handleSubmit} disabled={!title.trim() || fetcher.state !== "idle"}
          className="w-full bg-primary-600 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 hover:bg-primary-700 transition-colors">
          {fetcher.state !== "idle" ? "保存中..." : "确认"}
        </button>
      </div>
    </>
  );
}
