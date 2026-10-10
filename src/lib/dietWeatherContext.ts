import type { NextRequest } from 'next/server'

export type DietClimateKind = 'hot' | 'cold' | 'rainy' | 'pleasant' | 'unknown'

export type DietWeatherPillar = {
  key: 'hydration' | 'lightDiet' | 'climateCare'
  title: string
  text: string
  icon: 'water' | 'salad' | 'apple' | 'sunHat' | 'rain' | 'salt'
}

export type DietWeatherContext = {
  city: string
  region?: string
  climateKind: DietClimateKind
  climateLabel: string
  climateTip: string
  temperatureC?: number
  weatherText?: string
  pillars: DietWeatherPillar[]
  tags: string[]
  source: 'gps' | 'ip' | 'fallback'
}

export type DietAdviceCoords = {
  latitude: number
  longitude: number
}

function isValidCoords(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180 &&
    !(lat === 0 && lon === 0)
  )
}

/** 从请求头解析客户端 IP（部署在反向代理后需配置 X-Forwarded-For） */
export function getClientIpFromRequest(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first && first !== 'unknown') return first
  }
  const realIp = req.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  const cf = req.headers.get('cf-connecting-ip')?.trim()
  if (cf) return cf
  return null
}

type IpGeo = {
  city?: string
  regionName?: string
  lat?: number
  lon?: number
}

async function resolveCityByCoords(lat: number, lon: number): Promise<IpGeo | null> {
  try {
    const url =
      `https://api.bigdatacloud.net/data/reverse-geocode-client` +
      `?latitude=${lat}&longitude=${lon}&localityLanguage=zh`
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    const data = (await res.json()) as {
      city?: string
      locality?: string
      principalSubdivision?: string
    }
    const city = data.city || data.locality
    if (!city) return null
    return {
      city,
      regionName: data.principalSubdivision,
      lat,
      lon,
    }
  } catch (e) {
    console.warn('[diet-weather] reverse-geocode failed', e)
    return null
  }
}

async function resolveGeoByIp(ip: string): Promise<IpGeo | null> {
  if (!ip || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return null
  }
  try {
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN&fields=status,city,regionName,lat,lon`
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    const data = (await res.json()) as {
      status?: string
      city?: string
      regionName?: string
      lat?: number
      lon?: number
    }
    if (data.status !== 'success') return null
    return {
      city: data.city,
      regionName: data.regionName,
      lat: data.lat,
      lon: data.lon,
    }
  } catch (e) {
    console.warn('[diet-weather] ip-api failed', e)
    return null
  }
}

async function fetchCurrentWeather(lat: number, lon: number): Promise<{
  temperatureC?: number
  weatherCode?: number
  text?: string
} | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,weather_code&timezone=Asia%2FShanghai`
    const res = await fetch(url, { next: { revalidate: 1800 } })
    if (!res.ok) return null
    const data = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number }
    }
    const temp = data.current?.temperature_2m
    const code = data.current?.weather_code
    return {
      temperatureC: typeof temp === 'number' ? Math.round(temp) : undefined,
      weatherCode: code,
      text: weatherCodeToText(code),
    }
  } catch (e) {
    console.warn('[diet-weather] open-meteo failed', e)
    return null
  }
}

function weatherCodeToText(code?: number): string | undefined {
  if (code == null) return undefined
  if (code === 0) return '晴'
  if (code <= 3) return '多云'
  if (code >= 51 && code <= 67) return '雨'
  if (code >= 71 && code <= 77) return '雪'
  if (code >= 80 && code <= 82) return '阵雨'
  if (code >= 95) return '雷雨'
  return undefined
}

function inferClimateKind(temp?: number, code?: number): DietClimateKind {
  if (code != null && code >= 51 && code <= 82) return 'rainy'
  if (code != null && code >= 71 && code <= 77) return 'cold'
  if (typeof temp === 'number') {
    if (temp >= 30) return 'hot'
    if (temp <= 8) return 'cold'
  }
  if (typeof temp === 'number' && temp >= 22) return 'pleasant'
  return 'unknown'
}

/** 卡片天气模版目录（供文档与开发预览） */
export const DIET_WEATHER_TEMPLATE_CATALOG: {
  kind: DietClimateKind
  label: string
  badgeClass: 'hot' | 'rain' | 'cold' | 'mild'
  trigger: string
}[] = [
  {
    kind: 'pleasant',
    label: '气候舒适',
    badgeClass: 'mild',
    trigger: '气温 22–29°C，或非雨非雪非酷暑',
  },
  {
    kind: 'hot',
    label: '天气炎热',
    badgeClass: 'hot',
    trigger: '气温 ≥ 30°C',
  },
  {
    kind: 'rainy',
    label: '阴雨潮湿',
    badgeClass: 'rain',
    trigger: '天气码 51–82（雨/阵雨等）',
  },
  {
    kind: 'cold',
    label: '气温偏低',
    badgeClass: 'cold',
    trigger: '气温 ≤ 8°C，或天气码 71–77（雪）',
  },
]

const PREVIEW_SAMPLE: Record<
  Exclude<DietClimateKind, 'unknown'>,
  { temp: number; weatherText?: string }
> = {
  pleasant: { temp: 24, weatherText: '多云' },
  hot: { temp: 32, weatherText: '晴' },
  rainy: { temp: 18, weatherText: '雨' },
  cold: { temp: 5, weatherText: '雪' },
}

/** 开发预览：返回指定气候模版的静态上下文（不请求真实天气） */
export function getDietWeatherTemplatePreview(
  kind: DietClimateKind,
  city = '预览城市'
): DietWeatherContext {
  const resolved =
    kind === 'unknown' || kind === 'pleasant'
      ? 'pleasant'
      : kind === 'hot' || kind === 'rainy' || kind === 'cold'
        ? kind
        : 'pleasant'
  const sample = PREVIEW_SAMPLE[resolved]
  const template = buildTemplate(resolved, city, sample.temp, sample.weatherText)
  return {
    city,
    region: '演示',
    temperatureC: sample.temp,
    weatherText: sample.weatherText,
    source: 'fallback',
    ...template,
  }
}

function buildTemplate(
  kind: DietClimateKind,
  city: string,
  temp?: number,
  weatherText?: string
): Omit<DietWeatherContext, 'city' | 'region' | 'temperatureC' | 'weatherText' | 'source'> {
  const tempPart = typeof temp === 'number' ? `约 ${temp}°C` : ''
  const wx = weatherText ? `，${weatherText}` : ''

  if (kind === 'hot') {
    return {
      climateKind: 'hot',
      climateLabel: '天气炎热',
      climateTip: `检测到您所在${city}今日气温较高${tempPart}${wx}，建议及时补充水分，饮食清淡，避免过度出汗。`,
      pillars: [
        { key: 'hydration', title: '补水提醒', text: '今日饮水\n建议 6-8 杯', icon: 'water' },
        { key: 'lightDiet', title: '清淡饮食', text: '多吃瓜果蔬菜\n补充维生素', icon: 'apple' },
        { key: 'climateCare', title: '防暑建议', text: '避免暴晒\n适当休息', icon: 'sunHat' },
      ],
      tags: ['控盐低钠 平稳血压', '营养均衡 健康美味', '规律生活 长期管理', '科学搭配 安心放心'],
    }
  }

  if (kind === 'rainy') {
    return {
      climateKind: 'rainy',
      climateLabel: '阴雨潮湿',
      climateTip: `${city}今日有雨${tempPart}${wx}，注意保暖祛湿，少油腻，适量温热饮品。`,
      pillars: [
        { key: 'hydration', title: '温热饮品', text: '温水或淡茶\n少量多次', icon: 'water' },
        { key: 'lightDiet', title: '祛湿饮食', text: '山药薏米粥\n少生冷', icon: 'salad' },
        { key: 'climateCare', title: '出行注意', text: '防雨保暖\n避免受凉', icon: 'rain' },
      ],
      tags: ['控盐低钠 平稳血压', '温热易消化', '规律作息', '少油炸重口'],
    }
  }

  if (kind === 'cold') {
    return {
      climateKind: 'cold',
      climateLabel: '气温偏低',
      climateTip: `${city}今日偏冷${tempPart}${wx}，可适当增加优质蛋白与温热食物，血压偏低者勿过度限盐。`,
      pillars: [
        { key: 'hydration', title: '适量补水', text: '温开水为主\n避免冰饮', icon: 'water' },
        { key: 'lightDiet', title: '温热主食', text: '粥面薯类\n易消化', icon: 'salad' },
        { key: 'climateCare', title: '保暖建议', text: '早晚添衣\n避免受凉', icon: 'sunHat' },
      ],
      tags: ['均衡营养', '温热烹调', '规律测压', '少生冷刺激'],
    }
  }

  return {
    climateKind: 'pleasant',
    climateLabel: '气候舒适',
    climateTip: `${city}今日天气较舒适${tempPart}${wx}，保持均衡饮食与规律测压即可。`,
    pillars: [
      { key: 'hydration', title: '补水提醒', text: '每日 6-8 杯\n白开水', icon: 'water' },
      { key: 'lightDiet', title: '均衡饮食', text: '蔬果粗粮\n搭配优质蛋白', icon: 'salad' },
      { key: 'climateCare', title: '少盐提醒', text: '控盐 5g 内\n少咸菜酱油', icon: 'salt' },
    ],
    tags: ['控盐低钠 平稳血压', '营养均衡', '规律生活', '长期管理'],
  }
}

async function buildWeatherContextFromGeo(
  geo: IpGeo | null,
  source: DietWeatherContext['source']
): Promise<DietWeatherContext> {
  const city = geo?.city || process.env.DIET_ADVICE_DEFAULT_CITY || '本地'
  const region = geo?.regionName

  let temp: number | undefined
  let weatherText: string | undefined
  let kind: DietClimateKind = 'pleasant'

  if (geo?.lat != null && geo?.lon != null) {
    const wx = await fetchCurrentWeather(geo.lat, geo.lon)
    temp = wx?.temperatureC
    weatherText = wx?.text
    kind = inferClimateKind(temp, wx?.weatherCode)
  }

  const template = buildTemplate(kind, city, temp, weatherText)

  return {
    city,
    region,
    temperatureC: temp,
    weatherText,
    source,
    ...template,
  }
}

/** 根据 GPS 坐标解析城市与天气 */
export async function resolveDietWeatherContextByCoords(
  latitude: number,
  longitude: number
): Promise<DietWeatherContext> {
  if (!isValidCoords(latitude, longitude)) {
    throw new Error('Invalid coordinates')
  }
  const geo = await resolveCityByCoords(latitude, longitude)
  return buildWeatherContextFromGeo(
    geo || { city: '当前位置', lat: latitude, lon: longitude },
    'gps'
  )
}

/** 根据请求 IP 解析城市与天气；若提供 GPS 则优先使用坐标 */
export async function resolveDietWeatherContext(
  req: NextRequest,
  coords?: DietAdviceCoords | null
): Promise<DietWeatherContext> {
  if (coords && isValidCoords(coords.latitude, coords.longitude)) {
    try {
      return await resolveDietWeatherContextByCoords(coords.latitude, coords.longitude)
    } catch (e) {
      console.warn('[diet-weather] GPS context failed, fallback to IP', e)
    }
  }

  const ip = getClientIpFromRequest(req)
  const geo = ip ? await resolveGeoByIp(ip) : null
  return buildWeatherContextFromGeo(geo, geo ? 'ip' : 'fallback')
}

/** 供 AI Prompt 使用的天气段落 */
export function formatWeatherForAiPrompt(ctx: DietWeatherContext): string {
  const lines = [
    `用户所在城市（${ctx.source === 'gps' ? 'GPS 定位' : ctx.source === 'ip' ? 'IP 估算' : '默认'}）：${ctx.city}${ctx.region ? ` · ${ctx.region}` : ''}`,
    `当地气候标签：${ctx.climateLabel}`,
    ctx.temperatureC != null ? `当前气温约 ${ctx.temperatureC}°C` : '',
    ctx.weatherText ? `天气现象：${ctx.weatherText}` : '',
    `气候饮食提示：${ctx.climateTip}`,
  ].filter(Boolean)
  return lines.join('\n')
}
