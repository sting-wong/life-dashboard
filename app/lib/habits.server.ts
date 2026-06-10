type LogEntry = { date: string };

/**
 * 从 today 往前数连续打卡天数。
 * today 格式：YYYY-MM-DD
 * logs 只需包含该习惯的打卡记录（已按习惯过滤）。
 */
export function calcStreak(logs: LogEntry[], today: string): number {
  if (!logs.length) return 0;

  const dateSet = new Set(logs.map((l) => l.date.slice(0, 10)));
  let streak = 0;
  const cursor = new Date(today + "T12:00:00");

  while (dateSet.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}
