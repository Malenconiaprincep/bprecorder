export type PromoPrizeTier = {
  tier_key: string
  tier_name: string
  sort_order: number
  slots: number
  label: string
}

export type Campaign = {
  slug: string
  title: string
  window_start_date: string
  window_end_date: string
  required_streak_days: number
  grand_prize_slots: number
  second_prize_slots: number
  grand_prize_label?: string
  second_prize_label?: string
  /** 与库表 promo_campaign_prize_tiers 一致；sort_order 越小越优先（先到先得） */
  prize_tiers?: PromoPrizeTier[]
  tz: string
  is_enabled: boolean
  created_at?: string
  updated_at?: string
}

export const STORAGE_KEY = 'bp_promo_admin_key'

export function createEmptyCampaign(): Campaign {
  const prize_tiers: PromoPrizeTier[] = [
    {
      tier_key: 'grand',
      tier_name: '大奖',
      sort_order: 1,
      slots: 1,
      label: '上臂式电子血压计 1 台',
    },
    {
      tier_key: 'second',
      tier_name: '二等奖',
      sort_order: 2,
      slots: 3,
      label: '体脂秤/臂带/健康小礼品（随机）1 份',
    },
    {
      tier_key: 'third',
      tier_name: '三等奖',
      sort_order: 3,
      slots: 5,
      label: '健康小礼品 1 份（具体以实物为准）',
    },
  ]
  return {
    slug: '',
    title: '',
    window_start_date: '',
    window_end_date: '',
    required_streak_days: 30,
    grand_prize_slots: 1,
    second_prize_slots: 3,
    grand_prize_label: '上臂式电子血压计 1 台',
    second_prize_label: '体脂秤/臂带/健康小礼品（随机）1 份',
    prize_tiers,
    tz: 'Asia/Shanghai',
    is_enabled: true,
  }
}
