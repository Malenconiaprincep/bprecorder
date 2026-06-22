import { View, Text, Picker, Switch } from '@tarojs/components'
import {
  REMINDER_TIME_SLOTS,
  getReminderTimeSlotIndex,
  snapReminderTimeToSlot,
} from '../lib/reminders'
import './ReminderSettingsModal.scss'

interface ReminderSettingsModalProps {
  visible: boolean
  enabled: boolean
  reminderTime: string
  saving?: boolean
  onEnabledChange: (enabled: boolean) => void
  onTimeChange: (time: string) => void
  onSave: () => void
  onClose: () => void
}

export default function ReminderSettingsModal({
  visible,
  enabled,
  reminderTime,
  saving = false,
  onEnabledChange,
  onTimeChange,
  onSave,
  onClose,
}: ReminderSettingsModalProps) {
  if (!visible) return null

  const displayTime = snapReminderTimeToSlot(reminderTime)
  const slotIndex = getReminderTimeSlotIndex(displayTime)

  return (
    <View className='reminder-mask' onClick={onClose} catchMove>
      <View className='reminder-modal' onClick={(e) => e.stopPropagation()}>
        <View className='reminder-header'>
          <Text className='reminder-title'>测量提醒</Text>
          <Text className='reminder-close' onClick={onClose}>×</Text>
        </View>

        <Text className='reminder-desc'>
          通过微信订阅消息提醒您按时测量。提醒时间为整点或半点（如 9:00、9:30），与消息发送时间一致。每次授权可提醒一次，保存记录后可续订明日提醒。
        </Text>

        <View className='reminder-row'>
          <Text className='reminder-label'>开启提醒</Text>
          <Switch checked={enabled} color='#3b82f6' onChange={(e) => onEnabledChange(Boolean(e.detail.value))} />
        </View>

        <View className={`reminder-row${enabled ? '' : ' disabled'}`}>
          <Text className='reminder-label'>提醒时间</Text>
          <Picker
            mode='selector'
            range={REMINDER_TIME_SLOTS}
            value={slotIndex}
            disabled={!enabled}
            onChange={(e) => {
              const idx = Number(e.detail.value)
              const next = REMINDER_TIME_SLOTS[idx]
              if (next) onTimeChange(next)
            }}
          >
            <View className='reminder-time-picker'>
              <Text className='reminder-time-value'>{displayTime}</Text>
              <Text className='reminder-time-hint'>整点 / 半点</Text>
            </View>
          </Picker>
        </View>

        <View className='reminder-actions'>
          <View className='reminder-btn cancel' onClick={onClose}>
            <Text>取消</Text>
          </View>
          <View className={`reminder-btn confirm${saving ? ' disabled' : ''}`} onClick={saving ? undefined : onSave}>
            <Text>{saving ? '保存中...' : '保存并授权'}</Text>
          </View>
        </View>
      </View>
    </View>
  )
}
