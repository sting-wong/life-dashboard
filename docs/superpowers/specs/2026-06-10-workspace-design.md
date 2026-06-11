# /workspace 自由工作台 — 第一版 Design

Date: 2026-06-10

---

## 1. Goal

提供一个自由编辑的工作台页面，用户可以新建多个内容区块，每个区块使用 TipTap 富文本编辑器自由书写。第一版聚焦"能用"：预填模板、自动保存、折叠管理。不联动任务数据库，不解析内容。

---

## 2. 数据模型

### 新表：`workspace_sections`

| 列 | 类型 | 说明 |
|---|---|---|
| id | text PRIMARY KEY | |
| title | text NOT NULL | 区块标题 |
| content | text NOT NULL DEFAULT '' | HTML 字符串（BlockEditor 输出） |
| template | text NOT NULL | `weekly-plan` / `content-ideas` / `blank` |
| sort_order | integer NOT NULL DEFAULT 0 | 预留字段，第一版不提供排序 UI |
| collapsed | integer NOT NULL DEFAULT 0 | 0=展开，1=折叠 |
| created_at | text NOT NULL | |
| updated_at | text NOT NULL | |

建表方式沿用项目惯例：`node -e` 直接执行 `ALTER TABLE` / `CREATE TABLE`，不用 drizzle-kit。

---

## 3. Sidebar 入口

文件：`app/components/Sidebar.tsx`

在「仪表盘」链接后、「任务」链接前，插入一个 `<NavLink>` 条目：

```
工作台  →  /workspace
```

最小增量：只插入该条目，不动其他现有条目，不覆盖 Sidebar 未提交的其他改动。

---

## 4. /workspace 页面结构

```
/workspace
├── 顶部栏
│   ├── 标题「自由工作台」
│   └── 「+ 新建区块」按钮
│       └── 下拉菜单（3 项，竖排）
│           ├── 本周计划
│           ├── 内容创意整理
│           └── 空白
│
└── 区块列表（按 created_at ASC）
    └── Section Card × N
        ├── 标题栏
        │   ├── 可编辑 title（inline input，失焦提交 rename-section）
        │   ├── 保存状态（「保存中…」灰色 / 「已保存」绿色）
        │   ├── 折叠/展开按钮（提交 toggle-collapse）
        │   └── 删除按钮（确认后提交 delete-section）
        └── 编辑区（collapsed=0 时显示）
            └── BlockEditor（content=section.content, onChange→防抖→update-content）
```

无区块时显示空状态：「还没有区块，点击新建开始」

---

## 5. 路由 loader / action

**文件：`app/routes/workspace._index.tsx`**

### loader

查询所有 workspace_sections，按 `created_at ASC` 排序返回。

### actions

| intent | 参数 | 说明 |
|---|---|---|
| `create-section` | template, title | 按模板初始化 content，插入新行 |
| `update-content` | id, content | 更新 content 字段（防抖后提交） |
| `rename-section` | id, title | 更新 title 字段 |
| `toggle-collapse` | id, collapsed | 更新 collapsed 字段（0↔1） |
| `delete-section` | id | 删除行 |

---

## 6. HTML 模板常量

模板作为 TypeScript 常量定义，类型为 `Record<string, string>`，在路由文件顶部声明。

### `weekly-plan`（本周计划）

```html
<h2>本周计划</h2>
<h3>本周最重要的 3 件事</h3>
<ul data-type="taskList">
  <li data-type="taskItem" data-checked="false"><div><p></p></div></li>
  <li data-type="taskItem" data-checked="false"><div><p></p></div></li>
  <li data-type="taskItem" data-checked="false"><div><p></p></div></li>
</ul>
<h3>本周学习 / 工作安排</h3><p></p>
<h3>需要专注完成的任务</h3>
<ul data-type="taskList">
  <li data-type="taskItem" data-checked="false"><div><p></p></div></li>
</ul>
<h3>本周复盘</h3><p></p>
```

### `content-ideas`（内容创意整理）

```html
<h2>内容创意整理</h2>
<h3>待选题</h3><ul><li><p></p></li></ul>
<h3>灵感来源</h3><p></p>
<h3>内容方向</h3><p></p>
<h3>进行中</h3>
<ul data-type="taskList">
  <li data-type="taskItem" data-checked="false"><div><p></p></div></li>
</ul>
<h3>复盘数据</h3><p></p>
```

### `blank`（空白）

```
""
```

---

## 7. BlockEditor 复用方式

- 直接使用现有 `app/components/BlockEditor.tsx`，不修改该组件
- props：`content: string`（HTML 字符串）、`onChange: (html: string) => void`
- TipTap 内部处理 HTML 解析和还原，包括 taskList checkbox 勾选状态（`data-checked` 属性）
- content 原样存入数据库，原样读出，不做任何中间处理

---

## 8. 1s 防抖自动保存与保存状态

### 机制

```
用户在 BlockEditor 里打字 / 勾选 checkbox
→ onChange 回调触发
→ 本地 state 更新，保存状态切换为「保存中…」
→ 清除上一个 setTimeout，重新计时 1000ms
→ 1s 内无新输入：useFetcher 提交 update-content（id, content）
→ fetcher.state 变为 idle：保存状态切换为「已保存」（3s 后消失）
```

### 保存状态显示

- 位置：Section Card 标题栏右侧，折叠/删除按钮左边
- `保存中…`：灰色小字（`text-xs text-gray-400`）
- `已保存`：绿色小字（`text-xs text-green-500`），3s 后自动消失
- 折叠时不显示保存状态

### 实现方式

每个 Section Card 内部用 `useRef` 持有 debounce timer，`useState` 持有 saveStatus（`idle` / `saving` / `saved`），`useFetcher` 提交 update-content。

---

## 9. 移动端设计（375px）

- 顶部栏：标题与「+ 新建区块」按钮横排，按钮保留文字
- 下拉菜单：全宽展开，三项竖排，触摸友好
- Section Card：全宽，标题栏三个操作按钮（保存状态、折叠、删除）横排不换行
- BlockEditor：全宽，`min-h` 不小于 150px
- 无水平滚动

---

## 10. 边界说明

- content 只是 HTML 字符串，不解析、不提取语义
- checkbox 勾选状态保存在 `data-checked` 属性里，随 HTML 整体存取
- 不修改 BlockEditor 组件
- 不联动 tasks 表，不从 content 提取任务
- sort_order 字段存在但第一版无排序 UI，无拖拽，无 reorder action
- 第一版不做跨区块搜索

---

## 11. 验收标准

### 功能验收

| # | 操作 | 预期结果 |
|---|---|---|
| 1 | 点「+ 新建区块」→「本周计划」 | 新 Card 出现，标题「本周计划」，编辑区预填模板内容（含 4 个小节和 taskList） |
| 2 | 点「+ 新建区块」→「内容创意整理」 | 新 Card 出现，标题「内容创意整理」，预填 5 个小节 |
| 3 | 点「+ 新建区块」→「空白」 | 新 Card 出现，标题「空白」，编辑区为空 |
| 4 | 在 BlockEditor 里打字 | 刷新页面后内容保留 |
| 5 | 勾选 checklist 里的 checkbox | 刷新页面后勾选状态保留 |
| 6 | 点折叠按钮 | 编辑区隐藏，再点展开恢复 |
| 7 | 点击标题进行修改，失焦 | 新标题保留，刷新后不回退 |
| 8 | 删除区块（确认） | Card 消失，刷新后不复现 |

### 边界验收

| # | 场景 | 预期结果 |
|---|---|---|
| 9 | 无区块时打开 /workspace | 显示空状态提示「还没有区块，点击新建开始」 |
| 10 | 打开 /dashboard-demo | 不受影响，正常渲染 |
| 11 | Sidebar 其他链接 | 不受影响，点击跳转正常 |

### 防抖保存验收

| # | 操作 | 预期结果 |
|---|---|---|
| 12 | 快速连续打字 | 标题栏出现「保存中…」，停止输入 1s 后才提交一次（Network 面板可确认） |
| 13 | 停止输入 1s 后 | 「保存中…」变为「已保存」绿色提示 |
| 14 | 勾选 checkbox 后 1s | 勾选状态持久化，「已保存」出现 |

### 移动端验收

| # | 场景 | 预期结果 |
|---|---|---|
| 15 | 375px 宽度打开 /workspace | 无横向溢出，布局正常 |
| 16 | 375px 宽度新建区块 | 下拉菜单可点击，三项可见，操作正常 |
