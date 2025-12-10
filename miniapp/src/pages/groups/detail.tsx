import { useState } from 'react'
import { View, Text, Image, Button } from '@tarojs/components'
import Taro, { useLoad, useRouter, useShareAppMessage } from '@tarojs/taro'
import { getUserInfo } from '../../lib/auth'
import { getGroupDetail, deleteGroup, Group, GroupMember } from '../../lib/groups'
import './detail.scss'
// @ts-ignore
import DEFAULT_AVATAR from '../../assets/icons/avatar.png'

// 血压状态判断
const getBPStatus = (systolic: number, diastolic: number) => {
  if (systolic >= 180 || diastolic >= 110) return { label: '3级高血压', color: 'high-3' }
  if (systolic >= 160 || diastolic >= 100) return { label: '2级高血压', color: 'high-2' }
  if (systolic >= 140 || diastolic >= 90) return { label: '1级高血压', color: 'high-1' }
  if (systolic >= 130) return { label: '前期高血压', color: 'prehigh' }
  if (systolic >= 120 || diastolic >= 80) return { label: '正常', color: 'normal' }
  return { label: '理想', color: 'ideal' }
}

// 格式化时间
const formatTime = (isoString: string) => {
  const date = new Date(isoString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`

  return `${date.getMonth() + 1}/${date.getDate()}`
}

export default function GroupDetail() {
  const router = useRouter()
  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')

  useLoad(() => {
    loadGroupDetail()
  })

  // 配置分享
  useShareAppMessage(() => {
    if (!group) {
      return {
        title: '邀请你加入血压监测组',
        path: '/pages/groups/index'
      }
    }
    return {
      title: `邀请你加入「${group.name}」`,
      path: `/pages/groups/join?code=${group.invite_code}`,
      imageUrl: '' // 可以设置自定义分享图片
    }
  })

  const loadGroupDetail = async () => {
    const groupId = parseInt(router.params.id || '0')
    if (!groupId) {
      Taro.showToast({ title: '参数错误', icon: 'none' })
      return
    }

    const userInfo = getUserInfo()
    if (userInfo?.openid) {
      setUserId(userInfo.openid)
    }

    setLoading(true)
    const result = await getGroupDetail(groupId)

    if (result.success) {
      setGroup(result.group || null)
      setMembers(result.members || [])
    } else {
      Taro.showToast({ title: result.error || '加载失败', icon: 'none' })
    }
    setLoading(false)
  }

  const handleCopyInviteCode = () => {
    if (!group?.invite_code) return

    Taro.setClipboardData({
      data: group.invite_code,
      success: () => {
        Taro.showToast({ title: '已复制邀请码', icon: 'success' })
      }
    })
  }

  const handleDeleteGroup = async () => {
    if (!group) return

    const res = await Taro.showModal({
      title: '确认删除',
      content: '删除后，所有成员将被移除，且无法恢复',
      confirmText: '删除',
      confirmColor: '#ef4444'
    })

    if (!res.confirm) return

    Taro.showLoading({ title: '删除中...' })
    const result = await deleteGroup(group.id, userId)
    Taro.hideLoading()

    if (result.success) {
      Taro.showToast({ title: '已删除', icon: 'success' })
      setTimeout(() => {
        Taro.navigateBack()
      }, 1000)
    } else {
      Taro.showToast({ title: result.error || '删除失败', icon: 'none' })
    }
  }

  const getRoleText = (role?: string) => {
    switch (role) {
      case 'owner': return '创建者'
      case 'admin': return '管理员'
      default: return '成员'
    }
  }

  const isOwner = group?.owner_id === userId

  if (loading) {
    return (
      <View className='page'>
        <View className='loading'>加载中...</View>
      </View>
    )
  }

  if (!group) {
    return (
      <View className='page'>
        <View className='loading'>组不存在</View>
      </View>
    )
  }

  return (
    <View className='page'>
      {/* 组信息卡片 */}
      <View className='group-header'>
        <Text className='group-name'>{group.name}</Text>
        {group.description && (
          <Text className='group-desc'>{group.description}</Text>
        )}
        <View className='invite-section' onClick={handleCopyInviteCode}>
          <Text className='invite-label'>邀请码：</Text>
          <Text className='invite-code'>{group.invite_code}</Text>
          <Text className='copy-btn'>复制</Text>
        </View>

        {/* 邀请方式 */}
        <View className='invite-actions'>
          <View className='invite-action' onClick={handleCopyInviteCode}>
            <Text className='action-text'>复制邀请码</Text>
          </View>
          <Button className='invite-action share-btn' openType='share'>
            <Text className='action-text'>分享给好友</Text>
          </Button>
        </View>
      </View>

      {/* 成员列表 */}
      <View className='section'>
        <Text className='section-title'><Text className='title-icon'>👥</Text><Text>成员 ({members.length})</Text></Text>

        <View className='member-list'>
          {members.map(member => {
            const record = member.latest_record
            const status = record ? getBPStatus(record.systolic, record.diastolic) : null

            return (
              <View key={member.id} className='member-card'>
                <Image
                  className='member-avatar'
                  src={member.user?.avatar_url || DEFAULT_AVATAR}
                  mode='aspectFill'
                />
                <View className='member-info'>
                  <View className='member-name-row'>
                    <Text className='member-name'>
                      {member.nickname || member.user?.nickname || '未设置昵称'}
                    </Text>
                    <Text className='member-role'>{getRoleText(member.role)}</Text>
                  </View>

                  {record ? (
                    <View className='bp-info'>
                      <View className='bp-values'>
                        <Text className='bp-num'>{record.systolic}/{record.diastolic}</Text>
                        <Text className='bp-unit'>mmHg</Text>
                        <Text className='pulse'>💓 {record.pulse}</Text>
                      </View>
                      <View className='bp-meta'>
                        <View className={`status-badge ${status?.color}`}>
                          <Text className='badge-text'>{status?.label}</Text>
                        </View>
                        <Text className='bp-time'>{formatTime(record.recorded_at)}</Text>
                      </View>
                    </View>
                  ) : (
                    <Text className='no-record'>暂无血压记录</Text>
                  )}
                </View>
              </View>
            )
          })}
        </View>
      </View>

      {/* 操作按钮 - 仅组主可见 */}
      {isOwner && (
        <View className='danger-section'>
          <View className='danger-btn' onClick={handleDeleteGroup}>
            <Text className='danger-text'>解散此组</Text>
          </View>
        </View>
      )}
    </View>
  )
}

