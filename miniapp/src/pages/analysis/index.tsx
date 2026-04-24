import { useState, useMemo, useEffect } from 'react'
import { View, Text, Image } from '@tarojs/components'
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

export default function AnalysisPage() {
  const [records, setRecords] = useState<BPRecord[]>([])
  const [timeRange, setTimeRange] = useState<'week' | 'month'>('week')
  const [handFilter, setHandFilter] = useState<'all' | 'left' | 'right'>('all')
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(null)
  const [fontSizeMode, setFontSizeMode] = useState<FontSizeMode>('normal')

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
  }, [timeRange, handFilter])

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
    const dateList: string[] = []
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
    } else {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now)
        d.setDate(now.getDate() - i)
        dateList.push(formatDateKey(d))
      }
    }
    return { start: dateList[0], end: dateList[dateList.length - 1], dateList, weekDayLabels }
  }, [timeRange])

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
      count: number
    }[] = []

    dateList.forEach((dateStr, index) => {
      const dayRaw = groupedByDate[dateStr] || []
      const dayRecords =
        handFilter === 'all' ? dayRaw : dayRaw.filter(r => r.hand === handFilter)
      const label =
        timeRange === 'week' ? weekDayLabels[index] : formatDateDisplay(dateStr, timeRange)

      if (dayRecords.length > 0) {
        const avgSys = Math.round(
          dayRecords.reduce((sum, r) => sum + r.systolic, 0) / dayRecords.length
        )
        const avgDia = Math.round(
          dayRecords.reduce((sum, r) => sum + r.diastolic, 0) / dayRecords.length
        )
        dailyAvg.push({
          date: dateStr,
          label,
          systolic: avgSys,
          diastolic: avgDia,
          count: dayRecords.length
        })
      } else {
        dailyAvg.push({
          date: dateStr,
          label,
          systolic: null,
          diastolic: null,
          count: 0
        })
      }
    })

    return dailyAvg
  }, [records, timeRange, handFilter, periodDateBounds])

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
    if (timeRange !== 'month') return []
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
  }, [chartData, timeRange])

  const donutTotal = filteredRecords.length

  const legendRows = useMemo(() => {
    const t = donutTotal
    return DONUT_CATEGORIES.map(m => {
      const n = donutCounts[m.key as AnalysisDonutCategory]
      const pct = t === 0 ? 0 : Math.round((n / t) * 100)
      return { ...m, count: n, pct }
    })
  }, [donutCounts, donutTotal])

  return (
    <View className={`analysis-page ${getFontSizeModeClass(fontSizeMode)}`}>
      <View className='analysis-top-card'>
        <View className='time-tabs'>
          <View
            className={`time-tab ${timeRange === 'week' ? 'active' : ''}`}
            onClick={() => {
              setTimeRange('week')
              setSelectedPoint(null)
            }}
          >
            <Text>7天</Text>
          </View>
          <View
            className={`time-tab ${timeRange === 'month' ? 'active' : ''}`}
            onClick={() => {
              setTimeRange('month')
              setSelectedPoint(null)
            }}
          >
            <Text>30天</Text>
          </View>
        </View>
        <View className='hand-toggle-row'>
          <View
            className={`hand-toggle-btn ${handFilter === 'all' ? 'active' : ''}`}
            onClick={() => {
              setHandFilter('all')
              setSelectedPoint(null)
            }}
          >
            <Text className='hand-toggle-text'>全部</Text>
          </View>
          <View
            className={`hand-toggle-btn ${handFilter === 'left' ? 'active' : ''}`}
            onClick={() => {
              setHandFilter('left')
              setSelectedPoint(null)
            }}
          >
            <Text className='hand-toggle-text'>左手</Text>
          </View>
          <View
            className={`hand-toggle-btn ${handFilter === 'right' ? 'active' : ''}`}
            onClick={() => {
              setHandFilter('right')
              setSelectedPoint(null)
            }}
          >
            <Text className='hand-toggle-text'>右手</Text>
          </View>
        </View>
      </View>

      {/* 血压趋势 */}
      <View className='chart-card'>
        <Text className='chart-title-plain'>血压趋势</Text>
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

        {timeRange === 'month' && (
          <Text className='chart-hint'>近30天为平滑趋势线，便于观察走势</Text>
        )}

        {chartData.some(d => d.systolic !== null) ? (
          <View className={`chart-wrapper ${timeRange === 'month' ? 'month-mode' : ''}`}>
            <View className='y-axis'>
              {yAxisTicks.map(tick => (
                <Text key={tick} className='y-tick'>
                  {tick}
                </Text>
              ))}
            </View>
            <View
              className={`chart-area ${timeRange === 'month' ? 'month-mode' : ''}`}
              onClick={() => setSelectedPoint(null)}
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
                  const totalPoints = timeRange === 'week' ? 6 : 29
                  const dataToRender =
                    timeRange === 'month'
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
                  const totalPoints = timeRange === 'week' ? 6 : 29
                  const pointsToRender =
                    timeRange === 'month'
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
                          {timeRange === 'week' && (
                            <Text className='point-value point-value--sys'>{point.systolic}</Text>
                          )}
                          <View className='point-inner' />
                        </View>
                        <View
                          className={`data-point diastolic ${isSelected ? 'selected' : ''}`}
                          style={{ left: `${xPercent}%`, top: `${diaY}%` }}
                          onClick={handlePointClick}
                        >
                          {timeRange === 'week' && (
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
                  style={{ left: `${(index / 6) * 100}%` }}
                >
                  {point.label}
                </Text>
              ))
              : [0, 10, 20, 29].map(index => (
                <Text
                  key={chartData[index]?.date || index}
                  className='x-label'
                  style={{ left: `${(index / 29) * 100}%` }}
                >
                  {chartData[index]?.label || ''}
                </Text>
              ))}
          </View>
        )}
      </View>

      {/* 血压分类占比 */}
      <View className='donut-card'>
        <Text className='section-heading'>血压分类占比</Text>
        {donutTotal === 0 ? (
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
        {periodRecordAverage ? (
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
