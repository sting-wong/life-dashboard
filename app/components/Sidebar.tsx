import { Link, useLocation, useNavigate } from "@remix-run/react";
import {
  LayoutDashboard, LayoutGrid, ListTodo, CheckSquare, Calendar, FileText, Target, CalendarClock,
  Plus, CalendarDays, GitGraph, TrendingUp, Zap, KeyRound, Inbox, BarChart2,
} from "lucide-react";
import { cn } from "~/lib/utils";

const mainItems = [
  { to: "/", icon: LayoutDashboard, label: "首页" },
  { to: "/workspace", icon: LayoutGrid, label: "工作台" },
  { to: "/tasks", icon: ListTodo, label: "任务" },
  { to: "/inbox", icon: Inbox, label: "灵感收藏" },
  { to: "/creator", icon: BarChart2, label: "自媒体" },
  { to: "/api-keys", icon: KeyRound, label: "密钥账号" },
];

const toolItems = [
  { to: "/habits", icon: CheckSquare, label: "习惯" },
  { to: "/schedule", icon: CalendarClock, label: "日程" },
  { to: "/calendar", icon: Calendar, label: "日历" },
  { to: "/goals", icon: Target, label: "目标" },
  { to: "/notes", icon: FileText, label: "笔记" },
  { to: "/analytics", icon: TrendingUp, label: "数据分析" },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const handleFocus = () => {
    if (location.pathname !== "/") {
      navigate("/");
    }
    // Scroll to focus timer after navigation
    setTimeout(() => {
      const timer = document.querySelector(".focus-timer-card");
      timer?.scrollIntoView({ behavior: "smooth", block: "center" });
      // Trigger click on the start button if timer not running
      const startBtn = timer?.querySelector("button") as HTMLButtonElement;
      if (startBtn && startBtn.textContent?.includes("开始")) {
        startBtn.click();
      }
    }, 300);
  };

  const NavLink = ({ to, icon: Icon, label }: { to: string; icon: any; label: string }) => {
    const isActive =
      to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
    return (
      <Link
        to={to}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 relative",
          isActive
            ? "bg-primary-50 text-primary-700 font-semibold"
            : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
        )}
      >
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary-600 rounded-full" />
        )}
        <Icon size={17} strokeWidth={1.8} className={cn(isActive && "text-primary-600")} />
        {label}
      </Link>
    );
  };

  return (
    <aside className="w-[180px] bg-white border-r border-[#E8ECEA] flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-4 py-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[10px] bg-primary-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-gray-900 leading-tight">我的空间</h1>
            <p className="text-[10px] text-[#8A8F98] font-medium leading-tight">个人效率助手</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 space-y-0.5 overflow-auto">
        {mainItems.map((item) => (
          <NavLink key={item.to} {...item} />
        ))}

        <div className="pt-3 mt-3 mx-1 border-t border-[#E8ECEA]">
          <p className="px-3 mb-1 text-[9px] font-bold text-[#8A8F98] uppercase tracking-[0.15em]">
            工具
          </p>
          {toolItems.map((item) => (
            <NavLink key={item.to} {...item} />
          ))}
        </div>
      </nav>

      {/* Promo card */}
      <div className="p-2.5">
        <div className="bg-primary-600 rounded-2xl p-3.5 relative overflow-hidden">
          {/* Subtle texture */}
          <div className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `radial-gradient(circle at 20% 30%, white 1px, transparent 1px),
                radial-gradient(circle at 80% 70%, white 1px, transparent 1px),
                radial-gradient(circle at 40% 90%, white 0.5px, transparent 0.5px)`,
              backgroundSize: "40px 40px, 60px 60px, 30px 30px",
            }}
          />
          <div className="relative z-10">
            <div className="w-7 h-7 rounded-[10px] bg-white/20 flex items-center justify-center mb-2.5">
              <Zap size={13} className="text-white" />
            </div>
            <p className="text-xs font-semibold text-white leading-tight mb-1">今日专注模式</p>
            <p className="text-[10px] text-white/60 leading-tight mb-3">深度工作，减少干扰</p>
            <button onClick={handleFocus} className="w-full py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[11px] font-semibold transition-colors">
              开始专注
            </button>
          </div>
        </div>
      </div>

      {/* New task button */}
      <div className="px-2.5 pb-3">
        <Link
          to="/tasks/new"
          className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl text-[13px] font-semibold
                     bg-primary-600 text-white hover:bg-primary-700 transition-all duration-200 hover:shadow-md"
        >
          <Plus size={15} />
          新建任务
        </Link>
      </div>
    </aside>
  );
}
