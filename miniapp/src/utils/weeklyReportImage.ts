import Taro from '@tarojs/taro'
import { getBPStatus, type BPStatusColor } from './bpStatus'
import type { WeeklyReportStats } from './weeklyReport'

/** 分享封面；略增高以容纳留白与一句暖心话 */
const W = 750
const H = 820

function fillRoundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0)
  ctx.lineTo(x + w, y + h - rr)
  ctx.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2)
  ctx.lineTo(x + rr, y + h)
  ctx.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI)
  ctx.lineTo(x, y + rr)
  ctx.arc(x + rr, y + rr, rr, Math.PI, -Math.PI / 2)
  ctx.closePath()
  ctx.fill()
}

function statusTheme(color: BPStatusColor): { bg: string; fg: string } {
  const map: Record<BPStatusColor, { bg: string; fg: string }> = {
    ideal: { bg: '#dcfce7', fg: '#15803d' },
    low: { bg: '#cffafe', fg: '#0e7490' },
    prehigh: { bg: '#fef9c3', fg: '#a16207' },
    'high-1': { bg: '#ffedd5', fg: '#c2410c' },
    'high-2': { bg: '#ffe4e6', fg: '#be123c' },
    'high-3': { bg: '#fecdd3', fg: '#9f1239' }
  }
  return map[color] || { bg: '#e2e8f0', fg: '#475569' }
}

/** 正常/理想时不把收缩压做成「橙色预警」，避免误解 */
function bpNumberColors(color: BPStatusColor): { sys: string; dia: string; slash: string } {
  switch (color) {
    case 'ideal':
      return { sys: '#0f172a', dia: '#1d4ed8', slash: '#cbd5e1' }
    case 'low':
      return { sys: '#0e7490', dia: '#0891b2', slash: '#a5f3fc' }
    case 'prehigh':
      return { sys: '#c2410c', dia: '#ea580c', slash: '#e2e8f0' }
    case 'high-1':
    case 'high-2':
      return { sys: '#ea580c', dia: '#dc2626', slash: '#e2e8f0' }
    case 'high-3':
      return { sys: '#dc2626', dia: '#b91c1c', slash: '#fecaca' }
    default:
      return { sys: '#0f172a', dia: '#1d4ed8', slash: '#cbd5e1' }
  }
}

function warmSubtitle(color: BPStatusColor): string {
  const map: Record<BPStatusColor, string> = {
    ideal: '这周挺平稳，继续保持就好',
    low: '偏低时注意慢起慢站，别太猛',
    prehigh: '略偏高，多测几天心里更有数',
    'high-1': '偏高一段了，记得按时监测',
    'high-2': '波动不小，有空和医生聊聊更安心',
    'high-3': '明显偏高，建议尽快就医复查'
  }
  return map[color]
}

/**
 * 生成本周总结分享封面图（canvasId 需为 weeklyReportCanvas）
 */
export function generateWeeklyReportImage(stats: WeeklyReportStats): Promise<string> {
  return new Promise((resolve, reject) => {
    const ctx = Taro.createCanvasContext('weeklyReportCanvas')

    const bg = ctx.createLinearGradient(0, 0, W, H * 0.85)
    bg.addColorStop(0, '#7dd3fc')
    bg.addColorStop(0.4, '#bae6fd')
    bg.addColorStop(1, '#e0f2fe')
    ctx.setFillStyle(bg)
    ctx.fillRect(0, 0, W, H)

    ctx.setFillStyle('rgba(255,255,255,0.45)')
    ctx.beginPath()
    ctx.arc(W * 0.88, -20, 200, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(-30, H * 0.45, 140, 0, Math.PI * 2)
    ctx.fill()

    const cardX = 36
    const cardY = 72
    const cardW = W - 72
    const cardH = 662
    const radius = 32

    ctx.setFillStyle('rgba(255,255,255,0.55)')
    fillRoundRect(ctx, cardX + 6, cardY + 10, cardW, cardH, radius + 6)
    ctx.setFillStyle('#ffffff')
    fillRoundRect(ctx, cardX, cardY, cardW, cardH, radius)

    const avgStatus = getBPStatus(stats.avgSystolic, stats.avgDiastolic)
    const theme = statusTheme(avgStatus.color)
    const nums = bpNumberColors(avgStatus.color)
    const warm = warmSubtitle(avgStatus.color)

    const cx = W / 2
    ctx.setTextAlign('center')

    // 顶栏
    ctx.setFillStyle('#3b82f6')
    fillRoundRect(ctx, cardX + 28, cardY + 22, 8, 28, 4)
    ctx.setFillStyle('#334155')
    ctx.setFontSize(30)
    ctx.setTextAlign('left')
    ctx.fillText('近 7 天血压小结', cardX + 48, cardY + 44)
    ctx.setFillStyle('#94a3b8')
    ctx.setFontSize(22)
    ctx.fillText('给关心你的人看一眼', cardX + 48, cardY + 74)

    ctx.setTextAlign('center')
    const yLabel = cardY + 118
    ctx.setFillStyle('#64748b')
    ctx.setFontSize(26)
    ctx.fillText('平均血压', cx, yLabel)

    const yBp = yLabel + 124
    ctx.setFontSize(90)
    ctx.setTextAlign('right')
    ctx.setFillStyle(nums.sys)
    ctx.fillText(String(stats.avgSystolic), cx - 20, yBp)
    ctx.setTextAlign('center')
    ctx.setFillStyle(nums.slash)
    ctx.setFontSize(46)
    ctx.fillText('/', cx, yBp - 4)
    ctx.setTextAlign('left')
    ctx.setFillStyle(nums.dia)
    ctx.setFontSize(90)
    ctx.fillText(String(stats.avgDiastolic), cx + 20, yBp)

    const yUnit = yBp + 46
    ctx.setFillStyle('#94a3b8')
    ctx.setFontSize(24)
    ctx.fillText('mmHg', cx, yUnit)

    // mmHg 与状态胶囊之间多留白
    const pillH = 60
    const yPillText = yUnit + 72
    const pillW = Math.min(420, Math.max(240, (avgStatus.label.length + 2) * 34 + 120))
    const pillX = cx - pillW / 2
    const pillY = yPillText - 44
    ctx.setFillStyle(theme.bg)
    fillRoundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2)
    ctx.setFillStyle(theme.fg)
    ctx.setFontSize(30)
    ctx.setTextAlign('center')
    ctx.fillText(`${avgStatus.emoji}  ${avgStatus.label}`, cx, yPillText)

    const yWarm = yPillText + 52
    ctx.setFillStyle('#64748b')
    ctx.setFontSize(24)
    ctx.fillText(warm, cx, yWarm)

    const yMeta = yWarm + 40
    ctx.setFillStyle('#94a3b8')
    ctx.setFontSize(23)
    ctx.fillText(`${stats.rangeLabel}  ·  共 ${stats.count} 次测量`, cx, yMeta)

    const yDivider1 = yMeta + 32
    ctx.setStrokeStyle('#e2e8f0')
    ctx.setLineWidth(1)
    ctx.beginPath()
    ctx.moveTo(cardX + 44, yDivider1)
    ctx.lineTo(cardX + cardW - 44, yDivider1)
    ctx.stroke()

    const yHr = yDivider1 + 38
    ctx.setFillStyle('#475569')
    ctx.setFontSize(25)
    ctx.fillText(`心率均值 ${stats.avgPulse} bpm`, cx, yHr)

    const yStat = yHr + 38
    ctx.setFillStyle('#94a3b8')
    ctx.setFontSize(22)
    ctx.fillText(`正常 ${stats.normalCount} 次  ·  需关注 ${stats.abnormalCount} 次`, cx, yStat)

    const yDivider2 = yStat + 28
    ctx.beginPath()
    ctx.moveTo(cardX + 44, yDivider2)
    ctx.lineTo(cardX + cardW - 44, yDivider2)
    ctx.stroke()

    const yCta = yDivider2 + 40
    ctx.setFillStyle('#2563eb')
    ctx.setFontSize(27)
    ctx.fillText('进小程序看完整统计', cx, yCta)

    ctx.setTextAlign('center')
    ctx.setFillStyle('rgba(255,255,255,0.92)')
    ctx.setFontSize(22)
    ctx.fillText('血压记录助手', W / 2, cardY + cardH + 36)
    ctx.setFillStyle('rgba(255,255,255,0.78)')
    ctx.setFontSize(20)
    ctx.fillText('仅供个人参考 · 不替代诊疗', W / 2, cardY + cardH + 64)

    ctx.draw(false, () => {
      Taro.canvasToTempFilePath({
        canvasId: 'weeklyReportCanvas',
        width: W,
        height: H,
        destWidth: W,
        destHeight: H,
        success: res => resolve(res.tempFilePath),
        fail: err => reject(err)
      })
    })
  })
}
