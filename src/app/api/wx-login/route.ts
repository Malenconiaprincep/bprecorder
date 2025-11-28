import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as crypto from 'crypto'

// 微信小程序配置 - 请在环境变量中配置
const WX_APPID = process.env.WX_APPID || ''
const WX_SECRET = process.env.WX_SECRET || ''

// JWT 密钥 - 请在环境变量中配置
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key'

// Supabase 配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// 简单的 JWT 生成函数
function generateToken(payload: object, expiresIn: number = 7 * 24 * 60 * 60): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = { ...payload, iat: now, exp: now + expiresIn }
  
  const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url')
  const base64Payload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url')
  
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${base64Header}.${base64Payload}`)
    .digest('base64url')
  
  return `${base64Header}.${base64Payload}.${signature}`
}

// 验证 JWT
export function verifyToken(token: string): { valid: boolean; payload?: any } {
  try {
    const [header, payload, signature] = token.split('.')
    
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${payload}`)
      .digest('base64url')
    
    if (signature !== expectedSignature) {
      return { valid: false }
    }
    
    const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString())
    
    // 检查过期
    if (decodedPayload.exp && decodedPayload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false }
    }
    
    return { valid: true, payload: decodedPayload }
  } catch (e) {
    return { valid: false }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json()
    
    if (!code) {
      return NextResponse.json({ success: false, error: '缺少 code 参数' }, { status: 400 })
    }

    if (!WX_APPID || !WX_SECRET) {
      console.error('Missing WX_APPID or WX_SECRET')
      return NextResponse.json({ success: false, error: '服务器配置错误' }, { status: 500 })
    }

    // 调用微信 code2Session 接口
    const wxUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APPID}&secret=${WX_SECRET}&js_code=${code}&grant_type=authorization_code`
    
    const wxRes = await fetch(wxUrl)
    const wxData = await wxRes.json()

    if (wxData.errcode) {
      console.error('WeChat API error:', wxData)
      return NextResponse.json({ success: false, error: '微信登录失败: ' + wxData.errmsg }, { status: 400 })
    }

    const { openid, session_key } = wxData

    if (!openid) {
      return NextResponse.json({ success: false, error: '获取 openid 失败' }, { status: 400 })
    }

    // 在 Supabase 中查找或创建用户
    let userId = openid
    
    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey)
      
      // 查找用户
      const { data: existingUser } = await supabase
        .from('wx_users')
        .select('*')
        .eq('openid', openid)
        .single()

      if (!existingUser) {
        // 创建新用户
        const { data: newUser, error } = await supabase
          .from('wx_users')
          .insert({
            openid,
            created_at: new Date().toISOString()
          })
          .select()
          .single()

        if (error) {
          console.error('Failed to create user:', error)
          // 即使创建失败也继续，因为 openid 本身就可以作为用户标识
        }
      }
    }

    // 生成 JWT Token
    const token = generateToken({
      openid,
      sub: openid
    })

    const userInfo = {
      openid,
      // 可以在这里添加更多用户信息
    }

    return NextResponse.json({
      success: true,
      token,
      userInfo
    })

  } catch (error) {
    console.error('wx-login error:', error)
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 })
  }
}

