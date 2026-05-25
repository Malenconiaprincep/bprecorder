import { useState, useEffect, useMemo } from 'react'
import { View, Text, ScrollView, Image, Canvas, Button } from '@tarojs/components'
import Taro, { useLoad, useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import type { DietAdviceData } from '../../types/dietAdvice'
import {
  DIET_ADVICE_DETAIL_STORAGE_KEY,
  DIET_ADVICE_FEATURE_NAME,
  DIET_ADVICE_GEN_PARAMS_KEY,
  type DietAdviceGenParams,
} from '../../types/dietAdvice'
import { generateDietAdviceOnDetailPage } from '../../utils/triggerDietAdvice'
import {
  DIET_ADVICE_USE_MOCK_DETAIL,
  buildDietAdviceDetailMock,
} from '../../utils/dietAdviceDetailMock'
import {
  DIET_ADVICE_CANVAS_ID,
  DIET_ADVICE_CANVAS_W,
  estimateDietAdviceImageHeight,
  generateDietAdviceShareImage,
  saveDietAdviceLongImage,
} from '../../utils/dietAdviceShareImage'
import './index.scss'
// @ts-ignore
import iconTipsLightbulb from '../../assets/diet/tips-lightbulb-icon.png'
// @ts-ignore
import iconRecommendCheck from '../../assets/diet/recommend-check-icon.png'
// @ts-ignore
import iconAvoidWarn from '../../assets/diet/avoid-warn-icon.png'

const MEAL_META = [
  { key: 'breakfast' as const, label: '早餐', emoji: '🌅', time: '07:00 – 09:00' },
  { key: 'lunch' as const, label: '午餐', emoji: '☀️', time: '11:30 – 13:00' },
  { key: 'dinner' as const, label: '晚餐', emoji: '🌙', time: '17:30 – 19:00' },
]

function formatPillarDesc(text: string): string {
  const normalized = text.replace(/\\n/g, '\n').trim()
  if (!normalized) return ''

  if (normalized.includes('\n')) {
    return normalized
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .join('，')
  }

  if (/\s*[+＋]\s*/.test(normalized)) {
    return normalized
      .split(/\s*[+＋]\s*/)
      .map((s) => s.trim())
      .filter(Boolean)
      .join('，')
  }

  return normalized
}

export default function DietAdvicePage() {
  const [data, setData] = useState<DietAdviceData | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [shareImagePath, setShareImagePath] = useState('')
  const [savingImage, setSavingImage] = useState(false)

  const canvasHeight = useMemo(
    () => (data ? estimateDietAdviceImageHeight(data) : 1200),
    [data]
  )

  useEffect(() => {
    if (!data?.summary) {
      setShareImagePath('')
      return
    }
    const timer = setTimeout(() => {
      generateDietAdviceShareImage(data)
        .then(setShareImagePath)
        .catch(() => setShareImagePath(''))
    }, 600)
    return () => clearTimeout(timer)
  }, [data])

  useShareAppMessage(() => {
    const title =
      data?.title?.replace(/^🍽\s*/, '') ||
      (data?.summary ? data.summary.slice(0, 36) + (data.summary.length > 36 ? '…' : '') : DIET_ADVICE_FEATURE_NAME)
    return {
      title: `${title} · ${DIET_ADVICE_FEATURE_NAME}`,
      path: '/pages/index/index',
      imageUrl: shareImagePath || '',
    }
  })

  useShareTimeline(() => {
    const title = data?.title?.replace(/^🍽\s*/, '') || DIET_ADVICE_FEATURE_NAME
    return {
      title: data?.summary ? `${title}：${data.summary.slice(0, 40)}…` : title,
      imageUrl: shareImagePath || '',
    }
  })

  const handleSaveLongImage = async () => {
    if (!data || savingImage) return
    setSavingImage(true)
    try {
      await saveDietAdviceLongImage(data)
    } finally {
      setSavingImage(false)
    }
  }

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
    } else if (DIET_ADVICE_USE_MOCK_DETAIL) {
      const mock = buildDietAdviceDetailMock()
      setData(mock)
      Taro.setNavigationBarTitle({ title: mock.title || DIET_ADVICE_FEATURE_NAME })
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
    <View className='diet-page-root'>
      <ScrollView className='diet-page' scrollY enhanced showScrollbar={false}>
      <View className='diet-page-hero'>
        <Text className='diet-page-hero-title'>{pageTitle}</Text>
      </View>

      <View className='diet-page-inner'>
        {data.summary ? (
          <View className='diet-monitor-card'>
            <View className='diet-monitor-card__head'>
              <View className='diet-monitor-card__icon-wrap'>
                <Text className='diet-monitor-card__icon'>💓</Text>
              </View>
              <Text className='diet-monitor-card__title'>健康监测</Text>
            </View>
            <Text className='diet-monitor-card__body'>{data.summary}</Text>
            {wx?.temperatureC != null ? (
              <View className='diet-monitor-card__foot'>
                <Text className='diet-monitor-card__weather'>
                  当地约 {wx.temperatureC}°C{wx.weatherText ? ` · ${wx.weatherText}` : ''}
                </Text>
              </View>
            ) : null}
            {wx?.climateKind === 'rainy' || wx?.weatherText?.includes('雨') ? (
              <View className='diet-monitor-card__decor'>
                <View className='diet-monitor-card__cloud'>
                  <View className='diet-monitor-card__cloud-bubble diet-monitor-card__cloud-bubble--1' />
                  <View className='diet-monitor-card__cloud-bubble diet-monitor-card__cloud-bubble--2' />
                  <View className='diet-monitor-card__cloud-bubble diet-monitor-card__cloud-bubble--3' />
                </View>
                <View className='diet-monitor-card__drops'>
                  <View className='diet-monitor-card__drop' />
                  <View className='diet-monitor-card__drop diet-monitor-card__drop--2' />
                  <View className='diet-monitor-card__drop diet-monitor-card__drop--3' />
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {data.card?.pillars && data.card.pillars.length > 0 && (
          <View className='diet-pillars-card'>
            <View className='diet-pillars-card__head'>
              <View className='diet-pillars-card__badge'>
                <Image className='diet-pillars-card__badge-icon' src={iconTipsLightbulb} mode='aspectFit' />
              </View>
              <Text className='diet-pillars-card__title'>今日要点</Text>
            </View>
            <View className='diet-pillars-card__list'>
              {data.card.pillars.map((p, index) => {
                const desc = formatPillarDesc(p.text)
                return (
                  <View
                    key={p.key}
                    className={`diet-pillar-row${index > 0 ? ' diet-pillar-row--border' : ''}`}
                  >
                    <View className='diet-pillar-row__copy'>
                      <Text className='diet-pillar-row__title'>{p.title}</Text>
                      {desc ? <Text className='diet-pillar-row__desc'>{desc}</Text> : null}
                    </View>
                  </View>
                )
              })}
            </View>
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
            <View className='diet-card-badge good'>
              <Image className='diet-card-badge-img' src={iconRecommendCheck} mode='aspectFit' />
            </View>
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
              <View className='diet-card-badge warn'>
                <Image className='diet-card-badge-img' src={iconAvoidWarn} mode='aspectFit' />
              </View>
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

        <View className='diet-disclaimer-wrap'>
          <Text className='diet-disclaimer'>{data.disclaimer}</Text>
        </View>
        <View className='diet-page-bottom-spacer' />
      </View>
      </ScrollView>

      <View className='diet-share-bar'>
        <Button className='diet-share-bar__btn diet-share-bar__btn--primary' openType='share'>
          分享给好友
        </Button>
        <View
          className={`diet-share-bar__btn diet-share-bar__btn--secondary${savingImage ? ' diet-share-bar__btn--disabled' : ''}`}
          onClick={savingImage ? undefined : handleSaveLongImage}
        >
          <Text>{savingImage ? '保存中…' : '保存长图'}</Text>
        </View>
      </View>
      <Text className='diet-share-bar-hint'>朋友圈：点右上角 ··· 分享</Text>

      <Canvas
        canvasId={DIET_ADVICE_CANVAS_ID}
        style={{
          width: `${DIET_ADVICE_CANVAS_W}px`,
          height: `${canvasHeight}px`,
          position: 'fixed',
          left: '-2000px',
          top: '0',
        }}
      />
    </View>
  )
}
