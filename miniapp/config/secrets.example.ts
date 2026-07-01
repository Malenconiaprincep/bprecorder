/**
 * 复制为 secrets.local.ts 并填写（secrets.local.ts 已 gitignore）。
 * 字段与阿里云导出的 CSV 一致：
 *   apiKey → DASHSCOPE_API_KEY
 *   openAiCompatible → openAiCompatible（拍照/文本均走 OpenAI 兼容 Chat Completions）
 *   apiHost → 仅用于微信小程序 request 合法域名（不含 https://）
 *
 * build: npm run build:weapp / dev:weapp
 */
export default {
  DASHSCOPE_API_KEY: '',
  openAiCompatible: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  /** 可选：MaaS 部署的模型名，默认 qwen-vl-max / qwen-plus */
  QWEN_VL_MODEL: 'qwen-vl-max',
  QWEN_TEXT_MODEL: 'qwen-plus',
}
