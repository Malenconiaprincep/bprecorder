import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    message: '测试 API 正常工作',
    method: 'GET',
    timestamp: new Date().toISOString(),
    url: request.url
  });
}

export async function POST(request: NextRequest) {
  try {
    console.log('[test-post] POST 请求收到:', new Date().toISOString());
    console.log('[test-post] 请求 URL:', request.url);
    console.log('[test-post] 请求方法:', request.method);
    
    // 尝试解析请求体
    let body = null;
    try {
      const text = await request.text();
      console.log('[test-post] 原始请求体:', text);
      
      if (text) {
        body = JSON.parse(text);
      }
    } catch (e) {
      console.log('[test-post] 请求体不是 JSON 或为空');
    }

    // 获取请求头
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return NextResponse.json({
      success: true,
      message: 'POST 请求成功接收',
      method: request.method,
      timestamp: new Date().toISOString(),
      url: request.url,
      body: body,
      headers: headers,
      received: {
        hasBody: body !== null,
        contentType: request.headers.get('content-type'),
        userAgent: request.headers.get('user-agent'),
      }
    });
  } catch (error: any) {
    console.error('[test-post] 错误:', error);
    return NextResponse.json({
      success: false,
      error: '服务器错误',
      message: error?.message || String(error)
    }, { status: 500 });
  }
}

