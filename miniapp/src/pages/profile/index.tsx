import React, { useState } from 'react'
import { View, Text, Image, Button, Input } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { logout, saveWxUserInfo, getWxUserInfo, WxUserInfo, wxLoginWithBackend } from '../../lib/auth'
import './index.scss'

export default function Profile() {
  const [wxUser, setWxUser] = useState<WxUserInfo | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [tempAvatar, setTempAvatar] = useState('')
  const [tempNickname, setTempNickname] = useState('')

  // 判断是否已登录（有头像和昵称才算完成登录）
  const isLoggedIn = !!(wxUser?.avatarUrl && wxUser?.nickName)

  useLoad(() => {
    // 加载已保存的微信用户信息
    const savedWxUser = getWxUserInfo()
    if (savedWxUser) {
      setWxUser(savedWxUser)
    }
  })

  // 点击登录，显示弹窗
  const onClickLogin = () => {
    setTempAvatar(wxUser?.avatarUrl || '')
    setTempNickname(wxUser?.nickName || '')
    setShowModal(true)
  }

  // 选择头像
  const onChooseAvatar = (e: any) => {
    const avatarUrl = e.detail.avatarUrl
    setTempAvatar(avatarUrl)
  }

  // 输入昵称
  const onInputNickname = (e: any) => {
    setTempNickname(e.detail.value)
  }

  // 确认保存
  const onConfirm = async () => {
    if (!tempAvatar) {
      Taro.showToast({ title: '请选择头像', icon: 'none' })
      return
    }
    if (!tempNickname) {
      Taro.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    
    // 显示加载提示
    Taro.showLoading({ title: '登录中...' })
    
    try {
      // 调用后端接口，一次性获取 openid 并保存头像和昵称
      const result = await wxLoginWithBackend(tempNickname, tempAvatar)
      
      if (result.success) {
        const newWxUser: WxUserInfo = {
          avatarUrl: tempAvatar,
          nickName: tempNickname
        }
        setWxUser(newWxUser)
        saveWxUserInfo(newWxUser)
        setShowModal(false)
        Taro.showToast({ title: '登录成功', icon: 'success' })
      } else {
        Taro.showToast({ title: result.error || '登录失败', icon: 'none' })
      }
    } catch (e: any) {
      console.error('Login error:', e)
      Taro.showToast({ title: '登录失败，请重试', icon: 'none' })
    } finally {
      Taro.hideLoading()
    }
  }

  // 取消
  const onCancel = () => {
    setShowModal(false)
  }

  const handleLogout = () => {
    logout()
    setWxUser(null)
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
      <View className='user-card' onClick={!isLoggedIn ? onClickLogin : undefined}>
        {wxUser?.avatarUrl ? (
          <Image className='avatar-img-display' src={wxUser.avatarUrl} mode='aspectFill' onClick={isLoggedIn ? onClickLogin : undefined} />
        ) : (
          <View className='avatar'>
            <Text className='avatar-text'>👤</Text>
          </View>
        )}
        <View className='user-info'>
          <Text className='user-name'>{wxUser?.nickName || '点击登录'}</Text>
          <Text className='user-desc'>
            {isLoggedIn ? '记录健康，关爱自己' : '点击完成微信授权登录'}
          </Text>
        </View>
      </View>

      {/* 登录弹窗 */}
      {showModal && (
        <View className='modal-mask' onClick={onCancel}>
          <View className='modal-content' onClick={(e) => e.stopPropagation()}>
            <Text className='modal-title'>完善个人信息</Text>
            
            {/* 头像选择 */}
            <Button className='avatar-picker' openType='chooseAvatar' onChooseAvatar={onChooseAvatar}>
              {tempAvatar ? (
                <Image className='avatar-preview' src={tempAvatar} mode='aspectFill' />
              ) : (
                <View className='avatar-placeholder'>
                  <Text className='avatar-placeholder-text'>点击选择头像</Text>
                </View>
              )}
            </Button>

            {/* 昵称输入 */}
            <Input
              className='nickname-field'
              type='nickname'
              placeholder='点击输入昵称'
              value={tempNickname}
              onInput={onInputNickname}
            />

            {/* 按钮 */}
            <View className='modal-buttons'>
              <View className='modal-btn cancel' onClick={onCancel}>
                <Text>取消</Text>
              </View>
              <View className='modal-btn confirm' onClick={onConfirm}>
                <Text>确认</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* 统计卡片 - 只有登录后显示 */}
      {isLoggedIn && (
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
      )}

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

      {/* 退出登录 - 只有登录后显示 */}
      {isLoggedIn && (
        <View className='logout-btn' onClick={handleLogout}>
          <Text className='logout-text'>退出登录</Text>
        </View>
      )}
    </View>
  )
}

