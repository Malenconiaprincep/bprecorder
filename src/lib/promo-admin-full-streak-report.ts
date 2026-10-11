import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function normalizePromoSlug(s: string): string | null {
  const t = s.trim()
  if (!t || t.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(t)) return null
  return t
}

function calendarDateInTz(d: Date, ianaTz: string): string {
  return d.toLocaleDateString('en-CA', { timeZone: ianaTz })
}

function parseYmd(s: string): { ok: true; ymd: string } | { ok: false; error: string } {
  const t = s.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    return { ok: false, error: '日期须为 YYYY-MM-DD' }
  }
  const [y, m, d] = t.split('-').map((x) => Number(x))
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return { ok: false, error: '无效日期' }
  }
  return { ok: true, ymd: t }
}

function ymdSlice(raw: string): string {
  const s = String(raw)
  return s.length >= 10 ? s.slice(0, 10) : s
}

function maxYmd(a: string, b: string): string {
  return a >= b ? a : b
}

function minYmd(a: string, b: string): string {
  return a <= b ? a : b
}

function addCalendarDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d))
  base.setUTCDate(base.getUTCDate() + delta)
  const yy = base.getUTCFullYear()
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(base.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function effectiveInstant(created_at: string | null, recorded_at: string | null): Date | null {
  const raw = created_at || recorded_at
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function recordLocalDay(created_at: string | null, recorded_at: string | null, tz: string): string | null {
  const d = effectiveInstant(created_at, recorded_at)
  if (!d) return null
  return calendarDateInTz(d, tz)
}

type BpRow = {
  id: number
  user_id: string
  created_at: string | null
  recorded_at: string | null
}

const PAGE = 1000

async function fetchBpRowsInUtcWindow(
  supabase: SupabaseClient,
  isoA: string,
  isoB: string,
  timeCol: 'recorded_at' | 'created_at'
): Promise<BpRow[]> {
  const out: BpRow[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('bp_records')
      .select('id, user_id, created_at, recorded_at')
      .gte(timeCol, isoA)
      .lte(timeCol, isoB)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) {
      throw new Error(`${timeCol} 分页查询失败: ${error.message}`)
    }
    const rows = (data || []) as BpRow[]
    out.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }
  return out
}

export type FullStreakReportPayload = {
  requested: { from: string; to: string }
  report: {
    ok: true
    campaign_slug: string
    campaign_enabled: boolean
    timezone: string
    range_start: string
    range_end: string
    expected_calendar_days: number
    note?: string
    users: { user_id: string; distinct_days: number }[]
    user_count: number
  }
}

export type FullStreakReportError = { status: number; error: string }

/**
 * 活动窗口内指定日历区间「每日都有 bp_records」的用户（内存聚合，与 promo 同日界规则一致）。
 */
export async function runPromoFullStreakReport(
  supabaseUrl: string,
  supabaseServiceKey: string,
  slug: string,
  fromRaw: string | undefined | null,
  toRaw: string | undefined | null
): Promise<{ ok: true; data: FullStreakReportPayload } | { ok: false; err: FullStreakReportError }> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { data: camp, error: campErr } = await supabase
    .from('promo_campaigns')
    .select('slug,tz,window_start_date,window_end_date,is_enabled')
    .eq('slug', slug)
    .maybeSingle()

  if (campErr) {
    return { ok: false, err: { status: 500, error: campErr.message } }
  }
  if (!camp?.tz) {
    return { ok: false, err: { status: 404, error: '活动不存在' } }
  }

  const tz = String(camp.tz)
  const todayStr = calendarDateInTz(new Date(), tz)
  const year = todayStr.slice(0, 4)

  let rangeStart: string
  if (fromRaw?.trim()) {
    const p = parseYmd(fromRaw)
    if (!p.ok) {
      return { ok: false, err: { status: 400, error: `from：${p.error}` } }
    }
    rangeStart = p.ymd
  } else {
    rangeStart = `${year}-05-01`
  }

  let rangeEnd: string
  if (toRaw?.trim()) {
    const p = parseYmd(toRaw)
    if (!p.ok) {
      return { ok: false, err: { status: 400, error: `to：${p.error}` } }
    }
    rangeEnd = p.ymd
  } else {
    rangeEnd = todayStr
  }

  if (rangeStart > rangeEnd) {
    return { ok: false, err: { status: 400, error: 'from 不能晚于 to' } }
  }

  const winStart = ymdSlice(String(camp.window_start_date))
  const winEnd = ymdSlice(String(camp.window_end_date))
  const r0 = maxYmd(rangeStart, winStart)
  const r1 = minYmd(minYmd(rangeEnd, winEnd), todayStr)

  if (r0 > r1) {
    return {
      ok: true,
      data: {
        requested: { from: rangeStart, to: rangeEnd },
        report: {
          ok: true,
          campaign_slug: slug,
          campaign_enabled: Boolean(camp.is_enabled),
          timezone: tz,
          range_start: r0,
          range_end: r1,
          expected_calendar_days: 0,
          note: 'empty_range_after_clamp',
          users: [],
          user_count: 0,
        },
      },
    }
  }

  let expected = 0
  {
    let cur = r0
    while (cur <= r1) {
      expected += 1
      if (expected > 400) {
        return { ok: false, err: { status: 400, error: '统计区间过长（>400 天），请缩小 from～to 后再查' } }
      }
      cur = addCalendarDays(cur, 1)
    }
  }

  const slackDays = 7
  const fetchStartYmd = addCalendarDays(r0, -slackDays)
  const fetchEndYmd = addCalendarDays(r1, slackDays)
  const isoA = `${fetchStartYmd}T00:00:00.000Z`
  const isoB = `${fetchEndYmd}T23:59:59.999Z`

  let mergedById: Map<number, BpRow>
  try {
    const [byRecorded, byCreated] = await Promise.all([
      fetchBpRowsInUtcWindow(supabase, isoA, isoB, 'recorded_at'),
      fetchBpRowsInUtcWindow(supabase, isoA, isoB, 'created_at'),
    ])
    mergedById = new Map<number, BpRow>()
    for (const row of byRecorded) mergedById.set(row.id, row)
    for (const row of byCreated) mergedById.set(row.id, row)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '查询失败'
    return { ok: false, err: { status: 500, error: msg } }
  }

  const userDays = new Map<string, Set<string>>()
  for (const row of mergedById.values()) {
    const day = recordLocalDay(row.created_at, row.recorded_at, tz)
    if (!day || day < r0 || day > r1) continue
    const uid = row.user_id
    if (!uid) continue
    let set = userDays.get(uid)
    if (!set) {
      set = new Set()
      userDays.set(uid, set)
    }
    set.add(day)
  }

  const users: { user_id: string; distinct_days: number }[] = []
  for (const [user_id, days] of userDays) {
    if (days.size === expected) {
      users.push({ user_id, distinct_days: days.size })
    }
  }
  users.sort((a, b) => a.user_id.localeCompare(b.user_id))

  return {
    ok: true,
    data: {
      requested: { from: rangeStart, to: rangeEnd },
      report: {
        ok: true,
        campaign_slug: slug,
        campaign_enabled: Boolean(camp.is_enabled),
        timezone: tz,
        range_start: r0,
        range_end: r1,
        expected_calendar_days: expected,
        users,
        user_count: users.length,
      },
    },
  }
}

export function fullStreakReportToHtml(payload: FullStreakReportPayload): string {
  const { requested, report } = payload
  const rows = report.users
    .map(
      (u) =>
        `<tr><td style="font-family:monospace;font-size:12px;padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(
          u.user_id
        )}</td><td style="padding:6px 8px;border-bottom:1px solid #eee">${u.distinct_days}</td></tr>`
    )
    .join('')
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>全勤用户 · ${escapeHtml(report.campaign_slug)}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:960px;margin:24px auto;padding:0 16px;color:#1e293b">
<h1 style="font-size:1.25rem">连续每日有记录（全勤）</h1>
<p style="color:#64748b;font-size:14px">活动 <code>${escapeHtml(report.campaign_slug)}</code> · 时区 ${escapeHtml(
    report.timezone
  )} · 请求区间 ${escapeHtml(requested.from)}～${escapeHtml(requested.to)}</p>
<p style="font-size:14px">实际统计：<strong>${escapeHtml(report.range_start)}</strong> ～ <strong>${escapeHtml(
    report.range_end
  )}</strong>，共 <strong>${report.expected_calendar_days}</strong> 天；符合条件 <strong>${
    report.user_count
  }</strong> 人。</p>
${report.note ? `<p style="color:#b45309;font-size:13px">提示：${escapeHtml(report.note)}</p>` : ''}
<table style="width:100%;border-collapse:collapse;margin-top:16px;border:1px solid #e2e8f0">
<thead><tr style="background:#f8fafc;text-align:left;font-size:12px;color:#64748b">
<th style="padding:8px">user_id</th><th style="padding:8px;width:100px">有记录天数</th></tr></thead>
<tbody>${rows || '<tr><td colspan="2" style="padding:12px;color:#94a3b8">暂无</td></tr>'}</tbody>
</table>
<p style="margin-top:24px;font-size:12px;color:#94a3b8">切换：<a href="?format=html">HTML</a> · <a href="?format=json">JSON</a></p>
</body></html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
