/**
 * 微信小程序服务端 API：access_token 缓存 + 订阅消息下发
 */

import { resolveSubscribeTemplateId } from './subscribeConfig'

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

/** 订阅消息模板字段，可通过 WX_SUBSCRIBE_TEMPLATE_DATA JSON 覆盖 */
export function buildReminderTemplateData(reminderTime: string): Record<string, { value: string }> {
  const raw = process.env.WX_SUBSCRIBE_TEMPLATE_DATA?.trim()
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>
      return Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [key, { value: String(value).slice(0, 20) }])
      )
    } catch {
      /* fall through */
    }
  }

  return {
    thing1: { value: '血压测量提醒' },
    time2: { value: reminderTime.slice(0, 20) },
    thing3: { value: '今日尚未记录，记得测量' },
  }
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
