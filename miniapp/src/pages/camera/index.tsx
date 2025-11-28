import React, { useState } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { addRecord } from '../../lib/supabase'
import { getUserInfo } from '../../lib/auth'
import './index.scss'

export default function CameraPage() {
  const [analyzing, setAnalyzing] = useState(false)
  const [previewImage, setPreviewImage] = useState('')
  const [result, setResult] = useState<{
    systolic: number
    diastolic: number
    pulse: number
  } | null>(null)

  const handleChooseImage = async () => {
    try {
      const res = await Taro.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      })

      const tempFilePath = res.tempFilePaths[0]
      setPreviewImage(tempFilePath)
      
      // TODO: 接入 AI 识别
      // 目前使用 mock 数据
      setAnalyzing(true)
      setTimeout(() => {
        setResult({
          systolic: 128,
          diastolic: 82,
          pulse: 76
        })
        setAnalyzing(false)
      }, 1500)
    } catch (e) {
      console.log('User cancelled')
    }
  }

  const handleSave = async () => {
    if (!result) return

    const userInfo = getUserInfo()
    if (!userInfo) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    try {
      const { error } = await addRecord({
        user_id: userInfo.openid,
        systolic: result.systolic,
        diastolic: result.diastolic,
        pulse: result.pulse,
        recorded_at: new Date().toISOString()
      })

      if (error) {
        Taro.showToast({ title: error, icon: 'none' })
      } else {
        Taro.showToast({ title: '保存成功', icon: 'success' })
        setTimeout(() => {
          Taro.navigateBack()
        }, 1500)
      }
    } catch (e) {
      Taro.showToast({ title: '保存失败', icon: 'none' })
    }
  }

  const goBack = () => {
    Taro.navigateBack()
  }

  const reset = () => {
    setPreviewImage('')
    setResult(null)
  }

  return (
    <View className='camera-page'>
      {/* 头部 */}
      <View className='header'>
        <Text className='back-btn' onClick={goBack}>‹</Text>
        <Text className='header-title'>拍照识别</Text>
        <View className='header-placeholder' />
      </View>

      {!previewImage ? (
        /* 拍照区域 */
        <View className='camera-area' onClick={handleChooseImage}>
          <View className='camera-placeholder'>
            <Text className='camera-icon'>📷</Text>
            <Text className='camera-text'>点击拍照或选择图片</Text>
            <Text className='camera-hint'>请将血压计屏幕对准相机</Text>
          </View>
        </View>
      ) : (
        /* 预览和结果 */
        <View className='result-area'>
          <Image className='preview-image' src={previewImage} mode='aspectFit' />
          
          {analyzing ? (
            <View className='analyzing'>
              <Text className='analyzing-text'>AI 识别中...</Text>
            </View>
          ) : result ? (
            <View className='result-card'>
              <Text className='result-title'>识别结果</Text>
              <View className='result-values'>
                <View className='result-item'>
                  <Text className='result-number'>{result.systolic}</Text>
                  <Text className='result-label'>收缩压</Text>
                </View>
                <Text className='result-separator'>/</Text>
                <View className='result-item'>
                  <Text className='result-number'>{result.diastolic}</Text>
                  <Text className='result-label'>舒张压</Text>
                </View>
                <View className='result-item pulse'>
                  <Text className='result-number'>{result.pulse}</Text>
                  <Text className='result-label'>心率</Text>
                </View>
              </View>
              
              <View className='result-actions'>
                <View className='action-btn retry-btn' onClick={reset}>
                  <Text>重新拍照</Text>
                </View>
                <View className='action-btn save-btn' onClick={handleSave}>
                  <Text>保存记录</Text>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      )}
    </View>
  )
}

