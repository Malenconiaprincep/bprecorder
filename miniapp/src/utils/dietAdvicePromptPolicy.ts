import Taro from '@tarojs/taro'
import { isBPElevatedForDietAdvice } from './bpStatus'

const STORAGE_PROMPT_SHOWN_DATE = 'diet_advice_prompt_shown_date'
const STORAGE_PROMPT_DISMISS_DATE = 'diet_advice_prompt_dismiss_date'
/** 开发包专用：保存后是否忽略「每天一次」限制（仍须血压偏高） */
const STORAGE_DEV_ALWAYS_PROMPT = 'diet_advice_dev_always_prompt'
/** 开发包专用：首页固定预览保存后引导卡（无需真实保存） */
const STORAGE_DEV_PREVIEW_ENTRY = 'diet_advice_dev_preview_entry'
/** 开发包专用：进入生活饮食建议详情时跳过激励视频 */
const STORAGE_DEV_SKIP_DIET_REWARD_AD = 'diet_advice_dev_skip_reward_ad'

/** Webpack development 构建 */
const IS_WEBPACK_DEV_BUILD = process.env.NODE_ENV === 'development'

/** 微信开发版 / 本地 dev 构建，用于调试入口与「每次保存都弹」 */
export function isWeappDevelopRuntime(): boolean {
  if (IS_WEBPACK_DEV_BUILD) return true
  try {
    const env = Taro.getAccountInfoSync()?.miniProgram?.envVersion
    return env === 'develop'
  } catch {
    return false
  }
}

/** @deprecated 请用 isWeappDevelopRuntime */
export const IS_MINIAPP_DEV_BUILD = isWeappDevelopRuntime()

/** 本地自然日 YYYY-MM-DD */
export function getLocalDateKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 开发环境：保存后是否忽略「每天一次」限制（默认开启；仍须血压偏高才弹）
 * 生产包恒为 false
 */
export function getDevDietAdviceAlwaysPrompt(): boolean {
  if (!isWeappDevelopRuntime()) return false
  try {
    const v = Taro.getStorageSync(STORAGE_DEV_ALWAYS_PROMPT)
    if (v === '' || v === undefined || v === null) return true
    return v === '1' || v === 1 || v === true
  } catch {
    return true
  }
}

export function setDevDietAdviceAlwaysPrompt(enabled: boolean): void {
  if (!isWeappDevelopRuntime()) return
  try {
    Taro.setStorageSync(STORAGE_DEV_ALWAYS_PROMPT, enabled ? '1' : '0')
  } catch (e) {
    console.warn('[diet-advice] set dev always prompt failed', e)
  }
}

/** 开发环境：首页是否固定展示保存后引导卡（示例血压，无需保存） */
export function getDevDietAdvicePreviewEntry(): boolean {
  if (!isWeappDevelopRuntime()) return false
  try {
    return Taro.getStorageSync(STORAGE_DEV_PREVIEW_ENTRY) === '1'
  } catch {
    return false
  }
}

export function setDevDietAdvicePreviewEntry(enabled: boolean): void {
  if (!isWeappDevelopRuntime()) return
  try {
    Taro.setStorageSync(STORAGE_DEV_PREVIEW_ENTRY, enabled ? '1' : '0')
  } catch (e) {
    console.warn('[diet-advice] set dev preview entry failed', e)
  }
}

/**
 * 开发环境：进入生活饮食建议详情是否跳过激励视频（默认开启）
 */
export function getDevSkipDietAdviceRewardAd(): boolean {
  if (!isWeappDevelopRuntime()) return false
  try {
    const v = Taro.getStorageSync(STORAGE_DEV_SKIP_DIET_REWARD_AD)
    if (v === '' || v === undefined || v === null) return true
    return v === '1' || v === 1 || v === true
  } catch {
    return true
  }
}

export function setDevSkipDietAdviceRewardAd(enabled: boolean): void {
  if (!isWeappDevelopRuntime()) return
  try {
    Taro.setStorageSync(STORAGE_DEV_SKIP_DIET_REWARD_AD, enabled ? '1' : '0')
  } catch (e) {
    console.warn('[diet-advice] set dev skip reward ad failed', e)
  }
}

/** 清除正式策略的「今日已弹 / 已跳过」记录，便于调试 */
export function clearDietAdvicePromptDayFlags(): void {
  try {
    Taro.removeStorageSync(STORAGE_PROMPT_SHOWN_DATE)
    Taro.removeStorageSync(STORAGE_PROMPT_DISMISS_DATE)
  } catch (e) {
    console.warn('[diet-advice] clear day flags failed', e)
  }
}

/**
 * 保存后是否应弹出「生成 AI 食谱」引导（非每次记录都弹）
 *
 * 正式策略：
 * - 仅当本次血压为「稍高」及以上（≥120/80 或 ≥140/90 等）时才考虑弹出
 * - 当天最多自动弹出 1 次入口
 * - 用户当天点过「暂不需要」或关闭入口：当天不再弹
 *
 * 开发策略（开发版 / dev 构建 + 开关开启）：忽略「每天一次」限制，但仍需血压偏高才弹
 */
export function shouldShowDietAdvicePrompt(systolic: number, diastolic: number): boolean {
  if (!isBPElevatedForDietAdvice(systolic, diastolic)) {
    return false
  }

  if (getDevDietAdviceAlwaysPrompt()) {
    return true
  }

  try {
    const today = getLocalDateKey()
    const dismissed = Taro.getStorageSync(STORAGE_PROMPT_DISMISS_DATE) as string
    if (dismissed === today) {
      return false
    }

    const shown = Taro.getStorageSync(STORAGE_PROMPT_SHOWN_DATE) as string
    if (shown === today) {
      return false
    }

    return true
  } catch (e) {
    console.warn('[diet-advice] read prompt policy storage failed', e)
    return false
  }
}

/** 已展示引导弹窗（当天不再自动弹；开发「始终弹出」模式下不写入） */
export function markDietAdvicePromptShown(): void {
  if (getDevDietAdviceAlwaysPrompt()) return
  try {
    Taro.setStorageSync(STORAGE_PROMPT_SHOWN_DATE, getLocalDateKey())
  } catch (e) {
    console.warn('[diet-advice] mark shown failed', e)
  }
}

/** 用户明确跳过（当天不再自动弹；开发「始终弹出」模式下不写入） */
export function markDietAdvicePromptDismissed(): void {
  if (getDevDietAdviceAlwaysPrompt()) return
  try {
    Taro.setStorageSync(STORAGE_PROMPT_DISMISS_DATE, getLocalDateKey())
  } catch (e) {
    console.warn('[diet-advice] mark dismiss failed', e)
  }
}
