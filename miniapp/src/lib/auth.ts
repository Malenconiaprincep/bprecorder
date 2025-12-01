import Taro from '@tarojs/taro'
import { API_BASE_URL } from '../utils/api'

// 存储 key
const USER_INFO_KEY = 'bp_user_info'
const WX_USER_INFO_KEY = 'bp_wx_user_info'
const TOKEN_KEY = 'bp_token'

export interface UserInfo {
  openid: string
  nickName?: string
  avatarUrl?: string
}

export interface WxUserInfo {
  nickName?: string
  avatarUrl?: string
}

/**
 * 微信小程序登录（简化版）
 * 
 * 注意：真正的微信登录需要后端服务来换取 openid
 * 这里我们使用一个本地生成的唯一 ID 作为临时方案
 * 
 * 后续可以接入：
 * 1. Supabase Edge Function
 * 2. 微信云开发
 * 3. 自建后端
 */
export async function wxLogin(): Promise<{ success: boolean; userInfo?: UserInfo; error?: string }> {
  try {
    // 检查是否已有存储的用户信息
    const existingUser = getUserInfo()
    if (existingUser) {
      return { success: true, userInfo: existingUser }
    }

    // 尝试获取微信登录 code（虽然不能换 openid，但可以证明用户确实在微信环境）
    let wxCode = ''
    try {
      const loginRes = await Taro.login()
      wxCode = loginRes.code || ''
      console.log('wx.login code:', wxCode)
    } catch (e) {
      console.log('wx.login not available (probably not in WeChat env)')
    }

    // 生成一个本地唯一 ID 作为 user_id
    // 格式：wx_<时间戳>_<随机数>
    // 这个 ID 会存储在本地，同一设备每次都是同一个用户
    const localUserId = `wx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

    const userInfo: UserInfo = {
      openid: localUserId,
    }

    // 存储用户信息
    Taro.setStorageSync(USER_INFO_KEY, JSON.stringify(userInfo))

    return { success: true, userInfo }
  } catch (e) {
    console.error('wxLogin error:', e)
    return { success: false, error: '登录出错' }
  }
}

/**
 * 获取存储的用户信息
 */
export function getUserInfo(): UserInfo | null {
  try {
    const str = Taro.getStorageSync(USER_INFO_KEY)
    return str ? JSON.parse(str) : null
  } catch (e) {
    return null
  }
}

/**
 * 保存微信用户信息（头像、昵称）
 */
export function saveWxUserInfo(wxUserInfo: WxUserInfo) {
  try {
    Taro.setStorageSync(WX_USER_INFO_KEY, JSON.stringify(wxUserInfo))
  } catch (e) {
    console.error('saveWxUserInfo error:', e)
  }
}

/**
 * 获取微信用户信息
 */
export function getWxUserInfo(): WxUserInfo | null {
  try {
    const str = Taro.getStorageSync(WX_USER_INFO_KEY)
    return str ? JSON.parse(str) : null
  } catch (e) {
    return null
  }
}

/**
 * 退出登录
 */
export function logout() {
  try {
    Taro.removeStorageSync(USER_INFO_KEY)
    Taro.removeStorageSync(WX_USER_INFO_KEY)
    Taro.removeStorageSync(TOKEN_KEY)
  } catch (e) {
    console.error('logout error:', e)
  }
}

/**
 * 检查是否已登录
 */
export function isLoggedIn(): boolean {
  return !!getUserInfo()
}

/**
 * 调用后端微信登录接口（一次性获取 openid、保存头像和昵称）
 */
export async function wxLoginWithBackend(nickName?: string, avatarUrl?: string): Promise<{ success: boolean; userInfo?: UserInfo; token?: string; error?: string }> {
  try {
    // 获取微信登录 code
    const loginRes = await Taro.login()
    const code = loginRes.code
    
    if (!code) {
      return { success: false, error: '获取微信登录 code 失败' }
    }

    // 调用后端接口
    const response = await Taro.request({
      url: `${API_BASE_URL}/api/wx-login`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json'
      },
      data: {
        code,
        nickName,
        avatarUrl
      }
    })

    if (response.statusCode === 200 && response.data.success) {
      const { token, userInfo } = response.data
      
      // 保存 token
      if (token) {
        Taro.setStorageSync(TOKEN_KEY, token)
      }
      
      // 保存用户信息
      if (userInfo) {
        const fullUserInfo: UserInfo = {
          openid: userInfo.openid,
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl
        }
        Taro.setStorageSync(USER_INFO_KEY, JSON.stringify(fullUserInfo))
        
        // 同时保存微信用户信息（用于兼容现有代码）
        if (userInfo.nickName || userInfo.avatarUrl) {
          saveWxUserInfo({
            nickName: userInfo.nickName,
            avatarUrl: userInfo.avatarUrl
          })
        }
      }
      
      return {
        success: true,
        userInfo: userInfo ? {
          openid: userInfo.openid,
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl
        } : undefined,
        token
      }
    } else {
      const errorMsg = response.data?.error || '登录失败'
      return { success: false, error: errorMsg }
    }
  } catch (e: any) {
    console.error('wxLoginWithBackend error:', e)
    return { success: false, error: e.message || '登录出错' }
  }
}

/**
 * 获取存储的 token
 */
export function getToken(): string | null {
  try {
    return Taro.getStorageSync(TOKEN_KEY) || null
  } catch (e) {
    return null
  }
}
