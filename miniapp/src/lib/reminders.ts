import Taro from '@tarojs/taro'
import { API_BASE_URL } from '../utils/api'
import { SUBSCRIBE_TEMPLATE_ID } from '../config/subscribe'

const REMINDER_ENABLED_KEY = 'bp_reminder_enabled'
const REMINDER_TIME_KEY = 'bp_reminder_time'
const REMINDER_RENEW_PROMPT_DATE_KEY = 'bp_reminder_renew_prompt_date'

export type ReminderSettings = {
  reminderEnabled: boolean
  reminderTime: string
  reminderTimezone: string
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  reminderEnabled: false,
  reminderTime: '09:00',
  reminderTimezone: 'Asia/Shanghai',
}

/** 与 Vercel Cron（每小时 :00 / :30）对齐的可选时刻 */
export const REMINDER_TIME_SLOTS: string[] = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2)
  const minute = i % 2 === 0 ? '00' : '30'
  return `${String(hour).padStart(2, '0')}:${minute}`
})

/** 将任意 HH:mm 对齐到最近的整点/半点 */
export function snapReminderTimeToSlot(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time).trim())
  if (!match) return DEFAULT_REMINDER_SETTINGS.reminderTime

  const total = Number(match[1]) * 60 + Number(match[2])
  if (!Number.isFinite(total)) return DEFAULT_REMINDER_SETTINGS.reminderTime

  let snapped = Math.round(total / 30) * 30
  if (snapped >= 24 * 60) snapped = 0

  const hour = Math.floor(snapped / 60)
  const minute = snapped % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function getReminderTimeSlotIndex(time: string): number {
  const snapped = snapReminderTimeToSlot(time)
  const idx = REMINDER_TIME_SLOTS.indexOf(snapped)
  return idx >= 0 ? idx : REMINDER_TIME_SLOTS.indexOf('09:00')
}

let cachedTemplateId: string | null = null

export function getLocalReminderSettings(): ReminderSettings {
  try {
    const enabled = Taro.getStorageSync(REMINDER_ENABLED_KEY)
    const time = Taro.getStorageSync(REMINDER_TIME_KEY)
    return {
      reminderEnabled: enabled === true || enabled === '1' || enabled === 1,
      reminderTime:
        typeof time === 'string' && /^\d{1,2}:\d{2}$/.test(time)
          ? snapReminderTimeToSlot(time)
          : DEFAULT_REMINDER_SETTINGS.reminderTime,
      reminderTimezone: 'Asia/Shanghai',
    }
  } catch {
    return { ...DEFAULT_REMINDER_SETTINGS }
  }
}

export function saveLocalReminderSettings(settings: Partial<ReminderSettings>): void {
  try {
    if (typeof settings.reminderEnabled === 'boolean') {
      Taro.setStorageSync(REMINDER_ENABLED_KEY, settings.reminderEnabled ? '1' : '0')
    }
    if (settings.reminderTime) {
      Taro.setStorageSync(REMINDER_TIME_KEY, settings.reminderTime)
    }
  } catch (e) {
    console.warn('[reminders] save local failed', e)
  }
}

export async function fetchServerReminderSettings(openid: string): Promise<ReminderSettings | null> {
  try {
    const response = await Taro.request({
      url: `${API_BASE_URL}/api/user-settings`,
      method: 'GET',
      header: { 'x-openid': openid },
    })
    if (response.statusCode === 200 && response.data?.success && response.data.settings) {
      const s = response.data.settings
      return {
        reminderEnabled: Boolean(s.reminderEnabled),
        reminderTime: snapReminderTimeToSlot(s.reminderTime || '09:00'),
        reminderTimezone: s.reminderTimezone || 'Asia/Shanghai',
      }
    }
  } catch (e) {
    console.warn('[reminders] fetch server settings failed', e)
  }
  return null
}

export async function updateServerReminderSettings(
  openid: string,
  settings: Partial<ReminderSettings>
): Promise<{ success: boolean; error?: string; settings?: ReminderSettings }> {
  try {
    const response = await Taro.request({
      url: `${API_BASE_URL}/api/user-settings`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'x-openid': openid,
      },
      data: {
        reminderEnabled: settings.reminderEnabled,
        reminderTime: settings.reminderTime,
        reminderTimezone: settings.reminderTimezone,
      },
    })

    if (response.statusCode === 200 && response.data?.success) {
      const s = response.data.settings
      const merged: ReminderSettings = {
        reminderEnabled: Boolean(s?.reminderEnabled),
        reminderTime: s?.reminderTime || settings.reminderTime || '09:00',
        reminderTimezone: s?.reminderTimezone || 'Asia/Shanghai',
      }
      saveLocalReminderSettings(merged)
      return { success: true, settings: merged }
    }

    return { success: false, error: response.data?.error || '更新失败' }
  } catch (e: any) {
    return { success: false, error: e.message || '网络请求失败' }
  }
}

export async function getSubscribeTemplateId(): Promise<string> {
  if (cachedTemplateId) return cachedTemplateId

  try {
    const response = await Taro.request({
      url: `${API_BASE_URL}/api/subscribe/config`,
      method: 'GET',
    })
    if (response.statusCode === 200 && response.data?.success && response.data.templateId) {
      cachedTemplateId = response.data.templateId
      return cachedTemplateId
    }
  } catch (e) {
    console.warn('[reminders] fetch template id failed, use local fallback', e)
  }

  cachedTemplateId = SUBSCRIBE_TEMPLATE_ID
  return cachedTemplateId
}

type SubscribeAuthStatus = 'accept' | 'reject' | 'ban' | 'filter' | undefined

/** 必须在用户点击事件中调用 */
export async function requestSubscribeAuth(templateId: string): Promise<SubscribeAuthStatus> {
  try {
    const res = await Taro.requestSubscribeMessage({ tmplIds: [templateId] })
    return res[templateId] as SubscribeAuthStatus
  } catch (e) {
    console.warn('[reminders] requestSubscribeMessage failed', e)
    return undefined
  }
}

export async function registerSubscribeToken(params: {
  openid: string
  templateId: string
  status: 'accept' | 'reject' | 'ban'
  reminderTime?: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await Taro.request({
      url: `${API_BASE_URL}/api/subscribe/register`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'x-openid': params.openid,
      },
      data: {
        templateId: params.templateId,
        status: params.status,
        reminderTime: params.reminderTime,
      },
    })

    if (response.statusCode === 200 && response.data?.success) {
      return { success: true }
    }
    return { success: false, error: response.data?.error || '登记失败' }
  } catch (e: any) {
    return { success: false, error: e.message || '网络请求失败' }
  }
}

/** 开启/续订提醒：请求授权并登记额度（需在用户点击回调中调用） */
export async function authorizeReminderSubscribe(
  openid: string,
  reminderTime: string
): Promise<{ ok: boolean; message: string }> {
  const templateId = await getSubscribeTemplateId()

  const status = await requestSubscribeAuth(templateId)
  if (status === 'accept') {
    const reg = await registerSubscribeToken({
      openid,
      templateId,
      status: 'accept',
      reminderTime,
    })
    if (!reg.success) {
      return { ok: false, message: reg.error || '登记提醒失败' }
    }
    return { ok: true, message: '已开启消息提醒' }
  }

  if (status === 'reject' || status === 'ban') {
    await registerSubscribeToken({ openid, templateId, status: status === 'ban' ? 'ban' : 'reject', reminderTime })
    return { ok: false, message: '未授权将无法收到微信提醒' }
  }

  return { ok: false, message: '未能完成消息授权' }
}

function getLocalDateKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function hasPromptedRenewToday(): boolean {
  try {
    return Taro.getStorageSync(REMINDER_RENEW_PROMPT_DATE_KEY) === getLocalDateKey()
  } catch {
    return false
  }
}

function markRenewPromptedToday(): void {
  try {
    Taro.setStorageSync(REMINDER_RENEW_PROMPT_DATE_KEY, getLocalDateKey())
  } catch {
    /* ignore */
  }
}

/**
 * 保存记录成功后：若已开启提醒，引导续订明日额度（每天最多弹一次）
 * 注意：授权弹窗必须在用户点击「去授权」后触发
 */
export function promptRenewReminderAfterSave(openid: string, reminderTime: string): void {
  const local = getLocalReminderSettings()
  if (!local.reminderEnabled) return
  if (hasPromptedRenewToday()) return

  markRenewPromptedToday()

  Taro.showModal({
    title: '续订测量提醒',
    content: '一次性订阅每次授权可提醒一次。是否授权接收下次测量提醒？',
    confirmText: '去授权',
    cancelText: '暂不',
    success: async (res) => {
      if (!res.confirm) return
      const result = await authorizeReminderSubscribe(openid, reminderTime)
      Taro.showToast({
        title: result.message,
        icon: result.ok ? 'success' : 'none',
      })
    },
  })
}
