-- 为 wx_users 表添加 last_login_at 字段，用于记录最近一次登录时间

-- 添加 last_login_at 字段
ALTER TABLE wx_users 
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;

-- 为 last_login_at 字段添加索引，方便查询最近登录的用户
CREATE INDEX IF NOT EXISTS idx_wx_users_last_login_at 
ON wx_users(last_login_at DESC);

-- 查看表结构
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'wx_users';

