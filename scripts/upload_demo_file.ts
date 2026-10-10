const { createClient } = require('@supabase/supabase-js');
const { readFileSync } = require('fs');
const { join } = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('请设置环境变量 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function uploadDemoFile() {
  try {
    // 读取示例文件（从 miniapp/src/assets 目录）
    const filePath = join(process.cwd(), 'miniapp/src/assets/demo.xlsx');
    const fileBuffer = readFileSync(filePath);

    // 上传到 Supabase Storage（使用英文文件名）
    const fileName = 'demo/bp_record_template.xlsx';
    const { data, error } = await supabase.storage
      .from('user-files')
      .upload(fileName, fileBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true // 如果文件已存在则覆盖
      });

    if (error) {
      console.error('上传失败:', error);
      process.exit(1);
    }

    // 获取公开 URL
    const { data: urlData } = supabase.storage
      .from('user-files')
      .getPublicUrl(fileName);

    console.log('✅ 示例文件上传成功！');
    console.log('公开 URL:', urlData.publicUrl);
  } catch (error: any) {
    console.error('错误:', error.message);
    process.exit(1);
  }
}

uploadDemoFile();

