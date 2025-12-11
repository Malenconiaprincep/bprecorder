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
 * 静默登录 - 只获取 openid，不需要头像昵称
 * 用户进入小程序时自动调用，不打扰用户
 */
export async function silentLogin(): Promise<{ success: boolean; userInfo?: UserInfo; token?: string; error?: string }> {
  try {
    // 检查是否已有存储的用户信息（有真实 openid）
    const existingUser = getUserInfo()
    if (existingUser && !existingUser.openid.startsWith('wx_')) {
      // 已有真实 openid，直接返回
      return { success: true, userInfo: existingUser, token: getToken() || undefined }
    }

    // 获取微信登录 code
    const loginRes = await Taro.login()
    const code = loginRes.code

    if (!code) {
      console.log('silentLogin: 获取 code 失败')
      return { success: false, error: '获取微信登录 code 失败' }
    }

    console.log('silentLogin: 获取到 code，调用后端接口...')

    // 调用后端接口获取 openid（不传头像昵称）
    const response = await Taro.request({
      url: `${API_BASE_URL}/api/wx-login`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json'
      },
      data: { code }
    })

    if (response.statusCode === 200 && response.data.success) {
      const { token, userInfo: respUserInfo } = response.data

      // 保存 token
      if (token) {
        Taro.setStorageSync(TOKEN_KEY, token)
      }

      // 构建用户信息（保留可能已有的头像昵称）
      const savedWxUser = getWxUserInfo()
      const fullUserInfo: UserInfo = {
        openid: respUserInfo.openid,
        nickName: respUserInfo.nickName || savedWxUser?.nickName,
        avatarUrl: respUserInfo.avatarUrl || savedWxUser?.avatarUrl
      }
      Taro.setStorageSync(USER_INFO_KEY, JSON.stringify(fullUserInfo))

      console.log('silentLogin: 静默登录成功，openid:', respUserInfo.openid)
      return { success: true, userInfo: fullUserInfo, token }
    } else {
      const errorMsg = response.data?.error || '登录失败'
      console.log('silentLogin: 登录失败 -', errorMsg)
      return { success: false, error: errorMsg }
    }
  } catch (e: any) {
    console.error('silentLogin error:', e)
    return { success: false, error: e.message || '登录出错' }
  }
}

/**
 * 微信小程序登录（兼容旧方法，内部调用静默登录）
 * @deprecated 推荐使用 silentLogin
 */
export async function wxLogin(): Promise<{ success: boolean; userInfo?: UserInfo; error?: string }> {
  return silentLogin()
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

/**
 * 上传头像到服务器
 * @param tempFilePath 微信临时文件路径 (wxfile://...)
 * @param userId 用户 openid
 * @returns 上传后的公开 URL
 */
export async function uploadAvatar(tempFilePath: string, userId: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    // 使用 Taro.uploadFile 上传文件
    const uploadRes = await Taro.uploadFile({
      url: `${API_BASE_URL}/api/upload-avatar`,
      filePath: tempFilePath,
      name: 'file',
      formData: {
        userId: userId
      }
    })

    if (uploadRes.statusCode === 200) {
      const data = JSON.parse(uploadRes.data)
      if (data.success && data.url) {
        return { success: true, url: data.url }
      }
      return { success: false, error: data.error || '上传失败' }
    }
    return { success: false, error: '上传失败' }
  } catch (e: any) {
    console.error('uploadAvatar error:', e)
    return { success: false, error: e.message || '上传出错' }
  }
}
