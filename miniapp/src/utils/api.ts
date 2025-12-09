// API 地址，根据环境自动切换
// 开发环境: http://localhost:3000
// 生产环境: https://bprecorder.aikee.xyz

// 判断是否是开发环境
const isDev = process.env.NODE_ENV === 'development'

export const API_BASE_URL = isDev 
  ? 'http://localhost:3000' 
  : 'https://bprecorder.aikee.xyz'

