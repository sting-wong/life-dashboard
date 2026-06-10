# Implementation Plan：Homepage Upgrade

关联设计文档：`docs/superpowers/specs/2026-06-10-homepage-upgrade-design.md`

---

## Agentic Workers Required

本 Plan 采用 **Inline Execution**（单 agent 顺序执行），无需 sub-agent 并行。原因：各 Task 存在顺序依赖（Task 3 CSS 类准备好后 Task 4 才能使用；Task 5 依赖 Task 4 的实现结果），且单文件替换不适合拆分并发写入。

所需 sub-skill：
- File read/edit（`_index.tsx`、`app.css`）
- Bash（`grep`、`git diff`、`npm run build`、`npx tsc --noEmit`）
- Browser DevTools（Task 4 宽度验证）

---

## 文件变更总览

| 文件 | 操作 | 说明 |
|------|------|------|
| `app/routes/_index.tsx` | 替换 | 用新版结构覆盖，保留 quick-task / quick-link action |
| `app/routes/dashboard-demo.tsx` | **保留不动** | 继续可访问，用于对比，全程不修改 |
| `app/lib/schedule.server.ts` | 保留不动 | 已有，继续复用 |
| `app/lib/habits.server.ts` | 保留不动 | 已有，继续复用 |
| `app/styles/app.css` | 小改 | 新增 `.homepage-sidebar`，与 `.dashboard-demo-sidebar` 共享同一套规则，旧类保留 |

---

## Task 清单

---

### Task 1：迁移 loader

**目标：** 把 `_index.tsx` 的 loader 替换为以 demo loader 为基础的新版，同时保留 quick-task / quick-link 所需写入能力。

**Steps：**
- [ ] 删除旧 loader 中的 `pendingTasks`（旧全列表）、`activeGoals`（旧格式）、`analyticsData`（单账号）、`todaySchedule`、`isNewUser` 等旧专用字段
- [ ] 从 `~/lib/schedule.server` 引入 `getCurrentBlock` / `getNextBlock` / `getVisibleBlocks`（只在 loader 内调用）
- [ ] 从 `~/lib/habits.server` 引入 `calcStreak`（只在 loader 内调用）
- [ ] 从 demo loader 移植：`visibleBlocks`、`habitsWithStatus`、`weekTaskGroups`、`goalsWithProgress`、`analyticsSummary` 的计算逻辑
- [ ] today 日期计算改为 timezone-safe 本地分量写法（不用 `toISOString().split("T")[0]`）
- [ ] quick-task / quick-link 的写入在 action 里，loader 无需额外查询，不引入多余的表

**验收：**
- [ ] `npm run build` 通过，或明确区分既有错误与新增错误
- [ ] `npx tsc --noEmit` 无新增 dashboard 相关错误
- [ ] `git diff app/routes/dashboard-demo.tsx` 输出为空

---

### Task 2：迁移 action

**目标：** 把 `_index.tsx` 的 action 替换为同时支持新版（focus-complete / habit-toggle / task-toggle）和旧版（quick-task / quick-link）的合并版本。

**Steps：**
- [ ] 确认旧 `_index.tsx` 里无其他地方发出 `complete-task` intent（搜索确认后再删除）
- [ ] 删除旧 `complete-task` intent handler（由 `task-toggle` 取代）
- [ ] 保留旧 `quick-task` 逻辑逐字复用（写入 tasks 表）
- [ ] 保留旧 `quick-link` 逻辑逐字复用（写入 notes 表，含 `type: "link"` 字段）
- [ ] 从 demo action 移植 `focus-complete`、`habit-toggle`、`task-toggle`
- [ ] action 末尾统一 `return redirect("/")`，`quick-link` 保持 `return json({ ok: true })`

**验收：**
- [ ] `npm run build` 通过
- [ ] `git diff app/routes/dashboard-demo.tsx` 输出为空

---

### Task 3：准备 CSS 类

**目标：** 在 `app/styles/app.css` 中新增 `.homepage-sidebar`，与现有 `.dashboard-demo-sidebar` 共享同一套规则，旧类保留。

**Steps：**
- [ ] 将 `app/styles/app.css` 中原有的 `.dashboard-demo-sidebar` 规则块替换为双类名合并版本：

```css
.dashboard-demo-sidebar,
.homepage-sidebar {
  width: 100%;
}

@media (min-width: 768px) {
  .dashboard-demo-sidebar,
  .homepage-sidebar {
    flex: 0 0 18rem;
    max-width: 18rem;
  }
}
```

**验收：**
- [ ] `grep "homepage-sidebar" app/styles/app.css` 有结果
- [ ] `grep "dashboard-demo-sidebar" app/styles/app.css` 有结果（旧类未被删除）
- [ ] `git diff app/routes/dashboard-demo.tsx` 输出为空

---

### Task 4：替换页面结构（顶部区域 + 主内容两列）

**目标：** 把 `_index.tsx` 的 `export default` 主体完整替换为新版布局，包含顶部状态栏、快速操作条、两列主内容区。

**Steps：**

顶部区域：
- [ ] 移植 demo 的 `StatusBar` 组件（3 态：工作中 / 休息中 / 空闲）
- [ ] 新增 `QuickActionsBar` 组件，4 个入口：
  - 新建任务：`<Link to="/tasks/new">` + `btn-primary` 样式
  - 收藏链接：从旧 `_index.tsx` 搬移 `QuickLinkSave` 组件，`fetcher.submit` action 路径指向 `/`
  - 快速记录：`<Link to="/notes/new">` 跳转，不展开任何内联面板
  - API 密钥：`<Link to="/api-keys">` 跳转，不查询 api_keys 表，不传任何 key 数据到页面

主内容区：
- [ ] 左列容器：`flex-1`，包含 `FocusCard`、`RhythmBar`
- [ ] 右列容器：使用 `.homepage-sidebar` 类（Task 3 已准备）
- [ ] 右列桌面端内容：`HabitsCard`（`hidden md:block` wrapper）、`WeekTasksCard`、`GoalsCard`、`AnalyticsCard`

移动端双渲染：
- [ ] `QuickActionsBar`：桌面端在顶部正常渲染；移动端在 FocusCard 之后用 `<div className="md:hidden">` wrapper 插入
- [ ] `HabitsCard`：移动端用 `<div className="md:hidden">` wrapper 插入左列 RhythmBar 之前；桌面端用 `<div className="hidden md:block">` wrapper 在右列顶部
- [ ] 两者均不通过 className prop 传入组件内部

删除旧首页不保留部分：
- [ ] 删除 `StatCard` 组件及 `isNewUser` 引导区块
- [ ] 删除 `TaskRow` 组件及旧任务列表卡
- [ ] 删除 `TodayScheduleCard` 组件及旧日程卡
- [ ] 删除 `FocusTimer` 大模块引入
- [ ] 删除 localStorage 今日状态标题逻辑

**验收（必须提供具体证据）：**
- [ ] 1280px：DevTools Computed tab 量右列实际宽度 = 288px（18rem）
- [ ] 375px：确认 DOM 顺序为：当下焦点 → 快速操作条 → 今日习惯 → 今日节奏 → 本周任务 → 目标进度 → 数据摘要
- [ ] 点击"API 密钥"只跳转 `/api-keys`，页面源码中无任何 key 字符串
- [ ] `git diff app/routes/dashboard-demo.tsx` 输出为空

---

### Task 5：client-safe timeToMin 与 server 边界确认

**目标：** 确认客户端组件使用的 `timeToMin` 是 `_index.tsx` 本地定义的 client-safe 函数；`schedule.server.ts` 只允许被 loader 使用。

**Steps：**
- [ ] 确认 `_index.tsx` import 列表中，`~/lib/schedule.server` 只引入了 `getCurrentBlock` / `getNextBlock` / `getVisibleBlocks`，没有引入 `timeToMin`
- [ ] 确认 `_index.tsx` 顶层有本地定义的 `timeToMin`：
  ```ts
  function timeToMin(t: string): number {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }
  ```
- [ ] 确认 `getCurrentBlock` / `getNextBlock` / `getVisibleBlocks` 只在 `loader` 函数体内被调用，不在任何 React 组件内调用

**验收：**
- [ ] `grep "timeToMin" app/routes/_index.tsx` 结果只在本地函数定义处，不在 import 行
- [ ] `grep "from.*schedule.server" app/routes/_index.tsx` 结果只含 `getCurrentBlock` / `getNextBlock` / `getVisibleBlocks`，无 `timeToMin`
- [ ] `npm run build` 通过

---

### Task 6：类型检查 + 构建 + 双页验收

**目标：** 确认整轮改动无新增错误，新旧两个首页都可正常访问。

**Steps：**
- [ ] 运行 `npx tsc --noEmit`，记录完整输出
- [ ] 运行 `npm run build`，记录关键行（模块数、bundle 大小、耗时）
- [ ] 运行 `git diff --name-only`，确认变更文件范围
- [ ] 运行 `git diff app/routes/dashboard-demo.tsx`，确认为空
- [ ] 启动 dev server，浏览器打开 `/` 确认新版结构
- [ ] 浏览器打开 `/dashboard-demo` 确认布局未被破坏

**验收（全部必须给出具体证据）：**
- [ ] tsc：输出与基线一致，老错误仍是 2 个（d3-force 类型、vite.config flag），无新增
- [ ] build：输出含 `✓ built in X.XXs`
- [ ] `git diff --name-only`：只含 `app/routes/_index.tsx`、`app/styles/app.css`
- [ ] `git diff app/routes/dashboard-demo.tsx`：空输出
- [ ] `/` 可打开，显示新版结构（顶部状态栏 + 快速操作条 + 两列主内容）
- [ ] `/dashboard-demo` 可打开，右栏宽度仍为 18rem

---

## 特别注意事项

| 风险点 | 对应 Task | 处理方式 |
|--------|-----------|----------|
| `dashboard-demo.tsx` 全程不动 | 全部 | 每个 task 结束都运行 `git diff app/routes/dashboard-demo.tsx` |
| API key 绝对不展示明文 | Task 4 | 只做跳转按钮，不查 api_keys 表，不传任何 key 数据 |
| CSS 类新增不删旧类 | Task 3 | `.dashboard-demo-sidebar` 必须保留，grep 验证 |
| Tailwind 样式不生效 | Task 4 | 先用 DevTools Computed tab 量实际宽度，不猜类名 |
| `timeToMin` 不能从 `.server.ts` 引入到组件 | Task 5 | 本地定义 client-safe 版本；server 函数只在 loader 内调用 |
| 移动端顺序靠双渲染实现 | Task 4 | `QuickActionsBar` 也需要两个 wrapper，不能只靠 CSS order |
| 旧 `complete-task` intent 删除 | Task 2 | 先 grep 确认无其他引用，再删除 |

---

## 执行方式

**Inline Execution**（本 session 顺序执行，每 task 完成后暂停等待用户验收）。

各 task 存在顺序依赖，不适合 Subagent-Driven 并发：
- Task 3 必须在 Task 4 之前（CSS 类先准备好）
- Task 5 依赖 Task 4 的实现结果
- Task 6 依赖所有前序 task 完成
