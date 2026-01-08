import Taro from '@tarojs/taro'
import { API_BASE_URL } from '../utils/api'

// 存储 key
const FONT_SIZE_MODE_KEY = 'bp_font_size_mode'

export type FontSizeMode = 'normal' | 'elder'

export interface UserSettings {
  fontSizeMode: FontSizeMode
}

/**
 * 获取本地存储的字体模式
 */
export function getLocalFontSizeMode(): FontSizeMode {
  try {
    const mode = Taro.getStorageSync(FONT_SIZE_MODE_KEY)
    if (mode === 'elder' || mode === 'normal') {
      return mode
    }
    return 'normal'
  } catch (e) {
    return 'normal'
  }
}

/**
 * 保存字体模式到本地存储
 */
export function saveLocalFontSizeMode(mode: FontSizeMode): void {
  try {
    Taro.setStorageSync(FONT_SIZE_MODE_KEY, mode)
  } catch (e) {
    console.error('Failed to save font size mode:', e)
  }
}

/**
 * 更新服务器端的字体模式设置
 */
export async function updateServerFontSizeMode(openid: string, mode: FontSizeMode): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await Taro.request({
      url: `${API_BASE_URL}/api/user-settings`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'x-openid': openid
      },
      data: {
        fontSizeMode: mode
      }
    })

    if (response.statusCode === 200 && response.data.success) {
      return { success: true }
    } else {
      return { success: false, error: response.data?.error || '更新失败' }
    }
  } catch (e: any) {
    console.error('Failed to update server font size mode:', e)
    return { success: false, error: e.message || '网络请求失败' }
  }
}

/**
 * 设置字体模式（同时更新本地和服务器）
 */
export async function setFontSizeMode(openid: string, mode: FontSizeMode): Promise<{ success: boolean; error?: string }> {
  // 先保存到本地（立即生效）
  saveLocalFontSizeMode(mode)

  // 应用样式
  applyFontSizeMode(mode)

  // 同步到服务器
  const result = await updateServerFontSizeMode(openid, mode)

  if (!result.success) {
    console.warn('Failed to sync font size mode to server:', result.error)
    // 本地已保存，服务器同步失败不影响用户体验
  }

  return { success: true }
}

/**
 * 应用字体模式样式
 * 在小程序中通过设置页面的 class 或 CSS 变量来控制
 */
export function applyFontSizeMode(mode: FontSizeMode): void {
  // 存储到全局变量，供各页面使用
  const app = Taro.getApp()
  if (app) {
    app.globalData = app.globalData || {}
    app.globalData.fontSizeMode = mode
  }

  // 触发页面刷新事件
  Taro.eventCenter.trigger('fontSizeModeChanged', mode)
}

/**
 * 获取当前的字体模式
 */
export function getCurrentFontSizeMode(): FontSizeMode {
  // 优先从全局变量获取
  const app = Taro.getApp()
  if (app?.globalData?.fontSizeMode) {
    return app.globalData.fontSizeMode
  }

  // 从本地存储获取
  return getLocalFontSizeMode()
}

/**
 * 初始化字体模式（应用启动时调用）
 */
export function initFontSizeMode(): FontSizeMode {
  const mode = getLocalFontSizeMode()
  applyFontSizeMode(mode)
  return mode
}

/**
 * 根据字体模式获取字体缩放比例
 */
export function getFontScale(mode?: FontSizeMode): number {
  const currentMode = mode || getCurrentFontSizeMode()
  return currentMode === 'elder' ? 1.3 : 1.0
}

/**
 * 获取关怀模式的样式类名
 */
export function getFontSizeModeClass(mode?: FontSizeMode): string {
  const currentMode = mode || getCurrentFontSizeMode()
  return currentMode === 'elder' ? 'elder-mode' : ''
}

