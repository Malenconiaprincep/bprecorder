import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyToken } from '../../wx-login/route'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-openid, x-debug-openid',
}

const jsonHeaders = {
  ...corsHeaders,
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  Pragma: 'no-cache',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function normalizeOpenid(raw: string | null | undefined): string | null {
  const t = raw?.trim()
  if (!t || t.startsWith('wx_') || t.length < 8 || t.length > 128 || t.includes('\n') || t.includes('\r')) {
    return null
  }
  return t
}

function getOpenidFromRequest(request: NextRequest): string | null {
  const auth = request.headers.get('authorization') || request.headers.get('Authorization')
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7).trim()
    const { valid, payload } = verifyToken(token)
    if (valid && payload?.openid) {
      const o = normalizeOpenid(payload.openid as string)
      if (o) return o
    }
  }
  const fromHeader = normalizeOpenid(request.headers.get('x-openid'))
  if (fromHeader) return fromHeader
  if (process.env.NODE_ENV === 'development') {
    const dbg = normalizeOpenid(request.headers.get('x-debug-openid'))
    if (dbg) return dbg
  }
  return null
}

function todayDateKeyCST(): string {
  const sh = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const y = sh.getUTCFullYear()
  const m = String(sh.getUTCMonth() + 1).padStart(2, '0')
  const d = String(sh.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function activityPhase(
  windowStart: string,
  windowEnd: string
): 'not_started' | 'active' | 'ended' {
  const today = todayDateKeyCST()
  if (today < windowStart) return 'not_started'
  if (today > windowEnd) return 'ended'
  return 'active'
}

/** GET — 小程序活动中心：已启用的活动列表（不含个人进度） */
export async function GET(request: NextRequest) {
  try {
    const openid = getOpenidFromRequest(request)
    if (!openid) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401, headers: jsonHeaders })
    }
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ success: false, error: '服务器配置错误' }, { status: 500, headers: jsonHeaders })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data, error } = await supabase
      .from('promo_campaigns')
      .select('slug, title, window_start_date, window_end_date, required_streak_days, is_enabled')
      .eq('is_enabled', true)
      .order('window_end_date', { ascending: false })

    if (error) {
      console.error('[promo/campaigns] GET', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: jsonHeaders })
    }

    const campaigns = (data || []).map((row) => {
      const window_start = String(row.window_start_date).slice(0, 10)
      const window_end = String(row.window_end_date).slice(0, 10)
      return {
        slug: row.slug as string,
        title: (row.title as string) || row.slug,
        window_start,
        window_end,
        required_streak_days: row.required_streak_days as number,
        activity_phase: activityPhase(window_start, window_end),
      }
    })

    return NextResponse.json({ success: true, campaigns }, { headers: jsonHeaders })
  } catch (e: unknown) {
    console.error('[promo/campaigns] GET', e)
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500, headers: jsonHeaders })
  }
}
