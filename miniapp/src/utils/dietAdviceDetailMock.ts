import type { DietAdviceData } from '../types/dietAdvice'

/** UI 调试：详情页使用假数据，不调接口（UI 调好后改为 false） */
export const DIET_ADVICE_USE_MOCK_DETAIL = true

/** 来自 Qwen 样例响应，已整理为 DietAdviceData 结构 */
export function buildDietAdviceDetailMock(): DietAdviceData {
  return {
    title: '今日生活饮食建议',
    summary:
      '本次血压118/78 mmHg，属理想范围（<120/80），心率70 bpm平稳；但近7天平均舒张压89 mmHg，且21次达高血压档（≥140/90或≥130/85糖尿病/肾病标准），提示舒张压持续偏高倾向，需重视日常管理，尤其阴雨潮湿天气易致血管收缩、水钠潴留，加重舒张压负担。',
    saltReminder:
      '今日宜严格控盐（≤5g），避免隐形盐：不喝浓汤、不吃酱菜/榨菜/腊肉，烹调改用葱姜蒜、花椒、八角、陈皮等天然香辛料祛湿增味。',
    card: {
      badgeLabel: '舒张压预警',
      badgeTone: 'attention',
      tipEmoji: '🌿',
      pillars: [
        {
          key: 'hydration',
          title: '限盐控湿',
          text: '减少钠摄入\n促进水液代谢',
          icon: 'salt',
        },
        {
          key: 'lightDiet',
          title: '温补不燥',
          text: '选山药、薏仁、茯苓\n鲫鱼等健脾利湿食材',
          icon: 'salad',
        },
        {
          key: 'climateCare',
          title: '规律监测',
          text: '每日固定时段测压\n晨起后、睡前记录变化',
          icon: 'water',
        },
      ],
      tags: ['舒张压管理', '祛湿防潮', '低钠饮食', '温热适配'],
    },
    recommendations: [
      '冬瓜薏仁茯苓排骨汤（去油）',
      '山药炒莴笋丝（少油清炒）',
      '陈皮蒸鲫鱼（去鳞去内脏，陈皮3g同蒸）',
    ],
    avoidTips: [
      '避免红烧、糖醋、卤制等高钠高糖菜肴',
      '忌食冷饮、冰啤酒、生冷瓜果（如西瓜、苦瓜）加重湿滞',
      '慎用肥腻荤汤（如猪骨浓汤、老母鸡汤）助湿生痰',
    ],
    fullPlan: {
      breakfast:
        '小米山药粥（小米50g+鲜山药80g切丁）+ 水煮蛋1个 + 凉拌马齿苋（焯水后加少许香油、姜末）',
      lunch:
        '杂粮饭（糙米:白米=1:1，共100g熟重）+ 陈皮蒸鲫鱼（鲫鱼1条约200g，陈皮3g，姜片3片）+ 清炒茼蒿（200g，橄榄油5g）',
      dinner:
        '冬瓜薏仁茯苓排骨汤（冬瓜150g、薏仁15g、茯苓10g、瘦排骨80g，撇净浮油）+ 蒸南瓜（150g）+ 凉拌豆腐丝（干豆腐丝50g+香菜+少量醋）',
      snacks: '烤苹果片（中等苹果半个，无糖烘烤）+ 炒薏米茶（炒薏仁10g沸水冲泡，温饮）',
      tips: [
        '餐前喝1小杯温薏米茶助运化',
        '烹饪全程不用味精、鸡精、蚝油；酱油改用减盐酱油且总量≤5ml/餐',
        '饭后缓步行走15分钟，助气机流通、祛湿降压',
      ],
    },
    disclaimer: '以上建议仅供参考，不能替代医生诊断与用药指导。',
    weather: {
      city: '本地',
      climateKind: 'rainy',
      climateLabel: '阵雨',
      climateTip: '阴雨潮湿，宜祛湿防潮、温热饮食，注意保暖防受凉。',
      temperatureC: 26,
      weatherText: '阵雨',
      pillars: [],
      tags: [],
      source: 'gps',
    },
    recipeReady: true,
  }
}
