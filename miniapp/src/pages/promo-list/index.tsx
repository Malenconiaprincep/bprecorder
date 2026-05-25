import { useState, useCallback } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useLoad, useDidShow, usePullDownRefresh } from '@tarojs/taro'
import { silentLogin, getUserInfo } from '../../lib/auth'
import {
  fetchPromoCampaignList,
  type PromoCampaignListItem,
  type PromoConsecutivePhase,
} from '../../lib/promo'
import { USE_TEST_DATA } from '../../utils/testData'
import './index.scss'

function phaseLabel(phase: PromoConsecutivePhase): string {
  if (phase === 'active') return '进行中'
  if (phase === 'ended') return '已结束'
  return '尚未开始'
}

export default function PromoListPage() {
  const [campaigns, setCampaigns] = useState<PromoCampaignListItem[]>([])
  const [loading, setLoading] = useState(() => !USE_TEST_DATA)
  const [sessionReady, setSessionReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (USE_TEST_DATA) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    const u = getUserInfo()
    let openid = u?.openid
    if (!openid || openid.startsWith('wx_')) {
      const r = await silentLogin()
      if (r.success && r.userInfo?.openid) openid = r.userInfo.openid
    }

    if (!openid || openid.startsWith('wx_')) {
      setSessionReady(false)
      setCampaigns([])
      setLoading(false)
      return
    }

    setSessionReady(true)

    try {
      const res = await fetchPromoCampaignList()
      if (res.ok && res.campaigns) {
        setCampaigns(res.campaigns)
        setError(null)
      } else {
        setCampaigns([])
        setError(res.error || '加载活动列表失败')
      }
    } catch {
      setCampaigns([])
      setError('网络异常，请下拉刷新重试')
    } finally {
      setLoading(false)
    }
  }, [])

  useLoad(() => {
    void refresh()
  })

  useDidShow(() => {
    void refresh()
  })

  usePullDownRefresh(() => {
    void (async () => {
      await refresh()
      Taro.stopPullDownRefresh()
    })()
  })

  const openDetail = (slug: string) => {
    Taro.navigateTo({
      url: `/pages/promo-activity/index?slug=${encodeURIComponent(slug)}`,
    })
  }

  return (
    <View className='page'>
      <ScrollView className='scroll' scrollY enhanced showScrollbar={false}>
        <Text className='lead'>选择活动查看规则、礼品与您的参与进度</Text>

        {!sessionReady && !loading ? (
          <View className='empty-card'>
            <Text className='empty-title'>请先登录</Text>
            <Text className='empty-body'>登录后可查看活动列表。请先到「我的」完成微信授权，或下拉刷新。</Text>
          </View>
        ) : loading && campaigns.length === 0 ? (
          <Text className='muted'>加载中…</Text>
        ) : campaigns.length > 0 ? (
          <View className='activity-list'>
            {campaigns.map((c) => (
              <View
                key={c.slug}
                className='activity-card'
                onClick={() => openDetail(c.slug)}
              >
                <View className='activity-card-head'>
                  <Text className='activity-title'>{c.title || c.slug}</Text>
                  <View className={`phase-pill phase-pill--${c.activity_phase}`}>
                    <Text className='phase-pill-text'>{phaseLabel(c.activity_phase)}</Text>
                  </View>
                </View>
                <Text className='activity-meta'>
                  {c.window_start} 至 {c.window_end}
                </Text>
                <Text className='activity-meta'>连续记录满 {c.required_streak_days} 天可参与</Text>
                <View className='activity-foot'>
                  <Text className='activity-hint'>查看详情与我的进度</Text>
                  <Text className='activity-arrow'>›</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View className='error-card'>
            <Text className='error-title'>暂无活动</Text>
            <Text className='error-body'>{error || '当前没有进行中的活动，请稍后再来。'}</Text>
          </View>
        )}

        {USE_TEST_DATA && <Text className='muted'>测试数据模式，不请求活动接口</Text>}
      </ScrollView>
    </View>
  )
}
