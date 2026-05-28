import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useSearchParams } from "@remix-run/react";
import { db } from "~/db/index.server";
import { tasks, scheduleBlocks } from "~/db/schema.server";
import { eq, and, like } from "drizzle-orm";
import { formatDate, getStatusLabel, getPriorityColor, getPriorityLabel, cn } from "~/lib/utils";
import { ChevronLeft, ChevronRight, Plus, CalendarClock, ListTodo } from "lucide-react";
import { useState } from "react";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get("year") || String(new Date().getFullYear()));
  const month = parseInt(url.searchParams.get("month") || String(new Date().getMonth() + 1));

  const allTasks = db.select().from(tasks).all();

  // Fetch all schedule blocks for this month
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const monthBlocks = db.select().from(scheduleBlocks)
    .all()
    .filter((b) => b.date.startsWith(monthPrefix));

  return json({ tasks: allTasks, scheduleBlocks: monthBlocks, year, month });
}

export default function Calendar() {
  const { tasks: taskList, scheduleBlocks: blockList, year, month } = useLoaderData<typeof loader>();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startDay = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const today = new Date();

  const monthNames = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  // Group tasks by date
  const tasksByDate: Record<string, typeof taskList> = {};
  taskList.forEach((t) => {
    if (t.dueDate) {
      const dateKey = t.dueDate.split("T")[0];
      if (!tasksByDate[dateKey]) tasksByDate[dateKey] = [];
      tasksByDate[dateKey].push(t);
    }
  });

  // Group schedule blocks by date
  const blocksByDate: Record<string, typeof blockList> = {};
  blockList.forEach((b) => {
    if (!blocksByDate[b.date]) blocksByDate[b.date] = [];
    blocksByDate[b.date].push(b);
  });

  const selectedTasks = selectedDate ? tasksByDate[selectedDate] || [] : [];
  const selectedBlocks = selectedDate
    ? (blocksByDate[selectedDate] || []).sort((a, b) => a.startTime.localeCompare(b.startTime))
    : [];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">日历</h1>
        <Link
          to="/tasks/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus size={16} />
          新建任务
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Month Navigation */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <Link
            to={`/calendar?year=${prevYear}&month=${prevMonth}`}
            className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
          >
            <ChevronLeft size={20} />
          </Link>
          <h2 className="text-lg font-semibold text-gray-900">
            {year}年 {monthNames[month - 1]}
          </h2>
          <Link
            to={`/calendar?year=${nextYear}&month=${nextMonth}`}
            className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
          >
            <ChevronRight size={20} />
          </Link>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
            <div key={d} className="p-2 text-center text-xs font-medium text-gray-500">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {Array.from({ length: startDay }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[80px] p-1 border-b border-r border-gray-50" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayTasks = tasksByDate[dateStr] || [];
            const dayBlocks = blocksByDate[dateStr] || [];
            const isToday = dateStr === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
            const isSelected = selectedDate === dateStr;

            return (
              <button
                key={day}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className={cn(
                  "min-h-[80px] p-1 border-b border-r border-gray-50 text-left hover:bg-gray-50 transition-colors",
                  isSelected && "bg-primary-50 ring-2 ring-inset ring-primary-200",
                )}
              >
                <span className={cn(
                  "inline-flex items-center justify-center w-6 h-6 text-xs rounded-full",
                  isToday && "bg-primary-600 text-white font-bold",
                  !isToday && "text-gray-700"
                )}>
                  {day}
                </span>
                <div className="mt-1 space-y-0.5">
                  {/* Schedule block dots */}
                  {dayBlocks.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 mb-0.5">
                      {dayBlocks.slice(0, 4).map((b) => (
                        <span
                          key={b.id}
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: b.color }}
                          title={b.title}
                        />
                      ))}
                      {dayBlocks.length > 4 && (
                        <span className="text-[9px] text-gray-400">+{dayBlocks.length - 4}</span>
                      )}
                    </div>
                  )}
                  {/* Task chips */}
                  {dayTasks.slice(0, 2).map((t) => (
                    <div
                      key={t.id}
                      className={cn(
                        "text-[10px] px-1 py-0.5 rounded truncate",
                        t.status === "done" ? "bg-gray-100 text-gray-400" :
                        t.priority === "urgent" || t.priority === "high" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"
                      )}
                    >
                      {t.title}
                    </div>
                  ))}
                  {dayTasks.length > 2 && (
                    <div className="text-[10px] text-gray-400 px-1">+{dayTasks.length - 2}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected date detail */}
      {selectedDate && (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">{selectedDate}</h3>
            <Link
              to={`/schedule?date=${selectedDate}`}
              className="text-[12px] text-primary-600 font-medium hover:text-primary-700 flex items-center gap-1"
            >
              <CalendarClock size={13} />
              查看日程详情
            </Link>
          </div>

          {/* Schedule blocks */}
          {selectedBlocks.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-[#8A8F98] uppercase tracking-wider mb-2 flex items-center gap-1">
                <CalendarClock size={11} />时间块 ({selectedBlocks.length})
              </p>
              <div className="space-y-1.5">
                {selectedBlocks.map((b) => (
                  <div key={b.id}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
                    style={{ backgroundColor: `${b.color}12`, borderLeft: `3px solid ${b.color}` }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-[13px] font-medium text-gray-800 truncate", b.completed && "line-through text-gray-400")}>
                        {b.title}
                      </p>
                      <p className="text-[11px] text-[#8A8F98]">{b.startTime}–{b.endTime}</p>
                    </div>
                    {b.completed && (
                      <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full shrink-0">已完成</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tasks */}
          {selectedTasks.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-[#8A8F98] uppercase tracking-wider mb-2 flex items-center gap-1">
                <ListTodo size={11} />任务 ({selectedTasks.length})
              </p>
              <ul className="space-y-1.5">
                {selectedTasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50">
                    <span className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      t.priority === "urgent" ? "bg-red-500" :
                      t.priority === "high" ? "bg-orange-500" :
                      t.priority === "medium" ? "bg-blue-500" : "bg-gray-400"
                    )} />
                    <Link to={`/tasks/${t.id}`} className="flex-1 text-sm text-gray-700 hover:text-primary-600 truncate">
                      {t.title}
                    </Link>
                    <span className="text-xs text-gray-400 shrink-0">{getStatusLabel(t.status)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selectedBlocks.length === 0 && selectedTasks.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-2">当天没有任务或日程</p>
          )}
        </div>
      )}
    </div>
  );
}
