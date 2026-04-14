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
            刷新
          </button>
        )}

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
