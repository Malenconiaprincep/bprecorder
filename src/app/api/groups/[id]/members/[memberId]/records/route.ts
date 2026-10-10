import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Supabase 配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// 复用 Supabase 客户端
let supabaseInstance: SupabaseClient | null = null
function getSupabase() {
  if (!supabaseInstance && supabaseUrl && supabaseServiceKey) {
    supabaseInstance = createClient(supabaseUrl, supabaseServiceKey)
  }
  return supabaseInstance
}

// CORS 头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// 处理 CORS 预检请求
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

// GET: 获取组成员的血压记录（支持分页）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const { id, memberId } = await params
    const groupId = parseInt(id)
    
    // 获取分页参数
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    if (isNaN(groupId) || !memberId) {
      return NextResponse.json({ success: false, error: '参数错误' }, { status: 400, headers: corsHeaders })
    }

    const supabase = getSupabase()
    if (!supabase) {
      return NextResponse.json({ success: false, error: '服务器配置错误' }, { status: 500, headers: corsHeaders })
    }

    // 首页请求时获取成员信息
    let member = null
    if (page === 1) {
      // 验证该成员是否属于该组
      const { data: membership, error: memberError } = await supabase
        .from('bp_group_members')
        .select('id, user_id, nickname, role, joined_at')
        .eq('group_id', groupId)
        .eq('user_id', memberId)
        .single()

      if (memberError || !membership) {
        return NextResponse.json({ success: false, error: '成员不存在' }, { status: 404, headers: corsHeaders })
      }

      // 获取成员的用户信息
      const { data: user } = await supabase
        .from('wx_users')
        .select('nickname, avatar_url')
        .eq('openid', memberId)
        .single()

      member = {
        ...membership,
        user: user || { nickname: null, avatar_url: null }
      }
    }

    // 获取成员的血压记录（分页）
    const { data: records, error: recordsError, count } = await supabase
      .from('bp_records')
      .select('id, systolic, diastolic, pulse, recorded_at, hand, note', { count: 'exact' })
      .eq('user_id', memberId)
      .order('recorded_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (recordsError) {
      console.error('Query records error:', recordsError)
      return NextResponse.json({ success: false, error: '查询失败' }, { status: 500, headers: corsHeaders })
    }

    const totalRecords = count || 0
    const hasMore = offset + limit < totalRecords

    return NextResponse.json({
      success: true,
      member,
      records: records || [],
      pagination: {
        page,
        limit,
        total: totalRecords,
        hasMore
      }
    }, { headers: corsHeaders })

  } catch (error: any) {
    console.error('GET member records error:', error)
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500, headers: corsHeaders })
  }
}

