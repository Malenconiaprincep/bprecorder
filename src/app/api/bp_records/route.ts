import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Supabase 配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// 处理 CORS 预检请求
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-openid',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST: 插入单个血压记录
export async function POST(req: NextRequest) {
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: '服务器配置错误' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 获取 openid (通过 header 传递，用于更新 last_login_at)
    const openid = req.headers.get('x-openid');

    const body = await req.json();

    // 只处理单个记录
    if (Array.isArray(body)) {
      return NextResponse.json({ error: '此接口只支持单个记录插入' }, { status: 400 });
    }

    // 验证必需字段
    if (!body.systolic || !body.diastolic || !body.pulse) {
      return NextResponse.json({ error: '缺少必需字段: systolic, diastolic, pulse' }, { status: 400 });
    }
    if (!body.user_id) {
      return NextResponse.json({ error: '缺少 user_id 字段' }, { status: 400 });
    }

    // 插入记录
    const { data, error } = await supabase
      .from('bp_records')
      .insert([body])
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json({ error: '插入失败: ' + error.message }, { status: 500 });
    }

    // 更新用户的最后登录时间（如果提供了 openid）
    if (openid && data) {
      const currentTime = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('wx_users')
        .update({ last_login_at: currentTime })
        .eq('openid', openid);

      if (updateError) {
        console.error('Failed to update last_login_at:', updateError);
        // 不阻止返回成功，因为记录已经插入成功
      }
    }

    return NextResponse.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    console.error('Error saving record:', error);
    return NextResponse.json({ error: '保存失败: ' + (error.message || 'Unknown error') }, { status: 500 });
  }
}

