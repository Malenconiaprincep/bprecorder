import Taro from '@tarojs/taro'
import { API_BASE_URL } from '../utils/api'
import { getToken, getUserInfo, logout } from './auth'

export interface LoginDiagnosticStep {
  name: string
  ok: boolean
  detail: string
  extra?: Record<string, unknown>
}

export interface LoginDiagnosticReport {
  generatedAt: string
  summary: string
  success: boolean
  steps: LoginDiagnosticStep[]
  textReport: string
}

function maskCode(code: string | undefined): string {
  if (!code) return '(无)'
  if (code.length <= 8) return `${code} (len=${code.length})`
  return `${code.slice(0, 8)}... (len=${code.length})`
}

function maskOpenid(openid: string | undefined): string {
  if (!openid) return '(无)'
  if (openid.length <= 8) return openid
  return `${openid.slice(0, 6)}...${openid.slice(-4)}`
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function getEnvVersion(): string {
  try {
    return Taro.getAccountInfoSync()?.miniProgram?.envVersion || 'unknown'
  } catch {
    return 'unknown'
  }
}

async function getNetworkType(): Promise<string> {
  try {
    const res = await Taro.getNetworkType()
    return res.networkType || 'unknown'
  } catch (e: any) {
    return `获取失败: ${e?.errMsg || e?.message || String(e)}`
  }
}

function buildTextReport(steps: LoginDiagnosticStep[], summary: string): string {
  const lines: string[] = [
    '=== 血压记录 · 登录诊断报告 ===',
    `时间: ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    `结论: ${summary}`,
    '',
  ]

  steps.forEach((step, index) => {
    lines.push(`[${index + 1}] ${step.ok ? '✓' : '✗'} ${step.name}`)
    lines.push(step.detail)
    if (step.extra && Object.keys(step.extra).length > 0) {
      lines.push(safeJson(step.extra))
    }
    lines.push('')
  })

  lines.push('请将本报告全文复制后发给客服，便于排查登录问题。')
  return lines.join('\n')
}

/**
 * 执行完整登录诊断（正式版可用），用于远程收集用户侧错误信息。
 */
export async function runLoginDiagnostic(): Promise<LoginDiagnosticReport> {
  const steps: LoginDiagnosticStep[] = []
  const generatedAt = new Date().toISOString()

  // 1. 设备与环境
  let systemInfo: Taro.getSystemInfoSync.Result | Record<string, unknown> = {}
  try {
    systemInfo = Taro.getSystemInfoSync()
    steps.push({
      name: '设备信息',
      ok: true,
      detail: `${systemInfo.brand || '?'} ${systemInfo.model || '?'} · ${systemInfo.system || '?'} · 微信 ${systemInfo.version || '?'}`,
      extra: {
        brand: systemInfo.brand,
        model: systemInfo.model,
        system: systemInfo.system,
        platform: systemInfo.platform,
        wechatVersion: systemInfo.version,
        SDKVersion: systemInfo.SDKVersion,
        benchmarkLevel: systemInfo.benchmarkLevel,
        screenWidth: systemInfo.screenWidth,
        screenHeight: systemInfo.screenHeight,
        pixelRatio: systemInfo.pixelRatio,
        envVersion: getEnvVersion(),
        apiBaseUrl: API_BASE_URL,
      },
    })
  } catch (e: any) {
    steps.push({
      name: '设备信息',
      ok: false,
      detail: `获取失败: ${e?.errMsg || e?.message || String(e)}`,
    })
  }

  // 2. 网络
  const networkType = await getNetworkType()
  const networkOk = networkType !== 'none' && !networkType.startsWith('获取失败')
  steps.push({
    name: '网络状态',
    ok: networkOk,
    detail: networkOk ? `当前网络: ${networkType}` : `网络异常: ${networkType}`,
    extra: { networkType },
  })

  // 3. 本地登录缓存
  const localUser = getUserInfo()
  const localToken = getToken()
  steps.push({
    name: '本地缓存',
    ok: true,
    detail: localUser
      ? `已有用户信息，openid=${maskOpenid(localUser.openid)}`
      : '无本地用户信息',
    extra: {
      hasUserInfo: !!localUser,
      openid: maskOpenid(localUser?.openid),
      hasToken: !!localToken,
      tokenLength: localToken?.length || 0,
      nickName: localUser?.nickName || null,
    },
  })

  // 4. API 连通性
  let apiReachable = false
  let apiHealthDetail = ''
  let apiHealthExtra: Record<string, unknown> = {}
  const healthStart = Date.now()
  try {
    const healthRes = await Taro.request({
      url: `${API_BASE_URL}/api/wx-login`,
      method: 'GET',
      timeout: 15000,
    })
    apiReachable = healthRes.statusCode === 200
    apiHealthDetail = `GET /api/wx-login → HTTP ${healthRes.statusCode}，耗时 ${Date.now() - healthStart}ms`
    apiHealthExtra = {
      statusCode: healthRes.statusCode,
      durationMs: Date.now() - healthStart,
      data: healthRes.data,
      errMsg: healthRes.errMsg,
    }
  } catch (e: any) {
    apiHealthDetail = `API 不可达: ${e?.errMsg || e?.message || String(e)}，耗时 ${Date.now() - healthStart}ms`
    apiHealthExtra = {
      durationMs: Date.now() - healthStart,
      errMsg: e?.errMsg,
      message: e?.message,
      errno: e?.errno,
    }
  }
  steps.push({
    name: '服务器连通',
    ok: apiReachable,
    detail: apiHealthDetail,
    extra: apiHealthExtra,
  })

  // 5. 微信 login 获取 code
  let wxCode: string | undefined
  let wxLoginOk = false
  let wxLoginDetail = ''
  let wxLoginExtra: Record<string, unknown> = {}
  try {
    const loginRes = await Taro.login()
    wxCode = loginRes.code
    wxLoginOk = !!wxCode
    wxLoginDetail = wxLoginOk
      ? `Taro.login 成功，code=${maskCode(wxCode)}`
      : `Taro.login 未返回 code，errMsg=${loginRes.errMsg || '(无)'}`
    wxLoginExtra = {
      hasCode: !!wxCode,
      codePreview: maskCode(wxCode),
      errMsg: loginRes.errMsg,
    }
  } catch (e: any) {
    wxLoginDetail = `Taro.login 异常: ${e?.errMsg || e?.message || String(e)}`
    wxLoginExtra = {
      errMsg: e?.errMsg,
      message: e?.message,
      errno: e?.errno,
    }
  }
  steps.push({
    name: '微信授权 code',
    ok: wxLoginOk,
    detail: wxLoginDetail,
    extra: wxLoginExtra,
  })

  // 6. 调用后端 wx-login
  let backendOk = false
  let backendDetail = ''
  let backendExtra: Record<string, unknown> = {}
  if (wxCode) {
    const postStart = Date.now()
    try {
      const response = await Taro.request({
        url: `${API_BASE_URL}/api/wx-login`,
        method: 'POST',
        header: { 'Content-Type': 'application/json' },
        data: { code: wxCode },
        timeout: 20000,
      })
      backendOk = response.statusCode === 200 && !!response.data?.success
      const errText =
        response.data?.error ||
        response.data?.message ||
        response.errMsg ||
        '未知错误'
      backendDetail = backendOk
        ? `登录成功，openid=${maskOpenid(response.data?.userInfo?.openid)}，耗时 ${Date.now() - postStart}ms`
        : `登录失败: ${errText}，HTTP ${response.statusCode}，耗时 ${Date.now() - postStart}ms`
      backendExtra = {
        statusCode: response.statusCode,
        durationMs: Date.now() - postStart,
        success: response.data?.success,
        error: response.data?.error,
        message: response.data?.message,
        errMsg: response.errMsg,
        data: response.data,
      }
    } catch (e: any) {
      backendDetail = `请求异常: ${e?.errMsg || e?.message || String(e)}，耗时 ${Date.now() - postStart}ms`
      backendExtra = {
        durationMs: Date.now() - postStart,
        errMsg: e?.errMsg,
        message: e?.message,
        errno: e?.errno,
      }
    }
  } else {
    backendDetail = '跳过：未获取到微信 code'
    backendExtra = { skipped: true }
  }
  steps.push({
    name: '后端登录接口',
    ok: backendOk,
    detail: backendDetail,
    extra: backendExtra,
  })

  const success = backendOk
  const failedStep = steps.find((s) => !s.ok)
  const summary = success
    ? '登录流程正常，若仍无法使用请清除缓存后重试'
    : failedStep
      ? `失败环节: ${failedStep.name}`
      : '登录失败，请复制报告发给客服'

  const textReport = buildTextReport(steps, summary)

  return {
    generatedAt,
    summary,
    success,
    steps,
    textReport,
  }
}

/** 清除本地登录缓存后重新诊断 */
export async function clearLoginCacheAndDiagnose(): Promise<LoginDiagnosticReport> {
  logout()
  return runLoginDiagnostic()
}
