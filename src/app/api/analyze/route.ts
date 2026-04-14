import { NextRequest, NextResponse } from 'next/server';
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";

// 支持的模型类型（主路径与 fallback 尝试顺序均为 sub2api -> qwen -> gemini -> anyrouter）
type ModelType = 'sub2api' | 'qwen' | 'gemini' | 'anyrouter';

// 获取要使用的模型（通过环境变量配置，默认为 gemini）
const getModelType = (): ModelType => {
  const modelType = process.env.AI_MODEL?.toLowerCase();
  if (
    modelType === 'sub2api' ||
    modelType === 'qwen' ||
    modelType === 'gemini' ||
    modelType === 'anyrouter'
  ) {
    return modelType;
  }
  return 'sub2api';
};

// 获取 Gemini API 密钥列表（支持多个备用密钥）
const getGeminiApiKeys = (): string[] => {
  const keys: string[] = [];

  // 主密钥
  // if (process.env.GEMINI_API_KEY) {
  //   keys.push(process.env.GEMINI_API_KEY);
  // }

  // 备用密钥（GEMINI_API_KEY_1, GEMINI_API_KEY_2, ...）
  let i = 1;
  while (process.env[`GEMINI_API_KEY_${i}`]) {
    keys.push(process.env[`GEMINI_API_KEY_${i}`]!);
    i++;
  }

  // 也支持逗号分隔的格式（GEMINI_API_KEYS=key1,key2,key3）
  if (process.env.GEMINI_API_KEYS) {
    const commaSeparatedKeys = process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(k => k);
    keys.push(...commaSeparatedKeys);
  }

  console.log('Gemini API keys:', keys);

  return keys;
};

// 获取 Qwen API 密钥列表（支持多个备用密钥）
const getQwenApiKeys = (): string[] => {
  const keys: string[] = [];

  // 主密钥
  if (process.env.DASHSCOPE_API_KEY) {
    keys.push(process.env.DASHSCOPE_API_KEY);
  }

  // 备用密钥（DASHSCOPE_API_KEY_1, DASHSCOPE_API_KEY_2, ...）
  let i = 1;
  while (process.env[`DASHSCOPE_API_KEY_${i}`]) {
    keys.push(process.env[`DASHSCOPE_API_KEY_${i}`]!);
    i++;
  }

  // 也支持逗号分隔的格式（DASHSCOPE_API_KEYS=key1,key2,key3）
  if (process.env.DASHSCOPE_API_KEYS) {
    const commaSeparatedKeys = process.env.DASHSCOPE_API_KEYS.split(',').map(k => k.trim()).filter(k => k);
    keys.push(...commaSeparatedKeys);
  }

  return keys;
};

// 获取 AnyRouter API 密钥列表（支持多个备用密钥）
const getAnyRouterApiKeys = (): string[] => {
  const keys: string[] = [];

  // 主密钥
  if (process.env.ANYROUTER_API_KEY) {
    keys.push(process.env.ANYROUTER_API_KEY);
  }

  // 备用密钥（ANYROUTER_API_KEY_1, ANYROUTER_API_KEY_2, ...）
  let i = 1;
  while (process.env[`ANYROUTER_API_KEY_${i}`]) {
    keys.push(process.env[`ANYROUTER_API_KEY_${i}`]!);
    i++;
  }

  // 也支持逗号分隔的格式（ANYROUTER_API_KEYS=key1,key2,key3）
  if (process.env.ANYROUTER_API_KEYS) {
    const commaSeparatedKeys = process.env.ANYROUTER_API_KEYS.split(',').map(k => k.trim()).filter(k => k);
    keys.push(...commaSeparatedKeys);
  }

  return keys;
};

// 使用 Qwen-VL 模型分析（使用指定的 API 密钥）
async function analyzeWithQwen(imageBase64: string, mimeType: string, apiKey: string): Promise<any> {
  const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    timeout: 60000,
    maxRetries: 2,
  });

  const prompt = `
    Analyze this image of a blood pressure monitor. 
    Extract the systolic (high), diastolic (low), and pulse (heart rate) numbers. 
    Return ONLY a raw JSON object with keys: "systolic", "diastolic", "pulse". 
    All values should be integers. 
    If you cannot clearly see a screen with these numbers, return {"error": "Unable to read display"}.
    Do not include markdown formatting like \`\`\`json.
  `;

  const dataUrl = `data:${mimeType};base64,${imageBase64}`;

  const response = await openai.chat.completions.create({
    model: "qwen-vl-max",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: dataUrl },
          },
        ],
      },
    ],
    max_tokens: 500,
  });

  const text = response.choices[0]?.message?.content;
  if (!text) {
    throw new Error("Empty response from Qwen-VL");
  }

  console.log('Qwen response text:', text);
  return parseAIResponse(text);
}

// 使用 Qwen-VL 模型分析（自动尝试多个备用密钥）
async function analyzeWithQwenWithFallback(imageBase64: string, mimeType: string): Promise<any> {
  const apiKeys = getQwenApiKeys();
  if (apiKeys.length === 0) {
    throw new Error("DASHSCOPE_API_KEY is missing");
  }

  console.log(`Calling Alibaba Qwen-VL API with ${apiKeys.length} key(s)...`);

  let lastError: any = null;
  for (let i = 0; i < apiKeys.length; i++) {
    try {
      const result = await analyzeWithQwen(imageBase64, mimeType, apiKeys[i]);
      if (i > 0) {
        console.log(`Qwen succeeded with fallback key ${i + 1}`);
      }
      return result;
    } catch (error: any) {
      lastError = error;
      // 检测 429 限流错误（检查多种可能的错误格式）
      const isRateLimitError =
        error.status === 429 ||
        error.code === 429 ||
        error.statusCode === 429 ||
        error.message?.includes('429') ||
        error.message?.toLowerCase().includes('too many requests') ||
        error.message?.toLowerCase().includes('rate limit') ||
        error.message?.toLowerCase().includes('quota exceeded') ||
        error.message?.toLowerCase().includes('resource exhausted');

      if (isRateLimitError && i < apiKeys.length - 1) {
        console.log(`Qwen API key ${i + 1} rate limited (429), trying next key...`);
        continue;
      }
      // 如果不是限流错误，或者是最后一个密钥，直接抛出错误
      if (!isRateLimitError || i === apiKeys.length - 1) {
        throw error;
      }
    }
  }

  throw lastError || new Error("All Qwen API keys failed");
}

// 使用 Gemini 2.5 Flash 模型分析（使用指定的 API 密钥）
async function analyzeWithGemini(imageBase64: string, mimeType: string, apiKey: string): Promise<any> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `
    Analyze this image of a blood pressure monitor. 
    Extract the systolic (high), diastolic (low), and pulse (heart rate) numbers. 
    Return ONLY a raw JSON object with keys: "systolic", "diastolic", "pulse". 
    All values should be integers. 
    If you cannot clearly see a screen with these numbers, return {"error": "Unable to read display"}.
    Do not include markdown formatting like \`\`\`json.
  `;

  const result = await model.generateContent([
    {
      inlineData: {
        data: imageBase64,
        mimeType: mimeType,
      },
    },
    { text: prompt },
  ]);

  const response = await result.response;
  const text = response.text();

  if (!text) {
    throw new Error("Empty response from Gemini");
  }

  console.log('Gemini response text:', text);
  return parseAIResponse(text);
}

// 使用 Gemini 2.5 Flash 模型分析（自动尝试多个备用密钥）
async function analyzeWithGeminiWithFallback(imageBase64: string, mimeType: string): Promise<any> {
  const apiKeys = getGeminiApiKeys();
  if (apiKeys.length === 0) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  console.log(`Calling Google Gemini 2.5 Flash API with ${apiKeys.length} key(s)...`);

  let lastError: any = null;
  for (let i = 0; i < apiKeys.length; i++) {
    try {
      const result = await analyzeWithGemini(imageBase64, mimeType, apiKeys[i]);
      if (i > 0) {
        console.log(`Gemini succeeded with fallback key ${i + 1}`);
      }
      return result;
    } catch (error: any) {
      lastError = error;
      // 检测 429 限流错误（检查多种可能的错误格式）
      const isRateLimitError =
        error.status === 429 ||
        error.code === 429 ||
        error.statusCode === 429 ||
        error.message?.includes('429') ||
        error.message?.toLowerCase().includes('too many requests') ||
        error.message?.toLowerCase().includes('rate limit') ||
        error.message?.toLowerCase().includes('quota exceeded') ||
        error.message?.toLowerCase().includes('resource exhausted');

      if (isRateLimitError && i < apiKeys.length - 1) {
        console.log(`Gemini API key ${i + 1} rate limited (429), trying next key...`);
        continue;
      }
      // 如果不是限流错误，或者是最后一个密钥，直接抛出错误
      if (!isRateLimitError || i === apiKeys.length - 1) {
        throw error;
      }
    }
  }

  throw lastError || new Error("All Gemini API keys failed");
}

// 使用 AnyRouter 平台分析（使用指定的 API 密钥）
// 使用 axios 直接请求
async function analyzeWithAnyRouter(imageBase64: string, mimeType: string, apiKey: string): Promise<any> {
  // AnyRouter baseURL - 根据文档应该是 https://anyrouter.top/v1
  const baseURL = process.env.ANYROUTER_BASE_URL || "https://anyrouter.top/v1";
  const model = process.env.ANYROUTER_MODEL || "gemini-2.5-pro";

  console.log('AnyRouter API config:', {
    baseURL,
    apiKey: apiKey.substring(0, 10) + '...',
    model
  });

  const prompt = `
    Analyze this image of a blood pressure monitor. 
    Extract the systolic (high), diastolic (low), and pulse (heart rate) numbers. 
    Return ONLY a raw JSON object with keys: "systolic", "diastolic", "pulse". 
    All values should be integers. 
    If you cannot clearly see a screen with these numbers, return {"error": "Unable to read display"}.
    Do not include markdown formatting like \`\`\`json.
  `;

  const dataUrl = `data:${mimeType};base64,${imageBase64}`;

  const options = {
    method: 'POST',
    url: `${baseURL}/chat/completions`,
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    data: {
      model: model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: dataUrl },
            },
          ],
        },
      ],
      max_tokens: 500,
    },
    timeout: 60000,
  };

  const response = await axios(options);
  const text = response.data.choices[0]?.message?.content;
  if (!text) {
    throw new Error("Empty response from AnyRouter");
  }

  console.log('AnyRouter response text:', text);
  return parseAIResponse(text);
}

// 使用 AnyRouter 平台分析（自动尝试多个备用密钥）
async function analyzeWithAnyRouterWithFallback(imageBase64: string, mimeType: string): Promise<any> {
  const apiKeys = getAnyRouterApiKeys();
  if (apiKeys.length === 0) {
    throw new Error("ANYROUTER_API_KEY is missing");
  }

  console.log(`Calling AnyRouter API with ${apiKeys.length} key(s)...`);

  let lastError: any = null;
  for (let i = 0; i < apiKeys.length; i++) {
    try {
      const result = await analyzeWithAnyRouter(imageBase64, mimeType, apiKeys[i]);
      if (i > 0) {
        console.log(`AnyRouter succeeded with fallback key ${i + 1}`);
      }
      return result;
    } catch (error: any) {
      lastError = error;
      // 检测 429 限流错误（检查多种可能的错误格式）
      const isRateLimitError =
        error.status === 429 ||
        error.code === 429 ||
        error.statusCode === 429 ||
        error.message?.includes('429') ||
        error.message?.toLowerCase().includes('too many requests') ||
        error.message?.toLowerCase().includes('rate limit') ||
        error.message?.toLowerCase().includes('quota exceeded') ||
        error.message?.toLowerCase().includes('resource exhausted');

      if (isRateLimitError && i < apiKeys.length - 1) {
        console.log(`AnyRouter API key ${i + 1} rate limited (429), trying next key...`);
        continue;
      }
      // 如果不是限流错误，或者是最后一个密钥，直接抛出错误
      if (!isRateLimitError || i === apiKeys.length - 1) {
        throw error;
      }
    }
  }

  throw lastError || new Error("All AnyRouter API keys failed");
}

/** choices[0] 正文：字符串或 content parts（参考 sub2api-demo index3.js） */
function extractAssistantContent(choice: any): { text: string; hint: string } {
  if (!choice) return { text: '', hint: '无 choices[0]' };

  const msg = choice.message;
  if (msg) {
    const c = msg.content;
    if (typeof c === 'string' && c.length) return { text: c, hint: '' };
    if (Array.isArray(c) && c.length) {
      const parts = c
        .map((p: any) => {
          if (typeof p === 'string') return p;
          if (p && typeof p === 'object' && p.type === 'text' && p.text) return p.text;
          return '';
        })
        .filter(Boolean);
      if (parts.length) return { text: parts.join('\n'), hint: '' };
    }
  }

  if (typeof choice.text === 'string' && choice.text.length) {
    return { text: choice.text, hint: '' };
  }

  return {
    text: '',
    hint: `正文为空；原始 choice 摘要: ${JSON.stringify(choice).slice(0, 1200)}`,
  };
}

/** 流式 delta.content：字符串或 content parts */
function extractDeltaText(delta: any): string {
  if (!delta) return '';
  const c = delta.content;
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  return c
    .map((p: any) => {
      if (typeof p === 'string') return p;
      if (p && typeof p === 'object' && p.type === 'text' && p.text) return p.text;
      if (p && typeof p === 'object' && p.type === 'output_text') {
        if (typeof p.text === 'string') return p.text;
        if (typeof p.output_text === 'string') return p.output_text;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

/** 去掉模型偶发加的 markdown 代码块，便于 JSON.parse */
function stripJsonFences(s: string): string {
  let t = s.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i;
  const m = t.match(fence);
  if (m) return m[1].trim();
  return t;
}

function sub2ApiChatCompletionsUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/chat/completions`;
}

function buildSub2ApiVisionMessages(imageBase64: string, mimeType: string, prompt: string) {
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;
  return [
    {
      role: 'user' as const,
      content: [
        { type: 'text' as const, text: prompt },
        {
          type: 'image_url' as const,
          image_url: { url: dataUrl, detail: 'high' as const },
        },
      ],
    },
  ];
}

async function analyzeWithSub2ApiStream(
  imageBase64: string,
  mimeType: string,
  apiKey: string,
  baseURL: string,
  model: string,
  prompt: string,
): Promise<{ text: string; hint: string; finishReason: string }> {
  const body = {
    model,
    messages: buildSub2ApiVisionMessages(imageBase64, mimeType, prompt),
    stream: true,
    max_tokens: 1024,
  };

  const res = await fetch(sub2ApiChatCompletionsUrl(baseURL), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const rawText = await res.text();
    throw new Error(`HTTP ${res.status}: ${rawText.slice(0, 800)}`);
  }

  if (!res.body) {
    throw new Error('响应无 body（无法流式读取）');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let finishReason = '';
  let sawDataLine = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trimEnd();
      if (!trimmed.startsWith('data:')) continue;
      sawDataLine = true;
      const payload = trimmed.slice(5).trimStart();
      if (payload === '[DONE]') continue;
      let json: any;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      const choice = json.choices?.[0];
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      const piece = extractDeltaText(choice?.delta);
      if (piece) fullText += piece;
    }
  }

  const hint =
    fullText.length === 0 && !sawDataLine
      ? '流式: 未解析到任何 data: 行'
      : fullText.length === 0
        ? '流式结束但正文为空；可换模型或检查中转是否支持 vision+SSE'
        : '';

  return { text: fullText, hint, finishReason };
}

async function analyzeWithSub2ApiNonStream(
  imageBase64: string,
  mimeType: string,
  apiKey: string,
  baseURL: string,
  model: string,
  prompt: string,
): Promise<{ text: string; hint: string; finishReason: string }> {
  const body = {
    model,
    messages: buildSub2ApiVisionMessages(imageBase64, mimeType, prompt),
    stream: false,
    max_tokens: 1024,
  };

  const res = await fetch(sub2ApiChatCompletionsUrl(baseURL), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${rawText.slice(0, 800)}`);
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`响应非 JSON: ${rawText.slice(0, 400)}`);
  }

  const choice = data.choices?.[0];
  const { text, hint } = extractAssistantContent(choice);
  return {
    text,
    hint,
    finishReason: choice?.finish_reason ?? '',
  };
}

/**
 * OpenAI 兼容中转（Sub2API 等）：默认流式，空则非流式；SUB2API_VISION_STREAM=0 仅非流式。
 * 环境变量：SUB2API_KEY、SUB2API_BASE_URL（须含 /v1）、SUB2API_MODEL。
 */
async function analyzeWithSub2Api(imageBase64: string, mimeType: string): Promise<any> {
  const apiKey = process.env.SUB2API_KEY?.trim() || 'sk-n1kOdGVBWmTAtr7yYwA8G5TA06PPSlStDChcYeStbqBxjqAx';
  if (!apiKey) {
    throw new Error('SUB2API_KEY is missing');
  }

  const baseURL = (process.env.SUB2API_BASE_URL?.trim() || 'https://api.routoken.com/v1').replace(/\/$/, '');
  const model = process.env.SUB2API_MODEL?.trim() || 'gpt-5.4';

  const prompt = `
    Analyze this image of a blood pressure monitor. 
    Extract the systolic (high), diastolic (low), and pulse (heart rate) numbers. 
    Return ONLY a raw JSON object with keys: "systolic", "diastolic", "pulse". 
    All values should be integers. 
    If you cannot clearly see a screen with these numbers, return {"error": "Unable to read display"}.
    Do not include markdown formatting like \`\`\`json.
  `;

  console.log('Calling Sub2API-compatible vision:', { baseURL, model: model.slice(0, 40) });

  const useStream = process.env.SUB2API_VISION_STREAM !== '0';

  let text = '';
  let hint = '';
  if (useStream) {
    const r = await analyzeWithSub2ApiStream(imageBase64, mimeType, apiKey, baseURL, model, prompt);
    if (r.text.length > 0) {
      text = r.text;
    } else {
      const r2 = await analyzeWithSub2ApiNonStream(imageBase64, mimeType, apiKey, baseURL, model, prompt);
      if (r2.text.length > 0) {
        text = r2.text;
        hint = `${r.hint} → 非流式有正文`;
      } else {
        hint = `${r.hint}；非流式仍空: ${r2.hint}`;
      }
    }
  } else {
    const r = await analyzeWithSub2ApiNonStream(imageBase64, mimeType, apiKey, baseURL, model, prompt);
    text = r.text;
    hint = r.hint;
  }

  if (!text) {
    throw new Error(`Sub2API empty response${hint ? `: ${hint}` : ''}`);
  }

  if (hint) {
    console.log('Sub2API vision hint:', hint);
  }

  console.log('Sub2API response text:', text);
  const cleaned = stripJsonFences(text);
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('Failed to parse JSON from Sub2API response:', cleaned);
    throw new Error(`Failed to parse Sub2API response: ${cleaned.slice(0, 200)}`);
  }
}

// 解析 AI 响应为 JSON
function parseAIResponse(text: string): any {
  const cleanText = stripJsonFences(text.trim()).replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("Failed to parse JSON from AI response:", cleanText);
    throw new Error(`Failed to parse AI response: ${cleanText}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    console.log(`[${new Date().toISOString()}] Received file: ${file.name}, size: ${file.size}, type: ${file.type}`);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString('base64');
    const mimeType = file.type || 'image/jpeg';

    // 根据环境变量选择模型
    const modelType = getModelType();
    console.log(`Using AI model: ${modelType}`);

    let result;
    try {
      if (modelType === 'sub2api') {
        result = await analyzeWithSub2Api(base64Image, mimeType);
      } else if (modelType === 'qwen') {
        result = await analyzeWithQwenWithFallback(base64Image, mimeType);
      } else if (modelType === 'gemini') {
        result = await analyzeWithGeminiWithFallback(base64Image, mimeType);
      } else if (modelType === 'anyrouter') {
        result = await analyzeWithAnyRouterWithFallback(base64Image, mimeType);
      } else {
        throw new Error(`Unknown model type: ${modelType}`);
      }
      return NextResponse.json(result);
    } catch (error: any) {
      // 主模型失败：按 sub2api -> qwen -> gemini -> anyrouter 尝试（跳过主模型、无 SUB2API_KEY 时跳过 sub2api）
      console.error(`${modelType} model failed:`, error.message);
      console.log(`Trying fallback models...`);

      const fallbackOrder: ModelType[] = ['sub2api', 'qwen', 'gemini', 'anyrouter'];
      const fallbackModels = fallbackOrder.filter((m) => {
        if (m === modelType) return false;
        if (m === 'sub2api' && !process.env.SUB2API_KEY?.trim()) return false;
        return true;
      });

      for (const fallbackModel of fallbackModels) {
        try {
          if (fallbackModel === 'sub2api') {
            result = await analyzeWithSub2Api(base64Image, mimeType);
            console.log(`Fallback to Sub2API succeeded`);
          } else if (fallbackModel === 'qwen') {
            result = await analyzeWithQwenWithFallback(base64Image, mimeType);
            console.log(`Fallback to Qwen succeeded`);
          } else if (fallbackModel === 'gemini') {
            result = await analyzeWithGeminiWithFallback(base64Image, mimeType);
            console.log(`Fallback to Gemini succeeded`);
          } else if (fallbackModel === 'anyrouter') {
            result = await analyzeWithAnyRouterWithFallback(base64Image, mimeType);
            console.log(`Fallback to AnyRouter succeeded`);
          }
          return NextResponse.json(result);
        } catch (fallbackError: any) {
          console.error(`Fallback model ${fallbackModel} also failed:`, fallbackError.message);
          continue;
        }
      }

      throw new Error(`All models failed. Primary: ${error.message}`);
    }

  } catch (error: any) {
    console.error(`[${new Date().toISOString()}] Error processing image:`, error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error.message || String(error),
    }, { status: 500 });
  }
}
