import React, { useState, useMemo } from 'react'
import { View, Text, Image, ScrollView, Canvas, Button } from '@tarojs/components'
import Taro, { useLoad, useDidShow, useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { getRecords, BPRecord, addRecord, deleteRecord } from '../../lib/supabase'
import { silentLogin, getUserInfo, UserInfo } from '../../lib/auth'
import { API_BASE_URL } from '../../utils/api'
import { generateShareImage } from '../../utils/shareImage'
import { getMyGroups, Group } from '../../lib/groups'
import './index.scss'

// 图标
// @ts-ignore
import iconCamera from '../../assets/icons/camera.png'
// @ts-ignore
import iconEdit from '../../assets/icons/note.png'
// @ts-ignore
import iconHeart from '../../assets/icons/heart.png'
// @ts-ignore
import iconChart from '../../assets/icons/chart.png'
// @ts-ignore
import iconList from '../../assets/icons/list.png'
// @ts-ignore
import iconShare from '../../assets/icons/share.png'
// @ts-ignore
import iconGroups from '../../assets/icons/groups.png'

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

// 格式化时间为易读格式
const formatTime = (isoString: string) => {
  const date = new Date(isoString)
  const hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, '0')

  let period = ''
  if (hours < 6) period = '凌晨'
  else if (hours < 12) period = '上午'
  else if (hours < 14) period = '中午'
  else if (hours < 18) period = '下午'
  else period = '晚上'

  const displayHour = hours > 12 ? hours - 12 : hours
  return `${period} ${displayHour}:${minutes}`
}

// 格式化日期为易读格式
const formatDateLabel = (isoString: string) => {
  const date = new Date(isoString)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const dateStr = isoString.split('T')[0]
  const todayStr = today.toISOString().split('T')[0]
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  if (dateStr === todayStr) return '今天'
  if (dateStr === yesterdayStr) return '昨天'

  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${month}月${day}日 ${weekDays[date.getDay()]}`
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

// 测试数据
import { USE_TEST_DATA, getTestData } from '../../utils/testData'

export default function Index() {
  const [records, setRecords] = useState<BPRecord[]>([])
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeResult, setAnalyzeResult] = useState<{
    systolic: number
    diastolic: number
    pulse: number
  } | null>(null)
  const [showResultModal, setShowResultModal] = useState(false)
  const [selectedHand, setSelectedHand] = useState<'left' | 'right'>('left')
  const [shareImageUrl, setShareImageUrl] = useState<string>('')
  const [myGroups, setMyGroups] = useState<Group[]>([])

  const latestRecord = records.length > 0 ? records[0] : null
  const previousRecord = records.length > 1 ? records[1] : null

  // 计算血压差
  const bpDifference = useMemo(() => {
    if (!latestRecord || !previousRecord) return null
    return {
      systolic: latestRecord.systolic - previousRecord.systolic,
      diastolic: latestRecord.diastolic - previousRecord.diastolic
    }
  }, [latestRecord, previousRecord])

  // 按日期分组记录
  const groupedRecords = useMemo(() => {
    const groups: { dateLabel: string; dateKey: string; records: BPRecord[] }[] = []
    const groupMap: { [key: string]: BPRecord[] } = {}

    records.forEach(r => {
      const dateKey = r.recorded_at.split('T')[0]
      if (!groupMap[dateKey]) {
        groupMap[dateKey] = []
      }
      groupMap[dateKey].push(r)
    })

    // 按日期排序（最新的在前）
    const sortedDates = Object.keys(groupMap).sort((a, b) => b.localeCompare(a))

    sortedDates.forEach(dateKey => {
      const firstRecord = groupMap[dateKey][0]
      groups.push({
        dateLabel: formatDateLabel(firstRecord.recorded_at),
        dateKey,
        records: groupMap[dateKey].sort((a, b) =>
          new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
        )
      })
    })

    return groups
  }, [records])

  // 计算本周平均值
  const weeklyAverage = useMemo(() => {
    if (records.length === 0) return null

    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const weekRecords = records.filter(r => new Date(r.recorded_at) >= weekAgo)
    if (weekRecords.length === 0) return null

    const avgSystolic = Math.round(weekRecords.reduce((sum, r) => sum + r.systolic, 0) / weekRecords.length)
    const avgDiastolic = Math.round(weekRecords.reduce((sum, r) => sum + r.diastolic, 0) / weekRecords.length)

    return { systolic: avgSystolic, diastolic: avgDiastolic, count: weekRecords.length }
  }, [records])

  // 标记是否已初始化，避免重复调用
  const [initialized, setInitialized] = useState(false)

  useLoad(() => {
    initPage()
  })

  // 页面每次显示时刷新数据（从输入页返回时，跳过首次）
  useDidShow(() => {
    if (USE_TEST_DATA) return
    if (!initialized) return // 首次加载由 useLoad 处理

    const storedUser = getUserInfo()
    if (storedUser) {
      fetchRecords(storedUser.openid)
      fetchGroups(storedUser.openid)
    }
  })

  // 分享小程序给朋友
  useShareAppMessage(() => {
    const shareTitle = latestRecord
      ? `我的最新血压：${latestRecord.systolic}/${latestRecord.diastolic} mmHg`
      : '血压记录助手 - 轻松记录，健康管理'

    return {
      title: shareTitle,
      path: '/pages/index/index',
      imageUrl: shareImageUrl || '' // 使用生成的分享图片
    }
  })

  // 分享小程序到朋友圈
  useShareTimeline(() => {
    const shareTitle = latestRecord
      ? `我的最新血压：${latestRecord.systolic}/${latestRecord.diastolic} mmHg`
      : '血压记录助手 - 轻松记录，健康管理'

    return {
      title: shareTitle,
      imageUrl: shareImageUrl || '' // 使用生成的分享图片
    }
  })

  const initPage = async () => {
    // 测试模式直接加载测试数据
    if (USE_TEST_DATA) {
      setRecords(getTestData())
      setInitialized(true)
      return
    }

    const storedUser = getUserInfo()
    if (storedUser) {
      setUserInfo(storedUser)
      await fetchRecords(storedUser.openid)
      await fetchGroups(storedUser.openid)
    } else {
      await autoLogin()
    }
    setInitialized(true)
  }

  const autoLogin = async () => {
    try {
      // 静默登录获取 openid
      const result = await silentLogin()
      if (result.success && result.userInfo) {
        setUserInfo(result.userInfo)
        await fetchRecords(result.userInfo.openid)
        await fetchGroups(result.userInfo.openid)
      } else {
        console.log('Silent login failed:', result.error)
      }
    } catch (e) {
      console.log('Auto login failed:', e)
    }
  }

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

  const fetchGroups = async (userId: string) => {
    if (USE_TEST_DATA) return

    try {
      const result = await getMyGroups(userId)
      if (result.success && result.groups) {
        setMyGroups(result.groups)
      }
    } catch (e) {
      console.error('Failed to fetch groups', e)
    }
  }

  // 检查登录状态，未登录则提示
  const checkLoginAndProceed = (callback: () => void) => {
    // 测试模式下直接执行
    if (USE_TEST_DATA) {
      callback()
      return
    }

    if (!userInfo) {
      Taro.showModal({
        title: '需要登录',
        content: '请先登录后再记录血压数据',
        confirmText: '去登录',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            Taro.switchTab({ url: '/pages/profile/index' })
          }
        }
      })
      return
    }
    callback()
  }

  const goToInput = () => {
    checkLoginAndProceed(() => {
      Taro.navigateTo({ url: '/pages/input/index' })
    })
  }

  const goToCamera = async () => {
    checkLoginAndProceed(async () => {
      try {
        // 直接拉起相机或相册
        const res = await Taro.chooseImage({
          count: 1,
          sizeType: ['compressed'],
          sourceType: ['album', 'camera']
        })

        const tempFilePath = res.tempFilePaths[0]

        // 开始分析
        setAnalyzing(true)
        await analyzeImage(tempFilePath)
      } catch (e) {
        console.log('User cancelled or error:', e)
      }
    })
  }

  const analyzeImage = async (filePath: string) => {
    try {
      // 上传图片到 analyze API
      const uploadRes = await Taro.uploadFile({
        url: `${API_BASE_URL}/api/analyze`,
        filePath: filePath,
        name: 'file',
        header: {
          'Content-Type': 'multipart/form-data'
        }
      })

      if (uploadRes.statusCode !== 200) {
        throw new Error('上传失败')
      }

      const result = JSON.parse(uploadRes.data)

      // 检查是否有错误
      if (result.error) {
        Taro.showToast({
          title: result.error || '识别失败',
          icon: 'none',
          duration: 2000
        })
        setAnalyzing(false)
        return
      }

      // 显示识别结果
      setAnalyzeResult({
        systolic: result.systolic,
        diastolic: result.diastolic,
        pulse: result.pulse
      })
      setShowResultModal(true)
      setAnalyzing(false)
    } catch (e: any) {
      console.error('Analyze error:', e)
      Taro.showToast({
        title: e.message || '识别失败，请重试',
        icon: 'none',
        duration: 2000
      })
      setAnalyzing(false)
    }
  }

  const handleSaveRecord = async () => {
    if (!analyzeResult || !userInfo) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    const recordedAt = new Date().toISOString()

    try {
      const { error } = await addRecord({
        user_id: userInfo.openid,
        systolic: analyzeResult.systolic,
        diastolic: analyzeResult.diastolic,
        pulse: analyzeResult.pulse,
        recorded_at: recordedAt,
        hand: selectedHand
      })

      if (error) {
        Taro.showToast({ title: error, icon: 'none' })
      } else {
        Taro.showToast({ title: '保存成功', icon: 'success' })
        setShowResultModal(false)

        // 生成分享图片
        try {
          const imageUrl = await generateShareImage(
            analyzeResult.systolic,
            analyzeResult.diastolic,
            analyzeResult.pulse,
            recordedAt
          )
          setShareImageUrl(imageUrl)
        } catch (e) {
          console.error('生成分享图片失败:', e)
        }

        setAnalyzeResult(null)
        // 刷新记录列表
        await fetchRecords(userInfo.openid)
      }
    } catch (e) {
      Taro.showToast({ title: '保存失败', icon: 'none' })
    }
  }

  const handleCloseModal = () => {
    setShowResultModal(false)
    setAnalyzeResult(null)
  }

  const handleModalContentClick = (e: any) => {
    // 阻止事件冒泡，防止点击模态框内容时关闭弹窗
    e.stopPropagation && e.stopPropagation()
  }

  // 处理记录点击（编辑/删除）
  const handleRecordAction = (record: BPRecord) => {
    Taro.showActionSheet({
      itemList: ['编辑记录', '删除记录'],
      itemColor: '#1e293b',
      success: async (res) => {
        if (res.tapIndex === 0) {
          // 编辑
          const params = new URLSearchParams({
            id: String(record.id),
            systolic: String(record.systolic),
            diastolic: String(record.diastolic),
            pulse: String(record.pulse),
            hand: record.hand || '',
            note: encodeURIComponent(record.note || '')
          })
          Taro.navigateTo({ url: `/pages/input/index?${params.toString()}` })
        } else if (res.tapIndex === 1) {
          // 删除确认
          const confirmRes = await Taro.showModal({
            title: '确认删除',
            content: '删除后无法恢复，确定要删除这条记录吗？',
            confirmText: '删除',
            confirmColor: '#ef4444'
          })

          if (confirmRes.confirm && record.id) {
            Taro.showLoading({ title: '删除中...' })
            const { error } = await deleteRecord(record.id)
            Taro.hideLoading()

            if (error) {
              Taro.showToast({ title: error, icon: 'none' })
            } else {
              Taro.showToast({ title: '已删除', icon: 'success' })
              // 刷新列表
              if (userInfo) {
                fetchRecords(userInfo.openid)
              }
            }
          }
        }
      }
    })
  }

  return (
    <>
      {/* 隐藏的 Canvas，用于生成分享图片 */}
      <Canvas
        canvasId='shareCanvas'
        style={{
          position: 'fixed',
          top: '-9999px',
          left: '-9999px',
          width: '750px',
          height: '600px'
        }}
        disableScroll
      />

      <ScrollView className='page' scrollY enhanced showScrollbar={false}>
        {/* 顶部蓝色弧形背景 */}
        <View className='bg-curve' />

        {/* 操作按钮 - 放在最顶部，最显眼 */}
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

        {/* 今日血压卡片 */}
        <View className='bp-card'>
          <View className='card-header'>
            <View className='card-title'><Image className='title-icon' src={iconHeart} mode='aspectFit' /><Text>最新血压</Text></View>
            <View className='card-header-right'>
              {latestRecord && (
                <View className={`card-status ${getBPStatus(latestRecord.systolic, latestRecord.diastolic).color}`}>
                  <Text className='card-status-text'>{getBPStatus(latestRecord.systolic, latestRecord.diastolic).label}</Text>
                </View>
              )}
              {latestRecord && (
                <Button
                  className='share-btn'
                  openType='share'
                  size='mini'
                  plain
                >
                  <View className='share-btn-text'><Text>分享</Text></View>
                </Button>
              )}
            </View>
          </View>

          {latestRecord ? (
            <View className='card-body'>
              <View className='bp-row'>
                <Text className='bp-value'>{latestRecord.systolic}</Text>
                <Text className='bp-slash'>/</Text>
                <Text className='bp-value'>{latestRecord.diastolic}</Text>
                <Text className='bp-unit'>mmHg</Text>
                <View className='pulse-inline'>
                  <Text className='pulse-value-inline'>{latestRecord.pulse}</Text>
                  <Text className='pulse-unit-inline'>bpm</Text>
                </View>
              </View>
              <View className='bp-info-row'>
                {/* <Text className='bp-desc'>收缩压 / 舒张压</Text> */}
                {bpDifference && (
                  <View className='bp-diff-inline'>
                    <Text className='bp-diff-label'>较最近一次：</Text>
                    <Text className={`bp-diff-text ${bpDifference.systolic >= 0 ? 'diff-up' : 'diff-down'}`}>
                      {bpDifference.systolic >= 0 ? '↑' : '↓'} {Math.abs(bpDifference.systolic)}
                    </Text>
                    <Text className='bp-diff-separator'>/</Text>
                    <Text className={`bp-diff-text ${bpDifference.diastolic >= 0 ? 'diff-up' : 'diff-down'}`}>
                      {bpDifference.diastolic >= 0 ? '↑' : '↓'} {Math.abs(bpDifference.diastolic)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View className='card-empty'>
              <Text className='empty-bp'>-- / --</Text>
              <Text className='empty-bp-hint'>暂无记录，点击上方按钮开始测量</Text>
            </View>
          )}
        </View>

        {/* 本周概览卡片 */}
        <View className='summary-card'>
          <View className='summary-header'>
            <View className='summary-title'><Image className='title-icon' src={iconChart} mode='aspectFit' /><Text>本周概览</Text></View>
            <Text className='summary-count'>共 {weeklyAverage?.count || 0} 次记录</Text>
          </View>
          {weeklyAverage ? (
            <View className='summary-content'>
              <View className='summary-avg'>
                <Text className='avg-label'>平均血压</Text>
                <View className='avg-values'>
                  <Text className='avg-number systolic'>{weeklyAverage.systolic}</Text>
                  <Text className='avg-slash'>/</Text>
                  <Text className='avg-number diastolic'>{weeklyAverage.diastolic}</Text>
                  <Text className='avg-unit'>mmHg</Text>
                </View>
              </View>
              <View className={`summary-status ${getBPStatus(weeklyAverage.systolic, weeklyAverage.diastolic).color}`}>
                <Text className='status-emoji'>{getBPStatus(weeklyAverage.systolic, weeklyAverage.diastolic).emoji}</Text>
                <Text className='status-text'>{getBPStatus(weeklyAverage.systolic, weeklyAverage.diastolic).label}</Text>
              </View>
            </View>
          ) : (
            <View className='summary-empty'>
              <Text className='summary-empty-text'>本周还没有记录</Text>
              <Text className='summary-empty-hint'>坚持每天测量，了解血压趋势</Text>
            </View>
          )}
        </View>

        {/* 我的组快捷入口 - 始终显示 */}
        <View className='groups-shortcut' onClick={() => {
          // 如果只有一个组，直接进入组详情；否则进入组列表
          if (myGroups.length === 1) {
            Taro.navigateTo({ url: `/pages/groups/detail?id=${myGroups[0].id}` })
          } else {
            Taro.navigateTo({ url: '/pages/groups/index' })
          }
        }}>
          <View className='groups-shortcut-content'>
            <Image className='groups-shortcut-icon' src={iconGroups} mode='aspectFit' />
            <View className='groups-shortcut-info'>
              <Text className='groups-shortcut-title'>我的组</Text>
              {myGroups.length === 0 ? (
                <Text className='groups-shortcut-desc groups-shortcut-hint'>创建或加入组，与家人朋友一起记录</Text>
              ) : myGroups.length === 1 ? (
                <Text className='groups-shortcut-desc'>{myGroups[0].name}</Text>
              ) : (
                <Text className='groups-shortcut-desc'>已加入 {myGroups.length} 个组</Text>
              )}
            </View>
            <Text className='groups-shortcut-arrow'>›</Text>
          </View>
        </View>

        {/* 记录列表 */}
        <View className='records-section'>
          <View className='records-card'>
            <View className='section-title'><Image className='title-icon' src={iconList} mode='aspectFit' /><Text>测量记录</Text></View>

            {groupedRecords.length === 0 ? (
              <View className='empty-records'>
                <Image className='empty-icon' src={iconEdit} mode='aspectFit' />
                <Text className='empty-text'>还没有记录</Text>
                <Text className='empty-hint'>点击上方按钮开始记录血压</Text>
              </View>
            ) : (
              <View className='records-list'>
                {groupedRecords.map((group, groupIdx) => (
                  <View key={group.dateKey} className='date-group'>
                    {group.records.map((record, idx) => {
                      const status = getBPStatus(record.systolic, record.diastolic)
                      const isLastInGroup = idx === group.records.length - 1
                      const isLastGroup = groupIdx === groupedRecords.length - 1
                      // 显示分割线：如果不是（组内最后一个 且 最后一个组）
                      const showDivider = !(isLastInGroup && isLastGroup)
                      const dateTime = formatRecordDateTime(record.recorded_at)
                      return (
                        <View
                          key={record.id || idx}
                          className={`record-item ${showDivider ? 'has-divider' : ''}`}
                          onClick={() => handleRecordAction(record)}
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
                    })}
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* 底部占位，防止被 tabbar 遮挡 */}
        <View className='bottom-spacer' />
      </ScrollView>

      {/* 识别中遮罩 - 放在 ScrollView 外面 */}
      {analyzing && (
        <View className='analyze-mask'>
          <View className='analyze-content'>
            <Text className='analyze-text'>AI 识别中...</Text>
          </View>
        </View>
      )}

      {/* 识别结果弹窗 - 放在 ScrollView 外面 */}
      {showResultModal && analyzeResult && (
        <View className='result-mask' onClick={handleCloseModal}>
          <View className='result-modal' onClick={handleModalContentClick}>
            <View className='modal-header'>
              <Text className='modal-title'>识别结果</Text>
              <Text className='modal-close' onClick={handleCloseModal}>×</Text>
            </View>
            <View className='modal-body'>
              <View className='result-values'>
                <View className='result-item'>
                  <Text className='result-number'>{analyzeResult.systolic}</Text>
                  <Text className='result-label'>收缩压</Text>
                </View>
                <Text className='result-separator'>/</Text>
                <View className='result-item'>
                  <Text className='result-number'>{analyzeResult.diastolic}</Text>
                  <Text className='result-label'>舒张压</Text>
                </View>
                <View className='result-item pulse'>
                  <Text className='result-number'>{analyzeResult.pulse}</Text>
                  <Text className='result-label'>心率</Text>
                </View>
              </View>

              {/* 左右手选择 */}
              <View className='hand-selector'>
                <View
                  className={`hand-option ${selectedHand === 'left' ? 'active' : ''}`}
                  onClick={() => setSelectedHand('left')}
                >
                  <Text>左手</Text>
                </View>
                <View
                  className={`hand-option ${selectedHand === 'right' ? 'active' : ''}`}
                  onClick={() => setSelectedHand('right')}
                >
                  <Text>右手</Text>
                </View>
              </View>

              <View className='modal-actions'>
                <View className='modal-btn cancel-btn' onClick={handleCloseModal}>
                  <Text>取消</Text>
                </View>
                <View className='modal-btn save-btn' onClick={handleSaveRecord}>
                  <Text>保存记录</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      )}
    </>
  )
}
