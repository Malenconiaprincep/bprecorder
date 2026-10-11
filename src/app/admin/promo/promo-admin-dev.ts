/**
 * 与 /api/admin/promo-campaigns 一致：仅在 next dev（NODE_ENV=development）时跳过密钥。
 * 注意：next build && next start 本地预览为 production 构建，仍需配置 PROMO_ADMIN_KEY。
 */
export const isPromoAdminDevBypass = process.env.NODE_ENV === 'development'

/** 有密钥则带上，开发环境无密钥也可请求 */
export function promoAdminHeaders(adminKey: string, extra?: Record<string, string>): HeadersInit {
  const h: Record<string, string> = { ...extra }
  const k = adminKey.trim()
  if (k) {
    h['x-promo-admin-key'] = k
  }
  return h
}
