import type { BPRecord } from '../lib/supabase'

/** 单侧（左/右）的区间平均 */
export interface HandSideAverage {
  systolic: number
  diastolic: number
  count: number
}

/**
 * 近7天等与首页、分析页共用的分侧结果。
 * - 左右为 null 表示该侧本周期无记录
 * - 若本周期有记录但左右侧均为 0 条、均为未标左右手，则 fallbackOverall 为整体平均；否则为 null
 */
export interface HandSplitPeriodOverview {
  count: number
  unlabeledCount: number
  left: HandSideAverage | null
  right: HandSideAverage | null
  fallbackOverall: { systolic: number; diastolic: number } | null
}

function averageRecords(records: BPRecord[]): { systolic: number; diastolic: number } {
  const n = records.length
  if (n === 0) {
    return { systolic: 0, diastolic: 0 }
  }
  const systolic = Math.round(records.reduce((s, r) => s + r.systolic, 0) / n)
  const diastolic = Math.round(records.reduce((s, r) => s + r.diastolic, 0) / n)
  return { systolic, diastolic }
}

/**
 * 非空记录集合上计算左右分侧与未标条数。用于近7天、本周总结等任一时间滤后的集合。
 */
export function computeHandSplitOverview(records: BPRecord[]): HandSplitPeriodOverview | null {
  if (records.length === 0) return null

  const leftRecs: BPRecord[] = []
  const rightRecs: BPRecord[] = []
  const unlabeledRecs: BPRecord[] = []

  for (const r of records) {
    if (r.hand === 'left') leftRecs.push(r)
    else if (r.hand === 'right') rightRecs.push(r)
    else unlabeledRecs.push(r)
  }

  const unlabeledCount = unlabeledRecs.length

  let left: HandSideAverage | null = null
  if (leftRecs.length > 0) {
    const a = averageRecords(leftRecs)
    left = { systolic: a.systolic, diastolic: a.diastolic, count: leftRecs.length }
  }
  let right: HandSideAverage | null = null
  if (rightRecs.length > 0) {
    const a = averageRecords(rightRecs)
    right = { systolic: a.systolic, diastolic: a.diastolic, count: rightRecs.length }
  }

  const fallbackOverall =
    left == null && right == null
      ? averageRecords(unlabeledRecs.length > 0 ? unlabeledRecs : records)
      : null

  return { count: records.length, unlabeledCount, left, right, fallbackOverall }
}
