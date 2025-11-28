import React, { useState } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { getRecords, BPRecord } from '../../lib/supabase'
import { wxLogin, logout, getUserInfo, UserInfo } from '../../lib/auth'
import './index.scss'

// 图标
import iconHome from '../../assets/icons/home.png'
import iconAnalyse from '../../assets/icons/analyse.png'
import iconWode from '../../assets/icons/wode.png'
import iconCamera from '../../assets/icons/xiangji.png'
import iconEdit from '../../assets/icons/jianpanshuru.png'

export default function Index() {
  const [records, setRecords] = useState<BPRecord[]>([])
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)

  const latestRecord = records.length > 0 ? records[0] : null

  useLoad(() => {
    initPage()
  })

  const initPage = async () => {
    const storedUser = getUserInfo()
    if (storedUser) {
      setUserInfo(storedUser)
      await fetchRecords(storedUser.openid)
    } else {
      await autoLogin()
    }
  }

  const autoLogin = async () => {
    try {
      const result = await wxLogin()
      if (result.success && result.userInfo) {
        setUserInfo(result.userInfo)
        await fetchRecords(result.userInfo.openid)
      }
    } catch (e) {
      console.log('Auto login failed:', e)
    }
  }

  const fetchRecords = async (userId: string) => {
    try {
      const { data, error } = await getRecords(userId)
      if (!error && data) {
        setRecords(data)
      }
    } catch (e) {
      console.error('Failed to fetch records', e)
    }
  }

  const goToInput = () => {
    Taro.navigateTo({ url: '/pages/input/index' })
  }

  const goToCamera = () => {
    Taro.navigateTo({ url: '/pages/camera/index' })
  }

  return (
    <View className='page'>
      {/* 顶部蓝色弧形背景 */}
      <View className='bg-curve' />

      {/* 头部 */}
      <View className='header'>
        <Text className='title'>首页</Text>
      </View>

      {/* 今日血压卡片 */}
      <View className='bp-card'>
        <View className='card-header'>
          <Text className='card-title'>今日血压</Text>
          <Text className='card-icon'>💓</Text>
        </View>

        {latestRecord ? (
          <View className='card-body'>
            <View className='bp-row'>
              <Text className='bp-value'>{latestRecord.systolic}</Text>
              <Text className='bp-slash'>/</Text>
              <Text className='bp-value'>{latestRecord.diastolic}</Text>
              <Text className='bp-unit'>mmHg</Text>
            </View>
            <Text className='bp-desc'>收缩压 / 舒张压</Text>
            <View className='pulse-row'>
              <Text className='pulse-value'>{latestRecord.pulse}</Text>
              <Text className='pulse-unit'>bpm 心率</Text>
            </View>
          </View>
        ) : (
          <View className='card-empty'>
            <Text className='empty-text'>暂无今日数据</Text>
            <Text className='empty-hint'>点击下方按钮添加记录</Text>
          </View>
        )}
      </View>

      {/* 趋势卡片 */}
      <View className='trend-card'>
        <Text className='trend-title'>今日趋势</Text>
        <View className='trend-bars'>
          {['一', '二', '三', '四', '五', '六', '日'].map((day, i) => (
            <View key={i} className='bar-item'>
              <View className='bar' style={{ height: records[i] ? `${records[i].systolic / 3}rpx` : '20rpx' }} />
              <Text className='bar-label'>周{day}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 操作按钮 */}
      <View className='actions'>
        <View className='action-btn blue' onClick={goToCamera}>
          <Image className='action-icon' src={iconCamera} mode='aspectFit' />
          <Text className='action-text-white'>拍照输入</Text>
        </View>
        <View className='action-btn white' onClick={goToInput}>
          <Image className='action-icon' src={iconEdit} mode='aspectFit' />
          <Text className='action-text-dark'>手动输入</Text>
        </View>
      </View>

      {/* 底部导航 */}
      <View className='tabbar'>
        <View className='tab active'>
          <Image className='tab-icon' src={iconHome} mode='aspectFit' />
          <Text className='tab-text active'>首页</Text>
        </View>
        <View className='tab'>
          <Image className='tab-icon' src={iconAnalyse} mode='aspectFit' />
          <Text className='tab-text'>分析</Text>
        </View>
        <View className='tab'>
          <Image className='tab-icon' src={iconWode} mode='aspectFit' />
          <Text className='tab-text'>设置</Text>
        </View>
      </View>
    </View>
  )
}
