import { NextRequest, NextResponse } from 'next/server'
import {
  DIET_WEATHER_TEMPLATE_CATALOG,
  getDietWeatherTemplatePreview,
  resolveDietWeatherContext,
  resolveDietWeatherContextByCoords,
  type DietClimateKind,
} from '@/lib/dietWeatherContext'

const PREVIEW_KINDS = new Set<DietClimateKind>(['hot', 'rainy', 'cold', 'pleasant'])

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'private, no-store, max-age=0',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET — 根据请求 IP 返回城市/天气与卡片模板（生成 AI 前展示） */
export async function GET(req: NextRequest) {
  try {
    const preview = req.nextUrl.searchParams.get('preview') as DietClimateKind | null
    if (preview && PREVIEW_KINDS.has(preview)) {
      const allowPreview =
        process.env.NODE_ENV === 'development' ||
        process.env.DIET_ADVICE_ALLOW_PREVIEW === '1'
      if (allowPreview) {
        return NextResponse.json(
          {
            success: true,
            context: getDietWeatherTemplatePreview(preview),
            preview: true,
            templates: undefined,
          },
          { headers: corsHeaders }
        )
      }
    }

    if (req.nextUrl.searchParams.get('list') === '1') {
      return NextResponse.json(
        {
          success: true,
          templates: DIET_WEATHER_TEMPLATE_CATALOG.map((t) => ({
            ...t,
            context: getDietWeatherTemplatePreview(t.kind),
          })),
        },
        { headers: corsHeaders }
      )
    }

    const latStr = req.nextUrl.searchParams.get('latitude')
    const lonStr = req.nextUrl.searchParams.get('longitude')
    const lat = latStr != null ? Number(latStr) : NaN
    const lon = lonStr != null ? Number(lonStr) : NaN

    const context =
      Number.isFinite(lat) && Number.isFinite(lon)
        ? await resolveDietWeatherContextByCoords(lat, lon)
        : await resolveDietWeatherContext(req)

    return NextResponse.json({ success: true, context }, { headers: corsHeaders })
  } catch (e: unknown) {
    console.error('[diet-advice/context] GET', e)
    return NextResponse.json(
      { success: false, error: '获取天气上下文失败' },
      { status: 500, headers: corsHeaders }
    )
  }
}
