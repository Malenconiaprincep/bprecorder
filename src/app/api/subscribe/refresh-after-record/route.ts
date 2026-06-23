import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refreshSubscribeTokenAfterRecord } from '@/lib/subscribeTokenStore'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-openid',
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

/** POST - 保存血压记录后刷新订阅排期（服务端更新 scheduled_for / consumed） */
export async function POST(request: NextRequest) {
  try {
    const openid = request.headers.get('x-openid')?.trim()
    if (!openid) {
      return NextResponse.json({ success: false, error: '缺少用户标识' }, {
        status: 400,
        headers: corsHeaders,
      })
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ success: false, error: '服务器配置错误' }, {
        status: 500,
        headers: corsHeaders,
      })
    }

    let body: { reminderTime?: string } = {}
    try {
      const raw = await request.text()
      if (raw.trim()) body = JSON.parse(raw) as { reminderTime?: string }
    } catch {
      /* empty body ok */
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const result = await refreshSubscribeTokenAfterRecord(
      supabase,
      openid,
      body.reminderTime
    )

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.reason || '更新失败' }, {
        status: 500,
        headers: corsHeaders,
      })
    }

    return NextResponse.json(
      {
        success: true,
        updated: result.updated,
        scheduledFor: result.scheduledFor,
        reason: result.reason,
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('[subscribe/refresh-after-record] error', error)
    return NextResponse.json({ success: false, error: '服务器错误' }, {
      status: 500,
      headers: corsHeaders,
    })
  }
}
