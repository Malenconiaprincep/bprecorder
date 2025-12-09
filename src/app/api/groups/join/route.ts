import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Supabase 配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// CORS 头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// 处理 CORS 预检请求
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

// POST: 通过邀请码加入组
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { invite_code, user_id, nickname } = body

    if (!invite_code || !user_id) {
      return NextResponse.json({ success: false, error: '缺少必要参数' }, { status: 400, headers: corsHeaders })
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ success: false, error: '服务器配置错误' }, { status: 500, headers: corsHeaders })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 通过邀请码查找组
    const { data: group, error: groupError } = await supabase
      .from('bp_groups')
      .select('id, name')
      .eq('invite_code', invite_code.toUpperCase())
      .single()

    if (groupError || !group) {
      return NextResponse.json({ success: false, error: '邀请码无效' }, { status: 404, headers: corsHeaders })
    }

    // 检查是否已经是成员
    const { data: existingMember } = await supabase
      .from('bp_group_members')
      .select('id')
      .eq('group_id', group.id)
      .eq('user_id', user_id)
      .single()

    if (existingMember) {
      return NextResponse.json({ success: false, error: '你已经是该组成员' }, { status: 400, headers: corsHeaders })
    }

    // 获取用户昵称（如果没有提供的话）
    let memberNickname = nickname
    if (!memberNickname) {
      const { data: user } = await supabase
        .from('wx_users')
        .select('nickname')
        .eq('openid', user_id)
        .single()
      memberNickname = user?.nickname
    }

    // 加入组
    const { data: membership, error: joinError } = await supabase
      .from('bp_group_members')
      .insert({
        group_id: group.id,
        user_id,
        nickname: memberNickname,
        role: 'member'
      })
      .select()
      .single()

    if (joinError) {
      console.error('Join group error:', joinError)
      return NextResponse.json({ success: false, error: '加入失败' }, { status: 500, headers: corsHeaders })
    }

    return NextResponse.json({
      success: true,
      group,
      membership
    }, { headers: corsHeaders })

  } catch (error: any) {
    console.error('POST join group error:', error)
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500, headers: corsHeaders })
  }
}

