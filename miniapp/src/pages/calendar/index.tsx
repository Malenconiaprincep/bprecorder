import React, { useState, useMemo, useEffect, useRef } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { getRecords, BPRecord } from '../../lib/supabase'
import { getUserInfo } from '../../lib/auth'
import { USE_TEST_DATA, getTestData } from '../../utils/testData'
import RecordItem from '../../components/RecordItem'
import { getBPStatus, isBPNeedAttention } from '../../utils/bpStatus'
import './index.scss'

// 格式化日期为易读格式
const formatDateLabel = (isoString: string) => {
  const date = new Date(isoString)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  // 使用本地时间格式化日期，避免时区问题
  const dateStr = isoString.split('T')[0]
  const todayYear = today.getFullYear()
  const todayMonth = today.getMonth()
  const todayDay = today.getDate()
  const todayStr = `${todayYear}-${String(todayMonth + 1).padStart(2, '0')}-${String(todayDay).padStart(2, '0')}`

  const yesterdayYear = yesterday.getFullYear()
  const yesterdayMonth = yesterday.getMonth()
  const yesterdayDay = yesterday.getDate()
  const yesterdayStr = `${yesterdayYear}-${String(yesterdayMonth + 1).padStart(2, '0')}-${String(yesterdayDay).padStart(2, '0')}`

  if (dateStr === todayStr) return '今天'
  if (dateStr === yesterdayStr) return '昨天'

  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${month}月${day}日 ${weekDays[date.getDay()]}`
}

export default function Calendar() {
  const [records, setRecords] = useState<BPRecord[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date()) // 当前显示的月份
  const [selectedDate, setSelectedDate] = useState<string | null>(null) // 选中的日期
  const hasAutoSelectedRef = useRef(false) // 标记是否已经自动选中过今天

  // 获取每个日期的记录数量和状态（用于日历显示）
  const dateRecordInfo = useMemo(() => {
    const info: { [dateKey: string]: { count: number; hasAbnormal: boolean } } = {}
    records.forEach(r => {
      const dateKey = r.recorded_at.split('T')[0]
      if (!info[dateKey]) {
        info[dateKey] = { count: 0, hasAbnormal: false }
      }
      info[dateKey].count++
      // 判断是否有异常血压（高血压）
      const status = getBPStatus(r.systolic, r.diastolic)
      if (isBPNeedAttention(status)) {
        info[dateKey].hasAbnormal = true
      }
    })
    return info
  }, [records])

  // 生成当前月份的日历数据
  const calendarData = useMemo(() => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()

    // 获取当月第一天和最后一天
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)

    // 获取第一天是星期几（0=周日，1=周一...）
    const firstDayWeek = firstDay.getDay()
    // 转换为周一为0的格式
    const startOffset = firstDayWeek === 0 ? 6 : firstDayWeek - 1

    // 生成日历数组
    const days: Array<{ date: Date; dateKey: string; isCurrentMonth: boolean; count?: number; hasAbnormal?: boolean } | null> = []

    // 填充前面的空白
    for (let i = 0; i < startOffset; i++) {
      days.push(null)
    }

    // 填充当月的日期
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(year, month, day)
      // 使用本地时间格式化日期，避免时区问题
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const recordInfo = dateRecordInfo[dateKey]
      days.push({
        date,
        dateKey,
        isCurrentMonth: true,
        count: recordInfo?.count,
        hasAbnormal: recordInfo?.hasAbnormal
      })
    }

    return days
  }, [currentMonth, dateRecordInfo])

  // 切换月份：取消已选日期，避免仍显示上一月的某日数据
  const changeMonth = (direction: 'prev' | 'next') => {
    const newMonth = new Date(currentMonth)
    if (direction === 'prev') {
      newMonth.setMonth(newMonth.getMonth() - 1)
    } else {
      newMonth.setMonth(newMonth.getMonth() + 1)
    }
    setSelectedDate(null)
    hasAutoSelectedRef.current = false
    setCurrentMonth(newMonth)
  }

  // 获取选中日期的记录
  const selectedDateRecords = useMemo(() => {
    if (!selectedDate) return []
    return records
      .filter(r => r.recorded_at.split('T')[0] === selectedDate)
      .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
  }, [records, selectedDate])

  // 选择日期
  const handleDateSelect = (dateKey: string) => {
    const recordInfo = dateRecordInfo[dateKey]
    if (recordInfo && recordInfo.count > 0) {
      // 如果点击的是已选中的日期，取消选中
      if (selectedDate === dateKey) {
        setSelectedDate(null)
      } else {
        setSelectedDate(dateKey)
      }
    }
  }

  // 返回首页并传递选中的日期
  const handleBackToHome = () => {
    if (selectedDate) {
      // 使用全局变量传递选中的日期
      ; (global as any).__selectedDate = selectedDate
    }
    Taro.navigateBack({
      delta: 1
    })
  }

  useLoad(async () => {
    // 测试模式直接加载测试数据
    if (USE_TEST_DATA) {
      setRecords(getTestData())
      return
    }

    const storedUser = getUserInfo()
    if (storedUser) {
      await fetchRecords(storedUser.openid)
    }
  })

  const fetchRecords = async (userId: string) => {
    // 使用测试数据
    if (USE_TEST_DATA) {
      setRecords(getTestData())
      return
    }

    try {
      const { data, error } = await getRecords(userId)
      if (!error && data) {
        setRecords(data)
      }
    } catch (e) {
      console.error('Failed to fetch records', e)
    }
  }

  // 当前展示月份包含「今天」且今天有记录时，自动选中今天（翻月后会因 ref 重置再次生效）
  useEffect(() => {
    if (records.length === 0 || selectedDate !== null || hasAutoSelectedRef.current) return

    const today = new Date()
    const todayYear = today.getFullYear()
    const todayMonth = today.getMonth()
    const todayDay = today.getDate()
    const todayKey = `${todayYear}-${String(todayMonth + 1).padStart(2, '0')}-${String(todayDay).padStart(2, '0')}`

    const cy = currentMonth.getFullYear()
    const cm = currentMonth.getMonth()
    if (todayYear !== cy || todayMonth !== cm) return

    const todayRecordInfo = dateRecordInfo[todayKey]
    if (todayRecordInfo && todayRecordInfo.count > 0) {
      setSelectedDate(todayKey)
      hasAutoSelectedRef.current = true
    }
  }, [records, dateRecordInfo, selectedDate, currentMonth])

  return (
    <ScrollView className='calendar-page' scrollY enhanced showScrollbar={false}>
      {/* 月份导航 */}
      <View className='calendar-header'>
        <View className='calendar-nav-btn' onClick={() => changeMonth('prev')}>
          <Text className='calendar-nav-icon'>‹</Text>
        </View>
        <Text className='calendar-month-text'>
          {currentMonth.getFullYear()}年{currentMonth.getMonth() + 1}月
        </Text>
        <View className='calendar-nav-btn' onClick={() => changeMonth('next')}>
          <Text className='calendar-nav-icon'>›</Text>
        </View>
      </View>

      {/* 日历卡片容器 */}
      <View className='calendar-card'>
        {/* 星期标题 */}
        <View className='calendar-weekdays'>
          {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((day, idx) => (
            <View key={idx} className='calendar-weekday'>
              <Text className='calendar-weekday-text'>{day}</Text>
            </View>
          ))}
        </View>

        {/* 日期网格 */}
        <View className='calendar-days'>
          {calendarData.map((day, idx) => {
            if (!day) {
              return <View key={`empty-${idx}`} className='calendar-day-empty' />
            }

            const today = new Date()
            // 使用本地时间格式化日期，避免时区问题
            const todayYear = today.getFullYear()
            const todayMonth = today.getMonth()
            const todayDay = today.getDate()
            const todayKey = `${todayYear}-${String(todayMonth + 1).padStart(2, '0')}-${String(todayDay).padStart(2, '0')}`
            const isToday = day.dateKey === todayKey
            const hasRecords = day.count !== undefined && day.count > 0

            return (
              <View
                key={day.dateKey}
                className={`calendar-day-cell ${!day.isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${hasRecords ? 'has-records' : ''} ${day.hasAbnormal ? 'has-abnormal' : ''} ${selectedDate === day.dateKey ? 'selected' : ''}`}
                onClick={() => {
                  if (day.isCurrentMonth && hasRecords) {
                    handleDateSelect(day.dateKey)
                  }
                }}
              >
                <Text className={`calendar-day-number ${isToday ? 'today-text' : ''} ${!day.isCurrentMonth ? 'other-month-text' : ''}`}>
                  {day.date.getDate()}
                </Text>
                {isToday && (
                  <Text className='calendar-today-label'>今</Text>
                )}
                {hasRecords && day.count && day.count > 1 && (
                  <Text className='calendar-day-count'>{day.count}</Text>
                )}
              </View>
            )
          })}
        </View>

        {/* 图例 */}
        <View className='calendar-legend'>
          <View className='legend-item'>
            <View className='legend-dot today-dot' />
            <Text className='legend-text'>今天</Text>
          </View>
          <View className='legend-item'>
            <View className='legend-dot normal-dot' />
            <Text className='legend-text'>有记录</Text>
          </View>
          <View className='legend-item'>
            <View className='legend-dot abnormal-dot' />
            <Text className='legend-text'>异常</Text>
          </View>
        </View>
      </View>

      {/* 选中日期的记录列表 */}
      {selectedDate && selectedDateRecords.length > 0 && (
        <View className='selected-records-section'>
          <View className='selected-records-header'>
            <Text className='selected-records-title'>
              {formatDateLabel(selectedDate + 'T12:00:00')} 的记录
            </Text>
            <Text className='selected-records-count'>{selectedDateRecords.length} 条</Text>
          </View>
          <View className='selected-records-list'>
            {selectedDateRecords.map((record, idx) => (
              <RecordItem
                key={record.id || idx}
                record={record}
                showDivider={idx < selectedDateRecords.length - 1}
              />
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  )
}

