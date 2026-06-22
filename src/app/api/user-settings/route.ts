import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeReminderTime, parseReminderTime, snapReminderTimeToSlot } from '@/lib/reminderSchedule'

// Supabase 配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-openid',
  'Access-Control-Max-Age': '86400',
}

// 处理 CORS 预检请求
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function buildSettingsResponse(user: {
  font_size_mode?: string | null
  reminder_enabled?: boolean | null
  reminder_time?: string | null
  reminder_timezone?: string | null
}) {
  return {
    fontSizeMode: user?.font_size_mode || 'normal',
    reminderEnabled: Boolean(user?.reminder_enabled),
    reminderTime: snapReminderTimeToSlot(user?.reminder_time || '09:00'),
    reminderTimezone: user?.reminder_timezone || 'Asia/Shanghai',
  }
}

/**
 * GET - 获取用户设置
 */
export async function GET(request: NextRequest) {
  try {
    const openid = request.headers.get('x-openid')

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

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: user, error } = await supabase
      .from('wx_users')
      .select('font_size_mode, reminder_enabled, reminder_time, reminder_timezone')
      .eq('openid', openid)
      .single()

    if (error) {
      console.error('Failed to get user settings:', error)
      return NextResponse.json({ success: false, error: '获取设置失败' }, {
        status: 500,
        headers: corsHeaders,
      })
    }

    return NextResponse.json({
      success: true,
      settings: buildSettingsResponse(user || {}),
    }, {
      headers: corsHeaders,
    })

  } catch (error: any) {
    console.error('[user-settings] GET error:', error)
    return NextResponse.json({
      success: false,
      error: '服务器错误'
    }, {
      status: 500,
      headers: corsHeaders,
    })
  }
}

/**
 * POST - 更新用户设置
 */
export async function POST(request: NextRequest) {
  try {
    const openid = request.headers.get('x-openid')

    if (!openid) {
      return NextResponse.json({ success: false, error: '缺少用户标识' }, {
        status: 400,
        headers: corsHeaders,
      })
    }

    let body
    try {
      body = await request.json()
    } catch (jsonError) {
      return NextResponse.json({
        success: false,
        error: '请求体必须是有效的 JSON 格式'
      }, {
        status: 400,
        headers: corsHeaders,
      })
    }

    const { fontSizeMode, reminderEnabled, reminderTime, reminderTimezone } = body

    // 验证 fontSizeMode 的值
    if (fontSizeMode && !['normal', 'elder'].includes(fontSizeMode)) {
      return NextResponse.json({
        success: false,
        error: '无效的字体模式设置'
      }, {
        status: 400,
        headers: corsHeaders,
      })
    }

    if (reminderTime !== undefined && reminderTime !== null && !parseReminderTime(String(reminderTime))) {
      return NextResponse.json({
        success: false,
        error: '无效的提醒时间，请使用 HH:mm 格式'
      }, {
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const updateData: {
      font_size_mode?: string
      reminder_enabled?: boolean
      reminder_time?: string
      reminder_timezone?: string
    } = {}

    if (fontSizeMode) {
      updateData.font_size_mode = fontSizeMode
    }
    if (typeof reminderEnabled === 'boolean') {
      updateData.reminder_enabled = reminderEnabled
    }
    if (reminderTime !== undefined && reminderTime !== null) {
      updateData.reminder_time = snapReminderTimeToSlot(String(reminderTime))
    }
    if (reminderTimezone && typeof reminderTimezone === 'string') {
      updateData.reminder_timezone = reminderTimezone.trim() || 'Asia/Shanghai'
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({
        success: false,
        error: '没有提供要更新的设置'
      }, {
        status: 400,
        headers: corsHeaders,
      })
    }

    const { error: updateError } = await supabase
      .from('wx_users')
      .update(updateData)
      .eq('openid', openid)

    if (updateError) {
      console.error('Failed to update user settings:', updateError)
      return NextResponse.json({ success: false, error: '更新设置失败' }, {
        status: 500,
        headers: corsHeaders,
      })
    }

    const { data: latest } = await supabase
      .from('wx_users')
      .select('font_size_mode, reminder_enabled, reminder_time, reminder_timezone')
      .eq('openid', openid)
      .single()

    return NextResponse.json({
      success: true,
      message: '设置已更新',
      settings: buildSettingsResponse(latest || {}),
    }, {
      headers: corsHeaders,
    })

  } catch (error: any) {
    console.error('[user-settings] POST error:', error)
    return NextResponse.json({
      success: false,
      error: '服务器错误'
    }, {
      status: 500,
      headers: corsHeaders,
    })
  }
}
