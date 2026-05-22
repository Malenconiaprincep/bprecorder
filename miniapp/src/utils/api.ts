// API 地址，根据环境自动切换
// 开发环境: http://localhost:3000
// 生产环境: https://bprecorder.aikee.xyz

// 判断是否是开发环境
const isDev = process.env.NODE_ENV === 'development'

export const API_BASE_URL = isDev 
  ? 'http://localhost:3000' 
  : 'https://bprecorder.aikee.xyz'

/** analyze/key 始终走线上（本地无对应密钥配置） */
export const ANALYZE_KEY_API_BASE_URL = 'https://bprecorder.aikee.xyz'

