import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  buildReminderTemplateData,
  getSubscribeTemplateId,
  sendSubscribeMessage,
} from '@/lib/wechat'
import {
  getLocalDateKey,
  getMinutesFromReminderTime,
  userRecordedOnLocalDate,
} from '@/lib/reminderSchedule'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 允许 cron 触发的时间窗口：提醒时刻起 45 分钟内 */
const REMINDER_WINDOW_MINUTES = 45

function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return process.env.NODE_ENV === 'development'

  const auth = request.headers.get('authorization') || ''
  if (auth === `Bearer ${secret}`) return true

  const header = request.headers.get('x-cron-secret')
  return header === secret
}

/**
 * GET/POST - 定时扫描并发送测量提醒（Vercel Cron）
 * 需配置 CRON_SECRET；Vercel 会自动带 Authorization: Bearer ${CRON_SECRET}
 */
async function runSendReminders() {
  const templateId = getSubscribeTemplateId()
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ success: false, error: '服务器配置错误' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const now = new Date()

  const { data: users, error: usersError } = await supabase
    .from('wx_users')
    .select('openid, reminder_time, reminder_timezone')
    .eq('reminder_enabled', true)

  if (usersError) {
    console.error('[cron/send-reminders] load users failed', usersError)
    return NextResponse.json({ success: false, error: '读取用户失败' }, { status: 500 })
  }

  let scanned = 0
  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const user of users || []) {
    scanned += 1
    const openid = user.openid
    const reminderTime = user.reminder_time || '09:00'
    const timeZone = user.reminder_timezone || 'Asia/Shanghai'

    const deltaMinutes = getMinutesFromReminderTime(now, reminderTime, timeZone)
    if (deltaMinutes < 0 || deltaMinutes > REMINDER_WINDOW_MINUTES) {
      skipped += 1
      continue
    }

    const todayKey = getLocalDateKey(now, timeZone)
    const dayStart = new Date(`${todayKey}T00:00:00+08:00`)
    const dayEnd = new Date(`${todayKey}T23:59:59.999+08:00`)

    const { data: records, error: recordsError } = await supabase
      .from('bp_records')
      .select('recorded_at')
      .eq('user_id', openid)
      .gte('recorded_at', dayStart.toISOString())
      .lte('recorded_at', dayEnd.toISOString())
      .limit(20)

    if (recordsError) {
      errors.push(`${openid}: records ${recordsError.message}`)
      continue
    }

    if (userRecordedOnLocalDate(records || [], todayKey, timeZone)) {
      skipped += 1
      continue
    }

    const { data: tokens, error: tokenError } = await supabase
      .from('subscribe_message_tokens')
      .select('id, template_id')
      .eq('openid', openid)
      .eq('status', 'accept')
      .eq('consumed', false)
      .lte('scheduled_for', now.toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(1)

    if (tokenError) {
      errors.push(`${openid}: tokens ${tokenError.message}`)
      continue
    }

    const token = tokens?.[0]
    if (!token) {
      skipped += 1
      continue
    }

    const sendResult = await sendSubscribeMessage({
      openid,
      templateId: token.template_id || templateId,
      data: buildReminderTemplateData(reminderTime),
    })

    if (sendResult.ok) {
      await supabase
        .from('subscribe_message_tokens')
        .update({ consumed: true, sent_at: now.toISOString(), send_error: null })
        .eq('id', token.id)
      sent += 1
    } else {
      const errMsg = sendResult.errmsg || 'send failed'
      await supabase
        .from('subscribe_message_tokens')
        .update({ send_error: errMsg })
        .eq('id', token.id)
      errors.push(`${openid}: ${errMsg}`)
    }
  }

  return NextResponse.json({
    success: true,
    scanned,
    sent,
    skipped,
    errors,
  })
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ success: false, error: '未授权' }, { status: 401 })
  }
  return runSendReminders()
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ success: false, error: '未授权' }, { status: 401 })
  }
  return runSendReminders()
}
