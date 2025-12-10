import Taro from '@tarojs/taro'
import { API_BASE_URL } from '../utils/api'

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

/**
 * 获取我的组列表
 */
export async function getMyGroups(userId: string): Promise<{ success: boolean; groups?: Group[]; error?: string }> {
  try {
    const res = await Taro.request({
      url: `${API_BASE_URL}/api/groups?user_id=${userId}`,
      method: 'GET',
      header: { 'Content-Type': 'application/json' }
    })

    console.log('getMyGroups response:', res.data)
    if (res.statusCode === 200 && res.data.success) {
      return { success: true, groups: res.data.groups }
    }
    return { success: false, error: res.data.error || '获取失败' }
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
}): Promise<{ success: boolean; group?: Group; error?: string }> {
  try {
    const res = await Taro.request({
      url: `${API_BASE_URL}/api/groups`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: params
    })

    if (res.statusCode === 200 && res.data.success) {
      return { success: true, group: res.data.group }
    }
    return { success: false, error: res.data.error || '创建失败' }
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
    const res = await Taro.request({
      url: `${API_BASE_URL}/api/groups?invite_code=${inviteCode}`,
      method: 'GET',
      header: { 'Content-Type': 'application/json' }
    })

    if (res.statusCode === 200 && res.data.success) {
      return { success: true, group: res.data.group }
    }
    return { success: false, error: res.data.error || '邀请码无效' }
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
    const res = await Taro.request({
      url: `${API_BASE_URL}/api/groups/${groupId}`,
      method: 'GET',
      header: { 'Content-Type': 'application/json' }
    })

    if (res.statusCode === 200 && res.data.success) {
      return { success: true, group: res.data.group, members: res.data.members }
    }
    return { success: false, error: res.data.error || '获取失败' }
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
}): Promise<{ success: boolean; group?: Group; error?: string }> {
  try {
    const res = await Taro.request({
      url: `${API_BASE_URL}/api/groups/join`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: params
    })

    if (res.statusCode === 200 && res.data.success) {
      return { success: true, group: res.data.group }
    }
    return { success: false, error: res.data.error || '加入失败' }
  } catch (e: any) {
    console.error('joinGroup error:', e)
    return { success: false, error: e.message || '网络错误' }
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

/**
 * 获取组成员的血压记录
 */
export async function getMemberRecords(groupId: number, memberId: string): Promise<{
  success: boolean
  member?: GroupMember
  records?: BPRecord[]
  error?: string
}> {
  try {
    const res = await Taro.request({
      url: `${API_BASE_URL}/api/groups/${groupId}/members/${memberId}/records`,
      method: 'GET',
      header: { 'Content-Type': 'application/json' }
    })

    if (res.statusCode === 200 && res.data.success) {
      return { success: true, member: res.data.member, records: res.data.records }
    }
    return { success: false, error: res.data.error || '获取失败' }
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
    const res = await Taro.request({
      url: `${API_BASE_URL}/api/groups/${groupId}?user_id=${userId}`,
      method: 'DELETE',
      header: { 'Content-Type': 'application/json' }
    })

    if (res.statusCode === 200 && res.data.success) {
      return { success: true }
    }
    return { success: false, error: res.data.error || '删除失败' }
  } catch (e: any) {
    console.error('deleteGroup error:', e)
    return { success: false, error: e.message || '网络错误' }
  }
}

