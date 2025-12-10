import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Supabase 配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// CORS 头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// 处理 CORS 预检请求
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

// GET: 获取组详情和成员列表
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const groupId = parseInt(id)

    if (isNaN(groupId)) {
      return NextResponse.json({ success: false, error: '无效的组 ID' }, { status: 400, headers: corsHeaders })
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ success: false, error: '服务器配置错误' }, { status: 500, headers: corsHeaders })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 获取组信息
    const { data: group, error: groupError } = await supabase
      .from('bp_groups')
      .select('*')
      .eq('id', groupId)
      .single()

    if (groupError || !group) {
      return NextResponse.json({ success: false, error: '组不存在' }, { status: 404, headers: corsHeaders })
    }

    // 获取成员列表
    const { data: members, error: memberError } = await supabase
      .from('bp_group_members')
      .select('*')
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true })

    if (memberError) {
      console.error('Query members error:', memberError)
    }

    // 获取今天的日期范围（UTC）
    const now = new Date()
    // 使用北京时间（UTC+8）计算今天的开始和结束
    const beijingOffset = 8 * 60 * 60 * 1000
    const beijingNow = new Date(now.getTime() + beijingOffset)
    const todayStart = new Date(beijingNow)
    todayStart.setUTCHours(0, 0, 0, 0)
    const todayStartUTC = new Date(todayStart.getTime() - beijingOffset)
    const todayEndUTC = new Date(todayStartUTC.getTime() + 24 * 60 * 60 * 1000)

    // 获取每个成员的用户信息和当天血压记录
    const membersWithDetails = await Promise.all(
      (members || []).map(async (member) => {
        // 获取用户信息
        const { data: user } = await supabase
          .from('wx_users')
          .select('nickname, avatar_url')
          .eq('openid', member.user_id)
          .single()

        // 获取当天最新血压记录
        const { data: todayRecord } = await supabase
          .from('bp_records')
          .select('systolic, diastolic, pulse, recorded_at')
          .eq('user_id', member.user_id)
          .gte('recorded_at', todayStartUTC.toISOString())
          .lt('recorded_at', todayEndUTC.toISOString())
          .order('recorded_at', { ascending: false })
          .limit(1)
          .single()

        return {
          ...member,
          user: user || { nickname: null, avatar_url: null },
          latest_record: todayRecord || null
        }
      })
    )

    return NextResponse.json({
      success: true,
      group,
      members: membersWithDetails
    }, { headers: corsHeaders })

  } catch (error: any) {
    console.error('GET group detail error:', error)
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500, headers: corsHeaders })
  }
}

// DELETE: 删除组（仅组主可以）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const groupId = parseInt(id)
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')

    if (isNaN(groupId) || !userId) {
      return NextResponse.json({ success: false, error: '参数错误' }, { status: 400, headers: corsHeaders })
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ success: false, error: '服务器配置错误' }, { status: 500, headers: corsHeaders })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 验证是否是组主
    const { data: group } = await supabase
      .from('bp_groups')
      .select('owner_id')
      .eq('id', groupId)
      .single()

    if (!group || group.owner_id !== userId) {
      return NextResponse.json({ success: false, error: '无权限删除' }, { status: 403, headers: corsHeaders })
    }

    // 删除组（成员会通过 CASCADE 自动删除）
    const { error } = await supabase
      .from('bp_groups')
      .delete()
      .eq('id', groupId)

    if (error) {
      console.error('Delete group error:', error)
      return NextResponse.json({ success: false, error: '删除失败' }, { status: 500, headers: corsHeaders })
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders })

  } catch (error: any) {
    console.error('DELETE group error:', error)
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500, headers: corsHeaders })
  }
}

