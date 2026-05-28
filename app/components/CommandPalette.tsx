import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@remix-run/react";
import { FileText, ListTodo, Target, Search } from "lucide-react";
import { cn } from "~/lib/utils";

interface SearchItem {
  id: string;
  title: string;
  type: "note" | "task" | "goal";
  subtitle: string;
  url: string;
}

interface CommandPaletteProps {
  items: SearchItem[];
}

export default function CommandPalette({ items }: CommandPaletteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const navigate = useNavigate();

  // Cmd+K / Ctrl+K to toggle, and custom event from TopBar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    const openHandler = () => setIsOpen(true);
    window.addEventListener("keydown", handler);
    window.addEventListener("open-command-palette", openHandler);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("open-command-palette", openHandler);
    };
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Filter results
  const filtered = query.trim()
    ? items.filter(
        (item) =>
          item.title.toLowerCase().includes(query.toLowerCase()) ||
          item.subtitle.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 20)
    : [];

  // Navigate on select
  const select = (item: SearchItem) => {
    setIsOpen(false);
    navigate(item.url);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      select(filtered[selectedIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  // Scroll selected into view
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[selectedIndex] as HTMLElement;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  const iconMap = {
    note: FileText,
    task: ListTodo,
    goal: Target,
  };

  const typeLabel = { note: "笔记", task: "任务", goal: "目标" };
  const typeColor = { note: "text-blue-500", task: "text-orange-500", goal: "text-purple-500" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={() => setIsOpen(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search size={18} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="搜索笔记、任务、目标..."
            className="flex-1 text-sm outline-none placeholder:text-gray-400"
          />
          <kbd className="text-[10px] font-mono text-[#8A8F98] bg-[#F2F5F3] px-1.5 py-0.5 rounded-md">ESC</kbd>
        </div>

        {/* Results */}
        {query.trim() && (
          <ul ref={listRef} className="max-h-80 overflow-auto py-2">
            {filtered.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-gray-400">无匹配结果</li>
            ) : (
              filtered.map((item, i) => {
                const Icon = iconMap[item.type];
                return (
                  <li
                    key={item.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
                      i === selectedIndex ? "bg-primary-50" : "hover:bg-gray-50"
                    )}
                    onClick={() => select(item)}
                    onMouseEnter={() => setSelectedIndex(i)}
                  >
                    <Icon size={16} className={cn("shrink-0", typeColor[item.type])} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                      <p className="text-xs text-gray-400">{item.subtitle}</p>
                    </div>
                    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", typeColor[item.type], "bg-gray-50")}>
                      {typeLabel[item.type]}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        )}

        {/* Empty state hint */}
        {!query.trim() && (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            输入关键词搜索所有笔记、任务和目标
          </div>
        )}
      </div>
    </div>
  );
}
