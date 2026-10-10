-- 为 bp_records 表添加 hand 和 note 字段
ALTER TABLE bp_records 
ADD COLUMN IF NOT EXISTS hand VARCHAR(10),  -- 'left' 或 'right'
ADD COLUMN IF NOT EXISTS note TEXT;         -- 备注

