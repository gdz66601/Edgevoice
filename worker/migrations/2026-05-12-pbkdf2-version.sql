-- 为 users 表添加 password_hash_version 列，区分历史 PBKDF2 100,000 轮哈希
-- 与新写入的 600,000 轮哈希。
--
-- 默认值 1 = 旧版本 (100k 迭代)。所有已存在用户在登录时会触发 lazy 重哈希
-- 升级到版本 2 (600k 迭代)。新创建的用户由应用层显式写入版本号。
--
-- 应用方式（仅在该列尚不存在的老库上执行一次）：
--   wrangler d1 execute <db> --file worker/migrations/2026-05-12-pbkdf2-version.sql
--
-- 二次执行将因列已存在而失败；这是预期行为。后续将引入 schema_migrations 跟踪表。

ALTER TABLE users ADD COLUMN password_hash_version INTEGER NOT NULL DEFAULT 1;
