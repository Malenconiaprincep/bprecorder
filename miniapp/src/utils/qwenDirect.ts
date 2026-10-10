import Taro from '@tarojs/taro'

/** 构建时由 secrets.local.ts → openAiCompatible + /chat/completions 注入 */
export function getQwenChatUrl(): string {
  const url = typeof QWEN_CHAT_URL === 'string' ? QWEN_CHAT_URL.trim() : ''
  if (!url) {
    throw new Error(
      '未配置 QWEN_CHAT_URL：请在 secrets.local.ts 填写 openAiCompatible（CSV 字段）后重新 build'
    )
  }
  return url
}

export function getQwenVlModel(): string {
  const model = typeof QWEN_VL_MODEL === 'string' ? QWEN_VL_MODEL.trim() : ''
  return model || 'qwen-vl-max'
}

export function getQwenTextModel(): string {
  const model = typeof QWEN_TEXT_MODEL === 'string' ? QWEN_TEXT_MODEL.trim() : ''
  return model || 'qwen-plus'
}

/** 构建时打入包内，不再请求 /api/analyze/key */
export function getDashScopeApiKey(): string {
  const key = typeof DASHSCOPE_API_KEY === 'string' ? DASHSCOPE_API_KEY.trim() : ''
  if (!key) {
    throw new Error(
      '未配置 DASHSCOPE_API_KEY：请复制 miniapp/config/secrets.example.ts 为 secrets.local.ts 并填写密钥后重新 build'
    )
  }
  return key
}

export function stripJsonFences(s: string): string {
  let t = s.trim()
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i
  const m = t.match(fence)
  if (m) return m[1].trim()
  return t.replace(/```json|```/g, '').trim()
}

export async function callQwenChat(
  apiKey: string,
  prompt: string,
  options?: { maxTokens?: number; model?: string; timeout?: number }
): Promise<string> {
  const maxTokens = options?.maxTokens ?? 1200
  const model = options?.model ?? getQwenTextModel()
  const timeout = options?.timeout ?? 55000

  const aiRes = await Taro.request({
    url: getQwenChatUrl(),
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
