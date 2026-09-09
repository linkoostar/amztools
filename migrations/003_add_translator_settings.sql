-- 迁移 003: 新增翻译器独立配置表
-- 翻译器与 ai-title 文案工具使用各自的 API 配置，互不覆盖
CREATE TABLE IF NOT EXISTS translator_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  tr_api_base TEXT DEFAULT '',
  tr_api_model TEXT DEFAULT '',
  tr_api_key TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
