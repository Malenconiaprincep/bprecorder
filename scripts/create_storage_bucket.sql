-- 创建用于存储用户文件的 Storage bucket
-- 在 Supabase Dashboard -> Storage 中执行，或者通过 SQL Editor

-- 创建 bucket（如果不存在）
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-files', 'user-files', true)
ON CONFLICT (id) DO NOTHING;

-- 设置公开访问策略（允许任何人读取）
CREATE POLICY "Public Access" ON storage.objects
FOR SELECT
USING (bucket_id = 'user-files');

-- 设置上传策略（允许任何人上传到 avatars 目录）
CREATE POLICY "Allow avatar uploads" ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'user-files' AND (storage.foldername(name))[1] = 'avatars');

-- 设置更新策略（允许覆盖自己的头像）
CREATE POLICY "Allow avatar updates" ON storage.objects
FOR UPDATE
USING (bucket_id = 'user-files' AND (storage.foldername(name))[1] = 'avatars');

