import Taro from '@tarojs/taro'
import { getDevSkipDietAdviceRewardAd } from './dietAdvicePromptPolicy'
import { REWARD_VIDEO_ADS_ENABLED, SHARED_REWARD_AD_UNIT_ID } from './rewardAdUnit'

interface RewardedVideoAdLike {
  show(): Promise<void>
  load(): Promise<void>
  onLoad(cb: () => void): void
  onError(cb: (err: unknown) => void): void
  onClose(cb: (res: { isEnded?: boolean }) => void): void
}

let videoAdSingleton: RewardedVideoAdLike | null = null
let closeHandler: ((res: { isEnded?: boolean }) => void) | null = null

function getWxRewardedVideoAd(): RewardedVideoAdLike | null {
  const wxGlobal = (globalThis as unknown as {
    wx?: { createRewardedVideoAd?: (opts: { adUnitId: string }) => RewardedVideoAdLike }
  }).wx
  if (!wxGlobal?.createRewardedVideoAd) return null
  if (!videoAdSingleton) {
    const ad = wxGlobal.createRewardedVideoAd({ adUnitId: SHARED_REWARD_AD_UNIT_ID })
    ad.onLoad(() => {})
    ad.onError((err) => console.error('[diet-advice] 激励视频加载失败', err))
    ad.onClose((res) => closeHandler?.(res))
    void ad.load().catch(() => {})
    videoAdSingleton = ad
  }
  return videoAdSingleton
}

/**
 * 展示激励视频；完整观看后 onUnlocked，中途关闭 onDismiss
 * 与分析页总结报告使用同一广告位；无法播放时不自动放行
 */
export function showDietAdviceRewardAd(options: {
  onUnlocked: () => void
  onDismiss?: () => void
}): void {
  if (!REWARD_VIDEO_ADS_ENABLED || getDevSkipDietAdviceRewardAd()) {
    options.onUnlocked()
    return
  }

  const videoAd = getWxRewardedVideoAd()
  if (!videoAd) {
    Taro.showToast({ title: '当前环境不支持激励视频', icon: 'none' })
    options.onDismiss?.()
    return
  }

  closeHandler = (res) => {
    closeHandler = null
    if (res?.isEnded) {
      options.onUnlocked()
    } else {
      Taro.showToast({ title: '请完整观看广告后查看', icon: 'none' })
      options.onDismiss?.()
    }
  }

  videoAd.show().catch(() => {
    videoAd
      .load()
      .then(() => videoAd.show())
      .catch((err) => {
        console.error('[diet-advice] 激励视频显示失败', err)
        closeHandler = null
        Taro.showToast({ title: '广告加载失败，请稍后重试', icon: 'none' })
        options.onDismiss?.()
      })
  })
}
