import Taro from '@tarojs/taro'
import { getBPStatus, type BPStatusColor } from './bpStatus'

/**
 * 生成血压记录分享图片
 * @param systolic 收缩压
 * @param diastolic 舒张压
 * @param pulse 心率
 * @param recordedAt 记录时间
 * @returns 图片临时路径
 */
export async function generateShareImage(
  systolic: number,
  diastolic: number,
  pulse: number,
  recordedAt: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Canvas 尺寸（5:4 比例，适合分享）
    const canvasWidth = 750
    const canvasHeight = 600

    // 创建 Canvas 上下文
    const ctx = Taro.createCanvasContext('shareCanvas')

    // 背景渐变
    const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight)
    gradient.addColorStop(0, '#b5e0f7')
    gradient.addColorStop(1, '#e0f2fe')
    ctx.setFillStyle(gradient)
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)

    // 标题
    ctx.setFillStyle('#1e293b')
    ctx.setFontSize(48)
    ctx.setTextAlign('center')
    ctx.fillText('💓 血压记录', canvasWidth / 2, 80)

    // 日期时间
    const date = new Date(recordedAt)
    const dateStr = `${date.getMonth() + 1}月${date.getDate()}日`
    const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
    ctx.setFontSize(32)
    ctx.setFillStyle('#64748b')
    ctx.fillText(`${dateStr} ${timeStr}`, canvasWidth / 2, 130)

    // 血压值（大号显示）
    const bpY = 280
    ctx.setFillStyle('#1e293b')
    ctx.setFontSize(120)
    ctx.setTextAlign('right')
    ctx.fillText(systolic.toString(), canvasWidth / 2 - 20, bpY)
    
    ctx.setFontSize(60)
    ctx.fillText('/', canvasWidth / 2, bpY)
    
    ctx.setTextAlign('left')
    ctx.fillText(diastolic.toString(), canvasWidth / 2 + 20, bpY)

    // 单位
    ctx.setFontSize(36)
    ctx.setFillStyle('#64748b')
    ctx.setTextAlign('center')
    ctx.fillText('mmHg', canvasWidth / 2, bpY + 50)

    // 心率
    ctx.setFontSize(40)
    ctx.setFillStyle('#1e293b')
    ctx.fillText(`💓 心率: ${pulse} bpm`, canvasWidth / 2, bpY + 120)

    // 状态标签
    const status = getBPStatus(systolic, diastolic)
    const statusY = bpY + 180
    ctx.setFillStyle(getStatusColor(status.color))
    const barW = Math.min(340, Math.max(200, status.label.length * 28 + 40))
    ctx.fillRect(canvasWidth / 2 - barW / 2, statusY - 30, barW, 60)
    ctx.setFillStyle('#ffffff')
    ctx.setFontSize(status.label.length > 8 ? 28 : 32)
    ctx.fillText(status.label, canvasWidth / 2, statusY + 8)

    // 底部提示
    ctx.setFillStyle('#94a3b8')
    ctx.setFontSize(28)
    ctx.fillText('血压记录助手', canvasWidth / 2, canvasHeight - 40)

    // 绘制完成
    ctx.draw(false, () => {
      // 导出图片
      Taro.canvasToTempFilePath({
        canvasId: 'shareCanvas',
        width: canvasWidth,
        height: canvasHeight,
        destWidth: canvasWidth,
        destHeight: canvasHeight,
        success: (res) => {
          resolve(res.tempFilePath)
        },
        fail: (err) => {
          reject(err)
        }
      })
    })
  })
}

/**
 * 分享图状态条背景色（与小程序分级一致）
 */
function getStatusColor(colorType: BPStatusColor): string {
  // 与首页大卡片同系渐变中取主色，白字对比足够
  const colorMap: Record<BPStatusColor, string> = {
    ideal: '#0d9f6e',
    low: '#14a3b8',
    prehigh: '#ca8a04',
    'high-1': '#ea7c2e',
    'high-2': '#e85d5d',
    'high-3': '#c23d36'
  }
  return colorMap[colorType] || '#64748b'
}

