import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Convert to base64
    const base64Image = buffer.toString('base64');

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
      Analyze this image of a blood pressure monitor. 
      Extract the systolic (high), diastolic (low), and pulse (heart rate) numbers. 
      Return ONLY a raw JSON object with keys: "systolic", "diastolic", "pulse". 
      All values should be integers. 
      If you cannot clearly see a screen with these numbers, return {"error": "Unable to read display"}.
      Do not include markdown formatting like \`\`\`json.
    `;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Image,
          mimeType: file.type || 'image/jpeg',
        },
      },
    ]);

    const response = await result.response;
    const text = response.text();
    
    console.log('Gemini response:', text);

    // Clean up the response text to ensure it's valid JSON
    const cleanText = text.replace(/```json|```/g, '').trim();
    
    try {
        const data = JSON.parse(cleanText);
        return NextResponse.json(data);
    } catch (e) {
        console.error("Failed to parse JSON:", cleanText);
        return NextResponse.json({ error: 'Failed to parse AI response', raw: cleanText }, { status: 500 });
    }

  } catch (error) {
    console.error('Error processing image:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

