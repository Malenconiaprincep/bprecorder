import { BPRecord } from '../lib/supabase'
import { getBPStatus } from './bpStatus'
import type { BpTrend, DietAdviceRecentSummary } from '../types/dietAdvice'

export const DIET_ADVICE_LOOKBACK_DAYS = 7

/** 近 N 天血压记录汇总，供 AI 饮食建议使用 */
export function buildDietAdviceRecentSummary(
  records: BPRecord[],
  days = DIET_ADVICE_LOOKBACK_DAYS
): DietAdviceRecentSummary {
  if (records.length === 0) {
    return {
      days,
      recordCount: 0,
      avgSystolic: 0,
      avgDiastolic: 0,
      normalCount: 0,
      elevatedCount: 0,
      hypertensionCount: 0,
      lowCount: 0,
      trend: 'unknown',
    }
  }

  let normalCount = 0
  let elevatedCount = 0
  let hypertensionCount = 0
  let lowCount = 0
  let sumS = 0
  let sumD = 0

  for (const r of records) {
    sumS += r.systolic
    sumD += r.diastolic
    const st = getBPStatus(r.systolic, r.diastolic)
    if (st.color === 'ideal') normalCount++
    else if (st.color === 'low') lowCount++
    else if (st.color === 'prehigh') elevatedCount++
    else hypertensionCount++
  }

  const sorted = [...records].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  )
  let trend: BpTrend = 'unknown'
  if (sorted.length >= 3) {
    const mid = Math.floor(sorted.length / 2)
    const firstHalf = sorted.slice(0, mid)
    const secondHalf = sorted.slice(mid)
    const avg = (arr: BPRecord[]) => ({
      s: arr.reduce((a, x) => a + x.systolic, 0) / arr.length,
      d: arr.reduce((a, x) => a + x.diastolic, 0) / arr.length,
    })
    const a1 = avg(firstHalf)
    const a2 = avg(secondHalf)
    const delta = (a2.s + a2.d) / 2 - (a1.s + a1.d) / 2
    if (delta >= 3) trend = 'rising'
    else if (delta <= -3) trend = 'falling'
    else trend = 'stable'
  }

  return {
    days,
    recordCount: records.length,
    avgSystolic: Math.round(sumS / records.length),
    avgDiastolic: Math.round(sumD / records.length),
    normalCount,
    elevatedCount,
    hypertensionCount,
    lowCount,
    trend,
  }
}
