import { Link, useLocation, useMatches } from "@remix-run/react";
import { ChevronRight } from "lucide-react";

const PATH_LABELS: Record<string, string> = {
  tasks: "任务",
  notes: "笔记",
  goals: "目标",
  calendar: "日历",
  graph: "知识图谱",
  analytics: "数据分析",
  daily: "今日笔记",
  new: "新建",
  accounts: "账号管理",
  tags: "标签",
};

export default function BreadcrumbNav() {
  const location = useLocation();
  const matches = useMatches();
  const segments = location.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const items: { label: string; href: string; isLast: boolean }[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const href = "/" + segments.slice(0, i + 1).join("/");
    const isLast = i === segments.length - 1;

    let label = PATH_LABELS[segment] || segment;

    if (/^[0-9a-f-]{20,}$/.test(segment)) {
      for (const match of matches) {
        const data = match.data as any;
        if (data?.note?.id === segment) { label = data.note.title; break; }
        if (data?.task?.id === segment) { label = data.task.title; break; }
        if (data?.goal?.id === segment) { label = data.goal.title; break; }
      }
      // Truncate long titles
      if (label.length > 30) label = label.slice(0, 30) + "...";
    }

    items.push({ label, href, isLast });
  }

  if (items.length === 0) return null;

  return (
    <nav className="flex items-center gap-1.5 px-6 py-2.5 text-xs text-[#8A8F98]">
      <Link to="/" className="hover:text-gray-700 transition-colors">首页</Link>
      {items.map((item, i) => (
        <span key={item.href} className="flex items-center gap-1.5">
          <ChevronRight size={11} />
          {item.isLast ? (
            <span className="text-gray-700 font-medium">{item.label}</span>
          ) : (
            <Link to={item.href} className="hover:text-gray-700 transition-colors">{item.label}</Link>
          )}
        </span>
      ))}
    </nav>
  );
}
