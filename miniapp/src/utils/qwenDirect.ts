import Taro from '@tarojs/taro'
import { ANALYZE_KEY_API_BASE_URL } from './api'

/** 与拍照识别一致：DashScope OpenAI 兼容 Chat Completions */
export const QWEN_CHAT_URL =
  'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

export const QWEN_TEXT_MODEL = 'qwen-plus'

export function stripJsonFences(s: string): string {
  let t = s.trim()
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i
  const m = t.match(fence)
  if (m) return m[1].trim()
  return t.replace(/```json|```/g, '').trim()
}

/** 从线上 /api/analyze/key 获取 DashScope 密钥（与拍照直连相同） */
export async function fetchDashScopeApiKey(): Promise<string> {
  const keyRes = await Taro.request<{ apiKey?: string; error?: string }>({
    url: `${ANALYZE_KEY_API_BASE_URL}/api/analyze/key`,
    method: 'GET',
    timeout: 15000,
  })
  if (keyRes.statusCode !== 200 || !keyRes.data?.apiKey) {
    const msg = keyRes.data?.error || '无法获取 AI 密钥'
    throw new Error(msg)
  }
  return keyRes.data.apiKey
}

export async function callQwenChat(
  apiKey: string,
  prompt: string,
  options?: { maxTokens?: number; model?: string; timeout?: number }
): Promise<string> {
  const maxTokens = options?.maxTokens ?? 1200
  const model = options?.model ?? QWEN_TEXT_MODEL
  const timeout = options?.timeout ?? 55000

  const aiRes = await Taro.request({
    url: QWEN_CHAT_URL,
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    data: {
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.7,
    },
    timeout,
  })

  if (aiRes.statusCode !== 200) {
    const raw = aiRes.data as Record<string, unknown> | string
    let detail = 'AI 请求失败'
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
  return text
}
