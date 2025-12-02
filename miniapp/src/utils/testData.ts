import { BPRecord } from '../lib/supabase'

// 是否使用测试数据（开发时设为 true，发布时设为 false）
export const USE_TEST_DATA = false

// 固定的测试数据（保证每次加载一致）
let cachedTestData: BPRecord[] | null = null

// 生成测试数据
export const generateTestData = (): BPRecord[] => {
  // 如果已经生成过，返回缓存的数据
  if (cachedTestData) {
    return cachedTestData
  }

  const testData: BPRecord[] = []
  const now = new Date()

  // 固定的随机种子数据，保证每次生成一致
  const seedData = [
    // 今天 - 2条
    {
      dayOffset: 0, records: [
        { hour: 8, min: 32, sys: 135, dia: 85, pulse: 72 },
        { hour: 20, min: 15, sys: 128, dia: 82, pulse: 68 }
      ]
    },
    // 昨天 - 3条
    {
      dayOffset: 1, records: [
        { hour: 7, min: 45, sys: 142, dia: 88, pulse: 75 },
        { hour: 14, min: 20, sys: 138, dia: 86, pulse: 70 },
        { hour: 21, min: 10, sys: 130, dia: 80, pulse: 65 }
      ]
    },
    // 2天前 - 1条
    {
      dayOffset: 2, records: [
        { hour: 9, min: 0, sys: 125, dia: 78, pulse: 68 }
      ]
    },
    // 3天前 - 2条
    {
      dayOffset: 3, records: [
        { hour: 8, min: 15, sys: 145, dia: 92, pulse: 78 },
        { hour: 19, min: 30, sys: 138, dia: 85, pulse: 72 }
      ]
    },
    // 4天前 - 1条
    {
      dayOffset: 4, records: [
        { hour: 10, min: 0, sys: 132, dia: 82, pulse: 70 }
      ]
    },
    // 5天前 - 2条
    {
      dayOffset: 5, records: [
        { hour: 7, min: 30, sys: 128, dia: 80, pulse: 66 },
        { hour: 20, min: 45, sys: 122, dia: 76, pulse: 64 }
      ]
    },
    // 6天前 - 1条
    {
      dayOffset: 6, records: [
        { hour: 8, min: 0, sys: 136, dia: 84, pulse: 71 }
      ]
    },
    // 7天前 - 2条
    {
      dayOffset: 7, records: [
        { hour: 9, min: 15, sys: 140, dia: 88, pulse: 74 },
        { hour: 18, min: 30, sys: 132, dia: 82, pulse: 69 }
      ]
    },
    // 8天前 - 1条
    {
      dayOffset: 8, records: [
        { hour: 8, min: 45, sys: 138, dia: 86, pulse: 73 }
      ]
    },
    // 9天前 - 2条
    {
      dayOffset: 9, records: [
        { hour: 7, min: 0, sys: 144, dia: 90, pulse: 76 },
        { hour: 21, min: 0, sys: 135, dia: 84, pulse: 70 }
      ]
    },
    // 10天前 - 1条
    {
      dayOffset: 10, records: [
        { hour: 10, min: 30, sys: 130, dia: 80, pulse: 67 }
      ]
    },
  ]

  let id = 1
  seedData.forEach(day => {
    const date = new Date(now)
    date.setDate(now.getDate() - day.dayOffset)

    day.records.forEach(record => {
      const recordDate = new Date(date)
      recordDate.setHours(record.hour, record.min, 0, 0)

      testData.push({
        id: id++,
        user_id: 'test_user',
        systolic: record.sys,
        diastolic: record.dia,
        pulse: record.pulse,
        recorded_at: recordDate.toISOString()
      })
    })
  })

  // 按时间倒序排列
  cachedTestData = testData.sort((a, b) =>
    new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
  )

  return cachedTestData
}

// 获取测试数据
export const getTestData = (): BPRecord[] => {
  return generateTestData()
}

