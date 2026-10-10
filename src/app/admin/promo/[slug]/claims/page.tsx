'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { STORAGE_KEY } from '../../campaign-types'
import { isPromoAdminDevBypass, promoAdminHeaders } from '../../promo-admin-dev'

type ClaimRow = {
  id: number
  campaign_slug: string
  user_id: string
  prize_tier: string
  recipient_name: string
  phone: string
  address: string
  created_at: string
}

type StreakUserRow = { user_id: string; distinct_days: number }

function tierLabel(t: string): string {
  if (t === 'grand') return '大奖'
  if (t === 'second') return '二等奖'
  return t
}

export default function AdminPromoClaimsPage() {
  const params = useParams()
  const segment = typeof params.slug === 'string' ? params.slug : Array.isArray(params.slug) ? params.slug[0] : ''
  const slug = segment ? decodeURIComponent(segment) : ''

  const [adminKey, setAdminKey] = useState('')
  const [claims, setClaims] = useState<ClaimRow[]>([])
  const [tierNameByKey, setTierNameByKey] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [streakFrom, setStreakFrom] = useState('')
  const [streakTo, setStreakTo] = useState('')
  const [streakLoading, setStreakLoading] = useState(false)
  const [streakError, setStreakError] = useState<string | null>(null)
  const [streakReport, setStreakReport] = useState<{
    range_start: string
    range_end: string
    expected_calendar_days: number
    timezone: string
    user_count: number
    users: StreakUserRow[]
    note?: string
  } | null>(null)

  useEffect(() => {
    try {
      const k = sessionStorage.getItem(STORAGE_KEY)
      if (k) setAdminKey(k)
    } catch {
      /* ignore */
    }
  }, [])

  const load = useCallback(async () => {
    if (!slug || slug === 'new') {
      setError('无效的活动 slug')
      setLoading(false)
      return
    }
    if (!isPromoAdminDevBypass && !adminKey.trim()) {
      setError('请先在本页填写管理密钥，或返回列表页填写后再进入。')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ campaign_slug: slug })
      const res = await fetch(`/api/admin/promo-claims?${qs}`, {
        headers: promoAdminHeaders(adminKey),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error || '加载失败')
        setClaims([])
        setTierNameByKey({})
        return
      }
      setClaims(data.claims || [])
      setTierNameByKey((data.tier_name_by_key as Record<string, string>) || {})
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '网络错误')
      setClaims([])
      setTierNameByKey({})
    } finally {
      setLoading(false)
    }
  }, [slug, adminKey])

  const loadStreakUsers = useCallback(async () => {
    if (!slug || slug === 'new') return
    if (!isPromoAdminDevBypass && !adminKey.trim()) {
      setStreakError('请先填写管理密钥')
      return
    }
    setStreakLoading(true)
    setStreakError(null)
    try {
      const qs = new URLSearchParams({ campaign_slug: slug })
      if (streakFrom.trim()) qs.set('from', streakFrom.trim())
      if (streakTo.trim()) qs.set('to', streakTo.trim())
      const res = await fetch(`/api/admin/promo-streak-users?${qs}`, {
        headers: promoAdminHeaders(adminKey),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setStreakError(data.error || '加载失败')
        setStreakReport(null)
        return
      }
      const r = data.report as Record<string, unknown>
      const users = (r.users as StreakUserRow[]) || []
      setStreakReport({
        range_start: String(r.range_start || ''),
        range_end: String(r.range_end || ''),
        expected_calendar_days: Number(r.expected_calendar_days) || 0,
        timezone: String(r.timezone || ''),
        user_count: Number(r.user_count) || users.length,
        users,
        note: typeof r.note === 'string' ? r.note : undefined,
      })
    } catch (e: unknown) {
      setStreakError(e instanceof Error ? e.message : '网络错误')
      setStreakReport(null)
    } finally {
      setStreakLoading(false)
    }
  }, [slug, adminKey, streakFrom, streakTo])

  useEffect(() => {
    void load()
  }, [load])

  const persistKey = (k: string) => {
    setAdminKey(k)
    try {
      sessionStorage.setItem(STORAGE_KEY, k)
    } catch {
      /* ignore */
    }
  }

  if (!slug || slug === 'new') {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <p className="text-slate-600">请先选择具体活动后再查看领取名单。</p>
        <Link href="/admin/promo" className="mt-4 inline-block text-blue-600 hover:underline">
          返回活动列表
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-6 flex flex-wrap gap-3 text-sm">
          <Link href="/admin/promo" className="text-blue-600 hover:underline">
            ← 活动列表
          </Link>
          <span className="text-slate-300">|</span>
          <Link href={`/admin/promo/${encodeURIComponent(slug)}`} className="text-blue-600 hover:underline">
            编辑活动配置
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-slate-800">已领取名单</h1>
        <p className="mt-1 font-mono text-sm text-slate-600">{slug}</p>

        {!isPromoAdminDevBypass ? (
          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <label className="block text-sm font-medium text-slate-700">管理密钥</label>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                type="password"
                className="min-w-[240px] flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
                value={adminKey}
                onChange={(e) => persistKey(e.target.value)}
              />
              <button
                type="button"
                className="rounded bg-slate-800 px-4 py-2 text-sm text-white"
                onClick={() => void load()}
              >
                重新加载
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="mt-4 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
            onClick={() => void load()}
          >
            刷新领取列表
          </button>
        )}

        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-medium text-slate-800">连续每日有记录（全勤）</h2>
          <p className="mt-2 text-sm text-slate-600">
            统计在活动窗口内、指定日期范围内<strong>每一天</strong>都至少有一条血压记录的用户（自然日按活动时区；与活动中心连续统计规则一致：以{' '}
            <code className="rounded bg-slate-100 px-1 text-xs">created_at</code> 为主，无则回退{' '}
            <code className="rounded bg-slate-100 px-1 text-xs">recorded_at</code>）。
          </p>
          <p className="mt-1 text-xs text-slate-500">
            留空起止日期时：默认从<strong>当年 5 月 1 日</strong>至<strong>今日</strong>（按活动时区），并与活动配置的统计窗口取交集。
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600">开始日（可选）</label>
              <input
                type="date"
                className="mt-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
                value={streakFrom}
                onChange={(e) => setStreakFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">结束日（可选）</label>
              <input
                type="date"
                className="mt-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
                value={streakTo}
                onChange={(e) => setStreakTo(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-900 disabled:opacity-50"
              disabled={streakLoading || (!isPromoAdminDevBypass && !adminKey.trim())}
              onClick={() => void loadStreakUsers()}
            >
              {streakLoading ? '统计中…' : '查询全勤用户'}
            </button>
          </div>
          {streakError ? (
            <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{streakError}</div>
          ) : null}
          {streakReport ? (
            <div className="mt-4">
              <p className="text-sm text-slate-700">
                实际统计区间：<span className="font-mono">{streakReport.range_start}</span> ～{' '}
                <span className="font-mono">{streakReport.range_end}</span>
                {streakReport.timezone ? (
                  <span className="text-slate-500">（{streakReport.timezone}）</span>
                ) : null}
                ，共 <strong>{streakReport.expected_calendar_days}</strong> 个自然日；符合条件{' '}
                <strong>{streakReport.user_count}</strong> 人。
              </p>
              {streakReport.note ? (
                <p className="mt-1 text-xs text-amber-800">提示：{streakReport.note}</p>
              ) : null}
              {streakReport.users.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">暂无用户满足该区间全勤。</p>
              ) : (
                <div className="mt-3 overflow-x-auto rounded border border-slate-100">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-medium uppercase text-slate-600">
                      <tr>
                        <th className="px-3 py-2">user_id</th>
                        <th className="whitespace-nowrap px-3 py-2">有记录天数</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {streakReport.users.map((u) => (
                        <tr key={u.user_id} className="hover:bg-slate-50/80">
                          <td className="max-w-[320px] truncate px-3 py-2 font-mono text-xs text-slate-700" title={u.user_id}>
                            {u.user_id}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">{u.distinct_days}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
        ) : null}

        {loading ? (
          <p className="mt-8 text-slate-500">加载中…</p>
        ) : !error && claims.length === 0 ? (
          <p className="mt-8 text-slate-500">暂无领取记录。</p>
        ) : !error ? (
          <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium uppercase text-slate-600">
                <tr>
                  <th className="whitespace-nowrap px-3 py-3">申请时间</th>
                  <th className="whitespace-nowrap px-3 py-3">档位</th>
                  <th className="min-w-[140px] px-3 py-3">user_id</th>
                  <th className="whitespace-nowrap px-3 py-3">收件人</th>
                  <th className="whitespace-nowrap px-3 py-3">手机</th>
                  <th className="min-w-[200px] px-3 py-3">地址</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {claims.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                      {r.created_at ? new Date(r.created_at).toLocaleString('zh-CN') : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {tierNameByKey[r.prize_tier] || tierLabel(r.prize_tier)}
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-3 font-mono text-xs text-slate-600" title={r.user_id}>
                      {r.user_id}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">{r.recipient_name}</td>
                    <td className="whitespace-nowrap px-3 py-3">{r.phone}</td>
                    <td className="px-3 py-3 text-slate-700">{r.address}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">共 {claims.length} 条</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
