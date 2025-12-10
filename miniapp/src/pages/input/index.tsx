import React, { useState } from 'react'
import { View, Text, Input, Button, Textarea } from '@tarojs/components'
import Taro, { useLoad, useRouter } from '@tarojs/taro'
import { addRecord, updateRecord, BPRecord } from '../../lib/supabase'
import { getUserInfo } from '../../lib/auth'
import './index.scss'

export default function InputPage() {
  const router = useRouter()
  const [systolic, setSystolic] = useState('')
  const [diastolic, setDiastolic] = useState('')
  const [pulse, setPulse] = useState('')
  const [hand, setHand] = useState<'left' | 'right' | ''>('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [isEdit, setIsEdit] = useState(false)
  const [recordId, setRecordId] = useState<number | null>(null)

  useLoad(() => {
    // 检查是否是编辑模式
    const params = router.params
    if (params.id) {
      setIsEdit(true)
      setRecordId(parseInt(params.id))
      // 填充已有数据
      if (params.systolic) setSystolic(params.systolic)
      if (params.diastolic) setDiastolic(params.diastolic)
      if (params.pulse) setPulse(params.pulse)
      if (params.hand) setHand(params.hand as 'left' | 'right')
      if (params.note) setNote(decodeURIComponent(params.note))
    }
  })

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
      if (isEdit && recordId) {
        // 编辑模式
        const { error } = await updateRecord(recordId, {
          systolic: parseInt(systolic),
          diastolic: parseInt(diastolic),
          pulse: parseInt(pulse),
          hand: hand || undefined,
          note: note || undefined
        })

        if (error) {
          Taro.showToast({ title: error, icon: 'none' })
        } else {
          Taro.showToast({ title: '更新成功', icon: 'success' })
          setTimeout(() => {
            Taro.navigateBack()
          }, 1500)
        }
      } else {
        // 新增模式
        const { error } = await addRecord({
          user_id: userInfo.openid,
          systolic: parseInt(systolic),
          diastolic: parseInt(diastolic),
          pulse: parseInt(pulse),
          hand: hand || undefined,
          note: note || undefined,
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
      }
    } catch (e) {
      Taro.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <View className='input-page'>
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

        {/* 左右手选择 */}
        <View className='input-group'>
          <Text className='input-label'>测量手臂 (可选)</Text>
          <View className='hand-selector'>
            <View 
              className={`hand-option ${hand === 'left' ? 'active' : ''}`}
              onClick={() => setHand(hand === 'left' ? '' : 'left')}
            >
              <Text className='hand-icon'>🤚</Text>
              <Text className='hand-text'>左手</Text>
            </View>
            <View 
              className={`hand-option ${hand === 'right' ? 'active' : ''}`}
              onClick={() => setHand(hand === 'right' ? '' : 'right')}
            >
              <Text className='hand-icon'>✋</Text>
              <Text className='hand-text'>右手</Text>
            </View>
          </View>
        </View>

        {/* 备注 */}
        <View className='input-group'>
          <Text className='input-label'>备注 (可选)</Text>
          <Textarea
            className='note-field'
            placeholder='添加备注，如：饭后、运动后等'
            value={note}
            onInput={(e) => setNote(e.detail.value)}
            maxlength={200}
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
          {saving ? '保存中...' : (isEdit ? '更新记录' : '保存记录')}
        </Button>
      </View>
    </View>
  )
}
