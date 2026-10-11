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
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-openid',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*' };
}

function getOpenid(req: NextRequest): string | null {
  const openid = req.headers.get('x-openid')?.trim();
  return openid || null;
}

function unauthorized() {
  return NextResponse.json({ error: '请先登录' }, { status: 401, headers: corsHeaders() });
}

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400, headers: corsHeaders() });
}

function serverError(error: string) {
  return NextResponse.json({ error }, { status: 500, headers: corsHeaders() });
}

function queryValue(req: NextRequest, key: string): string | null {
  return new URL(req.url).searchParams.get(key);
}

function stripFilter(value: string | null, prefix: string): string | null {
  return value?.startsWith(prefix) ? value.slice(prefix.length) : null;
}

async function createAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET: 获取当前用户的血压记录
export async function GET(req: NextRequest) {
  try {
    const openid = getOpenid(req);
    if (!openid) return unauthorized();
    const supabase = await createAdminClient();
    if (!supabase) return serverError('服务器配置错误');

    const requestedUser = stripFilter(queryValue(req, 'user_id'), 'eq.');
    if (requestedUser && requestedUser !== openid) return unauthorized();

    let query = supabase.from('bp_records').select('*').eq('user_id', openid);
    const gte = stripFilter(queryValue(req, 'recorded_at_gte') || queryValue(req, 'recorded_at'), 'gte.');
    const lte = stripFilter(queryValue(req, 'recorded_at_lte') || queryValue(req, 'recorded_at'), 'lte.');
    if (gte) query = query.gte('recorded_at', gte);
    if (lte) query = query.lte('recorded_at', lte);

    const order = queryValue(req, 'order') || 'recorded_at.desc';
    const [orderColumn, orderDirection] = order.split('.');
    query = query.order(orderColumn || 'recorded_at', { ascending: orderDirection === 'asc' });

    const limit = Math.min(Math.max(Number(queryValue(req, 'limit') || 50), 1), 5000);
    const offset = Math.max(Number(queryValue(req, 'offset') || 0), 0);
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) {
      console.error('Supabase fetch error:', error);
      return serverError('查询失败: ' + error.message);
    }
    return NextResponse.json(data || [], { headers: corsHeaders() });
  } catch (error: any) {
    console.error('Error fetching records:', error);
    return serverError('查询失败: ' + (error.message || 'Unknown error'));
  }
}

// POST: 插入单个血压记录
export async function POST(req: NextRequest) {
  try {
    const openid = getOpenid(req);
    if (!openid) return unauthorized();
    if (!supabaseUrl || !supabaseServiceKey) return serverError('服务器配置错误');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 获取 openid (通过 header 传递，用于更新 last_login_at)
    const body = await req.json();

    // 只处理单个记录
    if (Array.isArray(body)) {
      return NextResponse.json({ error: '此接口只支持单个记录插入' }, { status: 400 });
    }

    const systolic = Number(body.systolic)
    const diastolic = Number(body.diastolic)
    const pulse = Number(body.pulse)

    if (!Number.isFinite(systolic) || !Number.isFinite(diastolic) || !Number.isFinite(pulse)) {
      return NextResponse.json(
        { error: '缺少有效数值: systolic, diastolic, pulse' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }
    if (!body.user_id || typeof body.user_id !== 'string') return badRequest('缺少 user_id 字段');
    if (body.user_id !== openid) return unauthorized();

    const row = {
      user_id: body.user_id,
      systolic: Math.round(systolic),
      diastolic: Math.round(diastolic),
      pulse: Math.round(pulse),
      recorded_at: body.recorded_at,
      hand: body.hand === 'left' || body.hand === 'right' ? body.hand : null,
      note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
    }

    if (!row.recorded_at) {
      return badRequest('缺少 recorded_at 字段');
    }

    // 插入记录
    const { data, error } = await supabase
      .from('bp_records')
      .insert([row])
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return serverError('插入失败: ' + error.message);
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
      headers: corsHeaders(),
    });
  } catch (error: any) {
    console.error('Error saving record:', error);
    return serverError('保存失败: ' + (error.message || 'Unknown error'));
  }
}

// PATCH: 更新当前用户的血压记录
export async function PATCH(req: NextRequest) {
  try {
    const openid = getOpenid(req);
    if (!openid) return unauthorized();
    const supabase = await createAdminClient();
    if (!supabase) return serverError('服务器配置错误');
    const id = stripFilter(queryValue(req, 'id'), 'eq.');
    if (!id) return badRequest('缺少记录 id');
    const body = await req.json();
    const { data, error } = await supabase
      .from('bp_records')
      .update({
        systolic: Number(body.systolic),
        diastolic: Number(body.diastolic),
        pulse: Number(body.pulse),
        recorded_at: body.recorded_at,
        hand: body.hand === 'left' || body.hand === 'right' ? body.hand : null,
        note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
      })
      .eq('id', id)
      .eq('user_id', openid)
      .select()
      .single();
    if (error) return serverError('更新失败: ' + error.message);
    return NextResponse.json(data, { headers: corsHeaders() });
  } catch (error: any) {
    console.error('Error updating record:', error);
    return serverError('更新失败: ' + (error.message || 'Unknown error'));
  }
}

// DELETE: 删除当前用户的血压记录
export async function DELETE(req: NextRequest) {
  try {
    const openid = getOpenid(req);
    if (!openid) return unauthorized();
    const supabase = await createAdminClient();
    if (!supabase) return serverError('服务器配置错误');
    const id = stripFilter(queryValue(req, 'id'), 'eq.');
    if (!id) return badRequest('缺少记录 id');
    const { error } = await supabase.from('bp_records').delete().eq('id', id).eq('user_id', openid);
    if (error) return serverError('删除失败: ' + error.message);
    return NextResponse.json({ success: true }, { headers: corsHeaders() });
  } catch (error: any) {
    console.error('Error deleting record:', error);
    return serverError('删除失败: ' + (error.message || 'Unknown error'));
  }
}

