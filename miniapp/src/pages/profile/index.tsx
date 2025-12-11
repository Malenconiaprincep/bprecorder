import { useState, useMemo } from 'react'
import { View, Text, Image, Button, Input } from '@tarojs/components'
import Taro, { useLoad, useDidShow } from '@tarojs/taro'
import { logout, saveWxUserInfo, getWxUserInfo, WxUserInfo, wxLoginWithBackend, getUserInfo, silentLogin, uploadAvatar } from '../../lib/auth'
import { getRecords, BPRecord } from '../../lib/supabase'
import { USE_TEST_DATA, getTestData } from '../../utils/testData'
import './index.scss'
// @ts-ignore
import DEFAULT_AVATAR from '../../assets/icons/avatar.png'
// @ts-ignore
import iconGroups from '../../assets/icons/groups.png'
// @ts-ignore
import iconExport from '../../assets/icons/tray.png'
// @ts-ignore
import iconShare from '../../assets/icons/share.png'

export default function Profile() {
  const [wxUser, setWxUser] = useState<WxUserInfo | null>(null)
  const [openid, setOpenid] = useState<string>('')
  const [showModal, setShowModal] = useState(false)
  const [tempAvatar, setTempAvatar] = useState('')
  const [tempNickname, setTempNickname] = useState('')
  const [records, setRecords] = useState<BPRecord[]>([])

  // 判断是否已完善资料（有头像和昵称）
  const isProfileComplete = !!(wxUser?.avatarUrl && wxUser?.nickName)
  // 是否已登录（有真实 openid）- 测试模式下默认显示
  const hasOpenid = USE_TEST_DATA || !!openid

  // 计算统计数据
  const stats = useMemo(() => {
    const data = USE_TEST_DATA ? getTestData() : records

    if (data.length === 0) {
      return { recordDays: 0, totalRecords: 0, consecutiveDays: 0 }
    }

    // 记录天数（去重）
    const uniqueDays = new Set(data.map(r => r.recorded_at.split('T')[0]))
    const recordDays = uniqueDays.size

    // 总记录数
    const totalRecords = data.length

    // 计算连续打卡天数
    const sortedDays = Array.from(uniqueDays).sort((a, b) => b.localeCompare(a))
    let consecutiveDays = 0

    for (let i = 0; i < sortedDays.length; i++) {
      const expectedDate = new Date()
      expectedDate.setDate(expectedDate.getDate() - i)
      const expectedDateStr = expectedDate.toISOString().split('T')[0]

      if (sortedDays[i] === expectedDateStr) {
        consecutiveDays++
      } else {
        break
      }
    }

    return { recordDays, totalRecords, consecutiveDays }
  }, [records])

  // 获取记录数据
  const fetchRecords = async (userId: string) => {
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

  useLoad(async () => {
    // 测试模式下直接加载测试数据
    if (USE_TEST_DATA) {
      setRecords(getTestData())
    }

    // 加载已保存的微信用户信息
    const savedWxUser = getWxUserInfo()
    if (savedWxUser) {
      setWxUser(savedWxUser)
    }

    // 检查是否已有 openid（静默登录状态）
    const userInfo = getUserInfo()
    if (userInfo && userInfo.openid && !userInfo.openid.startsWith('wx_')) {
      setOpenid(userInfo.openid)
      // 获取记录数据
      await fetchRecords(userInfo.openid)
    } else {
      // 尝试静默登录
      const result = await silentLogin()
      if (result.success && result.userInfo) {
        setOpenid(result.userInfo.openid)
        // 获取记录数据
        await fetchRecords(result.userInfo.openid)
      }
    }
  })

  // 页面每次显示时刷新数据
  useDidShow(() => {
    if (USE_TEST_DATA) return

    const userInfo = getUserInfo()
    if (userInfo && userInfo.openid && !userInfo.openid.startsWith('wx_')) {
      fetchRecords(userInfo.openid)
    }
  })

  // 点击登录/完善资料
  const onClickLogin = async () => {
    // 如果还没有 openid，先静默登录
    if (!hasOpenid) {
      Taro.showLoading({ title: '登录中...' })
      try {
        const result = await silentLogin()
        if (result.success && result.userInfo) {
          setOpenid(result.userInfo.openid)

          // 检查后端是否返回了头像昵称
          if (result.userInfo.nickName && result.userInfo.avatarUrl) {
            // 已有完整资料，直接显示
            const wxUserInfo: WxUserInfo = {
              nickName: result.userInfo.nickName,
              avatarUrl: result.userInfo.avatarUrl
            }
            setWxUser(wxUserInfo)
            saveWxUserInfo(wxUserInfo)
            Taro.hideLoading()
            Taro.showToast({ title: '登录成功', icon: 'success' })
            return
          }
        } else {
          Taro.hideLoading()
          Taro.showToast({ title: result.error || '登录失败', icon: 'none' })
          return
        }
      } catch (e) {
        Taro.hideLoading()
        Taro.showToast({ title: '登录失败，请重试', icon: 'none' })
        return
      }
      Taro.hideLoading()
    }

    // 弹窗让用户完善资料
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
    Taro.showLoading({ title: '上传头像中...' })

    try {
      let finalAvatarUrl = tempAvatar

      // 如果是微信临时文件，先上传到服务器
      if (tempAvatar.startsWith('wxfile://') || tempAvatar.startsWith('http://tmp')) {
        const uploadResult = await uploadAvatar(tempAvatar, openid)
        if (uploadResult.success && uploadResult.url) {
          finalAvatarUrl = uploadResult.url
        } else {
          Taro.hideLoading()
          Taro.showToast({ title: uploadResult.error || '头像上传失败', icon: 'none' })
          return
        }
      }

      Taro.showLoading({ title: '保存中...' })

      // 调用后端接口保存头像和昵称
      const result = await wxLoginWithBackend(tempNickname, finalAvatarUrl)

      if (result.success) {
        const newWxUser: WxUserInfo = {
          avatarUrl: finalAvatarUrl,
          nickName: tempNickname
        }
        setWxUser(newWxUser)
        saveWxUserInfo(newWxUser)
        if (result.userInfo?.openid) {
          setOpenid(result.userInfo.openid)
        }
        setShowModal(false)
        Taro.showToast({ title: '保存成功', icon: 'success' })
      } else {
        Taro.showToast({ title: result.error || '保存失败', icon: 'none' })
      }
    } catch (e: any) {
      console.error('Save profile error:', e)
      Taro.showToast({ title: '保存失败，请重试', icon: 'none' })
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
    setOpenid('')
    Taro.showToast({ title: '已退出登录', icon: 'success' })
  }

  const showDevTip = () => {
    Taro.showToast({ title: '功能开发中，敬请期待', icon: 'none' })
  }

  const goToGroups = () => {
    Taro.navigateTo({ url: '/pages/groups/index' })
  }

  const menuItems = [
    { title: '我的组', icon: iconGroups, onClick: goToGroups },
    { title: '数据导出', icon: iconExport, onClick: showDevTip },
    { title: '提醒设置', icon: iconShare, onClick: showDevTip },
  ]

  return (
    <View className='page'>
      {/* 用户信息卡片 */}
      <View className='user-card' onClick={!isProfileComplete ? onClickLogin : undefined}>
        <Image
          className={`avatar-img-display ${wxUser?.avatarUrl ? '' : 'default-avatar'}`}
          src={wxUser?.avatarUrl || DEFAULT_AVATAR}
          mode='aspectFill'
          onClick={isProfileComplete ? onClickLogin : undefined}
        />
        <View className='user-info'>
          <Text className='user-name'>{wxUser?.nickName || (hasOpenid ? '点击完善资料' : '点击登录')}</Text>
          <Text className='user-desc'>
            {isProfileComplete ? '记录健康，关爱自己' : (hasOpenid ? `ID: ${openid.slice(0, 8)}...` : '登录后同步你的数据')}
          </Text>
        </View>
      </View>

      {/* 完善资料弹窗 */}
      {showModal && (
        <View className='modal-mask' onClick={onCancel}>
          <View className='modal-content' onClick={(e) => e.stopPropagation()}>
            <Text className='modal-title'>完善个人资料</Text>

            {/* 头像选择 */}
            <Button className='avatar-picker' openType='chooseAvatar' onChooseAvatar={onChooseAvatar}>
              <Image className='avatar-preview' src={tempAvatar || DEFAULT_AVATAR} mode='aspectFill' />
              {!tempAvatar && <Text className='avatar-hint'>点击更换头像</Text>}
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

      {/* 统计卡片 - 有 openid 就显示 */}
      {hasOpenid && (
        <View className='stats-card'>
          <View className='stat-item'>
            <Text className='stat-value'>{stats.recordDays}</Text>
            <Text className='stat-label'>记录天数</Text>
          </View>
          <View className='stat-divider' />
          <View className='stat-item'>
            <Text className='stat-value'>{stats.totalRecords}</Text>
            <Text className='stat-label'>总记录数</Text>
          </View>
          <View className='stat-divider' />
          <View className='stat-item'>
            <Text className='stat-value'>{stats.consecutiveDays}</Text>
            <Text className='stat-label'>连续打卡</Text>
          </View>
        </View>
      )}

      {/* 菜单列表 */}
      <View className='menu-card'>
        {menuItems.map((item, index) => (
          <View key={index} className='menu-item' onClick={item.onClick}>
            <Image className='menu-icon' src={item.icon} mode='aspectFit' />
            <Text className='menu-title'>{item.title}</Text>
            <Text className='menu-arrow'>›</Text>
          </View>
        ))}
      </View>

      {/* 退出登录 - 有 openid 就显示 */}
      {hasOpenid && (
        <View className='logout-btn' onClick={handleLogout}>
          <Text className='logout-text'>退出登录</Text>
        </View>
      )}

      {/* 版本号 */}
      <View className='version-info'>
        <Text className='version-text'>v1.3.4</Text>
      </View>
    </View>
  )
}

