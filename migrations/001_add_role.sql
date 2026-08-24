-- ============================================
-- 迁移 001: 为 users 表添加 role 字段
-- 适用于已建库但缺少 role 列的旧数据库
-- 执行方式：wrangler d1 execute fza_toolbox --remote --file=./migrations/001_add_role.sql
-- 或在 Cloudflare D1 控制台直接执行
-- ============================================

-- 添加 role 列（如果已存在会报错，忽略即可）
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

-- 将第一个用户提升为管理员（按需修改 id）
UPDATE users SET role = 'admin' WHERE id = (SELECT MIN(id) FROM users);
