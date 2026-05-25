import { View, Text, Image } from '@tarojs/components'
import type { DietAdviceLatestInput } from '../utils/dietAdvice'
import { DIET_ADVICE_FEATURE_NAME } from '../types/dietAdvice'
import './DietAdviceCard.scss'
// @ts-ignore
import aiMascotEntry from '../assets/diet/ai-mascot-entry.png'
// @ts-ignore
import aiHealthBanner from '../assets/diet/ai-health-banner.png'

/** 入口弹层底部免责说明 */
export const DIET_ADVICE_ENTRY_DISCLAIMER =
  '仅提供饮食生活建议，不作为医疗诊断依据'

interface DietAdviceCardProps {
  visible: boolean
  savedLatest?: DietAdviceLatestInput | null
  onViewAdvice?: () => void
  onClose: () => void
}

/** 保存后的轻量入口（Bottom Sheet 风格） */
export default function DietAdviceCard({
  visible,
  savedLatest,
  onViewAdvice,
  onClose,
}: DietAdviceCardProps) {
  if (!visible || !savedLatest) return null

  const handleMaskClick = () => onClose()

  const stopPropagation = (e: { stopPropagation?: () => void }) => {
    e.stopPropagation?.()
  }

  const { systolic, diastolic } = savedLatest

  return (
    <View className='health-advice-mask' onClick={handleMaskClick} catchMove>
      <View className='health-advice-card health-advice-card--entry' onClick={stopPropagation}>
        <View className='health-sheet-handle' />

        <View className='health-entry-header'>
          <View className='health-entry-copy'>
            <View className='health-entry-title-row'>
              <Text className='health-entry-title'>{DIET_ADVICE_FEATURE_NAME}</Text>
              <View className='health-entry-ai-pill'>
                <Text className='health-entry-ai-pill-text'>AI</Text>
              </View>
            </View>
            <View className='health-entry-meta-row'>
              <Text className='health-entry-meta-label'>已记录</Text>
              <Text className='health-entry-meta-bp'>
                {systolic}/{diastolic}
              </Text>
              <Text className='health-entry-meta-unit'>mmHg</Text>
              <View className='health-entry-meta-ok'>
                <Text className='health-entry-meta-ok-icon'>✓</Text>
              </View>
            </View>
          </View>
          <Image
            className='health-entry-mascot'
            src={aiMascotEntry}
            mode='aspectFit'
          />
        </View>

        <View className='health-body health-body--entry'>
          <View className='health-entry-hero'>
            <View className='health-entry-banner-wrap'>
              <Image
                className='health-entry-banner'
                src={aiHealthBanner}
                mode='aspectFit'
              />
            </View>

            <View
              className='health-entry-cta'
            onClick={(e) => {
              stopPropagation(e)
              onViewAdvice?.()
            }}
          >
            <View className='health-entry-cta-text'>
              <Text className='health-entry-cta-title'>生成 AI 食谱</Text>
              <Text className='health-entry-cta-sub'>为你定制今日饮食建议</Text>
            </View>
            <View className='health-entry-cta-arrow'>
              <Text className='health-entry-cta-arrow-icon'>›</Text>
            </View>
          </View>
          </View>

          <Text
            className='health-entry-skip'
            onClick={(e) => {
              stopPropagation(e)
              onClose()
            }}
          >
            暂不需要
          </Text>

          <View className='health-entry-disclaimer'>
            <Text className='health-entry-disclaimer-text'>{DIET_ADVICE_ENTRY_DISCLAIMER}</Text>
          </View>
        </View>
      </View>
    </View>
  )
}
