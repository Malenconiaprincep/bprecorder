import React, { useState } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { getRecords, BPRecord, addRecord } from '../../lib/supabase'
import { silentLogin, getUserInfo, UserInfo } from '../../lib/auth'
import { API_BASE_URL } from '../../utils/api'
import './index.scss'

// 图标
import iconCamera from '../../assets/icons/xiangji.png'
import iconEdit from '../../assets/icons/jianpanshuru.png'

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
    <View className='page'>
      {/* 顶部蓝色弧形背景 */}
      <View className='bg-curve' />

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
        <Text className='trend-title'>本周趋势</Text>
        <View className='trend-bars'>
          {['一', '二', '三', '四', '五', '六', '日'].map((day, i) => (
            <View key={i} className='bar-item'>
              <View className='bar' style={{ height: records[i] ? `${records[i].systolic}rpx` : '40rpx' }} />
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

      {/* 识别中遮罩 */}
      {analyzing && (
        <View className='analyze-mask'>
          <View className='analyze-content'>
            <Text className='analyze-text'>AI 识别中...</Text>
          </View>
        </View>
      )}

      {/* 识别结果弹窗 */}
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
    </View>
  )
}
