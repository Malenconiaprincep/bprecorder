import { NextRequest, NextResponse } from 'next/server';
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";

// 支持的模型类型
type ModelType = 'qwen' | 'gemini' | 'anyrouter' | 'zai';

// 获取要使用的模型（通过环境变量配置，默认为 gemini）
const getModelType = (): ModelType => {
  const modelType = process.env.AI_MODEL?.toLowerCase();
  return (modelType === 'qwen' || modelType === 'gemini' || modelType === 'anyrouter' || modelType === 'zai') ? modelType : 'gemini';
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

// 获取 Z.ai API 密钥列表（支持多个备用密钥）
const getZaiApiKeys = (): string[] => {
  const keys: string[] = [];

  // 主密钥
  if (process.env.ZAI_API_KEY) {
    keys.push(process.env.ZAI_API_KEY);
  }

  // 备用密钥（ZAI_API_KEY_1, ZAI_API_KEY_2, ...）
  let i = 1;
  while (process.env[`ZAI_API_KEY_${i}`]) {
    keys.push(process.env[`ZAI_API_KEY_${i}`]!);
    i++;
  }

  // 也支持逗号分隔的格式（ZAI_API_KEYS=key1,key2,key3）
  if (process.env.ZAI_API_KEYS) {
    const commaSeparatedKeys = process.env.ZAI_API_KEYS.split(',').map(k => k.trim()).filter(k => k);
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

// 使用 Z.ai 平台分析（使用指定的 API 密钥）
async function analyzeWithZai(imageBase64: string, mimeType: string, apiKey: string): Promise<any> {
  const baseURL = process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4";
  const modelName = process.env.ZAI_MODEL || "glm-4.6v";

  console.log('Z.ai API config:', {
    baseURL,
    apiKey: apiKey.substring(0, 10) + '...',
    model: modelName
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
      model: modelName,
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
    throw new Error("Empty response from Z.ai");
  }

  console.log('Z.ai response text:', text);
  return parseAIResponse(text);
}

// 使用 Z.ai 平台分析（自动尝试多个备用密钥）
async function analyzeWithZaiWithFallback(imageBase64: string, mimeType: string): Promise<any> {
  const apiKeys = getZaiApiKeys();
  if (apiKeys.length === 0) {
    throw new Error("ZAI_API_KEY is missing");
  }

  console.log(`Calling Z.ai API with ${apiKeys.length} key(s)...`);

  let lastError: any = null;
  for (let i = 0; i < apiKeys.length; i++) {
    try {
      const result = await analyzeWithZai(imageBase64, mimeType, apiKeys[i]);
      if (i > 0) {
        console.log(`Z.ai succeeded with fallback key ${i + 1}`);
      }
      return result;
    } catch (error: any) {
      lastError = error;
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
        console.log(`Z.ai API key ${i + 1} rate limited (429), trying next key...`);
        continue;
      }
      if (!isRateLimitError || i === apiKeys.length - 1) {
        throw error;
      }
    }
  }

  throw lastError || new Error("All Z.ai API keys failed");
}

// 解析 AI 响应为 JSON
function parseAIResponse(text: string): any {
  const cleanText = text.replace(/```json|```/g, '').trim();
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
      if (modelType === 'gemini') {
        result = await analyzeWithGeminiWithFallback(base64Image, mimeType);
      } else if (modelType === 'qwen') {
        result = await analyzeWithQwenWithFallback(base64Image, mimeType);
      } else if (modelType === 'anyrouter') {
        result = await analyzeWithAnyRouterWithFallback(base64Image, mimeType);
      } else if (modelType === 'zai') {
        result = await analyzeWithZaiWithFallback(base64Image, mimeType);
      } else {
        throw new Error(`Unknown model type: ${modelType}`);
      }
      return NextResponse.json(result);
    } catch (error: any) {
      // 如果主模型失败，尝试备用模型（优先级：gemini -> anyrouter -> qwen）
      console.error(`${modelType} model failed:`, error.message);
      console.log(`Trying fallback models...`);

      // 按优先级顺序尝试其他模型：gemini -> zai -> anyrouter -> qwen
      const fallbackModels: ModelType[] = (['gemini', 'zai', 'anyrouter', 'qwen'] as ModelType[]).filter(m => m !== modelType);

      for (const fallbackModel of fallbackModels) {
        try {
          if (fallbackModel === 'gemini') {
            result = await analyzeWithGeminiWithFallback(base64Image, mimeType);
            console.log(`Fallback to Gemini succeeded`);
          } else if (fallbackModel === 'qwen') {
            result = await analyzeWithQwenWithFallback(base64Image, mimeType);
            console.log(`Fallback to Qwen succeeded`);
          } else if (fallbackModel === 'anyrouter') {
            result = await analyzeWithAnyRouterWithFallback(base64Image, mimeType);
            console.log(`Fallback to AnyRouter succeeded`);
          } else if (fallbackModel === 'zai') {
            result = await analyzeWithZaiWithFallback(base64Image, mimeType);
            console.log(`Fallback to Z.ai succeeded`);
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
