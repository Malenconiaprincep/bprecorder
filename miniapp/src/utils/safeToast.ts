import Taro from '@tarojs/taro'

/** 避免连续 showToast 导致部分真机抛错 */
export function safeShowToast(options: Taro.showToast.Option): void {
  try {
    Taro.showToast(options)
  } catch (e) {
    console.warn('[safeShowToast]', e)
  }
}
