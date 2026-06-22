import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSubscribeTemplateId } from '@/lib/wechat'
import {
  computeNextScheduledFor,
  normalizeReminderTime,
  parseReminderTime,
} from '@/lib/reminderSchedule'

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
 * body: { templateId, status, reminderTime? }
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

    let body: { templateId?: string; status?: SubscribeStatus; reminderTime?: string }
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

    const { data: user, error: userError } = await supabase
      .from('wx_users')
      .select('reminder_time, reminder_timezone')
      .eq('openid', openid)
      .single()

    if (userError) {
      console.error('[subscribe/register] load user failed', userError)
      return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404, headers: corsHeaders })
    }

    const reminderTime = normalizeReminderTime(body.reminderTime || user?.reminder_time || '09:00')
    const timeZone = user?.reminder_timezone || 'Asia/Shanghai'
    const scheduledFor = computeNextScheduledFor(new Date(), reminderTime, timeZone)

    const { data: inserted, error: insertError } = await supabase
      .from('subscribe_message_tokens')
      .insert({
        openid,
        template_id: templateId,
        status,
        scheduled_for: scheduledFor,
        consumed: status !== 'accept',
        sent_at: null,
      })
      .select('id, scheduled_for')
      .single()

    if (insertError) {
      console.error('[subscribe/register] insert failed', insertError)
      return NextResponse.json({ success: false, error: '保存订阅额度失败' }, { status: 500, headers: corsHeaders })
    }

    return NextResponse.json(
      {
        success: true,
        registered: status === 'accept',
        tokenId: inserted?.id,
        scheduledFor: inserted?.scheduled_for,
        reminderTime: parseReminderTime(reminderTime) ? reminderTime : '09:00',
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('[subscribe/register] error', error)
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500, headers: corsHeaders })
  }
}
