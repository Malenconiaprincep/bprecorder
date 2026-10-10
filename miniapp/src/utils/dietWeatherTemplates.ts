import type { DietClimateKind, DietWeatherContext } from '../types/dietAdvice'
import { API_BASE_URL } from './api'
import Taro from '@tarojs/taro'
import { IS_MINIAPP_DEV_BUILD } from './dietAdvicePromptPolicy'

/** 与后端 dietWeatherContext 一致的气候卡片模版 */
export const DIET_WEATHER_TEMPLATE_CATALOG: {
  kind: DietClimateKind
  label: string
}[] = [
  { kind: 'pleasant', label: '气候舒适' },
  { kind: 'hot', label: '天气炎热' },
  { kind: 'rainy', label: '阴雨潮湿' },
  { kind: 'cold', label: '气温偏低' },
]

/** 开发预览：拉取指定模版（GET /api/diet-advice/context?preview=hot） */
export async function fetchDietWeatherTemplatePreview(
  kind: DietClimateKind
): Promise<DietWeatherContext | null> {
  if (!IS_MINIAPP_DEV_BUILD) return null
  try {
    const res = await Taro.request({
      url: `${API_BASE_URL}/api/diet-advice/context`,
      method: 'GET',
      data: { preview: kind },
      timeout: 12000,
    })
    if (res.statusCode >= 200 && res.statusCode < 300 && res.data?.context) {
      return res.data.context as DietWeatherContext
    }
  } catch (e) {
    console.warn('[diet-advice] template preview failed', e)
  }
  return null
}
