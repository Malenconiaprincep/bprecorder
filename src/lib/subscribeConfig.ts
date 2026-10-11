/** 测量提醒订阅消息模板（公众平台 → 订阅消息） */
export const DEFAULT_SUBSCRIBE_TEMPLATE_ID = 'n_7gRV7nCOVIiK2TBvOZOfFVxOGqxMqNm1_j1ntEiDU'

/**
 * 默认模板字段（与公众平台该模板 keyword 一致）
 * 可用 {reminderTime}、{reminderDateTime} 占位符
 */
export const DEFAULT_SUBSCRIBE_TEMPLATE_DATA: Record<string, string> = {
  thing1: '血压测量提醒',
  thing2: '今日尚未记录，请按时测量',
  time4: '{reminderDateTime}',
}

export function resolveSubscribeTemplateId(): string {
  return process.env.WX_SUBSCRIBE_TEMPLATE_ID?.trim() || DEFAULT_SUBSCRIBE_TEMPLATE_ID
}
