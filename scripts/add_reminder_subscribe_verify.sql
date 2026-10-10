-- 执行完 step1 + step2 后，用此检查是否成功

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'wx_users'
  AND column_name IN ('reminder_enabled', 'reminder_time', 'reminder_timezone');

SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'subscribe_message_tokens'
) AS tokens_table_ok;
