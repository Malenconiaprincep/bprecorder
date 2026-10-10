/**
 * 微信小程序服务端 API：access_token 缓存 + 订阅消息下发
 */

import {
  DEFAULT_SUBSCRIBE_TEMPLATE_DATA,
  resolveSubscribeTemplateId,
} from './subscribeConfig'
import { getLocalDateKey } from './reminderSchedule'

const TOKEN_CACHE: { token: string; expiresAt: number } = { token: '', expiresAt: 0 }

export async function getWechatAccessToken(): Promise<string> {
  const appId = process.env.WX_APPID
  const secret = process.env.WX_SECRET
  if (!appId || !secret) {
    throw new Error('缺少 WX_APPID 或 WX_SECRET')
  }

  const now = Date.now()
  if (TOKEN_CACHE.token && TOKEN_CACHE.expiresAt > now + 60_000) {
    return TOKEN_CACHE.token
  }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(secret)}`
  const res = await fetch(url)
  const data = (await res.json()) as { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string }

  if (!data.access_token) {
    throw new Error(data.errmsg || `获取 access_token 失败 (${data.errcode ?? 'unknown'})`)
  }

  TOKEN_CACHE.token = data.access_token
  TOKEN_CACHE.expiresAt = now + (data.expires_in ?? 7200) * 1000
  return data.access_token
}

export function getSubscribeTemplateId(): string {
  return resolveSubscribeTemplateId()
}

function formatReminderDateTime(reminderTime: string, now = new Date()): string {
  const dateKey = getLocalDateKey(now, 'Asia/Shanghai')
  const [year, month, day] = dateKey.split('-').map(Number)
  return `${year}年${month}月${day}日 ${reminderTime}`
}

function clampTemplateValue(key: string, value: string): string {
  if (/^(thing|phrase|name)\d*$/.test(key)) {
    return value.slice(0, 20)
  }
  return value
}

function interpolateTemplateValue(
  template: string,
  reminderTime: string,
  now = new Date()
): string {
  return template
    .replaceAll('{reminderTime}', reminderTime)
    .replaceAll('{reminderDateTime}', formatReminderDateTime(reminderTime, now))
}

function parseTemplateDataSource(raw: string | undefined): Record<string, string> | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return null
  }
}

/** 订阅消息模板字段，可通过 WX_SUBSCRIBE_TEMPLATE_DATA JSON 覆盖 */
export function buildReminderTemplateData(
  reminderTime: string,
  now = new Date()
): Record<string, { value: string }> {
  const envOverrides = parseTemplateDataSource(process.env.WX_SUBSCRIBE_TEMPLATE_DATA?.trim())
  const source = { ...DEFAULT_SUBSCRIBE_TEMPLATE_DATA, ...envOverrides }

  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      key,
      { value: clampTemplateValue(key, interpolateTemplateValue(String(value), reminderTime, now)) },
    ])
  )
}

export async function sendSubscribeMessage(params: {
  openid: string
  templateId: string
  page?: string
  data: Record<string, { value: string }>
}): Promise<{ ok: true } | { ok: false; errcode?: number; errmsg?: string }> {
  const accessToken = await getWechatAccessToken()
  const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(accessToken)}`

  const body = {
    touser: params.openid,
    template_id: params.templateId,
    page: params.page || 'pages/index/index',
    miniprogram_state: process.env.WX_MINIPROGRAM_STATE || 'formal',
    data: params.data,
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = (await res.json()) as { errcode?: number; errmsg?: string }
  if (data.errcode === 0) {
    return { ok: true }
  }

  return { ok: false, errcode: data.errcode, errmsg: data.errmsg }
}
