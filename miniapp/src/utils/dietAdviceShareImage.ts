import Taro from '@tarojs/taro'
import type { DietAdviceData } from '../types/dietAdvice'
import { DIET_ADVICE_FEATURE_NAME } from '../types/dietAdvice'
// @ts-ignore 仅让 webpack 输出到 dist/assets；绘制勿用此相对路径
import miniProgramQrcodeBundled from '../assets/mini-program-qrcode.png'

/** 供 copyFile / readFileSync 使用的包根路径（勿传给 Image 或 getImageInfo 的相对路径） */
const MINI_PROGRAM_QRCODE_PACK = '/assets/mini-program-qrcode.png'

/** 防止打包时 tree-shake 掉二维码资源 */
void miniProgramQrcodeBundled
const MINI_PROGRAM_QRCODE_CACHE = `${Taro.env.USER_DATA_PATH}/diet-share-qrcode.png`

export const DIET_ADVICE_CANVAS_ID = 'dietAdviceShareCanvas'
export const DIET_ADVICE_CANVAS_W = 750
export const MINI_APP_BRAND_NAME = '平稳小日记'

const PAD = 36
const INNER = DIET_ADVICE_CANVAS_W - PAD * 2
const LINE_H = 38
const SECTION_GAP = 24
/** fillText 的 y 为基线；副标题与正文之间至少留出字号 + 间距 */
const SUBTITLE_GAP = 12
/** 卡片内区块标题占用：上内边距 36 + 字号 32 + 段后间距 */
const SECTION_HEAD = 36 + 32 + SUBTITLE_GAP
const DEFAULT_DISCLAIMER = '以上建议仅供参考，不能替代医生诊断与用药指导。'
const FOOTER_QR_SIZE = 120
const FOOTER_CARD_H = 156
const FOOTER_AFTER_LAST_CARD = 28
const FOOTER_DISCLAIMER_LINE_H = 32
const FOOTER_BOTTOM_PAD = 36

function advanceAfterSubtitle(baseline: number, fontSize: number): number {
  return baseline + fontSize + SUBTITLE_GAP
}

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

function blockHeight(lines: string[], titleExtra = SECTION_HEAD, lineH = LINE_H): number {
  return titleExtra + Math.max(lines.length, 1) * lineH + 28
}

function getDisclaimerLines(data: DietAdviceData): string[] {
  const lines = wrapTextLines(data.disclaimer || DEFAULT_DISCLAIMER, 28)
  return lines.length ? lines : wrapTextLines(DEFAULT_DISCLAIMER, 28)
}

function estimateFooterHeight(disclaimerLines: string[]): number {
  return (
    FOOTER_AFTER_LAST_CARD +
    disclaimerLines.length * FOOTER_DISCLAIMER_LINE_H +
    20 +
    FOOTER_CARD_H +
    FOOTER_BOTTOM_PAD
  )
}

type QrcodeImage = { path: string; width: number; height: number }

function copyPackImageToUserData(packPath: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    Taro.getFileSystemManager().copyFile({
      srcPath: packPath,
      destPath,
      success: () => resolve(),
      fail: reject,
    })
  })
}

/** 包内图 → 用户目录临时文件，避免子页面相对路径；Canvas 用 info.path 绘制 */
async function loadMiniProgramQrcodeImage(): Promise<QrcodeImage | null> {
  const fsm = Taro.getFileSystemManager()

  const loadFromLocalFile = async (localPath: string): Promise<QrcodeImage | null> => {
    const info = await Taro.getImageInfo({ src: localPath })
    if (!info?.path) return null
    return {
      path: info.path,
      width: info.width || FOOTER_QR_SIZE,
      height: info.height || FOOTER_QR_SIZE,
    }
  }

  try {
    await copyPackImageToUserData(MINI_PROGRAM_QRCODE_PACK, MINI_PROGRAM_QRCODE_CACHE)
    return await loadFromLocalFile(MINI_PROGRAM_QRCODE_CACHE)
  } catch (copyErr) {
    console.warn('[diet-advice] qrcode copyFile failed, try base64:', copyErr)
  }

  try {
    const base64 = fsm.readFileSync(MINI_PROGRAM_QRCODE_PACK, 'base64') as string
    const dataUrl = `data:image/png;base64,${base64}`
    return await loadFromLocalFile(dataUrl)
  } catch (readErr) {
    console.warn('[diet-advice] qrcode readFileSync failed:', MINI_PROGRAM_QRCODE_PACK, readErr)
    return null
  }
}

export function estimateDietAdviceImageHeight(data: DietAdviceData): number {
  let h = PAD + 88

  if (data.summary) {
    h += blockHeight(wrapTextLines(data.summary, 24), 72)
    if (data.weather?.temperatureC != null) h += 32
    h += SECTION_GAP
  }

  if (data.card?.pillars?.length) {
    h += SECTION_HEAD
    data.card.pillars.forEach((p) => {
      h += 28 + SUBTITLE_GAP + wrapTextLines(formatPillarDesc(p.text), 26).length * 34
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
    h += SECTION_HEAD
    meals.forEach((m) => {
      h += 26 + SUBTITLE_GAP + wrapTextLines(String(m.value), 22).length * 34
    })
    h += 28 + SECTION_GAP
  }

  if (data.recommendations?.length) {
    h += SECTION_HEAD + data.recommendations.length * (26 + SUBTITLE_GAP + 8) + 28 + SECTION_GAP
  }

  if (data.avoidTips?.length) {
    h += SECTION_HEAD
    data.avoidTips.forEach((t) => {
      h += wrapTextLines(t, 24).length * 34 + 8
    })
    h += 28 + SECTION_GAP
  }

  if (data.fullPlan?.tips?.length) {
    h += SECTION_HEAD
    data.fullPlan.tips.forEach((t) => {
      h += wrapTextLines(t, 24).length * 34 + 8
    })
    h += 28 + SECTION_GAP
  }

  h += estimateFooterHeight(getDisclaimerLines(data))
  return Math.max(Math.ceil(h), 900)
}

function drawSectionTitle(ctx: Taro.CanvasContext, innerTop: number, title: string): number {
  const baseline = innerTop + 36
  ctx.setFillStyle('#0f172a')
  ctx.setFontSize(32)
  ctx.setTextAlign('left')
  ctx.fillText(title, PAD + 20, baseline)
  return advanceAfterSubtitle(baseline, 32)
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

function drawCenteredDisclaimer(
  ctx: Taro.CanvasContext,
  startY: number,
  lines: string[]
): number {
  ctx.setFillStyle('#94a3b8')
  ctx.setFontSize(22)
  ctx.setTextAlign('center')
  let cy = startY + 22
  lines.forEach((line) => {
    ctx.fillText(line, DIET_ADVICE_CANVAS_W / 2, cy)
    cy += FOOTER_DISCLAIMER_LINE_H
  })
  return cy + 20
}

function drawFooterBrand(ctx: Taro.CanvasContext, startY: number, qr: QrcodeImage | null): number {
  drawWhiteCard(ctx, startY, FOOTER_CARD_H)
  const qrX = PAD + 28
  const qrY = startY + (FOOTER_CARD_H - FOOTER_QR_SIZE) / 2

  if (qr) {
    ctx.drawImage(
      qr.path,
      0,
      0,
      qr.width,
      qr.height,
      qrX,
      qrY,
      FOOTER_QR_SIZE,
      FOOTER_QR_SIZE
    )
  } else {
    ctx.setStrokeStyle('#e2e8f0')
    ctx.setLineWidth(2)
    ctx.strokeRect(qrX, qrY, FOOTER_QR_SIZE, FOOTER_QR_SIZE)
  }

  const textX = qrX + FOOTER_QR_SIZE + 28
  const titleBaseline = startY + FOOTER_CARD_H / 2 - 24
  ctx.setTextAlign('left')
  ctx.setFillStyle('#0f172a')
  ctx.setFontSize(34)
  ctx.fillText(MINI_APP_BRAND_NAME, textX, titleBaseline)
  ctx.setFillStyle('#64748b')
  ctx.setFontSize(24)
  ctx.fillText('微信扫一扫，打开小程序', textX, titleBaseline + 42)
  ctx.fillText('AI 生活饮食建议', textX, titleBaseline + 76)

  return startY + FOOTER_CARD_H + FOOTER_BOTTOM_PAD
}

export function generateDietAdviceShareImage(data: DietAdviceData): Promise<string> {
  const disclaimerLines = getDisclaimerLines(data)
  const H = estimateDietAdviceImageHeight(data)

  return loadMiniProgramQrcodeImage().then((qrImage) =>
    new Promise((resolve, reject) => {
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
      let cardH = SECTION_HEAD
      data.card.pillars.forEach((p) => {
        cardH += 28 + SUBTITLE_GAP + wrapTextLines(formatPillarDesc(p.text), 26).length * 34
      })
      cardH += 28
      const innerY = drawWhiteCard(ctx, y, cardH)
      let cy = drawSectionTitle(ctx, innerY, '💡 今日要点')
      data.card.pillars.forEach((p, i) => {
        if (i > 0) cy += 8
        ctx.setFillStyle('#1e293b')
        ctx.setFontSize(28)
        ctx.fillText(p.title, PAD + 20, cy)
        cy = advanceAfterSubtitle(cy, 28)
        cy = drawBodyLines(ctx, PAD + 20, cy, wrapTextLines(formatPillarDesc(p.text), 26), '#64748b', 24, 34)
      })
      y += cardH + SECTION_GAP
    }

    if (data.saltReminder) {
      const lines = wrapTextLines(data.saltReminder, 24)
      const cardH = blockHeight(lines)
      const innerY = drawWhiteCard(ctx, y, cardH)
      let cy = drawSectionTitle(ctx, innerY, '🧂 少盐提醒')
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
      let cardH = SECTION_HEAD
      meals.forEach((m) => {
        cardH += 26 + SUBTITLE_GAP + wrapTextLines(String(m.value), 22).length * 34
      })
      cardH += 28
      const innerY = drawWhiteCard(ctx, y, cardH)
      let cy = drawSectionTitle(ctx, innerY, '📅 今日三餐')
      meals.forEach((m) => {
        ctx.setFillStyle('#0f172a')
        ctx.setFontSize(26)
        ctx.fillText(m.label, PAD + 20, cy)
        cy = advanceAfterSubtitle(cy, 26)
        cy = drawBodyLines(ctx, PAD + 20, cy, wrapTextLines(String(m.value), 22), '#334155', 24, 34)
        cy += 8
      })
      y += cardH + SECTION_GAP
    }

    if (data.recommendations?.length) {
      const cardH = SECTION_HEAD + data.recommendations.length * (26 + SUBTITLE_GAP + 8) + 28
      const innerY = drawWhiteCard(ctx, y, cardH)
      let cy = drawSectionTitle(ctx, innerY, '✓ 推荐菜品')
      data.recommendations.forEach((item, i) => {
        ctx.setFillStyle('#334155')
        ctx.setFontSize(26)
        ctx.fillText(`${i + 1}. ${item}`, PAD + 20, cy)
        cy += 26 + SUBTITLE_GAP + 8
      })
      y += cardH + SECTION_GAP
    }

    if (data.avoidTips?.length) {
      let cardH = SECTION_HEAD
      data.avoidTips.forEach((t) => {
        cardH += wrapTextLines(t, 24).length * 34 + 8
      })
      cardH += 28
      const innerY = drawWhiteCard(ctx, y, cardH)
      let cy = drawSectionTitle(ctx, innerY, '! 忌口提示')
      data.avoidTips.forEach((item) => {
        cy = drawBodyLines(ctx, PAD + 20, cy, wrapTextLines(`× ${item}`, 23), '#9a3412', 24, 34)
        cy += 8
      })
      y += cardH + SECTION_GAP
    }

    if (data.fullPlan?.tips?.length) {
      let cardH = SECTION_HEAD
      data.fullPlan.tips.forEach((t) => {
        cardH += wrapTextLines(t, 24).length * 34 + 8
      })
      cardH += 28
      const innerY = drawWhiteCard(ctx, y, cardH)
      let cy = drawSectionTitle(ctx, innerY, '💡 小贴士')
      data.fullPlan.tips.forEach((item) => {
        cy = drawBodyLines(ctx, PAD + 20, cy, wrapTextLines(`· ${item}`, 23), '#334155', 24, 34)
        cy += 8
      })
      y += cardH + SECTION_GAP
    }

    y += FOOTER_AFTER_LAST_CARD
    y = drawCenteredDisclaimer(ctx, y, disclaimerLines)
    drawFooterBrand(ctx, y, qrImage)

    const exportDelay = qrImage ? 520 : 300
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
      }, exportDelay)
    })
  })
  )
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
