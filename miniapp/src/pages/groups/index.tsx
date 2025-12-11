import { useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { getUserInfo } from '../../lib/auth'
import { getMyGroups, createGroup, joinGroup, Group } from '../../lib/groups'
import './index.scss'
// @ts-ignore
import DEFAULT_AVATAR from '../../assets/icons/avatar.png'

export default function Groups() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [userId, setUserId] = useState('')

  useDidShow(() => {
    loadGroups()
  })

  const loadGroups = async () => {
    const userInfo = getUserInfo()
    if (!userInfo?.openid) {
      setLoading(false)
      return
    }

    setUserId(userInfo.openid)
    setLoading(true)

    const result = await getMyGroups(userInfo.openid)
    if (result.success && result.groups) {
      setGroups(result.groups)
    }
    setLoading(false)
  }

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      Taro.showToast({ title: '请输入组名', icon: 'none' })
      return
    }

    if (!userId) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    Taro.showLoading({ title: '创建中...' })

    const result = await createGroup({
      name: newGroupName.trim(),
      description: newGroupDesc.trim(),
      owner_id: userId
    })

    Taro.hideLoading()

    if (result.success) {
      Taro.showToast({ title: '创建成功', icon: 'success' })
      setShowCreateModal(false)
      setNewGroupName('')
      setNewGroupDesc('')
      loadGroups()
    } else {
      Taro.showToast({ title: result.error || '创建失败', icon: 'none' })
    }
  }

  const handleJoinGroup = async () => {
    if (!inviteCode.trim()) {
      Taro.showToast({ title: '请输入邀请码', icon: 'none' })
      return
    }

    if (!userId) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    Taro.showLoading({ title: '加入中...' })

    const result = await joinGroup({
      invite_code: inviteCode.trim(),
      user_id: userId
    })

    Taro.hideLoading()

    if (result.success) {
      Taro.showToast({ title: '加入成功', icon: 'success' })
      setShowJoinModal(false)
      setInviteCode('')
      loadGroups()
    } else {
      Taro.showToast({ title: result.error || '加入失败', icon: 'none' })
    }
  }

  const goToDetail = (groupId: number) => {
    Taro.navigateTo({ url: `/pages/groups/detail?id=${groupId}` })
  }

  const getRoleText = (role?: string) => {
    switch (role) {
      case 'owner': return '创建者'
      case 'admin': return '管理员'
      default: return '成员'
    }
  }

  if (loading) {
    return (
      <View className='page'>
        <View className='loading'>加载中...</View>
      </View>
    )
  }

  return (
    <View className='page'>
      {/* 操作按钮 */}
      <View className='actions'>
        <View className='action-btn create' onClick={() => setShowCreateModal(true)}>
          <Text className='action-icon'>+</Text>
          <Text className='action-text'>创建组</Text>
        </View>
        <View className='action-btn join' onClick={() => setShowJoinModal(true)}>
          <Text className='action-icon'>+</Text>
          <Text className='action-text'>加入组</Text>
        </View>
      </View>

      {/* 组列表 */}
      <View className='section'>
        <Text className='section-title'><Text className='title-icon'>👥</Text><Text>我的组</Text></Text>

        {groups.length === 0 ? (
          <View className='empty'>
            <Text className='empty-icon'>📋</Text>
            <Text className='empty-text'>还没有加入任何组</Text>
            <Text className='empty-hint'>创建一个组或通过邀请码加入</Text>
          </View>
        ) : (
          <View className='group-list'>
            {groups.map(group => (
              <View key={group.id} className='group-card' onClick={() => goToDetail(group.id)}>
                <View className='group-info'>
                  <Text className='group-name'>{group.name}</Text>
                  {group.description && (
                    <Text className='group-desc'>{group.description}</Text>
                  )}
                  <View className='group-meta'>
                    <Text className={`role-badge ${group.my_role === 'owner' ? 'owner' : ''}`}>
                      {getRoleText(group.my_role)}
                    </Text>
                  </View>
                </View>
                <Text className='group-arrow'>›</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 创建组弹窗 */}
      {showCreateModal && (
        <View className='modal-mask' onClick={() => setShowCreateModal(false)}>
          <View className='modal-content' onClick={e => e.stopPropagation()}>
            <Text className='modal-title'>创建新组</Text>
            <Input
              className='modal-input'
              placeholder='组名称（必填）'
              value={newGroupName}
              onInput={e => setNewGroupName(e.detail.value)}
            />
            <Input
              className='modal-input'
              placeholder='组描述（选填）'
              value={newGroupDesc}
              onInput={e => setNewGroupDesc(e.detail.value)}
            />
            <View className='modal-buttons'>
              <View className='modal-btn cancel' onClick={() => setShowCreateModal(false)}>
                <Text>取消</Text>
              </View>
              <View className='modal-btn confirm' onClick={handleCreateGroup}>
                <Text>创建</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* 加入组弹窗 */}
      {showJoinModal && (
        <View className='modal-mask' onClick={() => setShowJoinModal(false)}>
          <View className='modal-content' onClick={e => e.stopPropagation()}>
            <Text className='modal-title'>加入组</Text>
            <Input
              className='modal-input'
              placeholder='输入邀请码'
              value={inviteCode}
              onInput={e => setInviteCode(e.detail.value.toUpperCase())}
              maxlength={8}
            />
            <View className='modal-buttons'>
              <View className='modal-btn cancel' onClick={() => setShowJoinModal(false)}>
                <Text>取消</Text>
              </View>
              <View className='modal-btn confirm' onClick={handleJoinGroup}>
                <Text>加入</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

