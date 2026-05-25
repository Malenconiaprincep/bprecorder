import Taro from '@tarojs/taro'
import type { DietAdviceData } from '../types/dietAdvice'
import { DIET_ADVICE_FEATURE_NAME } from '../types/dietAdvice'

export const DIET_ADVICE_CANVAS_ID = 'dietAdviceShareCanvas'
export const DIET_ADVICE_CANVAS_W = 750

const PAD = 36
const INNER = DIET_ADVICE_CANVAS_W - PAD * 2
const LINE_H = 38
const SECTION_GAP = 24

function fillRoundRect(
  ctx: Taro.CanvasContext,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
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

/** 按字符数折行（中文分享长图够用） */
export function wrapTextLines(text: string, charsPerLine = 24): string[] {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return []
  const lines: string[] = []
  for (let i = 0; i < t.length; i += charsPerLine) {
    lines.push(t.slice(i, i + charsPerLine))
  }
  return lines
}

function formatPillarDesc(text: string): string {
  const normalized = text.replace(/\\n/g, '\n').trim()
  if (normalized.includes('\n')) {
    return normalized
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .join('，')
  }
  if (/\s*[+＋]\s*/.test(normalized)) {
    return normalized
      .split(/\s*[+＋]\s*/)
      .map((s) => s.trim())
      .filter(Boolean)
      .join('，')
  }
  return normalized
}

function blockHeight(lines: string[], titleExtra = 56, lineH = LINE_H): number {
  return titleExtra + Math.max(lines.length, 1) * lineH + 28
}

export function estimateDietAdviceImageHeight(data: DietAdviceData): number {
  let h = PAD + 88

  if (data.summary) {
    h += blockHeight(wrapTextLines(data.summary, 24), 72)
    if (data.weather?.temperatureC != null) h += 32
    h += SECTION_GAP
  }

  if (data.card?.pillars?.length) {
    h += 56
    data.card.pillars.forEach((p) => {
      h += 44 + wrapTextLines(formatPillarDesc(p.text), 26).length * 34
    })
    h += 28 + SECTION_GAP
  }

  if (data.saltReminder) {
    h += blockHeight(wrapTextLines(data.saltReminder, 24)) + SECTION_GAP
  }

  const meals = [
    { label: '早餐', value: data.fullPlan?.breakfast },
    { label: '午餐', value: data.fullPlan?.lunch },
    { label: '晚餐', value: data.fullPlan?.dinner },
    { label: '加餐', value: data.fullPlan?.snacks },
  ].filter((m) => m.value)

  if (meals.length) {
    h += 56
    meals.forEach((m) => {
      h += 36 + wrapTextLines(String(m.value), 22).length * 34
    })
    h += 28 + SECTION_GAP
  }

  if (data.recommendations?.length) {
    h += 56 + data.recommendations.length * 44 + 28 + SECTION_GAP
  }

  if (data.avoidTips?.length) {
    h += 56
    data.avoidTips.forEach((t) => {
      h += wrapTextLines(t, 24).length * 34 + 8
    })
    h += 28 + SECTION_GAP
  }

  if (data.fullPlan?.tips?.length) {
    h += 56
    data.fullPlan.tips.forEach((t) => {
      h += wrapTextLines(t, 24).length * 34 + 8
    })
    h += 28 + SECTION_GAP
  }

  h += wrapTextLines(data.disclaimer || '', 28).length * 32 + 72
  return Math.max(Math.ceil(h), 900)
}

function drawSectionTitle(ctx: Taro.CanvasContext, y: number, title: string): number {
  ctx.setFillStyle('#0f172a')
  ctx.setFontSize(32)
  ctx.setTextAlign('left')
  ctx.fillText(title, PAD + 20, y + 36)
  return y + 56
}

function drawBodyLines(
  ctx: Taro.CanvasContext,
  x: number,
  y: number,
  lines: string[],
  color = '#475569',
  fontSize = 26,
  lineH = LINE_H
): number {
  ctx.setFillStyle(color)
  ctx.setFontSize(fontSize)
  ctx.setTextAlign('left')
  let cy = y
  lines.forEach((line) => {
    ctx.fillText(line, x, cy)
    cy += lineH
  })
  return cy
}

function drawWhiteCard(ctx: Taro.CanvasContext, y: number, cardH: number): number {
  ctx.setFillStyle('#ffffff')
  fillRoundRect(ctx, PAD, y, INNER, cardH, 24)
  return y + 20
}

export function generateDietAdviceShareImage(data: DietAdviceData): Promise<string> {
  const H = estimateDietAdviceImageHeight(data)

  return new Promise((resolve, reject) => {
    const ctx = Taro.createCanvasContext(DIET_ADVICE_CANVAS_ID)

    const bg = ctx.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#e8f4fc')
    bg.addColorStop(0.35, '#f0f7ff')
    bg.addColorStop(1, '#f4f8fc')
    ctx.setFillStyle(bg)
    ctx.fillRect(0, 0, DIET_ADVICE_CANVAS_W, H)

    let y = PAD + 16
    const pageTitle = data.title?.replace(/^🍽\s*/, '') || DIET_ADVICE_FEATURE_NAME

    ctx.setFillStyle('#0c4a6e')
    ctx.setFontSize(40)
    ctx.setTextAlign('center')
    ctx.fillText(pageTitle, DIET_ADVICE_CANVAS_W / 2, y + 40)
    y += 72

    if (data.summary) {
      const summaryLines = wrapTextLines(data.summary, 24)
      const cardH = blockHeight(summaryLines, 72) + (data.weather?.temperatureC != null ? 32 : 0)
      const innerY = drawWhiteCard(ctx, y, cardH)
      ctx.setFillStyle('#0f172a')
      ctx.setFontSize(30)
      ctx.setTextAlign('left')
      ctx.fillText('💓 健康监测', PAD + 20, innerY + 28)
      let cy = drawBodyLines(ctx, PAD + 20, innerY + 64, summaryLines)
      if (data.weather?.temperatureC != null) {
        ctx.setFillStyle('#0284c7')
        ctx.setFontSize(24)
        const wx = data.weather
        ctx.fillText(
          `当地约 ${wx.temperatureC}°C${wx.weatherText ? ` · ${wx.weatherText}` : ''}`,
          PAD + 20,
          cy + 8
        )
      }
      y += cardH + SECTION_GAP
    }

    if (data.card?.pillars?.length) {
      let cardH = 56
      data.card.pillars.forEach((p) => {
        cardH += 44 + wrapTextLines(formatPillarDesc(p.text), 26).length * 34
      })
      cardH += 28
      const innerY = drawWhiteCard(ctx, y, cardH)
      let cy = drawSectionTitle(ctx, innerY - 20, '💡 今日要点')
      data.card.pillars.forEach((p, i) => {
        if (i > 0) cy += 8
        ctx.setFillStyle('#1e293b')
        ctx.setFontSize(28)
        ctx.fillText(p.title, PAD + 20, cy + 24)
        cy += 36
        cy = drawBodyLines(ctx, PAD + 20, cy, wrapTextLines(formatPillarDesc(p.text), 26), '#64748b', 24, 34)
      })
      y += cardH + SECTION_GAP
    }

    if (data.saltReminder) {
      const lines = wrapTextLines(data.saltReminder, 24)
      const cardH = blockHeight(lines)
      const innerY = drawWhiteCard(ctx, y, cardH)
      let cy = drawSectionTitle(ctx, innerY - 20, '🧂 少盐提醒')
      drawBodyLines(ctx, PAD + 20, cy, lines, '#0369a1')
      y += cardH + SECTION_GAP
    }

    const meals = [
      { label: '🌅 早餐', value: data.fullPlan?.breakfast },
      { label: '☀️ 午餐', value: data.fullPlan?.lunch },
      { label: '🌙 晚餐', value: data.fullPlan?.dinner },
      { label: '🍎 加餐', value: data.fullPlan?.snacks },
    ].filter((m) => m.value)

    if (meals.length) {
      let cardH = 56
      meals.forEach((m) => {
        cardH += 36 + wrapTextLines(String(m.value), 22).length * 34
      })
      cardH += 28
      const innerY = drawWhiteCard(ctx, y, cardH)
      let cy = drawSectionTitle(ctx, innerY - 20, '📅 今日三餐')
      meals.forEach((m) => {
        ctx.setFillStyle('#0f172a')
        ctx.setFontSize(26)
        ctx.fillText(m.label, PAD + 20, cy + 22)
        cy += 32
        cy = drawBodyLines(ctx, PAD + 20, cy, wrapTextLines(String(m.value), 22), '#334155', 24, 34)
        cy += 8
      })
      y += cardH + SECTION_GAP
    }

    if (data.recommendations?.length) {
      const cardH = 56 + data.recommendations.length * 44 + 28
      const innerY = drawWhiteCard(ctx, y, cardH)
      let cy = drawSectionTitle(ctx, innerY - 20, '✓ 推荐菜品')
      data.recommendations.forEach((item, i) => {
        ctx.setFillStyle('#334155')
        ctx.setFontSize(26)
        ctx.fillText(`${i + 1}. ${item}`, PAD + 20, cy + 24)
        cy += 44
      })
      y += cardH + SECTION_GAP
    }

    if (data.avoidTips?.length) {
      let cardH = 56
      data.avoidTips.forEach((t) => {
        cardH += wrapTextLines(t, 24).length * 34 + 8
      })
      cardH += 28
      const innerY = drawWhiteCard(ctx, y, cardH)
      let cy = drawSectionTitle(ctx, innerY - 20, '! 忌口提示')
      data.avoidTips.forEach((item) => {
        cy = drawBodyLines(ctx, PAD + 20, cy, wrapTextLines(`× ${item}`, 23), '#9a3412', 24, 34)
        cy += 8
      })
      y += cardH + SECTION_GAP
    }

    if (data.fullPlan?.tips?.length) {
      let cardH = 56
      data.fullPlan.tips.forEach((t) => {
        cardH += wrapTextLines(t, 24).length * 34 + 8
      })
      cardH += 28
      const innerY = drawWhiteCard(ctx, y, cardH)
      let cy = drawSectionTitle(ctx, innerY - 20, '💡 小贴士')
      data.fullPlan.tips.forEach((item) => {
        cy = drawBodyLines(ctx, PAD + 20, cy, wrapTextLines(`· ${item}`, 23), '#334155', 24, 34)
        cy += 8
      })
      y += cardH + SECTION_GAP
    }

    const disclaimerLines = wrapTextLines(data.disclaimer || '以上建议仅供参考。', 28)
    drawBodyLines(ctx, PAD, y, disclaimerLines, '#94a3b8', 22, 32)

    ctx.setFillStyle('#94a3b8')
    ctx.setFontSize(22)
    ctx.setTextAlign('center')
    ctx.fillText('血压记录助手 · AI 生活饮食建议', DIET_ADVICE_CANVAS_W / 2, H - 36)

    ctx.draw(false, () => {
      setTimeout(() => {
        Taro.canvasToTempFilePath({
          canvasId: DIET_ADVICE_CANVAS_ID,
          width: DIET_ADVICE_CANVAS_W,
          height: H,
          destWidth: DIET_ADVICE_CANVAS_W,
          destHeight: H,
          success: (res) => resolve(res.tempFilePath),
          fail: reject,
        })
      }, 300)
    })
  })
}

export async function saveDietAdviceLongImage(data: DietAdviceData): Promise<void> {
  Taro.showLoading({ title: '生成长图…' })
  try {
    const filePath = await generateDietAdviceShareImage(data)
    Taro.hideLoading()
    try {
      await Taro.saveImageToPhotosAlbum({ filePath })
      Taro.showToast({ title: '已保存到相册', icon: 'success' })
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'errMsg' in err
          ? String((err as { errMsg: string }).errMsg)
          : ''
      if (msg.includes('auth deny') || msg.includes('authorize')) {
        const { confirm } = await Taro.showModal({
          title: '需要相册权限',
          content: '请允许保存图片到相册，以便保存生活建议长图',
          confirmText: '去设置',
        })
        if (confirm) Taro.openSetting()
      } else {
        Taro.showToast({ title: '保存失败，请重试', icon: 'none' })
      }
    }
  } catch {
    Taro.hideLoading()
    Taro.showToast({ title: '生成失败，请重试', icon: 'none' })
  }
}
