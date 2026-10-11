import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSubscribeTemplateId } from '@/lib/wechat'
import { normalizeReminderTime, parseReminderTime, snapReminderTimeToSlot } from '@/lib/reminderSchedule'
import { registerSubscribeTokenRow } from '@/lib/subscribeTokenStore'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-openid',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SubscribeStatus = 'accept' | 'reject' | 'ban'

/**
 * POST - 小程序 requestSubscribeMessage 成功后上报额度
 * body: { templateId, status, reminderTime?, replacePending? }
 */
export async function POST(request: NextRequest) {
  try {
    const openid = request.headers.get('x-openid')?.trim()
    if (!openid) {
      return NextResponse.json({ success: false, error: '缺少用户标识' }, { status: 400, headers: corsHeaders })
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ success: false, error: '服务器配置错误' }, { status: 500, headers: corsHeaders })
    }

    let body: {
      templateId?: string
      status?: SubscribeStatus
      reminderTime?: string
      replacePending?: boolean
    }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, error: '请求体必须是有效的 JSON' }, { status: 400, headers: corsHeaders })
    }

    const templateId = (body.templateId || getSubscribeTemplateId() || '').trim()
    const status = body.status
    if (!templateId) {
      return NextResponse.json({ success: false, error: '未配置订阅消息模板' }, { status: 500, headers: corsHeaders })
    }
    if (!status || !['accept', 'reject', 'ban'].includes(status)) {
      return NextResponse.json({ success: false, error: '无效的订阅状态' }, { status: 400, headers: corsHeaders })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const reminderTimeInput = body.reminderTime
      ? snapReminderTimeToSlot(String(body.reminderTime))
      : null

    const userUpdate: { reminder_time?: string } = {}
    if (reminderTimeInput && parseReminderTime(reminderTimeInput)) {
      userUpdate.reminder_time = reminderTimeInput
    }

    const { data: user, error: userError } = await supabase
      .from('wx_users')
      .select('reminder_time, reminder_timezone')
      .eq('openid', openid)
      .single()

    if (userError) {
      console.error('[subscribe/register] load user failed', userError)
      return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404, headers: corsHeaders })
    }

    if (Object.keys(userUpdate).length > 0) {
      await supabase.from('wx_users').update(userUpdate).eq('openid', openid)
    }

    const reminderTime = normalizeReminderTime(reminderTimeInput || user?.reminder_time || '09:00')
    const timeZone = user?.reminder_timezone || 'Asia/Shanghai'

    const row = await registerSubscribeTokenRow(supabase, {
      openid,
      templateId,
      status,
      reminderTime,
      timeZone,
      replacePending: body.replacePending !== false,
    })

    if (!row.id && status === 'accept') {
      return NextResponse.json({ success: false, error: '保存订阅额度失败' }, { status: 500, headers: corsHeaders })
    }

    return NextResponse.json(
      {
        success: true,
        registered: status === 'accept',
        tokenId: row.id,
        scheduledFor: row.scheduledFor,
        updated: row.updated,
        reminderTime: parseReminderTime(reminderTime) ? reminderTime : '09:00',
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('[subscribe/register] error', error)
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500, headers: corsHeaders })
  }
}
