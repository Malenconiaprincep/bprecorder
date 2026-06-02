import { useState, useCallback } from 'react'
import { View, Text, ScrollView, Input, Textarea } from '@tarojs/components'
import Taro, { useLoad, useDidShow, usePullDownRefresh, useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { silentLogin, getUserInfo } from '../../lib/auth'
import {
  fetchPromoCampaignStatus,
  submitPromoCampaignClaim,
  promoDisplayPrizeTiers,
  type PromoConsecutiveStatusPayload,
} from '../../lib/promo'
import { USE_TEST_DATA } from '../../utils/testData'
import './index.scss'

function prizeCardVisualClass(index: number): string {
  const m = index % 3
  if (m === 0) return 'prize-card--grand'
  if (m === 1) return 'prize-card--second'
  return 'prize-card--more'
}

function prizeSlotVisualClass(index: number): string {
  const m = index % 3
  if (m === 1) return 'prize-slot--violet'
  if (m === 2) return 'prize-slot--teal'
  return ''
}

export default function PromoActivityPage() {
  const [campaignSlug, setCampaignSlug] = useState<string | undefined>()
  const [promoStatus, setPromoStatus] = useState<PromoConsecutiveStatusPayload | null>(null)
  /** 首屏即加载中，避免短暂误显示「未登录」 */
  const [loading, setLoading] = useState(() => !USE_TEST_DATA)
  /** 已通过 openid 判定本地有微信登录态（与接口是否成功无关） */
  const [sessionReady, setSessionReady] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [showClaimModal, setShowClaimModal] = useState(false)
  const [recipientName, setRecipientName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const refresh = useCallback(async (slugOverride?: string) => {
    if (USE_TEST_DATA) {
      setLoading(false)
      return
    }
    setLoading(true)
    setStatusError(null)

    const u = getUserInfo()
    let openid = u?.openid
    if (!openid || openid.startsWith('wx_')) {
      const r = await silentLogin()
      if (r.success && r.userInfo?.openid) openid = r.userInfo.openid
    }

    if (!openid || openid.startsWith('wx_')) {
      setSessionReady(false)
      setPromoStatus(null)
      setLoading(false)
      return
    }

    setSessionReady(true)

    const slug = slugOverride ?? campaignSlug

    try {
      const res = await fetchPromoCampaignStatus(slug)
      if (res.ok && res.status) {
        setPromoStatus(res.status)
        setStatusError(null)
      } else {
        setPromoStatus(null)
        const hint =
          res.httpStatus === 404 || res.code === 'campaign_not_found'
            ? `${res.error || '活动未配置'}\n\n请确认：1) Supabase 已执行 scripts/promo_campaigns.sql；2) 服务端 PROMO_CAMPAIGN_SLUG 与库中 slug 一致。`
            : res.httpStatus === 503 || res.code === 'rpc_error'
              ? `${res.error || '服务暂不可用'}\n\n多为数据库函数未创建，请先执行上述 SQL。`
              : res.error || '加载活动状态失败'
        setStatusError(hint)
      }
    } catch {
      setPromoStatus(null)
      setStatusError('网络异常，请检查是否勾选「不校验合法域名」且本机 Next 已启动。')
    } finally {
      setLoading(false)
    }
  }, [campaignSlug])

  useLoad((options) => {
    const slug =
      typeof options?.slug === 'string' && options.slug.trim()
        ? options.slug.trim()
        : undefined
    setCampaignSlug(slug)
    void refresh(slug)
  })

  useDidShow(() => {
    const inst = Taro.getCurrentInstance()
    const slug =
      typeof inst.router?.params?.slug === 'string' && inst.router.params.slug.trim()
        ? inst.router.params.slug.trim()
        : campaignSlug
    if (slug !== campaignSlug) {
      setCampaignSlug(slug)
    }
    void refresh(slug)
  })

  usePullDownRefresh(() => {
    void (async () => {
      await refresh()
      Taro.stopPullDownRefresh()
    })()
  })

  useShareAppMessage(() => ({
    title: promoStatus?.title ? `${promoStatus.title} · 活动详情` : '活动详情 · 血压记录',
    path: campaignSlug
      ? `/pages/promo-activity/index?slug=${encodeURIComponent(campaignSlug)}`
      : '/pages/promo-activity/index',
  }))

  useShareTimeline(() => ({
    title: '活动中心 — 血压记录',
  }))

  const openClaimModal = () => {
    setRecipientName('')
    setPhone('')
    setAddress('')
    setShowClaimModal(true)
  }

  const submitClaim = async () => {
    if (!recipientName.trim() || recipientName.trim().length < 2) {
      Taro.showToast({ title: '请填写收件人姓名', icon: 'none' })
      return
    }
    const p = phone.replace(/\s/g, '')
    if (p.length < 8) {
      Taro.showToast({ title: '请填写有效手机号', icon: 'none' })
      return
    }
    if (!address.trim() || address.trim().length < 6) {
      Taro.showToast({ title: '请填写详细收件地址', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      const r = await submitPromoCampaignClaim(
        {
          recipientName: recipientName.trim(),
          phone: p,
          address: address.trim(),
        },
        campaignSlug
      )
      if (r.ok) {
        setShowClaimModal(false)
        Taro.showToast({
          title: r.prizeLabel ? `申请成功：${r.prizeLabel}` : '申请成功',
          icon: 'success',
          duration: 3500,
        })
        await refresh()
      } else {
        Taro.showToast({ title: r.error || '提交失败', icon: 'none', duration: 3200 })
      }
    } finally {
      setSubmitting(false)
    }
  }

  const req = promoStatus?.required_streak_days ?? 30
  const streakDays = promoStatus?.streak_days_in_window ?? 0
  const streakPct = req > 0 ? Math.min(100, Math.round((streakDays / req) * 100)) : 0

  const phaseLabel =
    promoStatus?.activity_phase === 'active'
      ? '进行中'
      : promoStatus?.activity_phase === 'ended'
        ? '已结束'
        : '尚未开始'

  const displayTiers = promoStatus ? promoDisplayPrizeTiers(promoStatus) : []

  return (
    <View className='page'>
      <ScrollView className='scroll' scrollY enhanced showScrollbar={false}>
        <View className='card card--rules'>
          {!sessionReady ? (
            <Text className='card-lead'>
              登录后可查看本期规则与您的参与进度。请先到「我的」完成微信授权，或下拉刷新。
            </Text>
          ) : loading && !promoStatus ? (
            <>
              <View className='skeleton-block skeleton-block--hero'>
                <View className='skeleton-line skeleton-line--lg' />
                <View className='skeleton-line skeleton-line--pill' />
              </View>
              <View className='skeleton-block skeleton-block--time'>
                <View className='skeleton-line skeleton-line--time' />
              </View>
              <View className='skeleton-panel'>
                <View className='skeleton-line' />
                <View className='skeleton-line' />
                <View className='skeleton-line skeleton-line--sm' />
              </View>
            </>
          ) : promoStatus ? (
            <>
              <View className='rules-hero'>
                <Text className='card-title'>{promoStatus.title || '本期活动'}</Text>
                <View className={`phase-pill phase-pill--${promoStatus.activity_phase}`}>
                  <Text className='phase-pill-text'>{phaseLabel}</Text>
                </View>
              </View>

              <View className='time-strip'>
                <Text className='time-strip-label'>活动时间</Text>
                <Text className='time-strip-dates'>
                  {promoStatus.window_start} 至 {promoStatus.window_end}
                </Text>
              </View>

              <View className='rules-panel'>
                <Text className='section-kicker section-kicker--inset'>如何达标</Text>
                <View className='rule-list'>
                  <View className='rule-item'>
                    <View className='rule-dot' />
                    <Text className='rule-text'>
                      窗口内每个自然日至少提交 1 条记录（以提交入库时间为准；补录时间不参与记录）；同日多条计为 1 天。
                    </Text>
                  </View>
                  <View className='rule-item'>
                    <View className='rule-dot' />
                    <Text className='rule-text'>
                      连续满 {req} 天即可达标；若中断则连续天数重新计算。
                    </Text>
                  </View>
                  <View className='rule-item'>
                    <View className='rule-dot' />
                    <Text className='rule-text'>
                      达标后可申请礼品，先到先得，每位用户限领 1 次。
                    </Text>
                  </View>
                </View>
              </View>

              <View className='prize-panel'>
                <Text className='section-kicker'>本期礼品</Text>
                <View className='prize-stack'>
                  {displayTiers.map((t, i) => (
                    <View key={t.tier_key} className={`prize-card ${prizeCardVisualClass(i)}`}>
                      <View className='prize-card-head'>
                        <Text className='prize-tier'>{t.tier_name || t.tier_key}</Text>
                        <View className={`prize-slot ${prizeSlotVisualClass(i)}`}>
                          <Text className='prize-slot-text'>{t.slots} 名</Text>
                        </View>
                      </View>
                      <Text className='prize-desc'>{t.label?.trim() ? t.label : '—'}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          ) : (
            <View className='error-card'>
              <Text className='error-card-title'>暂时无法加载活动</Text>
              <Text className='error-card-body'>{statusError || '请下拉刷新重试。'}</Text>
            </View>
          )}
        </View>

        {!USE_TEST_DATA && (
          <View className='card card--progress'>
            <View className='progress-head'>
              <Text className='card-title card-title--plain'>我的进度</Text>
              {promoStatus && (
                <View className={`mini-pill mini-pill--${promoStatus.activity_phase}`}>
                  <Text className='mini-pill-text'>{phaseLabel}</Text>
                </View>
              )}
            </View>
            {loading ? (
              <Text className='muted'>加载中…</Text>
            ) : promoStatus ? (
              <>
                <View className='streak-panel'>
                  <View className='streak-top'>
                    <Text className='streak-label'>连续有效记录</Text>
                    <Text className='streak-nums'>
                      <Text className='streak-current'>{streakDays}</Text>
                      <Text className='streak-slash'> / {req}</Text>
                      <Text className='streak-unit'> 天</Text>
                    </Text>
                  </View>
                  <Text className='streak-source-note'>
                    进度由服务端按上方活动时间内统计，下拉可刷新；与首页列表条数无关。
                  </Text>
                  <View className='progress-track'>
                    <View className='progress-fill' style={{ width: `${streakPct}%` }} />
                  </View>
                  <Text className='streak-hint'>
                    {promoStatus.qualified
                      ? '恭喜，您已满足连续记录要求'
                      : streakDays >= req
                        ? '已连续天数已达标，请留意活动申请时间'
                        : `距离达标还需连续 ${Math.max(0, req - streakDays)} 天`}
                  </Text>
                </View>

                <View className='quota-row'>
                  {displayTiers.map((t) => (
                    <View key={`q-${t.tier_key}`} className='quota-chip'>
                      <Text className='quota-chip-label'>{t.tier_name}剩余</Text>
                      <Text className='quota-chip-val'>{t.remaining}</Text>
                    </View>
                  ))}
                </View>

                {promoStatus.my_claim ? (
                  <View className='claimed-box'>
                    <Text className='claimed-title'>您已提交申请</Text>
                    <Text className='claimed-line'>
                      档位：
                      {promoStatus.my_claim.tier_name?.trim()
                        ? promoStatus.my_claim.tier_name
                        : promoStatus.my_claim.prize_tier}
                    </Text>
                    <Text className='claimed-line'>收件人：{promoStatus.my_claim.recipient_name}</Text>
                    <Text className='claimed-line'>手机：{promoStatus.my_claim.phone}</Text>
                  </View>
                ) : promoStatus.activity_phase === 'active' && promoStatus.qualified && !promoStatus.sold_out ? (
                  <View className='cta' onClick={openClaimModal}>
                    <Text className='cta-text'>填写收货信息并申请</Text>
                  </View>
                ) : (
                  <View className={`tip-banner tip-banner--${promoStatus.sold_out ? 'warn' : 'info'}`}>
                    <Text className='tip-banner-text'>
                      {promoStatus.sold_out
                        ? '礼品名额已满，感谢参与。'
                        : promoStatus.activity_phase !== 'active'
                          ? '当前不在申请期内，请关注活动时间。'
                          : `继续每日记录，保持连续打卡（当前 ${streakDays} 天）。`}
                    </Text>
                  </View>
                )}
              </>
            ) : !sessionReady ? (
              <Text className='muted'>
                未检测到登录态。请先到「我的」页完成微信登录，或下拉本页重试。
              </Text>
            ) : (
              <Text className='muted'>
                {statusError ? '若上方有报错说明，请按提示排查；也可下拉刷新。' : '暂时无法展示进度，请下拉刷新。'}
              </Text>
            )}
          </View>
        )}

        {USE_TEST_DATA && <Text className='hint'>当前为测试数据模式，不请求活动接口。</Text>}
      </ScrollView>

      {showClaimModal && (
        <View
          className='modal-mask'
          onClick={() => !submitting && setShowClaimModal(false)}
          catchMove
        >
          <View className='claim-modal' onClick={(e) => e.stopPropagation()}>
            <Text className='modal-title'>领取礼品 — 收货信息</Text>
            <Text className='claim-hint'>请确保信息准确，提交后不可修改（每用户限领 1 次）。</Text>
            <Text className='claim-label'>收件人</Text>
            <Input
              className='claim-input'
              placeholderClass='claim-input-placeholder'
              placeholder='真实姓名'
              value={recipientName}
              onInput={(e) => setRecipientName(e.detail.value)}
            />
            <Text className='claim-label'>手机号</Text>
            <Input
              className='claim-input'
              placeholderClass='claim-input-placeholder'
              type='number'
              placeholder='联系电话'
              value={phone}
              onInput={(e) => setPhone(e.detail.value)}
            />
            <Text className='claim-label'>详细地址</Text>
            <Textarea
              className='claim-textarea'
              placeholder='省市区街道门牌号'
              value={address}
              onInput={(e) => setAddress(e.detail.value)}
              maxlength={200}
            />
            <View className='modal-buttons'>
              <View
                className={`modal-btn cancel ${submitting ? 'disabled' : ''}`}
                onClick={submitting ? undefined : () => setShowClaimModal(false)}
              >
                <Text>取消</Text>
              </View>
              <View
                className={`modal-btn confirm ${submitting ? 'disabled' : ''}`}
                onClick={submitting ? undefined : submitClaim}
              >
                <Text>{submitting ? '提交中…' : '确认提交'}</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
