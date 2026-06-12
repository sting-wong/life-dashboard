import { useState, useRef, useEffect } from "react";
import { useNavigate } from "@remix-run/react";
import { Search, Bell, Mail, ChevronDown, Check, X, Settings, LogOut, User } from "lucide-react";
import { cn } from "~/lib/utils";

interface NotifItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export default function TopBar({
  unreadNotifs = [],
  unreadCount = 0,
}: {
  unreadNotifs?: NotifItem[];
  unreadCount?: number;
}) {
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [today, setToday] = useState("");
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  // Compute date only on client to avoid SSR/client hydration mismatch
  useEffect(() => {
    setToday(new Date().toLocaleDateString("zh-CN", {
      month: "long", day: "numeric", weekday: "long",
    }));
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const openSearch = () => {
    window.dispatchEvent(new CustomEvent("open-command-palette"));
  };

  const markAllRead = async () => {
    await fetch("/api/notifications/read-all", { method: "POST" });
    setNotifOpen(false);
    window.location.reload();
  };

  return (
    <div className="flex items-center justify-between px-4 md:px-6 h-[56px] md:h-[72px] border-b border-[#E8ECEA] bg-white shrink-0">
      {/* Search */}
      <div className="relative w-[180px] md:w-[280px]">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8A8F98] pointer-events-none" />
        <input
          type="text"
          placeholder="搜索..."
          onFocus={(e) => { e.target.blur(); openSearch(); }}
          readOnly
          className="w-full pl-9 pr-3 py-2 md:py-2.5 bg-[#F4F6F5] border-none rounded-[18px] text-[13px]
                     placeholder:text-[#8A8F98] focus:outline-none focus:ring-2 focus:ring-primary-100 cursor-pointer"
        />
        <span className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 items-center gap-0.5 text-[10px] text-[#B0B5BC] bg-white border border-[#E8ECEA] rounded px-1 py-0.5 pointer-events-none select-none">
          ⌘K
        </span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2 md:gap-3">
        <span className="hidden md:block text-[13px] text-[#8A8F98]">{today}</span>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="w-9 h-9 rounded-full bg-[#F4F6F5] hover:bg-gray-100 flex items-center justify-center transition-colors relative"
          >
            <Bell size={15} className="text-[#8A8F98]" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 ring-2 ring-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {/* Notifications dropdown */}
          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-80 max-w-sm bg-white rounded-2xl shadow-[0_16px_48px_rgba(15,23,42,0.12)] border border-[#E8ECEA] overflow-hidden z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8ECEA]">
                <span className="text-[13px] font-semibold text-gray-900">通知</span>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-[11px] text-primary-600 font-medium hover:text-primary-700">
                    全部已读
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-auto">
                {unreadNotifs.length === 0 ? (
                  <div className="py-10 text-center">
                    <Bell size={24} className="mx-auto text-gray-200 mb-2" />
                    <p className="text-[12px] text-[#8A8F98]">暂无通知</p>
                  </div>
                ) : (
                  unreadNotifs.slice(0, 15).map((n) => (
                    <button
                      key={n.id}
                      onClick={() => { if (n.link) navigate(n.link); setNotifOpen(false); }}
                      className="w-full text-left px-4 py-3 hover:bg-[#F4F6F5] transition-colors border-b border-[#F4F6F5] last:border-0"
                    >
                      <p className="text-[13px] font-medium text-gray-900 truncate">{n.title}</p>
                      {n.body && <p className="text-[11px] text-[#8A8F98] mt-0.5 truncate">{n.body}</p>}
                      <p className="text-[10px] text-[#8A8F98] mt-1">
                        {new Date(n.createdAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-full hover:bg-[#F4F6F5] transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-bold">
              S
            </div>
            <div className="hidden md:block text-left leading-tight">
              <p className="text-[13px] font-semibold text-gray-900">Sting</p>
              <p className="text-[10px] text-[#8A8F98]">Product Manager</p>
            </div>
            <ChevronDown size={13} className={cn("hidden md:block text-[#8A8F98] ml-0.5 transition-transform", userMenuOpen && "rotate-180")} />
          </button>

          {/* User dropdown */}
          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 sm:w-52 bg-white rounded-2xl shadow-[0_16px_48px_rgba(15,23,42,0.12)] border border-[#E8ECEA] overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-[#E8ECEA]">
                <p className="text-[13px] font-semibold text-gray-900">Sting</p>
                <p className="text-[11px] text-[#8A8F98]">sting@example.com</p>
              </div>
              <div className="py-1">
                <button
                  onClick={() => { setUserMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-gray-600 hover:bg-[#F4F6F5] transition-colors"
                >
                  <User size={14} className="text-[#8A8F98]" />
                  个人信息
                </button>
                <button
                  onClick={() => { setUserMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-gray-600 hover:bg-[#F4F6F5] transition-colors"
                >
                  <Settings size={14} className="text-[#8A8F98]" />
                  设置
                </button>
              </div>
              <div className="border-t border-[#E8ECEA] py-1">
                <button
                  onClick={() => { setUserMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-gray-400 hover:bg-[#F4F6F5] transition-colors"
                >
                  <LogOut size={14} className="text-[#8A8F98]" />
                  退出登录
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
