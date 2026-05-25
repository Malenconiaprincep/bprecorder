export type BpTrend = 'rising' | 'stable' | 'falling' | 'unknown'

export type DietClimateKind = 'hot' | 'cold' | 'rainy' | 'pleasant' | 'unknown'

export interface DietWeatherPillar {
  key: 'hydration' | 'lightDiet' | 'climateCare'
  title: string
  text: string
  icon: 'water' | 'salad' | 'apple' | 'sunHat' | 'rain' | 'salt'
}

export interface DietWeatherContext {
  city: string
  region?: string
  climateKind: DietClimateKind
  climateLabel: string
  climateTip: string
  temperatureC?: number
  weatherText?: string
  pillars: DietWeatherPillar[]
  tags: string[]
  source?: 'gps' | 'ip' | 'fallback'
}

export interface DietAdviceRecentSummary {
  days: number
  recordCount: number
  avgSystolic: number
  avgDiastolic: number
  normalCount: number
  elevatedCount: number
  hypertensionCount: number
  lowCount: number
  trend: BpTrend
}

export interface DietAdviceFullPlan {
  breakfast: string
  lunch: string
  dinner: string
  snacks?: string
  tips: string[]
}

export type DietAdviceBadgeTone =
  | 'severe'
  | 'attention'
  | 'ok'
  | 'low'
  | 'hot'
  | 'rainy'
  | 'cold'
  | 'mild'

/** AI 生成的卡片展示（顶标、三列、标签） */
export interface DietAdviceCardUi {
  badgeLabel: string
  badgeTone: DietAdviceBadgeTone
  tipEmoji: string
  pillars: DietWeatherPillar[]
  tags: string[]
}

export interface DietAdviceData {
  title: string
  summary: string
  saltReminder: string
  recommendations: string[]
  avoidTips: string[]
  fullPlan: DietAdviceFullPlan
  disclaimer: string
  /** AI 生成的卡片 UI */
  card?: DietAdviceCardUi
  /** 城市天气元数据 */
  weather?: DietWeatherContext
  /** 是否已包含完整食谱 */
  recipeReady?: boolean
}

/** 功能对外名称（入口弹层、导航栏、默认标题） */
export const DIET_ADVICE_FEATURE_NAME = '生活饮食建议'

export const DIET_ADVICE_DETAIL_STORAGE_KEY = 'diet_advice_detail'

/** 跳转详情页生成建议时的参数（看完广告后写入） */
export const DIET_ADVICE_GEN_PARAMS_KEY = 'diet_advice_gen_params'

export type DietAdviceGenParams = {
  userId: string
  latest: {
    systolic: number
    diastolic: number
    pulse: number
    note?: string
    recordedAt?: string
  }
}
