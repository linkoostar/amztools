-- ============================================
-- FBA 工具箱 · D1 数据库 Schema
-- 执行方式：wrangler d1 execute fza_toolbox --file=./schema.sql
-- ============================================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nickname TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 用户 API 配置（每个用户一条）
CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  api_base TEXT DEFAULT '',
  api_model TEXT DEFAULT '',
  api_key TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 对话表
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,          -- UUID
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,          -- 产品名作为标题
  content_type TEXT NOT NULL,   -- title / bullets / search_terms / description
  product_info TEXT NOT NULL,   -- JSON 字符串：产品信息
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id, updated_at DESC);

-- 消息表
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,           -- system / user / assistant
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at ASC);

-- 会话表（登录 token）
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sess_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sess_expires ON sessions(expires_at);
