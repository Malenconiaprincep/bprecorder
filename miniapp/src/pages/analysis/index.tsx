import React, { useState } from 'react'
import { View, Text } from '@tarojs/components'
import { useLoad } from '@tarojs/taro'
import { getRecords, BPRecord } from '../../lib/supabase'
import { getUserInfo } from '../../lib/auth'
import './index.scss'

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

  // 计算平均值
  const getAverage = () => {
    if (records.length === 0) return { systolic: 0, diastolic: 0, pulse: 0 }
    
    const sum = records.reduce((acc, r) => ({
      systolic: acc.systolic + r.systolic,
      diastolic: acc.diastolic + r.diastolic,
      pulse: acc.pulse + r.pulse
    }), { systolic: 0, diastolic: 0, pulse: 0 })

    return {
      systolic: Math.round(sum.systolic / records.length),
      diastolic: Math.round(sum.diastolic / records.length),
      pulse: Math.round(sum.pulse / records.length)
    }
  }

  const avg = getAverage()

  return (
    <View className='analysis-page'>
      {/* 时间范围切换 */}
      <View className='time-tabs'>
        <View 
          className={`time-tab ${timeRange === 'week' ? 'active' : ''}`}
          onClick={() => setTimeRange('week')}
        >
          <Text>本周趋势</Text>
        </View>
        <View 
          className={`time-tab ${timeRange === 'month' ? 'active' : ''}`}
          onClick={() => setTimeRange('month')}
        >
          <Text>本月趋势</Text>
        </View>
      </View>

      {/* 图表区域 */}
      <View className='chart-card'>
        <View className='chart-legend'>
          <View className='legend-item'>
            <View className='legend-dot systolic' />
            <Text className='legend-text'>收缩压</Text>
          </View>
          <View className='legend-item'>
            <View className='legend-dot diastolic' />
            <Text className='legend-text'>心率</Text>
          </View>
        </View>
        
        <View className='chart-area'>
          {/* 简化的图表展示 */}
          <View className='chart-placeholder'>
            <Text className='chart-text'>图表功能开发中</Text>
            <Text className='chart-hint'>共 {records.length} 条记录</Text>
          </View>
        </View>
      </View>

      {/* 平均血压卡片 */}
      <View className='avg-card'>
        <Text className='avg-title'>平均血压</Text>
        <View className='avg-content'>
          <View className='avg-main'>
            <Text className='avg-number'>{avg.systolic} / {avg.diastolic}</Text>
            <Text className='avg-unit'>mmHg</Text>
          </View>
          <Text className='avg-label'>收缩压 / 舒张压 (心率)</Text>
        </View>
      </View>
    </View>
  )
}

