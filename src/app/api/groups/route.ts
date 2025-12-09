import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyToken } from '../wx-login/route'

// Supabase 配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// 生成随机邀请码
function generateInviteCode(length: number = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 排除容易混淆的字符
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

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

// GET: 获取我的组列表 或 通过邀请码获取组信息
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const inviteCode = searchParams.get('invite_code')
    const userId = searchParams.get('user_id')

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ success: false, error: '服务器配置错误' }, { status: 500, headers: corsHeaders })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 如果有邀请码，查询组信息
    if (inviteCode) {
      const { data: group, error } = await supabase
        .from('bp_groups')
        .select('id, name, description, owner_id, created_at')
        .eq('invite_code', inviteCode.toUpperCase())
        .single()

      if (error || !group) {
        return NextResponse.json({ success: false, error: '邀请码无效' }, { status: 404, headers: corsHeaders })
      }

      // 获取组成员数量
      const { count } = await supabase
        .from('bp_group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', group.id)

      return NextResponse.json({
        success: true,
        group: { ...group, member_count: count || 0 }
      }, { headers: corsHeaders })
    }

    // 获取我的组列表
    if (!userId) {
      return NextResponse.json({ success: false, error: '缺少 user_id 参数' }, { status: 400, headers: corsHeaders })
    }

    // 查询我加入的所有组
    const { data: memberships, error: memberError } = await supabase
      .from('bp_group_members')
      .select('group_id, role, joined_at')
      .eq('user_id', userId)

    if (memberError) {
      console.error('Query memberships error:', memberError)
      return NextResponse.json({ success: false, error: '查询失败' }, { status: 500, headers: corsHeaders })
    }

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ success: true, groups: [] }, { headers: corsHeaders })
    }

    // 获取组详情
    const groupIds = memberships.map(m => m.group_id)
    const { data: groups, error: groupError } = await supabase
      .from('bp_groups')
      .select('*')
      .in('id', groupIds)

    if (groupError) {
      console.error('Query groups error:', groupError)
      return NextResponse.json({ success: false, error: '查询失败' }, { status: 500, headers: corsHeaders })
    }

    // 合并成员信息和组信息
    const result = groups?.map(group => {
      const membership = memberships.find(m => m.group_id === group.id)
      return {
        ...group,
        my_role: membership?.role || 'member',
        joined_at: membership?.joined_at
      }
    }) || []

    return NextResponse.json({ success: true, groups: result }, { headers: corsHeaders })

  } catch (error: any) {
    console.error('GET groups error:', error)
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500, headers: corsHeaders })
  }
}

// POST: 创建组
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description, owner_id } = body

    if (!name || !owner_id) {
      return NextResponse.json({ success: false, error: '缺少必要参数' }, { status: 400, headers: corsHeaders })
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ success: false, error: '服务器配置错误' }, { status: 500, headers: corsHeaders })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 生成唯一邀请码
    let inviteCode = generateInviteCode()
    let attempts = 0
    while (attempts < 5) {
      const { data: existing } = await supabase
        .from('bp_groups')
        .select('id')
        .eq('invite_code', inviteCode)
        .single()

      if (!existing) break
      inviteCode = generateInviteCode()
      attempts++
    }

    // 创建组
    const { data: group, error: createError } = await supabase
      .from('bp_groups')
      .insert({
        name,
        description: description || '',
        owner_id,
        invite_code: inviteCode
      })
      .select()
      .single()

    if (createError || !group) {
      console.error('Create group error:', createError)
      return NextResponse.json({ success: false, error: '创建失败' }, { status: 500, headers: corsHeaders })
    }

    // 将创建者添加为成员（角色为 owner）
    const { error: memberError } = await supabase
      .from('bp_group_members')
      .insert({
        group_id: group.id,
        user_id: owner_id,
        role: 'owner'
      })

    if (memberError) {
      console.error('Add owner as member error:', memberError)
    }

    return NextResponse.json({
      success: true,
      group
    }, { headers: corsHeaders })

  } catch (error: any) {
    console.error('POST groups error:', error)
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500, headers: corsHeaders })
  }
}

