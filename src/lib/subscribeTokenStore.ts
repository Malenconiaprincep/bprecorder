import type { SupabaseClient } from '@supabase/supabase-js'
import { computeNextScheduledFor, snapReminderTimeToSlot } from '@/lib/reminderSchedule'

type SubscribeStatus = 'accept' | 'reject' | 'ban'

/** 提醒时间变更时，同步未消耗额度的计划发送时刻 */
export async function syncPendingTokenSchedule(
  supabase: SupabaseClient,
  openid: string,
  reminderTime: string,
  timeZone: string
): Promise<void> {
  const scheduledFor = computeNextScheduledFor(new Date(), reminderTime, timeZone)

  await supabase
    .from('subscribe_message_tokens')
    .update({ scheduled_for: scheduledFor, send_error: null })
    .eq('openid', openid)
    .eq('status', 'accept')
    .eq('consumed', false)
}

/**
 * 登记订阅额度（accept，首次在提醒设置里微信授权时调用）
 * - 同一用户复用最近一条 accept 记录，避免 subscribe_message_tokens 无限增长
 * - replacePending=true（默认）：按「下一次到点」排期
 * - 保存血压后的续期见 refreshSubscribeTokenAfterRecord
 */
export async function registerSubscribeTokenRow(
  supabase: SupabaseClient,
  params: {
    openid: string
    templateId: string
    status: SubscribeStatus
    reminderTime: string
    timeZone: string
    replacePending?: boolean
  }
): Promise<{ id: number | null; scheduledFor: string; updated: boolean }> {
  const reminderTime = snapReminderTimeToSlot(params.reminderTime)
  const replacePending = params.replacePending !== false
  const scheduleMode = replacePending ? 'next_occurrence' : 'renew_tomorrow'
  const scheduledFor = computeNextScheduledFor(
    new Date(),
    reminderTime,
    params.timeZone,
    scheduleMode
  )

  if (params.status !== 'accept') {
    const { data } = await supabase
      .from('subscribe_message_tokens')
      .insert({
        openid: params.openid,
        template_id: params.templateId,
        status: params.status,
        scheduled_for: scheduledFor,
        consumed: true,
        sent_at: null,
      })
      .select('id')
      .single()

    return { id: data?.id ?? null, scheduledFor, updated: false }
  }

  const { data: existing } = await supabase
    .from('subscribe_message_tokens')
    .select('id')
    .eq('openid', params.openid)
    .eq('status', 'accept')
    .order('created_at', { ascending: false })
    .limit(1)

  const latest = existing?.[0]
  if (latest?.id) {
    await supabase
      .from('subscribe_message_tokens')
      .update({
        template_id: params.templateId,
        scheduled_for: scheduledFor,
        consumed: false,
        sent_at: null,
        send_error: null,
      })
      .eq('id', latest.id)

    return { id: latest.id, scheduledFor, updated: true }
  }

  const { data: inserted } = await supabase
    .from('subscribe_message_tokens')
    .insert({
      openid: params.openid,
      template_id: params.templateId,
      status: 'accept',
      scheduled_for: scheduledFor,
      consumed: false,
      sent_at: null,
    })
    .select('id')
    .single()

  return { id: inserted?.id ?? null, scheduledFor, updated: false }
}

/**
 * 保存血压记录后：若已开启提醒且有过 accept 订阅，复用同一条记录，
 * 将 scheduled_for 排到明天同一时刻，consumed 重置为 false（无需再次弹微信授权）。
 */
export async function refreshSubscribeTokenAfterRecord(
  supabase: SupabaseClient,
  openid: string,
  reminderTime?: string
): Promise<{ ok: boolean; updated: boolean; scheduledFor?: string; reason?: string }> {
  const { data: user, error: userError } = await supabase
    .from('wx_users')
    .select('reminder_enabled, reminder_time, reminder_timezone')
    .eq('openid', openid)
    .single()

  if (userError || !user) {
    return { ok: false, updated: false, reason: 'user_not_found' }
  }

  if (!user.reminder_enabled) {
    return { ok: true, updated: false, reason: 'reminder_disabled' }
  }

  const timeZone = user.reminder_timezone || 'Asia/Shanghai'
  const rt = snapReminderTimeToSlot(reminderTime || user.reminder_time || '09:00')
  const scheduledFor = computeNextScheduledFor(new Date(), rt, timeZone, 'renew_tomorrow')

  const { data: existing, error: findError } = await supabase
    .from('subscribe_message_tokens')
    .select('id')
    .eq('openid', openid)
    .eq('status', 'accept')
    .order('created_at', { ascending: false })
    .limit(1)

  if (findError) {
    return { ok: false, updated: false, reason: findError.message }
  }

  const latest = existing?.[0]
  if (!latest?.id) {
    return { ok: true, updated: false, reason: 'no_subscribe_token' }
  }

  const { error: updateError } = await supabase
    .from('subscribe_message_tokens')
    .update({
      scheduled_for: scheduledFor,
      consumed: false,
      sent_at: null,
      send_error: null,
    })
    .eq('id', latest.id)

  if (updateError) {
    return { ok: false, updated: false, reason: updateError.message }
  }

  return { ok: true, updated: true, scheduledFor }
}
