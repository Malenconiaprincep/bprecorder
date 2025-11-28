import Taro from '@tarojs/taro'

// 存储 key
const USER_INFO_KEY = 'bp_user_info'

export interface UserInfo {
  openid: string
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
 * 退出登录
 */
export function logout() {
  try {
    Taro.removeStorageSync(USER_INFO_KEY)
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
