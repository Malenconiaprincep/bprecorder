import { View } from '@tarojs/components'

interface IconProps {
  size?: number
  color?: string
  className?: string
}

// 首页图标
export function IconHome({ size = 48, color = '#94a3b8', className = '' }: IconProps) {
  return (
    <View 
      className={className}
      style={{ 
        width: `${size}rpx`, 
        height: `${size}rpx`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <View style={{
        width: `${size * 0.7}rpx`,
        height: `${size * 0.6}rpx`,
        borderLeft: `${size * 0.08}rpx solid ${color}`,
        borderRight: `${size * 0.08}rpx solid ${color}`,
        borderBottom: `${size * 0.08}rpx solid ${color}`,
        borderRadius: `0 0 ${size * 0.1}rpx ${size * 0.1}rpx`,
        position: 'relative'
      }}>
        <View style={{
          position: 'absolute',
          top: `-${size * 0.25}rpx`,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: `${size * 0.45}rpx solid transparent`,
          borderRight: `${size * 0.45}rpx solid transparent`,
          borderBottom: `${size * 0.3}rpx solid ${color}`
        }} />
      </View>
    </View>
  )
}

// 分析/图表图标
export function IconChart({ size = 48, color = '#94a3b8', className = '' }: IconProps) {
  return (
    <View 
      className={className}
      style={{ 
        width: `${size}rpx`, 
        height: `${size}rpx`,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: `${size * 0.1}rpx`
      }}
    >
      <View style={{ width: `${size * 0.15}rpx`, height: `${size * 0.4}rpx`, background: color, borderRadius: `${size * 0.05}rpx` }} />
      <View style={{ width: `${size * 0.15}rpx`, height: `${size * 0.7}rpx`, background: color, borderRadius: `${size * 0.05}rpx` }} />
      <View style={{ width: `${size * 0.15}rpx`, height: `${size * 0.55}rpx`, background: color, borderRadius: `${size * 0.05}rpx` }} />
    </View>
  )
}

// 设置图标
export function IconSettings({ size = 48, color = '#94a3b8', className = '' }: IconProps) {
  return (
    <View 
      className={className}
      style={{ 
        width: `${size}rpx`, 
        height: `${size}rpx`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <View style={{
        width: `${size * 0.5}rpx`,
        height: `${size * 0.5}rpx`,
        border: `${size * 0.08}rpx solid ${color}`,
        borderRadius: '50%'
      }} />
    </View>
  )
}

// 相机图标
export function IconCamera({ size = 48, color = '#ffffff', className = '' }: IconProps) {
  return (
    <View 
      className={className}
      style={{ 
        width: `${size}rpx`, 
        height: `${size}rpx`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <View style={{
        width: `${size * 0.7}rpx`,
        height: `${size * 0.5}rpx`,
        border: `${size * 0.06}rpx solid ${color}`,
        borderRadius: `${size * 0.1}rpx`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <View style={{
          width: `${size * 0.2}rpx`,
          height: `${size * 0.2}rpx`,
          border: `${size * 0.05}rpx solid ${color}`,
          borderRadius: '50%'
        }} />
      </View>
    </View>
  )
}

// 编辑/铅笔图标
export function IconEdit({ size = 48, color = '#3b82f6', className = '' }: IconProps) {
  return (
    <View 
      className={className}
      style={{ 
        width: `${size}rpx`, 
        height: `${size}rpx`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <View style={{
        width: `${size * 0.15}rpx`,
        height: `${size * 0.6}rpx`,
        background: color,
        borderRadius: `${size * 0.05}rpx`,
        transform: 'rotate(-45deg)'
      }} />
    </View>
  )
}

// 心跳图标
export function IconHeart({ size = 48, color = '#ffffff', className = '' }: IconProps) {
  return (
    <View 
      className={className}
      style={{ 
        width: `${size}rpx`, 
        height: `${size}rpx`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `${size * 0.8}rpx`
      }}
    >
      ❤️
    </View>
  )
}

