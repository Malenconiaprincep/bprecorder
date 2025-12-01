import React from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { getUserInfo, logout } from '../../lib/auth'
import './index.scss'

export default function Profile() {
  const userInfo = getUserInfo()

  const handleLogout = () => {
    logout()
    Taro.showToast({ title: '已退出登录', icon: 'success' })
  }

  const menuItems = [
    { title: '历史记录', icon: '📋', onClick: () => {} },
    { title: '数据导出', icon: '📤', onClick: () => {} },
    { title: '提醒设置', icon: '⏰', onClick: () => {} },
    { title: '关于我们', icon: 'ℹ️', onClick: () => {} },
  ]

  return (
    <View className='page'>
      {/* 用户信息卡片 */}
      <View className='user-card'>
        <View className='avatar'>
          <Text className='avatar-text'>👤</Text>
        </View>
        <View className='user-info'>
          <Text className='user-name'>{userInfo?.openid ? '用户' + userInfo.openid.slice(-4) : '未登录'}</Text>
          <Text className='user-desc'>记录健康，关爱自己</Text>
        </View>
      </View>

      {/* 统计卡片 */}
      <View className='stats-card'>
        <View className='stat-item'>
          <Text className='stat-value'>0</Text>
          <Text className='stat-label'>记录天数</Text>
        </View>
        <View className='stat-divider' />
        <View className='stat-item'>
          <Text className='stat-value'>0</Text>
          <Text className='stat-label'>总记录数</Text>
        </View>
        <View className='stat-divider' />
        <View className='stat-item'>
          <Text className='stat-value'>0</Text>
          <Text className='stat-label'>连续打卡</Text>
        </View>
      </View>

      {/* 菜单列表 */}
      <View className='menu-card'>
        {menuItems.map((item, index) => (
          <View key={index} className='menu-item' onClick={item.onClick}>
            <Text className='menu-icon'>{item.icon}</Text>
            <Text className='menu-title'>{item.title}</Text>
            <Text className='menu-arrow'>›</Text>
          </View>
        ))}
      </View>

      {/* 退出登录 */}
      <View className='logout-btn' onClick={handleLogout}>
        <Text className='logout-text'>退出登录</Text>
      </View>
    </View>
  )
}

