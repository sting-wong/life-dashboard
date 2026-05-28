import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { db, sqlite } from "./index.server";
import * as s from "./schema.server";
import { syncNoteLinks } from "../lib/sync-links.server";
import { syncNoteTags } from "../lib/sync-tags.server";

console.log("🌱 Seeding database...");

// Create tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    icon TEXT,
    parent_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    start_date TEXT,
    end_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT NOT NULL DEFAULT 'medium',
    due_date TEXT,
    goal_id TEXT REFERENCES goals(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    category_id TEXT REFERENCES categories(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT
  );
  CREATE TABLE IF NOT EXISTS task_tags (
    task_id TEXT NOT NULL REFERENCES tasks(id),
    tag_id TEXT NOT NULL REFERENCES tags(id)
  );
  CREATE TABLE IF NOT EXISTS note_tags (
    note_id TEXT NOT NULL REFERENCES notes(id),
    tag_id TEXT NOT NULL REFERENCES tags(id)
  );
  CREATE TABLE IF NOT EXISTS note_links (
    id TEXT PRIMARY KEY,
    source_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    target_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    context TEXT
  );
  CREATE TABLE IF NOT EXISTS analytics_accounts (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    account_name TEXT NOT NULL,
    url TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS analytics_metrics (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES analytics_accounts(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    followers INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    posts INTEGER DEFAULT 0,
    revenue INTEGER DEFAULT 0
  );
`);

const now = new Date().toISOString();

// Seed categories
const catLearning = uuid();
const catWork = uuid();
const catPersonal = uuid();

db.insert(s.categories).values([
  { id: catLearning, name: "学习", color: "#3b82f6", icon: "book", parentId: null, createdAt: now },
  { id: catWork, name: "工作", color: "#ef4444", icon: "briefcase", parentId: null, createdAt: now },
  { id: catPersonal, name: "个人", color: "#10b981", icon: "user", parentId: null, createdAt: now },
]).run();

// Seed goals
const goal1 = uuid();
db.insert(s.goals).values([
  {
    id: goal1,
    title: "学习 React 生态系统",
    description: "深入学习 React、Remix 和现代前端技术栈",
    status: "active",
    startDate: now,
    endDate: new Date(Date.now() + 90 * 86400000).toISOString(),
    createdAt: now,
    updatedAt: now,
  },
]).run();

// Seed tasks
db.insert(s.tasks).values([
  {
    id: uuid(),
    title: "完成 Remix 项目搭建",
    description: "搭建个人任务管理系统",
    status: "todo",
    priority: "high",
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
    goalId: goal1,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: uuid(),
    title: "阅读 Tailwind 文档",
    description: "熟悉 Tailwind CSS 的用法",
    status: "in_progress",
    priority: "medium",
    dueDate: null,
    goalId: goal1,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: uuid(),
    title: "整理读书笔记",
    description: "把近期的读书笔记整理到系统中",
    status: "todo",
    priority: "low",
    dueDate: null,
    goalId: null,
    createdAt: now,
    updatedAt: now,
  },
]).run();

// Seed notes
const noteId1 = uuid();
const noteId2 = uuid();
const noteId3 = uuid();

db.insert(s.notes).values([
  {
    id: noteId1,
    title: "React 入门笔记",
    content: "<h2>React 入门</h2><p>核心概念：组件化、声明式 UI、单向数据流。详见 [[Remix 路由系统]]</p><h3>Hooks</h3><ul><li>useState</li><li>useEffect</li><li>useCallback</li></ul><p>#前端 #react</p>",
    categoryId: catLearning,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: noteId2,
    title: "Remix 路由系统",
    content: "<h2>Remix 路由</h2><p>Remix 使用文件系统路由，约定优于配置。参考 [[React 入门笔记]] 了解基础概念。</p><ul><li><code>_index.tsx</code> → <code>/</code></li><li><code>tasks._index.tsx</code> → <code>/tasks</code></li><li><code>tasks.$id.tsx</code> → <code>/tasks/:id</code></li></ul><p>#前端 #remix</p>",
    categoryId: catLearning,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: noteId3,
    title: "Tailwind CSS 使用技巧",
    content: "<h2>Tailwind CSS</h2><p>实用工具类优先的 CSS 框架。与 [[React 入门笔记]] 中的组件化思想配合使用效果很好。</p><h3>常用类</h3><ul><li><code>flex</code> / <code>grid</code> - 布局</li><li><code>p-*</code> / <code>m-*</code> - 间距</li><li><code>text-*</code> / <code>bg-*</code> - 颜色</li></ul><p>#前端 #css #tailwind</p>",
    categoryId: catLearning,
    createdAt: now,
    updatedAt: now,
  },
]).run();

// Seed tags (before sync so no conflicts)
db.insert(s.tags).values([
  { id: uuid(), name: "重要", color: "#ef4444" },
  { id: uuid(), name: "读书", color: "#8b5cf6" },
]).run();

// Sync wiki links and tags for seed notes
syncNoteLinks(noteId1, db.select({ content: s.notes.content }).from(s.notes).where(eq(s.notes.id, noteId1)).get()?.content || "");
syncNoteLinks(noteId2, db.select({ content: s.notes.content }).from(s.notes).where(eq(s.notes.id, noteId2)).get()?.content || "");
syncNoteLinks(noteId3, db.select({ content: s.notes.content }).from(s.notes).where(eq(s.notes.id, noteId3)).get()?.content || "");
syncNoteTags(noteId1, db.select({ content: s.notes.content }).from(s.notes).where(eq(s.notes.id, noteId1)).get()?.content || "");
syncNoteTags(noteId2, db.select({ content: s.notes.content }).from(s.notes).where(eq(s.notes.id, noteId2)).get()?.content || "");
syncNoteTags(noteId3, db.select({ content: s.notes.content }).from(s.notes).where(eq(s.notes.id, noteId3)).get()?.content || "");

// Seed analytics account
const analyticsAccountId = uuid();
db.insert(s.analyticsAccounts).values([
  {
    id: analyticsAccountId,
    platform: "小红书",
    accountName: "我的日常分享",
    url: "https://www.xiaohongshu.com",
    createdAt: now,
  },
]).run();

const daysAgo = (n: number) => {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString().split("T")[0];
};

// Seed analytics metrics (last 7 days)
db.insert(s.analyticsMetrics).values([
  { id: uuid(), accountId: analyticsAccountId, date: daysAgo(6), followers: 1200, views: 3500, likes: 280, comments: 45, shares: 20, posts: 2, revenue: 0 },
  { id: uuid(), accountId: analyticsAccountId, date: daysAgo(5), followers: 1250, views: 4200, likes: 310, comments: 52, shares: 25, posts: 1, revenue: 0 },
  { id: uuid(), accountId: analyticsAccountId, date: daysAgo(4), followers: 1300, views: 3800, likes: 295, comments: 48, shares: 22, posts: 3, revenue: 50 },
  { id: uuid(), accountId: analyticsAccountId, date: daysAgo(3), followers: 1380, views: 5100, likes: 420, comments: 68, shares: 35, posts: 2, revenue: 0 },
  { id: uuid(), accountId: analyticsAccountId, date: daysAgo(2), followers: 1420, views: 4800, likes: 380, comments: 55, shares: 30, posts: 1, revenue: 120 },
  { id: uuid(), accountId: analyticsAccountId, date: daysAgo(1), followers: 1480, views: 5600, likes: 450, comments: 72, shares: 40, posts: 2, revenue: 0 },
  { id: uuid(), accountId: analyticsAccountId, date: daysAgo(0), followers: 1520, views: 6200, likes: 510, comments: 85, shares: 48, posts: 1, revenue: 200 },
]).run();

console.log("✅ Seed complete!");
sqlite.close();
