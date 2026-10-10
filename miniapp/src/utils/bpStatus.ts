/**
 * 血压分级（简化四档 + 低血压）
 *
 * | 等级     | 收缩压   | 舒张压   | 提示               |
 * |----------|----------|----------|--------------------|
 * | 🟢 正常  | <120     | <80      | 正常               |
 * | 🟡 偏高  | 120–139  | 80–89    | 稍高               |
 * | 🟠 高血压| ≥140     | ≥90      | 多测几天           |
 * | 🔴 明显偏高 | ≥160 | ≥100     | 看医生             |
 *
 * 判定顺序：先排除低血压 → 明显偏高 → 高血压 → 偏高 → 正常。
 * 「偏高」与「高血压」按收缩压或舒张压任一达标即归入对应档（取较重者）。
 */
export type BPStatusColor = 'low' | 'ideal' | 'prehigh' | 'high-1' | 'high-2' | 'high-3'

export interface BPStatusResult {
  label: string
  color: BPStatusColor
  emoji: string
}

export function getBPStatus(systolic: number, diastolic: number): BPStatusResult {
  const s = systolic
  const d = diastolic

  // 低血压（常见界定，优先判断）
  if (s < 90 || d < 60) {
    return { label: '偏低', color: 'low', emoji: '💧' }
  }

  // 🔴 明显偏高
  if (s >= 160 || d >= 100) {
    return { label: '看医生', color: 'high-3', emoji: '🔴' }
  }

  // 🟠 高血压
  if (s >= 140 || d >= 90) {
    return { label: '多测几天', color: 'high-1', emoji: '🟠' }
  }

  // 🟡 偏高（未达 140/90）
  if ((s >= 120 && s <= 139) || (d >= 80 && d <= 89)) {
    return { label: '稍高', color: 'prehigh', emoji: '🟡' }
  }

  // 🟢 正常
  if (s < 120 && d < 80) {
    return { label: '正常', color: 'ideal', emoji: '🟢' }
  }

  return { label: '稍高', color: 'prehigh', emoji: '🟡' }
}

/** 日历等：仅「正常」不标为需关注 */
export function isBPNeedAttention(result: BPStatusResult): boolean {
  return result.color !== 'ideal'
}

/** 保存后是否值得弹出饮食/生活建议（稍高及以上，不含正常与偏低） */
export function isBPElevatedForDietAdvice(systolic: number, diastolic: number): boolean {
  const { color } = getBPStatus(systolic, diastolic)
  return color === 'prehigh' || color === 'high-1' || color === 'high-3'
}

/** 仅看收缩压（分析页「平均收缩压」旁状态标签） */
export function getBPStatusSystolicOnly(systolic: number): BPStatusResult {
  const s = systolic
  if (s < 90) return { label: '偏低', color: 'low', emoji: '💧' }
  if (s >= 160) return { label: '看医生', color: 'high-3', emoji: '🔴' }
  if (s >= 140) return { label: '多测几天', color: 'high-1', emoji: '🟠' }
  if (s >= 120) return { label: '稍高', color: 'prehigh', emoji: '🟡' }
  return { label: '正常', color: 'ideal', emoji: '🟢' }
}

/** 仅看舒张压（分析页「平均舒张压」旁状态标签） */
export function getBPStatusDiastolicOnly(diastolic: number): BPStatusResult {
  const d = diastolic
  if (d < 60) return { label: '偏低', color: 'low', emoji: '💧' }
  if (d >= 100) return { label: '看医生', color: 'high-3', emoji: '🔴' }
  if (d >= 90) return { label: '多测几天', color: 'high-1', emoji: '🟠' }
  if (d >= 80) return { label: '稍高', color: 'prehigh', emoji: '🟡' }
  return { label: '正常', color: 'ideal', emoji: '🟢' }
}
