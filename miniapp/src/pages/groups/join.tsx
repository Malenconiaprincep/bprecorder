import { useState } from 'react'
import { View, Text, Input, Image } from '@tarojs/components'
import Taro, { useLoad, useRouter } from '@tarojs/taro'
import { getUserInfo, silentLogin } from '../../lib/auth'
import { getGroupByInviteCode, joinGroup, Group } from '../../lib/groups'
import './join.scss'
// @ts-ignore
import iconGroups from '../../assets/icons/groups.png'

export default function JoinGroup() {
  const router = useRouter()
  const [inviteCode, setInviteCode] = useState('')
  const [group, setGroup] = useState<Group | null>(null)
  const [loading, setLoading] = useState(false)
  const [joining, setJoining] = useState(false)
  const [userId, setUserId] = useState('')

  useLoad(async () => {
    // 获取用户信息
    let userInfo = getUserInfo()
    if (!userInfo?.openid) {
      const result = await silentLogin()
      if (result.success && result.userInfo) {
        userInfo = result.userInfo
      }
    }
    if (userInfo?.openid) {
      setUserId(userInfo.openid)
    }

    // 如果 URL 中带有邀请码，自动查询
    const code = router.params.code
    if (code) {
      setInviteCode(code)
      await searchGroup(code)
    }
  })

  const searchGroup = async (code?: string) => {
    const codeToSearch = code || inviteCode
    if (!codeToSearch.trim()) {
      Taro.showToast({ title: '请输入邀请码', icon: 'none' })
      return
    }

    setLoading(true)
    const result = await getGroupByInviteCode(codeToSearch.trim())
    setLoading(false)

    if (result.success && result.group) {
      setGroup(result.group)
    } else {
      setGroup(null)
      Taro.showToast({ title: result.error || '邀请码无效', icon: 'none' })
    }
  }

  const handleJoin = async () => {
    if (!group || !userId) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    setJoining(true)
    const result = await joinGroup({
      invite_code: inviteCode,
      user_id: userId
    })
    setJoining(false)

    if (result.success) {
      Taro.showToast({ title: '加入成功！', icon: 'success' })
      setTimeout(() => {
        // 跳转到组列表页
        Taro.switchTab({ url: '/pages/groups/index' })
      }, 1500)
    } else {
      Taro.showToast({ title: result.error || '加入失败', icon: 'none' })
    }
  }

  return (
    <View className='page'>
      <View className='header'>
        <Text className='title'>加入监测组</Text>
        <Text className='subtitle'>输入邀请码或通过好友分享加入</Text>
      </View>

      {/* 输入邀请码 */}
      <View className='input-section'>
        <Input
          className='code-input'
          placeholder='输入邀请码'
          value={inviteCode}
          onInput={e => setInviteCode(e.detail.value.toUpperCase())}
          maxlength={8}
        />
        <View className='search-btn' onClick={() => searchGroup()}>
          <Text className='search-btn-text'>{loading ? '查询中...' : '查询'}</Text>
        </View>
      </View>

      {/* 组信息预览 */}
      {group && (
        <View className='group-preview'>
          <View className='preview-header'>
            <Image className='preview-icon' src={iconGroups} mode='aspectFit' />
            <View className='preview-info'>
              <Text className='preview-name'>{group.name}</Text>
              {group.description && (
                <Text className='preview-desc'>{group.description}</Text>
              )}
              <Text className='preview-count'>{group.member_count || 0} 位成员</Text>
            </View>
          </View>

          <View
            className={`join-btn ${joining ? 'disabled' : ''}`}
            onClick={!joining ? handleJoin : undefined}
          >
            <Text className='join-btn-text'>{joining ? '加入中...' : '立即加入'}</Text>
          </View>
        </View>
      )}

      {/* 提示 */}
      <View className='tips'>
        <Text className='tips-title'>💡 如何获取邀请码？</Text>
        <Text className='tips-text'>请联系组的创建者，获取邀请码或分享链接</Text>
      </View>
    </View>
  )
}

