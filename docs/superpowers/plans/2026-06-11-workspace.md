# Plan: /workspace 自由工作台 — 第一版

**Date:** 2026-06-11  
**Spec:** [docs/superpowers/specs/2026-06-10-workspace-design.md](../specs/2026-06-10-workspace-design.md)  
**Execution:** Inline，每个 Task 完成后暂停验收，确认通过再进下一个

---

## Goal

新增 `/workspace` 自由工作台页面：用户可新建多个富文本区块，选择预设模板（本周计划 / 内容创意整理 / 空白），内容以 HTML 字符串存储，1s 防抖自动保存，支持折叠/重命名/删除。

---

## Architecture

- 新路由：`app/routes/workspace._index.tsx`
- 新表：`workspace_sections`（SQLite，通过 `node -e` 建表 + Drizzle schema export）
- 复用：`app/components/BlockEditor.tsx`（不修改）
- Sidebar：`app/components/Sidebar.tsx` 插入一条导航项

---

## Tech Stack

- Remix（loader / action / useFetcher）
- Drizzle ORM（sqlite-core）
- TipTap（via 现有 BlockEditor 组件）
- Tailwind CSS
- React `useState` / `useRef`（防抖 timer）

---

## Agentic Workers

无需子 agent，Inline 顺序执行。

---

## 文件变更总览

| 文件 | 操作 |
|---|---|
| `app/db/schema.server.ts` | 新增 `workspaceSections` export |
| `app/db/data.db` | 新建 `workspace_sections` 表（node -e） |
| `app/routes/workspace._index.tsx` | 新建，完整路由 |
| `app/components/Sidebar.tsx` | 插入「工作台」导航条目 |

不改动：`app/routes/_index.tsx`、`app/routes/dashboard-demo.tsx`、`app/components/BlockEditor.tsx`

---

## Tasks

---

### Task 1：建表 + Schema export

**修改文件：**
- `app/db/schema.server.ts`
- `app/db/data.db`（node -e 执行）

**Steps：**

- [ ] 在 `app/db/schema.server.ts` 末尾新增：
  ```ts
  export const workspaceSections = sqliteTable("workspace_sections", {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    template: text("template").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    collapsed: integer("collapsed").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  });
  ```

- [ ] 用 node -e 建表：
  ```bash
  node -e "
  const Database = require('better-sqlite3');
  const db = new Database('app/db/data.db');
  db.exec(\`
    CREATE TABLE IF NOT EXISTS workspace_sections (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      template TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      collapsed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  \`);
  console.log('done');
  "
  ```

**验收：**

1. SQLite 表存在：
```bash
node -e "
const Database = require('better-sqlite3');
const db = new Database('app/db/data.db');
console.log(db.prepare('SELECT * FROM workspace_sections').all());
"
```
预期：输出 `[]`，不报错。

2. Schema export 无类型错误：
```bash
npx tsc --noEmit 2>&1 | grep -i workspace
```
预期：无输出（无 workspaceSections 相关错误）。整体 tsc 只剩既有两个老错误。

---

### Task 2：路由骨架（loader + create-section）

**修改文件：**
- `app/routes/workspace._index.tsx`（新建）

**Steps：**

- [ ] 创建路由文件，包含：
  - 顶部模板常量 `TEMPLATES: Record<string, string>`（weekly-plan / content-ideas / blank HTML 字符串，见 Spec）
  - loader：`db.select().from(workspaceSections).orderBy(asc(workspaceSections.createdAt))`
  - action：处理 `create-section` intent（生成 id、取模板 content、insert，成功后 `redirect("/workspace")`）；其余 intent 返回 `json({ ok: false, error: "Unsupported intent" }, { status: 400 })`
  - UI：页面标题「自由工作台」+ 新建按钮（3 项下拉） + sections 列表（仅显示每个 section 的 title，无 BlockEditor）+ 空状态提示

**验收：**
- 访问 `/workspace` 返回 200，无报错
- 点「本周计划」→ 页面刷新，列表出现该条目标题
- 点「空白」→ 出现标题「空白」
- Network 面板：loader 返回数组，create-section POST 成功

---

### Task 3：Sidebar 插入「工作台」

**修改文件：**
- `app/components/Sidebar.tsx`

**Steps：**

- [ ] 在 `mainItems` 数组中，`{ to: "/", ... 仪表盘 }` 后、`{ to: "/tasks", ... 任务 }` 前，插入：
  ```ts
  { to: "/workspace", icon: LayoutGrid, label: "工作台" },
  ```
- [ ] 在文件顶部 import 中补充 `LayoutGrid`（来自 `lucide-react`，与其他 icon 同一行）
- [ ] 不改动 `mainItems` 其他条目，不格式化文件

**验收命令：**
```bash
git diff app/components/Sidebar.tsx
```

**预期结果：**
- diff 只显示新增 1 行 icon import + 1 行 `mainItems` 条目，无其他改动
- Sidebar 显示「工作台」，点击跳转 `/workspace`
- 其他导航项（仪表盘、任务、笔记等）点击正常

---

### Task 4：Section Card UI（折叠 / 重命名 / 删除 + BlockEditor 展示）

**修改文件：**
- `app/routes/workspace._index.tsx`

**Steps：**

- [ ] 补全 action 中 `rename-section`、`toggle-collapse`、`delete-section` 三个 intent
- [ ] 将 sections 列表从"仅标题"改为完整 Section Card：
  - 标题栏：inline `<input>` 编辑 title，失焦提交 `rename-section`
  - 折叠/展开按钮：提交 `toggle-collapse`
  - 删除按钮：`window.confirm` 确认后提交 `delete-section`
  - 编辑区（`collapsed === 0`）：`<BlockEditor content={section.content} onChange={() => {}} editable />`（onChange 暂为空函数，此阶段 BlockEditor 只读展示模板内容，内容保存在 Task 5 实现）

**验收（Task 4 不验收内容保存）：**
- 新建「本周计划」→ Card 出现，BlockEditor 展示预填 4 个小节内容
- 新建「内容创意整理」→ BlockEditor 展示预填 5 个小节内容
- 新建「空白」→ 编辑区为空
- 点折叠 → 编辑区隐藏，再点展开恢复
- 修改标题失焦 → 刷新后保留新标题
- 删除 → 刷新后消失
- **不要求**：编辑后刷新内容保留（该项在 Task 5 验收）

---

### Task 5：防抖保存 + 保存状态

**修改文件：**
- `app/routes/workspace._index.tsx`

**Steps：**

- [ ] 补全 action 中 `update-content` intent（update content + updated_at by id）
- [ ] Section Card 内：
  - `const fetcher = useFetcher()`
  - `const [saveStatus, setSaveStatus] = useState<'idle'|'saving'|'saved'>('idle')`
  - `const timerRef = useRef<ReturnType<typeof setTimeout>>()`
  - onChange 回调：`setSaveStatus('saving')` → clearTimeout → setTimeout 1000ms → `fetcher.submit({intent:'update-content', id, content})`
  - `useEffect` 监听 `fetcher.state === 'idle' && saveStatus === 'saving'` → `setSaveStatus('saved')` → setTimeout 3000ms → `setSaveStatus('idle')`
- [ ] 标题栏保存状态文字：`saving` → `保存中…`（灰色）；`saved` → `已保存`（绿色）；`idle` → 不显示

**验收：**
- 快速连续打字：Network 面板在停止输入 1s 后出现一次 `update-content` POST，期间无多余请求
- 1s 后标题栏出现「已保存」绿色小字
- 勾选 checkbox → 1s 后保存，刷新后勾选状态保留
- 刷新页面：内容完整还原

---

### Task 6：移动端适配

**修改文件：**
- `app/routes/workspace._index.tsx`

**Steps：**

- [ ] 顶部栏：`flex justify-between items-center`，按钮在小屏不换行
- [ ] 下拉菜单：`w-full` 或 `min-w-[160px]`，触摸区域足够
- [ ] Section Card 标题栏：`flex items-center gap-2 flex-wrap` → 确认小屏不溢出
- [ ] BlockEditor 容器：`min-h-[150px]`，宽度 `w-full`
- [ ] 整体容器：`max-w-3xl mx-auto px-4`，无固定宽度导致溢出

**验收（DevTools 375px）：**
- 无横向滚动条（`document.documentElement.scrollWidth === 375`）
- 下拉菜单三项可见，可点击
- 标题栏操作按钮（保存状态、折叠、删除）不重叠不溢出

---

### Task 7：回归验收

**Steps：**

- [ ] TypeScript 检查：
  ```bash
  npx tsc --noEmit 2>&1 | tail -20
  ```
  预期：只有既有两个老错误（d3-force 类型 + vite.config flag），无新增错误

- [ ] 构建：
  ```bash
  npm run build 2>&1 | tail -10
  ```
  预期：build 成功，无新增 error

- [ ] 确认未改动核心路由：
  ```bash
  git diff app/routes/_index.tsx
  git diff app/routes/dashboard-demo.tsx
  ```
  预期：两个文件 diff 为空

- [ ] 启动开发服务器，依次打开：
  - `/` → 首页正常渲染
  - `/workspace` → 工作台可用，CRUD 正常
  - `/dashboard-demo` → 正常渲染，无报错

- [ ] 375px 下打开 `/workspace`：
  - 无横向溢出
  - 新建区块可操作
  - 验收标准 1–16 全部通过

---

## 执行方式

**Inline Execution**：按 Task 1 → 2 → 3 → 4 → 5 → 6 → 7 顺序执行，每个 Task 完成后暂停，等待用户验收确认通过，再进入下一个 Task。
