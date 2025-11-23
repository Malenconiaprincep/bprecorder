import { NextRequest, NextResponse } from 'next/server';
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      console.error("Error: DASHSCOPE_API_KEY is missing.");
      return NextResponse.json({ error: 'Server configuration error: Missing API Key' }, { status: 500 });
    }

    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      timeout: 60000, // 60秒超时
      maxRetries: 2, // 最多重试2次
    });

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    console.log(`Received file: ${file.name}, size: ${file.size}, type: ${file.type}`);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString('base64');
    const dataUrl = `data:${file.type || 'image/jpeg'};base64,${base64Image}`;

    const prompt = `
      Analyze this image of a blood pressure monitor. 
      Extract the systolic (high), diastolic (low), and pulse (heart rate) numbers. 
      Return ONLY a raw JSON object with keys: "systolic", "diastolic", "pulse". 
      All values should be integers. 
      If you cannot clearly see a screen with these numbers, return {"error": "Unable to read display"}.
      Do not include markdown formatting like \`\`\`json.
    `;

    console.log("Calling Alibaba Qwen-VL API...");

    const response = await openai.chat.completions.create({
      model: "qwen-vl-max", // Using Qwen-VL-Max
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: dataUrl,
              },
            },
          ],
        },
      ],
      max_tokens: 500, // 限制输出长度，加快响应
    });

    const text = response.choices[0]?.message?.content;

    if (!text) {
      throw new Error("Empty response from Qwen-VL");
    }

    console.log('Qwen response text:', text);

    const cleanText = text.replace(/```json|```/g, '').trim();

    try {
      const data = JSON.parse(cleanText);
      return NextResponse.json(data);
    } catch (e) {
      console.error("Failed to parse JSON from Qwen:", cleanText);
      return NextResponse.json({ error: 'Failed to parse AI response', raw: cleanText }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Error processing image full details:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error.message || String(error),
    }, { status: 500 });
  }
}
