-- ============================================
-- 迁移 002: 为 user_settings 表添加 custom_prompt 字段
-- 适用于已建库但缺少 custom_prompt 列的旧数据库
-- 执行方式：wrangler d1 execute fza_toolbox --remote --file=./migrations/002_add_custom_prompt.sql
-- 或在 Cloudflare D1 控制台直接执行
-- ============================================

ALTER TABLE user_settings ADD COLUMN custom_prompt TEXT;
