'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import type { Campaign, PromoPrizeTier } from '../campaign-types'
import { STORAGE_KEY, createEmptyCampaign } from '../campaign-types'
import { isPromoAdminDevBypass, promoAdminHeaders } from '../promo-admin-dev'

function tiersFromLegacyCampaign(c: Campaign): PromoPrizeTier[] {
  return [
    {
      tier_key: 'grand',
      tier_name: '大奖',
      sort_order: 1,
      slots: c.grand_prize_slots,
      label: c.grand_prize_label || '',
    },
    {
      tier_key: 'second',
      tier_name: '二等奖',
      sort_order: 2,
      slots: c.second_prize_slots,
      label: c.second_prize_label || '',
    },
  ]
}

function normalizeTiersForSave(tiers: PromoPrizeTier[] | undefined): PromoPrizeTier[] {
  return [...(tiers || [])].sort((a, b) => a.sort_order - b.sort_order)
}

export default function AdminPromoDetailPage() {
  const params = useParams()
  const router = useRouter()
  const segment = typeof params.slug === 'string' ? params.slug : Array.isArray(params.slug) ? params.slug[0] : 'new'
  const slugFromUrl = segment ? decodeURIComponent(segment) : 'new'
  const isNew = slugFromUrl === 'new'

  const [adminKey, setAdminKey] = useState('')
  const [form, setForm] = useState<Campaign>(() => createEmptyCampaign())
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

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

  const loadOne = useCallback(async () => {
    if (isNew) {
      setForm(createEmptyCampaign())
      setLoadError(null)
      return
    }
    if (!isPromoAdminDevBypass && !adminKey.trim()) {
      setLoadError('请先填写管理密钥后再加载本条配置。')
      return
    }
    setLoading(true)
    setLoadError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/promo-campaigns', {
        headers: promoAdminHeaders(adminKey),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setLoadError(data.error || '加载失败')
        return
      }
      const list: Campaign[] = data.campaigns || []
      let found = list.find((c) => c.slug === slugFromUrl)
      if (!found) {
        setLoadError(`未找到 slug 为「${slugFromUrl}」的活动，可能已被删除。`)
        setForm(createEmptyCampaign())
        return
      }
      if (!found.prize_tiers?.length) {
        found = {
          ...found,
          prize_tiers: tiersFromLegacyCampaign(found),
        }
      }
      setForm({ ...found })
      setLoadError(null)
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : '网络错误')
    } finally {
      setLoading(false)
    }
  }, [adminKey, isNew, slugFromUrl])

  useEffect(() => {
    void loadOne()
  }, [loadOne])

  const save = async () => {
    if (!isPromoAdminDevBypass && !adminKey.trim()) {
      setMessage({ type: 'err', text: '请先填写管理密钥' })
      return
    }
    if (!form.slug.trim()) {
      setMessage({ type: 'err', text: 'slug 不能为空' })
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/promo-campaigns', {
        method: 'POST',
        headers: promoAdminHeaders(adminKey, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          slug: form.slug.trim(),
          title: form.title,
          window_start_date: form.window_start_date,
          window_end_date: form.window_end_date,
          required_streak_days: form.required_streak_days,
          grand_prize_slots: form.grand_prize_slots,
          second_prize_slots: form.second_prize_slots,
          grand_prize_label: form.grand_prize_label,
          second_prize_label: form.second_prize_label,
          prize_tiers: normalizeTiersForSave(form.prize_tiers),
          tz: form.tz,
          is_enabled: form.is_enabled,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setMessage({ type: 'err', text: data.error || '保存失败' })
        return
      }
      setMessage({ type: 'ok', text: '已保存' })
      const savedSlug = form.slug.trim()
      if (data.campaign) {
        setForm({ ...data.campaign })
      }
      if (isNew || savedSlug !== slugFromUrl) {
        router.replace(`/admin/promo/${encodeURIComponent(savedSlug)}`)
      }
    } catch (e: unknown) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : '网络错误' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-6">
          <Link href="/admin/promo" className="text-sm text-blue-600 hover:underline">
            ← 返回活动列表
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-slate-800">
          {isNew ? '新建活动' : `编辑活动 · ${slugFromUrl}`}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          修改后点击底部保存。若修改了 slug 并保存，将按新 slug 作为唯一键写入数据库。
        </p>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          {isPromoAdminDevBypass ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              开发模式：可不填密钥即可加载与保存。填写密钥则与生产行为一致（校验头）。
            </p>
          ) : null}
          <label className={`block text-sm font-medium text-slate-700 ${isPromoAdminDevBypass ? 'mt-4' : ''}`}>
            管理密钥（x-promo-admin-key）{isPromoAdminDevBypass ? '· 可选' : ''}
          </label>
          <input
            type="password"
            className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder={isPromoAdminDevBypass ? '开发环境可不填' : '与列表页共用 sessionStorage'}
            value={adminKey}
            onChange={(e) => persistKey(e.target.value)}
          />
          {!isNew ? (
            <button
              type="button"
              className="mt-3 rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
              disabled={loading || (!isPromoAdminDevBypass && !adminKey.trim())}
              onClick={() => void loadOne()}
            >
              重新加载本条
            </button>
          ) : null}
        </div>

        {loadError ? (
          <div className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{loadError}</div>
        ) : null}

        {message ? (
          <div
            className={`mt-4 rounded-md px-3 py-2 text-sm ${
              message.type === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
            }`}
          >
            {message.text}
          </div>
        ) : null}

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-slate-600">slug（唯一，新建时勿与现有重复）</label>
              <input
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                readOnly={!isNew}
                title={!isNew ? '已存在活动的 slug 不可在此修改；新期请用列表页「新建活动」' : undefined}
              />
              {!isNew ? (
                <p className="mt-1 text-xs text-slate-500">如需更换 slug，请使用列表页「新建活动」创建新一期。</p>
              ) : null}
            </div>
            <div>
              <label className="text-slate-600">标题（展示用）</label>
              <input
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="text-slate-600">统计窗口开始（YYYY-MM-DD）</label>
                <input
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                  value={form.window_start_date}
                  onChange={(e) => setForm((f) => ({ ...f, window_start_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-slate-600">统计窗口结束（含当天）</label>
                <input
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                  value={form.window_end_date}
                  onChange={(e) => setForm((f) => ({ ...f, window_end_date: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="text-slate-600">所需连续有记录天数</label>
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                value={form.required_streak_days}
                onChange={(e) => setForm((f) => ({ ...f, required_streak_days: Number(e.target.value) || 1 }))}
              />
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50/80 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-medium text-slate-700">奖项档位（先到先得，按排序数字从小到大）</label>
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                  onClick={() =>
                    setForm((f) => {
                      const tiers = [...(f.prize_tiers || [])]
                      const nextOrder =
                        tiers.length === 0 ? 1 : Math.max(...tiers.map((t) => t.sort_order), 0) + 1
                      tiers.push({
                        tier_key: `tier_${nextOrder}`,
                        tier_name: `奖项${nextOrder}`,
                        sort_order: nextOrder,
                        slots: 1,
                        label: '',
                      })
                      return { ...f, prize_tiers: tiers }
                    })
                  }
                >
                  添加一档
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                tier_key 保存后勿改（与已领取记录关联）；需改 key 请新建活动期。key 规则：小写字母开头，仅 a-z、0-9、下划线。
              </p>
              <div className="mt-3 space-y-3">
                {(form.prize_tiers || []).map((t, idx) => (
                  <div
                    key={`${t.tier_key}-${idx}`}
                    className="rounded border border-slate-200 bg-white p-3 text-xs sm:text-sm"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-slate-700">第 {idx + 1} 档</span>
                      <button
                        type="button"
                        className="text-rose-600 hover:underline disabled:opacity-40"
                        disabled={(form.prize_tiers || []).length <= 1}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            prize_tiers: (f.prize_tiers || []).filter((_, i) => i !== idx),
                          }))
                        }
                      >
                        删除
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label className="text-slate-600">tier_key（机器名）</label>
                        <input
                          className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-xs"
                          value={t.tier_key}
                          onChange={(e) =>
                            setForm((f) => {
                              const tiers = [...(f.prize_tiers || [])]
                              tiers[idx] = { ...tiers[idx], tier_key: e.target.value }
                              return { ...f, prize_tiers: tiers }
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-slate-600">展示名称（如 三等奖）</label>
                        <input
                          className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                          value={t.tier_name}
                          onChange={(e) =>
                            setForm((f) => {
                              const tiers = [...(f.prize_tiers || [])]
                              tiers[idx] = { ...tiers[idx], tier_name: e.target.value }
                              return { ...f, prize_tiers: tiers }
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-slate-600">排序（越小越优先）</label>
                        <input
                          type="number"
                          min={0}
                          className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                          value={t.sort_order}
                          onChange={(e) =>
                            setForm((f) => {
                              const tiers = [...(f.prize_tiers || [])]
                              tiers[idx] = { ...tiers[idx], sort_order: Number(e.target.value) || 0 }
                              return { ...f, prize_tiers: tiers }
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-slate-600">名额</label>
                        <input
                          type="number"
                          min={0}
                          className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                          value={t.slots}
                          onChange={(e) =>
                            setForm((f) => {
                              const tiers = [...(f.prize_tiers || [])]
                              tiers[idx] = { ...tiers[idx], slots: Number(e.target.value) || 0 }
                              return { ...f, prize_tiers: tiers }
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="mt-2">
                      <label className="text-slate-600">礼品说明 /领奖提示文案</label>
                      <input
                        className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                        value={t.label}
                        onChange={(e) =>
                          setForm((f) => {
                            const tiers = [...(f.prize_tiers || [])]
                            tiers[idx] = { ...tiers[idx], label: e.target.value }
                            return { ...f, prize_tiers: tiers }
                          })
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className="text-slate-600">时区（日历日按此时区）</label>
              <input
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                value={form.tz}
                onChange={(e) => setForm((f) => ({ ...f, tz: e.target.value }))}
              />
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_enabled}
                onChange={(e) => setForm((f) => ({ ...f, is_enabled: e.target.checked }))}
              />
              <span>启用（停用后小程序侧会提示活动不可用）</span>
            </label>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                className="flex-1 rounded bg-blue-600 py-2.5 text-white hover:bg-blue-700 disabled:opacity-50 sm:flex-none sm:px-8"
                disabled={loading}
                onClick={() => void save()}
              >
                保存到数据库
              </button>
              <Link
                href="/admin/promo"
                className="inline-flex items-center justify-center rounded border border-slate-300 px-4 py-2.5 text-slate-700 hover:bg-slate-50"
              >
                取消并返回列表
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
