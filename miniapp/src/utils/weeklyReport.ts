import type { BPRecord } from '../lib/supabase'
import { getBPStatus } from './bpStatus'
import { computeHandSplitOverview, type HandSplitPeriodOverview } from './bpHandAverages'

export type { HandSplitPeriodOverview } from './bpHandAverages'

export interface WeeklyReportStats {
  count: number
  /** 自然语言区间，如 4月1日 - 4月5日 */
  rangeLabel: string
  /** 所选统计区间包含的日历天数（用于分享图、免责文案等） */
  periodDayCount: number
  /** 全周期内全部记录的均值（与分享、封面图等一致） */
  avgSystolic: number
  avgDiastolic: number
  avgPulse: number
  /** 与首页「本周概览」同口径的左右分侧与未标条数 */
  handSplit: HandSplitPeriodOverview
  /** 正常（理想）次数 */
  normalCount: number
  /** 非理想次数（偏低+稍高+高血压等） */
  abnormalCount: number
  lowCount: number
  prehighCount: number
  high1Count: number
  high3Count: number
  timeBuckets: { label: string; count: number }[]
  maxRecord: { systolic: number; diastolic: number; recorded_at: string }
  minRecord: { systolic: number; diastolic: number; recorded_at: string }
}

const BUCKET_ORDER = ['凌晨', '上午', '中午', '下午', '晚上'] as const

function hourToBucket(h: number): (typeof BUCKET_ORDER)[number] {
  if (h < 6) return '凌晨'
  if (h < 12) return '上午'
  if (h < 14) return '中午'
  if (h < 18) return '下午'
  return '晚上'
}

function formatShortDateTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatRangeLabel(start: Date, end: Date): string {
  const sm = start.getMonth() + 1
  const sd = start.getDate()
  const em = end.getMonth() + 1
  const ed = end.getDate()
  if (start.getFullYear() === end.getFullYear()) {
    if (sm === em && sd === ed) return `${sm}月${sd}日`
    return `${sm}月${sd}日 - ${em}月${ed}日`
  }
  return `${start.getFullYear()}年${sm}月${sd}日 - ${end.getFullYear()}年${em}月${ed}日`
}

/**
 * 与首页「本周概览」一致：当前时刻起往前 7×24h 内的记录
 */
export function getWeekRecords(records: BPRecord[]): BPRecord[] {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  return records.filter(r => new Date(r.recorded_at) >= weekAgo)
}

function recordLocalDateKey(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 含首尾两日 */
export function inclusiveCalendarDaysBetween(startKey: string, endKey: string): number {
  const [ys, ms, ds] = startKey.split('-').map(Number)
  const [ye, me, de] = endKey.split('-').map(Number)
  if ([ys, ms, ds, ye, me, de].some(n => Number.isNaN(n))) return 1
  const s = new Date(ys, ms - 1, ds)
  const e = new Date(ye, me - 1, de)
  return Math.floor((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000)) + 1
}

export type WeeklyReportRangeOpts = {
  startKey: string
  endKey: string
  hand?: 'all' | 'left' | 'right'
}

function filterRecordsForReport(
  records: BPRecord[],
  range: WeeklyReportRangeOpts | null | undefined
): BPRecord[] {
  if (!range?.startKey || !range?.endKey) {
    return getWeekRecords(records)
  }
  const hand = range.hand ?? 'all'
  return records.filter(r => {
    const k = recordLocalDateKey(r.recorded_at)
    if (k < range.startKey || k > range.endKey) return false
    if (hand === 'all') return true
    return r.hand === hand
  })
}

export function computeWeeklyReport(
  records: BPRecord[],
  range?: WeeklyReportRangeOpts | null
): WeeklyReportStats | null {
  const periodRecords = filterRecordsForReport(records, range ?? null)
  if (periodRecords.length === 0) return null

  let rangeLabel: string
  let periodDayCount: number

  if (range?.startKey && range?.endKey) {
    const [ys, ms, ds] = range.startKey.split('-').map(Number)
    const [ye, me, de] = range.endKey.split('-').map(Number)
    const start = new Date(ys, ms - 1, ds)
    const end = new Date(ye, me - 1, de)
    rangeLabel = formatRangeLabel(start, end)
    periodDayCount = inclusiveCalendarDaysBetween(range.startKey, range.endKey)
  } else {
    const times = periodRecords.map(r => new Date(r.recorded_at).getTime())
    const start = new Date(Math.min(...times))
    const end = new Date(Math.max(...times))
    rangeLabel = formatRangeLabel(start, end)
    periodDayCount = 7
  }

  let normalCount = 0
  let lowCount = 0
  let prehighCount = 0
  let high1Count = 0
  let high3Count = 0

  const bucketMap: Record<string, number> = {}
  BUCKET_ORDER.forEach(b => {
    bucketMap[b] = 0
  })

  let maxRecord = periodRecords[0]
  let minRecord = periodRecords[0]
  let maxSum = maxRecord.systolic + maxRecord.diastolic
  let minSum = minRecord.systolic + minRecord.diastolic

  let pulseSum = 0

  for (const r of periodRecords) {
    const st = getBPStatus(r.systolic, r.diastolic)
    if (st.color === 'ideal') normalCount++
    else if (st.color === 'low') lowCount++
    else if (st.color === 'prehigh') prehighCount++
    else if (st.color === 'high-3') high3Count++
    else if (st.color === 'high-1' || st.color === 'high-2') high1Count++

    const h = new Date(r.recorded_at).getHours()
    const b = hourToBucket(h)
    bucketMap[b]++

    pulseSum += r.pulse

    const sum = r.systolic + r.diastolic
    if (sum > maxSum) {
      maxSum = sum
      maxRecord = r
    }
    if (sum < minSum) {
      minSum = sum
      minRecord = r
    }
  }

  const abnormalCount = periodRecords.length - normalCount

  const avgSystolic = Math.round(periodRecords.reduce((s, r) => s + r.systolic, 0) / periodRecords.length)
  const avgDiastolic = Math.round(periodRecords.reduce((s, r) => s + r.diastolic, 0) / periodRecords.length)
  const avgPulse = Math.round(pulseSum / periodRecords.length)

  const timeBuckets = BUCKET_ORDER.map(label => ({ label, count: bucketMap[label] || 0 }))

  const handSplit = computeHandSplitOverview(periodRecords)!

  return {
    count: periodRecords.length,
    rangeLabel,
    periodDayCount,
    avgSystolic,
    avgDiastolic,
    avgPulse,
    handSplit,
    normalCount,
    abnormalCount,
    lowCount,
    prehighCount,
    high1Count,
    high3Count,
    timeBuckets,
    maxRecord: {
      systolic: maxRecord.systolic,
      diastolic: maxRecord.diastolic,
      recorded_at: maxRecord.recorded_at
    },
    minRecord: {
      systolic: minRecord.systolic,
      diastolic: minRecord.diastolic,
      recorded_at: minRecord.recorded_at
    }
  }
}
