export function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

type Block = { startTime: string; endTime: string; [key: string]: any };

/** 当前正在进行的块：startTime ≤ nowMin < endTime */
export function getCurrentBlock(blocks: Block[], nowMin: number): Block | null {
  return blocks.find(
    (b) => timeToMin(b.startTime) <= nowMin && nowMin < timeToMin(b.endTime)
  ) ?? null;
}

/** 下一个即将开始的块：最近一个 startTime > nowMin */
export function getNextBlock(blocks: Block[], nowMin: number): Block | null {
  const upcoming = blocks.filter((b) => timeToMin(b.startTime) > nowMin);
  if (!upcoming.length) return null;
  return upcoming.reduce((a, b) =>
    timeToMin(a.startTime) < timeToMin(b.startTime) ? a : b
  );
}

/**
 * 今日节奏截断：当前块前后各 window 个。
 * 如果没有当前块，以下一个块为基准。
 * 总块数 ≤ window*2+1 时全部返回。
 */
export function getVisibleBlocks(
  blocks: Block[],
  nowMin: number,
  window = 3
): Block[] {
  const sorted = [...blocks].sort((a, b) =>
    timeToMin(a.startTime) - timeToMin(b.startTime)
  );

  if (sorted.length <= window * 2 + 1) return sorted;

  // 找锚点索引：优先当前块，其次下一个块，都没有则最后一块
  let anchorIdx = sorted.findIndex(
    (b) => timeToMin(b.startTime) <= nowMin && nowMin < timeToMin(b.endTime)
  );
  if (anchorIdx === -1) {
    anchorIdx = sorted.findIndex((b) => timeToMin(b.startTime) > nowMin);
  }
  if (anchorIdx === -1) anchorIdx = sorted.length - 1;

  const start = Math.max(0, anchorIdx - window);
  const end = Math.min(sorted.length, anchorIdx + window + 1);
  return sorted.slice(start, end);
}
