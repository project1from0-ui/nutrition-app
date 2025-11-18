// app/api/gemini-menu-analysis/route.js
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { image, userMode, continuousMode, detectedMenus } = await request.json();

    if (!image) {
      return NextResponse.json(
        { error: 'Image is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[Gemini API] GEMINI_API_KEY is missing');
      return NextResponse.json(
        { error: 'Gemini API key is not configured' },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // ユーザーのMODEに基づいたプロンプト作成
    let modeDescription = '';
    if (userMode === '減量') {
      modeDescription = '低カロリーで高タンパク質のメニューを優先してください。';
    } else if (userMode === '現状維持') {
      modeDescription = 'バランスの良い栄養素を含むメニューを優先してください。';
    } else if (userMode === 'バルクアップ') {
      modeDescription = '高カロリーで高タンパク質のメニューを優先してください。';
    } else {
      modeDescription = '栄養バランスの良いメニューを優先してください。';
    }

    let prompt;

    if (continuousMode) {
      // 連続スキャンモード: メニュー名のリストを抽出（段階2）
      prompt = `
この画像はレストランやコンビニのメニュー表です。
画像内に表示されているすべてのメニュー名を抽出してください。

以下のJSON形式で出力してください：
{
  "detectedMenus": ["メニュー名1", "メニュー名2", "メニュー名3"],
  "confidence": 0.95
}

※confidenceは0-1の範囲で、メニュー名が明確に読み取れる場合は0.8以上を返してください。
※メニュー名が読み取れない場合は空配列を返してください。
※メニュー表全体が映っていることを確認してください。
`;
    } else if (detectedMenus && detectedMenus.length > 0) {
      // 段階3: 検出されたメニューから最適な1品を選択
      prompt = `
あなたは栄養管理の専門家です。
以下のメニューリストから、ユーザーの目標に最も適したメニューを1つ選んでください。

メニューリスト: ${detectedMenus.join(', ')}

ユーザーの目標: ${userMode || '健康的な食事'}
アドバイス基準: ${modeDescription}

以下の形式で、最も適したメニューを1つ選んで提案してください：

【おすすめメニュー】
メニュー名: [具体的なメニュー名]

【理由】
[なぜこのメニューがユーザーの目標に適しているか、簡潔に説明]

【推定栄養成分】
- カロリー: [推定値]kcal
- タンパク質: [推定値]g
- 脂質: [推定値]g
- 炭水化物: [推定値]g

※メニューリストから必ず1つ選んでください。
※栄養成分は一般的な値を推定してください。
`;
    } else {
      // 通常モード: 詳細な推薦
      prompt = `
あなたは栄養管理の専門家です。
この画像はレストランやコンビニのメニュー表です。

ユーザーの目標: ${userMode || '健康的な食事'}
アドバイス基準: ${modeDescription}

以下の形式で、メニュー表から最も適したメニューを1つ選んで提案してください：

【おすすめメニュー】
メニュー名: [具体的なメニュー名]

【理由】
[なぜこのメニューがユーザーの目標に適しているか、簡潔に説明]

【推定栄養成分】
- カロリー: [推定値]kcal
- タンパク質: [推定値]g
- 脂質: [推定値]g
- 炭水化物: [推定値]g

※メニュー表に栄養成分が記載されている場合はその値を使用し、記載がない場合は一般的な栄養成分を推定してください。
※メニュー名は画像に表示されている正確な名前を使用してください。
`;
    }

    console.log('[Gemini API] Analyzing menu...');
    console.log('[Gemini API] User mode:', userMode);
    console.log('[Gemini API] Continuous mode:', continuousMode);
    console.log('[Gemini API] Detected menus:', detectedMenus);

    let result;

    if (detectedMenus && detectedMenus.length > 0) {
      // 段階3: メニューリストから選択（画像不要）
      result = await model.generateContent([prompt]);
    } else {
      // 段階2: 画像からメニューを検出
      const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');

      result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: imageBuffer.toString('base64'),
            mimeType: 'image/jpeg'
          }
        }
      ]);
    }

    const response = await result.response;
    const text = response.text();

    console.log('[Gemini API] Response:', text);

    if (continuousMode) {
      // 連続スキャンモード: JSONレスポンスをパース
      try {
        // JSONブロックを抽出 (```json ... ``` の場合に対応)
        let jsonText = text;
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          jsonText = jsonMatch[1];
        }

        const parsedData = JSON.parse(jsonText);
        return NextResponse.json({
          success: true,
          recommendation: parsedData,
          stage: 'detection'
        });
      } catch (parseError) {
        console.error('[Gemini API] Failed to parse JSON:', parseError);
        // パース失敗時は通常のテキストとして返す
        return NextResponse.json({
          success: true,
          recommendation: {
            detectedMenus: [],
            bestMatch: null,
            confidence: 0
          }
        });
      }
    } else {
      // 通常モード（段階3での推奨結果）
      return NextResponse.json({
        success: true,
        recommendation: text,
        stage: 'selection'
      });
    }

  } catch (error) {
    console.error('[Gemini API Error]', error);
    return NextResponse.json(
      {
        error: 'Failed to analyze menu',
        details: error.message
      },
      { status: 500 }
    );
  }
}
