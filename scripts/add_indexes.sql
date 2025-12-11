-- 为 bp_group_members 表添加索引，优化查询性能

-- 1. user_id 索引 - 用于查询"我加入的组"
CREATE INDEX IF NOT EXISTS idx_bp_group_members_user_id 
ON bp_group_members(user_id);

-- 2. group_id 索引 - 用于查询"组的成员列表"
CREATE INDEX IF NOT EXISTS idx_bp_group_members_group_id 
ON bp_group_members(group_id);

-- 3. 复合索引 - 用于检查用户是否已加入某组
CREATE INDEX IF NOT EXISTS idx_bp_group_members_group_user 
ON bp_group_members(group_id, user_id);

-- 4. bp_groups 表的 invite_code 索引 - 用于通过邀请码查找组
CREATE INDEX IF NOT EXISTS idx_bp_groups_invite_code 
ON bp_groups(invite_code);

-- 5. bp_groups 表的 owner_id 索引
CREATE INDEX IF NOT EXISTS idx_bp_groups_owner_id 
ON bp_groups(owner_id);

-- 6. bp_records 表的 user_id 索引 - 用于查询用户的血压记录
CREATE INDEX IF NOT EXISTS idx_bp_records_user_id 
ON bp_records(user_id);

-- 7. bp_records 表的 user_id + recorded_at 复合索引 - 用于查询用户某天的记录
CREATE INDEX IF NOT EXISTS idx_bp_records_user_date 
ON bp_records(user_id, recorded_at DESC);

-- 查看现有索引
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('bp_groups', 'bp_group_members', 'bp_records');

