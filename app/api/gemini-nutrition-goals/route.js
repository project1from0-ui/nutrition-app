// app/api/gemini-nutrition-goals/route.js
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { userProfile, mode } = await request.json();

    if (!userProfile) {
      return NextResponse.json(
        { error: 'User profile is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[Gemini Nutrition Goals API] GEMINI_API_KEY is missing');
      return NextResponse.json(
        { error: 'Gemini API key is not configured' },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    // ユーザープロフィール情報を整形
    const { birthYear, birthMonth, birthDay, gender, height, weight, exerciseFrequency } = userProfile;
    const age = new Date().getFullYear() - birthYear;

    const prompt = `
あなたは栄養管理とフィットネスの専門家です。
以下のユーザー情報に基づいて、1日の最適な栄養摂取目標を計算してください。

**ユーザー情報:**
- 年齢: ${age}歳
- 性別: ${gender === 'male' ? '男性' : '女性'}
- 身長: ${height}cm
- 体重: ${weight}kg
- 運動習慣: ${exerciseFrequency}
- 目標MODE: ${mode}

**目標MODEの説明:**
${mode === 'diet' ? '減量（SLIM）- 体重を減らしたい' :
  mode === 'bulk' ? 'バルクアップ（BULK）- 筋肉をつけたい' :
  '現状維持（STAY）- 今の体型を維持したい'}

**タスク:**
1. Harris-Benedict式を使用して基礎代謝量（BMR）を計算
2. 運動習慣を考慮して1日の総消費カロリー（TDEE）を計算
3. 目標MODEに応じてカロリー目標を調整
4. PFC（タンパク質・脂質・炭水化物）バランスを最適化
5. その人に最適な理由を簡潔に説明

**必ず以下のJSON形式で出力してください（他のテキストは含めないこと）:**
{
  "calories": 2000,
  "protein": 120,
  "fat": 55,
  "carbs": 250,
  "reasoning": "あなたの年齢、性別、体重、運動習慣、そして${mode === 'diet' ? '減量' : mode === 'bulk' ? '筋肉増強' : '現状維持'}の目標を考慮すると、このバランスが最適です。1日${mode === 'diet' ? '約500kcalの赤字' : mode === 'bulk' ? '適度なカロリー余剰' : 'カロリー収支の均衡'}を目指すことで、健康的に目標を達成できます。"
}

**重要:**
- JSONのみを出力してください（説明文や\`\`\`json等は不要）
- カロリーは整数値
- タンパク質、脂質、炭水化物はグラム単位の整数値
- reasoningは1-3行で簡潔に
`;

    console.log('[Gemini Nutrition Goals API] Calculating nutrition goals...');
    console.log('[Gemini Nutrition Goals API] User age:', age);
    console.log('[Gemini Nutrition Goals API] Mode:', mode);

    const result = await model.generateContent([prompt]);
    const response = await result.response;
    const text = response.text();

    console.log('[Gemini Nutrition Goals API] Response:', text);

    // JSONレスポンスをパース
    try {
      let jsonText = text.trim();

      // コードブロックを除去
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim();
      }

      // JSONオブジェクトを抽出（前後のテキストを除去）
      const objectMatch = jsonText.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        jsonText = objectMatch[0];
      }

      console.log('[Gemini Nutrition Goals API] Parsing JSON:', jsonText);
      const parsedData = JSON.parse(jsonText);

      console.log('[Gemini Nutrition Goals API] Parsed data:', parsedData);

      // データの妥当性チェック
      if (!parsedData.calories || !parsedData.protein || !parsedData.fat || !parsedData.carbs) {
        throw new Error('Invalid nutrition goals data');
      }

      return NextResponse.json({
        success: true,
        goals: parsedData
      });
    } catch (parseError) {
      console.error('[Gemini Nutrition Goals API] Failed to parse JSON:', parseError);
      console.error('[Gemini Nutrition Goals API] Original text:', text);

      // パース失敗時はフォールバック値を返す
      return NextResponse.json({
        success: false,
        error: '栄養目標の計算に失敗しました',
        goals: {
          calories: 2000,
          protein: 100,
          fat: 50,
          carbs: 250,
          reasoning: '標準的な栄養バランスです。'
        }
      });
    }

  } catch (error) {
    console.error('[Gemini Nutrition Goals API Error]', error);
    return NextResponse.json(
      {
        error: 'Failed to calculate nutrition goals',
        details: error.message
      },
      { status: 500 }
    );
  }
}
