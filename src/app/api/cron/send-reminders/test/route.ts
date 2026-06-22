import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { trySendReminderForUser } from '@/lib/reminderSend'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-openid, x-cron-secret',
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isReminderDevModeEnabled(): boolean {
  return process.env.REMINDER_DEV_MODE === '1' || process.env.NODE_ENV === 'development'
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

/**
 * POST - 开发测试：对当前用户强制尝试发送提醒
 * - 跳过「今日已测」与「提醒时间窗口」
 * - 仍需：已开启提醒 + 有未消耗的 accept 订阅额度
 *
 * 需设置 REMINDER_DEV_MODE=1（或本地 development）
 */
export async function POST(request: NextRequest) {
  if (!isReminderDevModeEnabled()) {
    return NextResponse.json({ success: false, error: '未开启 REMINDER_DEV_MODE' }, {
      status: 403,
      headers: corsHeaders,
    })
  }

  const openid = request.headers.get('x-openid')?.trim()
  if (!openid) {
    return NextResponse.json({ success: false, error: '缺少 x-openid' }, {
      status: 400,
      headers: corsHeaders,
    })
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ success: false, error: '服务器配置错误' }, {
      status: 500,
      headers: corsHeaders,
    })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const result = await trySendReminderForUser(supabase, openid, new Date(), {
    skipTimeWindow: true,
    skipRecordedCheck: true,
  })

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error, result }, {
      status: 500,
      headers: corsHeaders,
    })
  }

  if (!result.sent) {
    const reasonMessages: Record<string, string> = {
      reminder_disabled: '请先在「提醒设置」中开启提醒',
      no_subscribe_token: '没有可用订阅额度，请先在提醒设置里「保存并授权」',
      outside_time_window: '不在提醒时间窗口',
      already_recorded_today: '今日已有记录',
    }
    return NextResponse.json({
      success: false,
      sent: false,
      reason: result.reason,
      message: reasonMessages[result.reason] || result.reason,
      result,
    }, { headers: corsHeaders })
  }

  return NextResponse.json({
    success: true,
    sent: true,
    message: '测试提醒已发送，请查看微信服务通知',
    result,
  }, { headers: corsHeaders })
}
