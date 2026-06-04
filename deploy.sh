#!/bin/bash
set -e

echo "=== Life Dashboard 一键部署脚本 ==="

# ── 1. 安装系统依赖 ───────────────────────────────────────
echo "[1/6] 安装系统依赖..."
apt-get update -qq
apt-get install -y -qq build-essential python3 curl git

# ── 2. 安装 Node.js（如果没有）────────────────────────────
if ! command -v node &>/dev/null; then
  echo "[2/6] 安装 Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
else
  echo "[2/6] Node.js 已安装: $(node -v)"
fi

# ── 3. 安装 PM2（如果没有）────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  echo "[3/6] 安装 PM2..."
  npm install -g pm2 -q
else
  echo "[3/6] PM2 已安装"
fi

# ── 4. 拉取最新代码 ───────────────────────────────────────
echo "[4/6] 拉取最新代码..."
cd /root/life-dashboard
git pull origin main

# ── 5. 安装依赖 & 构建 ────────────────────────────────────
echo "[5/6] 安装依赖 & 构建..."
npm install
npm run build

# ── 6. 初始化数据库（幂等，可重复运行）───────────────────
echo "[6/6] 初始化数据库..."
node -e "
const Database = require('better-sqlite3');
const db = new Database('app/db/data.db');

db.exec(\`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT NOT NULL DEFAULT 'medium',
    due_date TEXT,
    goal_id TEXT,
    parent_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
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

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    category_id TEXT,
    type TEXT NOT NULL DEFAULT 'note',
    source_url TEXT,
    og_image TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    icon TEXT,
    parent_id TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT
  );

  CREATE TABLE IF NOT EXISTS task_tags (
    task_id TEXT NOT NULL,
    tag_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS note_tags (
    note_id TEXT NOT NULL,
    tag_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS note_links (
    id TEXT PRIMARY KEY,
    source_note_id TEXT NOT NULL,
    target_note_id TEXT NOT NULL,
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
    account_id TEXT NOT NULL,
    date TEXT NOT NULL,
    followers INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    posts INTEGER DEFAULT 0,
    revenue INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS habits (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    frequency TEXT NOT NULL DEFAULT 'daily',
    color TEXT,
    icon TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS habit_logs (
    id TEXT PRIMARY KEY,
    habit_id TEXT NOT NULL,
    date TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 1,
    note TEXT
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    service TEXT NOT NULL,
    key TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS schedule_blocks (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#1A7A4A',
    task_ids TEXT,
    block_type TEXT NOT NULL DEFAULT 'focus',
    completed INTEGER NOT NULL DEFAULT 0,
    template_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS schedule_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
\`);

console.log('数据库初始化完成');
db.close();
"

# ── 启动 / 重启 PM2 ───────────────────────────────────────
pm2 describe life-dashboard &>/dev/null && pm2 restart life-dashboard || \
  pm2 start npm --name life-dashboard -- start
pm2 save

echo ""
echo "✅ 部署完成！访问 http://$(curl -s ifconfig.me):3000"
