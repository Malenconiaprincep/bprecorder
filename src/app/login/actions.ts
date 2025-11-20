'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/utils/supabase/server'

// Pseudo-domain for phone number auth hack
const PHONE_DOMAIN = '@mybp.com'

export async function login(formData: FormData) {
  const supabase = await createClient()

  let phone = formData.get('phone') as string
  const password = formData.get('password') as string

  if (!phone || !password) {
    return { error: '请输入手机号和密码' }
  }

  // Clean phone number: remove spaces, dashes, etc.
  phone = phone.replace(/\s+/g, '').trim()

  const email = `${phone}${PHONE_DOMAIN}`

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: '登录失败：' + error.message }
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signup(formData: FormData) {
  const supabase = await createClient()

  let phone = formData.get('phone') as string
  const password = formData.get('password') as string

  if (!phone || !password) {
    return { error: '请输入手机号和密码' }
  }

  // Clean phone number: remove spaces, dashes, etc.
  phone = phone.replace(/\s+/g, '').trim()

  const email = `${phone}${PHONE_DOMAIN}`

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        phone_number: phone // Store original phone in metadata just in case
      }
    }
  })

  if (error) {
    return { error: '注册失败：' + error.message }
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
