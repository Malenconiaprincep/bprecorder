import { useState } from 'react'
import { View, Text, Input, Button } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import './index.scss'

// Supabase is temporarily disabled
// import { supabase } from '../../lib/supabase'

const PHONE_DOMAIN = '@mybp.com'

export default function Login() {
  const [isLogin, setIsLogin] = useState(true)
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useLoad(() => {
    console.log('Login page loaded - Supabase auth disabled')
  })

  const handleSubmit = async () => {
    if (!phone || !password) {
      setError('请输入手机号和密码')
      return
    }

    setLoading(true)
    setError(null)

    // Supabase is disabled, show message
    Taro.showToast({
      title: '登录功能开发中',
      icon: 'none'
    })
    
    setLoading(false)
    
    // TODO: Re-enable when Supabase is fixed
    /*
    try {
      const cleanPhone = phone.replace(/\s+/g, '').trim()
      const email = `${cleanPhone}${PHONE_DOMAIN}`

      let result
      if (isLogin) {
        result = await supabase.auth.signInWithPassword({
          email,
          password,
        })
      } else {
        result = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              phone_number: cleanPhone
            }
          }
        })
      }

      const { error: authError, data } = result

      if (authError) {
        setError(authError.message)
      } else if (data.user || data.session) {
        Taro.showToast({
          title: isLogin ? '登录成功' : '注册成功',
          icon: 'success'
        })
        setTimeout(() => {
          Taro.reLaunch({ url: '/pages/index/index' })
        }, 1000)
      }
    } catch (e) {
      setError('发生未知错误')
      console.error(e)
    } finally {
      setLoading(false)
    }
    */
  }

  return (
    <View className='login-container min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4'>
      <View className='w-full max-w-md bg-white p-8 rounded-xl shadow-md'>
        <View className='mb-8'>
          <Text className='block text-center text-2xl font-bold text-gray-900 mb-2'>
            {isLogin ? '登录到血压记录仪' : '注册新账号'}
          </Text>
          <Text className='block text-center text-sm text-gray-600'>
            使用手机号和密码
          </Text>
          <Text className='block text-center text-xs text-orange-500 mt-2'>
            (登录功能开发中)
          </Text>
        </View>

        <View className='space-y-4'>
          <View>
            <Input
              className='w-full px-3 py-2 border border-gray-300 rounded text-gray-900 mb-4'
              type='number'
              placeholder='手机号'
              value={phone}
              onInput={(e) => setPhone(e.detail.value)}
            />
          </View>
          <View>
            <Input
              className='w-full px-3 py-2 border border-gray-300 rounded text-gray-900 mb-6'
              password
              placeholder='密码'
              value={password}
              onInput={(e) => setPassword(e.detail.value)}
            />
          </View>
        </View>

        {error && (
          <View className='text-red-500 text-sm text-center mb-4'>{error}</View>
        )}

        <Button
          className='w-full bg-blue-600 text-white rounded py-2 mb-4'
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? '处理中...' : (isLogin ? '登录' : '注册')}
        </Button>

        <View className='text-center'>
          <Text
            className='text-sm text-blue-600'
            onClick={() => setIsLogin(!isLogin)}
          >
            {isLogin ? '没有账号？去注册' : '已有账号？去登录'}
          </Text>
        </View>
      </View>
    </View>
  )
}
