import { useState, useMemo, useEffect, useRef } from 'react'
import { View, Text, Image, Picker } from '@tarojs/components'
import Taro, { useLoad, useDidShow } from '@tarojs/taro'
import { getRecords, BPRecord } from '../../lib/supabase'
import { consumeAnalysisNeedRefresh } from '../../store/analysisRefresh'
import { getUserInfo } from '../../lib/auth'
import { FontSizeMode, getCurrentFontSizeMode, getFontSizeModeClass } from '../../lib/settings'
import './index.scss'
// @ts-ignore
import iconChart from '../../assets/icons/chart.png'
import { USE_TEST_DATA, getTestData } from '../../utils/testData'
import {
  DONUT_CATEGORIES,
  buildDonutConicGradient,
  countDonutCategories,
  type AnalysisDonutCategory
} from '../../utils/analysisClassification'

/** 本地日历日 YYYY-MM-DD */
const formatDateKey = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const recordLocalDateKey = (iso: string) => {
  const d = new Date(iso)
  return formatDateKey(d)
}

/** 自定义区间：生成包含端点的 YYYY-MM-DD 列表（本地日历日） */
function enumerateDateKeys(startStr: string, endStr: string): string[] {
  const list: string[] = []
  const partsS = startStr.split('-').map(Number)
  const partsE = endStr.split('-').map(Number)
  if (partsS.length !== 3 || partsE.length !== 3 || partsS.some(Number.isNaN) || partsE.some(Number.isNaN)) {
    return []
  }
  let cur = new Date(partsS[0], partsS[1] - 1, partsS[2])
  const end = new Date(partsE[0], partsE[1] - 1, partsE[2])
  if (cur > end) return []
  while (cur <= end) {
    list.push(formatDateKey(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return list
}

/** 自定义分析区间最长一年（与常见导出上限一致） */
const MAX_CUSTOM_RANGE_DAYS = 365

/** 将自定义起止日编码为键，用于判断「该区间是否已看过解锁广告」 */
const customRangeAdKey = (start: string, end: string) => `${start}\u0000${end}`

/** 微信小程序激励视频广告（最小接口） */
interface RewardedVideoAdLike {
  show(): Promise<void>
  load(): Promise<void>
  onLoad(cb: () => void): void
  onError(cb: (err: unknown) => void): void
  onClose(cb: (res: { isEnded?: boolean }) => void): void
}

/** 分析页激励视频：自定义 Tab、30天总结、自定义总结（兜底） */
const ANALYSIS_REWARD_AD_UNIT_ID = 'adunit-f6882fea9352fb42'

/** 微信流量主审核未通过时拉取会失败，审核通过后在各页改为 `true` 再发版 */
const REWARD_VIDEO_ADS_ENABLED = false

type PendingVideoAction = 'unlock-custom-tab' | 'open-summary-30d' | 'open-summary-custom-fallback'

const formatDateDisplay = (dateStr: string, type: 'week' | 'month') => {
  if (type === 'month') {
    const parts = dateStr.split('-')
    if (parts.length >= 3) {
      return `${parts[1]}-${parts[2]}`
    }
  }
  const date = new Date(dateStr)
  if (type === 'week') {
    const days = ['日', '一', '二', '三', '四', '五', '六']
    return days[date.getDay()]
  }
  return `${date.getMonth() + 1}/${date.getDate()}`
}

interface SelectedPoint {
  date: string
  label: string
  systolic: number
  diastolic: number
  count: number
  xPercent: number
  yPercent: number
}

interface SelectedPulsePoint {
  date: string
  label: string
  pulse: number
  count: number
  xPercent: number
  yPercent: number
}

export default function AnalysisPage() {
  const [records, setRecords] = useState<BPRecord[]>([])
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'custom'>('week')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [handFilter, setHandFilter] = useState<'all' | 'left' | 'right'>('all')
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(null)
  const [selectedPulsePoint, setSelectedPulsePoint] = useState<SelectedPulsePoint | null>(null)
  const [fontSizeMode, setFontSizeMode] = useState<FontSizeMode>('normal')
  const videoAdRef = useRef<RewardedVideoAdLike | null>(null)
  const pendingVideoActionRef = useRef<PendingVideoAction | null>(null)
  /** 已解锁激励视频的自定义区间（换一组起止日需重新解锁） */
  const customRangeAdUnlockedKeyRef = useRef<string | null>(null)
  /** 与 ref 同步，用于解锁后刷新「趋势/占比/平均」展示 */
  const [customRangeUnlockedKeyState, setCustomRangeUnlockedKeyState] = useState<string | null>(null)
  /** 当前这次播放对应的区间键（onClose 写入 unlocked） */
  const pendingCustomUnlockKeyRef = useRef<string | null>(null)
  /** 避免重复拉起「自定义解锁」广告 */
  const unlockCustomAdInFlightRef = useRef(false)

  useLoad(() => {
    setFontSizeMode(getCurrentFontSizeMode())
  })

  useDidShow(() => {
    if (consumeAnalysisNeedRefresh()) {
      fetchRecords()
    }
    const currentMode = getCurrentFontSizeMode()
    if (currentMode !== fontSizeMode) {
      setFontSizeMode(currentMode)
    }
  })

  useEffect(() => {
    const handleFontModeChange = (mode: FontSizeMode) => {
      setFontSizeMode(mode)
    }
    Taro.eventCenter.on('fontSizeModeChanged', handleFontModeChange)
    return () => {
      Taro.eventCenter.off('fontSizeModeChanged', handleFontModeChange)
    }
  }, [])

  useEffect(() => {
    setSelectedPoint(null)
    setSelectedPulsePoint(null)
  }, [timeRange, handFilter, customStart, customEnd])

  useEffect(() => {
    if (!REWARD_VIDEO_ADS_ENABLED) return
    const wxGlobal = (globalThis as unknown as {
      wx?: { createRewardedVideoAd?: (opts: { adUnitId: string }) => RewardedVideoAdLike }
    }).wx
    if (!wxGlobal?.createRewardedVideoAd) return
    try {
      const videoAd = wxGlobal.createRewardedVideoAd({ adUnitId: ANALYSIS_REWARD_AD_UNIT_ID })
      videoAd.onLoad(() => {})
      videoAd.onError((err) => {
        console.error('激励视频广告加载失败', err)
      })
      videoAd.onClose((res) => {
        const action = pendingVideoActionRef.current
        if (res?.isEnded && action) {
          pendingVideoActionRef.current = null
          if (action === 'unlock-custom-tab') {
            setSelectedPoint(null)
            setSelectedPulsePoint(null)
            const k = pendingCustomUnlockKeyRef.current
            if (k) {
              customRangeAdUnlockedKeyRef.current = k
              setCustomRangeUnlockedKeyState(k)
              pendingCustomUnlockKeyRef.current = null
            }
            unlockCustomAdInFlightRef.current = false
          } else if (action === 'open-summary-30d' || action === 'open-summary-custom-fallback') {
            Taro.navigateTo({ url: '/pages/weekly-report/index' })
          }
        } else {
          const forToast = pendingVideoActionRef.current
          pendingVideoActionRef.current = null
          if (forToast === 'unlock-custom-tab') {
            unlockCustomAdInFlightRef.current = false
            pendingCustomUnlockKeyRef.current = null
          }
          if (res && res.isEnded === false && forToast) {
            const title =
              forToast === 'open-summary-30d' || forToast === 'open-summary-custom-fallback'
                ? '请完整观看广告后查看总结报告'
                : '请完整观看广告后使用自定义区间'
            Taro.showToast({ title, icon: 'none' })
          }
        }
      })
      videoAdRef.current = videoAd
    } catch (e) {
      console.error('激励视频广告创建失败', e)
    }
  }, [])

  const fetchRecords = async () => {
    if (USE_TEST_DATA) {
      setRecords(getTestData())
      return
    }
    const userInfo = getUserInfo()
    if (!userInfo) return
    const { data } = await getRecords(userInfo.openid)
    if (data) {
      setRecords(data)
    }
  }

  const periodDateBounds = useMemo(() => {
    const now = new Date()
    now.setHours(23, 59, 59, 999)
    let dateList: string[] = []
    const weekDayLabels = ['一', '二', '三', '四', '五', '六', '日']
    if (timeRange === 'week') {
      const dayOfWeek = now.getDay() || 7
      const monday = new Date(now)
      monday.setDate(now.getDate() - dayOfWeek + 1)
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday)
        d.setDate(monday.getDate() + i)
        dateList.push(formatDateKey(d))
      }
    } else if (timeRange === 'month') {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now)
        d.setDate(now.getDate() - i)
        dateList.push(formatDateKey(d))
      }
    } else {
      if (!customStart || !customEnd) {
        return { start: '', end: '', dateList: [], weekDayLabels }
      }
      dateList = enumerateDateKeys(customStart, customEnd)
      if (dateList.length > MAX_CUSTOM_RANGE_DAYS) {
        dateList = dateList.slice(0, MAX_CUSTOM_RANGE_DAYS)
      }
    }
    if (dateList.length === 0) {
      return { start: '', end: '', dateList: [], weekDayLabels }
    }
    return { start: dateList[0], end: dateList[dateList.length - 1], dateList, weekDayLabels }
  }, [timeRange, customStart, customEnd])

  const filteredRecords = useMemo(() => {
    const { start, end } = periodDateBounds
    return records.filter(r => {
      const k = recordLocalDateKey(r.recorded_at)
      if (k < start || k > end) return false
      if (handFilter === 'all') return true
      return r.hand === handFilter
    })
  }, [records, periodDateBounds, handFilter])

  const donutCounts = useMemo(() => countDonutCategories(filteredRecords), [filteredRecords])
  const donutGradient = useMemo(() => buildDonutConicGradient(donutCounts), [donutCounts])

  const periodRecordAverage = useMemo(() => {
    if (filteredRecords.length === 0) return null
    const sys = Math.round(
      filteredRecords.reduce((s, r) => s + r.systolic, 0) / filteredRecords.length
    )
    const dia = Math.round(
      filteredRecords.reduce((s, r) => s + r.diastolic, 0) / filteredRecords.length
    )
    return { systolic: sys, diastolic: dia, count: filteredRecords.length }
  }, [filteredRecords])

  const chartData = useMemo(() => {
    const { dateList, weekDayLabels } = periodDateBounds
    const groupedByDate: { [key: string]: BPRecord[] } = {}
    records.forEach(r => {
      const dateKey = recordLocalDateKey(r.recorded_at)
      if (!groupedByDate[dateKey]) {
        groupedByDate[dateKey] = []
      }
      groupedByDate[dateKey].push(r)
    })

    const dailyAvg: {
      date: string
      label: string
      systolic: number | null
      diastolic: number | null
      pulse: number | null
      count: number
    }[] = []

    dateList.forEach((dateStr, index) => {
      const dayRaw = groupedByDate[dateStr] || []
      const dayRecords =
        handFilter === 'all' ? dayRaw : dayRaw.filter(r => r.hand === handFilter)
      const label =
        timeRange === 'week' ? weekDayLabels[index] : formatDateDisplay(dateStr, 'month')

      if (dayRecords.length > 0) {
        const avgSys = Math.round(
          dayRecords.reduce((sum, r) => sum + r.systolic, 0) / dayRecords.length
        )
        const avgDia = Math.round(
          dayRecords.reduce((sum, r) => sum + r.diastolic, 0) / dayRecords.length
        )
        const withPulse = dayRecords.filter(r => (r.pulse ?? 0) > 0)
        const avgPulse =
          withPulse.length > 0
            ? Math.round(
                withPulse.reduce((sum, r) => sum + (r.pulse as number), 0) / withPulse.length
              )
            : null
        dailyAvg.push({
          date: dateStr,
          label,
          systolic: avgSys,
          diastolic: avgDia,
          pulse: avgPulse,
          count: dayRecords.length
        })
      } else {
        dailyAvg.push({
          date: dateStr,
          label,
          systolic: null,
          diastolic: null,
          pulse: null,
          count: 0
        })
      }
    })

    return dailyAvg
  }, [records, timeRange, handFilter, periodDateBounds])

  const nDays = periodDateBounds.dateList.length
  const isLongSmoothChart = timeRange === 'month' || (timeRange === 'custom' && nDays > 7)
  const showPointValues =
    (timeRange === 'week' || (timeRange === 'custom' && nDays > 0 && nDays <= 7))
  const chartTotalPoints = Math.max(nDays - 1, 1)

  /** 与顶部时间选择一致：7天 / 30天 / 自定义区间天数 */
  const unlockReportTitle = useMemo(() => {
    if (timeRange === 'week') return '解锁近7天深度总结报告'
    if (timeRange === 'month') return '解锁近30天深度总结报告'
    if (timeRange === 'custom' && nDays > 0) return `解锁近${nDays}天深度总结报告`
    return '解锁深度总结报告'
  }, [timeRange, nDays])

  const yAxisRange = useMemo(() => {
    const validData = chartData.filter(d => d.systolic !== null)
    if (validData.length === 0) {
      return { min: 0, max: 150, step: 30 }
    }
    let maxVal = Math.max(...validData.map(d => d.systolic!))
    maxVal = Math.ceil((maxVal + 15) / 30) * 30
    maxVal = Math.max(150, Math.min(210, maxVal))
    return { min: 0, max: maxVal, step: 30 }
  }, [chartData])

  const getYPercent = (value: number) => {
    const { min, max } = yAxisRange
    return 100 - ((value - min) / (max - min)) * 100
  }

  const yAxisTicks = useMemo(() => {
    const { min, max, step } = yAxisRange
    const ticks: number[] = []
    for (let v = min; v <= max; v += step) {
      ticks.push(v)
    }
    return ticks.reverse()
  }, [yAxisRange])

  const smoothTrendLine = useMemo(() => {
    if (!isLongSmoothChart) return []
    const validPoints = chartData
      .map((d, i) => ({ ...d, index: i }))
      .filter(d => d.systolic !== null)
    if (validPoints.length < 2) return validPoints
    return validPoints.map((point, i) => {
      if (i === 0 || i === validPoints.length - 1) {
        return point
      }
      const prev = validPoints[i - 1]
      const next = validPoints[i + 1]
      return {
        ...point,
        systolic: Math.round(
          prev.systolic! * 0.25 + point.systolic! * 0.5 + next.systolic! * 0.25
        ),
        diastolic: Math.round(
          prev.diastolic! * 0.25 + point.diastolic! * 0.5 + next.diastolic! * 0.25
        )
      }
    })
  }, [chartData, isLongSmoothChart])

  const pulseYAxisRange = useMemo(() => {
    const validData = chartData.filter(d => d.pulse !== null)
    if (validData.length === 0) {
      return { min: 40, max: 120, step: 20 }
    }
    let maxVal = Math.max(...validData.map(d => d.pulse!))
    let minVal = Math.min(...validData.map(d => d.pulse!))
    maxVal = Math.ceil((maxVal + 6) / 20) * 20
    minVal = Math.floor((minVal - 6) / 20) * 20
    minVal = Math.max(40, minVal)
    maxVal = Math.min(200, Math.max(100, maxVal))
    if (maxVal - minVal < 40) {
      const mid = Math.round((minVal + maxVal) / 2)
      minVal = Math.max(40, mid - 30)
      maxVal = Math.min(200, mid + 30)
    }
    const step = 20
    return { min: minVal, max: maxVal, step }
  }, [chartData])

  const getPulseYPercent = (value: number) => {
    const { min, max } = pulseYAxisRange
    return 100 - ((value - min) / (max - min)) * 100
  }

  const pulseYAxisTicks = useMemo(() => {
    const { min, max, step } = pulseYAxisRange
    const ticks: number[] = []
    for (let v = min; v <= max; v += step) {
      ticks.push(v)
    }
    return ticks.reverse()
  }, [pulseYAxisRange])

  const smoothPulseTrendLine = useMemo(() => {
    if (!isLongSmoothChart) return []
    const validPoints = chartData
      .map((d, i) => ({ ...d, index: i }))
      .filter(d => d.pulse !== null)
    if (validPoints.length < 2) return validPoints
    return validPoints.map((point, i) => {
      if (i === 0 || i === validPoints.length - 1) {
        return point
      }
      const prev = validPoints[i - 1]
      const next = validPoints[i + 1]
      return {
        ...point,
        pulse: Math.round(prev.pulse! * 0.25 + point.pulse! * 0.5 + next.pulse! * 0.25)
      }
    })
  }, [chartData, isLongSmoothChart])

  const donutTotal = filteredRecords.length

  const clampCustomRange = (nextStart: string, nextEnd: string) => {
    const partsS = nextStart.split('-').map(Number)
    const partsE = nextEnd.split('-').map(Number)
    if (partsS.length !== 3 || partsE.length !== 3) return { start: nextStart, end: nextEnd }
    let dS = new Date(partsS[0], partsS[1] - 1, partsS[2])
    let dE = new Date(partsE[0], partsE[1] - 1, partsE[2])
    let startStr = nextStart
    let endStr = nextEnd
    if (dS > dE) {
      endStr = startStr
      dE = new Date(dS)
    }
    const span =
      Math.floor((dE.getTime() - dS.getTime()) / (24 * 60 * 60 * 1000)) + 1
    if (span > MAX_CUSTOM_RANGE_DAYS) {
      const cap = new Date(dS)
      cap.setDate(cap.getDate() + MAX_CUSTOM_RANGE_DAYS - 1)
      endStr = formatDateKey(cap)
      Taro.showToast({
        title: `最长支持 ${MAX_CUSTOM_RANGE_DAYS} 天，已自动截断结束日期`,
        icon: 'none',
        duration: 2800
      })
    }
    return { start: startStr, end: endStr }
  }

  const onPickCustomStart = (e: { detail: { value: string } }) => {
    const v = e.detail.value
    /** 尚未选结束日时，只写入开始日；不要用「结束=开始」凑齐区间，否则会只选一次就弹广告 */
    if (!customEnd) {
      setCustomStart(v)
      return
    }
    const { start, end } = clampCustomRange(v, customEnd)
    setCustomStart(start)
    setCustomEnd(end)
    if (timeRange === 'custom' && start && end) {
      requestCustomUnlockAd(start, end)
    }
  }

  const onPickCustomEnd = (e: { detail: { value: string } }) => {
    const v = e.detail.value
    if (!customStart) {
      setCustomEnd(v)
      return
    }
    const { start, end } = clampCustomRange(customStart, v)
    setCustomStart(start)
    setCustomEnd(end)
    if (timeRange === 'custom' && start && end) {
      requestCustomUnlockAd(start, end)
    }
  }

  const navigateWeeklyReport = () => {
    Taro.navigateTo({ url: '/pages/weekly-report/index' })
  }

  const playRewardedVideo = (onMissingAd: () => void) => {
    if (!REWARD_VIDEO_ADS_ENABLED) {
      pendingVideoActionRef.current = null
      onMissingAd()
      return
    }
    const videoAd = videoAdRef.current
    if (!videoAd) {
      onMissingAd()
      return
    }
    videoAd.show().catch(() => {
      videoAd
        .load()
        .then(() => videoAd.show())
        .catch((err) => {
          console.error('激励视频广告显示失败', err)
          const wasUnlock = pendingVideoActionRef.current === 'unlock-custom-tab'
          pendingVideoActionRef.current = null
          unlockCustomAdInFlightRef.current = false
          if (wasUnlock) pendingCustomUnlockKeyRef.current = null
          Taro.showToast({ title: '广告加载失败，请稍后重试', icon: 'none' })
        })
    })
  }

  /** 起止日期都选好后再播：解锁自定义区间对应的深度总结等权益 */
  const requestCustomUnlockAd = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return
    const rangeKey = customRangeAdKey(startStr, endStr)
    if (customRangeAdUnlockedKeyRef.current === rangeKey || unlockCustomAdInFlightRef.current) return
    unlockCustomAdInFlightRef.current = true
    pendingCustomUnlockKeyRef.current = rangeKey
    const onMissingAd = () => {
      unlockCustomAdInFlightRef.current = false
      pendingCustomUnlockKeyRef.current = null
      setSelectedPoint(null)
      setSelectedPulsePoint(null)
      customRangeAdUnlockedKeyRef.current = rangeKey
      setCustomRangeUnlockedKeyState(rangeKey)
    }
    pendingVideoActionRef.current = 'unlock-custom-tab'
    playRewardedVideo(onMissingAd)
  }

  /**
   * 总结：7天免费；30天看广告；自定义与趋势共用一次广告（选完日期并看完激励视频则免费）
   */
  const openWeeklyReportWithPolicy = () => {
    if (timeRange === 'week') {
      navigateWeeklyReport()
      return
    }
    if (timeRange === 'month') {
      pendingVideoActionRef.current = 'open-summary-30d'
      playRewardedVideo(navigateWeeklyReport)
      return
    }
    if (
      customStart &&
      customEnd &&
      customRangeAdUnlockedKeyRef.current === customRangeAdKey(customStart, customEnd)
    ) {
      navigateWeeklyReport()
      return
    }
    pendingVideoActionRef.current = 'open-summary-custom-fallback'
    playRewardedVideo(navigateWeeklyReport)
  }

  const legendRows = useMemo(() => {
    const t = donutTotal
    return DONUT_CATEGORIES.map(m => {
      const n = donutCounts[m.key as AnalysisDonutCategory]
      const pct = t === 0 ? 0 : Math.round((n / t) * 100)
      return { ...m, count: n, pct }
    })
  }, [donutCounts, donutTotal])

  const customPickerToday = formatDateKey(new Date())
  const customStartPickerValue = customStart || customPickerToday
  const customEndPickerValue = customEnd || customPickerToday

  /** 自定义：仅在看激励视频解锁后才展示趋势、占比、平均血压（与总结解锁同一区间键） */
  const customRangeComplete = !!(customStart && customEnd)
  const customRangeKeyLive =
    timeRange === 'custom' && customRangeComplete
      ? customRangeAdKey(customStart, customEnd)
      : null
  const showCustomTrendAndStats =
    timeRange !== 'custom' ||
    (customRangeKeyLive !== null && customRangeUnlockedKeyState === customRangeKeyLive)

  return (
    <View className={`analysis-page ${getFontSizeModeClass(fontSizeMode)}`}>
      <View className='analysis-top-card'>
        <View className='analysis-filter-section'>
          <Text className='analysis-filter-label'>时间范围</Text>
          <View className='time-tabs time-tabs--triple'>
            <View
              className={`time-tab ${timeRange === 'week' ? 'active' : ''}`}
              onClick={() => {
                setTimeRange('week')
                setSelectedPoint(null)
                setSelectedPulsePoint(null)
              }}
            >
              <Text>7天</Text>
            </View>
            <View
              className={`time-tab ${timeRange === 'month' ? 'active' : ''}`}
              onClick={() => {
                setTimeRange('month')
                setSelectedPoint(null)
                setSelectedPulsePoint(null)
              }}
            >
              <Text>30天</Text>
            </View>
            <View
              className={`time-tab ${timeRange === 'custom' ? 'active' : ''}`}
              onClick={() => {
                if (timeRange === 'custom') return
                setTimeRange('custom')
                setSelectedPoint(null)
                setSelectedPulsePoint(null)
                if (
                  customStart &&
                  customEnd &&
                  customRangeAdUnlockedKeyRef.current !== customRangeAdKey(customStart, customEnd)
                ) {
                  Taro.nextTick(() => {
                    requestCustomUnlockAd(customStart, customEnd)
                  })
                }
              }}
            >
              <Text>自定义</Text>
            </View>
          </View>
          {timeRange === 'custom' && (
            <View className='custom-range-row'>
              <View className='custom-range-field'>
                <Text className='custom-range-label'>开始</Text>
                <Picker mode='date' value={customStartPickerValue} onChange={onPickCustomStart}>
                  <View className='custom-range-value'>{customStart || '选择开始日期'}</View>
                </Picker>
              </View>
              <Text className='custom-range-sep'>—</Text>
              <View className='custom-range-field'>
                <Text className='custom-range-label'>结束</Text>
                <Picker mode='date' value={customEndPickerValue} onChange={onPickCustomEnd}>
                  <View className='custom-range-value'>{customEnd || '选择结束日期'}</View>
                </Picker>
              </View>
            </View>
          )}
          {timeRange === 'custom' && (
            <Text className='custom-range-hint'>最长可选一年（{MAX_CUSTOM_RANGE_DAYS} 天）</Text>
          )}
        </View>

        <View className='analysis-filter-divider' />

        <View className='analysis-filter-section analysis-filter-section--last'>
          <Text className='analysis-filter-label'>测量手</Text>
          <View className='hand-toggle-row hand-toggle-row--segmented'>
            <View
              className={`hand-toggle-btn ${handFilter === 'all' ? 'active' : ''}`}
              onClick={() => {
                setHandFilter('all')
                setSelectedPoint(null)
                setSelectedPulsePoint(null)
              }}
            >
              <Text className='hand-toggle-text'>全部</Text>
            </View>
            <View
              className={`hand-toggle-btn ${handFilter === 'left' ? 'active' : ''}`}
              onClick={() => {
                setHandFilter('left')
                setSelectedPoint(null)
                setSelectedPulsePoint(null)
              }}
            >
              <Text className='hand-toggle-text'>左手</Text>
            </View>
            <View
              className={`hand-toggle-btn ${handFilter === 'right' ? 'active' : ''}`}
              onClick={() => {
                setHandFilter('right')
                setSelectedPoint(null)
                setSelectedPulsePoint(null)
              }}
            >
              <Text className='hand-toggle-text'>右手</Text>
            </View>
          </View>
        </View>
      </View>

      <View className='analysis-report-cta' onClick={openWeeklyReportWithPolicy}>
        <View className='analysis-report-cta-left'>
          <Text className='analysis-report-cta-title'>{unlockReportTitle}</Text>
          <Text className='analysis-report-cta-sub'>所选时间段内 · 详细统计 · 趋势解读 · 可分享海报</Text>
        </View>
        <Text className='analysis-report-cta-arrow'>›</Text>
      </View>

      {/* 血压趋势 */}
      <View className='chart-card'>
        <Text className='chart-title-plain'>血压趋势</Text>
        {timeRange === 'custom' && !showCustomTrendAndStats ? (
          <View className='chart-empty'>
            <Image className='empty-icon' src={iconChart} mode='aspectFit' />
            <Text className='empty-text'>
              {!customRangeComplete ? '请先选择开始与结束日期' : '请完整观看激励视频后查看趋势'}
            </Text>
            <Text className='empty-hint'>
              {!customRangeComplete
                ? '选好后将播放短视频，完整观看后可查看本区间趋势与统计'
                : '完整观看短视频后即可查看曲线与各区块数据'}
            </Text>
          </View>
        ) : (
          <>
        <View className='chart-legend-bar'>
          <View className='chart-legend-items'>
            <View className='legend-item'>
              <View className='legend-dot systolic' />
              <Text className='legend-text'>收缩压（高压）</Text>
            </View>
            <View className='legend-item'>
              <View className='legend-dot diastolic' />
              <Text className='legend-text'>舒张压（低压）</Text>
            </View>
          </View>
          <Text className='chart-legend-unit'>mmHg</Text>
        </View>

        {isLongSmoothChart && (
          <Text className='chart-hint'>
            {timeRange === 'month' ? '近30天为平滑趋势线，便于观察走势' : '多日区间为平滑趋势线，便于观察走势'}
          </Text>
        )}

        {chartData.some(d => d.systolic !== null) ? (
          <View className={`chart-wrapper ${isLongSmoothChart ? 'month-mode' : ''}`}>
            <View className='y-axis'>
              {yAxisTicks.map(tick => (
                <Text key={tick} className='y-tick'>
                  {tick}
                </Text>
              ))}
            </View>
            <View
              className={`chart-area ${isLongSmoothChart ? 'month-mode' : ''}`}
              onClick={() => {
                setSelectedPoint(null)
                setSelectedPulsePoint(null)
              }}
            >
              <View className='chart-area-fade' />
              {yAxisTicks.map(tick => (
                <View
                  key={tick}
                  className='grid-line'
                  style={{ top: `${getYPercent(tick)}%` }}
                />
              ))}
              <View className='lines-layer'>
                {(() => {
                  const aspectRatio = 1.8
                  const totalPoints = chartTotalPoints
                  const dataToRender =
                    isLongSmoothChart
                      ? smoothTrendLine.map(d => ({ point: d, index: d.index }))
                      : chartData
                        .map((point, index) => ({ point, index }))
                        .filter(({ point }) => point.systolic !== null)

                  return dataToRender.map(({ point, index }, i) => {
                    if (i >= dataToRender.length - 1) return null
                    const nextItem = dataToRender[i + 1]
                    const x1 = (index / totalPoints) * 100
                    const x2 = (nextItem.index / totalPoints) * 100
                    const sysY1 = getYPercent(point.systolic!)
                    const sysY2 = getYPercent(nextItem.point.systolic!)
                    const diaY1 = getYPercent(point.diastolic!)
                    const diaY2 = getYPercent(nextItem.point.diastolic!)
                    const dx = (x2 - x1) * aspectRatio
                    const sysAngle = Math.atan2(sysY2 - sysY1, dx) * (180 / Math.PI)
                    const diaAngle = Math.atan2(diaY2 - diaY1, dx) * (180 / Math.PI)
                    return (
                      <View key={`line-${index}`}>
                        <View
                          className='line systolic'
                          style={{
                            left: `${x1}%`,
                            top: `${sysY1}%`,
                            width: `${Math.sqrt((x2 - x1) ** 2 + ((sysY2 - sysY1) / aspectRatio) ** 2)}%`,
                            transform: `rotate(${sysAngle}deg)`
                          }}
                        />
                        <View
                          className='line diastolic'
                          style={{
                            left: `${x1}%`,
                            top: `${diaY1}%`,
                            width: `${Math.sqrt((x2 - x1) ** 2 + ((diaY2 - diaY1) / aspectRatio) ** 2)}%`,
                            transform: `rotate(${diaAngle}deg)`
                          }}
                        />
                      </View>
                    )
                  })
                })()}
              </View>
              <View className='data-layer'>
                {(() => {
                  const totalPoints = chartTotalPoints
                  const pointsToRender =
                    isLongSmoothChart
                      ? smoothTrendLine
                      : chartData
                        .map((d, i) => ({ ...d, index: i }))
                        .filter(d => d.systolic !== null)

                  return pointsToRender.map(point => {
                    const xPercent = (point.index / totalPoints) * 100
                    const sysY = getYPercent(point.systolic!)
                    const diaY = getYPercent(point.diastolic!)
                    const isSelected = selectedPoint?.date === point.date
                    const handlePointClick = (e: any) => {
                      e.stopPropagation?.()
                      if (isSelected) {
                        setSelectedPoint(null)
                      } else {
                        setSelectedPulsePoint(null)
                        const originalData = chartData.find(d => d.date === point.date)
                        setSelectedPoint({
                          date: point.date,
                          label: point.label,
                          systolic: originalData?.systolic || point.systolic!,
                          diastolic: originalData?.diastolic || point.diastolic!,
                          count: originalData?.count || 1,
                          xPercent,
                          yPercent: sysY
                        })
                      }
                    }
                    return (
                      <View key={point.date}>
                        <View
                          className={`data-point systolic ${isSelected ? 'selected' : ''}`}
                          style={{ left: `${xPercent}%`, top: `${sysY}%` }}
                          onClick={handlePointClick}
                        >
                          {showPointValues && (
                            <Text className='point-value point-value--sys'>{point.systolic}</Text>
                          )}
                          <View className='point-inner' />
                        </View>
                        <View
                          className={`data-point diastolic ${isSelected ? 'selected' : ''}`}
                          style={{ left: `${xPercent}%`, top: `${diaY}%` }}
                          onClick={handlePointClick}
                        >
                          {showPointValues && (
                            <Text className='point-value point-value--dia'>{point.diastolic}</Text>
                          )}
                          <View className='point-inner' />
                        </View>
                      </View>
                    )
                  })
                })()}

                {selectedPoint && (
                  <View
                    className='tooltip'
                    style={{
                      left: `${Math.min(Math.max(selectedPoint.xPercent, 15), 85)}%`,
                      top: `${Math.max(selectedPoint.yPercent - 5, 5)}%`
                    }}
                  >
                    <View className='tooltip-content'>
                      <Text className='tooltip-date'>{selectedPoint.label}</Text>
                      <View className='tooltip-values'>
                        <Text className='tooltip-bp'>
                          <Text className='sys-value'>{selectedPoint.systolic}</Text>
                          <Text className='slash'>/</Text>
                          <Text className='dia-value'>{selectedPoint.diastolic}</Text>
                        </Text>
                        <Text className='tooltip-unit'>mmHg</Text>
                      </View>
                      {selectedPoint.count > 1 && (
                        <Text className='tooltip-count'>
                          当日
                          {handFilter === 'left'
                            ? '左手'
                            : handFilter === 'right'
                              ? '右手'
                              : ''}
                          {selectedPoint.count}次平均
                        </Text>
                      )}
                    </View>
                    <View className='tooltip-arrow' />
                  </View>
                )}
              </View>
            </View>
          </View>
        ) : (
          <View className='chart-empty'>
            <Image className='empty-icon' src={iconChart} mode='aspectFit' />
            <Text className='empty-text'>暂无数据</Text>
            <Text className='empty-hint'>记录血压后这里会显示趋势图</Text>
          </View>
        )}

        {chartData.some(d => d.systolic !== null) && (
          <View className='x-axis'>
            {timeRange === 'week'
              ? chartData.map((point, index) => (
                <Text
                  key={point.date}
                  className={`x-label ${point.count > 0 ? 'has-data' : ''}`}
                  style={{ left: `${(index / chartTotalPoints) * 100}%` }}
                >
                  {point.label}
                </Text>
              ))
              : timeRange === 'month'
                ? [0, 10, 20, 29].map(index => (
                  <Text
                    key={chartData[index]?.date || index}
                    className='x-label'
                    style={{ left: `${(index / chartTotalPoints) * 100}%` }}
                  >
                    {chartData[index]?.label || ''}
                  </Text>
                ))
                : (() => {
                    const n = chartData.length
                    const tp = Math.max(n - 1, 1)
                    const rawIdx =
                      n <= 7
                        ? chartData.map((_, i) => i)
                        : [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1]
                    const indices = rawIdx
                      .filter((v, i, a) => a.indexOf(v) === i)
                      .sort((a, b) => a - b)
                    return indices.map(index => (
                      <Text
                        key={chartData[index]?.date ?? String(index)}
                        className='x-label'
                        style={{ left: `${(index / tp) * 100}%` }}
                      >
                        {chartData[index]?.label || ''}
                      </Text>
                    ))
                  })()}
          </View>
        )}
          </>
        )}
      </View>

      {/* 心率趋势（当日有脉搏记录时按日平均） */}
      <View className='chart-card'>
        <Text className='chart-title-plain'>心率趋势</Text>
        {timeRange === 'custom' && !showCustomTrendAndStats ? (
          <View className='chart-empty'>
            <Image className='empty-icon' src={iconChart} mode='aspectFit' />
            <Text className='empty-text'>
              {!customRangeComplete ? '请先选择开始与结束日期' : '请完整观看激励视频后查看趋势'}
            </Text>
            <Text className='empty-hint'>
              {!customRangeComplete
                ? '选好后将播放短视频，完整观看后可查看本区间趋势与统计'
                : '完整观看短视频后即可查看曲线与各区块数据'}
            </Text>
          </View>
        ) : (
          <>
            <View className='chart-legend-bar'>
              <View className='chart-legend-items'>
                <View className='legend-item'>
                  <View className='legend-dot pulse' />
                  <Text className='legend-text'>心率（脉搏）</Text>
                </View>
              </View>
              <Text className='chart-legend-unit'>次/分</Text>
            </View>

            {isLongSmoothChart && (
              <Text className='chart-hint'>
                {timeRange === 'month' ? '近30天为平滑趋势线，便于观察走势' : '多日区间为平滑趋势线，便于观察走势'}
              </Text>
            )}

            {chartData.some(d => d.pulse !== null) ? (
              <View className={`chart-wrapper ${isLongSmoothChart ? 'month-mode' : ''}`}>
                <View className='y-axis'>
                  {pulseYAxisTicks.map(tick => (
                    <Text key={tick} className='y-tick'>
                      {tick}
                    </Text>
                  ))}
                </View>
                <View
                  className={`chart-area ${isLongSmoothChart ? 'month-mode' : ''}`}
                  onClick={() => {
                    setSelectedPulsePoint(null)
                    setSelectedPoint(null)
                  }}
                >
                  <View className='chart-area-fade' />
                  {pulseYAxisTicks.map(tick => (
                    <View
                      key={`pulse-grid-${tick}`}
                      className='grid-line'
                      style={{ top: `${getPulseYPercent(tick)}%` }}
                    />
                  ))}
                  <View className='lines-layer'>
                    {(() => {
                      const aspectRatio = 1.8
                      const totalPoints = chartTotalPoints
                      const dataToRender = isLongSmoothChart
                        ? smoothPulseTrendLine.map(d => ({ point: d, index: d.index }))
                        : chartData
                          .map((point, index) => ({ point, index }))
                          .filter(({ point }) => point.pulse !== null)

                      return dataToRender.map(({ point, index }, i) => {
                        if (i >= dataToRender.length - 1) return null
                        const nextItem = dataToRender[i + 1]
                        const x1 = (index / totalPoints) * 100
                        const x2 = (nextItem.index / totalPoints) * 100
                        const y1 = getPulseYPercent(point.pulse!)
                        const y2 = getPulseYPercent(nextItem.point.pulse!)
                        const dx = (x2 - x1) * aspectRatio
                        const angle = Math.atan2(y2 - y1, dx) * (180 / Math.PI)
                        return (
                          <View
                            key={`pulse-line-${index}`}
                            className='line pulse'
                            style={{
                              left: `${x1}%`,
                              top: `${y1}%`,
                              width: `${Math.sqrt((x2 - x1) ** 2 + ((y2 - y1) / aspectRatio) ** 2)}%`,
                              transform: `rotate(${angle}deg)`
                            }}
                          />
                        )
                      })
                    })()}
                  </View>
                  <View className='data-layer'>
                    {(() => {
                      const totalPoints = chartTotalPoints
                      const pointsToRender = isLongSmoothChart
                        ? smoothPulseTrendLine
                        : chartData.map((d, i) => ({ ...d, index: i })).filter(d => d.pulse !== null)

                      return pointsToRender.map(point => {
                        const xPercent = (point.index / totalPoints) * 100
                        const pulseY = getPulseYPercent(point.pulse!)
                        const isSelected = selectedPulsePoint?.date === point.date
                        const handlePulseClick = (e: any) => {
                          e.stopPropagation?.()
                          if (isSelected) {
                            setSelectedPulsePoint(null)
                          } else {
                            setSelectedPoint(null)
                            const originalData = chartData.find(d => d.date === point.date)
                            setSelectedPulsePoint({
                              date: point.date,
                              label: point.label,
                              pulse: originalData?.pulse ?? point.pulse!,
                              count: originalData?.count || 1,
                              xPercent,
                              yPercent: pulseY
                            })
                          }
                        }
                        return (
                          <View key={`pulse-${point.date}`}>
                            <View
                              className={`data-point pulse ${isSelected ? 'selected' : ''}`}
                              style={{ left: `${xPercent}%`, top: `${pulseY}%` }}
                              onClick={handlePulseClick}
                            >
                              {showPointValues && (
                                <Text className='point-value point-value--pulse'>{point.pulse}</Text>
                              )}
                              <View className='point-inner' />
                            </View>
                          </View>
                        )
                      })
                    })()}

                    {selectedPulsePoint && (
                      <View
                        className='tooltip'
                        style={{
                          left: `${Math.min(Math.max(selectedPulsePoint.xPercent, 15), 85)}%`,
                          top: `${Math.max(selectedPulsePoint.yPercent - 5, 5)}%`
                        }}
                      >
                        <View className='tooltip-content'>
                          <Text className='tooltip-date'>{selectedPulsePoint.label}</Text>
                          <View className='tooltip-values'>
                            <Text className='tooltip-pulse-row'>
                              <Text className='pulse-tooltip-val'>{selectedPulsePoint.pulse}</Text>
                              <Text className='tooltip-unit'>次/分</Text>
                            </Text>
                          </View>
                          {selectedPulsePoint.count > 1 && (
                            <Text className='tooltip-count'>
                              当日
                              {handFilter === 'left'
                                ? '左手'
                                : handFilter === 'right'
                                  ? '右手'
                                  : ''}
                              {selectedPulsePoint.count}条中含脉搏的平均
                            </Text>
                          )}
                        </View>
                        <View className='tooltip-arrow' />
                      </View>
                    )}
                  </View>
                </View>
              </View>
            ) : (
              <View className='chart-empty'>
                <Image className='empty-icon' src={iconChart} mode='aspectFit' />
                <Text className='empty-text'>暂无脉搏数据</Text>
                <Text className='empty-hint'>记录时填写脉搏后，这里会显示心率趋势</Text>
              </View>
            )}

            {chartData.some(d => d.pulse !== null) && (
              <View className='x-axis'>
                {timeRange === 'week'
                  ? chartData.map((point, index) => (
                    <Text
                      key={`pulse-x-${point.date}`}
                      className={`x-label ${point.count > 0 ? 'has-data' : ''}`}
                      style={{ left: `${(index / chartTotalPoints) * 100}%` }}
                    >
                      {point.label}
                    </Text>
                  ))
                  : timeRange === 'month'
                    ? [0, 10, 20, 29].map(index => (
                      <Text
                        key={`pulse-x-${chartData[index]?.date || index}`}
                        className='x-label'
                        style={{ left: `${(index / chartTotalPoints) * 100}%` }}
                      >
                        {chartData[index]?.label || ''}
                      </Text>
                    ))
                    : (() => {
                        const n = chartData.length
                        const tp = Math.max(n - 1, 1)
                        const rawIdx =
                          n <= 7
                            ? chartData.map((_, i) => i)
                            : [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1]
                        const indices = rawIdx
                          .filter((v, i, a) => a.indexOf(v) === i)
                          .sort((a, b) => a - b)
                        return indices.map(index => (
                          <Text
                            key={`pulse-x-${chartData[index]?.date ?? String(index)}`}
                            className='x-label'
                            style={{ left: `${(index / tp) * 100}%` }}
                          >
                            {chartData[index]?.label || ''}
                          </Text>
                        ))
                      })()}
              </View>
            )}
          </>
        )}
      </View>

      {/* 血压分类占比 */}
      <View className='donut-card'>
        <Text className='section-heading'>血压分类占比</Text>
        {timeRange === 'custom' && !showCustomTrendAndStats ? (
          <View className='donut-empty'>
            <Text className='donut-empty-text'>
              {!customRangeComplete ? '请先选择日期区间' : '观看激励视频后查看分类占比'}
            </Text>
          </View>
        ) : donutTotal === 0 ? (
          <View className='donut-empty'>
            <Text className='donut-empty-text'>本时段暂无记录</Text>
          </View>
        ) : (
          <View className='donut-body'>
            <View className='donut-visual'>
              <View className='donut-ring' style={{ background: donutGradient }} />
              <View className='donut-hole'>
                <Text className='donut-hole-num'>{donutTotal}</Text>
                <Text className='donut-hole-label'>总记录</Text>
              </View>
            </View>
            <View className='donut-legend'>
              {legendRows.map(row => (
                <View key={row.key} className='donut-legend-row'>
                  <View className='donut-legend-dot' style={{ background: row.color }} />
                  <Text className='donut-legend-label'>{row.label}</Text>
                  <Text className='donut-legend-val'>
                    {row.count}（{row.pct}%）
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* 平均血压 */}
      <View className='avg-bp-card'>
        <Text className='section-heading'>平均血压</Text>
        {timeRange === 'custom' && !showCustomTrendAndStats ? (
          <View className='donut-empty'>
            <Text className='donut-empty-text'>
              {!customRangeComplete ? '请先选择日期区间' : '观看激励视频后查看平均血压'}
            </Text>
          </View>
        ) : periodRecordAverage ? (
          <View className='avg-bp-row'>
            <View className='avg-bp-cell avg-bp-cell--sys'>
              <Text className='avg-bp-num avg-bp-num--sys'>{periodRecordAverage.systolic}</Text>
              <Text className='avg-bp-sublabel'>平均收缩压</Text>
              <Text className='avg-bp-unit'>mmHg</Text>
            </View>
            <View className='avg-bp-cell avg-bp-cell--dia'>
              <Text className='avg-bp-num avg-bp-num--dia'>{periodRecordAverage.diastolic}</Text>
              <Text className='avg-bp-sublabel'>平均舒张压</Text>
              <Text className='avg-bp-unit'>mmHg</Text>
            </View>
          </View>
        ) : (
          <View className='donut-empty'>
            <Text className='donut-empty-text'>本时段暂无记录</Text>
          </View>
        )}
      </View>

      <View className='analysis-warm-tip'>
        <View className='analysis-warm-tip-head'>
          <Text className='analysis-warm-tip-icon'>💡</Text>
          <Text className='analysis-warm-tip-title'>温馨提示</Text>
        </View>
        <Text className='analysis-warm-tip-body'>
          规律监测有助于了解血压变化趋势，请继续保持！
        </Text>
      </View>
    </View>
  )
}
