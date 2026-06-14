import {
  json,
  type LinksFunction,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  Link,
  useLocation,
} from "@remix-run/react";
import { useState } from "react";
import styles from "./styles/app.css?url";
import Sidebar from "./components/Sidebar";
import CommandPalette from "./components/CommandPalette";
import QuickCapture from "./components/QuickCapture";
import TopBar from "./components/TopBar";
import { db } from "~/db/index.server";
import { notes, tasks, goals, notifications } from "~/db/schema.server";
import { desc, eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { LayoutDashboard, Briefcase, Lightbulb, Wrench, ListTodo, CalendarClock, Calendar, CheckSquare, Target, FileText, BarChart2 } from "lucide-react";
import { cn } from "~/lib/utils";


export const links: LinksFunction = () => [{ rel: "stylesheet", href: styles }];

export async function loader({ request }: LoaderFunctionArgs) {
  const allNotes = db.select({ id: notes.id, title: notes.title }).from(notes).all();
  const allTasks = db.select({ id: tasks.id, title: tasks.title, status: tasks.status, dueDate: tasks.dueDate }).from(tasks).all();
  const allGoals = db.select({ id: goals.id, title: goals.title, status: goals.status }).from(goals).all();

  // ─── Auto-generate notifications ───
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const existingNotifs = db.select().from(notifications).all();

  // Clear old auto-generated notifs and regenerate fresh ones
  db.delete(notifications).where(eq(notifications.type, "task_due")).run();
  db.delete(notifications).where(eq(notifications.type, "task_overdue")).run();

  // Tasks due today
  for (const t of allTasks) {
    if (t.status !== "done" && t.dueDate?.split("T")[0] === today) {
      const exists = existingNotifs.find((n) => n.type === "task_due" && n.link === `/tasks/${t.id}`);
      if (!exists) {
        db.insert(notifications).values({
          id: uuid(), type: "task_due", title: `📋 今日待办: ${t.title}`,
          body: "该任务截止日期为今天", link: `/tasks/${t.id}`,
          read: false, createdAt: now.toISOString(),
        }).run();
      }
    }
    // Tasks overdue
    if (t.status !== "done" && t.dueDate && t.dueDate.split("T")[0] < today) {
      const exists = existingNotifs.find((n) => n.type === "task_overdue" && n.link === `/tasks/${t.id}`);
      if (!exists) {
        db.insert(notifications).values({
          id: uuid(), type: "task_overdue", title: `⚠️ 已过期: ${t.title}`,
          body: `截止日期: ${t.dueDate.split("T")[0]}`,
          link: `/tasks/${t.id}`, read: false, createdAt: now.toISOString(),
        }).run();
      }
    }
  }

  // Goals completed in last 3 days
  const ms3d = Date.now() - 3 * 86400000;
  for (const g of allGoals) {
    if (g.status === "completed") {
      const exists = existingNotifs.find((n) => n.type === "goal_milestone" && n.link === `/goals/${g.id}`);
      if (!exists) {
        db.insert(notifications).values({
          id: uuid(), type: "goal_milestone", title: `🎯 目标达成: ${g.title}`,
          body: "恭喜完成目标！", link: `/goals/${g.id}`,
          read: false, createdAt: now.toISOString(),
        }).run();
      }
    }
  }

  const unreadNotifs = db.select().from(notifications).where(eq(notifications.read, false)).orderBy(desc(notifications.createdAt)).all();
  const unreadCount = unreadNotifs.length;

  const searchItems = [
    ...allNotes.map((n) => ({
      id: n.id,
      title: n.title,
      type: "note" as const,
      subtitle: "笔记",
      url: `/notes/${n.id}`,
    })),
    ...allTasks.map((t) => ({
      id: t.id,
      title: t.title,
      type: "task" as const,
      subtitle: t.status === "done" ? "已完成" : t.status === "in_progress" ? "进行中" : "待办",
      url: `/tasks/${t.id}`,
    })),
    ...allGoals.map((g) => ({
      id: g.id,
      title: g.title,
      type: "goal" as const,
      subtitle: g.status === "active" ? "进行中" : g.status === "completed" ? "已完成" : "已取消",
      url: `/goals/${g.id}`,
    })),
  ];

  return json({ searchItems, unreadNotifs, unreadCount });
}

export default function App() {
  const { searchItems, unreadNotifs, unreadCount } = useLoaderData<typeof loader>();
  const location = useLocation();
  const [toolMenuOpen, setToolMenuOpen] = useState(false);

  const TOOL_ITEMS = [
    { to: "/tasks",    icon: ListTodo,     label: "任务" },
    { to: "/schedule", icon: CalendarClock, label: "日程" },
    { to: "/calendar", icon: Calendar,     label: "日历" },
    { to: "/goals",    icon: Target,       label: "目标" },
    { to: "/notes",    icon: FileText,     label: "笔记" },
    { to: "/analytics",icon: BarChart2,    label: "数据分析" },
    { to: "/inbox",    icon: Lightbulb,    label: "灵感收藏" },
  ];

  const toolPaths = TOOL_ITEMS.map(i => i.to);
  const isToolActive = toolPaths.some(p => location.pathname.startsWith(p));

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <Meta />
        <Links />
      </head>
      <body>
        {/* Full-screen app shell */}
        <div className="flex w-full bg-transparent overflow-hidden" style={{ height: "100dvh" }} id="app-shell">
          <div className="hidden md:block">
            <Sidebar />
          </div>
          <div className="flex-1 flex flex-col min-w-0">
            <TopBar unreadNotifs={unreadNotifs} unreadCount={unreadCount} />
            <main className="flex-1 overflow-auto bg-transparent pb-20 md:pb-0">
              <Outlet />
            </main>
          </div>
        </div>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#E8ECEA] flex items-center justify-around px-2 pt-1" style={{ paddingBottom: "max(4px, env(safe-area-inset-bottom))" }}>
          {/* 首页 */}
          {[
            { to: "/", icon: LayoutDashboard, label: "首页" },
            { to: "/workspace", icon: Briefcase, label: "工作台" },
          ].map(({ to, icon: Icon, label }) => {
            const isActive = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
            return (
              <Link key={to} to={to} className={cn("flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-colors min-w-[52px]", isActive ? "text-primary-600" : "text-gray-400")}>
                <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                <span className={cn("text-[10px] font-medium", isActive ? "text-primary-600" : "text-gray-400")}>{label}</span>
              </Link>
            );
          })}

          {/* 中间快速录入按钮 */}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("open-quick-capture"))}
            className="flex items-center justify-center w-12 h-12 rounded-full bg-primary-600 text-white shadow-lg -mt-5 text-2xl leading-none"
            aria-label="快速录入"
          >+</button>

          {/* 习惯 */}
          {(() => {
            const isActive = location.pathname.startsWith("/habits");
            return (
              <Link to="/habits" className={cn("flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-colors min-w-[52px]", isActive ? "text-primary-600" : "text-gray-400")}>
                <CheckSquare size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                <span className={cn("text-[10px] font-medium", isActive ? "text-primary-600" : "text-gray-400")}>习惯</span>
              </Link>
            );
          })()}

          {/* 工具 */}
          <div className="relative">
            <button
              onClick={() => setToolMenuOpen(o => !o)}
              className={cn("flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-colors min-w-[52px]", isToolActive || toolMenuOpen ? "text-primary-600" : "text-gray-400")}
              aria-label="工具"
            >
              <Wrench size={20} strokeWidth={isToolActive || toolMenuOpen ? 2.2 : 1.8} />
              <span className={cn("text-[10px] font-medium", isToolActive || toolMenuOpen ? "text-primary-600" : "text-gray-400")}>工具</span>
            </button>

            {/* 工具菜单弹出层 */}
            {toolMenuOpen && (
              <>
                {/* 遮罩 */}
                <div className="fixed inset-0 z-40" onClick={() => setToolMenuOpen(false)} />
                <div className="absolute bottom-full right-0 mb-3 z-50 bg-white rounded-2xl shadow-[0_-2px_0_rgba(0,0,0,0.04),0_16px_48px_rgba(15,23,42,0.14)] border border-[#E8ECEA] overflow-hidden w-44">
                  {/* 标题行 */}
                  <div className="px-4 py-2.5 border-b border-[#F0F2F1]">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">更多工具</span>
                  </div>
                  <div className="py-1">
                    {TOOL_ITEMS.map(({ to, icon: Icon, label }) => {
                      const isActive = location.pathname.startsWith(to);
                      return (
                        <Link
                          key={to}
                          to={to}
                          onClick={() => setToolMenuOpen(false)}
                          className={cn(
                            "flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors mx-1 rounded-xl",
                            isActive ? "text-primary-600 bg-primary-50 font-medium" : "text-gray-700 hover:bg-gray-50"
                          )}
                        >
                          <Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} />
                          {label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </nav>

        <CommandPalette items={searchItems} />
        <QuickCapture />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
