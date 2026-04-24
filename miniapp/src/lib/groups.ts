import Taro from '@tarojs/taro'

// Supabase 配置
const SUPABASE_URL = 'https://vaeklnwhlogbvrwtthbe.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhZWtsbndobG9nYnZyd3R0aGJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2MDY3MTksImV4cCI6MjA3OTE4MjcxOX0.oLH3iiEhhPJydhXKdjJwDPTpqcUak44OOkFA9D8K15o'
const REST_URL = `${SUPABASE_URL}/rest/v1`

// 通用请求头
function getHeaders() {
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  }
}

// 组信息
export interface Group {
  id: number
  name: string
  description?: string
  owner_id: string
  invite_code: string
  created_at: string
  updated_at?: string
  my_role?: 'owner' | 'admin' | 'member'
  joined_at?: string
  member_count?: number
}

// 组成员
export interface GroupMember {
  id: number
  group_id: number
  user_id: string
  nickname?: string
  role: 'owner' | 'admin' | 'member'
  joined_at: string
  user?: {
    nickname?: string
    avatar_url?: string
  }
  latest_record?: {
    systolic: number
    diastolic: number
    pulse: number
    recorded_at: string
  }
}

// 血压记录
export interface BPRecord {
  id: number
  systolic: number
  diastolic: number
  pulse: number
  recorded_at: string
  hand?: string
  note?: string
}

// 分页信息
export interface Pagination {
  page: number
  limit: number
  total: number
  hasMore: boolean
}

// 生成随机邀请码
function generateInviteCode(length: number = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * 获取我的组列表
 */
export async function getMyGroups(userId: string): Promise<{ success: boolean; groups?: Group[]; error?: string }> {
  try {
    // 查询用户加入的组（关联查询）
    const res = await Taro.request({
      url: `${REST_URL}/bp_group_members?user_id=eq.${userId}&select=role,joined_at,bp_groups(id,name,description,owner_id,invite_code,created_at,updated_at,bp_group_members(count))`,
      method: 'GET',
      header: getHeaders()
    })

    if (res.statusCode >= 200 && res.statusCode < 300) {
      const raw = res.data
      const memberships = Array.isArray(raw) ? raw : []
      const groups = memberships
        .filter(
          (m: any) =>
            m &&
            m.bp_groups &&
            typeof m.bp_groups === 'object' &&
            !Array.isArray(m.bp_groups)
        )
        .map((m: any) => {
          const g = m.bp_groups
          const countRow = Array.isArray(g.bp_group_members) ? g.bp_group_members[0] : null
          const rawCount = countRow?.count
          const memberCount =
            typeof rawCount === 'number'
              ? rawCount
              : typeof rawCount === 'string'
                ? parseInt(rawCount, 10)
                : undefined
          const parsed =
            memberCount !== undefined && !Number.isNaN(memberCount) ? memberCount : undefined
          const { bp_group_members: _c, ...rest } = g
          return {
            ...rest,
            member_count: parsed,
            my_role: m.role || 'member',
            joined_at: m.joined_at
          }
        })
      return { success: true, groups }
    }
    return { success: false, error: res.data?.message || '获取失败' }
  } catch (e: any) {
    console.error('getMyGroups error:', e)
    return { success: false, error: e.message || '网络错误' }
  }
}

/**
 * 创建组
 */
export async function createGroup(params: {
  name: string
  description?: string
  owner_id: string
  nickname?: string
  avatar_url?: string
}): Promise<{ success: boolean; group?: Group; error?: string }> {
  try {
    const inviteCode = generateInviteCode()

    // 如果提供了昵称或头像，更新用户信息
    if (params.nickname || params.avatar_url) {
      const updateData: Record<string, string> = {}
      if (params.nickname) updateData.nickname = params.nickname
      if (params.avatar_url) updateData.avatar_url = params.avatar_url

      await Taro.request({
        url: `${REST_URL}/wx_users?openid=eq.${params.owner_id}`,
        method: 'PATCH',
        header: getHeaders(),
        data: updateData
      })
    }

    // 创建组
    const createRes = await Taro.request({
      url: `${REST_URL}/bp_groups`,
      method: 'POST',
      header: getHeaders(),
      data: {
        name: params.name,
        description: params.description || '',
        owner_id: params.owner_id,
        invite_code: inviteCode
      }
    })

    if (createRes.statusCode < 200 || createRes.statusCode >= 300) {
      return { success: false, error: createRes.data?.message || '创建失败' }
    }

    const group = Array.isArray(createRes.data) ? createRes.data[0] : createRes.data

    // 将创建者添加为成员（角色为 owner）
    await Taro.request({
      url: `${REST_URL}/bp_group_members`,
      method: 'POST',
      header: getHeaders(),
      data: {
        group_id: group.id,
        user_id: params.owner_id,
        nickname: params.nickname,
        role: 'owner'
      }
    })

    return { success: true, group }
  } catch (e: any) {
    console.error('createGroup error:', e)
    return { success: false, error: e.message || '网络错误' }
  }
}

/**
 * 通过邀请码获取组信息
 */
export async function getGroupByInviteCode(inviteCode: string): Promise<{ success: boolean; group?: Group; error?: string }> {
  try {
    // 查询组
    const res = await Taro.request({
      url: `${REST_URL}/bp_groups?invite_code=eq.${inviteCode.toUpperCase()}&select=id,name,description,owner_id,created_at`,
      method: 'GET',
      header: getHeaders()
    })

    if (res.statusCode >= 200 && res.statusCode < 300 && res.data?.length > 0) {
      const group = res.data[0]

      // 获取成员数量
      const countRes = await Taro.request({
        url: `${REST_URL}/bp_group_members?group_id=eq.${group.id}&select=id`,
        method: 'GET',
        header: { ...getHeaders(), 'Prefer': 'count=exact' }
      })

      const memberCount = countRes.header?.['content-range']?.split('/')[1] || res.data?.length || 0

      return { success: true, group: { ...group, member_count: parseInt(memberCount) } }
    }
    return { success: false, error: '邀请码无效' }
  } catch (e: any) {
    console.error('getGroupByInviteCode error:', e)
    return { success: false, error: e.message || '网络错误' }
  }
}

/**
 * 获取组详情（包含成员列表）
 */
export async function getGroupDetail(groupId: number): Promise<{
  success: boolean
  group?: Group
  members?: GroupMember[]
  error?: string
}> {
  try {
    // 并行获取组信息和成员列表
    const [groupRes, membersRes] = await Promise.all([
      Taro.request({
        url: `${REST_URL}/bp_groups?id=eq.${groupId}`,
        method: 'GET',
        header: getHeaders()
      }),
      Taro.request({
        url: `${REST_URL}/bp_group_members?group_id=eq.${groupId}&order=joined_at.asc`,
        method: 'GET',
        header: getHeaders()
      })
    ])

    if (groupRes.statusCode < 200 || groupRes.statusCode >= 300 || !groupRes.data?.length) {
      return { success: false, error: '组不存在' }
    }

    const group = groupRes.data[0]
    const members = membersRes.data || []

    // 获取今天的日期范围（北京时间）
    const now = new Date()
    const beijingOffset = 8 * 60 * 60 * 1000
    const beijingNow = new Date(now.getTime() + beijingOffset)
    const todayStart = new Date(beijingNow)
    todayStart.setUTCHours(0, 0, 0, 0)
    const todayStartUTC = new Date(todayStart.getTime() - beijingOffset)
    const todayEndUTC = new Date(todayStartUTC.getTime() + 24 * 60 * 60 * 1000)

    // 获取每个成员的用户信息和当天血压记录
    const membersWithDetails = await Promise.all(
      members.map(async (member: any) => {
        // 并行获取用户信息和当天记录
        const [userRes, recordRes] = await Promise.all([
          Taro.request({
            url: `${REST_URL}/wx_users?openid=eq.${member.user_id}&select=nickname,avatar_url&limit=1`,
            method: 'GET',
            header: getHeaders()
          }),
          Taro.request({
            url: `${REST_URL}/bp_records?user_id=eq.${member.user_id}&recorded_at=gte.${todayStartUTC.toISOString()}&recorded_at=lt.${todayEndUTC.toISOString()}&order=recorded_at.desc&limit=1`,
            method: 'GET',
            header: getHeaders()
          })
        ])

        const user = userRes.data?.[0] || { nickname: null, avatar_url: null }
        const todayRecord = recordRes.data?.[0] || null

        return {
          ...member,
          user,
          latest_record: todayRecord
        }
      })
    )

    return { success: true, group, members: membersWithDetails }
  } catch (e: any) {
    console.error('getGroupDetail error:', e)
    return { success: false, error: e.message || '网络错误' }
  }
}

/**
 * 通过邀请码加入组
 */
export async function joinGroup(params: {
  invite_code: string
  user_id: string
  nickname?: string
  avatar_url?: string
}): Promise<{ success: boolean; group?: Group; error?: string }> {
  try {
    // 通过邀请码查找组
    const groupRes = await Taro.request({
      url: `${REST_URL}/bp_groups?invite_code=eq.${params.invite_code.toUpperCase()}&select=id,name`,
      method: 'GET',
      header: getHeaders()
    })

    if (groupRes.statusCode < 200 || groupRes.statusCode >= 300 || !groupRes.data?.length) {
      return { success: false, error: '邀请码无效' }
    }

    const group = groupRes.data[0]

    // 检查是否已经是成员
    const existingRes = await Taro.request({
      url: `${REST_URL}/bp_group_members?group_id=eq.${group.id}&user_id=eq.${params.user_id}&select=id`,
      method: 'GET',
      header: getHeaders()
    })

    if (existingRes.data?.length > 0) {
      return { success: false, error: '你已经是该组成员' }
    }

    // 如果提供了昵称或头像，更新用户信息
    if (params.nickname || params.avatar_url) {
      const updateData: Record<string, string> = {}
      if (params.nickname) updateData.nickname = params.nickname
      if (params.avatar_url) updateData.avatar_url = params.avatar_url

      await Taro.request({
        url: `${REST_URL}/wx_users?openid=eq.${params.user_id}`,
        method: 'PATCH',
        header: getHeaders(),
        data: updateData
      })
    }

    // 获取用户昵称（如果没有提供）
    let memberNickname = params.nickname
    if (!memberNickname) {
      const userRes = await Taro.request({
        url: `${REST_URL}/wx_users?openid=eq.${params.user_id}&select=nickname&limit=1`,
        method: 'GET',
        header: getHeaders()
      })
      memberNickname = userRes.data?.[0]?.nickname
    }

    // 加入组
    const joinRes = await Taro.request({
      url: `${REST_URL}/bp_group_members`,
      method: 'POST',
      header: getHeaders(),
      data: {
        group_id: group.id,
        user_id: params.user_id,
        nickname: memberNickname,
        role: 'member'
      }
    })

    if (joinRes.statusCode < 200 || joinRes.statusCode >= 300) {
      return { success: false, error: joinRes.data?.message || '加入失败' }
    }

    return { success: true, group }
  } catch (e: any) {
    console.error('joinGroup error:', e)
    return { success: false, error: e.message || '网络错误' }
  }
}

/**
 * 获取组成员的血压记录（支持分页）
 */
export async function getMemberRecords(
  groupId: number,
  memberId: string,
  page: number = 1,
  limit: number = 20
): Promise<{
  success: boolean
  member?: GroupMember
  records?: BPRecord[]
  pagination?: Pagination
  error?: string
}> {
  try {
    const offset = (page - 1) * limit

    // 首页请求时获取成员信息
    let member: GroupMember | undefined
    if (page === 1) {
      // 验证该成员是否属于该组
      const memberRes = await Taro.request({
        url: `${REST_URL}/bp_group_members?group_id=eq.${groupId}&user_id=eq.${memberId}&select=id,user_id,nickname,role,joined_at`,
        method: 'GET',
        header: getHeaders()
      })

      if (!memberRes.data?.length) {
        return { success: false, error: '成员不存在' }
      }

      // 获取用户信息
      const userRes = await Taro.request({
        url: `${REST_URL}/wx_users?openid=eq.${memberId}&select=nickname,avatar_url&limit=1`,
        method: 'GET',
        header: getHeaders()
      })

      member = {
        ...memberRes.data[0],
        user: userRes.data?.[0] || { nickname: null, avatar_url: null }
      }
    }

    // 获取血压记录（分页）- 使用 Range 头实现分页
    const recordsRes = await Taro.request({
      url: `${REST_URL}/bp_records?user_id=eq.${memberId}&select=id,systolic,diastolic,pulse,recorded_at,hand,note&order=recorded_at.desc`,
      method: 'GET',
      header: {
        ...getHeaders(),
        'Range': `${offset}-${offset + limit - 1}`,
        'Prefer': 'count=exact'
      }
    })

    const records = recordsRes.data || []

    // 从 content-range 获取总数
    const contentRange = recordsRes.header?.['content-range'] || recordsRes.header?.['Content-Range'] || ''
    const totalMatch = contentRange.match(/\/(\d+)/)
    const total = totalMatch ? parseInt(totalMatch[1]) : records.length

    return {
      success: true,
      member,
      records,
      pagination: {
        page,
        limit,
        total,
        hasMore: offset + limit < total
      }
    }
  } catch (e: any) {
    console.error('getMemberRecords error:', e)
    return { success: false, error: e.message || '网络错误' }
  }
}

/**
 * 删除组（仅组主可以）
 */
export async function deleteGroup(groupId: number, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // 验证是否是组主
    const groupRes = await Taro.request({
      url: `${REST_URL}/bp_groups?id=eq.${groupId}&select=owner_id`,
      method: 'GET',
      header: getHeaders()
    })

    if (!groupRes.data?.length || groupRes.data[0].owner_id !== userId) {
      return { success: false, error: '无权限删除' }
    }

    // 先删除组成员（如果没有 CASCADE）
    await Taro.request({
      url: `${REST_URL}/bp_group_members?group_id=eq.${groupId}`,
      method: 'DELETE',
      header: getHeaders()
    })

    // 删除组
    const deleteRes = await Taro.request({
      url: `${REST_URL}/bp_groups?id=eq.${groupId}`,
      method: 'DELETE',
      header: getHeaders()
    })

    if (deleteRes.statusCode < 200 || deleteRes.statusCode >= 300) {
      return { success: false, error: deleteRes.data?.message || '删除失败' }
    }

    return { success: true }
  } catch (e: any) {
    console.error('deleteGroup error:', e)
    return { success: false, error: e.message || '网络错误' }
  }
}

/**
 * 退出组（成员可以退出自己的组）
 */
export async function leaveGroup(groupId: number, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const isDev = process.env.NODE_ENV === 'development'
    const API_BASE_URL = isDev ? 'http://localhost:3000' : 'https://bprecorder.aikee.xyz'

    const res = await Taro.request({
      url: `${API_BASE_URL}/api/groups/${groupId}/members/${userId}?user_id=${userId}`,
      method: 'DELETE',
      header: {
        'Content-Type': 'application/json'
      }
    })

    if (res.statusCode >= 200 && res.statusCode < 300) {
      const result = res.data as { success: boolean; error?: string }
      return result
    }

    return { success: false, error: res.data?.error || '退出失败' }
  } catch (e: any) {
    console.error('leaveGroup error:', e)
    return { success: false, error: e.message || '网络错误' }
  }
}

/**
 * 踢出组员（仅组主可以）
 */
export async function removeMember(groupId: number, memberId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const isDev = process.env.NODE_ENV === 'development'
    const API_BASE_URL = isDev ? 'http://localhost:3000' : 'https://bprecorder.aikee.xyz'

    const res = await Taro.request({
      url: `${API_BASE_URL}/api/groups/${groupId}/members/${memberId}?user_id=${userId}`,
      method: 'DELETE',
      header: {
        'Content-Type': 'application/json'
      }
    })

    if (res.statusCode >= 200 && res.statusCode < 300) {
      const result = res.data as { success: boolean; error?: string }
      return result
    }

    return { success: false, error: res.data?.error || '操作失败' }
  } catch (e: any) {
    console.error('removeMember error:', e)
    return { success: false, error: e.message || '网络错误' }
  }
}
