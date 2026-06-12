# Product UI System v1 — Implementation Plan

**Date:** 2026-06-12  
**Preceding docs:**
- Spec: `docs/superpowers/specs/2026-06-12-product-ui-system-v1-design.md`
- UI Preview Plan: `docs/superpowers/plans/2026-06-12-ui-preview.md`
- System Review: `docs/superpowers/previews/06-system-review.html`

**Status:** UI Preview 阶段全部验收通过，进入实现阶段规划

---

## UI Preview 阶段总结

| Preview | 文件 | 状态 | 关键验收点 |
|---|---|---|---|
| 1 · 首页 | `01-homepage.html` | ✅ 通过 | FocusCard 深绿渐变、双列布局、RhythmBar、习惯打卡 |
| 2 · 工作台 | `02-workspace.html` | ✅ 通过 | Free Studio 文档感、Slash 菜单（含轻量版 3 项）、中文标题层级 |
| 3 · 灵感收藏 | `03-inbox.html` | ✅ 通过 | 5 类卡片、快速收藏入口、转内容创意/引用到工作台流向 |
| 4 · 自媒体 | `04-creator.html` | ✅ 通过 | 选题库 + 制作流水线 + 内容日历 + 平台数据 + 复盘洞察 |
| 5 · 密钥账号 | `05-vault.html` | ✅ 通过 | 默认隐藏、显示/隐藏、复制、分类、安全提示横幅 |
| 6 · System Review | `06-system-review.html` | ✅ 通过 | Token 一览、一致性清单、IA 迁移决策、风险记录 |

### 已确认的核心决策

1. **Sidebar 6 项**：首页 / 工作台 / 任务 / 灵感收藏 / 自媒体 / 密钥账号
2. **笔记合并工作台**：/notes 路由保留兼容，不在 v1 删除；笔记即 Workspace 页面
3. **Inbox 是唯一收集入口**：工作台/首页/自媒体不自带原始收集功能
4. **信息流向单向**：Inbox → 工作台 → 任务 → 首页；Inbox → 自媒体（转选题）
5. **Vault 安全约束**：导出需二次确认 + 加密选项；显示态有倒计时提示
6. **视觉系统**：米白 `#F7F5F0` + 深绿 `#1A7A4A` + 琥珀 `#D4820A`，卡片 14px 圆角轻阴影无重边框

---

## 硬约束（Implementation 全程有效）

- 不修改现有已验收路由的**功能逻辑**（`_index.tsx`、`dashboard-demo.tsx`），只做视觉升级
- 不破坏任务/习惯/日程/目标已有的数据和功能
- 每个模块独立拆 PR，不做大爆炸式合并
- 每步完成后暂停验收，通过后再进下一步

---

## 实现优先级与分阶段规划

### Phase 1：首页视觉升级（最高优先，基础已最完整）

> 基于 dashboard-demo 的已验收结构，对齐 Preview 1 视觉系统。不改功能逻辑，只改样式。

**目标文件：** `app/routes/_index.tsx`（主要）

**改动范围：**
- `body` / 全局背景 → `#F7F5F0`
- Sidebar → 对齐新 6 项命名（首页/工作台/任务/灵感收藏/自媒体/密钥账号）
- FocusCard 当前时间块 → 深绿渐变背景 `linear-gradient(135deg, #1A7A4A, #1f9457)`
- 所有卡片 → `border-radius: 14px`，`box-shadow: 0 1px 3px rgba(0,0,0,0.05)`，去掉重边框
- QuickActionsBar 按钮 → 对齐新按钮规格（主色/次色/幽灵三档）
- HabitsCard → 宽度保持 288px（`.homepage-sidebar`），复选框 + 连续天数火焰样式
- WeekTasksCard / GoalsCard / AnalyticsCard → 轻卡片样式，留白加大

**验收标准：**
1. 首页背景 `#F7F5F0`，Sidebar 白底，FocusCard 深绿渐变
2. 所有卡片无重边框，阴影层级正确
3. `/dashboard-demo` 不受影响，仍正常渲染
4. Mobile 375px 无横向溢出

---

### Phase 2：Sidebar 导航命名统一

> 全局替换 Sidebar nav 项目名称和路由映射，一次性对齐 6 项架构。

**目标文件：** `app/components/Sidebar.tsx`

**改动范围：**
- 导航项 label 更新：笔记 → （在工作台内，不显示为顶级项）
- 确认路由映射：`/` 首页，`/workspace` 工作台，`/tasks` 任务，`/inbox`（新）灵感收藏，`/creator`（新）自媒体，`/vault` 或 `/api-keys` 密钥账号
- 图标更新对齐（可复用现有 Lucide icons）

**注意：** `/inbox` 和 `/creator` 路由此时可先指向占位页面，不需要功能完整

**验收标准：**
1. Sidebar 显示 6 项，命名正确
2. 所有现有路由的高亮状态正常
3. 新路由（inbox / creator）点击不报 404，显示空状态占位页

---

### Phase 3：工作台 Free Studio 重构

> 删除 Section 卡片逻辑，实现打开即写的文档编辑器体验。

**目标文件：** `app/routes/workspace._index.tsx`（及相关 loader/action）

**改动范围：**
- 布局：三列（App Sidebar 180px + 页面列表 220px + 编辑区 flex-1，max-width 680px）
- 编辑区：去掉 Section 卡片，改为纯文档区域（`contenteditable` 或受控 textarea）
  - 行高 1.85，字体舒适，大面积留白
  - `/` 触发 Slash 菜单浮层（静态展示 MVP 4 项 + 轻量版 3 项）
- 页面列表：从现有 Section 数据迁移或新建 `pages` 表
  - 字段：`id, title, content, createdAt, updatedAt`
  - 当前选中状态高亮
- 保留：从 Inbox「引用到工作台」的入口对接预留接口

**Schema 变更（如需新表）：**
```sql
CREATE TABLE pages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '无标题',
  content TEXT NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**验收标准：**
1. 打开工作台：左侧页面列表 + 右侧编辑区，无 Section 卡片
2. 新建页面：出现在列表，编辑区可输入，内容持久化
3. 输入 `/` 后出现 Slash 菜单浮层，点击 Todo 清单可插入 checkbox 块
4. Mobile：编辑区全宽，页面列表可折叠
5. 旧 /notes 路由访问不 500（兼容处理）

---

### Phase 4：灵感收藏 Inbox 新建

> 全新模块，从零建路由 + Schema + UI。

**目标文件：** `app/routes/inbox._index.tsx`（新建）

**Schema（新表）：**
```sql
CREATE TABLE inbox_items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('article','video','image','link','idea')),
  title TEXT NOT NULL,
  content TEXT,
  source_url TEXT,
  source_domain TEXT,
  cover_url TEXT,
  tags TEXT DEFAULT '[]',  -- JSON array
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','organized')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  organized_at DATETIME
);
```

**UI 要点：**
- 快速收藏栏：URL 输入 + 手动输入两种方式
- 卡片网格：2 列 Desktop / 1 列 Mobile
- 5 类型视觉差异：文章封面 / 视频播放角标 / 图片占位 / 链接色条 / 灵感引用文字
- 每卡操作：转内容创意（→ 自媒体）、引用到工作台（→ 工作台）、转任务
- 分类 pill 筛选 + 待整理 / 已整理分区

**验收标准：**
1. 可收藏一条 URL → 显示在 pending 列表
2. 可手动输入灵感文字 → 显示为灵感卡片
3. 4 种卡片类型视觉差异明显
4. 「已整理」分区折叠，不干扰主流

---

### Phase 5：密钥账号 Vault 升级

> 在现有 /api-keys 基础上升级，不新建路由（或加重定向）。

**目标文件：** `app/routes/api-keys._index.tsx`（升级）

**改动范围：**
- 路由重定向：`/vault` → `/api-keys`（或直接重命名路由文件）
- Sidebar 显示「密钥账号」，路由不变
- UI 升级：
  - 默认所有值用 `●●●●` 遮挡（前端状态控制，不改 DB）
  - 显示/隐藏 toggle，30 秒后自动重置为隐藏态（`setTimeout`，有倒计时 badge）
  - 一键复制按钮（`navigator.clipboard.writeText`）
  - 分类 pill 筛选（API Key / 账号密码 / 其他）
  - 搜索框（前端过滤）
  - 安全提示横幅（静态）
- Schema 新增字段（可选）：`type TEXT DEFAULT 'api-key'`，`category TEXT`

**安全约束（必须实现）：**
- 密钥值不在任何其他页面渲染
- 「导出至本地」功能（如实现）需要二次确认弹窗 + 加密选项

**验收标准：**
1. 默认所有值隐藏（●●●）
2. 点击「显示」→ 明文出现，同时出现 30s 倒计时 badge
3. 30s 后自动归隐藏态
4. 复制按钮可用，有「已复制 ✓」反馈
5. 搜索和分类筛选正常工作
6. /api-keys 旧入口不 404

---

### Phase 6：自媒体 Creator 新建

> 最复杂的新模块，分两个子阶段。

**Phase 6a：内容生产侧（选题库 + 日历）**

Schema：
```sql
CREATE TABLE creator_topics (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idea' CHECK(status IN ('idea','scripting','making','published')),
  platform TEXT DEFAULT 'xiaohongshu',
  tags TEXT DEFAULT '[]',
  pipeline_step INTEGER DEFAULT 1,
  publish_date DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

UI：选题卡片列表（带流水线进度条）+ 内容日历（周历或月历）

**Phase 6b：数据复盘侧（平台数据 mock）**

初期用静态 mock 数据展示右栏（播放/点赞/收藏/涨粉/完播率），预留平台 API 对接接口。

**验收标准（6a）：**
1. 可新建选题 → 显示在列表
2. 可更新状态（待制作→制作中→已发布）→ 列表状态 badge 变化
3. 内容日历显示本月，有发布日标记

**验收标准（6b）：**
1. 右栏数据可见，数字可识别
2. 明确标注「数据为示例，后续接入平台 API」

---

## 实现顺序推荐

```
Phase 1（首页视觉）
    ↓ 验收通过
Phase 2（Sidebar 命名）
    ↓ 验收通过
Phase 3（工作台 Free Studio）
    ↓ 验收通过
Phase 4（灵感收藏 Inbox）
    ↓ 验收通过
Phase 5（Vault 升级）
    ↓ 验收通过
Phase 6a（Creator 内容生产）
    ↓ 验收通过
Phase 6b（Creator 数据复盘）
```

Phase 1 + 2 可以合并一个 PR（都是纯样式/命名，不改逻辑）。  
Phase 3–6 每个独立 PR，粒度更小更安全。

---

## 待观察 / 后续增强（不在 v1 范围）

| 项目 | 说明 |
|---|---|
| Workspace Slash 菜单真实交互 | v1 做静态展示即可，v2 做真实 contenteditable 块操作 |
| Inbox URL 自动解析元信息 | v1 手动填 title，v2 对接 Open Graph 抓取 |
| Creator 平台 API 接入 | v1 用 mock，v2 对接小红书/抖音数据 API |
| Vault 导出加密 | v1 不实现导出功能，v2 时做带二次确认的加密导出 |
| 全局搜索（跨板块） | v2 功能，当前每个板块独立搜索 |
| 工作台与 Inbox 双向引用 | v1 单向（Inbox → 工作台），v2 实现反向引用 |
