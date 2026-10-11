const DEFAULT_TIMEZONE = 'Asia/Shanghai'

/** 解析 HH:mm */
export function parseReminderTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value).trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

export function normalizeReminderTime(value: string | null | undefined): string {
  const parsed = parseReminderTime(value || '')
  if (!parsed) return '09:00'
  return `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`
}

/** 对齐到整点/半点，与 Cron（:00 / :30）一致 */
export function snapReminderTimeToSlot(value: string | null | undefined): string {
  const normalized = normalizeReminderTime(value)
  const parsed = parseReminderTime(normalized)
  if (!parsed) return '09:00'

  const total = parsed.hour * 60 + parsed.minute
  let snapped = Math.round(total / 30) * 30
  if (snapped >= 24 * 60) snapped = 0

  const hour = Math.floor(snapped / 60)
  const minute = snapped % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function getTimeZoneParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value || 0)

  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
  }
}

/** 用户时区下的 YYYY-MM-DD */
export function getLocalDateKey(date: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  const p = getTimeZoneParts(date, timeZone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** 当前本地时刻距 reminder_time 的分钟差（仅比较时分） */
export function getMinutesFromReminderTime(
  now: Date,
  reminderTime: string,
  timeZone: string = DEFAULT_TIMEZONE
): number {
  const parsed = parseReminderTime(reminderTime)
  if (!parsed) return Number.POSITIVE_INFINITY

  const local = getTimeZoneParts(now, timeZone)
  const hour = local.hour === 24 ? 0 : local.hour
  const nowMinutes = hour * 60 + local.minute
  const targetMinutes = parsed.hour * 60 + parsed.minute
  return nowMinutes - targetMinutes
}

function getTimezoneOffsetSuffix(timeZone: string): string {
  return timeZone === 'Asia/Shanghai' ? '+08:00' : '+08:00'
}

/** 本地日历 dateKey + N 天 → 新 dateKey */
export function addCalendarDaysToDateKey(
  dateKey: string,
  days: number,
  timeZone: string = DEFAULT_TIMEZONE
): string {
  const tzOffset = getTimezoneOffsetSuffix(timeZone)
  const anchor = new Date(`${dateKey}T12:00:00${tzOffset}`)
  anchor.setUTCDate(anchor.getUTCDate() + days)
  return getLocalDateKey(anchor, timeZone)
}

/**
 * - next_occurrence：今日提醒时刻未到 → 今天；已过 → 明天（最多 +1 天）
 * - renew_tomorrow：续订固定排「本地明天」同一提醒时刻（与弹窗「续订明日提醒」一致）
 */
export type ReminderScheduleMode = 'next_occurrence' | 'renew_tomorrow'

/**
 * 计算下一次提醒发送时刻（UTC ISO）
 */
export function computeNextScheduledFor(
  now: Date,
  reminderTime: string,
  timeZone: string = DEFAULT_TIMEZONE,
  mode: ReminderScheduleMode = 'next_occurrence'
): string {
  const parsed = parseReminderTime(reminderTime) || { hour: 9, minute: 0 }
  const localDateKey = getLocalDateKey(now, timeZone)

  let targetDateKey: string
  if (mode === 'renew_tomorrow') {
    targetDateKey = addCalendarDaysToDateKey(localDateKey, 1, timeZone)
  } else {
    const deltaMinutes = getMinutesFromReminderTime(now, reminderTime, timeZone)
    const daysAhead = deltaMinutes >= 0 ? 1 : 0
    targetDateKey =
      daysAhead === 0 ? localDateKey : addCalendarDaysToDateKey(localDateKey, daysAhead, timeZone)
  }

  const hh = String(parsed.hour).padStart(2, '0')
  const mm = String(parsed.minute).padStart(2, '0')
  const isoLike = `${targetDateKey}T${hh}:${mm}:00${getTimezoneOffsetSuffix(timeZone)}`
  return new Date(isoLike).toISOString()
}

/** 判断用户今日（本地）是否已有血压记录 */
export function userRecordedOnLocalDate(
  records: Array<{ recorded_at?: string | null }>,
  dateKey: string,
  timeZone: string = DEFAULT_TIMEZONE
): boolean {
  return records.some((row) => {
    if (!row.recorded_at) return false
    const d = new Date(row.recorded_at)
    if (Number.isNaN(d.getTime())) return false
    return getLocalDateKey(d, timeZone) === dateKey
  })
}
