import { useState, useMemo } from 'react'
import { View, Text, Input, Button, Textarea, Picker } from '@tarojs/components'
import Taro, { useLoad, useRouter } from '@tarojs/taro'
import { addRecord, updateRecord } from '../../lib/supabase'
import { getUserInfo } from '../../lib/auth'
import { setAnalysisNeedRefresh } from '../../store/analysisRefresh'
import { getPreferredMeasureHand, savePreferredMeasureHand, clearPreferredMeasureHand } from '../../lib/settings'
import './index.scss'

/** 测量时间选择器分钟步长 */
const TIME_STEP_MINUTES = 5

/** 将时刻对齐到步长；跨天则落在当天 23:55（日期列表不含明天） */
function snapToTimeStep(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): { date: string; time: string } {
  let h = hour
  let m = Math.round(minute / TIME_STEP_MINUTES) * TIME_STEP_MINUTES
  if (m >= 60) {
    m = 0
    h += 1
  }
  if (h >= 24) {
    return {
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      time: '23:55'
    }
  }
  return {
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
}

export default function InputPage() {
  const router = useRouter()
  const [systolic, setSystolic] = useState('')
  const [diastolic, setDiastolic] = useState('')
  const [pulse, setPulse] = useState('')
  const [hand, setHand] = useState<'left' | 'right' | ''>('')
  const [note, setNote] = useState('')
  const [noteExpanded, setNoteExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isEdit, setIsEdit] = useState(false)
  const [recordId, setRecordId] = useState<number | null>(null)

  // 日期时间状态，默认值为当前时间
  const getCurrentDateTime = () => {
    const now = new Date()
    return snapToTimeStep(
      now.getFullYear(),
      now.getMonth() + 1,
      now.getDate(),
      now.getHours(),
      now.getMinutes()
    )
  }

  const [selectedDate, setSelectedDate] = useState(getCurrentDateTime().date)
  const [selectedTime, setSelectedTime] = useState(getCurrentDateTime().time)

  // 生成日期选项（最近30天）
  const dateOptions = useMemo(() => {
    const options: string[] = []
    const now = new Date()
    for (let i = 0; i < 30; i++) {
      const date = new Date(now)
      date.setDate(now.getDate() - i)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      options.push(`${year}-${month}-${day}`)
    }
    return options
  }, [])

  // 生成时间选项（24 小时，每 5 分钟一个选项）
  const timeOptions = useMemo(() => {
    const options: string[] = []
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += TIME_STEP_MINUTES) {
        const h = String(hour).padStart(2, '0')
        const m = String(minute).padStart(2, '0')
        options.push(`${h}:${m}`)
      }
    }
    return options
  }, [])

  // 获取当前选择的索引
  const getSelectedIndexes = useMemo(() => {
    const dateIndex = dateOptions.findIndex(d => d === selectedDate)
    const timeIndex = timeOptions.findIndex(t => t === selectedTime)
    return [dateIndex >= 0 ? dateIndex : 0, timeIndex >= 0 ? timeIndex : 0]
  }, [selectedDate, selectedTime, dateOptions, timeOptions])

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
      if (params.note) {
        // 微信小程序的 URL 参数需要手动解码
        try {
          setNote(decodeURIComponent(params.note))
        } catch (e) {
          // 如果解码失败，直接使用原值
          setNote(params.note)
        }
        // 如果有备注内容，自动展开
        setNoteExpanded(true)
      }
      // 如果有recorded_at参数，填充日期时间
      if (params.recorded_at) {
        const date = new Date(params.recorded_at)
        const snapped = snapToTimeStep(
          date.getFullYear(),
          date.getMonth() + 1,
          date.getDate(),
          date.getHours(),
          date.getMinutes()
        )
        setSelectedDate(snapped.date)
        setSelectedTime(snapped.time)
      }
    } else {
      setHand(getPreferredMeasureHand() ?? '')
    }
  })

  // 格式化日期时间显示
  const formatDateTimeDisplay = useMemo(() => {
    const [hours, minutes] = selectedTime.split(':')
    const date = new Date(`${selectedDate}T${selectedTime}:00`)
    const month = date.getMonth() + 1
    const day = date.getDate()
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const weekDay = weekDays[date.getDay()]
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`

    let dateLabel = ''
    if (selectedDate === todayStr) {
      dateLabel = '今天'
    } else if (selectedDate === yesterdayStr) {
      dateLabel = '昨天'
    } else {
      dateLabel = `${month}月${day}日 ${weekDay}`
    }

    return `${dateLabel} ${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`
  }, [selectedDate, selectedTime])

  // 处理日期时间选择
  const handleDateTimeChange = (e: any) => {
    const [dateIndex, timeIndex] = e.detail.value
    setSelectedDate(dateOptions[dateIndex])
    setSelectedTime(timeOptions[timeIndex])
  }

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
        // 将选择的日期时间转换为ISO字符串（添加秒数）
        const recordedAt = new Date(`${selectedDate}T${selectedTime}:00`).toISOString()
        const { error } = await updateRecord(recordId, {
          systolic: parseInt(systolic),
          diastolic: parseInt(diastolic),
          pulse: parseInt(pulse),
          hand: hand || undefined,
          note: note || undefined,
          recorded_at: recordedAt
        })

        if (error) {
          Taro.showToast({ title: error, icon: 'none' })
        } else {
          if (hand === 'left' || hand === 'right') {
            savePreferredMeasureHand(hand)
          }
          Taro.showToast({ title: '更新成功', icon: 'success' })
          setAnalysisNeedRefresh(true) // 有数据变更，下次进分析页需拉取
          setTimeout(() => {
            Taro.navigateBack()
          }, 1500)
        }
      } else {
        // 新增模式
        // 将选择的日期时间转换为ISO字符串（添加秒数）
        const recordedAt = new Date(`${selectedDate}T${selectedTime}:00`).toISOString()
        const { error } = await addRecord({
          user_id: userInfo.openid,
          systolic: parseInt(systolic),
          diastolic: parseInt(diastolic),
          pulse: parseInt(pulse),
          hand: hand || undefined,
          note: note || undefined,
          recorded_at: recordedAt
        })

        if (error) {
          Taro.showToast({ title: error, icon: 'none' })
        } else {
          if (hand === 'left' || hand === 'right') {
            savePreferredMeasureHand(hand)
          }
          Taro.showToast({ title: '保存成功', icon: 'success' })
          setAnalysisNeedRefresh(true) // 有数据变更，下次进分析页需拉取
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

        {/* 日期时间选择 */}
        <View className='input-group'>
          <Text className='input-label'>测量日期时间</Text>
          <Picker
            mode='multiSelector'
            range={[dateOptions, timeOptions]}
            value={getSelectedIndexes}
            onChange={handleDateTimeChange}
          >
            <View className='datetime-picker'>
              <Text className='datetime-label'>{formatDateTimeDisplay}</Text>
              <Text className='datetime-icon'>📅</Text>
            </View>
          </Picker>
        </View>

        {/* 左右手选择 */}
        <View className='input-group'>
          <Text className='input-label'>测量手臂 (可选)</Text>
          <View className='hand-selector'>
            <View
              className={`hand-option ${hand === 'left' ? 'active' : ''}`}
              onClick={() => {
                const next = hand === 'left' ? '' : 'left'
                setHand(next)
                if (next === 'left') savePreferredMeasureHand('left')
                else clearPreferredMeasureHand()
              }}
            >
              <Text className='hand-icon'>🤚</Text>
              <Text className='hand-text'>左手</Text>
            </View>
            <View
              className={`hand-option ${hand === 'right' ? 'active' : ''}`}
              onClick={() => {
                const next = hand === 'right' ? '' : 'right'
                setHand(next)
                if (next === 'right') savePreferredMeasureHand('right')
                else clearPreferredMeasureHand()
              }}
            >
              <Text className='hand-icon'>✋</Text>
              <Text className='hand-text'>右手</Text>
            </View>
          </View>
        </View>

        {/* 备注 */}
        <View className='input-group'>
          <View className='note-header' onClick={() => setNoteExpanded(!noteExpanded)}>
            <Text className='input-label'>备注 (可选)</Text>
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
