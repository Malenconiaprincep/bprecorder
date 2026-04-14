'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { Campaign } from './campaign-types'
import { STORAGE_KEY } from './campaign-types'
import { isPromoAdminDevBypass, promoAdminHeaders } from './promo-admin-dev'

export default function AdminPromoListPage() {
  const [adminKey, setAdminKey] = useState('')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [activeSlugHint, setActiveSlugHint] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [resetBusy, setResetBusy] = useState(false)
  const devAutoFetchOnce = useRef(false)

  useEffect(() => {
    try {
      const k = sessionStorage.getItem(STORAGE_KEY)
      if (k) setAdminKey(k)
    } catch {
      /* ignore */
    }
  }, [])

  const persistKey = (k: string) => {
    setAdminKey(k)
    try {
      sessionStorage.setItem(STORAGE_KEY, k)
    } catch {
      /* ignore */
    }
  }

  const loadList = useCallback(async () => {
    if (!isPromoAdminDevBypass && !adminKey.trim()) {
      setMessage({ type: 'err', text: '请先填写管理密钥' })
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/promo-campaigns', {
        headers: promoAdminHeaders(adminKey),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setMessage({ type: 'err', text: data.error || '加载失败' })
        return
      }
      setCampaigns(data.campaigns || [])
      setActiveSlugHint(data.activeSlugHint || '')
    } catch (e: unknown) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : '网络错误' })
    } finally {
      setLoading(false)
    }
  }, [adminKey])

  /** 本地 next dev：进入页面自动拉一次列表，无需手点「拉取列表」 */
  useEffect(() => {
    if (!isPromoAdminDevBypass || devAutoFetchOnce.current) return
    devAutoFetchOnce.current = true
    void loadList()
  }, [isPromoAdminDevBypass, loadList])

  const postPromoClaims = async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/admin/promo-claims', {
      method: 'POST',
      headers: promoAdminHeaders(adminKey, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    return { res, data }
  }

  const deleteAllClaimsForSlug = async (slug: string) => {
    const s = slug.trim()
    if (!s) return
    if (!isPromoAdminDevBypass && !adminKey.trim()) {
      setMessage({ type: 'err', text: '请先填写管理密钥' })
      return
    }
    if (
      !window.confirm(
        `将删除活动「${s}」下【全部】领取记录，所有用户可再次提交申请，名额统计会恢复。\n\n确定执行？`
      )
    ) {
      return
    }
    setResetBusy(true)
    setMessage(null)
    try {
      const { res, data } = await postPromoClaims({
        campaign_slug: s,
        reset_all_claims: true,
      })
      if (!res.ok || !data.success) {
        setMessage({ type: 'err', text: data.error || '清空失败' })
        return
      }
      setMessage({ type: 'ok', text: data.message || `已删除 ${data.deleted ?? 0} 条` })
    } catch (e: unknown) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : '网络错误' })
    } finally {
      setResetBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold text-slate-800">活动配置（promo_campaigns）</h1>
        <p className="mt-2 text-sm text-slate-600">
          在 Supabase 执行 <code className="rounded bg-slate-200 px-1">scripts/promo_campaigns.sql</code> 后，在此管理各期活动。
          小程序当前期由环境变量 <code className="rounded bg-slate-200 px-1">PROMO_CAMPAIGN_SLUG</code> 决定（未设置时默认为{' '}
          <code className="rounded bg-slate-200 px-1">consecutive-streak</code>）。
        </p>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          {isPromoAdminDevBypass ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              当前为 <strong>开发模式</strong>（<code className="rounded bg-amber-100/80 px-1">next dev</code>
              ）：活动管理接口<strong>不要求</strong>密钥；<strong>进入本页会自动拉取列表</strong>，也可随时点「拉取列表」刷新。
              部署到线上后仍须配置 <code className="rounded bg-slate-200 px-1">PROMO_ADMIN_KEY</code> 并在下方填写。
            </p>
          ) : null}
          <label className={`block text-sm font-medium text-slate-700 ${isPromoAdminDevBypass ? 'mt-4' : ''}`}>
            管理密钥{isPromoAdminDevBypass ? '（可选，模拟生产校验）' : '（对应环境变量 PROMO_ADMIN_KEY，至少 8 位）'}
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              type="password"
              className="min-w-[240px] flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder={isPromoAdminDevBypass ? '开发环境可不填' : '输入后保存在本机 sessionStorage'}
              value={adminKey}
              onChange={(e) => persistKey(e.target.value)}
            />
            <button
              type="button"
              className="rounded bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-50"
              disabled={loading}
              onClick={() => void loadList()}
            >
              拉取列表
            </button>
          </div>
          {activeSlugHint ? (
            <p className="mt-2 text-xs text-slate-500">
              当前服务端 PROMO_CAMPAIGN_SLUG 提示：<strong>{activeSlugHint}</strong>
            </p>
          ) : null}
        </div>

        {message ? (
          <div
            className={`mt-4 rounded-md px-3 py-2 text-sm ${
              message.type === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
            }`}
          >
            {message.text}
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-slate-800">已配置活动</h2>
          <Link
            href="/admin/promo/new"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            新建活动
          </Link>
        </div>

        <ul className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white shadow-sm">
          {campaigns.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-slate-500">
              {loading
                ? '加载中…'
                : isPromoAdminDevBypass
                  ? '暂无数据。若刚打开页面请稍候；仍没有则点「拉取列表」或确认数据库已执行脚本。'
                  : '暂无数据。请点击「拉取列表」并填写管理密钥，或确认数据库已执行脚本。'}
            </li>
          ) : (
            campaigns.map((c) => (
              <li key={c.slug} className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <Link
                  href={`/admin/promo/${encodeURIComponent(c.slug)}`}
                  className="min-w-0 flex-1 flex flex-col gap-1 transition-colors hover:opacity-90"
                >
                  <div className="font-mono text-base font-semibold text-slate-900">{c.slug}</div>
                  {c.title ? <div className="text-sm text-slate-700">{c.title}</div> : null}
                  <div className="text-xs text-slate-500">
                    {c.window_start_date} ~ {c.window_end_date} · 连续 {c.required_streak_days} 天 ·{' '}
                    {c.prize_tiers && c.prize_tiers.length > 0
                      ? c.prize_tiers.map((t) => `${t.tier_name} ${t.slots}名`).join(' · ')
                      : `大奖 ${c.grand_prize_slots} / 二等奖 ${c.second_prize_slots}`}
                    {!c.is_enabled ? ' · 已停用' : ''}
                  </div>
                  <span className="text-sm text-blue-600">查看与编辑 →</span>
                </Link>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <Link
                    href={`/admin/promo/${encodeURIComponent(c.slug)}/claims`}
                    className="rounded border border-slate-300 bg-white px-3 py-2 text-center text-xs font-medium text-slate-800 hover:bg-slate-50"
                  >
                    已领取名单
                  </Link>
                  <button
                    type="button"
                    className="rounded border border-rose-300 bg-white px-3 py-2 text-xs font-medium text-rose-800 hover:bg-rose-50 disabled:opacity-50"
                    disabled={resetBusy}
                    onClick={() => void deleteAllClaimsForSlug(c.slug)}
                  >
                    清空本期领取
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
