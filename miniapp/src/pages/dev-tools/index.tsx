import { useState } from 'react'
import { View, Text, Switch } from '@tarojs/components'
import Taro, { useLoad, useDidShow } from '@tarojs/taro'
import {
  isWeappDevelopRuntime,
  getDevDietAdviceAlwaysPrompt,
  setDevDietAdviceAlwaysPrompt,
  getDevDietAdvicePreviewEntry,
  setDevDietAdvicePreviewEntry,
  getDevSkipDietAdviceRewardAd,
  setDevSkipDietAdviceRewardAd,
  clearDietAdvicePromptDayFlags,
} from '../../utils/dietAdvicePromptPolicy'
import { buildDietAdviceDetailMock } from '../../utils/dietAdviceDetailMock'
import {
  DIET_WEATHER_TEMPLATE_CATALOG,
  fetchDietWeatherTemplatePreview,
} from '../../utils/dietWeatherTemplates'
import {
  DIET_ADVICE_DETAIL_STORAGE_KEY,
  DIET_ADVICE_GEN_PARAMS_KEY,
  DIET_ADVICE_FEATURE_NAME,
} from '../../types/dietAdvice'
import type { DietAdviceData } from '../../types/dietAdvice'
import { getUserInfo } from '../../lib/auth'
import { triggerDevTestReminderSend } from '../../lib/reminders'
import './index.scss'

export default function DevToolsPage() {
  const [devDietAlwaysPrompt, setDevDietAlwaysPromptState] = useState(false)
  const [devPreviewEntry, setDevPreviewEntryState] = useState(false)
  const [devSkipRewardAd, setDevSkipRewardAdState] = useState(true)

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
    setDevSkipRewardAdState(getDevSkipDietAdviceRewardAd())
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

  const onDevSkipRewardAdChange = (e: { detail: { value: boolean } }) => {
    const on = !!e.detail.value
    setDevSkipDietAdviceRewardAd(on)
    setDevSkipRewardAdState(on)
    Taro.showToast({
      title: on ? '已开启：跳过激励视频' : '已关闭：进入详情需看广告',
      icon: 'none',
      duration: 2500,
    })
  }

  const onOpenDietDetailForLongImage = () => {
    const mock = buildDietAdviceDetailMock()
    Taro.setStorageSync(DIET_ADVICE_DETAIL_STORAGE_KEY, mock)
    Taro.removeStorageSync(DIET_ADVICE_GEN_PARAMS_KEY)
    Taro.navigateTo({ url: '/pages/diet-advice/index' })
  }

  const onClearDietPromptFlags = () => {
    clearDietAdvicePromptDayFlags()
    Taro.showToast({ title: '已清除今日弹窗记录', icon: 'none' })
  }

  const onDevTestReminderSend = async () => {
    const user = getUserInfo()
    if (!user?.openid) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    Taro.showLoading({ title: '发送中...' })
    try {
      const result = await triggerDevTestReminderSend(user.openid)
      Taro.showToast({
        title: result.message,
        icon: result.ok ? 'success' : 'none',
        duration: 3000,
      })
    } finally {
      Taro.hideLoading()
    }
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
            <Text className='dev-tools-label'>保存后忽略每日限次</Text>
            <Text className='dev-tools-hint'>
              开启后每次偏高保存都会出引导卡，忽略「每天一次」；正常血压仍不弹
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

        <View className='dev-tools-row'>
          <View className='dev-tools-label-wrap'>
            <Text className='dev-tools-label'>跳过食谱激励视频</Text>
            <Text className='dev-tools-hint'>
              开启后点「生成 AI 食谱」直接进入详情，不播广告
            </Text>
          </View>
          <Switch
            checked={devSkipRewardAd}
            color='#38bdf8'
            onChange={onDevSkipRewardAdChange}
          />
        </View>

        <View className='dev-tools-action' onClick={onOpenDietDetailForLongImage}>
          <Text className='dev-tools-action-text'>打开详情页 · 测保存长图</Text>
        </View>

        <View className='dev-tools-reset' onClick={onClearDietPromptFlags}>
          <Text className='dev-tools-reset-text'>清除今日「已弹/已跳过」记录</Text>
        </View>

        <Text className='dev-tools-subtitle'>测量提醒（开发测试）</Text>
        <Text className='dev-tools-hint dev-tools-hint-block'>
          忽略「今日已测」和提醒时间，有订阅额度即发送。需 Vercel 配置 REMINDER_DEV_MODE=1
        </Text>
        <View className='dev-tools-action dev-tools-action--reminder' onClick={onDevTestReminderSend}>
          <Text className='dev-tools-action-text'>立即测试发送提醒</Text>
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
