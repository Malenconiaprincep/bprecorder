import { View, Text } from '@tarojs/components'
import { FontSizeMode } from '../lib/settings'
import './FontSizeModeModal.scss'

interface FontSizeModeModalProps {
  visible: boolean
  onSelect: (mode: FontSizeMode) => void
  onClose?: () => void
  title?: string
  showClose?: boolean
  // 新增：是否使用轻量模式（底部弹出）
  light?: boolean
}

export default function FontSizeModeModal({
  visible,
  onSelect,
  onClose,
  title = '选择显示模式',
  showClose = false,
  light = false
}: FontSizeModeModalProps) {
  if (!visible) return null

  const handleMaskClick = () => {
    if (showClose && onClose) {
      onClose()
    }
  }

  const handleContentClick = (e: any) => {
    e.stopPropagation()
  }

  // 轻量模式 - 底部弹出
  if (light) {
    return (
      <View className='font-mode-light-mask' onClick={handleMaskClick} catchMove>
        <View className='font-mode-light-modal' onClick={handleContentClick}>
          <View className='light-header'>
            <Text className='light-title'>请选择显示模式</Text>
            {showClose && onClose && (
              <Text className='light-close' onClick={onClose}>×</Text>
            )}
          </View>
          <View className='light-options'>
            <View className='light-option' onClick={() => onSelect('normal')}>
              <View className='light-option-left'>
                <Text className='light-option-name'>标准模式</Text>
                <Text className='light-option-desc'>完整功能，信息丰富</Text>
              </View>
              <View className='light-preview normal'>
                <Text className='light-num'>125/80</Text>
              </View>
            </View>
            <View className='light-option elder' onClick={() => onSelect('elder')}>
              <View className='light-option-left'>
                <Text className='light-option-name'>关怀模式</Text>
                <Text className='light-option-desc'>字体更大，操作更简单</Text>
              </View>
              <View className='light-preview elder'>
                <Text className='light-num'>125/80</Text>
              </View>
            </View>
          </View>
          <Text className='light-hint'>可在"我的"页面随时修改</Text>
        </View>
      </View>
    )
  }

  // 完整模式 - 居中弹窗（用于设置页）
  return (
    <View className='font-mode-mask' onClick={handleMaskClick} catchMove>
      <View className='font-mode-modal' onClick={handleContentClick}>
        <View className='modal-header'>
          <Text className='modal-title'>{title}</Text>
          {showClose && onClose && (
            <Text className='modal-close' onClick={onClose}>×</Text>
          )}
        </View>

        <View className='modal-desc'>
          <Text className='desc-text'>为了给您更好的使用体验，请选择适合您的显示模式</Text>
        </View>

        <View className='mode-options'>
          {/* 标准模式 */}
          <View className='mode-option normal' onClick={() => onSelect('normal')}>
            <View className='mode-preview normal-preview'>
              <Text className='preview-title'>收缩压/舒张压</Text>
              <View className='preview-values'>
                <Text className='preview-num'>125</Text>
                <Text className='preview-slash'>/</Text>
                <Text className='preview-num'>80</Text>
              </View>
              <Text className='preview-unit'>mmHg</Text>
            </View>
            <View className='mode-info'>
              <Text className='mode-name'>标准模式</Text>
              <Text className='mode-desc'>完整功能，信息丰富</Text>
            </View>
          </View>

          {/* 关怀模式（大字体 + 简化布局） */}
          <View className='mode-option elder' onClick={() => onSelect('elder')}>
            <View className='mode-preview elder-preview'>
              <Text className='preview-title'>收缩压/舒张压</Text>
              <View className='preview-values'>
                <Text className='preview-num'>125</Text>
                <Text className='preview-slash'>/</Text>
                <Text className='preview-num'>80</Text>
              </View>
              <Text className='preview-unit'>mmHg</Text>
            </View>
            <View className='mode-info'>
              <Text className='mode-name'>关怀模式</Text>
              <Text className='mode-desc'>字体更大，操作更简单</Text>
            </View>
          </View>
        </View>

        <View className='modal-footer'>
          <Text className='footer-hint'>您可以随时在"我的"页面修改此设置</Text>
        </View>
      </View>
    </View>
  )
}
