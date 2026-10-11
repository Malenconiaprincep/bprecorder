-- 创建组表
CREATE TABLE IF NOT EXISTS bp_groups (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  owner_id VARCHAR(100) NOT NULL,  -- 创建者的 openid
  invite_code VARCHAR(20) UNIQUE,   -- 邀请码
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建组成员表
CREATE TABLE IF NOT EXISTS bp_group_members (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES bp_groups(id) ON DELETE CASCADE,
  user_id VARCHAR(100) NOT NULL,    -- 成员的 openid
  nickname VARCHAR(100),            -- 在组内的昵称
  role VARCHAR(20) DEFAULT 'member', -- 角色: owner, admin, member
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(group_id, user_id)         -- 一个用户在一个组只能有一条记录
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_groups_owner ON bp_groups(owner_id);
CREATE INDEX IF NOT EXISTS idx_groups_invite_code ON bp_groups(invite_code);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON bp_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON bp_group_members(user_id);

-- 为 bp_groups 启用 RLS（行级安全）
ALTER TABLE bp_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE bp_group_members ENABLE ROW LEVEL SECURITY;

-- 创建策略：允许所有认证用户读取组
CREATE POLICY "Allow read access to groups" ON bp_groups
  FOR SELECT USING (true);

-- 创建策略：允许所有认证用户读取组成员
CREATE POLICY "Allow read access to group members" ON bp_group_members
  FOR SELECT USING (true);

-- 创建策略：允许插入
CREATE POLICY "Allow insert to groups" ON bp_groups
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow insert to group members" ON bp_group_members
  FOR INSERT WITH CHECK (true);

-- 创建策略：允许更新
CREATE POLICY "Allow update to groups" ON bp_groups
  FOR UPDATE USING (true);

CREATE POLICY "Allow update to group members" ON bp_group_members
  FOR UPDATE USING (true);

-- 创建策略：允许删除
CREATE POLICY "Allow delete from groups" ON bp_groups
  FOR DELETE USING (true);

CREATE POLICY "Allow delete from group members" ON bp_group_members
  FOR DELETE USING (true);

