import Taro from '@tarojs/taro'
import { API_BASE_URL } from '../utils/api'
import { getUserInfo } from './auth'

// Supabase 配置
const SUPABASE_URL = 'https://vaeklnwhlogbvrwtthbe.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhZWtsbndobG9nYnZyd3R0aGJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2MDY3MTksImV4cCI6MjA3OTE4MjcxOX0.oLH3iiEhhPJydhXKdjJwDPTpqcUak44OOkFA9D8K15o'

// REST API 基础路径
const REST_URL = `${SUPABASE_URL}/rest/v1`

// 通用请求头
function getHeaders(accessToken?: string) {
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'  // 返回操作后的数据
  }
}

// 通用请求方法
async function request<T = any>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    data?: any
    params?: Record<string, string>
    accessToken?: string
  } = {}
): Promise<{ data: T | null; error: string | null }> {
  const { method = 'GET', data, params, accessToken } = options

  let url = `${REST_URL}${endpoint}`

  // 添加查询参数
  if (params) {
    const queryString = Object.entries(params)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&')
    url += `?${queryString}`
  }

  try {
    const res = await Taro.request({
      url,
      method,
      data,
      header: getHeaders(accessToken)
    })

    if (res.statusCode >= 200 && res.statusCode < 300) {
      return { data: res.data, error: null }
    } else {
      const errorMsg = res.data?.message || res.data?.error || `请求失败 (${res.statusCode})`
      return { data: null, error: errorMsg }
    }
  } catch (e: any) {
    console.error('Supabase request error:', e)
    return { data: null, error: e.message || '网络请求失败' }
  }
}

// ============ 血压记录相关 API ============

export interface BPRecord {
  id?: number
  user_id: string
  systolic: number
  diastolic: number
  pulse: number
  hand?: 'left' | 'right'  // 左右手（可选）
  note?: string            // 备注（可选）
  recorded_at: string
  created_at?: string
}

/** 首页测量记录列表每页条数 */
export const HOME_LIST_PAGE_SIZE = 10

/**
 * 获取用户的血压记录（其它页/analysis 等仍用；限制 50 条）
 */
export async function getRecords(userId: string): Promise<{ data: BPRecord[] | null; error: string | null }> {
  return request<BPRecord[]>('/bp_records', {
    params: {
      user_id: `eq.${userId}`,
      order: 'recorded_at.desc',
      limit: '50'
    }
  })
}

/**
 * 分页拉取记录（首页列表）；多取 1 条用于判断 hasMore
 */
export async function getRecordsPage(
  userId: string,
  offset: number,
  pageSize: number = HOME_LIST_PAGE_SIZE
): Promise<{ data: BPRecord[] | null; error: string | null; hasMore: boolean }> {
  const lim = pageSize
  const { data, error } = await request<BPRecord[]>('/bp_records', {
    params: {
      user_id: `eq.${userId}`,
      order: 'recorded_at.desc',
      limit: String(lim + 1),
      offset: String(offset)
    }
  })
  if (error || !data) {
    return { data: null, error, hasMore: false }
  }
  const hasMore = data.length > lim
  const slice = hasMore ? data.slice(0, lim) : data
  return { data: slice, error: null, hasMore }
}

/**
 * 用户血压记录总条数（PostgREST Prefer: count=exact）
 */
export async function getBpRecordsCount(userId: string): Promise<{ count: number; error: string | null }> {
  const url = `${REST_URL}/bp_records?user_id=eq.${encodeURIComponent(userId)}&select=id`
  try {
    const res = await Taro.request({
      url,
      method: 'GET',
      header: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: 'count=exact'
      }
    })
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const h = res.header as Record<string, string> | undefined
      const range = h?.['content-range'] ?? h?.['Content-Range'] ?? ''
      const m = typeof range === 'string' ? range.match(/\/(\d+)\s*$/) : null
      if (m) {
        return { count: parseInt(m[1], 10), error: null }
      }
      if (Array.isArray(res.data)) {
        return { count: res.data.length, error: null }
      }
      return { count: 0, error: null }
    }
    return { count: 0, error: 'count 请求失败' }
  } catch (e: any) {
    return { count: 0, error: e.message || '网络错误' }
  }
}

/** 首页统计用：近 N 天内的记录（本周均值、连续打卡），与列表分页无关 */
const HOME_STATS_RANGE_DAYS = 180

export async function getRecordsForHomeStats(
  userId: string
): Promise<{ data: BPRecord[] | null; error: string | null }> {
  const end = new Date()
  const start = new Date(end.getTime() - HOME_STATS_RANGE_DAYS * 24 * 60 * 60 * 1000)
  return getRecordsInRange(userId, start.toISOString(), end.toISOString())
}

/**
 * 按日期范围获取用户的血压记录（用于导出，最多支持约一年数据）
 * @param userId 用户 openid
 * @param startDate 开始日期 ISO 字符串（含时间，如 2024-01-01T00:00:00.000Z）
 * @param endDate 结束日期 ISO 字符串（含时间，如 2024-12-31T23:59:59.999Z）
 */
export async function getRecordsInRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<{ data: BPRecord[] | null; error: string | null }> {
  const params = new URLSearchParams()
  params.append('user_id', `eq.${userId}`)
  params.append('recorded_at', `gte.${startDate}`)
  params.append('recorded_at', `lte.${endDate}`)
  params.append('order', 'recorded_at.asc')
  params.append('limit', '5000')

  const url = `${REST_URL}/bp_records?${params.toString()}`

  try {
    const res = await Taro.request({
      url,
      method: 'GET',
      header: getHeaders()
    })

    if (res.statusCode >= 200 && res.statusCode < 300) {
      return { data: res.data as BPRecord[], error: null }
    }
    const errorMsg = (res.data as any)?.message || (res.data as any)?.error || `请求失败 (${res.statusCode})`
    return { data: null, error: errorMsg }
  } catch (e: any) {
    console.error('getRecordsInRange error:', e)
    return { data: null, error: e.message || '网络请求失败' }
  }
}

/**
 * 添加血压记录（单个）
 */
export async function addRecord(record: Omit<BPRecord, 'id' | 'created_at'>): Promise<{ data: BPRecord | null; error: string | null }> {
  // 获取 openid，用于更新 last_login_at
  const userInfo = getUserInfo()
  const openid = userInfo?.openid

  // 调用 Next.js API，在插入成功后更新 last_login_at
  try {
    const res = await Taro.request({
      url: `${API_BASE_URL}/api/bp_records`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        ...(openid ? { 'x-openid': openid } : {})
      },
      data: record
    })

    if (res.statusCode >= 200 && res.statusCode < 300) {
      return { data: res.data, error: null }
    } else {
      const errorMsg = res.data?.error || res.data?.message || `请求失败 (${res.statusCode})`
      return { data: null, error: errorMsg }
    }
  } catch (e: any) {
    console.error('addRecord error:', e)
    return { data: null, error: e.message || '网络请求失败' }
  }
}

/**
 * 更新血压记录
 */
export async function updateRecord(
  id: number,
  data: Partial<Omit<BPRecord, 'id' | 'user_id' | 'created_at'>>
): Promise<{ data: BPRecord | null; error: string | null }> {
  const result = await request<BPRecord[]>(`/bp_records`, {
    method: 'PATCH',
    params: {
      id: `eq.${id}`
    },
    data
  })

  if (result.data && Array.isArray(result.data)) {
    return { data: result.data[0] || null, error: null }
  }
  return { data: null, error: result.error }
}

/**
 * 删除血压记录
 */
export async function deleteRecord(id: number): Promise<{ error: string | null }> {
  const result = await request(`/bp_records`, {
    method: 'DELETE',
    params: {
      id: `eq.${id}`
    }
  })
  return { error: result.error }
}

// ============ 用户相关 API ============

export interface WxUser {
  id?: number
  openid: string
  nickname?: string
  avatar_url?: string
  created_at?: string
  last_login_at?: string
}

/**
 * 根据 openid 获取或创建用户
 */
export async function getOrCreateUser(openid: string): Promise<{ data: WxUser | null; error: string | null }> {
  // 先查询用户是否存在
  const { data: existingUsers, error: queryError } = await request<WxUser[]>('/wx_users', {
    params: {
      openid: `eq.${openid}`,
      limit: '1'
    }
  })

  if (queryError) {
    return { data: null, error: queryError }
  }

  if (existingUsers && existingUsers.length > 0) {
    return { data: existingUsers[0], error: null }
  }

  // 用户不存在，创建新用户
  const { data: newUsers, error: createError } = await request<WxUser[]>('/wx_users', {
    method: 'POST',
    data: {
      openid,
      created_at: new Date().toISOString()
    }
  })

  if (createError) {
    return { data: null, error: createError }
  }

  return { data: newUsers?.[0] || null, error: null }
}

/**
 * 批量添加血压记录（用于数据导入）
 */
export async function addRecordsBatch(records: Array<Omit<BPRecord, 'id' | 'created_at'>>): Promise<{ data: BPRecord[] | null; error: string | null }> {
  const result = await request<BPRecord[]>('/bp_records', {
    method: 'POST',
    data: records
  })

  return { data: result.data, error: result.error }
}

// 导出配置（方便调试）
export const config = {
  SUPABASE_URL,
  REST_URL
}
