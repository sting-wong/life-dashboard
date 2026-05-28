import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Play, Pause, RotateCcw, Clock, Maximize2, X, ChevronDown } from "lucide-react";
import { cn } from "~/lib/utils";

const WORK_MINUTES = 25;
const STORAGE_KEY = "focus-timer-state";

interface TimerState {
  endTime: number | null;
  paused: boolean;
  pausedRemaining: number;
}

function loadState(): TimerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { endTime: null, paused: false, pausedRemaining: 0 };
}

function saveState(s: TimerState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

interface FocusTimerProps {
  tasks?: { id: string; title: string }[];
}

export default function FocusTimer({ tasks = [] }: FocusTimerProps) {
  const [remaining, setRemaining] = useState(WORK_MINUTES * 60);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<string>("");
  const [mounted, setMounted] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notifiedRef = useRef(false);

  useEffect(() => { setMounted(true); }, []);

  // Restore state on mount
  useEffect(() => {
    const saved = loadState();
    if (saved.endTime && !saved.paused) {
      const now = Date.now();
      if (saved.endTime > now) {
        setRemaining(Math.ceil((saved.endTime - now) / 1000));
        setRunning(true);
      } else {
        setRemaining(0);
        localStorage.removeItem(STORAGE_KEY);
      }
    } else if (saved.paused && saved.pausedRemaining > 0) {
      setRemaining(saved.pausedRemaining);
      setPaused(true);
    }
  }, []);

  // Tick
  useEffect(() => {
    if (running && !paused) {
      intervalRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            setRunning(false);
            localStorage.removeItem(STORAGE_KEY);
            const today = new Date().toISOString().split("T")[0];
            const focusKey = `focus-minutes-${today}`;
            const prev_minutes = parseInt(localStorage.getItem(focusKey) || "0", 10);
            localStorage.setItem(focusKey, String(prev_minutes + WORK_MINUTES));
            if (!notifiedRef.current && "Notification" in window) {
              notifiedRef.current = true;
              if (Notification.permission === "granted") {
                new Notification("专注完成! 🎉", {
                  body: `${WORK_MINUTES} 分钟专注时间结束，休息一下吧。`,
                  icon: "/favicon.ico",
                });
              } else if (Notification.permission !== "denied") {
                Notification.requestPermission().then((p) => {
                  if (p === "granted") {
                    new Notification("专注完成! 🎉", {
                      body: `${WORK_MINUTES} 分钟专注时间结束，休息一下吧。`,
                    });
                  }
                });
              }
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, paused]);

  // ESC to exit fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fullscreen]);

  // Lock body scroll when fullscreen
  useEffect(() => {
    if (fullscreen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [fullscreen]);

  const start = useCallback(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") Notification.requestPermission();
    notifiedRef.current = false;
    const endTime = Date.now() + remaining * 1000;
    saveState({ endTime, paused: false, pausedRemaining: 0 });
    setRunning(true);
    setPaused(false);
  }, [remaining]);

  const pause = useCallback(() => {
    setPaused(true);
    saveState({ endTime: null, paused: true, pausedRemaining: remaining });
  }, [remaining]);

  const resume = useCallback(() => {
    const endTime = Date.now() + remaining * 1000;
    saveState({ endTime, paused: false, pausedRemaining: 0 });
    setPaused(false);
  }, [remaining]);

  const reset = useCallback(() => {
    setRunning(false);
    setPaused(false);
    setRemaining(WORK_MINUTES * 60);
    notifiedRef.current = false;
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const display = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const progress = ((WORK_MINUTES * 60 - remaining) / (WORK_MINUTES * 60)) * 100;
  const isDone = remaining === 0 && !running;
  const currentTaskTitle = tasks.find((t) => t.id === selectedTask)?.title;

  const controls = (dark: boolean) => (
    <div className="flex gap-2">
      {!running || paused ? (
        <button
          onClick={paused ? resume : start}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-colors",
            dark
              ? "bg-white/15 hover:bg-white/25 text-white"
              : "bg-primary-600 hover:bg-primary-700 text-white"
          )}
        >
          <Play size={12} />{paused ? "继续" : "开始"}
        </button>
      ) : (
        <button
          onClick={pause}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-colors",
            dark
              ? "bg-white/15 hover:bg-white/25 text-white"
              : "bg-primary-600 hover:bg-primary-700 text-white"
          )}
        >
          <Pause size={12} />暂停
        </button>
      )}
      {(running || paused) && (
        <button
          onClick={reset}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 rounded-full text-xs transition-colors",
            dark ? "bg-white/5 hover:bg-white/10 text-white/60" : "bg-gray-100 hover:bg-gray-200 text-gray-500"
          )}
        >
          <RotateCcw size={11} />
        </button>
      )}
    </div>
  );

  const fullscreenOverlay = mounted && fullscreen && createPortal(
    <div className="fixed inset-0 z-[9999] bg-primary-900 flex flex-col items-center justify-center select-none">
      {/* Texture */}
      <div className="absolute inset-0 opacity-[0.04]" style={{
        backgroundImage: `radial-gradient(circle at 25% 25%, white 1px, transparent 1px),
          radial-gradient(circle at 75% 75%, white 1px, transparent 1px)`,
        backgroundSize: "48px 48px, 72px 72px",
      }} />

      {/* Close */}
      <button
        onClick={() => setFullscreen(false)}
        className="absolute top-6 right-6 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
        title="退出 (ESC)"
      >
        <X size={18} />
      </button>

      {/* ESC hint */}
      <p className="absolute top-7 left-1/2 -translate-x-1/2 text-[11px] text-white/25 tracking-widest uppercase">
        按 ESC 退出
      </p>

      <div className="relative flex flex-col items-center gap-8 px-8 max-w-lg w-full">
        {/* Progress ring */}
        <div className="relative w-64 h-64 flex items-center justify-center">
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="88" fill="none" stroke="white" strokeOpacity="0.08" strokeWidth="6" />
            <circle
              cx="100" cy="100" r="88" fill="none" stroke="white" strokeOpacity="0.5" strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 88}
              strokeDashoffset={(2 * Math.PI * 88) * (1 - progress / 100)}
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <div className="text-center">
            <p className="text-[72px] font-bold text-white tracking-tight leading-none font-mono tabular-nums">
              {display}
            </p>
            <p className="text-[13px] text-white/40 mt-2">
              {isDone ? "专注完成！休息一下 🎉" : paused ? "已暂停" : running ? "深度专注中" : "准备开始"}
            </p>
          </div>
        </div>

        {/* Current task */}
        {tasks.length > 0 && (
          <div className="w-full">
            <p className="text-[11px] text-white/30 uppercase tracking-widest mb-2 text-center">当前任务</p>
            <div className="relative">
              <select
                value={selectedTask}
                onChange={(e) => setSelectedTask(e.target.value)}
                className="w-full appearance-none bg-white/10 hover:bg-white/15 text-white text-[15px] font-medium text-center px-6 py-3 rounded-2xl border border-white/10 focus:outline-none focus:ring-2 focus:ring-white/20 transition-colors cursor-pointer"
              >
                <option value="" className="bg-primary-900 text-white">选择一个任务...</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id} className="bg-primary-900 text-white">{t.title}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
            </div>
            {currentTaskTitle && (
              <p className="text-center text-[13px] text-white/50 mt-2 truncate px-4">{currentTaskTitle}</p>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-3">
          {!running || paused ? (
            <button
              onClick={paused ? resume : start}
              className="flex items-center gap-2 px-8 py-3 rounded-full bg-white text-primary-900 text-[14px] font-bold hover:bg-white/90 transition-colors"
            >
              <Play size={14} />{paused ? "继续专注" : "开始专注"}
            </button>
          ) : (
            <button
              onClick={pause}
              className="flex items-center gap-2 px-8 py-3 rounded-full bg-white/15 hover:bg-white/25 text-white text-[14px] font-semibold transition-colors"
            >
              <Pause size={14} />暂停
            </button>
          )}
          {(running || paused) && (
            <button
              onClick={reset}
              className="flex items-center gap-2 px-4 py-3 rounded-full bg-white/5 hover:bg-white/10 text-white/50 text-[14px] transition-colors"
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <>
      {fullscreenOverlay}
      <div className="card p-5 !bg-primary-800 !border-primary-800 relative overflow-hidden focus-timer-card">
        {/* Texture */}
        <div className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: `radial-gradient(circle at 30% 20%, white 1px, transparent 1px),
              radial-gradient(circle at 70% 80%, white 1px, transparent 1px),
              radial-gradient(circle at 50% 50%, white 0.5px, transparent 0.5px)`,
            backgroundSize: "30px 30px, 50px 50px, 20px 20px",
          }}
        />

        {/* Progress ring */}
        {running && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="92" fill="none" stroke="white" strokeOpacity="0.08" strokeWidth="3" />
            <circle
              cx="100" cy="100" r="92" fill="none" stroke="white" strokeOpacity="0.35" strokeWidth="3"
              strokeLinecap="round" strokeDasharray={2 * Math.PI * 92}
              strokeDashoffset={(2 * Math.PI * 92) * (1 - progress / 100)}
              transform="rotate(-90 100 100)"
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
        )}

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="w-8 h-8 rounded-[10px] bg-white/15 flex items-center justify-center">
              <Clock size={16} className="text-white" />
            </div>
            <button
              onClick={() => setFullscreen(true)}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
              title="全屏专注模式"
            >
              <Maximize2 size={13} />
            </button>
          </div>
          <h3 className="text-sm font-semibold text-white">专注计时器</h3>
          <p className="text-[38px] font-bold text-white tracking-tight my-2 leading-none font-mono tabular-nums">
            {display}
          </p>
          <p className="text-[11px] text-white/50 mb-4">
            {isDone ? "专注完成！休息一下吧 🎉" :
             paused ? "已暂停" :
             running ? `${WORK_MINUTES} 分钟深度工作` :
             "点击开始进入深度工作模式"}
          </p>
          {controls(true)}
        </div>
      </div>
    </>
  );
}
