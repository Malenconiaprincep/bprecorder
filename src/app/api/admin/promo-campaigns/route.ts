import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const adminKey = process.env.PROMO_ADMIN_KEY || ''

function unauthorized() {
  return NextResponse.json({ success: false, error: '无权限' }, { status: 401 })
}

function checkAdmin(request: NextRequest): boolean {
  // 本地 next dev：方便自测，不要求 PROMO_ADMIN_KEY / 请求头（勿用于公网暴露的 dev）
  if (process.env.NODE_ENV === 'development') {
    return true
  }
  if (!adminKey || adminKey.length < 8) {
    return false
  }
  const key = request.headers.get('x-promo-admin-key') || ''
  return key === adminKey
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET — 列出所有活动配置。
 * 生产环境：需配置 PROMO_ADMIN_KEY，且请求头 x-promo-admin-key 一致。
 * 开发环境（next dev）：不要求密钥。
 */
export async function GET(request: NextRequest) {
  if (!checkAdmin(request)) {
    return unauthorized()
  }
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ success: false, error: '服务器未配置 Supabase' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { data, error } = await supabase
    .from('promo_campaigns')
    .select('*')
    .order('slug', { ascending: true })

  if (error) {
    console.error('[admin/promo-campaigns] GET', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const campaigns = data || []
  const slugs = campaigns.map((c) => c.slug as string).filter(Boolean)
  let tiersBySlug = new Map<string, PromoPrizeTierRow[]>()
  if (slugs.length > 0) {
    const { data: tierRows, error: tierErr } = await supabase
      .from('promo_campaign_prize_tiers')
      .select('campaign_slug,tier_key,tier_name,sort_order,slots,label')
      .in('campaign_slug', slugs)
      .order('sort_order', { ascending: true })
    if (tierErr) {
      console.error('[admin/promo-campaigns] GET tiers', tierErr)
      return NextResponse.json({ success: false, error: tierErr.message }, { status: 500 })
    }
    for (const row of tierRows || []) {
      const slug = row.campaign_slug as string
      const list = tiersBySlug.get(slug) || []
      list.push({
        tier_key: row.tier_key as string,
        tier_name: row.tier_name as string,
        sort_order: row.sort_order as number,
        slots: row.slots as number,
        label: row.label as string,
      })
      tiersBySlug.set(slug, list)
    }
  }

  const merged = campaigns.map((c) => ({
    ...c,
    prize_tiers: tiersBySlug.get(c.slug as string) || [],
  }))

  return NextResponse.json({
    success: true,
    campaigns: merged,
    activeSlugHint: process.env.PROMO_CAMPAIGN_SLUG || 'consecutive-streak',
  })
}

export type PromoPrizeTierRow = {
  tier_key: string
  tier_name: string
  sort_order: number
  slots: number
  label: string
}

export type PromoCampaignUpsertBody = {
  slug: string
  title?: string
  window_start_date: string
  window_end_date: string
  required_streak_days?: number
  grand_prize_slots?: number
  second_prize_slots?: number
  grand_prize_label?: string
  second_prize_label?: string
  /** 若传入则整表替换该活动的档位行（与数据库先到先得顺序一致） */
  prize_tiers?: PromoPrizeTierRow[]
  tz?: string
  is_enabled?: boolean
}

const TIER_KEY_RE = /^[a-z][a-z0-9_]{0,31}$/

function normalizePrizeTiers(raw: unknown): { ok: true; tiers: PromoPrizeTierRow[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'prize_tiers 须为非空数组' }
  }
  if (raw.length === 0) {
    return { ok: false, error: '至少配置1 个奖项档位' }
  }
  const tiers: PromoPrizeTierRow[] = []
  const orders = new Set<number>()
  const keys = new Set<string>()
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as Record<string, unknown>
    const tier_key = typeof item.tier_key === 'string' ? item.tier_key.trim() : ''
    if (!TIER_KEY_RE.test(tier_key)) {
      return {
        ok: false,
        error: `prize_tiers[${i}].tier_key 须为小写字母开头、仅含小写字母数字下划线，长度 1–32`,
      }
    }
    if (keys.has(tier_key)) {
      return { ok: false, error: `重复的 tier_key：${tier_key}` }
    }
    keys.add(tier_key)
    const sort_order = Number(item.sort_order)
    if (!Number.isFinite(sort_order) || sort_order < 0 || sort_order > 999) {
      return { ok: false, error: `prize_tiers[${i}].sort_order 须为 0–999 的整数` }
    }
    if (orders.has(sort_order)) {
      return { ok: false, error: `重复的 sort_order：${sort_order}` }
    }
    orders.add(sort_order)
    const slots = Number(item.slots)
    if (!Number.isFinite(slots) || slots < 0 || slots > 1_000_000) {
      return { ok: false, error: `prize_tiers[${i}].slots 须为 0–1000000 的整数` }
    }
    const tier_name =
      typeof item.tier_name === 'string' && item.tier_name.trim() ? item.tier_name.trim() : tier_key
    const label = typeof item.label === 'string' ? item.label.trim() : ''
    tiers.push({ tier_key, tier_name, sort_order, slots, label })
  }
  tiers.sort((a, b) => a.sort_order - b.sort_order)
  return { ok: true, tiers }
}

/**
 * POST — 新建或更新一期活动（按 slug upsert）。
 * 生产环境需密钥；开发环境（next dev）同 GET，不要求密钥。
 */
export async function POST(request: NextRequest) {
  if (!checkAdmin(request)) {
    return unauthorized()
  }
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ success: false, error: '服务器未配置 Supabase' }, { status: 500 })
  }

  let body: PromoCampaignUpsertBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '无效 JSON' }, { status: 400 })
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
  if (!slug || slug.length > 64) {
    return NextResponse.json({ success: false, error: 'slug 必填且不超过 64 字符' }, { status: 400 })
  }

  const ws = body.window_start_date
  const we = body.window_end_date
  if (!ws || !we || !/^\d{4}-\d{2}-\d{2}$/.test(ws) || !/^\d{4}-\d{2}-\d{2}$/.test(we)) {
    return NextResponse.json(
      { success: false, error: 'window_start_date / window_end_date 须为 YYYY-MM-DD' },
      { status: 400 }
    )
  }

  const reqDays = Number(body.required_streak_days)
  let grand = Number(body.grand_prize_slots)
  let second = Number(body.second_prize_slots)
  let grandLabel =
    typeof body.grand_prize_label === 'string' && body.grand_prize_label.trim()
      ? body.grand_prize_label.trim()
      : '上臂式电子血压计 1 台'
  let secondLabel =
    typeof body.second_prize_label === 'string' && body.second_prize_label.trim()
      ? body.second_prize_label.trim()
      : '体脂秤/臂带/健康小礼品（随机）1 份'

  let prizeTiersNormalized: PromoPrizeTierRow[] | null = null
  if (body.prize_tiers !== undefined) {
    const nt = normalizePrizeTiers(body.prize_tiers)
    if (!nt.ok) {
      return NextResponse.json({ success: false, error: nt.error }, { status: 400 })
    }
    prizeTiersNormalized = nt.tiers
    const g = nt.tiers.find((t) => t.tier_key === 'grand')
    const s = nt.tiers.find((t) => t.tier_key === 'second')
    if (g) {
      grand = g.slots
      if (g.label) grandLabel = g.label
    }
    if (s) {
      second = s.slots
      if (s.label) secondLabel = s.label
    }
  }

  const row = {
    slug,
    title: typeof body.title === 'string' ? body.title.trim() : '',
    window_start_date: ws,
    window_end_date: we,
    required_streak_days: Math.max(1, Number.isFinite(reqDays) ? reqDays : 30),
    grand_prize_slots: Math.max(0, Number.isFinite(grand) ? grand : 1),
    second_prize_slots: Math.max(0, Number.isFinite(second) ? second : 3),
    grand_prize_label: grandLabel,
    second_prize_label: secondLabel,
    tz: typeof body.tz === 'string' && body.tz.trim() ? body.tz.trim() : 'Asia/Shanghai',
    is_enabled: body.is_enabled !== false,
    updated_at: new Date().toISOString(),
  }

  if (row.window_end_date < row.window_start_date) {
    return NextResponse.json({ success: false, error: '结束日期不能早于开始日期' }, { status: 400 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { data, error } = await supabase
    .from('promo_campaigns')
    .upsert(row, { onConflict: 'slug' })
    .select()
    .single()

  if (error) {
    console.error('[admin/promo-campaigns] POST', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  if (prizeTiersNormalized) {
    const { error: delErr } = await supabase.from('promo_campaign_prize_tiers').delete().eq('campaign_slug', slug)
    if (delErr) {
      console.error('[admin/promo-campaigns] POST delete tiers', delErr)
      return NextResponse.json({ success: false, error: delErr.message }, { status: 500 })
    }
    const insertRows = prizeTiersNormalized.map((t) => ({
      campaign_slug: slug,
      tier_key: t.tier_key,
      tier_name: t.tier_name,
      sort_order: t.sort_order,
      slots: t.slots,
      label: t.label,
    }))
    const { error: insErr } = await supabase.from('promo_campaign_prize_tiers').insert(insertRows)
    if (insErr) {
      console.error('[admin/promo-campaigns] POST insert tiers', insErr)
      return NextResponse.json({ success: false, error: insErr.message }, { status: 500 })
    }
  }

  const prize_tiers = prizeTiersNormalized ?? (await fetchTiersForSlug(supabase, slug))

  return NextResponse.json({ success: true, campaign: { ...data, prize_tiers } })
}

async function fetchTiersForSlug(supabase: SupabaseClient, slug: string): Promise<PromoPrizeTierRow[]> {
  const { data, error } = await supabase
    .from('promo_campaign_prize_tiers')
    .select('tier_key,tier_name,sort_order,slots,label')
    .eq('campaign_slug', slug)
    .order('sort_order', { ascending: true })
  if (error || !data) return []
  return (data as PromoPrizeTierRow[]).map((row) => ({
    tier_key: row.tier_key,
    tier_name: row.tier_name,
    sort_order: row.sort_order,
    slots: row.slots,
    label: row.label,
  }))
}
