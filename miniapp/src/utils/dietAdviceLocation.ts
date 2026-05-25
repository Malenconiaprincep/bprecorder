import Taro from '@tarojs/taro'

export type DietAdviceGps = {
  latitude: number
  longitude: number
}

/**
 * 用户查看生活饮食建议时调用，获取 gcj02 坐标。
 * 用户拒绝授权时返回 null，后端将回退到 IP 定位。
 */
export async function tryGetDietAdviceGps(): Promise<DietAdviceGps | null> {
  try {
    const { authSetting } = await Taro.getSetting()
    if (authSetting['scope.userLocation'] === false) {
      return null
    }

    if (authSetting['scope.userLocation'] !== true) {
      try {
        await Taro.authorize({ scope: 'scope.userLocation' })
      } catch {
        return null
      }
    }

    const loc = await Taro.getLocation({
      type: 'gcj02',
      isHighAccuracy: true,
      highAccuracyExpireTime: 5000,
    })

    const { latitude, longitude } = loc
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return null
    }

    return { latitude, longitude }
  } catch (e) {
    console.warn('[diet-advice] getLocation failed', e)
    return null
  }
}
