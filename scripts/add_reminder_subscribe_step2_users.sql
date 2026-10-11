-- 测量提醒迁移 · 第 2 步（逐条执行，一条 Run 一次）
-- 若某条仍 timeout，见下方「仍超时怎么办」

ALTER TABLE wx_users
  ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN DEFAULT false;

ALTER TABLE wx_users
  ADD COLUMN IF NOT EXISTS reminder_time VARCHAR(5) DEFAULT '09:00';

ALTER TABLE wx_users
  ADD COLUMN IF NOT EXISTS reminder_timezone VARCHAR(64) DEFAULT 'Asia/Shanghai';

-- 可选：补 NOT NULL（数据量很大时可跳过，不影响功能）
-- UPDATE wx_users SET reminder_enabled = false WHERE reminder_enabled IS NULL;
-- UPDATE wx_users SET reminder_time = '09:00' WHERE reminder_time IS NULL;
-- UPDATE wx_users SET reminder_timezone = 'Asia/Shanghai' WHERE reminder_timezone IS NULL;
-- ALTER TABLE wx_users ALTER COLUMN reminder_enabled SET NOT NULL;
-- ALTER TABLE wx_users ALTER COLUMN reminder_time SET NOT NULL;
-- ALTER TABLE wx_users ALTER COLUMN reminder_timezone SET NOT NULL;

-- 可选索引（50 DAU 可跳过，Cron 照样能跑）
-- CREATE INDEX IF NOT EXISTS idx_wx_users_reminder_enabled
--   ON wx_users (reminder_enabled)
--   WHERE reminder_enabled = true;
