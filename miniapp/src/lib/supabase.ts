import Taro from '@tarojs/taro'

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
  recorded_at: string
  created_at?: string
}

/**
 * 获取用户的血压记录
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
 * 添加血压记录
 */
export async function addRecord(record: Omit<BPRecord, 'id' | 'created_at'>): Promise<{ data: BPRecord | null; error: string | null }> {
  const result = await request<BPRecord[]>('/bp_records', {
    method: 'POST',
    data: record
  })

  // POST 返回数组，取第一个
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

// 导出配置（方便调试）
export const config = {
  SUPABASE_URL,
  REST_URL
}
