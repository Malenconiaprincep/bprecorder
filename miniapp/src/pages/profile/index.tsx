import { useState, useMemo, useEffect } from 'react'
import { View, Text, Image, Button, Input, Textarea, Picker } from '@tarojs/components'
import Taro, { useLoad, useDidShow } from '@tarojs/taro'
import { logout, saveWxUserInfo, getWxUserInfo, WxUserInfo, wxLoginWithBackend, getUserInfo, silentLogin, uploadAvatar } from '../../lib/auth'
import { getRecords, getRecordsInRange, BPRecord, addRecordsBatch } from '../../lib/supabase'
import { USE_TEST_DATA, getTestData } from '../../utils/testData'
import { FontSizeMode, getCurrentFontSizeMode, setFontSizeMode, getFontSizeModeClass, applyFontSizeMode } from '../../lib/settings'
import FontSizeModeModal from '../../components/FontSizeModeModal'
import * as XLSX from 'xlsx'
import './index.scss'
// @ts-ignore
import DEFAULT_AVATAR from '../../assets/icons/avatar.png'
// @ts-ignore
import iconGroups from '../../assets/icons/groups.png'
// @ts-ignore
import iconExport from '../../assets/icons/tray.png'
// @ts-ignore
import iconImport from '../../assets/icons/intray.png'
// @ts-ignore
import iconClock from '../../assets/icons/clock.png'
// @ts-ignore
import iconShare from '../../assets/icons/share.png'
// @ts-ignore
import iconMode from '../../assets/icons/mode.png'
export default function Profile() {
  const [wxUser, setWxUser] = useState<WxUserInfo | null>(null)
  const [openid, setOpenid] = useState<string>('')
  const [showModal, setShowModal] = useState(false)
  const [tempAvatar, setTempAvatar] = useState('')
  const [tempNickname, setTempNickname] = useState('')
  const [records, setRecords] = useState<BPRecord[]>([])

  // 字体模式相关状态
  const [fontSizeMode, setFontSizeModeState] = useState<FontSizeMode>('normal')
  const [showFontModeModal, setShowFontModeModal] = useState(false)

  // 数据导入相关状态
  const [showImportModal, setShowImportModal] = useState(false)
  const [importTab, setImportTab] = useState<'file' | 'manual'>('file') // tab 切换：file=文件上传, manual=手动粘贴
  const [csvText, setCsvText] = useState('')
  const [importing, setImporting] = useState(false)
  const [selectedFileName, setSelectedFileName] = useState('')

  // 确认导入弹窗相关状态
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [parsedRecords, setParsedRecords] = useState<Array<{
    systolic: number
    diastolic: number
    pulse: number
    hand?: 'left' | 'right'
    note?: string
    recorded_at: string
    date?: string
    time?: string
  }>>([])

  // 加入交流群弹窗状态
  const [showGroupModal, setShowGroupModal] = useState(false)

  // 数据导出相关状态
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportStart, setExportStart] = useState('')
  const [exportEnd, setExportEnd] = useState('')
  const [exporting, setExporting] = useState(false)
  // 联系方式配置
  const CONTACT_CONFIG = {
    // 方式1: 微信号（推荐，永久有效）
    wechatId: 'Free2dom2017',

    // 方式2: 群号（如果知道群号）
    groupNumber: '',

    // 方式3: 使用小程序客服消息（推荐，最简单）
    useCustomerService: true,
  }

  // 判断是否已完善资料（有头像和昵称）
  const isProfileComplete = !!(wxUser?.avatarUrl && wxUser?.nickName)
  // 是否已登录（有真实 openid）- 测试模式下默认显示
  const hasOpenid = USE_TEST_DATA || !!openid

  // 计算统计数据
  const stats = useMemo(() => {
    const data = USE_TEST_DATA ? getTestData() : records

    if (data.length === 0) {
      return { recordDays: 0, totalRecords: 0, consecutiveDays: 0 }
    }

    // 记录天数（去重）
    const uniqueDays = new Set(data.map(r => r.recorded_at.split('T')[0]))
    const recordDays = uniqueDays.size

    // 总记录数
    const totalRecords = data.length

    // 计算连续打卡天数
    const sortedDays = Array.from(uniqueDays).sort((a, b) => b.localeCompare(a))
    let consecutiveDays = 0

    for (let i = 0; i < sortedDays.length; i++) {
      const expectedDate = new Date()
      expectedDate.setDate(expectedDate.getDate() - i)
      const expectedDateStr = expectedDate.toISOString().split('T')[0]

      if (sortedDays[i] === expectedDateStr) {
        consecutiveDays++
      } else {
        break
      }
    }

    return { recordDays, totalRecords, consecutiveDays }
  }, [records])

  // 获取记录数据
  const fetchRecords = async (userId: string) => {
    if (USE_TEST_DATA) {
      setRecords(getTestData())
      return
    }

    try {
      const { data, error } = await getRecords(userId)
      if (!error && data) {
        setRecords(data)
      }
    } catch (e) {
      console.error('Failed to fetch records', e)
    }
  }

  useLoad(async () => {
    // 初始化字体模式
    const currentMode = getCurrentFontSizeMode()
    setFontSizeModeState(currentMode)

    // 测试模式下直接加载测试数据
    if (USE_TEST_DATA) {
      setRecords(getTestData())
    }

    // 加载已保存的微信用户信息
    const savedWxUser = getWxUserInfo()
    if (savedWxUser) {
      setWxUser(savedWxUser)
    }

    // 检查是否已有 openid（静默登录状态）
    const userInfo = getUserInfo()
    if (userInfo && userInfo.openid && !userInfo.openid.startsWith('wx_')) {
      setOpenid(userInfo.openid)
      // 获取记录数据
      await fetchRecords(userInfo.openid)
    } else {
      // 尝试静默登录
      const result = await silentLogin()
      if (result.success && result.userInfo) {
        setOpenid(result.userInfo.openid)
        // 获取记录数据
        await fetchRecords(result.userInfo.openid)
      }
    }

  })

  // 监听字体模式变化
  useEffect(() => {
    const handleFontModeChange = (mode: FontSizeMode) => {
      setFontSizeModeState(mode)
    }

    Taro.eventCenter.on('fontSizeModeChanged', handleFontModeChange)

    return () => {
      Taro.eventCenter.off('fontSizeModeChanged', handleFontModeChange)
    }
  }, [])

  // 页面每次显示时刷新数据
  useDidShow(() => {
    if (USE_TEST_DATA) return

    const userInfo = getUserInfo()
    if (userInfo && userInfo.openid && !userInfo.openid.startsWith('wx_')) {
      fetchRecords(userInfo.openid)
    }
  })

  // 点击登录/完善资料
  const onClickLogin = async () => {
    // 如果还没有 openid，先静默登录
    if (!hasOpenid) {
      Taro.showLoading({ title: '登录中...' })
      try {
        const result = await silentLogin()
        if (result.success && result.userInfo) {
          setOpenid(result.userInfo.openid)

          // 检查后端是否返回了头像昵称
          if (result.userInfo.nickName && result.userInfo.avatarUrl) {
            // 已有完整资料，直接显示
            const wxUserInfo: WxUserInfo = {
              nickName: result.userInfo.nickName,
              avatarUrl: result.userInfo.avatarUrl
            }
            setWxUser(wxUserInfo)
            saveWxUserInfo(wxUserInfo)
            Taro.hideLoading()
            Taro.showToast({ title: '登录成功', icon: 'success' })
            return
          }
        } else {
          Taro.hideLoading()
          Taro.showToast({ title: result.error || '登录失败', icon: 'none' })
          return
        }
      } catch (e) {
        Taro.hideLoading()
        Taro.showToast({ title: '登录失败，请重试', icon: 'none' })
        return
      }
      Taro.hideLoading()
    }

    // 弹窗让用户完善资料
    setTempAvatar(wxUser?.avatarUrl || '')
    setTempNickname(wxUser?.nickName || '')
    setShowModal(true)
  }

  // 选择头像
  const onChooseAvatar = (e: any) => {
    const avatarUrl = e.detail.avatarUrl
    setTempAvatar(avatarUrl)
  }

  // 输入昵称
  const onInputNickname = (e: any) => {
    setTempNickname(e.detail.value)
  }

  // 确认保存
  const onConfirm = async () => {
    if (!tempAvatar) {
      Taro.showToast({ title: '请选择头像', icon: 'none' })
      return
    }
    if (!tempNickname) {
      Taro.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    // 显示加载提示
    Taro.showLoading({ title: '上传头像中...' })

    try {
      let finalAvatarUrl = tempAvatar

      // 如果是微信临时文件，先上传到服务器
      if (tempAvatar.startsWith('wxfile://') || tempAvatar.startsWith('http://tmp')) {
        const uploadResult = await uploadAvatar(tempAvatar, openid)
        if (uploadResult.success && uploadResult.url) {
          finalAvatarUrl = uploadResult.url
        } else {
          Taro.hideLoading()
          Taro.showToast({ title: uploadResult.error || '头像上传失败', icon: 'none' })
          return
        }
      }

      Taro.showLoading({ title: '保存中...' })

      // 调用后端接口保存头像和昵称
      const result = await wxLoginWithBackend(tempNickname, finalAvatarUrl)

      if (result.success) {
        const newWxUser: WxUserInfo = {
          avatarUrl: finalAvatarUrl,
          nickName: tempNickname
        }
        setWxUser(newWxUser)
        saveWxUserInfo(newWxUser)
        if (result.userInfo?.openid) {
          setOpenid(result.userInfo.openid)
        }
        setShowModal(false)
        Taro.showToast({ title: '保存成功', icon: 'success' })
      } else {
        Taro.showToast({ title: result.error || '保存失败', icon: 'none' })
      }
    } catch (e: any) {
      console.error('Save profile error:', e)
      Taro.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally {
      Taro.hideLoading()
    }
  }

  // 取消
  const onCancel = () => {
    setShowModal(false)
  }

  const handleLogout = () => {
    logout()
    setWxUser(null)
    setOpenid('')
    Taro.showToast({ title: '已退出登录', icon: 'success' })
  }

  const showDevTip = () => {
    Taro.showToast({ title: '功能开发中，敬请期待', icon: 'none' })
  }

  // 导出区间最多一年
  const MAX_EXPORT_DAYS = 365

  const getDefaultExportRange = () => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 30)
    const pad = (n: number) => String(n).padStart(2, '0')
    return {
      start: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
      end: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`
    }
  }

  const getTodayLocal = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const getMinStartForExport = () => {
    if (!exportEnd) return '1900-01-01'
    const d = new Date(exportEnd + 'T12:00:00')
    d.setDate(d.getDate() - MAX_EXPORT_DAYS)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }

  const openExportModal = () => {
    if (!hasOpenid) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    const { start, end } = getDefaultExportRange()
    setExportStart(start)
    setExportEnd(end)
    setShowExportModal(true)
  }

  const handleExport = async () => {
    if (!exportStart || !exportEnd) {
      Taro.showToast({ title: '请选择开始和结束日期', icon: 'none' })
      return
    }
    const start = new Date(exportStart + 'T00:00:00.000Z')
    const end = new Date(exportEnd + 'T23:59:59.999Z')
    if (start.getTime() > end.getTime()) {
      Taro.showToast({ title: '开始日期不能晚于结束日期', icon: 'none' })
      return
    }
    const days = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
    if (days > MAX_EXPORT_DAYS) {
      Taro.showToast({ title: `导出区间不能超过 ${MAX_EXPORT_DAYS} 天（一年）`, icon: 'none', duration: 3000 })
      return
    }

    setExporting(true)
    Taro.showLoading({ title: '正在导出...' })

    try {
      let list: BPRecord[] = []
      if (USE_TEST_DATA) {
        const testData = getTestData()
        const startStr = exportStart + 'T'
        const endStr = exportEnd + 'T'
        list = testData.filter(r => {
          const t = r.recorded_at
          return t >= startStr && t <= endStr + '23:59:59.999Z'
        })
      } else if (openid) {
        const startISO = start.toISOString()
        const endISO = end.toISOString()
        const { data, error } = await getRecordsInRange(openid, startISO, endISO)
        if (error) {
          Taro.hideLoading()
          setExporting(false)
          Taro.showToast({ title: error || '获取数据失败', icon: 'none' })
          return
        }
        list = data || []
      }

      if (list.length === 0) {
        Taro.hideLoading()
        setExporting(false)
        Taro.showToast({ title: '该区间内没有记录', icon: 'none' })
        return
      }

      const rows = list.map(r => {
        const [datePart, timePart] = (r.recorded_at || '').split('T')
        const date = datePart || ''
        const time = (timePart || '').slice(0, 8)
        return {
          '日期': date,
          '时间': time,
          '收缩压': r.systolic,
          '舒张压': r.diastolic,
          '脉搏': r.pulse,
          '左右手': r.hand === 'left' ? '左' : r.hand === 'right' ? '右' : '',
          '备注': r.note || ''
        }
      })

      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '血压记录')
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const u8 = wbout instanceof Uint8Array ? wbout : new Uint8Array(wbout)
      const arrayBuffer = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)

      const fs = Taro.getFileSystemManager()
      const filePath = `${Taro.env.USER_DATA_PATH}/血压记录_${exportStart}_${exportEnd}.xlsx`
      fs.writeFile({
        filePath,
        data: arrayBuffer,
        success: () => {
          Taro.hideLoading()
          setExporting(false)
          setShowExportModal(false)
          Taro.openDocument({
            filePath,
            fileType: 'xlsx',
            showMenu: true,
            success: () => Taro.showToast({ title: '导出成功，可点击右上角转发或保存', icon: 'success', duration: 2500 }),
            fail: (err) => Taro.showToast({ title: '打开文件失败', icon: 'none' })
          })
        },
        fail: (err) => {
          Taro.hideLoading()
          setExporting(false)
          console.error('writeFile error', err)
          Taro.showToast({ title: '写入文件失败', icon: 'none' })
        }
      })
    } catch (e: any) {
      Taro.hideLoading()
      setExporting(false)
      Taro.showToast({ title: e.message || '导出失败', icon: 'none' })
    }
  }

  const goToGroups = () => {
    Taro.navigateTo({ url: '/pages/groups/index' })
  }

  // 打开数据导入弹窗
  const openImportModal = () => {
    if (!hasOpenid) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    setCsvText('')
    setSelectedFileName('')
    setImportTab('file') // 默认显示文件上传 tab
    setShowImportModal(true)
  }

  // 选择文件（从聊天记录中选择）
  const chooseFile = async () => {
    try {
      // extension 参数会在文件选择器层面限制，用户只能选择指定格式的文件
      // 但为了兼容性，选择后仍需要验证格式
      const res = await Taro.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['csv', 'xlsx', 'xls'] // 只允许选择 CSV 和 Excel 文件
      })

      if (res.tempFiles && res.tempFiles.length > 0) {
        const file = res.tempFiles[0]

        // 双重验证：验证文件格式（防止某些手机不兼容 extension 限制）
        const fileName = file.name.toLowerCase()
        const allowedExtensions = ['.csv', '.xlsx', '.xls']
        const isValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext))

        if (!isValidExtension) {
          Taro.showToast({
            title: '不支持的文件格式，请选择 CSV 或 Excel 文件',
            icon: 'none',
            duration: 3000
          })
          return
        }

        // 验证文件大小（限制为 5MB）
        const maxSize = 5 * 1024 * 1024 // 5MB
        if (file.size > maxSize) {
          Taro.showToast({
            title: '文件过大，请选择小于 5MB 的文件',
            icon: 'none',
            duration: 3000
          })
          return
        }

        setSelectedFileName(file.name)

        Taro.showLoading({ title: '读取文件中...' })

        const fs = Taro.getFileSystemManager()
        const filePath = file.path

        // 根据文件类型处理（读取后立即验证格式）
        if (fileName.endsWith('.csv')) {
          // 读取 CSV 文件为文本
          fs.readFile({
            filePath,
            encoding: 'utf-8',
            success: (readRes) => {
              const csvContent = readRes.data as string

              // 立即验证数据格式
              try {
                parseCSV(csvContent)
                // 格式正确，保存内容
                Taro.hideLoading()
                setCsvText(csvContent)
                Taro.showToast({
                  title: '文件读取成功，请点击"确认导入"查看数据列表',
                  icon: 'success',
                  duration: 2000
                })
              } catch (error: any) {
                // 格式不正确，清空并提示
                Taro.hideLoading()
                setCsvText('')
                setSelectedFileName('')
                Taro.showToast({
                  title: error.message || '文件格式不正确，请检查数据格式',
                  icon: 'none',
                  duration: 3000
                })
              }
            },
            fail: (err) => {
              Taro.hideLoading()
              console.error('Read CSV error:', err)
              Taro.showToast({ title: '文件读取失败', icon: 'none' })
            }
          })
        } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
          // 读取 Excel 文件为 ArrayBuffer
          fs.readFile({
            filePath,
            success: (readRes) => {
              try {
                const data = readRes.data
                const workbook = XLSX.read(data, { type: 'array' })

                // 获取第一个 sheet
                const sheetName = workbook.SheetNames[0]
                const sheet = workbook.Sheets[sheetName]

                // 转换为 CSV 格式
                const csvContent = XLSX.utils.sheet_to_csv(sheet)

                // 立即验证数据格式
                try {
                  parseCSV(csvContent)
                  // 格式正确，保存内容
                  Taro.hideLoading()
                  setCsvText(csvContent)
                  Taro.showToast({
                    title: '文件读取成功，请点击"确认导入"查看数据列表',
                    icon: 'success',
                    duration: 2000
                  })
                } catch (error: any) {
                  // 格式不正确，清空并提示
                  Taro.hideLoading()
                  setCsvText('')
                  setSelectedFileName('')
                  Taro.showToast({
                    title: error.message || '文件格式不正确，请检查数据格式',
                    icon: 'none',
                    duration: 3000
                  })
                }
              } catch (parseErr) {
                Taro.hideLoading()
                console.error('Parse Excel error:', parseErr)
                setCsvText('')
                setSelectedFileName('')
                Taro.showToast({ title: 'Excel 解析失败', icon: 'none' })
              }
            },
            fail: (err) => {
              Taro.hideLoading()
              console.error('Read Excel error:', err)
              Taro.showToast({ title: '文件读取失败', icon: 'none' })
            }
          })
        }
      }
    } catch (err: any) {
      console.error('Choose file error:', err)
      if (err.errMsg?.includes('cancel')) {
        // 用户取消选择，不提示错误
        return
      }

      // 文件选择器已经限制了格式，如果还能选择到不支持的文件，会在这里报错
      if (err.errMsg?.includes('extension') || err.errMsg?.includes('格式') || err.errMsg?.includes('不支持')) {
        Taro.showToast({
          title: '请选择 CSV 或 Excel 格式的文件',
          icon: 'none',
          duration: 3000
        })
      } else {
        Taro.showToast({ title: '选择文件失败，请重试', icon: 'none' })
      }
    }
  }

  // CSV 示例模板
  const csvTemplate = `日期,时间,收缩压,舒张压,脉搏,左右手,备注
2025-12-15,08:30,125,80,72,左,早晨测量
2025-12-15,20:00,130,85,75,右,晚上测量`

  // 复制模板
  const copyTemplate = () => {
    Taro.setClipboardData({
      data: csvTemplate,
      success: () => {
        Taro.showToast({ title: '模板已复制', icon: 'success' })
      }
    })
  }

  // 显示电脑端下载提示
  const downloadDemoFile = () => {
    const SUPABASE_URL = 'https://vaeklnwhlogbvrwtthbe.supabase.co'
    const demoFileUrl = `${SUPABASE_URL}/storage/v1/object/public/user-files/demo/bp_record_template.xlsx`

    Taro.showModal({
      title: '下载示例文件',
      content: `请在电脑浏览器中访问以下地址下载示例文件：\n\n${demoFileUrl}\n\n下载后，请将文件发送到微信（文件传输助手或好友），然后在本页面点击"从聊天记录选择文件"进行上传。`,
      showCancel: true,
      cancelText: '取消',
      confirmText: '复制地址',
      success: (res) => {
        if (res.confirm) {
          // 复制地址到剪贴板
          Taro.setClipboardData({
            data: demoFileUrl,
            success: () => {
              Taro.showToast({
                title: '地址已复制，请在电脑浏览器中打开',
                icon: 'success',
                duration: 3000
              })
            }
          })
        }
      }
    })
  }

  // 解析 CSV 文本（返回包含显示字段的完整数据）
  const parseCSV = (text: string): Array<{
    systolic: number
    diastolic: number
    pulse: number
    hand?: 'left' | 'right'
    note?: string
    recorded_at: string
    date: string
    time: string
  }> => {
    const lines = text.trim().split('\n')
    if (lines.length < 2) {
      throw new Error('CSV 至少需要标题行和一行数据')
    }

    // 解析标题行
    const headers = lines[0].toLowerCase().split(',').map(h => h.trim())

    // 标题映射
    const headerMap: Record<string, string> = {
      '日期': 'date', 'date': 'date',
      '时间': 'time', 'time': 'time',
      '收缩压': 'systolic', '高压': 'systolic', 'systolic': 'systolic', 'sys': 'systolic',
      '舒张压': 'diastolic', '低压': 'diastolic', 'diastolic': 'diastolic', 'dia': 'diastolic',
      '脉搏': 'pulse', '心率': 'pulse', 'pulse': 'pulse', 'hr': 'pulse',
      '左右手': 'hand', '手': 'hand', 'hand': 'hand',
      '备注': 'note', 'note': 'note', 'notes': 'note', 'memo': 'note',
    }

    // 建立列索引
    const colIndex: Record<string, number> = {}
    headers.forEach((h, i) => {
      const mapped = headerMap[h]
      if (mapped) colIndex[mapped] = i
    })

    // 检查必需列
    if (colIndex.date === undefined) throw new Error('缺少日期列')
    if (colIndex.systolic === undefined) throw new Error('缺少收缩压列')
    if (colIndex.diastolic === undefined) throw new Error('缺少舒张压列')
    if (colIndex.pulse === undefined) throw new Error('缺少脉搏列')

    const records: any[] = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const values = line.split(',').map(v => v.trim())

      const dateStr = values[colIndex.date]?.replace(/\//g, '-')
      const timeStr = colIndex.time !== undefined ? values[colIndex.time] : '12:00'
      const systolic = parseInt(values[colIndex.systolic], 10)
      const diastolic = parseInt(values[colIndex.diastolic], 10)
      const pulse = parseInt(values[colIndex.pulse], 10)

      // 验证数值
      if (isNaN(systolic) || systolic < 50 || systolic > 300) {
        throw new Error(`第 ${i + 1} 行收缩压无效`)
      }
      if (isNaN(diastolic) || diastolic < 30 || diastolic > 200) {
        throw new Error(`第 ${i + 1} 行舒张压无效`)
      }
      if (isNaN(pulse) || pulse < 30 || pulse > 250) {
        throw new Error(`第 ${i + 1} 行脉搏无效`)
      }

      // 解析日期时间
      const recorded_at = new Date(`${dateStr}T${timeStr || '12:00'}:00`).toISOString()

      // 解析左右手
      let hand: 'left' | 'right' | undefined
      if (colIndex.hand !== undefined) {
        const handVal = values[colIndex.hand]?.toLowerCase()
        if (handVal === 'left' || handVal === '左' || handVal === '左手') hand = 'left'
        if (handVal === 'right' || handVal === '右' || handVal === '右手') hand = 'right'
      }

      records.push({
        systolic,
        diastolic,
        pulse,
        hand,
        note: colIndex.note !== undefined ? values[colIndex.note] : undefined,
        recorded_at,
        date: dateStr,
        time: timeStr || '12:00'
      })
    }

    return records
  }

  // 点击确认导入按钮 - 先解析并显示确认弹窗
  const handleConfirmImport = () => {
    if (!csvText.trim()) {
      Taro.showToast({ title: '请输入 CSV 数据', icon: 'none' })
      return
    }

    try {
      // 解析 CSV
      const parsed = parseCSV(csvText)

      if (parsed.length === 0) {
        Taro.showToast({ title: 'CSV 中没有有效数据', icon: 'none' })
        return
      }

      // 显示确认弹窗
      setParsedRecords(parsed)
      setShowConfirmModal(true)
    } catch (e: any) {
      Taro.showToast({ title: e.message || '数据解析失败', icon: 'none' })
    }
  }

  // 执行实际导入
  const doImport = async () => {
    if (parsedRecords.length === 0) {
      Taro.showToast({ title: '没有可导入的数据', icon: 'none' })
      return
    }

    setImporting(true)
    setShowConfirmModal(false)

    try {
      // 添加 user_id
      const recordsWithUser = parsedRecords.map(r => ({
        systolic: r.systolic,
        diastolic: r.diastolic,
        pulse: r.pulse,
        hand: r.hand,
        note: r.note,
        recorded_at: r.recorded_at,
        user_id: openid
      }))

      // 批量插入
      const { data, error } = await addRecordsBatch(recordsWithUser)

      if (error) {
        Taro.showToast({ title: error, icon: 'none' })
      } else {
        Taro.showToast({
          title: `成功导入 ${data?.length || parsedRecords.length} 条`,
          icon: 'success'
        })
        setShowImportModal(false)
        setCsvText('')
        setSelectedFileName('')
        setParsedRecords([])
        // 刷新记录
        fetchRecords(openid)
      }
    } catch (e: any) {
      Taro.showToast({ title: e.message || '导入失败', icon: 'none' })
    } finally {
      setImporting(false)
    }
  }

  // 关闭加入交流群弹窗
  const closeGroupModal = () => {
    setShowGroupModal(false)
  }

  // 复制微信号
  const copyWechatId = () => {
    if (CONTACT_CONFIG.wechatId) {
      Taro.setClipboardData({
        data: CONTACT_CONFIG.wechatId,
        success: () => {
          Taro.showToast({ title: '已复制微信号', icon: 'success' })
        }
      })
    }
  }

  // 打开交流群弹窗
  const openGroupModal = () => {
    setShowGroupModal(true)
  }

  // 打开字体模式设置弹窗
  const openFontModeModal = () => {
    setShowFontModeModal(true)
  }

  // 处理字体模式选择
  const handleFontModeSelect = async (mode: FontSizeMode) => {
    setFontSizeModeState(mode)
    setShowFontModeModal(false)

    // 保存设置（本地 + 服务器）
    if (openid) {
      await setFontSizeMode(openid, mode)
    } else {
      // 未登录时仅应用到本地
      applyFontSizeMode(mode)
    }

    Taro.showToast({
      title: mode === 'elder' ? '已切换到关怀模式' : '已切换到标准模式',
      icon: 'success'
    })
  }

  // 根据字体模式决定显示哪些菜单项
  // 关怀模式下只显示核心功能，减少选项
  const allMenuItems = [
    { title: '我的组', icon: iconGroups, onClick: goToGroups, showInElder: false },
    { title: '数据导入', icon: iconImport, onClick: openImportModal, showInElder: false },
    { title: '数据导出', icon: iconExport, onClick: openExportModal, showInElder: false },
    // { title: '提醒设置', icon: iconClock, onClick: showDevTip, showInElder: true },
    {
      title: '显示模式',
      icon: iconMode,
      onClick: openFontModeModal,
      extra: fontSizeMode === 'elder' ? '关怀模式' : '标准模式',
      showInElder: true
    },
    { title: '交流群', icon: iconShare, onClick: openGroupModal, showInElder: false },
  ]

  // 关怀模式下过滤菜单项
  const menuItems = fontSizeMode === 'elder'
    ? allMenuItems.filter(item => item.showInElder)
    : allMenuItems

  return (
    <View className={`page ${getFontSizeModeClass(fontSizeMode)}`}>
      {/* 用户信息卡片 */}
      <View className='user-card' onClick={!isProfileComplete ? onClickLogin : undefined}>
        <Image
          className={`avatar-img-display ${wxUser?.avatarUrl ? '' : 'default-avatar'}`}
          src={wxUser?.avatarUrl || DEFAULT_AVATAR}
          mode='aspectFill'
          onClick={isProfileComplete ? onClickLogin : undefined}
        />
        <View className='user-info'>
          <Text className='user-name'>{wxUser?.nickName || (hasOpenid ? '点击完善资料' : '点击登录')}</Text>
          <Text className='user-desc'>
            {isProfileComplete ? '记录健康，关爱自己' : (hasOpenid ? `ID: ${openid.slice(0, 8)}...` : '登录后同步你的数据')}
          </Text>
        </View>
      </View>

      {/* 完善资料弹窗 */}
      {showModal && (
        <View
          className='modal-mask'
          onClick={onCancel}
          catchMove
        >
          <View className='modal-content' onClick={(e) => e.stopPropagation()}>
            <Text className='modal-title'>完善个人资料</Text>

            {/* 头像选择 */}
            <Button className='avatar-picker' openType='chooseAvatar' onChooseAvatar={onChooseAvatar}>
              <Image className='avatar-preview' src={tempAvatar || DEFAULT_AVATAR} mode='aspectFill' />
              {!tempAvatar && <Text className='avatar-hint'>点击更换头像</Text>}
            </Button>

            {/* 昵称输入 */}
            <Input
              className='nickname-field'
              type='nickname'
              placeholder='点击输入昵称'
              value={tempNickname}
              onInput={onInputNickname}
            />

            {/* 按钮 */}
            <View className='modal-buttons'>
              <View className='modal-btn cancel' onClick={onCancel}>
                <Text>取消</Text>
              </View>
              <View className='modal-btn confirm' onClick={onConfirm}>
                <Text>确认</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* 统计卡片 - 有 openid 就显示 */}
      {hasOpenid && (
        <View className='stats-card'>
          <View className='stat-item'>
            <Text className='stat-value'>{stats.recordDays}</Text>
            <Text className='stat-label'>记录天数</Text>
          </View>
          <View className='stat-divider' />
          <View className='stat-item'>
            <Text className='stat-value'>{stats.totalRecords}</Text>
            <Text className='stat-label'>总记录数</Text>
          </View>
          <View className='stat-divider' />
          <View className='stat-item'>
            <Text className='stat-value'>{stats.consecutiveDays}</Text>
            <Text className='stat-label'>连续打卡</Text>
          </View>
        </View>
      )}

      {/* 菜单列表 */}
      <View className='menu-card'>
        {menuItems.map((item, index) => (
          <View key={index} className='menu-item' onClick={item.onClick}>
            <Image className='menu-icon' src={item.icon} mode='aspectFit' />
            <Text className='menu-title'>{item.title}</Text>
            {item.extra && <Text className='menu-extra'>{item.extra}</Text>}
            <Text className='menu-arrow'>›</Text>
          </View>
        ))}
      </View>

      {/* 数据导入弹窗 */}
      {showImportModal && (
        <View
          className='modal-mask'
          onClick={() => setShowImportModal(false)}
        >
          <View
            className='import-modal'
            onClick={(e) => e.stopPropagation()}
          >
            <Text className='modal-title'>数据导入</Text>

            {/* Tab 切换 */}
            <View className='import-tabs'>
              <View
                className={`import-tab ${importTab === 'file' ? 'active' : ''}`}
                onClick={() => setImportTab('file')}
              >
                <Text className='tab-text'>文件上传</Text>
              </View>
              <View
                className={`import-tab ${importTab === 'manual' ? 'active' : ''}`}
                onClick={() => setImportTab('manual')}
              >
                <Text className='tab-text'>手动粘贴</Text>
              </View>
            </View>

            {/* 文件上传 Tab 内容 */}
            {importTab === 'file' && (
              <View className='tab-content'>
                <View className='file-upload-section'>
                  <View className='file-upload-btn' onClick={chooseFile}>
                    <Text className='upload-icon'>📁</Text>
                    <Text className='upload-text'>
                      {selectedFileName || '从聊天记录选择文件'}
                    </Text>
                  </View>
                  <View className='file-info-row'>
                    <Text className='file-support-text'>
                      支持格式：CSV、Excel (.xlsx/.xls)
                    </Text>
                    <Text className='demo-link' onClick={downloadDemoFile}>
                      下载示例文件
                    </Text>
                  </View>
                  <Text className='file-size-text'>
                    文件大小限制：最大 5MB
                  </Text>
                </View>

                {csvText && selectedFileName && (
                  <View className='file-info-section'>
                    <View className='file-info-row'>
                      <Text className='file-info-label'>已选择文件：</Text>
                      <Text className='file-info-name'>{selectedFileName}</Text>
                    </View>
                    <View className='file-tip'>
                      <Text className='file-tip-text'>文件已读取，点击"确认导入"查看数据列表</Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* 手动粘贴 Tab 内容 */}
            {importTab === 'manual' && (
              <View className='tab-content'>
                <View className='import-tip'>
                  <Text className='tip-text'>
                    粘贴 CSV 格式的血压数据，支持中英文表头
                  </Text>
                  <Text className='tip-link' onClick={copyTemplate}>
                    点击复制模板
                  </Text>
                </View>

                <Textarea
                  className='csv-input'
                  placeholder={`日期,时间,收缩压,舒张压,脉搏,左右手,备注\n2025-12-15,08:30,125,80,72,左,早晨`}
                  value={csvText}
                  onInput={(e) => setCsvText(e.detail.value)}
                  adjustPosition={true}
                  cursorSpacing={100}
                  holdKeyboard={false}
                  maxlength={-1}
                />

              </View>
            )}

            {/* 底部按钮 */}
            <View className='modal-buttons'>
              <View className='modal-btn cancel' onClick={() => {
                setShowImportModal(false)
                setCsvText('')
                setSelectedFileName('')
              }}>
                <Text>取消</Text>
              </View>
              <View
                className={`modal-btn confirm ${importing || !csvText ? 'disabled' : ''}`}
                onClick={importing || !csvText ? undefined : handleConfirmImport}
              >
                <Text>{importing ? '导入中...' : '导入'}</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* 数据导出弹窗 */}
      {showExportModal && (
        <View
          className='modal-mask'
          onClick={() => !exporting && setShowExportModal(false)}
        >
          <View
            className='import-modal export-modal'
            onClick={(e) => e.stopPropagation()}
          >
            <Text className='modal-title'>数据导出</Text>
            <Text className='export-tip'>选择导出区间（最多一年），将导出为 Excel 文件</Text>

            <View className='export-range'>
              <View className='export-range-item'>
                <Text className='export-range-label'>开始日期</Text>
                <Picker
                  mode='date'
                  value={exportStart}
                  start={getMinStartForExport()}
                  end={exportEnd || getTodayLocal()}
                  onChange={(e) => setExportStart(e.detail.value)}
                >
                  <View className='export-picker-value'>
                    <Text>{exportStart || '请选择'}</Text>
                    <Text className='export-picker-arrow'>›</Text>
                  </View>
                </Picker>
              </View>
              <View className='export-range-item'>
                <Text className='export-range-label'>结束日期</Text>
                <Picker
                  mode='date'
                  value={exportEnd}
                  start={exportStart || '1900-01-01'}
                  end={getTodayLocal()}
                  onChange={(e) => setExportEnd(e.detail.value)}
                >
                  <View className='export-picker-value'>
                    <Text>{exportEnd || '请选择'}</Text>
                    <Text className='export-picker-arrow'>›</Text>
                  </View>
                </Picker>
              </View>
            </View>

            <View className='modal-buttons'>
              <View className='modal-btn cancel' onClick={() => !exporting && setShowExportModal(false)}>
                <Text>取消</Text>
              </View>
              <View
                className={`modal-btn confirm ${exporting ? 'disabled' : ''}`}
                onClick={exporting ? undefined : handleExport}
              >
                <Text>{exporting ? '导出中...' : '导出 Excel'}</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* 确认导入弹窗 */}
      {showConfirmModal && (
        <View
          className='modal-mask'
          onClick={() => setShowConfirmModal(false)}
          catchMove
        >
          <View
            className='confirm-modal'
            onClick={(e) => e.stopPropagation()}
          >
            <Text className='modal-title'>确认导入数据</Text>

            <View className='confirm-summary'>
              <Text className='summary-text'>共 {parsedRecords.length} 条记录，请确认：</Text>
            </View>

            <View className='records-list'>
              <View className='records-header'>
                <Text className='header-cell date-cell'>日期</Text>
                <Text className='header-cell time-cell'>时间</Text>
                <Text className='header-cell bp-cell'>血压</Text>
                <Text className='header-cell pulse-cell'>脉搏</Text>
                <Text className='header-cell hand-cell'>手</Text>
              </View>
              <View className='records-body'>
                {parsedRecords.map((record, index) => (
                  <View key={index} className='record-row'>
                    <Text className='record-cell date-cell'>{record.date}</Text>
                    <Text className='record-cell time-cell'>{record.time}</Text>
                    <Text className='record-cell bp-cell'>{record.systolic}/{record.diastolic}</Text>
                    <Text className='record-cell pulse-cell'>{record.pulse}</Text>
                    <Text className='record-cell hand-cell'>{record.hand === 'left' ? '左' : record.hand === 'right' ? '右' : '-'}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className='modal-buttons'>
              <View className='modal-btn cancel' onClick={() => setShowConfirmModal(false)}>
                <Text>取消</Text>
              </View>
              <View
                className={`modal-btn confirm ${importing ? 'disabled' : ''}`}
                onClick={importing ? undefined : doImport}
              >
                <Text>{importing ? '导入中...' : '确认导入'}</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* 退出登录 - 有 openid 就显示 */}
      {hasOpenid && (
        <View className='logout-btn' onClick={handleLogout}>
          <Text className='logout-text'>退出登录</Text>
        </View>
      )}

      {/* 版本号 */}
      {/* 加入交流群弹窗 */}
      {showGroupModal && (
        <View
          className='modal-mask'
          onClick={closeGroupModal}
          catchMove
        >
          <View className='group-modal' onClick={(e) => e.stopPropagation()}>
            <View className='group-modal-header'>
              <Text className='group-modal-title'>交流群</Text>
              <Text className='group-modal-close' onClick={closeGroupModal}>×</Text>
            </View>
            <View className='group-modal-body'>
              <Text className='group-modal-desc'>加入交流群，可以反馈问题、交流使用心得</Text>

              {/* 方式1: 小程序客服消息（推荐） */}
              {CONTACT_CONFIG.useCustomerService && (
                <View className='contact-method'>
                  <Text className='contact-method-title'>方式一：联系客服</Text>
                  <Text className='contact-method-desc'>点击下方按钮，我们会引导您加入交流群</Text>
                  <Button
                    className='customer-service-btn'
                    openType='contact'
                    sessionFrom='profile'
                  >
                    联系客服
                  </Button>
                </View>
              )}

              {/* 方式2: 微信号（永久有效，推荐） */}
              {CONTACT_CONFIG.wechatId && (
                <View className='contact-method'>
                  {CONTACT_CONFIG.useCustomerService && <View className='divider-line' />}
                  <Text className='contact-method-title'>方式二：添加微信号</Text>
                  <Text className='contact-method-desc'>复制微信号后，在微信中搜索添加</Text>
                  <View className='contact-info-row'>
                    <Text className='contact-info-label'>微信号：</Text>
                    <Text className='contact-info-value'>{CONTACT_CONFIG.wechatId}</Text>
                    <View className='copy-btn' onClick={copyWechatId}>
                      <Text className='copy-btn-text'>复制</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
            <View className='group-modal-footer'>
              <View className='group-modal-btn' onClick={closeGroupModal}>
                <Text>知道了</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      <View className='version-info'>
        <Text className='version-text'>v2.0.1</Text>
      </View>

      {/* 字体模式选择弹窗 */}
      <FontSizeModeModal
        visible={showFontModeModal}
        onSelect={handleFontModeSelect}
        onClose={() => setShowFontModeModal(false)}
        title='选择显示模式'
        showClose
      />
    </View>
  )
}

