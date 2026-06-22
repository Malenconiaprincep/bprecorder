import { useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import {
  runLoginDiagnostic,
  clearLoginCacheAndDiagnose,
  type LoginDiagnosticReport,
} from '../../lib/loginDebug'
import './index.scss'

export default function LoginDebugPage() {
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<LoginDiagnosticReport | null>(null)

  const runDiagnostic = async (clearCache = false) => {
    setLoading(true)
    try {
      const result = clearCache
        ? await clearLoginCacheAndDiagnose()
        : await runLoginDiagnostic()
      setReport(result)
    } catch (e: any) {
      Taro.showToast({
        title: e?.message || '诊断失败',
        icon: 'none',
      })
    } finally {
      setLoading(false)
    }
  }

  useLoad(() => {
    runDiagnostic(false)
  })

  const onCopyReport = () => {
    if (!report?.textReport) {
      Taro.showToast({ title: '请先完成诊断', icon: 'none' })
      return
    }
    Taro.setClipboardData({
      data: report.textReport,
      success: () => {
        Taro.showToast({ title: '已复制，请发给客服', icon: 'success' })
      },
    })
  }

  return (
    <View className='login-debug-page'>
      <View className='login-debug-card'>
        <Text className='login-debug-title'>登录问题诊断</Text>
        <Text className='login-debug-desc'>
          本页会自动检测设备、网络、微信授权与服务器登录流程。若登录失败，请复制完整报告发给客服排查。
        </Text>

        {loading && (
          <View className='login-debug-loading'>
            <Text className='login-debug-loading-text'>正在诊断，请稍候…</Text>
          </View>
        )}

        {!loading && report && (
          <>
            <View
              className={`login-debug-summary ${
                report.success ? 'login-debug-summary--ok' : 'login-debug-summary--fail'
              }`}
            >
              <Text className='login-debug-summary-text'>{report.summary}</Text>
            </View>

            {report.steps.map((step) => (
              <View key={step.name} className='login-debug-step'>
                <View className='login-debug-step-head'>
                  <Text
                    className={`login-debug-step-badge ${
                      step.ok ? 'login-debug-step-badge--ok' : 'login-debug-step-badge--fail'
                    }`}
                  >
                    {step.ok ? '正常' : '异常'}
                  </Text>
                  <Text className='login-debug-step-name'>{step.name}</Text>
                </View>
                <Text className='login-debug-step-detail'>{step.detail}</Text>
              </View>
            ))}

            <ScrollView scrollY className='login-debug-report-box'>
              <Text className='login-debug-report-text'>{report.textReport}</Text>
            </ScrollView>
          </>
        )}
      </View>

      <View className='login-debug-actions'>
        <View className='login-debug-btn login-debug-btn--primary' onClick={() => runDiagnostic(false)}>
          <Text className='login-debug-btn-text login-debug-btn-text--primary'>重新诊断</Text>
        </View>
        <View
          className='login-debug-btn login-debug-btn--secondary'
          onClick={() => runDiagnostic(true)}
        >
          <Text className='login-debug-btn-text login-debug-btn-text--secondary'>
            清除缓存后重试
          </Text>
        </View>
        <View className='login-debug-btn login-debug-btn--secondary' onClick={onCopyReport}>
          <Text className='login-debug-btn-text login-debug-btn-text--secondary'>
            复制完整报告
          </Text>
        </View>
        <View
          className='login-debug-btn login-debug-btn--ghost'
          onClick={() => Taro.switchTab({ url: '/pages/profile/index' })}
        >
          <Text className='login-debug-btn-text login-debug-btn-text--ghost'>返回「我的」</Text>
        </View>
      </View>
    </View>
  )
}
