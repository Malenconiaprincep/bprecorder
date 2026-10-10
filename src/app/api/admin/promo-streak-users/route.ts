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

/**
 * GET 全勤用户（JSON 或 HTML）
 * - Query: slug | campaign_slug（必填）, from, to 可选；format=json|html（默认 json；浏览器可看 html）
 * - 更短路径：GET /api/admin/promo-streak/&lt;slug&gt;
 */
export async function GET(request: NextRequest) {
  if (!checkAdmin(request)) {
    return unauthorized()
  }
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ success: false, error: '服务器未配置 Supabase' }, { status: 500 })
  }

  const q = request.nextUrl.searchParams.get('campaign_slug') || request.nextUrl.searchParams.get('slug') || ''
  const slug = normalizePromoSlug(q)
  if (!slug) {
    return NextResponse.json({ success: false, error: '请传 slug（或 campaign_slug）' }, { status: 400 })
  }

  const fromRaw = request.nextUrl.searchParams.get('from')
  const toRaw = request.nextUrl.searchParams.get('to')
  const format = request.nextUrl.searchParams.get('format')?.trim().toLowerCase()

  const result = await runPromoFullStreakReport(supabaseUrl, supabaseServiceKey, slug, fromRaw, toRaw)
  if (!result.ok) {
    const { status, error } = result.err
    return NextResponse.json({ success: false, error }, { status })
  }

  if (format === 'html') {
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
