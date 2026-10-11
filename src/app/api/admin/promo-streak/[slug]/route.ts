import { NextRequest, NextResponse } from 'next/server'
import {
  fullStreakReportToHtml,
  normalizePromoSlug,
  runPromoFullStreakReport,
} from '@/lib/promo-admin-full-streak-report'

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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteCtx = { params: Promise<{ slug: string }> }

/**
 * GET /api/admin/promo-streak/&lt;slug&gt;
 * - 可选 query：from、to（YYYY-MM-DD）；format=html 浏览器直接看表格，省略或 json 返回 JSON
 */
export async function GET(request: NextRequest, ctx: RouteCtx) {
  if (!checkAdmin(request)) {
    return unauthorized()
  }
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ success: false, error: '服务器未配置 Supabase' }, { status: 500 })
  }

  const raw = (await ctx.params).slug
  const slug = normalizePromoSlug(decodeURIComponent(raw))
  if (!slug) {
    return NextResponse.json({ success: false, error: 'slug 无效' }, { status: 400 })
  }

  const fromRaw = request.nextUrl.searchParams.get('from')
  const toRaw = request.nextUrl.searchParams.get('to')
  const format = request.nextUrl.searchParams.get('format')?.trim().toLowerCase()

  const result = await runPromoFullStreakReport(supabaseUrl, supabaseServiceKey, slug, fromRaw, toRaw)
  if (!result.ok) {
    const { status, error } = result.err
    return NextResponse.json({ success: false, error }, { status })
  }

  const wantHtml =
    format === 'html' || (format !== 'json' && request.headers.get('Accept')?.includes('text/html'))
  if (wantHtml) {
    const html = fullStreakReportToHtml(result.data)
    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  return NextResponse.json({
    success: true,
    ...result.data,
  })
}
