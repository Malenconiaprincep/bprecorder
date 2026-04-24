import { useState, useMemo, useCallback } from 'react'
import { View, Text, ScrollView, Image } from '@tarojs/components'
import Taro, { useLoad, useDidShow } from '@tarojs/taro'
import { getRecords, BPRecord, deleteRecord } from '../../lib/supabase'
import { getUserInfo } from '../../lib/auth'
import { USE_TEST_DATA, getTestData } from '../../utils/testData'
import { getBPStatus, BPStatusColor } from '../../utils/bpStatus'
import './index.scss'
// @ts-ignore
import iconHeart from '../../assets/icons/heart.png'
// @ts-ignore
import iconNote from '../../assets/icons/note.png'

type StatusFilter = 'all' | 'ideal' | 'prehigh' | 'low' | 'high'

const FILTER_CHIPS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'ideal', label: '正常' },
  { key: 'prehigh', label: '偏高' },
  { key: 'low', label: '偏低' },
  { key: 'high', label: '高血压' }
]

const getLocalDateKey = (input: string | Date): string => {
  const d = typeof input === 'string' ? new Date(input) : new Date(input.getTime())
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const formatDateFullCn = (dateKey: string) => {
  const [y, m, d] = dateKey.split('-').map(Number)
  return `${y}年${m}月${d}日`
}

const formatRelativeDay = (dateKey: string) => {
  const todayStr = getLocalDateKey(new Date())
  const yest = new Date()
  yest.setDate(yest.getDate() - 1)
  const yesterdayStr = getLocalDateKey(yest)
  if (dateKey === todayStr) return '今天'
  if (dateKey === yesterdayStr) return '昨天'
  return ''
}

const formatTimeHm = (isoString: string) => {
  const date = new Date(isoString)
  const h = date.getHours().toString().padStart(2, '0')
  const min = date.getMinutes().toString().padStart(2, '0')
  return `${h}:${min}`
}

function recordMatchesFilter(record: BPRecord, filter: StatusFilter): boolean {
  if (filter === 'all') return true
  const { color } = getBPStatus(record.systolic, record.diastolic)
  if (filter === 'ideal') return color === 'ideal'
  if (filter === 'prehigh') return color === 'prehigh'
  if (filter === 'low') return color === 'low'
  if (filter === 'high') return color === 'high-1' || color === 'high-2' || color === 'high-3'
  return true
}

function statusDotClass(color: BPStatusColor): string {
  if (color === 'ideal') return 'dot-ideal'
  if (color === 'low') return 'dot-low'
  if (color === 'prehigh') return 'dot-prehigh'
  return 'dot-high'
}

export default function AllRecordsPage() {
  const [records, setRecords] = useState<BPRecord[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const fetchRecords = useCallback(async (userId: string) => {
    if (USE_TEST_DATA) {
      setRecords(getTestData())
      return
    }
    try {
      const { data, error } = await getRecords(userId)
      if (!error && data) setRecords(data)
    } catch (e) {
      console.error('Failed to fetch records', e)
    }
  }, [])

  useLoad(async () => {
    if (USE_TEST_DATA) {
      setRecords(getTestData())
      return
    }
    const storedUser = getUserInfo()
    if (storedUser) await fetchRecords(storedUser.openid)
  })

  useDidShow(() => {
    if (USE_TEST_DATA) {
      setRecords(getTestData())
      return
    }
    const storedUser = getUserInfo()
    if (storedUser) fetchRecords(storedUser.openid)
  })

  const filteredRecords = useMemo(
    () => records.filter(r => recordMatchesFilter(r, statusFilter)),
    [records, statusFilter]
  )

  const groupedByDate = useMemo(() => {
    const map = new Map<string, BPRecord[]>()
    filteredRecords.forEach(r => {
      const key = getLocalDateKey(r.recorded_at)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    })
    const keys = Array.from(map.keys()).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    return keys.map(dateKey => ({
      dateKey,
      records: map.get(dateKey)!.sort(
        (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
      )
    }))
  }, [filteredRecords])

  const openFilterSheet = () => {
    Taro.showActionSheet({
      itemList: FILTER_CHIPS.map(c => c.label),
      success: res => {
        const chip = FILTER_CHIPS[res.tapIndex]
        if (chip) setStatusFilter(chip.key)
      }
    })
  }

  const handleRecordAction = (record: BPRecord) => {
    Taro.showActionSheet({
      itemList: ['编辑记录', '删除记录'],
      itemColor: '#1e293b',
      success: async (res) => {
        if (res.tapIndex === 0) {
          const p = new URLSearchParams()
          p.set('id', String(record.id!))
          if (record.recorded_at) {
            const ms = new Date(record.recorded_at).getTime()
            if (!Number.isNaN(ms)) p.set('t', String(ms))
          }
          p.set('systolic', String(record.systolic))
          p.set('diastolic', String(record.diastolic))
          p.set('pulse', String(record.pulse))
          p.set('hand', record.hand || '')
          p.set('note', record.note || '')
          Taro.navigateTo({ url: `/pages/input/index?${p.toString()}` })
        } else if (res.tapIndex === 1) {
          const confirmRes = await Taro.showModal({
            title: '确认删除',
            content: '删除后无法恢复，确定要删除这条记录吗？',
            confirmText: '删除',
            confirmColor: '#ef4444'
          })
          if (!confirmRes.confirm || record.id == null) return
          const { error } = await deleteRecord(record.id)
          if (error) {
            Taro.showToast({ title: error, icon: 'none' })
            return
          }
          setRecords(prev => prev.filter(r => r.id !== record.id))
          Taro.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  }

  const goAddRecord = () => {
    Taro.navigateTo({ url: '/pages/input/index' })
  }

  return (
    <View className='all-records-page'>
      <ScrollView
        className='all-records-scroll'
        scrollY
        enhanced
        showScrollbar={false}
      >
        <View className='filter-toolbar'>
          <View className='filter-chips'>
            {FILTER_CHIPS.map(chip => (
              <View
                key={chip.key}
                className={`filter-chip filter-chip--${chip.key} ${statusFilter === chip.key ? 'active' : ''}`}
                onClick={() => setStatusFilter(chip.key)}
              >
                <Text className='filter-chip-text'>{chip.label}</Text>
              </View>
            ))}
          </View>
          <View className='filter-sheet-entry' onClick={openFilterSheet}>
            <Text className='filter-sheet-text'>筛选</Text>
          </View>
        </View>

        {groupedByDate.length === 0 ? (
          <View className='all-records-empty'>
            <Text className='all-records-empty-title'>
              {records.length === 0 ? '暂无记录' : '没有符合条件的记录'}
            </Text>
            <Text className='all-records-empty-hint'>
              {records.length === 0 ? '点击下方按钮开始记录血压' : '试试切换上方筛选'}
            </Text>
          </View>
        ) : (
          groupedByDate.map(group => (
            <View key={group.dateKey} className='date-section'>
              <View className='date-section-header'>
                <View className='date-section-titles'>
                  <Text className='date-section-full'>{formatDateFullCn(group.dateKey)}</Text>
                  {formatRelativeDay(group.dateKey) ? (
                    <Text className='date-section-rel'>{formatRelativeDay(group.dateKey)}</Text>
                  ) : null}
                </View>
                <View className='date-section-meta'>
                  <Text className='date-section-count'>共{group.records.length}条</Text>
                  <Text className='date-section-chevron'>›</Text>
                </View>
              </View>

              {group.records.map(record => {
                const status = getBPStatus(record.systolic, record.diastolic)
                return (
                  <View
                    key={record.id ?? record.recorded_at}
                    className='ar-record-card'
                    onClick={() => handleRecordAction(record)}
                  >
                    <View className='ar-record-row1'>
                      <Text className='ar-record-time'>{formatTimeHm(record.recorded_at)}</Text>
                      <View className='ar-record-status-inline'>
                        <View className={`ar-status-dot ${statusDotClass(status.color)}`} />
                        <Text className='ar-status-label'>{status.label}</Text>
                      </View>
                    </View>
                    <View className='ar-record-row2'>
                      <View className='ar-bp-block'>
                        <Text className='ar-bp-line'>
                          <Text className='ar-sys'>{record.systolic}</Text>
                          <Text className='ar-bp-slash'>/</Text>
                          <Text className='ar-dia'>{record.diastolic}</Text>
                        </Text>
                        <Text className='ar-bp-unit'>mmHg</Text>
                      </View>
                      <View className='ar-pulse-block'>
                        <Image className='ar-pulse-icon' src={iconHeart} mode='aspectFit' />
                        <Text className='ar-pulse-val'>{record.pulse}</Text>
                        <Text className='ar-pulse-unit'>次/分</Text>
                      </View>
                    </View>
                    <View className='ar-record-row3'>
                      <View className='ar-note-left'>
                        {record.note ? (
                          <>
                            <Image className='ar-note-icon' src={iconNote} mode='aspectFit' />
                            <Text className='ar-note-text' numberOfLines={2}>
                              备注：{record.note}
                            </Text>
                          </>
                        ) : record.hand ? (
                          <Text className='ar-note-text ar-note-muted'>
                            {record.hand === 'left' ? '左臂测量' : '右臂测量'}
                          </Text>
                        ) : (
                          <Text className='ar-note-text ar-note-placeholder'> </Text>
                        )}
                      </View>
                      <Text className='ar-row-arrow'>›</Text>
                    </View>
                  </View>
                )
              })}
            </View>
          ))
        )}

        <View className='all-records-scroll-pad' />
      </ScrollView>

      <View className='all-records-fab-wrap'>
        <View className='all-records-fab' onClick={goAddRecord}>
          <Text className='all-records-fab-text'>+ 记录血压</Text>
        </View>
      </View>
    </View>
  )
}
