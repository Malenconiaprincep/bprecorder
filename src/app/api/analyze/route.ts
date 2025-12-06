import { NextRequest, NextResponse } from 'next/server';
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

// 支持的模型类型
type ModelType = 'qwen' | 'gemini';

// 获取要使用的模型（通过环境变量配置，默认为 gemini）
const getModelType = (): ModelType => {
  const modelType = process.env.AI_MODEL?.toLowerCase();
  return (modelType === 'qwen' || modelType === 'gemini') ? modelType : 'gemini';
};

// 使用 Qwen-VL 模型分析
async function analyzeWithQwen(imageBase64: string, mimeType: string): Promise<any> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error("DASHSCOPE_API_KEY is missing");
  }

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

  console.log("Calling Alibaba Qwen-VL API...");

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

// 使用 Gemini 2.5 Flash 模型分析
async function analyzeWithGemini(imageBase64: string, mimeType: string): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

  const prompt = `
    Analyze this image of a blood pressure monitor. 
    Extract the systolic (high), diastolic (low), and pulse (heart rate) numbers. 
    Return ONLY a raw JSON object with keys: "systolic", "diastolic", "pulse". 
    All values should be integers. 
    If you cannot clearly see a screen with these numbers, return {"error": "Unable to read display"}.
    Do not include markdown formatting like \`\`\`json.
  `;

  console.log("Calling Google Gemini 2.5 Flash API...");

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
        result = await analyzeWithGemini(base64Image, mimeType);
      } else {
        result = await analyzeWithQwen(base64Image, mimeType);
      }
      return NextResponse.json(result);
    } catch (error: any) {
      // 如果主模型失败，尝试备用模型
      console.error(`${modelType} model failed:`, error.message);
      console.log(`Trying fallback model...`);
      
      try {
        if (modelType === 'gemini') {
          result = await analyzeWithQwen(base64Image, mimeType);
          console.log('Fallback to Qwen succeeded');
        } else {
          result = await analyzeWithGemini(base64Image, mimeType);
          console.log('Fallback to Gemini succeeded');
        }
        return NextResponse.json(result);
      } catch (fallbackError: any) {
        throw new Error(`Both models failed. Primary: ${error.message}, Fallback: ${fallbackError.message}`);
      }
    }

  } catch (error: any) {
    console.error(`[${new Date().toISOString()}] Error processing image:`, error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error.message || String(error),
    }, { status: 500 });
  }
}
