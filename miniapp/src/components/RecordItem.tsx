import React from 'react'
import { View, Text, Image } from '@tarojs/components'
import { BPRecord } from '../lib/supabase'
// @ts-ignore
import iconHeart from '../assets/icons/heart.png'
import './RecordItem.scss'

// 血压状态判断（按医学标准）
const getBPStatus = (systolic: number, diastolic: number) => {
  // 3级高血压（重度）
  if (systolic >= 180 || diastolic >= 110) {
    return { label: '3级高血压', color: 'high-3', emoji: '🆘' }
  }
  // 2级高血压（中/重度）
  if (systolic >= 160 || diastolic >= 100) {
    return { label: '2级高血压', color: 'high-2', emoji: '😰' }
  }
  // 1级高血压（轻度）
  if (systolic >= 140 || diastolic >= 90) {
    return { label: '1级高血压', color: 'high-1', emoji: '😟' }
  }
  // 前期高血压
  if (systolic >= 130) {
    return { label: '前期高血压', color: 'prehigh', emoji: '😐' }
  }
  // 正常血压
  if (systolic >= 120 || diastolic >= 80) {
    return { label: '正常', color: 'normal', emoji: '🙂' }
  }
  // 理想血压
  return { label: '理想', color: 'ideal', emoji: '😊' }
}

// 格式化日期时间用于记录项显示
const formatRecordDateTime = (isoString: string) => {
  const date = new Date(isoString)
  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${month}月${day}日 ${weekDays[date.getDay()]} ${hours}:${minutes}`
}

interface RecordItemProps {
  record: BPRecord
  showDivider?: boolean
  onClick?: () => void
}

export default function RecordItem({ record, showDivider = false, onClick }: RecordItemProps) {
  const status = getBPStatus(record.systolic, record.diastolic)
  const dateTime = formatRecordDateTime(record.recorded_at)

  return (
    <View
      className={`record-item ${showDivider ? 'has-divider' : ''}`}
      onClick={onClick}
    >
      {/* 顶部：血压值 + 心率 + 状态标签（右上角） */}
      <View className='record-top'>
        <View className='record-bp-section'>
          <View className='bp-display'>
            <Text className='bp-num systolic'>{record.systolic}</Text>
            <Text className='bp-divider'>/</Text>
            <Text className='bp-num diastolic'>{record.diastolic}</Text>
          </View>
          <View className='pulse-display'>
            <Image className='pulse-icon' src={iconHeart} mode='aspectFit' />
            <Text className='pulse-num'>{record.pulse}</Text>
          </View>
        </View>
        <View className={`status-badge ${status.color}`}>
          <Text className='badge-text'>{status.label}</Text>
        </View>
      </View>

      {/* 中间：日期时间和左右手信息 */}
      <View className='record-middle'>
        <Text className='datetime-text'>{dateTime}</Text>
        {record.hand && (
          <Text className='bottom-info-text'>
            {record.hand === 'left' ? '左' : '右'}臂
          </Text>
        )}
      </View>
      {/* 备注单独一行 */}
      {record.note && (
        <View className='record-note-row'>
          <Text className='note-text'>备注：{record.note}</Text>
        </View>
      )}
    </View>
  )
}

