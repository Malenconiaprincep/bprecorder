export interface BuildSecrets {
  DASHSCOPE_API_KEY: string
  QWEN_CHAT_URL: string
  QWEN_VL_MODEL: string
  QWEN_TEXT_MODEL: string
}

/** CSV 字段：openAiCompatible + /chat/completions */
const DEFAULT_OPENAI_COMPAT = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

type SecretsFile = {
  DASHSCOPE_API_KEY?: string
  /** CSV: openAiCompatible，如 https://xxx.cn-beijing.maas.aliyuncs.com/compatible-mode/v1 */
  openAiCompatible?: string
  /** 兼容旧字段名 */
  QWEN_COMPAT_BASE_URL?: string
  QWEN_CHAT_URL?: string
  QWEN_VL_MODEL?: string
  QWEN_TEXT_MODEL?: string
}

function resolveOpenAiCompatibleBase(local: SecretsFile): string {
  const fromCsv = local.openAiCompatible?.trim().replace(/\/$/, '')
  if (fromCsv) return fromCsv
  const legacy = local.QWEN_COMPAT_BASE_URL?.trim().replace(/\/$/, '')
  if (legacy) return legacy
  return DEFAULT_OPENAI_COMPAT
}

function resolveChatUrl(local: SecretsFile): string {
  if (local.QWEN_CHAT_URL?.trim()) {
    return local.QWEN_CHAT_URL.trim()
  }
  const base = resolveOpenAiCompatibleBase(local)
  if (base.endsWith('/chat/completions')) return base
  return `${base}/chat/completions`
}

/** 构建时读取 secrets.local.ts（不存在则空 key，便于 CI 无密钥构建） */
export function loadBuildSecrets(): BuildSecrets {
  let local: SecretsFile = {}
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    local = require('./secrets.local').default as SecretsFile
  } catch {
    // secrets.local.ts 未创建
  }

  return {
    DASHSCOPE_API_KEY: local.DASHSCOPE_API_KEY?.trim() ?? '',
    QWEN_CHAT_URL: resolveChatUrl(local),
    QWEN_VL_MODEL: local.QWEN_VL_MODEL?.trim() || 'qwen-vl-max',
    QWEN_TEXT_MODEL: local.QWEN_TEXT_MODEL?.trim() || 'qwen-plus',
  }
}

export function toDefineConstants(secrets: BuildSecrets): Record<string, string> {
  return {
    DASHSCOPE_API_KEY: JSON.stringify(secrets.DASHSCOPE_API_KEY),
    QWEN_CHAT_URL: JSON.stringify(secrets.QWEN_CHAT_URL),
    QWEN_VL_MODEL: JSON.stringify(secrets.QWEN_VL_MODEL),
    QWEN_TEXT_MODEL: JSON.stringify(secrets.QWEN_TEXT_MODEL),
  }
}
