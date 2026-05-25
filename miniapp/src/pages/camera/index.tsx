import React, { useState } from 'react'
import { View, Text, Image, Textarea } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { addRecord } from '../../lib/supabase'
import { getUserInfo } from '../../lib/auth'
import { setAnalysisNeedRefresh } from '../../store/analysisRefresh'
import DietAdviceCard from '../../components/DietAdviceCard'
import {
  DIET_ADVICE_UI_INITIAL,
  markDietAdvicePromptDismissed,
  openDietAdviceAfterSave,
  requestDietAdviceDetailWithAd,
  type DietAdviceUiState,
} from '../../utils/triggerDietAdvice'
import {
  getDietAdvicePromptSkipReason,
  isWeappDevelopRuntime,
} from '../../utils/dietAdvicePromptPolicy'
import './index.scss'
// @ts-ignore
import iconCamera from '../../assets/icons/camera.png'

export default function CameraPage() {
  const [analyzing, setAnalyzing] = useState(false)
  const [previewImage, setPreviewImage] = useState('')
  const [result, setResult] = useState<{
    systolic: number
    diastolic: number
    pulse: number
  } | null>(null)
  const [note, setNote] = useState('')
  const [noteExpanded, setNoteExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dietAdviceUi, setDietAdviceUi] = useState<DietAdviceUiState>(DIET_ADVICE_UI_INITIAL)
  const [pendingNavigateBack, setPendingNavigateBack] = useState(false)

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

  const handleViewDietAdvice = () => {
    const userInfo = getUserInfo()
    const latest = dietAdviceUi.savedLatest
    if (!userInfo || !latest) return
    requestDietAdviceDetailWithAd(userInfo.openid, latest, closeDietAdviceAndBack)
  }

  const closeDietAdviceAndBack = () => {
    markDietAdvicePromptDismissed()
    setDietAdviceUi(DIET_ADVICE_UI_INITIAL)
    if (pendingNavigateBack) {
      setPendingNavigateBack(false)
      Taro.navigateBack()
    }
  }

  const handleSave = async () => {
    if (!result) return
    if (saving) return

    const userInfo = getUserInfo()
    if (!userInfo) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    setSaving(true)
    const recordedAt = new Date().toISOString()
    const savedReading = {
      systolic: result.systolic,
      diastolic: result.diastolic,
      pulse: result.pulse,
      note: note || undefined,
      recordedAt,
    }

    try {
      const { error } = await addRecord({
        user_id: userInfo.openid,
        systolic: savedReading.systolic,
        diastolic: savedReading.diastolic,
        pulse: savedReading.pulse,
        note: savedReading.note,
        recorded_at: recordedAt
      })

      if (error) {
        Taro.showToast({ title: error, icon: 'none' })
        setSaving(false)
      } else {
        Taro.showToast({ title: '保存成功', icon: 'success' })
        setAnalysisNeedRefresh(true)
        setSaving(false)
        const opened = openDietAdviceAfterSave(savedReading, setDietAdviceUi)
        if (opened) {
          setPendingNavigateBack(true)
        } else {
          const skip = getDietAdvicePromptSkipReason(
            savedReading.systolic,
            savedReading.diastolic
          )
          if (skip && isWeappDevelopRuntime()) {
            Taro.showToast({ title: skip, icon: 'none', duration: 2800 })
          }
          setTimeout(() => Taro.navigateBack(), 1500)
        }
      }
    } catch (e) {
      Taro.showToast({ title: '保存失败', icon: 'none' })
      setSaving(false)
    }
  }

  const goBack = () => {
    Taro.navigateBack()
  }

  const reset = () => {
    setPreviewImage('')
    setResult(null)
    setNote('')
    setNoteExpanded(false)
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
            <Image className='camera-icon' src={iconCamera} mode='aspectFit' />
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

              {/* 备注输入 */}
              <View className='note-section'>
                <View className='note-header' onClick={() => setNoteExpanded(!noteExpanded)}>
                  <Text className='note-label'>备注 (可选)</Text>
                  <Text className={`note-expand-icon ${noteExpanded ? 'expanded' : ''}`}>▼</Text>
                </View>
                {(noteExpanded || note) && (
                  <Textarea
                    className='note-field'
                    placeholder='添加备注，如：饭后、运动后等'
                    value={note}
                    onInput={(e) => {
                      setNote(e.detail.value)
                      if (e.detail.value && !noteExpanded) {
                        setNoteExpanded(true)
                      }
                    }}
                    maxlength={200}
                  />
                )}
              </View>

              <View className='result-actions'>
                <View className='action-btn retry-btn' onClick={reset}>
                  <Text>重新拍照</Text>
                </View>
                <View
                  className={`action-btn save-btn ${saving ? 'disabled' : ''}`}
                  onClick={handleSave}
                >
                  <Text>{saving ? '保存中...' : '保存记录'}</Text>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      )}
      <DietAdviceCard
        visible={dietAdviceUi.visible}
        savedLatest={dietAdviceUi.savedLatest}
        onViewAdvice={handleViewDietAdvice}
        onClose={closeDietAdviceAndBack}
      />
    </View>
  )
}

