import React, { useState, useMemo, useRef } from 'react'
import { View, Text, Image, ScrollView, Canvas, Button, Textarea } from '@tarojs/components'
import Taro, { useLoad, useDidShow, useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import {
  getRecordsPage,
  getRecordsForHomeStats,
  HOME_LIST_PAGE_SIZE,
  BPRecord,
  addRecord,
  deleteRecord
} from '../../lib/supabase'
import { silentLogin, getUserInfo, UserInfo } from '../../lib/auth'
import { FontSizeMode, getCurrentFontSizeMode, initFontSizeMode, getFontSizeModeClass, saveLocalFontSizeMode, applyFontSizeMode, getPreferredMeasureHand, savePreferredMeasureHand, clearPreferredMeasureHand } from '../../lib/settings'
import { API_BASE_URL } from '../../utils/api'
import { setAnalysisNeedRefresh } from '../../store/analysisRefresh'
import { generateShareImage } from '../../utils/shareImage'
import { getMyGroups, Group } from '../../lib/groups'
import { getBPStatus } from '../../utils/bpStatus'
import { computeHandSplitOverview } from '../../utils/bpHandAverages'
import './index.scss'

// 图标
// @ts-ignore
import iconCamera from '../../assets/icons/camera.png'
// @ts-ignore
import iconEdit from '../../assets/icons/note.png'
// @ts-ignore
import iconHeart from '../../assets/icons/heart.png'
// @ts-ignore
import iconChart from '../../assets/icons/chart.png'
// @ts-ignore
import iconList from '../../assets/icons/list.png'
// @ts-ignore
import iconShare from '../../assets/icons/share.png'
// @ts-ignore
import iconGroups from '../../assets/icons/groups.png'
// 活动横幅图 assets/promo/promo-banner.png
// @ts-ignore
import promoBanner from '../../assets/promo/promo-banner.png'

/** 本地时区自然日 YYYY-MM-DD（勿用 ISO 的 `T` 前片段或 toISOString 的日期，那是 UTC 日历日） */
const getLocalDateKey = (input: string | Date): string => {
  const d = typeof input === 'string' ? new Date(input) : new Date(input.getTime())
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 格式化时间为易读格式
const formatTime = (isoString: string) => {
  const date = new Date(isoString)
  const hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, '0')

  let period = ''
  if (hours < 6) period = '凌晨'
  else if (hours < 12) period = '上午'
  else if (hours < 14) period = '中午'
  else if (hours < 18) period = '下午'
  else period = '晚上'

  const displayHour = hours > 12 ? hours - 12 : hours
  return `${period} ${displayHour}:${minutes}`
}

// 格式化日期为易读格式（与列表分组一致，均按本地自然日）
const formatDateLabel = (isoString: string) => {
  const date = new Date(isoString)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const dateStr = getLocalDateKey(isoString)
  const todayStr = getLocalDateKey(today)
  const yesterdayStr = getLocalDateKey(yesterday)

  if (dateStr === todayStr) return '今天'
  if (dateStr === yesterdayStr) return '昨天'

  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${month}月${day}日 ${weekDays[date.getDay()]}`
}

/** 真机直连 DashScope OpenAI 兼容接口（与 src/app/api/analyze/route.ts 中 Qwen 调用一致） */
const QWEN_COMPAT_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const QWEN_VL_MODEL = 'qwen-vl-max'
const BP_IMAGE_PROMPT = `
    Analyze this image of a blood pressure monitor. 
    Extract the systolic (high), diastolic (low), and pulse (heart rate) numbers. 
    Return ONLY a raw JSON object with keys: "systolic", "diastolic", "pulse". 
    All values should be integers. 
    If you cannot clearly see a screen with these numbers, return {"error": "Unable to read display"}.
    Do not include markdown formatting like \`\`\`json.
  `.trim()

function stripJsonFences(s: string): string {
  let t = s.trim()
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i
  const m = t.match(fence)
  if (m) return m[1].trim()
  return t
}

function parseBpAnalyzeFromModelText(text: string): Record<string, unknown> {
  const cleanText = stripJsonFences(text.trim()).replace(/```json|```/g, '').trim()
  return JSON.parse(cleanText) as Record<string, unknown>
}

function guessMimeFromPath(filePath: string): string {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'image/jpeg'
}

function readFileBase64(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    Taro.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (r) => resolve(r.data as string),
      fail: reject
    })
  })
}

// 测试数据
import { USE_TEST_DATA, getTestData } from '../../utils/testData'

export default function Index() {
  /** 首页列表：分页加载，仅用于测量记录区块展示 */
  const [listRecords, setListRecords] = useState<BPRecord[]>([])
  /** 近 180 天数据：本周概览、连续打卡（与列表分页无关） */
  const [statsRecords, setStatsRecords] = useState<BPRecord[]>([])
  const [listHasMore, setListHasMore] = useState(false)
  const [listLoadingMore, setListLoadingMore] = useState(false)
  const listLoadGuardRef = useRef(false)
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeResult, setAnalyzeResult] = useState<{
    systolic: number
    diastolic: number
    pulse: number
  } | null>(null)
  const [showResultModal, setShowResultModal] = useState(false)
  const [savingRecord, setSavingRecord] = useState(false)
  const [selectedHand, setSelectedHand] = useState<'left' | 'right' | ''>(() => getPreferredMeasureHand() ?? '')
  const [note, setNote] = useState('')
  const [noteExpanded, setNoteExpanded] = useState(false)
  const [shareImageUrl, setShareImageUrl] = useState<string>('')
  const [myGroups, setMyGroups] = useState<Group[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null) // 选中的日期（用于筛选）

  // 字体模式状态
  const [fontSizeMode, setFontSizeModeState] = useState<FontSizeMode>('normal')

  const latestRecord = listRecords.length > 0 ? listRecords[0] : null
  const previousRecord = listRecords.length > 1 ? listRecords[1] : null

  // 计算血压差
  const bpDifference = useMemo(() => {
    if (!latestRecord || !previousRecord) return null
    return {
      systolic: latestRecord.systolic - previousRecord.systolic,
      diastolic: latestRecord.diastolic - previousRecord.diastolic
    }
  }, [latestRecord, previousRecord])


  // 按日期分组记录，并统计每个日期的记录数
  const groupedRecords = useMemo(() => {
    const groups: { dateLabel: string; dateKey: string; records: BPRecord[] }[] = []
    const groupMap: { [key: string]: BPRecord[] } = {}

    listRecords.forEach(r => {
      const dateKey = getLocalDateKey(r.recorded_at)
      if (!groupMap[dateKey]) {
        groupMap[dateKey] = []
      }
      groupMap[dateKey].push(r)
    })

    // 按日期排序（最新的在前）
    const sortedDates = Object.keys(groupMap).sort((a, b) => b.localeCompare(a))

    sortedDates.forEach(dateKey => {
      const firstRecord = groupMap[dateKey][0]
      groups.push({
        dateLabel: formatDateLabel(firstRecord.recorded_at),
        dateKey,
        records: groupMap[dateKey].sort((a, b) =>
          new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
        )
      })
    })

    return groups
  }, [listRecords])

  // 根据选中的日期筛选记录
  const filteredGroupedRecords = useMemo(() => {
    if (!selectedDate) {
      return groupedRecords
    }
    return groupedRecords.filter(group => group.dateKey === selectedDate)
  }, [groupedRecords, selectedDate])

  const statsSource = statsRecords.length > 0 ? statsRecords : listRecords

  // 近7天血压：左右分侧 + 未标条数（与数据页/周报同口径，见 computeHandSplitOverview）
  const weekHandOverview = useMemo(() => {
    if (statsSource.length === 0) return null
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const weekRecords = statsSource.filter(r => new Date(r.recorded_at) >= weekAgo)
    if (weekRecords.length === 0) return null
    return computeHandSplitOverview(weekRecords)
  }, [statsSource])

  // 连续打卡天数（与「我的」页统计一致，按本地自然日）
  const consecutiveDays = useMemo(() => {
    if (statsSource.length === 0) return 0
    const uniqueDays = new Set(statsSource.map(r => getLocalDateKey(r.recorded_at)))
    const sortedDays = Array.from(uniqueDays).sort((a, b) => b.localeCompare(a))
    let streak = 0
    const pad = (n: number) => String(n).padStart(2, '0')
    for (let i = 0; i < sortedDays.length; i++) {
      const expected = new Date()
      expected.setHours(0, 0, 0, 0)
      expected.setDate(expected.getDate() - i)
      const key = `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())}`
      if (sortedDays[i] === key) {
        streak++
      } else {
        break
      }
    }
    return streak
  }, [statsSource])

  // 标记是否已初始化，避免重复调用
  const [initialized, setInitialized] = useState(false)

  useLoad(() => {
    initPage()
  })

  // 监听字体模式变化，立即更新页面
  React.useEffect(() => {
    const handleFontModeChange = (mode: FontSizeMode) => {
      setFontSizeModeState(mode)
    }

    Taro.eventCenter.on('fontSizeModeChanged', handleFontModeChange)

    return () => {
      Taro.eventCenter.off('fontSizeModeChanged', handleFontModeChange)
    }
  }, [])

  // 每次识别出结果时，用本地已保存的手臂偏好（无则不高亮、保存时不写 hand）
  React.useEffect(() => {
    if (analyzeResult) {
      setSelectedHand(getPreferredMeasureHand() ?? '')
    }
  }, [analyzeResult])

  // 页面每次显示时刷新数据（从输入页返回时，跳过首次）
  useDidShow(() => {
    // 每次显示页面时同步字体模式（解决从设置页面返回后样式不更新的问题）
    const currentMode = getCurrentFontSizeMode()
    if (currentMode !== fontSizeMode) {
      setFontSizeModeState(currentMode)
    }

    if (!showResultModal) {
      setSelectedHand(getPreferredMeasureHand() ?? '')
    }

    // 检查是否有从日历页面返回的选中日期
    if ((global as any).__selectedDate) {
      const dateKey = (global as any).__selectedDate
      setSelectedDate(dateKey)
      delete (global as any).__selectedDate

      // 滚动到对应日期
      setTimeout(() => {
        Taro.createSelectorQuery()
          .select(`#date-${dateKey}`)
          .boundingClientRect((rect: any) => {
            if (rect) {
              Taro.pageScrollTo({
                scrollTop: rect.top + rect.height / 2 - Taro.getSystemInfoSync().windowHeight / 2,
                duration: 300
              })
            }
          })
          .exec()
      }, 300)
    }

    if (USE_TEST_DATA) return
    if (!initialized) return // 首次加载由 useLoad 处理

    const storedUser = getUserInfo()
    if (storedUser) {
      fetchRecords(storedUser.openid)
      fetchGroups(storedUser.openid)
    }
  })

  // 分享小程序给朋友
  useShareAppMessage(() => {
    const shareTitle = latestRecord
      ? `我的最新血压：${latestRecord.systolic}/${latestRecord.diastolic} mmHg`
      : '血压记录助手 - 轻松记录，健康管理'

    return {
      title: shareTitle,
      path: '/pages/index/index',
      imageUrl: shareImageUrl || '' // 使用生成的分享图片
    }
  })

  // 分享小程序到朋友圈
  useShareTimeline(() => {
    const shareTitle = latestRecord
      ? `我的最新血压：${latestRecord.systolic}/${latestRecord.diastolic} mmHg`
      : '血压记录助手 - 轻松记录，健康管理'

    return {
      title: shareTitle,
      imageUrl: shareImageUrl || '' // 使用生成的分享图片
    }
  })

  const initPage = async () => {
    // 初始化字体模式
    const currentMode = initFontSizeMode()
    setFontSizeModeState(currentMode)

    // 测试模式直接加载测试数据
    if (USE_TEST_DATA) {
      const all = getTestData()
      setListRecords(all.slice(0, HOME_LIST_PAGE_SIZE))
      setStatsRecords(all)
      setListHasMore(all.length > HOME_LIST_PAGE_SIZE)
      setInitialized(true)
      return
    }

    const storedUser = getUserInfo()
    if (storedUser) {
      setUserInfo(storedUser)
      // 如果服务器返回了字体模式，同步到本地
      if (storedUser.fontSizeMode) {
        saveLocalFontSizeMode(storedUser.fontSizeMode)
        applyFontSizeMode(storedUser.fontSizeMode)
        setFontSizeModeState(storedUser.fontSizeMode)
      }
      await fetchRecords(storedUser.openid)
      await fetchGroups(storedUser.openid)
    } else {
      await autoLogin()
    }
    setInitialized(true)
  }

  const autoLogin = async () => {
    try {
      // 静默登录获取 openid
      const result = await silentLogin()
      if (result.success && result.userInfo) {
        setUserInfo(result.userInfo)

        // 同步服务器的字体模式设置
        if (result.userInfo.fontSizeMode) {
          saveLocalFontSizeMode(result.userInfo.fontSizeMode)
          applyFontSizeMode(result.userInfo.fontSizeMode)
          setFontSizeModeState(result.userInfo.fontSizeMode)
        }

        await fetchRecords(result.userInfo.openid)
        await fetchGroups(result.userInfo.openid)
      } else {
        console.log('Silent login failed:', result.error)
      }
    } catch (e) {
      console.log('Auto login failed:', e)
    }
  }

  const fetchRecords = async (userId: string) => {
    listLoadGuardRef.current = false
    if (USE_TEST_DATA) {
      const all = getTestData()
      setListRecords(all.slice(0, HOME_LIST_PAGE_SIZE))
      setStatsRecords(all)
      setListHasMore(all.length > HOME_LIST_PAGE_SIZE)
      return
    }

    try {
      const [pageRes, statsRes] = await Promise.all([
        getRecordsPage(userId, 0),
        getRecordsForHomeStats(userId)
      ])
      if (pageRes.data && !pageRes.error) {
        setListRecords(pageRes.data)
        setListHasMore(pageRes.hasMore)
      } else {
        setListRecords([])
        setListHasMore(false)
      }
      if (statsRes.data && !statsRes.error) {
        setStatsRecords(statsRes.data)
      } else {
        setStatsRecords([])
      }
    } catch (e) {
      console.error('Failed to fetch records', e)
    }
  }

  const loadMoreRecords = async () => {
    if (USE_TEST_DATA) {
      const all = getTestData()
      setListRecords(prev => {
        if (prev.length >= all.length) {
          setListHasMore(false)
          return prev
        }
        const next = all.slice(0, prev.length + HOME_LIST_PAGE_SIZE)
        setListHasMore(next.length < all.length)
        return next
      })
      return
    }
    if (!userInfo?.openid || listLoadingMore || !listHasMore || listLoadGuardRef.current) return
    listLoadGuardRef.current = true
    setListLoadingMore(true)
    try {
      const offset = listRecords.length
      const { data, error, hasMore } = await getRecordsPage(userInfo.openid, offset)
      if (!error && data?.length) {
        setListRecords(prev => {
          const ids = new Set(prev.map(r => r.id).filter((id): id is number => id != null))
          const extra = data.filter(r => r.id == null || !ids.has(r.id))
          return [...prev, ...extra]
        })
        setListHasMore(hasMore)
      } else if (!error && (!data || data.length === 0)) {
        setListHasMore(false)
      }
    } catch (e) {
      console.error('loadMoreRecords', e)
    } finally {
      setListLoadingMore(false)
      listLoadGuardRef.current = false
    }
  }

  const fetchGroups = async (userId: string) => {
    if (USE_TEST_DATA) return

    try {
      const result = await getMyGroups(userId)
      if (result.success && result.groups) {
        setMyGroups(result.groups)
      }
    } catch (e) {
      console.error('Failed to fetch groups', e)
    }
  }

  // 检查登录状态，未登录则提示
  const checkLoginAndProceed = (callback: () => void) => {
    // 测试模式下直接执行
    if (USE_TEST_DATA) {
      callback()
      return
    }

    if (!userInfo) {
      Taro.showModal({
        title: '需要登录',
        content: '请先登录后再记录血压数据',
        confirmText: '去登录',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            Taro.switchTab({ url: '/pages/profile/index' })
          }
        }
      })
      return
    }
    callback()
  }

  const goToInput = () => {
    checkLoginAndProceed(() => {
      Taro.navigateTo({ url: '/pages/input/index' })
    })
  }

  const goToCamera = async () => {
    checkLoginAndProceed(async () => {
      try {
        // 直接拉起相机或相册
        const res = await Taro.chooseImage({
          count: 1,
          sizeType: ['compressed'],
          sourceType: ['album', 'camera']
        })

        const tempFilePath = res.tempFilePaths[0]

        setAnalyzing(true)
        const isDevtools = Taro.getSystemInfoSync().platform === 'devtools'
        if (isDevtools) {
          await analyzeImageUpload(tempFilePath)
        } else {
          await analyzeImageQwenDirect(tempFilePath)
        }
      } catch (e) {
        console.log('User cancelled or error:', e)
      }
    })
  }

  /** 微信开发者工具：multipart 上传至本站 /api/analyze（服务端 Qwen） */
  const analyzeImageUpload = async (filePath: string) => {
    try {
      const uploadRes = await Taro.uploadFile({
        url: `${API_BASE_URL}/api/analyze`,
        filePath: filePath,
        name: 'file'
      })

      if (uploadRes.statusCode !== 200) {
        throw new Error('上传失败')
      }

      const result =
        typeof uploadRes.data === 'string' ? JSON.parse(uploadRes.data) : uploadRes.data

      if (result.error) {
        Taro.showToast({
          title: typeof result.error === 'string' ? result.error : '识别失败',
          icon: 'none',
          duration: 2000
        })
        setAnalyzing(false)
        return
      }

      setAnalyzeResult({
        systolic: result.systolic as number,
        diastolic: result.diastolic as number,
        pulse: result.pulse as number
      })
      setShowResultModal(true)
      setAnalyzing(false)
    } catch (e: any) {
      console.error('Analyze error:', e)
      Taro.showToast({
        title: e.message || '识别失败，请重试',
        icon: 'none',
        duration: 2000
      })
      setAnalyzing(false)
    }
  }

  /** 真机：拉取 DashScope key 后直连千问 VL（需在小程序后台配置 request 合法域名 dashscope.aliyuncs.com） */
  const analyzeImageQwenDirect = async (filePath: string) => {
    try {
      const keyRes = await Taro.request<{ apiKey?: string; error?: string }>({
        url: `${API_BASE_URL}/api/analyze/key`,
        method: 'GET'
      })

      if (keyRes.statusCode !== 200 || !(keyRes.data as { apiKey?: string })?.apiKey) {
        const msg =
          (keyRes.data as { error?: string })?.error || '无法获取识别密钥'
        throw new Error(msg)
      }

      const apiKey = (keyRes.data as { apiKey: string }).apiKey
      const base64Data = await readFileBase64(filePath)
      const mimeType = guessMimeFromPath(filePath)
      const dataUrl = `data:${mimeType};base64,${base64Data}`

      const aiRes = await Taro.request({
        url: QWEN_COMPAT_URL,
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        data: {
          model: QWEN_VL_MODEL,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: BP_IMAGE_PROMPT },
                {
                  type: 'image_url',
                  image_url: { url: dataUrl }
                }
              ]
            }
          ],
          max_tokens: 500
        },
        timeout: 60000
      })

      if (aiRes.statusCode !== 200) {
        const raw = aiRes.data as Record<string, unknown> | string
        let detail = '识别请求失败'
        if (raw && typeof raw === 'object') {
          const errObj = raw as { error?: { message?: string }; message?: string }
          detail = errObj.error?.message || errObj.message || JSON.stringify(raw).slice(0, 200)
        } else if (typeof raw === 'string') {
          detail = raw.slice(0, 200)
        }
        throw new Error(detail)
      }

      const payload = aiRes.data as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const text = payload?.choices?.[0]?.message?.content
      if (!text || typeof text !== 'string') {
        throw new Error('模型无有效返回')
      }

      let parsed: Record<string, unknown>
      try {
        parsed = parseBpAnalyzeFromModelText(text)
      } catch {
        throw new Error('解析识别结果失败')
      }

      if (parsed.error) {
        Taro.showToast({
          title: typeof parsed.error === 'string' ? parsed.error : '识别失败',
          icon: 'none',
          duration: 2000
        })
        setAnalyzing(false)
        return
      }

      setAnalyzeResult({
        systolic: parsed.systolic as number,
        diastolic: parsed.diastolic as number,
        pulse: parsed.pulse as number
      })
      setShowResultModal(true)
      setAnalyzing(false)
    } catch (e: any) {
      console.error('Analyze error (Qwen direct):', e)
      Taro.showToast({
        title: e.message || '识别失败，请重试',
        icon: 'none',
        duration: 2000
      })
      setAnalyzing(false)
    }
  }

  const handleSaveRecord = async () => {
    if (!analyzeResult || !userInfo) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    if (savingRecord) return

    setSavingRecord(true)
    const recordedAt = new Date().toISOString()

    try {
      const { error } = await addRecord({
        user_id: userInfo.openid,
        systolic: analyzeResult.systolic,
        diastolic: analyzeResult.diastolic,
        pulse: analyzeResult.pulse,
        recorded_at: recordedAt,
        hand: selectedHand === 'left' || selectedHand === 'right' ? selectedHand : undefined,
        note: note || undefined
      })

      if (error) {
        Taro.showToast({ title: error, icon: 'none' })
      } else {
        Taro.showToast({ title: '保存成功', icon: 'success' })
        setShowResultModal(false)

        // 生成分享图片
        try {
          const imageUrl = await generateShareImage(
            analyzeResult.systolic,
            analyzeResult.diastolic,
            analyzeResult.pulse,
            recordedAt
          )
          setShareImageUrl(imageUrl)
        } catch (e) {
          console.error('生成分享图片失败:', e)
        }

        setAnalyzeResult(null)
        setNote('')
        setNoteExpanded(false)
        setAnalysisNeedRefresh(true) // 首页有数据变更，下次进分析页需拉取
        // 刷新记录列表
        await fetchRecords(userInfo.openid)
        if (selectedHand === 'left' || selectedHand === 'right') {
          savePreferredMeasureHand(selectedHand)
        }
      }
    } catch (e) {
      Taro.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      setSavingRecord(false)
    }
  }

  const handleCloseModal = () => {
    setShowResultModal(false)
    setAnalyzeResult(null)
    setNote('')
    setNoteExpanded(false)
  }

  const handleModalContentClick = (e: any) => {
    // 阻止事件冒泡，防止点击模态框内容时关闭弹窗
    e.stopPropagation && e.stopPropagation()
  }


  // 处理记录点击（编辑/删除）
  const handleRecordAction = (record: BPRecord) => {
    Taro.showActionSheet({
      itemList: ['编辑记录', '删除记录'],
      itemColor: '#1e293b',
      success: async (res) => {
        if (res.tapIndex === 0) {
          // 编辑：t 为毫秒时间戳，放在最前；避免 ISO 串或长备注使 query 被截断
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
          // 删除确认
          const confirmRes = await Taro.showModal({
            title: '确认删除',
            content: '删除后无法恢复，确定要删除这条记录吗？',
            confirmText: '删除',
            confirmColor: '#ef4444'
          })

          if (confirmRes.confirm && record.id) {
            Taro.showLoading({ title: '删除中...' })
            const { error } = await deleteRecord(record.id)
            Taro.hideLoading()

            if (error) {
              Taro.showToast({ title: error, icon: 'none' })
            } else {
              Taro.showToast({ title: '已删除', icon: 'success' })
              setAnalysisNeedRefresh(true) // 首页有数据变更，下次进分析页需拉取
              // 刷新列表
              if (userInfo) {
                fetchRecords(userInfo.openid)
              }
            }
          }
        }
      }
    })
  }

  return (
    <>
      {/* 隐藏的 Canvas，用于生成分享图片 */}
      <Canvas
        canvasId='shareCanvas'
        style={{
          position: 'fixed',
          top: '-9999px',
          left: '-9999px',
          width: '750px',
          height: '600px'
        }}
        disableScroll
      />

      <ScrollView
        className={`page ${getFontSizeModeClass(fontSizeMode)}`}
        scrollY
        enhanced
        showScrollbar={false}
        lowerThreshold={120}
        onScrollToLower={() => void loadMoreRecords()}
      >
        {/* 顶部蓝色弧形背景 */}
        <View className='bg-curve' />

        {/* 操作按钮 - 放在最顶部，最显眼 */}
        <View className='actions'>
          <View className='action-btn blue' onClick={goToCamera}>
            <Image className='action-icon' src={iconCamera} mode='aspectFit' />
            <Text className='action-text-white'>拍照输入</Text>
          </View>
          <View className='action-btn white' onClick={goToInput}>
            <Image className='action-icon' src={iconEdit} mode='aspectFit' />
            <Text className='action-text-dark'>手动输入</Text>
          </View>
        </View>

        {/* 今日血压卡片 */}
        <View className='bp-card'>
          {consecutiveDays > 0 && (
            <View className='bp-card-streak'>
              <Text className='bp-card-streak-text'>已连续打卡 {consecutiveDays} 天</Text>
            </View>
          )}
          <View className='card-header'>
            <View className='card-title'><Image className='title-icon' src={iconHeart} mode='aspectFit' /><Text>最新血压</Text></View>
            <View className='card-header-right'>
              {latestRecord && (
                <View className={`card-status ${getBPStatus(latestRecord.systolic, latestRecord.diastolic).color}`}>
                  <Text className='card-status-text'>{getBPStatus(latestRecord.systolic, latestRecord.diastolic).label}</Text>
                </View>
              )}
              {latestRecord && (
                <Button
                  className='share-btn'
                  openType='share'
                  size='mini'
                  plain
                >
                  <View className='share-btn-text'><Text>分享</Text></View>
                </Button>
              )}
            </View>
          </View>

          {latestRecord ? (
            <View className='card-body'>
              <View className='bp-main-metrics'>
                <View className='bp-metric-block'>
                  <View className='bp-numbers-row'>
                    <Text className='bp-value'>{latestRecord.systolic}</Text>
                    <Text className='bp-slash'>/</Text>
                    <Text className='bp-value'>{latestRecord.diastolic}</Text>
                  </View>
                  <Text className='bp-unit'>mmHg</Text>
                </View>
                <View className='bp-metric-divider' />
                <View className='bp-metric-block bp-metric-pulse'>
                  <View className='bp-numbers-row pulse-numbers-row'>
                    <Text className='pulse-value-inline'>{latestRecord.pulse}</Text>
                    <Text className='pulse-unit-inline'>bpm</Text>
                  </View>
                  <Text className='bp-pulse-label'>心率</Text>
                </View>
              </View>
              <View className='bp-info-row'>
                {/* <Text className='bp-desc'>收缩压 / 舒张压</Text> */}
                {bpDifference && (
                  <View className='bp-diff-inline'>
                    <Text className='bp-diff-label'>较最近一次：</Text>
                    <Text className={`bp-diff-text ${bpDifference.systolic >= 0 ? 'diff-up' : 'diff-down'}`}>
                      {bpDifference.systolic >= 0 ? '↑' : '↓'} {Math.abs(bpDifference.systolic)}
                    </Text>
                    <Text className='bp-diff-separator'>/</Text>
                    <Text className={`bp-diff-text ${bpDifference.diastolic >= 0 ? 'diff-up' : 'diff-down'}`}>
                      {bpDifference.diastolic >= 0 ? '↑' : '↓'} {Math.abs(bpDifference.diastolic)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View className='card-empty'>
              <Text className='empty-bp'>-- / --</Text>
              <Text className='empty-bp-hint'>暂无记录，点击上方按钮开始测量</Text>
            </View>
          )}
        </View>

        {/* 活动入口：横幅图占位，点击进入活动页 */}
        <View
          className='home-promo-entry'
          onClick={() => Taro.navigateTo({ url: '/pages/promo-activity/index' })}
        >
          <Image
            className='home-promo-entry-img'
            src={promoBanner}
            mode='aspectFill'
          />
        </View>

        {/* 本周概览卡片 */}
        <View className='summary-card'>
          <View className='summary-header'>
            <View className='summary-title'><Image className='title-icon' src={iconChart} mode='aspectFit' /><Text>本周概览</Text></View>
            <Text className='summary-count'>共 {weekHandOverview?.count || 0} 次记录</Text>
          </View>
          {weekHandOverview ? (
            weekHandOverview.fallbackOverall ? (
              <View className='summary-content'>
                <View className='summary-avg'>
                  <Text className='avg-label'>平均血压</Text>
                  <View className='avg-values'>
                    <Text className='avg-number systolic'>{weekHandOverview.fallbackOverall.systolic}</Text>
                    <Text className='avg-slash'>/</Text>
                    <Text className='avg-number diastolic'>{weekHandOverview.fallbackOverall.diastolic}</Text>
                    <Text className='avg-unit'>mmHg</Text>
                  </View>
                </View>
                <View
                  className={`summary-status ${getBPStatus(weekHandOverview.fallbackOverall.systolic, weekHandOverview.fallbackOverall.diastolic).color}`}
                >
                  <Text className='status-emoji'>{getBPStatus(weekHandOverview.fallbackOverall.systolic, weekHandOverview.fallbackOverall.diastolic).emoji}</Text>
                  <Text className='status-text'>{getBPStatus(weekHandOverview.fallbackOverall.systolic, weekHandOverview.fallbackOverall.diastolic).label}</Text>
                </View>
              </View>
            ) : (
              <View className='summary-hands'>
                {weekHandOverview.left && (
                  <View className='summary-hand-row' key='left'>
                    <View className='summary-hand-main'>
                      <Text className='summary-hand-title'>左手平均 · {weekHandOverview.left.count} 次</Text>
                      <View className='avg-values avg-values--hand'>
                        <Text className='avg-number systolic'>{weekHandOverview.left.systolic}</Text>
                        <Text className='avg-slash'>/</Text>
                        <Text className='avg-number diastolic'>{weekHandOverview.left.diastolic}</Text>
                        <Text className='avg-unit'>mmHg</Text>
                      </View>
                    </View>
                    <View
                      className={`summary-status summary-status--compact ${getBPStatus(weekHandOverview.left.systolic, weekHandOverview.left.diastolic).color}`}
                    >
                      <Text className='status-emoji'>{getBPStatus(weekHandOverview.left.systolic, weekHandOverview.left.diastolic).emoji}</Text>
                      <Text className='status-text'>{getBPStatus(weekHandOverview.left.systolic, weekHandOverview.left.diastolic).label}</Text>
                    </View>
                  </View>
                )}
                {weekHandOverview.right && (
                  <View className='summary-hand-row' key='right'>
                    <View className='summary-hand-main'>
                      <Text className='summary-hand-title'>右手平均 · {weekHandOverview.right.count} 次</Text>
                      <View className='avg-values avg-values--hand'>
                        <Text className='avg-number systolic'>{weekHandOverview.right.systolic}</Text>
                        <Text className='avg-slash'>/</Text>
                        <Text className='avg-number diastolic'>{weekHandOverview.right.diastolic}</Text>
                        <Text className='avg-unit'>mmHg</Text>
                      </View>
                    </View>
                    <View
                      className={`summary-status summary-status--compact ${getBPStatus(weekHandOverview.right.systolic, weekHandOverview.right.diastolic).color}`}
                    >
                      <Text className='status-emoji'>{getBPStatus(weekHandOverview.right.systolic, weekHandOverview.right.diastolic).emoji}</Text>
                      <Text className='status-text'>{getBPStatus(weekHandOverview.right.systolic, weekHandOverview.right.diastolic).label}</Text>
                    </View>
                  </View>
                )}
                {weekHandOverview.unlabeledCount > 0 && (
                  <Text className='summary-unlabeled-hint'>另有 {weekHandOverview.unlabeledCount} 次未标左右手，未计入上表</Text>
                )}
              </View>
            )
          ) : (
            <View className='summary-empty'>
              <Text className='summary-empty-text'>本周还没有记录</Text>
              <Text className='summary-empty-hint'>坚持每天测量，了解血压趋势</Text>
            </View>
          )}
          <View
            className='summary-report-entry'
            onClick={() => Taro.navigateTo({ url: '/pages/weekly-report/index' })}
          >
            <View className='summary-report-entry-left'>
              <Text className='summary-report-entry-text'>本周总结</Text>
              <Text className='summary-report-entry-sub'>详细统计 · 可分享</Text>
            </View>
            <Text className='summary-report-entry-arrow'>›</Text>
          </View>
        </View>

        {/* 我的组快捷入口 - 本周概览与测量记录之间 */}
        <View className='groups-shortcut' onClick={() => {
          if (myGroups.length === 1) {
            Taro.navigateTo({ url: `/pages/groups/detail?id=${myGroups[0].id}` })
          } else {
            Taro.navigateTo({ url: '/pages/groups/index' })
          }
        }}>
          <View className='groups-shortcut-content'>
            <View className='groups-shortcut-header'>
              <Image className='groups-shortcut-icon' src={iconGroups} mode='aspectFit' />
              <Text className='groups-shortcut-title'>我的组</Text>
              <Text className='groups-shortcut-arrow'>›</Text>
            </View>
            <View className='groups-shortcut-info'>
              {myGroups.length === 0 ? (
                <Text className='groups-shortcut-desc groups-shortcut-hint'>创建或加入组，与家人朋友一起记录</Text>
              ) : myGroups.length === 1 ? (
                <Text className='groups-shortcut-desc'>{myGroups[0].name}</Text>
              ) : (
                <Text className='groups-shortcut-desc'>已加入 {myGroups.length} 个组</Text>
              )}
            </View>
          </View>
        </View>

        {/* 记录列表 */}
        <View className='records-section'>
          <View className='records-card'>
            <View className='section-title'>
              <Image className='title-icon' src={iconList} mode='aspectFit' />
              <Text>测量记录</Text>
              {/* 数据日历按钮：有本页数据或仍有更多分页时显示（避免额外 count 请求） */}
              {(listRecords.length > 0 || listHasMore) && (
                <View className='calendar-trigger-btn' onClick={() => {
                  Taro.navigateTo({ url: '/pages/calendar/index' })
                }}>
                  <Text className='calendar-trigger-text'>数据日历</Text>
                  {selectedDate && (
                    <Text className='calendar-trigger-badge'>已筛选</Text>
                  )}
                </View>
              )}
            </View>

            {/* 筛选提示 */}
            {selectedDate && (
              <View className='filter-hint'>
                <Text className='filter-hint-text'>
                  已筛选：{formatDateLabel(selectedDate + 'T12:00:00')} 的记录
                </Text>
                <Text className='filter-hint-clear' onClick={() => setSelectedDate(null)}>清除筛选</Text>
              </View>
            )}

            {filteredGroupedRecords.length === 0 ? (
              <View className='empty-records'>
                <Image className='empty-icon' src={iconEdit} mode='aspectFit' />
                <Text className='empty-text'>还没有记录</Text>
                <Text className='empty-hint'>点击上方按钮开始记录血压</Text>
              </View>
            ) : (
              <>
                <View className='records-list'>
                  {filteredGroupedRecords.map((group, groupIdx) => (
                    <View
                      key={group.dateKey}
                      className={`date-group ${selectedDate === group.dateKey ? 'highlighted' : ''}`}
                      id={`date-${group.dateKey}`}
                    >
                      <View className='date-header'>
                        <Text className='date-label'>{group.dateLabel}</Text>
                        <Text className='date-count'>{group.records.length} 条</Text>
                      </View>
                      {group.records.map((record, idx) => {
                        const status = getBPStatus(record.systolic, record.diastolic)
                        const isLastInGroup = idx === group.records.length - 1
                        const isLastGroup = groupIdx === filteredGroupedRecords.length - 1
                        // 显示分割线：如果不是（组内最后一个 且 最后一个组）
                        const showDivider = !(isLastInGroup && isLastGroup)
                        const timeLabel = formatTime(record.recorded_at)
                        return (
                          <View
                            key={record.id || idx}
                            className={`record-item ${showDivider ? 'has-divider' : ''}`}
                            onClick={() => handleRecordAction(record)}
                          >
                            {/* 顶部：血压值 + 心率 + 状态标签（右上角） */}
                            <View className='record-top'>
                              <View className='record-bp-section'>
                                <View className='bp-display'>
                                  <Text className='bp-num systolic'>{record.systolic}</Text>
                                  <Text className='bp-divider'>/</Text>
                                  <Text className='bp-num diastolic'>{record.diastolic}</Text>
                                </View>
                                <View className='pulse-display'>
                                  <Image className='pulse-icon' src={iconHeart} mode='aspectFit' />
                                  <Text className='pulse-num'>{record.pulse}</Text>
                                </View>
                              </View>
                              <View className={`status-badge ${status.color}`}>
                                <Text className='badge-text'>{status.label}</Text>
                              </View>
                            </View>

                            {/* 中间：仅时刻（日期见分组标题） */}
                            <View className='record-middle'>
                              <Text className='datetime-text'>{timeLabel}</Text>
                              {record.hand && (
                                <Text className='bottom-info-text'>
                                  {record.hand === 'left' ? '左' : '右'}臂
                                </Text>
                              )}
                            </View>
                            {/* 备注单独一行 */}
                            {record.note && (
                              <View className='record-note-row'>
                                <Text className='note-text'>备注：{record.note}</Text>
                              </View>
                            )}
                          </View>
                        )
                      })}
                    </View>
                  ))}
                </View>
                {!selectedDate && listRecords.length > 0 && (
                  <View className='records-load-footer'>
                    <Text className='records-load-footer-text'>
                      {listLoadingMore ? '加载中…' : listHasMore ? '继续下滑加载更多' : '已加载全部记录'}
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        {/* 底部占位，防止被 tabbar 遮挡 */}
        <View className='bottom-spacer' />
      </ScrollView>

      {/* 识别中遮罩 - 放在 ScrollView 外面 */}
      {analyzing && (
        <View className='analyze-mask'>
          <View className='analyze-content'>
            <Text className='analyze-text'>AI 识别中...</Text>
          </View>
        </View>
      )}

      {/* 识别结果弹窗 - 放在 ScrollView 外面 */}
      {showResultModal && analyzeResult && (
        <View className='result-mask' onClick={handleCloseModal}>
          <View className='result-modal' onClick={handleModalContentClick}>
            <View className='modal-header'>
              <Text className='modal-title'>识别结果</Text>
              <Text className='modal-close' onClick={handleCloseModal}>×</Text>
            </View>
            <View className='modal-body'>
              <View className='result-values'>
                <View className='result-item'>
                  <Text className='result-number'>{analyzeResult.systolic}</Text>
                  <Text className='result-label'>收缩压</Text>
                </View>
                <Text className='result-separator'>/</Text>
                <View className='result-item'>
                  <Text className='result-number'>{analyzeResult.diastolic}</Text>
                  <Text className='result-label'>舒张压</Text>
                </View>
                <View className='result-item pulse'>
                  <Text className='result-number'>{analyzeResult.pulse}</Text>
                  <Text className='result-label'>心率</Text>
                </View>
              </View>

              {/* 左右手选择 */}
              <View className='hand-selector'>
                <View
                  className={`hand-option ${selectedHand === 'left' ? 'active' : ''}`}
                  onClick={() => {
                    const next = selectedHand === 'left' ? '' : 'left'
                    setSelectedHand(next)
                    if (next === 'left') savePreferredMeasureHand('left')
                    else clearPreferredMeasureHand()
                  }}
                >
                  <Text>左手</Text>
                </View>
                <View
                  className={`hand-option ${selectedHand === 'right' ? 'active' : ''}`}
                  onClick={() => {
                    const next = selectedHand === 'right' ? '' : 'right'
                    setSelectedHand(next)
                    if (next === 'right') savePreferredMeasureHand('right')
                    else clearPreferredMeasureHand()
                  }}
                >
                  <Text>右手</Text>
                </View>
              </View>

              {/* 备注输入 */}
              <View className='note-section'>
                <View className='note-header' onClick={() => setNoteExpanded(!noteExpanded)}>
                  <Text className='note-label'>备注 (可选)</Text>
                  <Text className={`note-expand-icon ${noteExpanded ? 'expanded' : ''}`}>▼</Text>
                </View>
                {(noteExpanded || note) && (
                  <Textarea
                    className='note-field'
                    placeholder='添加备注，如：饭后、运动后等'
                    value={note}
                    onInput={(e) => {
                      setNote(e.detail.value)
                      if (e.detail.value && !noteExpanded) {
                        setNoteExpanded(true)
                      }
                    }}
                    maxlength={200}
                  />
                )}
              </View>

              <View className='modal-actions'>
                <View className='modal-btn cancel-btn' onClick={handleCloseModal}>
                  <Text>取消</Text>
                </View>
                <View
                  className={`modal-btn save-btn ${savingRecord ? 'disabled' : ''}`}
                  onClick={savingRecord ? undefined : handleSaveRecord}
                >
                  <Text>{savingRecord ? '保存中...' : '保存记录'}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      )}

    </>
  )
}
