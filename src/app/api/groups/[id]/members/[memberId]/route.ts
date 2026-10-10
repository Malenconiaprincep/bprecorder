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

// DELETE: 退出组或踢出组员
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const { id, memberId } = await params
    const groupId = parseInt(id)
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id') // 操作者ID

    if (isNaN(groupId) || !memberId || !userId) {
      return NextResponse.json({ success: false, error: '参数错误' }, { status: 400, headers: corsHeaders })
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ success: false, error: '服务器配置错误' }, { status: 500, headers: corsHeaders })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 获取组信息
    const { data: group, error: groupError } = await supabase
      .from('bp_groups')
      .select('owner_id')
      .eq('id', groupId)
      .single()

    if (groupError || !group) {
      return NextResponse.json({ success: false, error: '组不存在' }, { status: 404, headers: corsHeaders })
    }

    // 获取被操作成员的信息
    const { data: targetMember, error: memberError } = await supabase
      .from('bp_group_members')
      .select('user_id, role')
      .eq('group_id', groupId)
      .eq('user_id', memberId)
      .single()

    if (memberError || !targetMember) {
      return NextResponse.json({ success: false, error: '成员不存在' }, { status: 404, headers: corsHeaders })
    }

    // 判断操作类型
    const isOwner = group.owner_id === userId
    const isSelf = userId === memberId
    const isTargetOwner = targetMember.role === 'owner'

    // 权限检查
    if (isTargetOwner) {
      return NextResponse.json({ success: false, error: '不能移除组主' }, { status: 403, headers: corsHeaders })
    }

    if (!isSelf && !isOwner) {
      return NextResponse.json({ success: false, error: '无权限操作' }, { status: 403, headers: corsHeaders })
    }

    // 删除成员关系
    const { error: deleteError } = await supabase
      .from('bp_group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', memberId)

    if (deleteError) {
      console.error('Delete member error:', deleteError)
      return NextResponse.json({ success: false, error: '操作失败' }, { status: 500, headers: corsHeaders })
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders })

  } catch (error: any) {
    console.error('DELETE member error:', error)
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500, headers: corsHeaders })
  }
}

