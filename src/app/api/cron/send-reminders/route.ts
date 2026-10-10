import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { trySendReminderForUser } from '@/lib/reminderSend'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return process.env.NODE_ENV === 'development'

  const auth = request.headers.get('authorization') || ''
  if (auth === `Bearer ${secret}`) return true

  const header = request.headers.get('x-cron-secret')
  return header === secret
}

function isReminderDevModeEnabled(): boolean {
  return process.env.REMINDER_DEV_MODE === '1' || process.env.NODE_ENV === 'development'
}

async function runSendReminders(request: NextRequest) {
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ success: false, error: '服务器配置错误' }, { status: 500 })
  }

  const devForce =
    isReminderDevModeEnabled() &&
    (request.nextUrl.searchParams.get('devForce') === '1' ||
      request.headers.get('x-reminder-dev-force') === '1')

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const now = new Date()

  const { data: users, error: usersError } = await supabase
    .from('wx_users')
    .select('openid')
    .eq('reminder_enabled', true)

  if (usersError) {
    console.error('[cron/send-reminders] load users failed', usersError)
    return NextResponse.json({ success: false, error: '读取用户失败' }, { status: 500 })
  }

  let scanned = 0
  let sent = 0
  let skipped = 0
  const errors: string[] = []
  const skippedDetails: Array<{ openid: string; reason: string }> = []
  const skip = devForce
    ? { skipTimeWindow: true, skipRecordedCheck: true }
    : {}

  for (const user of users || []) {
    scanned += 1
    const result = await trySendReminderForUser(supabase, user.openid, now, skip)

    if (!result.ok) {
      errors.push(`${user.openid}: ${result.error}`)
      continue
    }

    if (result.sent) {
      sent += 1
    } else {
      skipped += 1
      skippedDetails.push({ openid: user.openid, reason: result.reason })
    }
  }

  return NextResponse.json({
    success: true,
    devForce,
    reminderDevMode: isReminderDevModeEnabled(),
    scanned,
    sent,
    skipped,
    skippedDetails,
    errors,
  })
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ success: false, error: '未授权' }, { status: 401 })
  }
  return runSendReminders(request)
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ success: false, error: '未授权' }, { status: 401 })
  }
  return runSendReminders(request)
}
