import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function GET(req: NextRequest) {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: '服务器配置错误' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // 从 Supabase Storage 获取公开 URL（使用英文文件名）
    const { data: urlData } = supabase.storage
      .from('user-files')
      .getPublicUrl('demo/bp_record_template.xlsx');

    // 重定向到 Supabase Storage 的公开 URL
    return NextResponse.redirect(urlData.publicUrl);
  } catch (error: any) {
    console.error('Error getting demo file:', error);
    return NextResponse.json({ error: '获取文件失败' }, { status: 500 });
  }
}

