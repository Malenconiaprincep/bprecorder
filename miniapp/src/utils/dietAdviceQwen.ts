import type { DietAdviceRecentSummary, DietWeatherContext } from '../types/dietAdvice'
import type { DietAdviceLatestInput } from './dietAdvice'
import { normalizeDietAdviceCard } from './dietAdviceCardFallback'
import { callQwenChat, fetchDashScopeApiKey, stripJsonFences } from './qwenDirect'

function formatWeatherForPrompt(ctx: DietWeatherContext): string {
  const lines = [
    `用户所在城市（${ctx.source === 'gps' ? 'GPS 定位' : ctx.source === 'ip' ? 'IP 估算' : '默认'}）：${ctx.city}${ctx.region ? ` · ${ctx.region}` : ''}`,
    `当地气候标签：${ctx.climateLabel}`,
    ctx.temperatureC != null ? `当前气温约 ${ctx.temperatureC}°C` : '',
    ctx.weatherText ? `天气现象：${ctx.weatherText}` : '',
    `气候饮食提示：${ctx.climateTip}`,
  ].filter(Boolean)
  return lines.join('\n')
}

function trendLabel(trend: DietAdviceRecentSummary['trend']): string {
  if (trend === 'rising') return '略有上升'
  if (trend === 'falling') return '略有下降'
  if (trend === 'stable') return '较稳定'
  return '数据不足'
}

function buildFullDietAdvicePrompt(
  latest: DietAdviceLatestInput,
  recentSummary: DietAdviceRecentSummary,
  weatherCtx: DietWeatherContext
): string {
  const weatherBlock = formatWeatherForPrompt(weatherCtx)
  return `你是一位擅长高血压饮食管理与营养指导的助手。根据用户血压、近7天记录与天气，一次性生成「血压健康建议 + 今日食谱」（面向中国家庭）。

## 所在地天气（${weatherCtx.source === 'gps' ? 'GPS' : 'IP 估算'}）
${weatherBlock}

## 本次测量
收缩压 ${latest.systolic} mmHg，舒张压 ${latest.diastolic} mmHg，心率 ${latest.pulse} bpm
${latest.note ? `备注：${latest.note}` : ''}

## 近 ${recentSummary.days} 天（共 ${recentSummary.recordCount} 次）
平均 ${recentSummary.avgSystolic}/${recentSummary.avgDiastolic} mmHg；正常 ${recentSummary.normalCount} 次，偏高 ${recentSummary.elevatedCount} 次，高血压档 ${recentSummary.hypertensionCount} 次，偏低 ${recentSummary.lowCount} 次；趋势：${trendLabel(recentSummary.trend)}

## 要求
1. **血压优先**：summary 与 card 必须反映本次血压；≥140/90 或舒张压≥100 禁止只写天气舒适；舒张压≥100 须提示就医复查。
2. card：badgeLabel、badgeTone（severe|attention|ok|low|hot|rainy|cold|mild）、tipEmoji、pillars 3 条（text 用 \\n）、tags 4 条。
3. 食谱须与健康建议一致：recommendations 3 道菜；avoidTips 2-3 条；fullPlan 早/午/晚 + snacks + tips。
4. 只返回 JSON，不要 markdown。

{
  "title": "今日生活饮食建议",
  "summary": "...",
  "saltReminder": "...",
  "card": { "badgeLabel": "...", "badgeTone": "severe", "tipEmoji": "❤️", "pillars": [...], "tags": [...] },
  "recommendations": ["菜1", "菜2", "菜3"],
  "avoidTips": ["...", "..."],
  "fullPlan": { "breakfast": "...", "lunch": "...", "dinner": "...", "snacks": "...", "tips": ["..."] },
  "disclaimer": "以上建议仅供参考，不能替代医生诊断与用药指导。"
}`
}

/** 直连 Qwen：一次生成健康建议 + 食谱 */
export async function generateFullDietAdviceDirect(
  latest: DietAdviceLatestInput,
  recentSummary: DietAdviceRecentSummary,
  weatherCtx: DietWeatherContext
) {
  const apiKey = await fetchDashScopeApiKey()
  const prompt = buildFullDietAdvicePrompt(latest, recentSummary, weatherCtx)
  const text = await callQwenChat(apiKey, prompt, { maxTokens: 2000 })
  const parsed = JSON.parse(stripJsonFences(text)) as {
    title?: string
    summary?: string
    saltReminder?: string
    card?: unknown
    recommendations?: string[]
    avoidTips?: string[]
    fullPlan?: {
      breakfast: string
      lunch: string
      dinner: string
      snacks?: string
      tips: string[]
    }
    disclaimer?: string
  }
  if (!parsed.summary || !Array.isArray(parsed.recommendations)) {
    throw new Error('Invalid full diet advice JSON')
  }
  const card = normalizeDietAdviceCard(
    parsed.card,
    latest.systolic,
    latest.diastolic,
    weatherCtx
  )
  return {
    title: parsed.title || '今日生活饮食建议',
    summary: parsed.summary,
    saltReminder: parsed.saltReminder || '今日饮食宜清淡少盐。',
    card,
    recommendations: parsed.recommendations.slice(0, 5),
    avoidTips: Array.isArray(parsed.avoidTips) ? parsed.avoidTips.slice(0, 5) : [],
    fullPlan: parsed.fullPlan || {
      breakfast: '燕麦粥 + 水煮蛋',
      lunch: '清蒸鱼 + 糙米饭',
      dinner: '番茄豆腐汤 + 凉拌木耳',
      tips: ['少放盐', '多喝水'],
    },
    disclaimer:
      parsed.disclaimer || '以上建议仅供参考，不能替代医生诊断与用药指导。',
    recipeReady: true as const,
  }
}
