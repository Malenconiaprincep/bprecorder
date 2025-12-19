import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as crypto from 'crypto'

// 微信小程序配置 - 请在环境变量中配置
const WX_APPID = process.env.WX_APPID || ''
const WX_SECRET = process.env.WX_SECRET || ''

// JWT 密钥 - 必须在环境变量中配置，且必须是足够长且随机的字符串
// 建议使用至少 32 个字符的随机字符串
// 生成方法：node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
const JWT_SECRET = process.env.JWT_SECRET

// 延迟检查 JWT_SECRET，避免在模块加载时抛出错误
function getJWTSecret(): string {
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error('⚠️  JWT_SECRET 未配置或长度不足！请设置至少 32 个字符的随机字符串')
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET 必须在生产环境中配置')
    }
    // 开发环境返回一个临时密钥（仅用于测试）
    return 'dev-temp-secret-key-please-configure-jwt-secret-in-production'
  }
  return JWT_SECRET
}

// Supabase 配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// 简单的 JWT 生成函数
function generateToken(payload: object, expiresIn: number = 7 * 24 * 60 * 60): string {
  const secret = getJWTSecret()

  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = { ...payload, iat: now, exp: now + expiresIn }

  const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url')
  const base64Payload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url')

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${base64Header}.${base64Payload}`)
    .digest('base64url')

  return `${base64Header}.${base64Payload}.${signature}`
}

// 验证 JWT
export function verifyToken(token: string): { valid: boolean; payload?: any } {
  try {
    const secret = getJWTSecret()

    const [header, payload, signature] = token.split('.')

    const expectedSignature = crypto
      .createHmac('sha256', secret)
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

// 处理 CORS 预检请求
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  })
}

// 导出 runtime 配置，确保在 Vercel 上正确运行
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 添加 GET 方法用于测试（可选，用于调试）
export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'wx-login API is working',
    method: 'GET',
    timestamp: new Date().toISOString()
  }, {
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  })
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  console.log('[wx-login] POST request received at', new Date().toISOString())
  console.log('[wx-login] Request method:', request.method)
  console.log('[wx-login] Request URL:', request.url)

  try {
    let body
    try {
      body = await request.json()
    } catch (jsonError) {
      console.error('[wx-login] Failed to parse JSON:', jsonError)
      return NextResponse.json({
        success: false,
        error: '请求体必须是有效的 JSON 格式'
      }, {
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      })
    }
    const { code, nickName, avatarUrl } = body
    console.log('[wx-login] Request body:', {
      code: code ? 'present' : 'missing',
      nickName: nickName ? 'present' : 'missing',
      avatarUrl: avatarUrl ? 'present' : 'missing'
    })

    if (!code) {
      return NextResponse.json({ success: false, error: '缺少 code 参数' }, {
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    if (!WX_APPID || !WX_SECRET) {
      console.error('Missing WX_APPID or WX_SECRET')
      return NextResponse.json({ success: false, error: '服务器配置错误' }, {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    // 调用微信 code2Session 接口
    const wxUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APPID}&secret=${WX_SECRET}&js_code=${code}&grant_type=authorization_code`

    const wxRes = await fetch(wxUrl)
    const wxData = await wxRes.json()

    if (wxData.errcode) {
      console.error('WeChat API error:', wxData)
      return NextResponse.json({ success: false, error: '微信登录失败: ' + wxData.errmsg }, {
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    const { openid, session_key } = wxData

    if (!openid) {
      return NextResponse.json({ success: false, error: '获取 openid 失败' }, {
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    // 在 Supabase 中查找或创建用户
    let userId = openid
    let dbUserId: number | null = null

    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey)

      // 查找用户（使用 maybeSingle 避免用户不存在时报错）
      const { data: existingUser, error: queryError } = await supabase
        .from('wx_users')
        .select('*')
        .eq('openid', openid)
        .maybeSingle()

      if (queryError) {
        console.error('Failed to query user:', queryError)
      }

      const currentTime = new Date().toISOString()

      if (existingUser) {
        // 用户已存在，更新用户信息（如果有提供头像和昵称）和最近登录时间
        dbUserId = existingUser.id || null
        userId = existingUser.id?.toString() || openid

        // 更新用户信息（包括最近登录时间）
        const updateData: { nickname?: string; avatar_url?: string; last_login_at: string } = {
          last_login_at: currentTime
        }
        if (nickName) updateData.nickname = nickName
        if (avatarUrl) updateData.avatar_url = avatarUrl

        const { error: updateError } = await supabase
          .from('wx_users')
          .update(updateData)
          .eq('id', dbUserId)

        if (updateError) {
          console.error('Failed to update user:', updateError)
        }
      } else {
        // 创建新用户
        const insertData: {
          openid: string
          created_at: string
          last_login_at: string
          nickname?: string
          avatar_url?: string
        } = {
          openid,
          created_at: currentTime,
          last_login_at: currentTime
        }

        if (nickName) insertData.nickname = nickName
        if (avatarUrl) insertData.avatar_url = avatarUrl

        const { data: newUser, error: createError } = await supabase
          .from('wx_users')
          .insert(insertData)
          .select()
          .single()

        if (createError) {
          console.error('Failed to create user:', createError)
          // 即使创建失败也继续，因为 openid 本身就可以作为用户标识
        } else if (newUser) {
          // 成功创建用户，获取数据库返回的用户ID
          dbUserId = newUser.id || null
          userId = newUser.id?.toString() || openid
        }
      }
    }

    // 生成 JWT Token（使用数据库用户ID作为 sub，如果存在的话）
    const token = generateToken({
      openid,
      userId: dbUserId,
      sub: dbUserId?.toString() || openid
    })

    // 获取最新的用户信息（包含头像和昵称）
    let finalNickName = nickName
    let finalAvatarUrl = avatarUrl

    if (supabaseUrl && supabaseServiceKey && dbUserId) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey)
      const { data: latestUser } = await supabase
        .from('wx_users')
        .select('nickname, avatar_url')
        .eq('id', dbUserId)
        .single()

      if (latestUser) {
        finalNickName = latestUser.nickname || nickName
        finalAvatarUrl = latestUser.avatar_url || avatarUrl
      }
    }

    const userInfo = {
      id: dbUserId,
      openid,
      nickName: finalNickName,
      avatarUrl: finalAvatarUrl
    }

    const duration = Date.now() - startTime
    console.log('[wx-login] Success, duration:', duration, 'ms')

    return NextResponse.json({
      success: true,
      token,
      userInfo
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })

  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error('[wx-login] Error after', duration, 'ms:', error)
    console.error('[wx-login] Error stack:', error?.stack)
    return NextResponse.json({
      success: false,
      error: '服务器错误',
      message: error?.message || String(error)
    }, {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}

