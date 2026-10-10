import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const adminKey = process.env.PROMO_ADMIN_KEY || ''

function unauthorized() {
  return NextResponse.json({ success: false, error: '无权限' }, { status: 401 })
}

function checkAdmin(request: NextRequest): boolean {
  if (process.env.NODE_ENV === 'development') {
    return true
  }
  if (!adminKey || adminKey.length < 8) {
    return false
  }
  const key = request.headers.get('x-promo-admin-key') || ''
  return key === adminKey
}

function normalizeSlug(s: string): string | null {
  const t = s.trim()
  if (!t || t.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(t)) return null
  return t
}

function normalizeUserId(s: string): string | null {
  const t = s.trim()
  if (!t || t.length < 8 || t.length > 128 || t.includes('\n') || t.includes('\r')) return null
  return t
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET — 某期活动已领取名单（query: campaign_slug 或 slug）
 */
export async function GET(request: NextRequest) {
  if (!checkAdmin(request)) {
    return unauthorized()
  }
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ success: false, error: '服务器未配置 Supabase' }, { status: 500 })
  }

  const q = request.nextUrl.searchParams.get('campaign_slug') || request.nextUrl.searchParams.get('slug') || ''
  const slug = normalizeSlug(q)
  if (!slug) {
    return NextResponse.json({ success: false, error: '请传 campaign_slug（或 slug）' }, { status: 400 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { data, error } = await supabase
    .from('promo_campaign_claims')
    .select('id,campaign_slug,user_id,prize_tier,recipient_name,phone,address,created_at')
    .eq('campaign_slug', slug)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[admin/promo-claims] GET', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const { data: tierRows, error: tierErr } = await supabase
    .from('promo_campaign_prize_tiers')
    .select('tier_key,tier_name')
    .eq('campaign_slug', slug)

  if (tierErr) {
    console.error('[admin/promo-claims] GET tiers', tierErr)
    return NextResponse.json({ success: false, error: tierErr.message }, { status: 500 })
  }

  const tier_name_by_key: Record<string, string> = {}
  for (const r of tierRows || []) {
    const k = r.tier_key as string
    tier_name_by_key[k] = ((r.tier_name as string) || '').trim() || k
  }

  return NextResponse.json({
    success: true,
    campaign_slug: slug,
    claims: data || [],
    tier_name_by_key,
  })
}

/**
 * POST — 管理领取记录（仅管理端，联调/复测用）。
 * - 单用户：{ campaign_slug, user_id }
 * - 整期清空：{ campaign_slug, reset_all_claims: true }（删除该 slug 下全部领取行）
 */
export async function POST(request: NextRequest) {
  if (!checkAdmin(request)) {
    return unauthorized()
  }
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ success: false, error: '服务器未配置 Supabase' }, { status: 500 })
  }

  let body: { campaign_slug?: string; user_id?: string; reset_all_claims?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '无效 JSON' }, { status: 400 })
  }

  const slug = typeof body.campaign_slug === 'string' ? normalizeSlug(body.campaign_slug) : null
  if (!slug) {
    return NextResponse.json({ success: false, error: 'campaign_slug 无效（仅字母数字、下划线、连字符，≤64）' }, { status: 400 })
  }

  const resetAll = body.reset_all_claims === true
  const userIdRaw = typeof body.user_id === 'string' ? body.user_id.trim() : ''
  const userId = userIdRaw ? normalizeUserId(userIdRaw) : null

  if (resetAll) {
    if (userIdRaw) {
      return NextResponse.json(
        { success: false, error: '整期清空时不要传 user_id；若只删一人请去掉 reset_all_claims' },
        { status: 400 }
      )
    }
  } else {
    if (!userId) {
      return NextResponse.json({ success: false, error: '请传 user_id，或传 reset_all_claims: true 清空该期全部领取' }, { status: 400 })
    }
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const del = supabase.from('promo_campaign_claims').delete().eq('campaign_slug', slug)
  const { data, error } = await (resetAll ? del : del.eq('user_id', userId as string)).select('id')

  if (error) {
    console.error('[admin/promo-claims] DELETE', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const deleted = Array.isArray(data) ? data.length : 0
  const message = resetAll
    ? deleted === 0
      ? '该活动下暂无领取记录'
      : `已清空该活动全部领取，共删除 ${deleted} 条`
    : deleted === 0
      ? '未找到对应记录（可能已删过或 slug/user 不匹配）'
      : `已删除 ${deleted} 条领取记录`

  return NextResponse.json({
    success: true,
    deleted,
    reset_all: resetAll,
    message,
  })
}
