import { useState } from 'react'
import { View, Text, ScrollView, Image } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import type { DietAdviceData } from '../../types/dietAdvice'
import {
  DIET_ADVICE_DETAIL_STORAGE_KEY,
  DIET_ADVICE_FEATURE_NAME,
  DIET_ADVICE_GEN_PARAMS_KEY,
  type DietAdviceGenParams,
} from '../../types/dietAdvice'
import { generateDietAdviceOnDetailPage } from '../../utils/triggerDietAdvice'
import './index.scss'
// @ts-ignore
import aiMascot from '../../assets/diet/ai-mascot.png'

const MEAL_META = [
  { key: 'breakfast' as const, label: '早餐', emoji: '🌅', time: '07:00 – 09:00' },
  { key: 'lunch' as const, label: '午餐', emoji: '☀️', time: '11:30 – 13:00' },
  { key: 'dinner' as const, label: '晚餐', emoji: '🌙', time: '17:30 – 19:00' },
]

export default function DietAdvicePage() {
  const [data, setData] = useState<DietAdviceData | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  useLoad((options) => {
    const needGenerate = options?.generate === '1'
    if (needGenerate) {
      const params = Taro.getStorageSync(DIET_ADVICE_GEN_PARAMS_KEY) as
        | DietAdviceGenParams
        | undefined
      if (!params?.userId || !params.latest) {
        Taro.showToast({ title: '参数缺失，请重新保存记录', icon: 'none' })
        setTimeout(() => Taro.navigateBack(), 1200)
        return
      }
      Taro.setNavigationBarTitle({ title: `正在生成${DIET_ADVICE_FEATURE_NAME}` })
      setGenerating(true)
      void (async () => {
        const ok = await generateDietAdviceOnDetailPage(params)
        if (!ok) {
          setGenError('生成失败，请稍后重试')
          setGenerating(false)
          return
        }
        const stored = Taro.getStorageSync(DIET_ADVICE_DETAIL_STORAGE_KEY) as
          | DietAdviceData
          | undefined
        if (stored?.summary) {
          setData(stored)
          const title = stored.title?.replace(/^🍽\s*/, '') || DIET_ADVICE_FEATURE_NAME
          Taro.setNavigationBarTitle({ title })
        }
        setGenerating(false)
      })()
      return
    }

    const stored = Taro.getStorageSync(DIET_ADVICE_DETAIL_STORAGE_KEY) as DietAdviceData | undefined
    if (stored?.summary) {
      setData(stored)
      const title = stored.title?.replace(/^🍽\s*/, '') || DIET_ADVICE_FEATURE_NAME
      Taro.setNavigationBarTitle({ title })
    } else {
      Taro.showToast({ title: '暂无建议数据', icon: 'none' })
      setTimeout(() => Taro.navigateBack(), 1200)
    }
  })

  if (generating) {
    return (
      <View className='diet-page diet-page--loading'>
        <View className='diet-page-loading-box'>
          <View className='diet-loading-dots'>
            <View className='diet-loading-dot' />
            <View className='diet-loading-dot diet-loading-dot--2' />
            <View className='diet-loading-dot diet-loading-dot--3' />
          </View>
          <Text className='diet-page-loading-title'>正在生成{DIET_ADVICE_FEATURE_NAME}</Text>
          <Text className='diet-page-loading-hint'>请稍候，正在为您生成个性化建议…</Text>
        </View>
      </View>
    )
  }

  if (genError) {
    return (
      <View className='diet-page diet-page--loading'>
        <Text className='diet-page-empty'>{genError}</Text>
        <View className='diet-page-retry' onClick={() => Taro.navigateBack()}>
          <Text className='diet-page-retry-text'>返回</Text>
        </View>
      </View>
    )
  }

  if (!data) {
    return (
      <View className='diet-page'>
        <Text className='diet-page-empty'>加载中…</Text>
      </View>
    )
  }

  const { fullPlan } = data
  const pageTitle = data.title?.replace(/^🍽\s*/, '') || DIET_ADVICE_FEATURE_NAME
  const wx = data.weather

  return (
    <ScrollView className='diet-page' scrollY enhanced showScrollbar={false}>
      <View className='diet-page-hero'>
        {data.card?.badgeLabel || wx?.climateLabel ? (
          <Text className='diet-page-climate-badge'>
            {data.card?.badgeLabel || wx?.climateLabel}
          </Text>
        ) : null}
        <View className='diet-page-hero-icon'>
          <Image className='diet-page-hero-mascot' src={aiMascot} mode='aspectFit' />
        </View>
        <Text className='diet-page-hero-title'>{pageTitle}</Text>
        <Text className='diet-page-hero-tag'>
          {wx?.city ? `${wx.city} · 天气参考` : 'AI 定制'} · 结合血压与气候
        </Text>
      </View>

      <View className='diet-page-inner'>
        {data.summary ? (
          <View className='diet-card diet-card--climate'>
            <Text className='diet-card-climate-tip'>{data.summary}</Text>
            {wx?.temperatureC != null ? (
              <Text className='diet-card-climate-meta'>
                当地约 {wx.temperatureC}°C{wx.weatherText ? ` · ${wx.weatherText}` : ''}
              </Text>
            ) : null}
          </View>
        ) : null}

        {data.card?.pillars && data.card.pillars.length > 0 && (
          <View className='diet-card'>
            <View className='diet-card-head'>
              <Text className='diet-card-badge tips'>💡</Text>
              <Text className='diet-card-title'>今日要点</Text>
            </View>
            {data.card.pillars.map((p) => (
              <View key={p.key} className='diet-pillar-line'>
                <Text className='diet-pillar-title'>{p.title}</Text>
                <Text className='diet-pillar-text'>{p.text}</Text>
              </View>
            ))}
          </View>
        )}

        <View className='diet-card diet-card--salt'>
          <View className='diet-card-head'>
            <Text className='diet-card-badge salt'>🧂</Text>
            <Text className='diet-card-title'>少盐提醒</Text>
          </View>
          <Text className='diet-card-body'>{data.saltReminder}</Text>
        </View>

        <View className='diet-card diet-card--meals'>
          <View className='diet-card-head'>
            <Text className='diet-card-badge meal'>📅</Text>
            <Text className='diet-card-title'>今日三餐</Text>
          </View>
          <View className='diet-meal-timeline'>
            {MEAL_META.map((m) => {
              const value = fullPlan[m.key]
              if (!value) return null
              return (
                <View key={m.key} className='diet-meal-item'>
                  <View className='diet-meal-side'>
                    <View className='diet-meal-dot' />
                    <View className='diet-meal-line' />
                  </View>
                  <View className='diet-meal-content'>
                    <View className='diet-meal-head'>
                      <Text className='diet-meal-emoji'>{m.emoji}</Text>
                      <Text className='diet-meal-label'>{m.label}</Text>
                      <Text className='diet-meal-time'>{m.time}</Text>
                    </View>
                    <Text className='diet-meal-value'>{value}</Text>
                  </View>
                </View>
              )
            })}
            {fullPlan.snacks ? (
              <View className='diet-meal-item diet-meal-item--last'>
                <View className='diet-meal-side'>
                  <View className='diet-meal-dot diet-meal-dot--snack' />
                </View>
                <View className='diet-meal-content'>
                  <View className='diet-meal-head'>
                    <Text className='diet-meal-emoji'>🍎</Text>
                    <Text className='diet-meal-label'>加餐</Text>
                  </View>
                  <Text className='diet-meal-value'>{fullPlan.snacks}</Text>
                </View>
              </View>
            ) : null}
          </View>
        </View>

        <View className='diet-card'>
          <View className='diet-card-head'>
            <Text className='diet-card-badge good'>✓</Text>
            <Text className='diet-card-title'>推荐菜品</Text>
          </View>
          {data.recommendations.map((item, i) => (
            <View key={i} className='diet-list-chip'>
              <Text className='diet-list-num'>{i + 1}</Text>
              <Text className='diet-list-text'>{item}</Text>
            </View>
          ))}
        </View>

        {data.avoidTips.length > 0 && (
          <View className='diet-card diet-card--warn'>
            <View className='diet-card-head'>
              <Text className='diet-card-badge warn'>!</Text>
              <Text className='diet-card-title warn'>忌口提示</Text>
            </View>
            {data.avoidTips.map((item, i) => (
              <View key={i} className='diet-avoid-row'>
                <Text className='diet-avoid-x'>×</Text>
                <Text className='diet-avoid-text'>{item}</Text>
              </View>
            ))}
          </View>
        )}

        {fullPlan.tips?.length > 0 && (
          <View className='diet-card diet-card--tips'>
            <View className='diet-card-head'>
              <Text className='diet-card-badge tips'>💡</Text>
              <Text className='diet-card-title'>小贴士</Text>
            </View>
            {fullPlan.tips.map((item, i) => (
              <View key={i} className='diet-tip-row'>
                <Text className='diet-tip-bullet'>·</Text>
                <Text className='diet-tip-text'>{item}</Text>
              </View>
            ))}
          </View>
        )}

        {data.card?.tags && data.card.tags.length > 0 && (
          <View className='diet-tags-row'>
            {data.card.tags.map((t, i) => (
              <View key={i} className='diet-tag-chip'>
                <Text className='diet-tag-chip-text'>{t}</Text>
              </View>
            ))}
          </View>
        )}

        <View className='diet-disclaimer-wrap'>
          <Text className='diet-disclaimer'>{data.disclaimer}</Text>
        </View>
        <View className='diet-page-bottom-spacer' />
      </View>
    </ScrollView>
  )
}
