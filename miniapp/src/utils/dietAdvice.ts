import Taro from '@tarojs/taro'
import { API_BASE_URL } from './api'
import { getBPStatus } from './bpStatus'
import type {
  DietAdviceData,
  DietAdviceRecentSummary,
  DietWeatherContext,
} from '../types/dietAdvice'
import type { DietAdviceGps } from './dietAdviceLocation'
import { buildFallbackDietAdviceCard } from './dietAdviceCardFallback'
import { generateFullDietAdviceDirect } from './dietAdviceQwen'

export interface DietAdviceLatestInput {
  systolic: number
  diastolic: number
  pulse: number
  note?: string
  recordedAt?: string
}

function fallbackAdvice(
  latest: DietAdviceLatestInput,
  summary: DietAdviceRecentSummary,
  weather?: DietWeatherContext
): DietAdviceData {
  const st = getBPStatus(latest.systolic, latest.diastolic)
  const isHigh =
    st.color === 'prehigh' || st.color === 'high-1' || st.color === 'high-2' || st.color === 'high-3'
  const isLow = st.color === 'low'
  const isSevere = st.color === 'high-3'

  let summaryText = '本次血压在理想范围，继续保持均衡饮食即可。'
  let saltReminder = '今日可维持日常用盐量，优先新鲜食材。'
  let recommendations = ['杂粮饭', '清蒸鱼', '凉拌黄瓜']
  let avoidTips = ['少喝含糖饮料', '避免宵夜过饱']

  if (isHigh) {
    summaryText = isSevere
      ? `本次血压 ${latest.systolic}/${latest.diastolic} mmHg 明显偏高，请尽快就医复查；今日务必清淡少盐、避免熬夜与剧烈活动。`
      : summary.trend === 'rising'
        ? `本次血压 ${latest.systolic}/${latest.diastolic} mmHg 偏高，且近几天有上升趋势，建议今天饮食再清淡一些。`
        : `本次血压 ${latest.systolic}/${latest.diastolic} mmHg 偏高，建议今天减少高盐和油炸食物。`
    saltReminder = '今日烹饪少放酱油、咸菜，可用葱姜蒜和醋调味。'
    recommendations = ['番茄豆腐汤', '清炒西兰花', '玉米燕麦粥']
    avoidTips = ['咸菜、腊肉、酱菜', '油炸食品、肥肉', '浓汤宝、外卖重口味']
  } else if (isLow) {
    summaryText = '本次血压偏低，注意适量进食、避免空腹过久，不必过度限盐。'
    saltReminder = '可适量增加优质蛋白，避免空腹或过度节食。'
    recommendations = ['瘦肉粥', '蒸蛋羹', '温热的牛奶燕麦']
    avoidTips = ['空腹浓茶咖啡', '单一节食', '大量饮酒']
  }

  return {
    title: '今日生活饮食建议',
    summary: summaryText,
    card: buildFallbackDietAdviceCard(latest.systolic, latest.diastolic, weather),
    saltReminder,
    recommendations,
    avoidTips,
    fullPlan: {
      breakfast: isHigh ? '燕麦粥 + 水煮蛋 + 小份水果' : '全麦面包 + 牛奶 + 坚果少量',
      lunch: isHigh ? '清蒸鲈鱼 + 糙米饭 + 蒜蓉西兰花' : '鸡胸肉沙拉 + 杂粮饭',
      dinner: isHigh ? '番茄豆腐汤 + 凉拌木耳 + 少量主食' : '蔬菜汤 + 清蒸虾 + 杂粮饭',
      snacks: isHigh ? '苹果或酸奶（无糖）' : '适量坚果',
      tips: isHigh
        ? ['每日食盐不超过 5g', '晚餐七分饱', '多喝水']
        : ['规律三餐', '多吃蔬菜水果', '少熬夜'],
    },
    disclaimer: '以上建议仅供参考，不能替代医生诊断与用药指导。',
    recipeReady: true,
  }
}

const DEFAULT_WEATHER_CONTEXT: DietWeatherContext = {
  city: '本地',
  climateKind: 'pleasant',
  climateLabel: '健康建议',
  climateTip: '结合您的血压记录，为您生成今日饮食与生活方式建议。',
  pillars: [
    { key: 'hydration', title: '补水提醒', text: '每日 6-8 杯\n白开水', icon: 'water' },
    { key: 'lightDiet', title: '清淡饮食', text: '少盐少油\n多吃蔬果', icon: 'salad' },
    { key: 'climateCare', title: '少盐提醒', text: '控盐 5g 内\n少咸菜', icon: 'salt' },
  ],
  tags: ['控盐低钠 平稳血压', '营养均衡', '规律生活', '长期管理'],
  source: 'fallback',
}

/** 仅拉取天气（服务端 IP/GPS），不调用大模型 */
export async function fetchDietAdviceContext(
  location?: DietAdviceGps | null
): Promise<DietWeatherContext> {
  try {
    const res = await Taro.request({
      url: `${API_BASE_URL}/api/diet-advice/context`,
      method: 'GET',
      data:
        location != null
          ? { latitude: location.latitude, longitude: location.longitude }
          : undefined,
      timeout: 12000,
    })
    if (res.statusCode >= 200 && res.statusCode < 300 && res.data?.context) {
      return res.data.context as DietWeatherContext
    }
  } catch (e) {
    console.warn('[diet-advice] context fetch failed', e)
  }
  return DEFAULT_WEATHER_CONTEXT
}

/** 一次 Qwen 调用：健康建议 + 食谱 */
export async function fetchFullDietAdvice(
  latest: DietAdviceLatestInput,
  recentSummary: DietAdviceRecentSummary,
  location?: DietAdviceGps | null
): Promise<DietAdviceData> {
  let weather: DietWeatherContext | undefined
  try {
    weather = await fetchDietAdviceContext(location)
    const raw = await generateFullDietAdviceDirect(latest, recentSummary, weather)
    return { ...raw, weather, recipeReady: true }
  } catch (e) {
    console.error('[diet-advice] full Qwen direct failed:', e)
    return { ...fallbackAdvice(latest, recentSummary, weather), weather }
  }
}
