import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Supabase 配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// 复用 Supabase 客户端
let supabaseInstance: SupabaseClient | null = null
function getSupabase() {
  if (!supabaseInstance && supabaseUrl && supabaseServiceKey) {
    supabaseInstance = createClient(supabaseUrl, supabaseServiceKey)
  }
  return supabaseInstance
}

// CORS 头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// 处理 CORS 预检请求
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

// POST: 上传头像
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const userId = formData.get('userId') as string | null

    if (!file || !userId) {
      return NextResponse.json(
        { success: false, error: '缺少文件或用户ID' },
        { status: 400, headers: corsHeaders }
      )
    }

    const supabase = getSupabase()
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: '服务器配置错误' },
        { status: 500, headers: corsHeaders }
      )
    }

    // 生成唯一文件名
    const ext = file.name.split('.').pop() || 'jpg'
    const fileName = `${userId}_${Date.now()}.${ext}`
    const filePath = `avatars/${fileName}`

    // 将 File 转换为 ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // 上传到 Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('user-files')
      .upload(filePath, buffer, {
        contentType: file.type || 'image/jpeg',
        upsert: true
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json(
        { success: false, error: '上传失败: ' + uploadError.message },
        { status: 500, headers: corsHeaders }
      )
    }

    // 获取公开URL
    const { data: urlData } = supabase.storage
      .from('user-files')
      .getPublicUrl(filePath)

    const publicUrl = urlData.publicUrl

    // 更新用户头像URL
    const { error: updateError } = await supabase
      .from('wx_users')
      .update({ avatar_url: publicUrl })
      .eq('openid', userId)

    if (updateError) {
      console.error('Update user error:', updateError)
      // 即使更新失败，也返回URL，让前端可以重试
    }

    return NextResponse.json({
      success: true,
      url: publicUrl
    }, { headers: corsHeaders })

  } catch (error: any) {
    console.error('Upload avatar error:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500, headers: corsHeaders }
    )
  }
}

