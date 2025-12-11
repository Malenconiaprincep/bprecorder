import { useState, useMemo } from 'react'
import { View, Text, Image } from '@tarojs/components'
import { useLoad } from '@tarojs/taro'
import { getRecords, BPRecord } from '../../lib/supabase'
import { getUserInfo } from '../../lib/auth'
import './index.scss'
// @ts-ignore
import iconChart from '../../assets/icons/chart.png'

// 获取日期字符串
const formatDateKey = (date: Date) => {
  return date.toISOString().split('T')[0]
}

// 格式化日期显示
const formatDateDisplay = (dateStr: string, type: 'week' | 'month') => {
  const date = new Date(dateStr)
  if (type === 'week') {
    const days = ['日', '一', '二', '三', '四', '五', '六']
    return days[date.getDay()]
  } else {
    return `${date.getMonth() + 1}/${date.getDate()}`
  }
}

// 测试数据
import { USE_TEST_DATA, getTestData } from '../../utils/testData'

// 选中点的类型
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
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(null)

  useLoad(() => {
    fetchRecords()
  })

  const fetchRecords = async () => {
    // 使用测试数据
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

  // 按日期分组并计算每天平均值
  const chartData = useMemo(() => {
    const now = new Date()
    now.setHours(23, 59, 59, 999)

    // 生成日期列表
    const dateList: string[] = []
    const weekDayLabels = ['一', '二', '三', '四', '五', '六', '日']

    if (timeRange === 'week') {
      // 周视图：显示本周一到周日
      const dayOfWeek = now.getDay() || 7 // 周日为7
      const monday = new Date(now)
      monday.setDate(now.getDate() - dayOfWeek + 1)

      for (let i = 0; i < 7; i++) {
        const d = new Date(monday)
        d.setDate(monday.getDate() + i)
        dateList.push(formatDateKey(d))
      }
    } else {
      // 月视图：显示最近30天
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now)
        d.setDate(now.getDate() - i)
        dateList.push(formatDateKey(d))
      }
    }

    // 按日期分组记录
    const groupedByDate: { [key: string]: BPRecord[] } = {}
    records.forEach(r => {
      const dateKey = r.recorded_at.split('T')[0]
      if (!groupedByDate[dateKey]) {
        groupedByDate[dateKey] = []
      }
      groupedByDate[dateKey].push(r)
    })

    // 计算每天平均值
    const dailyAvg: { date: string; label: string; systolic: number | null; diastolic: number | null; count: number }[] = []

    dateList.forEach((dateStr, index) => {
      const dayRecords = groupedByDate[dateStr] || []
      // 周视图使用固定的周一到周日标签
      const label = timeRange === 'week' ? weekDayLabels[index] : formatDateDisplay(dateStr, timeRange)

      if (dayRecords.length > 0) {
        const avgSys = Math.round(dayRecords.reduce((sum, r) => sum + r.systolic, 0) / dayRecords.length)
        const avgDia = Math.round(dayRecords.reduce((sum, r) => sum + r.diastolic, 0) / dayRecords.length)
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
  }, [records, timeRange])

  // 计算Y轴范围
  const yAxisRange = useMemo(() => {
    const validData = chartData.filter(d => d.systolic !== null)
    if (validData.length === 0) {
      return { min: 60, max: 160, step: 20 }
    }

    let minVal = Math.min(...validData.map(d => d.diastolic!))
    let maxVal = Math.max(...validData.map(d => d.systolic!))

    // 扩展范围并取整
    minVal = Math.floor((minVal - 10) / 10) * 10
    maxVal = Math.ceil((maxVal + 10) / 10) * 10

    minVal = Math.max(40, minVal)
    maxVal = Math.min(200, maxVal)

    return { min: minVal, max: maxVal, step: 20 }
  }, [chartData])

  // 计算Y轴位置百分比
  const getYPercent = (value: number) => {
    const { min, max } = yAxisRange
    return 100 - ((value - min) / (max - min)) * 100
  }

  // 生成Y轴刻度
  const yAxisTicks = useMemo(() => {
    const { min, max, step } = yAxisRange
    const ticks: number[] = []
    for (let v = min; v <= max; v += step) {
      ticks.push(v)
    }
    return ticks.reverse()
  }, [yAxisRange])

  // 计算总平均值
  const totalAverage = useMemo(() => {
    const validData = chartData.filter(d => d.systolic !== null)
    if (validData.length === 0) return null

    const avgSys = Math.round(validData.reduce((sum, d) => sum + d.systolic!, 0) / validData.length)
    const avgDia = Math.round(validData.reduce((sum, d) => sum + d.diastolic!, 0) / validData.length)
    const totalCount = validData.reduce((sum, d) => sum + d.count, 0)

    return { systolic: avgSys, diastolic: avgDia, count: totalCount, days: validData.length }
  }, [chartData])

  // 判断血压状态（按医学标准）
  const getBPStatus = (sys: number, dia: number) => {
    // 3级高血压（重度）
    if (sys >= 180 || dia >= 110) return { label: '3级高血压', color: 'high-3' }
    // 2级高血压（中/重度）
    if (sys >= 160 || dia >= 100) return { label: '2级高血压', color: 'high-2' }
    // 1级高血压（轻度）
    if (sys >= 140 || dia >= 90) return { label: '1级高血压', color: 'high-1' }
    // 前期高血压
    if (sys >= 130) return { label: '前期高血压', color: 'prehigh' }
    // 正常血压
    if (sys >= 120 || dia >= 80) return { label: '正常', color: 'normal' }
    // 理想血压
    return { label: '理想', color: 'ideal' }
  }

  // 计算平滑趋势线（用于30天视图）- 只保留有数据的点
  const smoothTrendLine = useMemo(() => {
    if (timeRange !== 'month') return []

    // 获取所有有数据的点
    const validPoints = chartData
      .map((d, i) => ({ ...d, index: i }))
      .filter(d => d.systolic !== null)

    if (validPoints.length < 2) return validPoints

    // 简单平滑：对每个点取前后点的加权平均
    const smoothed = validPoints.map((point, i) => {
      if (i === 0 || i === validPoints.length - 1) {
        return point
      }

      const prev = validPoints[i - 1]
      const next = validPoints[i + 1]

      return {
        ...point,
        systolic: Math.round((prev.systolic! * 0.25 + point.systolic! * 0.5 + next.systolic! * 0.25)),
        diastolic: Math.round((prev.diastolic! * 0.25 + point.diastolic! * 0.5 + next.diastolic! * 0.25))
      }
    })

    return smoothed
  }, [chartData, timeRange])

  return (
    <View className='analysis-page'>
      {/* 时间范围切换 */}
      <View className='time-tabs'>
        <View
          className={`time-tab ${timeRange === 'week' ? 'active' : ''}`}
          onClick={() => { setTimeRange('week'); setSelectedPoint(null) }}
        >
          <Text>近7天</Text>
        </View>
        <View
          className={`time-tab ${timeRange === 'month' ? 'active' : ''}`}
          onClick={() => { setTimeRange('month'); setSelectedPoint(null) }}
        >
          <Text>近30天</Text>
        </View>
      </View>

      {/* 图表卡片 */}
      <View className='chart-card'>
        <View className='chart-header'>
          <View className='chart-title'><Image className='chart-title-icon' src={iconChart} mode='aspectFit' /><Text>血压趋势</Text></View>
          <View className='chart-legend'>
            <View className='legend-item'>
              <View className='legend-dot systolic' />
              <Text className='legend-text'>收缩压</Text>
            </View>
            <View className='legend-item'>
              <View className='legend-dot diastolic' />
              <Text className='legend-text'>舒张压</Text>
            </View>
          </View>
        </View>
        {timeRange === 'month' && (
          <Text className='chart-hint'>显示平滑趋势线（每日波动已平滑处理）</Text>
        )}

        {chartData.some(d => d.systolic !== null) ? (
          <View className={`chart-wrapper ${timeRange === 'month' ? 'month-mode' : ''}`}>
            {/* Y轴 */}
            <View className='y-axis'>
              {yAxisTicks.map(tick => (
                <Text key={tick} className='y-tick'>{tick}</Text>
              ))}
            </View>

            {/* 图表区域 */}
            <View
              className={`chart-area ${timeRange === 'month' ? 'month-mode' : ''}`}
              onClick={() => setSelectedPoint(null)}
            >
              {/* 网格线 */}
              {yAxisTicks.map(tick => (
                <View
                  key={tick}
                  className='grid-line'
                  style={{ top: `${getYPercent(tick)}%` }}
                />
              ))}

              {/* 连接线层 */}
              <View className='lines-layer'>
                {(() => {
                  const aspectRatio = 1.8
                  const totalPoints = timeRange === 'week' ? 6 : 29

                  // 30天模式使用平滑趋势线，7天模式使用原始数据
                  const dataToRender = timeRange === 'month'
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

                    // 计算角度（考虑宽高比）
                    const dx = (x2 - x1) * aspectRatio
                    const sysAngle = Math.atan2(sysY2 - sysY1, dx) * (180 / Math.PI)
                    const diaAngle = Math.atan2(diaY2 - diaY1, dx) * (180 / Math.PI)

                    return (
                      <View key={`line-${index}`}>
                        {/* 收缩压连接线 */}
                        <View
                          className='line systolic'
                          style={{
                            left: `${x1}%`,
                            top: `${sysY1}%`,
                            width: `${Math.sqrt((x2 - x1) ** 2 + ((sysY2 - sysY1) / aspectRatio) ** 2)}%`,
                            transform: `rotate(${sysAngle}deg)`
                          }}
                        />
                        {/* 舒张压连接线 */}
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

              {/* 数据点层 */}
              <View className='data-layer'>
                {(() => {
                  const totalPoints = timeRange === 'week' ? 6 : 29

                  // 30天模式使用平滑趋势线的点，7天模式使用原始数据点
                  const pointsToRender = timeRange === 'month'
                    ? smoothTrendLine
                    : chartData
                      .map((d, i) => ({ ...d, index: i }))
                      .filter(d => d.systolic !== null)

                  return pointsToRender.map((point) => {
                    const xPercent = (point.index / totalPoints) * 100
                    const sysY = getYPercent(point.systolic!)
                    const diaY = getYPercent(point.diastolic!)
                    const isSelected = selectedPoint?.date === point.date

                    // 点击处理
                    const handlePointClick = (e: any) => {
                      e.stopPropagation()
                      if (isSelected) {
                        setSelectedPoint(null)
                      } else {
                        // 获取原始数据（30天模式下显示原始平均值，不是平滑后的）
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
                        {/* 收缩压点 */}
                        <View
                          className={`data-point systolic ${isSelected ? 'selected' : ''}`}
                          style={{ left: `${xPercent}%`, top: `${sysY}%` }}
                          onClick={handlePointClick}
                        >
                          <View className='point-inner' />
                          {timeRange === 'week' && (
                            <Text className='point-value'>{point.systolic}</Text>
                          )}
                        </View>

                        {/* 舒张压点 */}
                        <View
                          className={`data-point diastolic ${isSelected ? 'selected' : ''}`}
                          style={{ left: `${xPercent}%`, top: `${diaY}%` }}
                          onClick={handlePointClick}
                        >
                          <View className='point-inner' />
                          {timeRange === 'week' && (
                            <Text className='point-value'>{point.diastolic}</Text>
                          )}
                        </View>
                      </View>
                    )
                  })
                })()}

                {/* 选中点的提示气泡 */}
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
                        <Text className='tooltip-count'>当日{selectedPoint.count}次平均</Text>
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

        {/* X轴标签 */}
        {chartData.some(d => d.systolic !== null) && (
          <View className='x-axis'>
            {timeRange === 'week' ? (
              // 7天模式：显示所有天
              chartData.map((point, index) => (
                <Text
                  key={point.date}
                  className={`x-label ${point.count > 0 ? 'has-data' : ''}`}
                  style={{ left: `${(index / 6) * 100}%` }}
                >
                  {point.label}
                </Text>
              ))
            ) : (
              // 30天模式：显示4个标签（开始、10天、20天、结束）
              [0, 10, 20, 29].map(index => (
                <Text
                  key={chartData[index]?.date || index}
                  className='x-label'
                  style={{ left: `${(index / 29) * 100}%` }}
                >
                  {chartData[index]?.label || ''}
                </Text>
              ))
            )}
          </View>
        )}
      </View>

      {/* 统计卡片 */}
      {totalAverage && (
        <View className='stats-card'>
          <View className='stats-header'>
            <View className='stats-title'><Image className='title-icon' src={iconChart} mode='aspectFit' /><Text>统计数据</Text></View>
            <Text className='stats-period'>
              {timeRange === 'week' ? '近7天' : '近30天'} · {totalAverage.days}天有记录
            </Text>
          </View>

          <View className='stats-grid'>
            <View className='stat-item'>
              <Text className='stat-label'>平均收缩压</Text>
              <View className='stat-value-row'>
                <Text className='stat-value systolic'>{totalAverage.systolic}</Text>
                <Text className='stat-unit'>mmHg</Text>
              </View>
            </View>

            <View className='stat-item'>
              <Text className='stat-label'>平均舒张压</Text>
              <View className='stat-value-row'>
                <Text className='stat-value diastolic'>{totalAverage.diastolic}</Text>
                <Text className='stat-unit'>mmHg</Text>
              </View>
            </View>

            <View className='stat-item'>
              <Text className='stat-label'>测量次数</Text>
              <View className='stat-value-row'>
                <Text className='stat-value count'>{totalAverage.count}</Text>
                <Text className='stat-unit'>次</Text>
              </View>
            </View>

            <View className='stat-item'>
              <Text className='stat-label'>血压状态</Text>
              <View className={`status-tag ${getBPStatus(totalAverage.systolic, totalAverage.diastolic).color}`}>
                <Text className='status-text'>
                  {getBPStatus(totalAverage.systolic, totalAverage.diastolic).label}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}

    </View>
  )
}
