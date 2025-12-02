import React, { useState, useMemo } from 'react'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { getRecords, BPRecord, addRecord } from '../../lib/supabase'
import { silentLogin, getUserInfo, UserInfo } from '../../lib/auth'
import { API_BASE_URL } from '../../utils/api'
import './index.scss'

// 图标
import iconCamera from '../../assets/icons/xiangji.png'
import iconEdit from '../../assets/icons/jianpanshuru.png'

// 血压状态判断
const getBPStatus = (systolic: number, diastolic: number) => {
  if (systolic < 120 && diastolic < 80) {
    return { label: '正常', color: 'normal', emoji: '😊' }
  } else if (systolic < 140 && diastolic < 90) {
    return { label: '偏高', color: 'elevated', emoji: '😐' }
  } else {
    return { label: '高血压', color: 'high', emoji: '😟' }
  }
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

  const latestRecord = records.length > 0 ? records[0] : null

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

  useLoad(() => {
    initPage()
  })

  const initPage = async () => {
    // 测试模式直接加载测试数据
    if (USE_TEST_DATA) {
      setRecords(getTestData())
      return
    }

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
      // 静默登录获取 openid
      const result = await silentLogin()
      if (result.success && result.userInfo) {
        setUserInfo(result.userInfo)
        await fetchRecords(result.userInfo.openid)
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

  const goToInput = () => {
    Taro.navigateTo({ url: '/pages/input/index' })
  }

  const goToCamera = async () => {
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

    try {
      const { error } = await addRecord({
        user_id: userInfo.openid,
        systolic: analyzeResult.systolic,
        diastolic: analyzeResult.diastolic,
        pulse: analyzeResult.pulse,
        recorded_at: new Date().toISOString()
      })

      if (error) {
        Taro.showToast({ title: error, icon: 'none' })
      } else {
        Taro.showToast({ title: '保存成功', icon: 'success' })
        setShowResultModal(false)
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

  return (
    <>
      <ScrollView className='page' scrollY enhanced showScrollbar={false}>
        {/* 顶部蓝色弧形背景 */}
        <View className='bg-curve' />

        {/* 操作按钮 - 放在最顶部，最显眼 */}
        <View className='actions'>
          <View className='action-btn blue' onClick={goToCamera}>
            <Text className='action-icon'>📷</Text>
            <Text className='action-text-white'>拍照输入</Text>
          </View>
          <View className='action-btn white' onClick={goToInput}>
            <Text className='action-icon'>✏️</Text>
            <Text className='action-text-dark'>手动输入</Text>
          </View>
        </View>

        {/* 今日血压卡片 */}
        {latestRecord && (
          <View className='bp-card'>
            <View className='card-header'>
              <Text className='card-title'>💓 最新血压</Text>
              <View className={`card-status ${getBPStatus(latestRecord.systolic, latestRecord.diastolic).color}`}>
                <Text className='card-status-text'>{getBPStatus(latestRecord.systolic, latestRecord.diastolic).label}</Text>
              </View>
            </View>

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
          </View>
        )}

        {/* 本周概览卡片 */}
        {weeklyAverage && (
          <View className='summary-card'>
            <View className='summary-header'>
              <Text className='summary-title'>📊 本周概览</Text>
              <Text className='summary-count'>共 {weeklyAverage.count} 次记录</Text>
            </View>
            <View className='summary-content'>
              <View className='summary-avg'>
                <Text className='avg-label'>平均血压</Text>
                <View className='avg-values'>
                  <Text className='avg-number'>{weeklyAverage.systolic}</Text>
                  <Text className='avg-slash'>/</Text>
                  <Text className='avg-number'>{weeklyAverage.diastolic}</Text>
                  <Text className='avg-unit'>mmHg</Text>
                </View>
              </View>
              <View className={`summary-status ${getBPStatus(weeklyAverage.systolic, weeklyAverage.diastolic).color}`}>
                <Text className='status-emoji'>{getBPStatus(weeklyAverage.systolic, weeklyAverage.diastolic).emoji}</Text>
                <Text className='status-text'>{getBPStatus(weeklyAverage.systolic, weeklyAverage.diastolic).label}</Text>
              </View>
            </View>
          </View>
        )}

        {/* 记录列表 */}
        <View className='records-section'>
          <Text className='section-title'>📋 测量记录</Text>

          {groupedRecords.length === 0 ? (
            <View className='empty-records'>
              <Text className='empty-icon'>📝</Text>
              <Text className='empty-text'>还没有记录</Text>
              <Text className='empty-hint'>点击上方按钮开始记录血压</Text>
            </View>
          ) : (
            <View className='records-list'>
              {groupedRecords.map(group => (
                <View key={group.dateKey} className='date-group'>
                  <View className='date-header'>
                    <Text className='date-label'>{group.dateLabel}</Text>
                    {group.records.length > 1 && (
                      <Text className='date-count'>{group.records.length}次</Text>
                    )}
                  </View>

                  {group.records.map((record, idx) => {
                    const status = getBPStatus(record.systolic, record.diastolic)
                    return (
                      <View key={record.id || idx} className='record-card'>
                        <View className='record-time'>
                          <Text className='time-text'>{formatTime(record.recorded_at)}</Text>
                        </View>

                        <View className='record-main'>
                          <View className='bp-display'>
                            <Text className='bp-num systolic'>{record.systolic}</Text>
                            <Text className='bp-divider'>/</Text>
                            <Text className='bp-num diastolic'>{record.diastolic}</Text>
                          </View>
                          <Text className='bp-unit-text'>mmHg</Text>
                        </View>

                        <View className='record-extra'>
                          <View className='pulse-display'>
                            <Text className='pulse-icon'>💓</Text>
                            <Text className='pulse-num'>{record.pulse}</Text>
                          </View>
                          <View className={`status-badge ${status.color}`}>
                            <Text className='badge-text'>{status.label}</Text>
                          </View>
                        </View>
                      </View>
                    )
                  })}
                </View>
              ))}
            </View>
          )}
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
