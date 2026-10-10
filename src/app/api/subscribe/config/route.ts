import { NextResponse } from 'next/server'
import { getSubscribeTemplateId } from '@/lib/wechat'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET - 返回订阅消息模板 ID（小程序端 requestSubscribeMessage 使用） */
export async function GET() {
  const templateId = getSubscribeTemplateId()

  return NextResponse.json(
    { success: true, templateId },
    { headers: { 'Access-Control-Allow-Origin': '*' } }
  )
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
    },
  })
}
