import Taro from '@tarojs/taro'
import { getRecordsForHomeStats, BPRecord } from '../lib/supabase'
import { buildDietAdviceRecentSummary } from './dietAdviceSummary'
import { fetchFullDietAdvice, type DietAdviceLatestInput } from './dietAdvice'
import { tryGetDietAdviceGps } from './dietAdviceLocation'
import { showDietAdviceRewardAd } from './dietAdviceRewardAd'
import {
  DIET_ADVICE_DETAIL_STORAGE_KEY,
  DIET_ADVICE_ENTRY_PENDING_KEY,
  DIET_ADVICE_GEN_PARAMS_KEY,
  type DietAdviceGenParams,
} from '../types/dietAdvice'
import {
  markDietAdvicePromptShown,
  shouldShowDietAdvicePrompt,
} from './dietAdvicePromptPolicy'

export {
  markDietAdvicePromptDismissed,
  markDietAdvicePromptShown,
  shouldShowDietAdvicePrompt,
} from './dietAdvicePromptPolicy'

/** 保存后仅展示入口弹层，不自动生成 */
export type DietAdviceUiState = {
  visible: boolean
  savedLatest: DietAdviceLatestInput | null
}

export const DIET_ADVICE_UI_INITIAL: DietAdviceUiState = {
  visible: false,
  savedLatest: null,
}

async function buildPayload(
  userId: string,
  latest: DietAdviceLatestInput,
  extraRecords?: BPRecord[]
) {
  let records = extraRecords
  if (!records) {
    const { data } = await getRecordsForHomeStats(userId)
    records = data || []
  }
  const merged = mergeLatestIntoRecords(records, latest)
  const recentSummary = buildDietAdviceRecentSummary(merged)
  return { recentSummary }
}

/**
 * 保存成功后：只弹出生活饮食建议入口，不请求大模型
 */
export function openDietAdviceAfterSave(
  latest: DietAdviceLatestInput,
  setUi: (state: DietAdviceUiState) => void
): boolean {
  if (!shouldShowDietAdvicePrompt(latest.systolic, latest.diastolic)) {
    return false
  }
  markDietAdvicePromptShown()
  setUi({ visible: true, savedLatest: latest })
  return true
}

/**
 * 手动输入等非 Tab 页保存后：写入暂存并回首页展示（避免 TabBar 遮挡 Bottom Sheet）
 */
export function stashDietAdviceEntryForHome(latest: DietAdviceLatestInput): boolean {
  if (!shouldShowDietAdvicePrompt(latest.systolic, latest.diastolic)) {
    return false
  }
  markDietAdvicePromptShown()
  try {
    Taro.setStorageSync(DIET_ADVICE_ENTRY_PENDING_KEY, latest)
  } catch (e) {
    console.warn('[diet-advice] stash entry pending failed', e)
    return false
  }
  return true
}

/** 首页 onShow：消费手动输入页暂存的入口弹层 */
export function consumePendingDietAdviceEntry(
  setUi: (state: DietAdviceUiState) => void
): boolean {
  try {
    const latest = Taro.getStorageSync(DIET_ADVICE_ENTRY_PENDING_KEY) as
      | DietAdviceLatestInput
      | undefined
    if (!latest?.systolic || !latest?.diastolic) return false
    Taro.removeStorageSync(DIET_ADVICE_ENTRY_PENDING_KEY)
    setUi({ visible: true, savedLatest: latest })
    return true
  } catch (e) {
    console.warn('[diet-advice] consume entry pending failed', e)
    return false
  }
}

/**
 * 用户点击查看生活饮食建议：激励视频后跳转详情页并在该页生成内容
 */
export function requestDietAdviceDetailWithAd(
  userId: string,
  latest: DietAdviceLatestInput,
  onCloseEntry: () => void
): void {
  showDietAdviceRewardAd({
    onUnlocked: () => {
      onCloseEntry()
      const params: DietAdviceGenParams = { userId, latest }
      Taro.setStorageSync(DIET_ADVICE_GEN_PARAMS_KEY, params)
      Taro.removeStorageSync(DIET_ADVICE_DETAIL_STORAGE_KEY)
      Taro.navigateTo({ url: '/pages/diet-advice/index?generate=1' })
    },
  })
}

/** 详情页内：定位 + 一次 Qwen，写入详情缓存 */
export async function generateDietAdviceOnDetailPage(
  params: DietAdviceGenParams
): Promise<boolean> {
  try {
    const { recentSummary } = await buildPayload(params.userId, params.latest)
    const location = await tryGetDietAdviceGps()
    const data = await fetchFullDietAdvice(params.latest, recentSummary, location)
    Taro.setStorageSync(DIET_ADVICE_DETAIL_STORAGE_KEY, data)
    Taro.removeStorageSync(DIET_ADVICE_GEN_PARAMS_KEY)
    return true
  } catch (e) {
    console.error('[diet-advice] detail page generate failed:', e)
    Taro.removeStorageSync(DIET_ADVICE_GEN_PARAMS_KEY)
    return false
  }
}

function mergeLatestIntoRecords(
  records: BPRecord[],
  latest: DietAdviceLatestInput
): BPRecord[] {
  const at = latest.recordedAt || new Date().toISOString()
  const synthetic: BPRecord = {
    user_id: '',
    systolic: latest.systolic,
    diastolic: latest.diastolic,
    pulse: latest.pulse,
    note: latest.note,
    recorded_at: at,
  }
  const withoutDup = records.filter(
    (r) =>
      !(
        r.systolic === latest.systolic &&
        r.diastolic === latest.diastolic &&
        r.recorded_at === at
      )
  )
  return [...withoutDup, synthetic]
}
