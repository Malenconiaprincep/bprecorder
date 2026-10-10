import React from 'react'
import { View, Text } from '@tarojs/components'
// import { EChart } from 'echarts-taro3-react' // 暂时移除
import './BPChart.scss'

interface Record {
  id: number
  systolic: number
  diastolic: number
  pulse: number
  recorded_at: string
}

interface BPChartProps {
  records: Record[]
}

export default function BPChart({ records }: BPChartProps) {
  // 翻转数据顺序，保证时间正序
  const sortedRecords = [...records].reverse()
  
  // 暂时屏蔽 ECharts 渲染，待手动封装或找到合适的库
  return (
    <View className='bp-chart-container h-64 w-full bg-gray-100 flex items-center justify-center rounded-lg'>
        <Text className='text-gray-400'>
            图表功能维护中 (记录数: {records.length})
        </Text>
    </View>
  )
}
