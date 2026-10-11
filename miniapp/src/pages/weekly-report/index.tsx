import { useState, useMemo, useEffect } from 'react'
import { View, Text, ScrollView, Canvas, Button } from '@tarojs/components'
import Taro, { useLoad, useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { getRecords, type BPRecord } from '../../lib/supabase'
import { silentLogin, getUserInfo } from '../../lib/auth'
import { USE_TEST_DATA, getTestData } from '../../utils/testData'
import {
  computeWeeklyReport,
  inclusiveCalendarDaysBetween,
  type WeeklyReportRangeOpts
} from '../../utils/weeklyReport'
import { getBPStatus } from '../../utils/bpStatus'
import { generateWeeklyReportImage } from '../../utils/weeklyReportImage'
import './index.scss'

const CANVAS_W = 750
const CANVAS_H = 820

function formatShortDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function parseHand(h?: string): 'all' | 'left' | 'right' {
  if (h === 'left' || h === 'right') return h
  return 'all'
}

function readRangeFromRouter(): WeeklyReportRangeOpts | null {
  try {
    const p = Taro.getCurrentInstance()?.router?.params as Record<string, string> | undefined
    if (p?.start && p?.end) {
      return { startKey: p.start, endKey: p.end, hand: parseHand(p.hand) }
    }
  } catch {
    /* noop */
  }
  return null
}

export default function WeeklyReportPage() {
  const [records, setRecords] = useState<BPRecord[]>([])
  const [shareImagePath, setShareImagePath] = useState('')
  const [reportRange, setReportRange] = useState<WeeklyReportRangeOpts | null>(readRangeFromRouter)

  const stats = useMemo(() => computeWeeklyReport(records, reportRange), [records, reportRange])

  const loadRecords = async () => {
    if (USE_TEST_DATA) {
      setRecords(getTestData())
      return
    }
    let openid: string | undefined
    const stored = getUserInfo()
    if (stored?.openid) {
      openid = stored.openid
    } else {
      const result = await silentLogin()
      if (result.success && result.userInfo?.openid) {
        openid = result.userInfo.openid
      }
    }
    if (!openid) return
    try {
      const { data, error } = await getRecords(openid)
      if (!error && data) setRecords(data)
    } catch (e) {
      console.error('weekly-report loadRecords', e)
    }
  }

  useLoad((query: Record<string, string | undefined>) => {
    if (query?.start && query?.end) {
      setReportRange({ startKey: query.start, endKey: query.end, hand: parseHand(query.hand) })
    } else {
      setReportRange(null)
    }
    void loadRecords()
  })

  useEffect(() => {
    if (!stats) {
      setShareImagePath('')
      return
    }
    const timer = setTimeout(() => {
      generateWeeklyReportImage(stats)
        .then(setShareImagePath)
        .catch(() => setShareImagePath(''))
    }, 600)
    return () => clearTimeout(timer)
  }, [stats])

  useShareAppMessage(() => {
    const q =
      reportRange?.startKey && reportRange?.endKey
        ? `?start=${encodeURIComponent(reportRange.startKey)}&end=${encodeURIComponent(reportRange.endKey)}&hand=${encodeURIComponent(reportRange.hand ?? 'all')}`
        : ''
    if (!stats) {
      return {
        title: '血压总结',
        path: `/pages/weekly-report/index${q}`
      }
    }
    return {
      title: `近${stats.periodDayCount}天平均 ${stats.avgSystolic}/${stats.avgDiastolic} mmHg，共测${stats.count}次`,
      path: `/pages/weekly-report/index${q}`,
      imageUrl: shareImagePath || ''
    }
  })

  useShareTimeline(() => {
    if (!stats) {
      return { title: '血压总结' }
    }
    return {
      title: `近${stats.periodDayCount}天血压：${stats.avgSystolic}/${stats.avgDiastolic}，${stats.count}次测量`,
      imageUrl: shareImagePath || ''
    }
  })

  return (
    <View className='weekly-summary-root'>
      <ScrollView className='weekly-summary-page' scrollY enhanced showScrollbar={false}>
        <View className='content'>
          {!stats ? (
            <View className='empty-card'>
              <Text className='empty-title'>
                {reportRange?.startKey && reportRange?.endKey
                  ? `所选 ${inclusiveCalendarDaysBetween(reportRange.startKey, reportRange.endKey)} 天暂无记录`
                  : '近 7 天暂无记录'}
              </Text>
              <Text className='empty-hint'>坚持测量后，这里会显示时段小结与分享图</Text>
            </View>
          ) : (
            <>
              <View className='hero-card'>
                <Text className='hero-meta'>{stats.rangeLabel} · 共 {stats.count} 次</Text>
                {stats.handSplit.fallbackOverall ? (
                  <>
                    <Text className='hero-label'>平均血压</Text>
                    <View className='avg-row'>
                      <Text className='avg-sys'>{stats.handSplit.fallbackOverall.systolic}</Text>
                      <Text className='avg-slash'>/</Text>
                      <Text className='avg-dia'>{stats.handSplit.fallbackOverall.diastolic}</Text>
                      <Text className='avg-unit'>mmHg</Text>
                    </View>
                    <View className='avg-status'>
                      <Text className='avg-status-emoji'>
                        {getBPStatus(stats.handSplit.fallbackOverall.systolic, stats.handSplit.fallbackOverall.diastolic).emoji}
                      </Text>
                      <Text className='avg-status-label'>
                        {getBPStatus(stats.handSplit.fallbackOverall.systolic, stats.handSplit.fallbackOverall.diastolic).label}
                      </Text>
                    </View>
                  </>
                ) : (
                  <>
                    <View className='hero-hand-block'>
                      {stats.handSplit.left && (
                        <View className='hero-hand-line'>
                          <View>
                            <Text className='hero-sublabel'>左手平均 · {stats.handSplit.left.count} 次</Text>
                            <View className='avg-row hero-avg-tight'>
                              <Text className='avg-sys'>{stats.handSplit.left.systolic}</Text>
                              <Text className='avg-slash'>/</Text>
                              <Text className='avg-dia'>{stats.handSplit.left.diastolic}</Text>
                              <Text className='avg-unit'>mmHg</Text>
                            </View>
                          </View>
                          <View className='hero-tag'>
                            <Text className='hero-tag-emoji'>
                              {getBPStatus(stats.handSplit.left.systolic, stats.handSplit.left.diastolic).emoji}
                            </Text>
                            <Text className='hero-tag-label'>
                              {getBPStatus(stats.handSplit.left.systolic, stats.handSplit.left.diastolic).label}
                            </Text>
                          </View>
                        </View>
                      )}
                      {stats.handSplit.right && (
                        <View className='hero-hand-line'>
                          <View>
                            <Text className='hero-sublabel'>右手平均 · {stats.handSplit.right.count} 次</Text>
                            <View className='avg-row hero-avg-tight'>
                              <Text className='avg-sys'>{stats.handSplit.right.systolic}</Text>
                              <Text className='avg-slash'>/</Text>
                              <Text className='avg-dia'>{stats.handSplit.right.diastolic}</Text>
                              <Text className='avg-unit'>mmHg</Text>
                            </View>
                          </View>
                          <View className='hero-tag'>
                            <Text className='hero-tag-emoji'>
                              {getBPStatus(stats.handSplit.right.systolic, stats.handSplit.right.diastolic).emoji}
                            </Text>
                            <Text className='hero-tag-label'>
                              {getBPStatus(stats.handSplit.right.systolic, stats.handSplit.right.diastolic).label}
                            </Text>
                          </View>
                        </View>
                      )}
                    </View>
                    {stats.handSplit.unlabeledCount > 0 && (
                      <Text className='hero-hand-hint'>另有 {stats.handSplit.unlabeledCount} 次未标左右手，未计入上表</Text>
                    )}
                    <View className='hero-overall-pill'>
                      <Text className='hero-overall-text'>
                        全周期均（含未标） {stats.avgSystolic} / {stats.avgDiastolic} mmHg
                      </Text>
                    </View>
                  </>
                )}
              </View>

              <View className='card'>
                <Text className='card-title'>概览</Text>
                <View className='stat-grid'>
                  <View className='stat-item'>
                    <Text className='stat-label'>测量次数</Text>
                    <Text className='stat-value highlight'>{stats.count}</Text>
                  </View>
                  <View className='stat-item'>
                    <Text className='stat-label'>心率均值</Text>
                    <Text className='stat-value'>{stats.avgPulse} bpm</Text>
                  </View>
                  <View className='stat-item'>
                    <Text className='stat-label'>正常（理想）</Text>
                    <Text className='stat-value'>{stats.normalCount} 次</Text>
                  </View>
                  <View className='stat-item'>
                    <Text className='stat-label'>需关注</Text>
                    <Text className={`stat-value ${stats.abnormalCount > 0 ? 'warn' : ''}`}>
                      {stats.abnormalCount} 次
                    </Text>
                  </View>
                </View>
              </View>

              <View className='card'>
                <Text className='card-title'>分级统计</Text>
                <View className='bucket-row'>
                  <Text>偏低</Text>
                  <Text className='bucket-count'>{stats.lowCount} 次</Text>
                </View>
                <View className='bucket-row'>
                  <Text>稍高</Text>
                  <Text className='bucket-count'>{stats.prehighCount} 次</Text>
                </View>
                <View className='bucket-row'>
                  <Text>高血压（多测几天）</Text>
                  <Text className='bucket-count'>{stats.high1Count} 次</Text>
                </View>
                <View className='bucket-row'>
                  <Text>明显偏高（看医生）</Text>
                  <Text className='bucket-count'>{stats.high3Count} 次</Text>
                </View>
              </View>

              <View className='card'>
                <Text className='card-title'>时段分布</Text>
                {stats.timeBuckets.map(b => (
                  <View key={b.label} className='bucket-row'>
                    <Text>{b.label}</Text>
                    <Text className='bucket-count'>{b.count} 次</Text>
                  </View>
                ))}
              </View>

              <View className='card'>
                <Text className='card-title'>极值</Text>
                <View className='extreme-block'>
                  <Text>
                    最高 {stats.maxRecord.systolic}/{stats.maxRecord.diastolic} mmHg（
                    {formatShortDateTime(stats.maxRecord.recorded_at)}）
                  </Text>
                </View>
                <View className='extreme-block'>
                  <Text>
                    最低 {stats.minRecord.systolic}/{stats.minRecord.diastolic} mmHg（
                    {formatShortDateTime(stats.minRecord.recorded_at)}）
                  </Text>
                </View>
              </View>
            </>
          )}

          <View className='share-bar'>
            <Button className='share-friend-btn' openType='share' size='mini'>
              分享给好友
            </Button>
            <Text className='share-bar-hint'>朋友圈：点右上角 ···</Text>
          </View>
          <Text className='disclaimer-footer'>
            {stats
              ? `所选时段约 ${stats.periodDayCount} 天内的记录整理，仅供参考，不替代诊疗。`
              : reportRange?.startKey && reportRange?.endKey
                ? `所选时段约 ${inclusiveCalendarDaysBetween(reportRange.startKey, reportRange.endKey)} 天内的记录整理，仅供参考，不替代诊疗。`
                : '近 7 天记录整理，仅供参考，不替代诊疗。'}
          </Text>
        </View>
      </ScrollView>

      <Canvas
        canvasId='weeklyReportCanvas'
        style={{
          width: `${CANVAS_W}px`,
          height: `${CANVAS_H}px`,
          position: 'fixed',
          left: '-2000px',
          top: '0'
        }}
      />
    </View>
  )
}
