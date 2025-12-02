import React, { useState, useMemo } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import { useLoad } from '@tarojs/taro'
import { getRecords, BPRecord } from '../../lib/supabase'
import { getUserInfo } from '../../lib/auth'
import './index.scss'

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

export default function AnalysisPage() {
  const [records, setRecords] = useState<BPRecord[]>([])
  const [timeRange, setTimeRange] = useState<'week' | 'month'>('week')

  useLoad(() => {
    fetchRecords()
  })

  const fetchRecords = async () => {
    const userInfo = getUserInfo()
    if (!userInfo) return

    const { data } = await getRecords(userInfo.openid)
    if (data) {
      setRecords(data)
    }
  }

  // 按日期分组并计算每天平均值
  const chartData = useMemo(() => {
    const days = timeRange === 'week' ? 7 : 30
    const now = new Date()
    now.setHours(23, 59, 59, 999)

    // 生成日期列表
    const dateList: string[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(now.getDate() - i)
      dateList.push(formatDateKey(d))
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
    
    dateList.forEach(dateStr => {
      const dayRecords = groupedByDate[dateStr] || []
      if (dayRecords.length > 0) {
        const avgSys = Math.round(dayRecords.reduce((sum, r) => sum + r.systolic, 0) / dayRecords.length)
        const avgDia = Math.round(dayRecords.reduce((sum, r) => sum + r.diastolic, 0) / dayRecords.length)
        dailyAvg.push({
          date: dateStr,
          label: formatDateDisplay(dateStr, timeRange),
          systolic: avgSys,
          diastolic: avgDia,
          count: dayRecords.length
        })
      } else {
        dailyAvg.push({
          date: dateStr,
          label: formatDateDisplay(dateStr, timeRange),
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

  // 判断血压状态
  const getBPStatus = (sys: number, dia: number) => {
    if (sys < 120 && dia < 80) return { label: '正常', color: 'normal' }
    if (sys < 140 && dia < 90) return { label: '偏高', color: 'elevated' }
    return { label: '高血压', color: 'high' }
  }

  return (
    <ScrollView className='analysis-page' scrollY enhanced showScrollbar={false}>
      {/* 时间范围切换 */}
      <View className='time-tabs'>
        <View
          className={`time-tab ${timeRange === 'week' ? 'active' : ''}`}
          onClick={() => setTimeRange('week')}
        >
          <Text>近7天</Text>
        </View>
        <View
          className={`time-tab ${timeRange === 'month' ? 'active' : ''}`}
          onClick={() => setTimeRange('month')}
        >
          <Text>近30天</Text>
        </View>
      </View>

      {/* 图表卡片 */}
      <View className='chart-card'>
        <View className='chart-header'>
          <Text className='chart-title'>📈 血压趋势</Text>
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

        {chartData.some(d => d.systolic !== null) ? (
          <View className='chart-wrapper'>
            {/* Y轴 */}
            <View className='y-axis'>
              {yAxisTicks.map(tick => (
                <Text key={tick} className='y-tick'>{tick}</Text>
              ))}
            </View>

            {/* 图表区域 */}
            <View className='chart-area'>
              {/* 网格线 */}
              {yAxisTicks.map(tick => (
                <View
                  key={tick}
                  className='grid-line'
                  style={{ top: `${getYPercent(tick)}%` }}
                />
              ))}

              {/* 数据点和连接线 */}
              <View className='data-layer'>
                {chartData.map((point, index) => {
                  if (point.systolic === null) return null
                  
                  const xPercent = timeRange === 'week' 
                    ? (index / 6) * 100 
                    : (index / 29) * 100
                  const sysY = getYPercent(point.systolic)
                  const diaY = getYPercent(point.diastolic!)

                  // 找到下一个有数据的点来画线
                  let nextIndex = -1
                  for (let i = index + 1; i < chartData.length; i++) {
                    if (chartData[i].systolic !== null) {
                      nextIndex = i
                      break
                    }
                  }

                  return (
                    <View key={point.date}>
                      {/* 收缩压点 */}
                      <View
                        className='data-point systolic'
                        style={{ left: `${xPercent}%`, top: `${sysY}%` }}
                      >
                        <View className='point-inner' />
                        {timeRange === 'week' && (
                          <Text className='point-value'>{point.systolic}</Text>
                        )}
                      </View>

                      {/* 舒张压点 */}
                      <View
                        className='data-point diastolic'
                        style={{ left: `${xPercent}%`, top: `${diaY}%` }}
                      >
                        <View className='point-inner' />
                        {timeRange === 'week' && (
                          <Text className='point-value'>{point.diastolic}</Text>
                        )}
                      </View>

                      {/* 连接线（到下一个点） */}
                      {nextIndex !== -1 && (
                        <>
                          {/* 收缩压连接线 */}
                          <View
                            className='line systolic'
                            style={{
                              left: `${xPercent}%`,
                              top: `${sysY}%`,
                              width: `${((nextIndex - index) / (timeRange === 'week' ? 6 : 29)) * 100}%`,
                              transform: `rotate(${Math.atan2(
                                (getYPercent(chartData[nextIndex].systolic!) - sysY),
                                ((nextIndex - index) / (timeRange === 'week' ? 6 : 29)) * 100
                              ) * (180 / Math.PI)}deg)`
                            }}
                          />
                          {/* 舒张压连接线 */}
                          <View
                            className='line diastolic'
                            style={{
                              left: `${xPercent}%`,
                              top: `${diaY}%`,
                              width: `${((nextIndex - index) / (timeRange === 'week' ? 6 : 29)) * 100}%`,
                              transform: `rotate(${Math.atan2(
                                (getYPercent(chartData[nextIndex].diastolic!) - diaY),
                                ((nextIndex - index) / (timeRange === 'week' ? 6 : 29)) * 100
                              ) * (180 / Math.PI)}deg)`
                            }}
                          />
                        </>
                      )}
                    </View>
                  )
                })}
              </View>
            </View>
          </View>
        ) : (
          <View className='chart-empty'>
            <Text className='empty-icon'>📊</Text>
            <Text className='empty-text'>暂无数据</Text>
            <Text className='empty-hint'>记录血压后这里会显示趋势图</Text>
          </View>
        )}

        {/* X轴标签 */}
        {chartData.some(d => d.systolic !== null) && (
          <View className='x-axis'>
            {chartData.map((point, index) => {
              // 月视图只显示部分标签
              if (timeRange === 'month' && index % 5 !== 0 && index !== 29) return null
              
              return (
                <Text
                  key={point.date}
                  className={`x-label ${point.count > 0 ? 'has-data' : ''}`}
                  style={{
                    left: `${(index / (timeRange === 'week' ? 6 : 29)) * 100}%`
                  }}
                >
                  {point.label}
                </Text>
              )
            })}
          </View>
        )}
      </View>

      {/* 统计卡片 */}
      {totalAverage && (
        <View className='stats-card'>
          <View className='stats-header'>
            <Text className='stats-title'>📊 统计数据</Text>
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

      {/* 底部占位 */}
      <View className='bottom-spacer' />
    </ScrollView>
  )
}
