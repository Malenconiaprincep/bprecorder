import { NextResponse } from 'next/server';

/**
 * 已停用：此前公开返回 DASHSCOPE_API_KEY，存在密钥泄漏风险。
 * 小程序改为 build 时从 miniapp/config/secrets.local.ts 注入密钥。
 */
export async function GET() {
  return NextResponse.json(
    {
      error: 'This endpoint has been disabled for security. Configure DASHSCOPE_API_KEY in miniapp/config/secrets.local.ts and rebuild.',
    },
    { status: 410 }
  );
}
