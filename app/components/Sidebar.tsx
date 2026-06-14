import { Link, useLocation } from "@remix-run/react";
import {
  LayoutDashboard, LayoutGrid, ListTodo, CheckSquare, Calendar, FileText, Target, CalendarClock,
  Plus, CalendarDays, GitGraph, TrendingUp, Zap, KeyRound, Inbox, BarChart2,
} from "lucide-react";
import { cn } from "~/lib/utils";

const mainItems = [
  { to: "/", icon: LayoutDashboard, label: "首页" },
  { to: "/workspace", icon: LayoutGrid, label: "工作台" },
  { to: "/tasks", icon: ListTodo, label: "任务" },
  { to: "/habits", icon: CheckSquare, label: "习惯" },
  { to: "/schedule", icon: CalendarClock, label: "日程" },
  { to: "/api-keys", icon: KeyRound, label: "密钥账号" },
];

const toolItems = [
  { to: "/inbox", icon: Inbox, label: "灵感收藏" },
  { to: "/creator", icon: BarChart2, label: "自媒体" },
  { to: "/calendar", icon: Calendar, label: "日历" },
  { to: "/goals", icon: Target, label: "目标" },
  { to: "/notes", icon: FileText, label: "笔记" },
  { to: "/analytics", icon: TrendingUp, label: "数据分析" },
];

export default function Sidebar() {
  const location = useLocation();

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
    <aside className="w-[180px] bg-[#faf6ef] border-r border-[rgba(222,210,194,0.55)] flex flex-col shrink-0">
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
          <p className="px-3 mb-1 text-[9px] font-bold text-[#c4b9ad] uppercase tracking-[0.15em]">
            工具
          </p>
          {toolItems.map((item) => (
            <NavLink key={item.to} {...item} />
          ))}
        </div>
      </nav>

    </aside>
  );
}
