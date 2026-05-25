import { useState } from 'react'
import { View, Text, Switch } from '@tarojs/components'
import Taro, { useLoad, useDidShow } from '@tarojs/taro'
import {
  isWeappDevelopRuntime,
  getDevDietAdviceAlwaysPrompt,
  setDevDietAdviceAlwaysPrompt,
  getDevDietAdvicePreviewEntry,
  setDevDietAdvicePreviewEntry,
  clearDietAdvicePromptDayFlags,
} from '../../utils/dietAdvicePromptPolicy'
import {
  DIET_WEATHER_TEMPLATE_CATALOG,
  fetchDietWeatherTemplatePreview,
} from '../../utils/dietWeatherTemplates'
import { DIET_ADVICE_DETAIL_STORAGE_KEY, DIET_ADVICE_FEATURE_NAME } from '../../types/dietAdvice'
import type { DietAdviceData } from '../../types/dietAdvice'
import './index.scss'

export default function DevToolsPage() {
  const [devDietAlwaysPrompt, setDevDietAlwaysPromptState] = useState(false)
  const [devPreviewEntry, setDevPreviewEntryState] = useState(false)

  useLoad(() => {
    if (!isWeappDevelopRuntime()) {
      Taro.showToast({ title: '仅开发环境可用', icon: 'none' })
      setTimeout(() => Taro.navigateBack(), 800)
    }
  })

  useDidShow(() => {
    if (!isWeappDevelopRuntime()) return
    setDevDietAlwaysPromptState(getDevDietAdviceAlwaysPrompt())
    setDevPreviewEntryState(getDevDietAdvicePreviewEntry())
  })

  const onDevDietAlwaysPromptChange = (e: { detail: { value: boolean } }) => {
    const on = !!e.detail.value
    setDevDietAdviceAlwaysPrompt(on)
    setDevDietAlwaysPromptState(on)
    Taro.showToast({
      title: on ? '已开启：每次保存都弹食谱' : '已关闭：走正式弹出规则',
      icon: 'none',
      duration: 2500,
    })
  }

  const onDevPreviewEntryChange = (e: { detail: { value: boolean } }) => {
    const on = !!e.detail.value
    setDevDietAdvicePreviewEntry(on)
    setDevPreviewEntryState(on)
    Taro.showToast({
      title: on ? '已开启：首页预览引导卡' : '已关闭预览引导卡',
      icon: 'none',
      duration: 2500,
    })
    if (on) {
      Taro.switchTab({ url: '/pages/index/index' })
    } else {
      Taro.eventCenter.trigger('dietAdvicePreviewOff')
    }
  }

  const onClearDietPromptFlags = () => {
    clearDietAdvicePromptDayFlags()
    Taro.showToast({ title: '已清除今日弹窗记录', icon: 'none' })
  }

  const onPreviewDietWeatherTemplate = async (
    kind: (typeof DIET_WEATHER_TEMPLATE_CATALOG)[number]['kind']
  ) => {
    const weather = await fetchDietWeatherTemplatePreview(kind)
    if (!weather) {
      Taro.showToast({ title: '预览失败，请确认本地 API 已启动', icon: 'none' })
      return
    }
    const mock: DietAdviceData = {
      title: `今日${DIET_ADVICE_FEATURE_NAME}`,
      summary: weather.climateTip,
      saltReminder: '今日饮食宜清淡少盐。',
      card: {
        badgeLabel: weather.climateLabel,
        badgeTone: weather.climateKind === 'hot' ? 'hot' : 'mild',
        tipEmoji: '☀️',
        pillars: weather.pillars,
        tags: weather.tags,
      },
      recommendations: ['番茄豆腐汤', '清炒西兰花', '玉米燕麦粥'],
      avoidTips: ['少咸菜', '少油炸'],
      fullPlan: {
        breakfast: '燕麦粥 + 水煮蛋',
        lunch: '清蒸鱼 + 糙米饭',
        dinner: '番茄豆腐汤',
        tips: ['多喝水'],
      },
      disclaimer: '预览数据，仅供参考。',
      weather,
      recipeReady: true,
    }
    Taro.setStorageSync(DIET_ADVICE_DETAIL_STORAGE_KEY, mock)
    Taro.navigateTo({ url: '/pages/diet-advice/index' })
  }

  if (!isWeappDevelopRuntime()) {
    return (
      <View className='dev-tools-page'>
        <Text className='dev-tools-desc'>仅开发环境可用</Text>
      </View>
    )
  }

  return (
    <View className='dev-tools-page'>
      <View className='dev-tools-card'>
        <Text className='dev-tools-title'>开发者调试</Text>
        <Text className='dev-tools-desc'>正式版不可见，用于调试生活饮食建议相关能力。</Text>

        <View className='dev-tools-row'>
          <View className='dev-tools-label-wrap'>
            <Text className='dev-tools-label'>保存后始终弹出食谱</Text>
            <Text className='dev-tools-hint'>
              开启后每次保存都会出引导卡，忽略血压与「每天一次」限制
            </Text>
          </View>
          <Switch
            checked={devDietAlwaysPrompt}
            color='#38bdf8'
            onChange={onDevDietAlwaysPromptChange}
          />
        </View>

        <View className='dev-tools-row'>
          <View className='dev-tools-label-wrap'>
            <Text className='dev-tools-label'>首页预览保存后引导卡</Text>
            <Text className='dev-tools-hint'>
              开启后进入首页即弹出引导卡（示例 118/78），无需真实保存
            </Text>
          </View>
          <Switch
            checked={devPreviewEntry}
            color='#38bdf8'
            onChange={onDevPreviewEntryChange}
          />
        </View>

        <View className='dev-tools-reset' onClick={onClearDietPromptFlags}>
          <Text className='dev-tools-reset-text'>清除今日「已弹/已跳过」记录</Text>
        </View>

        <Text className='dev-tools-subtitle'>预览天气卡片模版（4 套）</Text>
        <View className='dev-tools-template-row'>
          {DIET_WEATHER_TEMPLATE_CATALOG.map((t) => (
            <View
              key={t.kind}
              className='dev-tools-template-chip'
              onClick={() => onPreviewDietWeatherTemplate(t.kind)}
            >
              <Text className='dev-tools-template-chip-text'>{t.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}
