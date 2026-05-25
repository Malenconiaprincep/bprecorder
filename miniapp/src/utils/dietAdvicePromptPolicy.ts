import Taro from '@tarojs/taro'
import type { DietAdviceLatestInput } from './dietAdvice'

/** 调试：入口 Bottom Sheet 始终显示（上线前务必改为 false） */
export const DIET_ADVICE_ENTRY_DEBUG_PIN_VISIBLE = true

/** 固定显示时使用的示例血压（与设计稿一致） */
export const DIET_ADVICE_ENTRY_DEBUG_MOCK: DietAdviceLatestInput = {
  systolic: 148,
  diastolic: 90,
  pulse: 72,
}

const STORAGE_PROMPT_SHOWN_DATE = 'diet_advice_prompt_shown_date'
const STORAGE_PROMPT_DISMISS_DATE = 'diet_advice_prompt_dismiss_date'
/** 开发包专用：保存后是否忽略正式策略、每次都弹食谱引导 */
const STORAGE_DEV_ALWAYS_PROMPT = 'diet_advice_dev_always_prompt'

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
 * 开发环境：是否每次保存后都弹出食谱引导（默认开启，可在「我的」里关）
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
 * - 每次新增保存后：当天最多自动弹出 1 次入口（不限血压档位）
 * - 用户当天点过「暂不需要」或关闭入口：当天不再弹
 *
 * 开发策略（开发版 / dev 构建 + 开关开启）：每次保存都弹，便于调 UI
 */
export function shouldShowDietAdvicePrompt(_systolic: number, _diastolic: number): boolean {
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

/** 未弹出时的原因（便于开发排查） */
export function getDietAdvicePromptSkipReason(
  systolic: number,
  diastolic: number
): string | null {
  if (shouldShowDietAdvicePrompt(systolic, diastolic)) return null
  if (getDevDietAdviceAlwaysPrompt()) return null
  try {
    const today = getLocalDateKey()
    const dismissed = Taro.getStorageSync(STORAGE_PROMPT_DISMISS_DATE) as string
    if (dismissed === today) return '今日已选择暂不需要'
    const shown = Taro.getStorageSync(STORAGE_PROMPT_SHOWN_DATE) as string
    if (shown === today) return '今日已弹出过生活饮食建议'
  } catch {
    return '读取弹窗策略失败'
  }
  return null
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
