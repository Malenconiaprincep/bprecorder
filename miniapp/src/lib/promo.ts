import Taro from '@tarojs/taro'
import { API_BASE_URL } from '../utils/api'
import { getToken, silentLogin, getUserInfo } from './auth'

/** 与 bp_records.user_id 一致；JWT 可选，无 token 时仅靠 x-openid 也可调活动接口。 */
async function buildPromoHeaders(): Promise<Record<string, string>> {
  let t = getToken()
  if (!t) {
    const r = await silentLogin()
    if (r.success && r.token) t = r.token
    else t = getToken()
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (t) headers['Authorization'] = `Bearer ${t}`

  const oid = getUserInfo()?.openid
  if (oid && !oid.startsWith('wx_')) {
    headers['x-openid'] = oid
  }
  return headers
}

function canPromoRequest(headers: Record<string, string>): boolean {
  return !!(headers['x-openid'] || headers['Authorization'])
}

export type PromoConsecutivePhase = 'not_started' | 'active' | 'ended'

/** 与接口 prize_tiers 一致；remaining 为当前剩余名额 */
export interface PromoPrizeTierStatus {
  tier_key: string
  tier_name: string
  sort_order: number
  slots: number
  label: string
  remaining: number
}

export interface PromoConsecutiveStatusPayload {
  campaign_slug?: string
  title?: string
  activity_phase: PromoConsecutivePhase
  window_start: string
  window_end: string
  timezone: string
  required_streak_days?: number
  grand_prize_slots?: number
  second_prize_slots?: number
  grand_prize_label?: string
  second_prize_label?: string
  /** 多档位；优先用于展示名额与礼品说明 */
  prize_tiers?: PromoPrizeTierStatus[]
  /**
   * 活动窗口内（见 window_start/window_end 与 timezone）最长连续有记录天数；
   * 由服务端根据 bp_records 全量统计；连续日按入库时间 created_at 计日（无则回退 recorded_at），与首页本地列表分页无关。
   */
  streak_days_in_window: number
  qualified: boolean
  my_claim: {
    prize_tier: string
    tier_name?: string
    recipient_name: string
    phone: string
    address: string
    created_at: string
  } | null
  remaining_grand: number
  remaining_second: number
  sold_out: boolean
}

/** 优先使用接口返回的 prize_tiers；否则由大奖/二等奖字段拼出（兼容旧 RPC） */
export function promoDisplayPrizeTiers(status: PromoConsecutiveStatusPayload): PromoPrizeTierStatus[] {
  if (status.prize_tiers && status.prize_tiers.length > 0) {
    return [...status.prize_tiers].sort((a, b) => a.sort_order - b.sort_order)
  }
  return [
    {
      tier_key: 'grand',
      tier_name: '大奖',
      sort_order: 1,
      slots: status.grand_prize_slots ?? 0,
      label: status.grand_prize_label ?? '',
      remaining: status.remaining_grand ?? 0,
    },
    {
      tier_key: 'second',
      tier_name: '二等奖',
      sort_order: 2,
      slots: status.second_prize_slots ?? 0,
      label: status.second_prize_label ?? '',
      remaining: status.remaining_second ?? 0,
    },
  ]
}

export type PromoCampaignListItem = {
  slug: string
  title: string
  window_start: string
  window_end: string
  required_streak_days: number
  activity_phase: PromoConsecutivePhase
}

export async function fetchPromoCampaignList(): Promise<{
  ok: boolean
  campaigns?: PromoCampaignListItem[]
  error?: string
  httpStatus?: number
}> {
  const url = `${API_BASE_URL}/api/promo/campaigns?_=${Date.now()}`
  const doGet = async (header: Record<string, string>) =>
    Taro.request({ url, method: 'GET', header })

  try {
    await silentLogin()
    let headers = await buildPromoHeaders()
    if (!canPromoRequest(headers)) {
      return { ok: false, error: '请先登录' }
    }
    let res = await doGet(headers)
    if (res.statusCode === 401) {
      await silentLogin()
      headers = await buildPromoHeaders()
      if (!canPromoRequest(headers)) {
        return { ok: false, error: (res.data as { error?: string })?.error || '请先登录' }
      }
      res = await doGet(headers)
    }
    if (res.statusCode >= 200 && res.statusCode < 300 && res.data?.success) {
      return {
        ok: true,
        campaigns: (res.data.campaigns || []) as PromoCampaignListItem[],
      }
    }
    const data = res.data as { error?: string } | undefined
    return {
      ok: false,
      error: data?.error || '加载活动列表失败',
      httpStatus: res.statusCode,
    }
  } catch (e: any) {
    return { ok: false, error: e.message || '网络错误' }
  }
}

export async function fetchPromoCampaignStatus(slug?: string): Promise<{
  ok: boolean
  status?: PromoConsecutiveStatusPayload
  error?: string
  /** 与 HTTP 状态或业务 code 对应，便于前端区分「未登录」与「活动未配置」等 */
  httpStatus?: number
  code?: string
}> {
  const promoStatusUrl = () => {
    const base = `${API_BASE_URL}/api/promo/campaign`
    const q = new URLSearchParams({ _: String(Date.now()) })
    if (slug?.trim()) q.set('slug', slug.trim())
    return `${base}?${q.toString()}`
  }

  const doGet = async (header: Record<string, string>) =>
    Taro.request({
      url: promoStatusUrl(),
      method: 'GET',
      header,
    })

  try {
    await silentLogin()
    let headers = await buildPromoHeaders()
    if (!canPromoRequest(headers)) {
      return { ok: false, error: '请先登录' }
    }
    let res = await doGet(headers)
    if (res.statusCode === 401) {
      await silentLogin()
      headers = await buildPromoHeaders()
      if (!canPromoRequest(headers)) {
        return { ok: false, error: (res.data as { error?: string })?.error || '请先登录' }
      }
      res = await doGet(headers)
    }
    if (res.statusCode >= 200 && res.statusCode < 300 && res.data?.success) {
      return { ok: true, status: res.data.status as PromoConsecutiveStatusPayload }
    }
    const data = res.data as { error?: string; code?: string } | undefined
    return {
      ok: false,
      error: data?.error || '加载活动状态失败',
      httpStatus: res.statusCode,
      code: data?.code,
    }
  } catch (e: any) {
    return { ok: false, error: e.message || '网络错误' }
  }
}

/** @deprecated 使用 fetchPromoCampaignStatus */
export const fetchPromoConsecutive202604Status = fetchPromoCampaignStatus

export async function submitPromoCampaignClaim(
  params: {
    recipientName: string
    phone: string
    address: string
  },
  slug?: string
): Promise<{ ok: boolean; prizeLabel?: string; error?: string }> {
  const body = {
    recipientName: params.recipientName.trim(),
    phone: params.phone.trim(),
    address: params.address.trim(),
  }
  const claimUrl = () => {
    const base = `${API_BASE_URL}/api/promo/campaign`
    if (slug?.trim()) return `${base}?slug=${encodeURIComponent(slug.trim())}`
    return base
  }
  const doPost = async (header: Record<string, string>) =>
    Taro.request({
      url: claimUrl(),
      method: 'POST',
      header,
      data: body,
    })

  try {
    await silentLogin()
    let headers = await buildPromoHeaders()
    if (!canPromoRequest(headers)) {
      return { ok: false, error: '请先登录' }
    }
    let res = await doPost(headers)
    if (res.statusCode === 401) {
      await silentLogin()
      headers = await buildPromoHeaders()
      if (!canPromoRequest(headers)) {
        return { ok: false, error: (res.data as { error?: string })?.error || '请先登录' }
      }
      res = await doPost(headers)
    }
    if (res.statusCode >= 200 && res.statusCode < 300 && res.data?.success) {
      return { ok: true, prizeLabel: res.data.prizeLabel as string }
    }
    return { ok: false, error: res.data?.error || '提交失败' }
  } catch (e: any) {
    return { ok: false, error: e.message || '网络错误' }
  }
}

/** @deprecated 使用 submitPromoCampaignClaim */
export const submitPromoConsecutive202604Claim = submitPromoCampaignClaim
