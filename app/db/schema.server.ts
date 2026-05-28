import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ─── Tasks ───────────────────────────────────────────
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", { enum: ["todo", "in_progress", "done"] })
    .notNull()
    .default("todo"),
  priority: text("priority", { enum: ["low", "medium", "high", "urgent"] })
    .notNull()
    .default("medium"),
  dueDate: text("due_date"),
  goalId: text("goal_id").references(() => goals.id, { onDelete: "set null" }),
  parentId: text("parent_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── Goals ───────────────────────────────────────────
export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", { enum: ["active", "completed", "cancelled"] })
    .notNull()
    .default("active"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── Notes ───────────────────────────────────────────
export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content"),
  categoryId: text("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  type: text("type", { enum: ["note", "link"] }).notNull().default("note"),
  sourceUrl: text("source_url"),
  ogImage: text("og_image"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── Categories ──────────────────────────────────────
export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color"),
  icon: text("icon"),
  parentId: text("parent_id"),
  createdAt: text("created_at").notNull(),
});

// ─── Tags ────────────────────────────────────────────
export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color"),
});

// ─── Task-Tags (M:N) ─────────────────────────────────
export const taskTags = sqliteTable("task_tags", {
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  tagId: text("tag_id")
    .notNull()
    .references(() => tags.id, { onDelete: "cascade" }),
});

// ─── Note-Tags (M:N) ─────────────────────────────────
export const noteTags = sqliteTable("note_tags", {
  noteId: text("note_id")
    .notNull()
    .references(() => notes.id, { onDelete: "cascade" }),
  tagId: text("tag_id")
    .notNull()
    .references(() => tags.id, { onDelete: "cascade" }),
});

// ─── Note Links (Wiki bidirectional) ──────────────────
export const noteLinks = sqliteTable("note_links", {
  id: text("id").primaryKey(),
  sourceNoteId: text("source_note_id")
    .notNull()
    .references(() => notes.id, { onDelete: "cascade" }),
  targetNoteId: text("target_note_id")
    .notNull()
    .references(() => notes.id, { onDelete: "cascade" }),
  context: text("context"),
});

// ─── Analytics Accounts ────────────────────────────────
export const analyticsAccounts = sqliteTable("analytics_accounts", {
  id: text("id").primaryKey(),
  platform: text("platform").notNull(),
  accountName: text("account_name").notNull(),
  url: text("url"),
  createdAt: text("created_at").notNull(),
});

// ─── Analytics Metrics ─────────────────────────────────
export const analyticsMetrics = sqliteTable("analytics_metrics", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => analyticsAccounts.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  followers: integer("followers").default(0),
  views: integer("views").default(0),
  likes: integer("likes").default(0),
  comments: integer("comments").default(0),
  shares: integer("shares").default(0),
  posts: integer("posts").default(0),
  revenue: integer("revenue").default(0),
});

// ─── Habits ───────────────────────────────────────────
export const habits = sqliteTable("habits", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  frequency: text("frequency", { enum: ["daily", "weekly", "monthly"] })
    .notNull()
    .default("daily"),
  color: text("color"),
  icon: text("icon"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── Habit Logs ────────────────────────────────────────
export const habitLogs = sqliteTable("habit_logs", {
  id: text("id").primaryKey(),
  habitId: text("habit_id")
    .notNull()
    .references(() => habits.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(true),
  note: text("note"),
});

// ─── API Keys ──────────────────────────────────────────
export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  service: text("service").notNull(),
  key: text("key").notNull(),
  description: text("description"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
// ─── Schedule Blocks ──────────────────────────────────
export const scheduleBlocks = sqliteTable("schedule_blocks", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  color: text("color").notNull().default("#1A7A4A"),
  taskIds: text("task_ids"),
  blockType: text("block_type", {
    enum: ["focus", "break", "meal", "free", "routine"],
  }).notNull().default("focus"),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  templateName: text("template_name"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── Schedule Templates ───────────────────────────────
export const scheduleTemplates = sqliteTable("schedule_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: text("created_at").notNull(),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["task_due", "task_overdue", "goal_milestone", "system"] })
    .notNull(),
  title: text("title").notNull(),
  body: text("body"),
  link: text("link"),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});
