# Homepage Upgrade Design

## Goal

把 /dashboard-demo 升级为正式首页 /，但采用"融合保守型"方案：新版首页以 demo 的行动驾驶舱结构为主体，同时保留旧首页中有价值的快速入口。

## Scope

正式首页需要包含：

1. 顶部日期与状态栏
2. 快速操作条
   - 新建任务
   - 收藏链接
   - 快速记录
   - API 密钥入口
3. 当下焦点
4. 今日节奏
5. 今日习惯
6. 本周任务
7. 目标进度
8. 数据摘要

## Layout

桌面端：

左列：
1. 当下焦点
2. 今日节奏

右列：
1. 今日习惯
2. 本周任务
3. 目标进度
4. 数据摘要

顶部：
1. 日期状态栏
2. 快速操作条

移动端顺序：
1. 当下焦点
2. 快速操作条
3. 今日习惯
4. 今日节奏
5. 本周任务
6. 目标进度
7. 数据摘要

## Preserved Features From Old Homepage

保留旧首页中的这些能力：

1. quick-task：快速新建任务
2. quick-link：收藏链接
3. 快速记录入口：优先复用现有 QuickCapture，如不适合则先做跳转或占位
4. API 密钥入口：只做跳转按钮，不在首页展示任何 key 信息

不保留旧首页中的这些首页主体模块：

1. 旧统计卡片
2. 旧任务清单
3. 旧习惯列表
4. 旧日程卡
5. 旧 FocusTimer 大模块

这些内容已经由 /dashboard-demo 的新版模块取代。

## Data Flow

正式首页 loader 以 /dashboard-demo 的 loader 为基础，同时合并旧首页需要的 quick-task / quick-link 支撑数据。

正式首页 action 需要支持：

1. focus-complete
2. habit-toggle
3. task-toggle
4. quick-task
5. quick-link

API 密钥入口只跳转，不需要 action。

## Safety

1. 不在首页展示 API key 或任何敏感 key 内容。
2. /dashboard-demo 暂时保留，用于和正式首页对比。
3. _index.tsx 迁移时小步替换，不一次性删除所有旧逻辑。
4. 迁移完成后必须验证 / 和 /dashboard-demo 都可打开。
5. app/styles/app.css 中的 dashboard-demo-sidebar 后续如变成正式首页，可改名为 homepage-sidebar 或内联进正式首页样式。

## Known Risks

1. dashboard-demo.tsx 目前过大，正式迁移前应考虑抽组件。
2. HabitsCard 移动端双渲染方案（hidden md:block / md:hidden wrapper）在正式首页仍需保留，或用更干净的方式重构。
3. timeToMin 在 schedule.server.ts 和 dashboard-demo.tsx 各有一份，迁移时应统一到 client-safe 工具模块。
4. FocusTimer 使用 localStorage，跨 tab 不同步，正式首页可接受此限制，或后续升级为服务端状态。
5. AnalyticsCard 无日期范围限制，数据量大时 loader 会变慢，正式接入前需加 WHERE date >= X。

## Acceptance Criteria

1. / 使用新版首页结构。
2. /dashboard-demo 暂时仍可访问。
3. 旧首页核心快速入口没有丢失：新建任务、收藏链接、快速记录、API 密钥入口。
4. 桌面端保持两列结构。
5. 移动端顺序为：当下焦点、快速操作条、今日习惯、今日节奏、本周任务、目标进度、数据摘要。
6. 不展示任何 API key 明文。
7. 类型检查只允许保留既有老错误，不能新增 dashboard 相关错误。
8. 构建通过，或如果失败，需要明确区分既有错误和本轮新增错误。
