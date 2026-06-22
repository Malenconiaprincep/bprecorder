/** 测量提醒订阅消息模板（公众平台 → 订阅消息） */
export const DEFAULT_SUBSCRIBE_TEMPLATE_ID = 'n_7gRV7nCOVIiK2TBvOZOfFVxOGqxMqNm1_j1ntEiDU'

export function resolveSubscribeTemplateId(): string {
  return process.env.WX_SUBSCRIBE_TEMPLATE_ID?.trim() || DEFAULT_SUBSCRIBE_TEMPLATE_ID
}
