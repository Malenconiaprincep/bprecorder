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

/** 日期区间：含首尾最多 N 个自然日 */
const MAX_INTERVAL_DAYS_INCLUSIVE = 30

function dateKeyToTime(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

function inclusiveDayCount(startKey: string, endKey: string): number {
  const a = dateKeyToTime(startKey)
  const b = dateKeyToTime(endKey)
  return Math.floor((Math.max(a, b) - Math.min(a, b)) / 86400000) + 1
}

/** 排序为起止；超过最长天数则截断结束日并提示 */
function clampIntervalEndpoints(a: string, b: string): { start: string; end: string } {
  let s = a
  let e = b
  if (dateKeyToTime(s) > dateKeyToTime(e)) [s, e] = [e, s]
  if (inclusiveDayCount(s, e) <= MAX_INTERVAL_DAYS_INCLUSIVE) {
    return { start: s, end: e }
  }
  const [y, m, d] = s.split('-').map(Number)
  const endDt = new Date(y, m - 1, d + (MAX_INTERVAL_DAYS_INCLUSIVE - 1))
  const endClamped = getLocalDateKey(endDt)
  Taro.showToast({
    title: `区间最长${MAX_INTERVAL_DAYS_INCLUSIVE}天，已截断结束日`,
    icon: 'none'
  })
  return { start: s, end: endClamped }
}

function recordInClosedInterval(r: BPRecord, start: string, end: string): boolean {
  const k = getLocalDateKey(r.recorded_at)
  return k >= start && k <= end
}

export default function AllRecordsPage() {
  const [records, setRecords] = useState<BPRecord[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  /** 闭区间 [start,end]，null 为不限日期；单日为 start===end */
  const [dateInterval, setDateInterval] = useState<{ start: string; end: string } | null>(null)
  /** 已点第一日，待点第二日定区间 */
  const [intervalAnchor, setIntervalAnchor] = useState<string | null>(null)
  const [showFilterModal, setShowFilterModal] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())

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
    () =>
      records.filter(r => {
        if (!recordMatchesFilter(r, statusFilter)) return false
        if (dateInterval) {
          if (!recordInClosedInterval(r, dateInterval.start, dateInterval.end)) return false
        }
        return true
      }),
    [records, statusFilter, dateInterval]
  )

  const dateRecordInfo = useMemo(() => {
    const info: Record<string, { count: number }> = {}
    records.forEach(r => {
      const k = getLocalDateKey(r.recorded_at)
      if (!info[k]) info[k] = { count: 0 }
      info[k].count++
    })
    return info
  }, [records])

  const calendarGrid = useMemo(() => {
    const year = calendarMonth.getFullYear()
    const month = calendarMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const firstDayWeek = firstDay.getDay()
    const startOffset = firstDayWeek === 0 ? 6 : firstDayWeek - 1
    const cells: Array<{ dateKey: string; day: number; count: number } | null> = []
    for (let i = 0; i < startOffset; i++) cells.push(null)
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const count = dateRecordInfo[dateKey]?.count ?? 0
      cells.push({ dateKey, day, count })
    }
    return cells
  }, [calendarMonth, dateRecordInfo])

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

  const openFilterModal = () => {
    if (dateInterval) {
      const [y, m] = dateInterval.start.split('-').map(Number)
      setCalendarMonth(new Date(y, m - 1, 1))
    } else {
      setCalendarMonth(new Date())
    }
    setShowFilterModal(true)
  }

  const clearDateFilter = () => {
    setDateInterval(null)
    setIntervalAnchor(null)
  }

  const closeFilterModal = () => setShowFilterModal(false)

  const changeCalendarMonth = (dir: 'prev' | 'next') => {
    const d = new Date(calendarMonth)
    d.setMonth(d.getMonth() + (dir === 'next' ? 1 : -1))
    setCalendarMonth(d)
  }

  const onCalendarDayTap = (dateKey: string) => {
    if (intervalAnchor == null) {
      setIntervalAnchor(dateKey)
      setDateInterval({ start: dateKey, end: dateKey })
      return
    }
    const clamped = clampIntervalEndpoints(intervalAnchor, dateKey)
    setDateInterval(clamped)
    setIntervalAnchor(null)
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
          <ScrollView
            className='filter-chips-scroll'
            scrollX
            enhanced
            showScrollbar={false}
          >
            <View className='filter-chips-inner'>
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
          </ScrollView>
          <View className='filter-sheet-entry' onClick={openFilterModal}>
            <Text className='filter-sheet-text'>筛选</Text>
            {(dateInterval || intervalAnchor != null || statusFilter !== 'all') && (
              <View className='filter-sheet-dot' />
            )}
          </View>
        </View>

        {(dateInterval || statusFilter !== 'all') && (
          <View className='filter-active-hint'>
            {statusFilter !== 'all' && (
              <Text className='filter-active-hint-text'>
                状态：{FILTER_CHIPS.find(c => c.key === statusFilter)?.label}
              </Text>
            )}
            {dateInterval && (
              <Text className='filter-active-hint-text'>
                {statusFilter !== 'all' ? ' · ' : ''}
                日期：{formatDateFullCn(dateInterval.start)}～{formatDateFullCn(dateInterval.end)}
                （共{inclusiveDayCount(dateInterval.start, dateInterval.end)}天）
              </Text>
            )}
            <Text
              className='filter-active-hint-clear'
              onClick={() => {
                setStatusFilter('all')
                clearDateFilter()
              }}
            >
              清除
            </Text>
          </View>
        )}

        {groupedByDate.length === 0 ? (
          <View className='all-records-empty'>
            <Text className='all-records-empty-title'>
              {records.length === 0 ? '暂无记录' : '没有符合条件的记录'}
            </Text>
            <Text className='all-records-empty-hint'>
              {records.length === 0
                ? '点击下方按钮开始记录血压'
                : '试试调整状态、日期筛选或点「筛选」选日期'}
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

      {showFilterModal && (
        <View className='filter-modal-root'>
          <View className='filter-modal-mask' onClick={closeFilterModal} />
          <View className='filter-modal-panel' catchMove>
            <View className='filter-modal-header'>
              <Text className='filter-modal-title'>筛选</Text>
              <View className='filter-modal-close' onClick={closeFilterModal}>
                <Text>×</Text>
              </View>
            </View>

            <Text className='filter-modal-section-label'>血压状态</Text>
            <ScrollView scrollX className='filter-modal-chips-scroll' enhanced showScrollbar={false}>
              <View className='filter-modal-chips-inner'>
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
            </ScrollView>

            <View className='filter-modal-section-row'>
              <Text className='filter-modal-section-label filter-modal-section-label--inline'>测量日期</Text>
              <Text className='filter-date-tip'>限制30天内</Text>
              <Text className='filter-date-clear-link' onClick={clearDateFilter}>
                清除日期
              </Text>
            </View>

            <View className='filter-modal-cal-nav'>
              <View className='filter-cal-nav-btn' onClick={() => changeCalendarMonth('prev')}>
                <Text className='filter-cal-nav-icon'>‹</Text>
              </View>
              <Text className='filter-cal-month-text'>
                {calendarMonth.getFullYear()}年{calendarMonth.getMonth() + 1}月
              </Text>
              <View className='filter-cal-nav-btn' onClick={() => changeCalendarMonth('next')}>
                <Text className='filter-cal-nav-icon'>›</Text>
              </View>
            </View>

            <View className='filter-cal-weekdays'>
              {['一', '二', '三', '四', '五', '六', '日'].map((w, i) => (
                <View key={i} className='filter-cal-weekday'>
                  <Text className='filter-cal-weekday-t'>{w}</Text>
                </View>
              ))}
            </View>

            <View className='filter-cal-days'>
              {calendarGrid.map((cell, idx) => {
                if (!cell) {
                  return <View key={`e-${idx}`} className='filter-cal-cell filter-cal-cell--empty' />
                }
                const todayKey = getLocalDateKey(new Date())
                const isToday = cell.dateKey === todayKey
                const has = cell.count > 0
                const inInterval =
                  dateInterval != null &&
                  cell.dateKey >= dateInterval.start &&
                  cell.dateKey <= dateInterval.end
                const isIntervalEnd =
                  dateInterval != null &&
                  (cell.dateKey === dateInterval.start || cell.dateKey === dateInterval.end)
                const isIntervalPickingFirst =
                  intervalAnchor != null && intervalAnchor === cell.dateKey
                return (
                  <View
                    key={cell.dateKey}
                    className={`filter-cal-cell ${has ? 'has-data' : ''} ${isToday ? 'is-today' : ''} ${inInterval ? 'is-in-interval' : ''} ${isIntervalEnd ? 'is-interval-end' : ''} ${isIntervalPickingFirst ? 'is-interval-pick-first' : ''}`}
                    onClick={() => onCalendarDayTap(cell.dateKey)}
                  >
                    <Text className={`filter-cal-day-num ${isToday ? 'today' : ''}`}>{cell.day}</Text>
                    {has && cell.count > 1 && (
                      <Text className='filter-cal-day-count'>{cell.count}</Text>
                    )}
                  </View>
                )
              })}
            </View>

            <Text className='filter-cal-legend'>
              点两次定起止日（同一天即单日）；含首尾最多 {MAX_INTERVAL_DAYS_INCLUSIVE} 天，超出自动截断结束日。
            </Text>

            <View className='filter-modal-done' onClick={closeFilterModal}>
              <Text className='filter-modal-done-text'>完成</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
