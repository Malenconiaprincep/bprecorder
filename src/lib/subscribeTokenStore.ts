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
 * 登记订阅额度
 * - replacePending=true（默认）：同一用户仅保留一条未消耗 accept 额度，改时间/重复授权时更新
 * - replacePending=false：续订场景，微信新授权一次新增一条额度
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
  const scheduledFor = computeNextScheduledFor(new Date(), reminderTime, params.timeZone)
  const replacePending = params.replacePending !== false

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

  if (replacePending) {
    const { data: existing } = await supabase
      .from('subscribe_message_tokens')
      .select('id')
      .eq('openid', params.openid)
      .eq('status', 'accept')
      .eq('consumed', false)
      .order('created_at', { ascending: false })
      .limit(1)

    const pending = existing?.[0]
    if (pending?.id) {
      await supabase
        .from('subscribe_message_tokens')
        .update({
          template_id: params.templateId,
          scheduled_for: scheduledFor,
          send_error: null,
        })
        .eq('id', pending.id)

      return { id: pending.id, scheduledFor, updated: true }
    }
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
