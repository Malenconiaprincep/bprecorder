import { NextResponse } from 'next/server';

/** 与 analyze/route.ts 中 getQwenApiKeys 顺序一致，返回首个可用密钥（供真机直连 DashScope 使用） */
function getFirstDashScopeKey(): string | null {
  const keys: string[] = [];

  if (process.env.DASHSCOPE_API_KEY?.trim()) {
    keys.push(process.env.DASHSCOPE_API_KEY.trim());
  }

  let i = 1;
  while (process.env[`DASHSCOPE_API_KEY_${i}`]?.trim()) {
    keys.push(process.env[`DASHSCOPE_API_KEY_${i}`]!.trim());
    i++;
  }

  if (process.env.DASHSCOPE_API_KEYS) {
    const commaSeparatedKeys = process.env.DASHSCOPE_API_KEYS.split(',').map((k) => k.trim()).filter(Boolean);
    keys.push(...commaSeparatedKeys);
  }

  return keys[0] ?? null;
}

export async function GET() {
  const apiKey = getFirstDashScopeKey();
  if (!apiKey) {
    return NextResponse.json({ error: 'DASHSCOPE_API_KEY not configured' }, { status: 503 });
  }
  return NextResponse.json({ apiKey });
}
