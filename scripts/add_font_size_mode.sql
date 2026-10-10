-- 添加字体大小模式字段到 wx_users 表
-- font_size_mode: 'normal' = 正常模式, 'elder' = 关怀模式（大字体）

-- 添加字段
ALTER TABLE wx_users 
ADD COLUMN IF NOT EXISTS font_size_mode VARCHAR(20) DEFAULT 'normal';

-- 添加注释
COMMENT ON COLUMN wx_users.font_size_mode IS '字体大小模式：normal=正常模式, elder=关怀模式（大字体）';

-- 创建索引（可选，用于查询优化）
CREATE INDEX IF NOT EXISTS idx_wx_users_font_size_mode ON wx_users(font_size_mode);

