import type { BPRecord } from '../lib/supabase'
import { getBPStatus } from './bpStatus'

/** 分析页环形图四档（与设计稿文案对齐） */
export type AnalysisDonutCategory = 'normal' | 'elevated' | 'low' | 'hypertension'

export interface DonutCategoryMeta {
  key: AnalysisDonutCategory
  label: string
  color: string
}

/** 与改版前分析/状态标签色系一致 */
export const DONUT_CATEGORIES: DonutCategoryMeta[] = [
  { key: 'normal', label: '正常', color: '#22c55e' },
  { key: 'elevated', label: '偏高', color: '#f59e0b' },
  { key: 'low', label: '偏低', color: '#06b6d4' },
  { key: 'hypertension', label: '高血压', color: '#ea580c' }
]

export function classifyRecordForDonut(record: BPRecord): AnalysisDonutCategory {
  const st = getBPStatus(record.systolic, record.diastolic)
  if (st.color === 'low') return 'low'
  if (st.color === 'ideal') return 'normal'
  if (st.color === 'prehigh') return 'elevated'
  return 'hypertension'
}

export function countDonutCategories(records: BPRecord[]): Record<AnalysisDonutCategory, number> {
  const counts: Record<AnalysisDonutCategory, number> = {
    normal: 0,
    elevated: 0,
    low: 0,
    hypertension: 0
  }
  for (const r of records) {
    counts[classifyRecordForDonut(r)]++
  }
  return counts
}

/** 生成环形 conic-gradient（顺时针，从 12 点起） */
export function buildDonutConicGradient(
  counts: Record<AnalysisDonutCategory, number>,
  meta: DonutCategoryMeta[] = DONUT_CATEGORIES
): string {
  const total = meta.reduce((s, m) => s + counts[m.key], 0)
  if (total === 0) {
    return 'conic-gradient(#e2e8f0 0deg 360deg)'
  }
  const parts: string[] = []
  let deg = 0
  for (const m of meta) {
    const n = counts[m.key]
    if (n === 0) continue
    const span = (n / total) * 360
    const end = deg + span
    parts.push(`${m.color} ${deg}deg ${end}deg`)
    deg = end
  }
  if (parts.length === 0) {
    return 'conic-gradient(#e2e8f0 0deg 360deg)'
  }
  return `conic-gradient(${parts.join(', ')})`
}
