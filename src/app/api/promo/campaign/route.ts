import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyToken } from '../../wx-login/route'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

/** 默认活动 slug；也可用 GET/POST ?slug=xxx 覆盖（便于联调多期） */
function resolveCampaignSlug(request: NextRequest): string {
  const q = request.nextUrl.searchParams.get('slug')?.trim()
  if (q) return q
  return (process.env.PROMO_CAMPAIGN_SLUG || 'consecutive-streak').trim()
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-openid, x-debug-openid',
}

/** 活动进度依赖实时库内统计，禁止 CDN/浏览器误缓存 GET 结果 */
const promoJsonHeaders = {
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

/**
 * 识别用户：优先 JWT；否则使用小程序传来的 x-openid（与 bp_records.user_id 一致）。
 * 开发环境可额外使用 x-debug-openid。
 */
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

/** 业务错误码 → 中文提示（通用校验）；具体奖品文案由数据库 promo_campaigns 返回 */
const ERR_CN: Record<string, string> = {
  not_started: '活动尚未开始',
  ended: '活动已结束',
  already_claimed: '您已提交过申请，每个用户仅可领取一次',
  not_qualified: '暂未满足活动达标条件（详见活动说明）',
  sold_out: '礼品名额已满，感谢参与',
  invalid_name: '请填写有效收件人姓名',
  invalid_phone: '请填写有效手机号',
  invalid_address: '请填写详细收件地址',
  rpc_missing: '活动服务未就绪，请稍后再试',
  campaign_not_found: '活动未配置或已停用，请稍后再试',
}

type RpcStatus = {
  ok?: boolean
  error?: string
  activity_phase?: string
  window_start?: string
  window_end?: string
  required_streak_days?: number
  [key: string]: unknown
}

function promoUnauthorizedResponse() {
  const path = '/api/promo/campaign'
  return NextResponse.json(
    {
      success: false,
      error: '请先登录',
      ...(process.env.NODE_ENV === 'development'
        ? {
            devHint: `需有效 JWT，或请求头 x-openid（值须与 bp_records.user_id 一致，一般为微信 openid）。浏览器试：curl -H "x-openid:你的user_id" "http://localhost:3000${path}"`,
          }
        : {}),
    },
    { status: 401, headers: promoJsonHeaders }
  )
}

export async function GET(request: NextRequest) {
  const campaignSlug = resolveCampaignSlug(request)
  try {
    const openid = getOpenidFromRequest(request)
    if (!openid) {
      return promoUnauthorizedResponse()
    }
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ success: false, error: '服务器配置错误' }, { status: 500, headers: promoJsonHeaders })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data, error } = await supabase.rpc('promo_campaign_streak_status', {
      p_user_id: openid,
      p_slug: campaignSlug,
    })

    if (error) {
      console.error('[promo/campaign] status rpc error:', error)
      return NextResponse.json(
        { success: false, error: ERR_CN.rpc_missing, code: 'rpc_error', detail: error.message },
        { status: 503, headers: promoJsonHeaders }
      )
    }

    const row = data as RpcStatus | null
    if (!row || row.ok === false) {
      const code = (row?.error as string) || 'campaign_not_found'
      return NextResponse.json(
        {
          success: false,
          error: ERR_CN[code] || '活动不可用',
          code,
          campaignSlug,
        },
        { status: 404, headers: promoJsonHeaders }
      )
    }

    const { ok: _drop, ...status } = row
    return NextResponse.json({ success: true, status, campaignSlug }, { headers: promoJsonHeaders })
  } catch (e: any) {
    console.error('[promo/campaign] GET', e)
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500, headers: promoJsonHeaders })
  }
}

export async function POST(request: NextRequest) {
  const campaignSlug = resolveCampaignSlug(request)
  try {
    const openid = getOpenidFromRequest(request)
    if (!openid) {
      return promoUnauthorizedResponse()
    }

    let body: { recipientName?: string; phone?: string; address?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, error: '请求体无效' }, { status: 400, headers: promoJsonHeaders })
    }

    const recipientName = typeof body.recipientName === 'string' ? body.recipientName : ''
    const phone = typeof body.phone === 'string' ? body.phone : ''
    const address = typeof body.address === 'string' ? body.address : ''

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ success: false, error: '服务器配置错误' }, { status: 500, headers: promoJsonHeaders })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data, error } = await supabase.rpc('promo_campaign_streak_claim', {
      p_user_id: openid,
      p_slug: campaignSlug,
      p_recipient_name: recipientName,
      p_phone: phone,
      p_address: address,
    })

    if (error) {
      console.error('[promo/campaign] claim rpc error:', error)
      return NextResponse.json(
        { success: false, error: ERR_CN.rpc_missing, code: 'rpc_error', detail: error.message },
        { status: 503, headers: promoJsonHeaders }
      )
    }

    const row = data as { ok?: boolean; error?: string; prize_tier?: string; prize_label?: string } | null
    if (!row || row.ok !== true) {
      const code = row?.error || 'unknown'
      return NextResponse.json(
        {
          success: false,
          error: ERR_CN[code] || '申请失败，请稍后再试',
          code,
        },
        { status: 400, headers: promoJsonHeaders }
      )
    }

    return NextResponse.json(
      {
        success: true,
        prizeTier: row.prize_tier,
        prizeLabel: row.prize_label || row.prize_tier,
        campaignSlug,
      },
      { headers: promoJsonHeaders }
    )
  } catch (e: any) {
    console.error('[promo/campaign] POST', e)
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500, headers: promoJsonHeaders })
  }
}
