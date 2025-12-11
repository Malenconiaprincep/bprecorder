import { useState, useCallback } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro, { useLoad, useRouter, useReachBottom } from '@tarojs/taro'
import { getMemberRecords, GroupMember, BPRecord, Pagination } from '../../lib/groups'
import './member.scss'
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

// 格式化日期
const formatDate = (isoString: string) => {
  const date = new Date(isoString)
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${month}月${day}日 ${hours}:${minutes}`
}

// 判断是否是今天
const isToday = (isoString: string) => {
  const date = new Date(isoString)
  const today = new Date()
  return date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
}

// 按日期分组记录
const groupRecordsByDate = (records: BPRecord[]) => {
  const groups: { date: string; label: string; records: BPRecord[] }[] = []

  records.forEach(record => {
    const date = new Date(record.recorded_at)
    const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`

    let label: string
    if (isToday(record.recorded_at)) {
      label = '今天'
    } else {
      label = `${date.getMonth() + 1}月${date.getDate()}日`
    }

    const existingGroup = groups.find(g => g.date === dateKey)
    if (existingGroup) {
      existingGroup.records.push(record)
    } else {
      groups.push({ date: dateKey, label, records: [record] })
    }
  })

  return groups
}

export default function MemberDetail() {
  const router = useRouter()
  const [member, setMember] = useState<GroupMember | null>(null)
  const [records, setRecords] = useState<BPRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [pagination, setPagination] = useState<Pagination | null>(null)

  const groupId = parseInt(router.params.groupId || '0')
  const memberId = router.params.memberId || ''

  useLoad(() => {
    loadMemberRecords(1)
  })

  // 触底加载更多
  useReachBottom(() => {
    if (pagination?.hasMore && !loadingMore) {
      loadMemberRecords(pagination.page + 1)
    }
  })

  const loadMemberRecords = useCallback(async (page: number) => {
    if (!groupId || !memberId) {
      Taro.showToast({ title: '参数错误', icon: 'none' })
      return
    }

    if (page === 1) {
      setLoading(true)
    } else {
      setLoadingMore(true)
    }

    const result = await getMemberRecords(groupId, memberId, page, 20)

    if (result.success) {
      if (page === 1) {
        // 首页：设置成员信息和记录
        setMember(result.member || null)
        setRecords(result.records || [])
        // 设置导航栏标题
        const name = result.member?.nickname || result.member?.user?.nickname || '成员详情'
        Taro.setNavigationBarTitle({ title: name })
      } else {
        // 加载更多：追加记录
        setRecords(prev => [...prev, ...(result.records || [])])
      }
      setPagination(result.pagination || null)
    } else {
      Taro.showToast({ title: result.error || '加载失败', icon: 'none' })
    }

    setLoading(false)
    setLoadingMore(false)
  }, [groupId, memberId])

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

  if (!member) {
    return (
      <View className='page'>
        <View className='loading'>成员不存在</View>
      </View>
    )
  }

  const recordGroups = groupRecordsByDate(records)

  return (
    <View className='page'>
      {/* 成员信息卡片 */}
      <View className='member-header'>
        <Image
          className='member-avatar'
          src={member.user?.avatar_url || DEFAULT_AVATAR}
          mode='aspectFill'
        />
        <View className='member-info'>
          <Text className='member-name'>
            {member.nickname || member.user?.nickname || '未设置昵称'}
          </Text>
          <Text className='member-role'>{getRoleText(member.role)}</Text>
        </View>
      </View>

      {/* 记录列表 */}
      <View className='section'>
        <Text className='section-title'>
          <Text className='title-icon'>📊</Text>
          <Text>血压记录 ({pagination?.total || records.length})</Text>
        </Text>

        {records.length === 0 ? (
          <View className='empty'>
            <Text className='empty-icon'>📋</Text>
            <Text className='empty-text'>暂无血压记录</Text>
          </View>
        ) : (
          <View className='record-groups'>
            {recordGroups.map(group => (
              <View key={group.date} className='record-group'>
                <Text className='group-date'>{group.label}</Text>
                <View className='record-list'>
                  {group.records.map(record => {
                    const status = getBPStatus(record.systolic, record.diastolic)
                    const time = new Date(record.recorded_at)
                    const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`

                    return (
                      <View key={record.id} className='record-card'>
                        <View className='record-time'>{timeStr}</View>
                        <View className='record-main'>
                          <View className='bp-values'>
                            <Text className='bp-num'>{record.systolic}/{record.diastolic}</Text>
                            <Text className='bp-unit'>mmHg</Text>
                          </View>
                          <View className='record-extra'>
                            <Text className='pulse'>💓 {record.pulse}</Text>
                            {record.hand && (
                              <Text className='hand'>{record.hand === 'left' ? '左手' : '右手'}</Text>
                            )}
                          </View>
                        </View>
                        <View className={`status-badge ${status.color}`}>
                          <Text className='badge-text'>{status.label}</Text>
                        </View>
                      </View>
                    )
                  })}
                </View>
              </View>
            ))}

            {/* 加载更多提示 */}
            <View className='load-more'>
              {loadingMore ? (
                <Text className='load-more-text'>加载中...</Text>
              ) : pagination?.hasMore ? (
                <Text className='load-more-text'>上拉加载更多</Text>
              ) : (
                <Text className='load-more-text'>没有更多了</Text>
              )}
            </View>
          </View>
        )}
      </View>
    </View>
  )
}

