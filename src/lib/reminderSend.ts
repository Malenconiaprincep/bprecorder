import type { SupabaseClient } from '@supabase/supabase-js'
import { buildReminderTemplateData, getSubscribeTemplateId, sendSubscribeMessage } from '@/lib/wechat'
import {
  getLocalDateKey,
  getMinutesFromReminderTime,
  userRecordedOnLocalDate,
} from '@/lib/reminderSchedule'

/** 允许 cron 触发的时间窗口：提醒时刻起 45 分钟内 */
export const REMINDER_WINDOW_MINUTES = 45

export type ReminderSendSkip = {
  skipTimeWindow?: boolean
  skipRecordedCheck?: boolean
}

export type ReminderSendResult =
  | { ok: true; sent: true; openid: string }
  | { ok: true; sent: false; openid: string; reason: string }
  | { ok: false; openid: string; error: string }

export async function trySendReminderForUser(
  supabase: SupabaseClient,
  openid: string,
  now: Date,
  skip: ReminderSendSkip = {}
): Promise<ReminderSendResult> {
  const templateId = getSubscribeTemplateId()

  const { data: user, error: userError } = await supabase
    .from('wx_users')
    .select('openid, reminder_enabled, reminder_time, reminder_timezone')
    .eq('openid', openid)
    .single()

  if (userError || !user) {
    return { ok: false, openid, error: '用户不存在' }
  }

  if (!user.reminder_enabled) {
    return { ok: true, sent: false, openid, reason: 'reminder_disabled' }
  }

  const reminderTime = user.reminder_time || '09:00'
  const timeZone = user.reminder_timezone || 'Asia/Shanghai'

  if (!skip.skipTimeWindow) {
    const deltaMinutes = getMinutesFromReminderTime(now, reminderTime, timeZone)
    if (deltaMinutes < 0 || deltaMinutes > REMINDER_WINDOW_MINUTES) {
      return { ok: true, sent: false, openid, reason: 'outside_time_window' }
    }
  }

  const todayKey = getLocalDateKey(now, timeZone)

  if (!skip.skipRecordedCheck) {
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
      return { ok: false, openid, error: recordsError.message }
    }

    if (userRecordedOnLocalDate(records || [], todayKey, timeZone)) {
      return { ok: true, sent: false, openid, reason: 'already_recorded_today' }
    }
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
    return { ok: false, openid, error: tokenError.message }
  }

  const token = tokens?.[0]
  if (!token) {
    return { ok: true, sent: false, openid, reason: 'no_subscribe_token' }
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
    return { ok: true, sent: true, openid }
  }

  const errMsg = sendResult.errmsg || 'send failed'
  await supabase
    .from('subscribe_message_tokens')
    .update({ send_error: errMsg })
    .eq('id', token.id)
  return { ok: false, openid, error: errMsg }
}
