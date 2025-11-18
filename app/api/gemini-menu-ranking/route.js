// app/api/gemini-menu-ranking/route.js
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { menus, userPreference, userMode } = await request.json();

    if (!menus || !Array.isArray(menus) || menus.length === 0) {
      return NextResponse.json(
        { error: 'Menus array is required' },
        { status: 400 }
      );
    }

    if (!userPreference || userPreference.trim() === '') {
      return NextResponse.json(
        { error: 'User preference is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[Gemini Ranking API] GEMINI_API_KEY is missing');
      return NextResponse.json(
        { error: 'Gemini API key is not configured' },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    // メニューリストを文字列化（カテゴリ情報も含める）
    const menuList = menus.map((m, index) =>
      `${index + 1}. ${m.menu} (${m.shop})${m.category ? ` [${m.category}]` : ''} - ${m.calories}kcal, タンパク質${m.protein}g, 脂質${m.fat}g, 炭水化物${m.carbs}g, 価格${m.price || '不明'}円`
    ).join('\n');

    const prompt = `
あなたは栄養管理とメニュー選択の専門家です。
以下のメニューリストをユーザーの要望に基づいて並び替えてください。

**ユーザーの要望:**
${userPreference}

**ユーザーのモード:**
${userMode || '健康的な食事'}

**メニューリスト:**
${menuList}

**タスク:**
1. ユーザーの要望を分析する
   - 食材指定（「魚料理」「野菜多め」など）がある場合は、メニュー名とカテゴリを最優先で評価
   - 栄養素指定（「高タンパク」「低カロリー」など）がある場合は、栄養データを優先で評価
   - 価格指定（「安い」「500円以下」など）がある場合は、価格を優先で評価
2. 各メニューが要望にどれだけ合致するかを評価する
3. 要望に合致する順にメニューを並び替える
4. 上位10件のメニュー番号のみをリストで返す

**重要:**
- 必ず以下のJSON形式で出力してください（他のテキストは含めないこと）
- メニュー番号は元のリストの番号（1〜${menus.length}）を使用
- 要望に最も合致するものから順に並べる
- メニュー名に「サーモン」「サバ」「アジ」などの魚の名前が含まれている場合は魚料理とみなす
- カテゴリに「魚料理」「シーフード」などがあればそれも考慮する

{
  "rankedMenuIndices": [3, 7, 1, 15, 22, 8, 12, 5, 18, 9],
  "reasoning": "要望に基づいた並び替えの簡潔な理由（1-2行）"
}
`;

    console.log('[Gemini Ranking API] Analyzing preferences...');
    console.log('[Gemini Ranking API] User preference:', userPreference);
    console.log('[Gemini Ranking API] Menu count:', menus.length);

    const result = await model.generateContent([prompt]);
    const response = await result.response;
    const text = response.text();

    console.log('[Gemini Ranking API] Response:', text);

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

      console.log('[Gemini Ranking API] Parsing JSON:', jsonText);
      const parsedData = JSON.parse(jsonText);

      console.log('[Gemini Ranking API] Parsed data:', parsedData);

      // インデックスが有効かチェック
      const rankedMenuIndices = parsedData.rankedMenuIndices || [];
      if (!Array.isArray(rankedMenuIndices) || rankedMenuIndices.length === 0) {
        throw new Error('Invalid ranked menu indices');
      }

      // インデックスを0ベースに変換し、並び替えたメニューリストを作成
      const rankedMenus = rankedMenuIndices
        .map(index => menus[index - 1])
        .filter(menu => menu !== undefined);

      // 残りのメニューを追加
      const remainingMenus = menus.filter((menu, index) =>
        !rankedMenuIndices.includes(index + 1)
      );

      const finalRankedMenus = [...rankedMenus, ...remainingMenus];

      return NextResponse.json({
        success: true,
        rankedMenus: finalRankedMenus,
        reasoning: parsedData.reasoning || '要望に基づいて並び替えました'
      });
    } catch (parseError) {
      console.error('[Gemini Ranking API] Failed to parse JSON:', parseError);
      console.error('[Gemini Ranking API] Original text:', text);

      // パース失敗時は元のメニューリストをそのまま返す
      return NextResponse.json({
        success: false,
        error: 'メニューの並び替えに失敗しました',
        rankedMenus: menus
      });
    }

  } catch (error) {
    console.error('[Gemini Ranking API Error]', error);
    return NextResponse.json(
      {
        error: 'Failed to rank menus',
        details: error.message
      },
      { status: 500 }
    );
  }
}
