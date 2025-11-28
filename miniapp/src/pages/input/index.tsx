import React, { useState } from 'react'
import { View, Text, Input, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { addRecord } from '../../lib/supabase'
import { getUserInfo } from '../../lib/auth'
import './index.scss'

export default function InputPage() {
  const [systolic, setSystolic] = useState('')
  const [diastolic, setDiastolic] = useState('')
  const [pulse, setPulse] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!systolic || !diastolic || !pulse) {
      Taro.showToast({ title: '请填写完整数据', icon: 'none' })
      return
    }

    const userInfo = getUserInfo()
    if (!userInfo) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    setSaving(true)
    try {
      const { error } = await addRecord({
        user_id: userInfo.openid,
        systolic: parseInt(systolic),
        diastolic: parseInt(diastolic),
        pulse: parseInt(pulse),
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
    } finally {
      setSaving(false)
    }
  }

  const goBack = () => {
    Taro.navigateBack()
  }

  return (
    <View className='input-page'>
      {/* 头部 */}
      <View className='header'>
        <Text className='back-btn' onClick={goBack}>‹</Text>
        <Text className='header-title'>手动记录</Text>
        <View className='header-placeholder' />
      </View>

      {/* 输入表单 */}
      <View className='form-container'>
        <View className='input-group'>
          <Text className='input-label'>收缩压 (mmHg)</Text>
          <Input
            className='input-field'
            type='number'
            placeholder='请输入收缩压'
            value={systolic}
            onInput={(e) => setSystolic(e.detail.value)}
          />
        </View>

        <View className='input-group'>
          <Text className='input-label'>舒张压 (mmHg)</Text>
          <Input
            className='input-field'
            type='number'
            placeholder='请输入舒张压'
            value={diastolic}
            onInput={(e) => setDiastolic(e.detail.value)}
          />
        </View>

        <View className='input-group'>
          <Text className='input-label'>心率 (bpm)</Text>
          <Input
            className='input-field'
            type='number'
            placeholder='请输入心率'
            value={pulse}
            onInput={(e) => setPulse(e.detail.value)}
          />
        </View>
      </View>

      {/* 保存按钮 */}
      <View className='save-btn-wrapper'>
        <Button
          className='save-btn'
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '保存中...' : '保存记录'}
        </Button>
      </View>
    </View>
  )
}

