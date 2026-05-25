import { getBPStatus } from './bpStatus'
import type {
  DietAdviceBadgeTone,
  DietAdviceCardUi,
  DietWeatherContext,
  DietWeatherPillar,
} from '../types/dietAdvice'

const ICONS = ['water', 'salad', 'salt', 'apple', 'sunHat', 'rain'] as const

function classifyBp(systolic: number, diastolic: number) {
  if (systolic < 90 || diastolic < 60) return { level: 'low' as const, label: '血压偏低' }
  if (systolic >= 160 || diastolic >= 100) return { level: 'severe' as const, label: '血压明显偏高' }
  if (systolic >= 140 || diastolic >= 90) return { level: 'high' as const, label: '血压偏高' }
  if (
    (systolic >= 120 && systolic <= 139) ||
    (diastolic >= 80 && diastolic <= 89)
  ) {
    return { level: 'prehigh' as const, label: '血压略高' }
  }
  if (systolic < 120 && diastolic < 80) return { level: 'ideal' as const, label: '状态良好' }
  return { level: 'prehigh' as const, label: '血压略高' }
}

function normalizeIcon(icon?: string): DietWeatherPillar['icon'] {
  if (icon && (ICONS as readonly string[]).includes(icon)) {
    return icon as DietWeatherPillar['icon']
  }
  return 'water'
}

function normalizePillars(raw: unknown): DietWeatherPillar[] | null {
  if (!Array.isArray(raw) || raw.length < 3) return null
  const pillars = raw.slice(0, 3).map((p, i) => {
    const row = p as { key?: string; title?: string; text?: string; icon?: string }
    const title = String(row.title || '').trim()
    const text = String(row.text || '').trim()
    if (!title || !text) return null
    const key =
      row.key === 'hydration' || row.key === 'lightDiet' || row.key === 'climateCare'
        ? row.key
        : (['hydration', 'lightDiet', 'climateCare'][i] as DietWeatherPillar['key'])
    return {
      key,
      title,
      text: text.replace(/\\n/g, '\n'),
      icon: normalizeIcon(row.icon),
    }
  })
  if (pillars.some((p) => !p)) return null
  return pillars as DietWeatherPillar[]
}

/** 规范化模型返回的 card 字段 */
export function normalizeDietAdviceCard(
  rawCard: unknown,
  systolic: number,
  diastolic: number,
  weather?: DietWeatherContext
): DietAdviceCardUi {
  const fallback = buildFallbackDietAdviceCard(systolic, diastolic, weather)
  const c = rawCard as Partial<DietAdviceCardUi> | undefined
  if (!c) return fallback

  const pillars = normalizePillars(c.pillars)
  const tags = Array.isArray(c.tags)
    ? c.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 5)
    : []

  const badgeLabel = String(c.badgeLabel || '').trim() || fallback.badgeLabel
  const validTones: DietAdviceBadgeTone[] = [
    'severe',
    'attention',
    'ok',
    'low',
    'hot',
    'rainy',
    'cold',
    'mild',
  ]
  const badgeTone = validTones.includes(c.badgeTone as DietAdviceBadgeTone)
    ? (c.badgeTone as DietAdviceBadgeTone)
    : fallback.badgeTone

  const bp = classifyBp(systolic, diastolic)
  const mustBpFirst = bp.level !== 'ideal'
  const looksWeatherOnly =
    /气候舒适|天气较舒适|保持均衡饮食与规律测压即可/.test(badgeLabel) && mustBpFirst

  return {
    badgeLabel: looksWeatherOnly ? fallback.badgeLabel : badgeLabel,
    badgeTone: looksWeatherOnly ? fallback.badgeTone : badgeTone,
    tipEmoji: String(c.tipEmoji || fallback.tipEmoji).trim() || fallback.tipEmoji,
    pillars: pillars || fallback.pillars,
    tags: tags.length >= 2 ? tags : fallback.tags,
  }
}

/** API 失败时客户端兜底卡片（与后端逻辑对齐） */
export function buildFallbackDietAdviceCard(
  systolic: number,
  diastolic: number,
  weather?: DietWeatherContext
): DietAdviceCardUi {
  const st = getBPStatus(systolic, diastolic)
  const isHigh =
    st.color === 'prehigh' || st.color === 'high-1' || st.color === 'high-2' || st.color === 'high-3'
  const isLow = st.color === 'low'
  const isSevere = st.color === 'high-3'

  if (isSevere || st.color === 'high-1' || st.color === 'high-2') {
    return {
      badgeLabel: isSevere ? '血压明显偏高' : '血压偏高',
      badgeTone: 'severe',
      tipEmoji: '❤️',
      pillars: [
        { key: 'hydration', title: '清淡少盐', text: '今日烹饪\n控盐 5g 内', icon: 'salt' },
        { key: 'lightDiet', title: '推荐饮食', text: '蒸煮为主\n少油炸', icon: 'salad' },
        { key: 'climateCare', title: '测压休息', text: '定时复测\n避免劳累', icon: 'water' },
      ],
      tags: ['减盐减钠', '遵医嘱用药', '规律测压', '及时复诊'],
    }
  }

  if (isHigh) {
    return {
      badgeLabel: '血压略高',
      badgeTone: 'attention',
      tipEmoji: '❤️',
      pillars: [
        { key: 'hydration', title: '少盐提醒', text: '少酱油咸菜\n清淡为主', icon: 'salt' },
        { key: 'lightDiet', title: '均衡饮食', text: '蔬菜粗粮\n优质蛋白', icon: 'salad' },
        { key: 'climateCare', title: '规律作息', text: '早睡少熬夜\n适度活动', icon: 'water' },
      ],
      tags: ['控盐低钠', '少油炸', '规律测压', '长期管理'],
    }
  }

  if (isLow) {
    return {
      badgeLabel: '血压偏低',
      badgeTone: 'low',
      tipEmoji: '💧',
      pillars: [
        { key: 'hydration', title: '适量进食', text: '避免空腹\n少量多餐', icon: 'water' },
        { key: 'lightDiet', title: '温热饮食', text: '粥面蛋类\n易消化', icon: 'salad' },
        { key: 'climateCare', title: '休息观察', text: '不适及时\n就医咨询', icon: 'sunHat' },
      ],
      tags: ['营养均衡', '避免节食', '规律测压', '适度运动'],
    }
  }

  if (weather?.climateKind === 'hot' && weather.pillars?.length === 3) {
    return {
      badgeLabel: weather.climateLabel,
      badgeTone: 'hot',
      tipEmoji: '☀️',
      pillars: weather.pillars,
      tags: weather.tags?.slice(0, 4) || ['补充水分', '清淡饮食', '规律测压', '长期管理'],
    }
  }

  return {
    badgeLabel: '状态良好',
    badgeTone: 'ok',
    tipEmoji: '👍',
    pillars: weather?.pillars?.length === 3
      ? weather.pillars
      : [
          { key: 'hydration', title: '补水提醒', text: '每日 6-8 杯\n白开水', icon: 'water' },
          { key: 'lightDiet', title: '均衡饮食', text: '蔬果粗粮\n优质蛋白', icon: 'salad' },
          { key: 'climateCare', title: '规律生活', text: '定时测压\n适度运动', icon: 'salt' },
        ],
    tags: weather?.tags?.slice(0, 4) || ['营养均衡', '规律测压', '适度运动', '长期管理'],
  }
}
