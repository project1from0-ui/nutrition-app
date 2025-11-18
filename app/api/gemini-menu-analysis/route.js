// app/api/gemini-menu-analysis/route.js
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { image, userMode, continuousMode, detectedMenus, excludeMenus } = await request.json();

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
あなたは画像からメニュー表を検出する専門家です。
この画像を分析し、レストランやコンビニのメニュー表が映っているかを判定してください。

**判定基準:**
- メニュー名が3つ以上読み取れる → confidence 0.8以上
- メニュー名が1-2個読み取れる → confidence 0.6以上
- メニュー名が読み取れない、またはメニュー表でない → confidence 0.5以下

**必ず以下のJSON形式で出力してください（他のテキストは含めないこと）:**
{
  "detectedMenus": ["メニュー名1", "メニュー名2", "メニュー名3"],
  "confidence": 0.95
}

**重要:**
- JSONのみを出力してください（説明文や\`\`\`json等は不要）
- メニュー表らしきものが映っていれば、読み取れたメニュー名をすべてリストアップしてください
- 価格や説明文は含めず、メニュー名のみを抽出してください
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
      // 通常モード: 詳細な推薦（シンプル・1ステップ）
      const excludeInstruction = excludeMenus && excludeMenus.length > 0
        ? `\n**除外するメニュー:** 以下のメニューは既に提案済みのため、絶対に選ばないでください: ${excludeMenus.join(', ')}\n`
        : '';

      prompt = `
あなたは栄養管理の専門家です。
この画像はレストランやコンビニのメニュー表の写真です。

**タスク:**
1. 画像からすべてのメニュー名を読み取る
2. ユーザーの目標に最も適したメニューを1つ選ぶ
3. そのメニューの栄養成分を推定する
4. そのメニューの栄養バランスを簡潔に説明する

**ユーザーの目標:** ${userMode || '健康的な食事'}
**アドバイス基準:** ${modeDescription}
${excludeInstruction}
**必ず以下のJSON形式で回答してください（他のテキストは含めないこと）:**

{
  "menuName": "メニュー表に記載されている正確なメニュー名",
  "reason": "栄養バランスについて1-2行で簡潔に（例：高タンパク質・低脂質でバランスが良い、適度なカロリーで炭水化物も十分など）",
  "nutrition": {
    "calories": 推定カロリー値(数値のみ),
    "protein": 推定タンパク質量(数値のみ),
    "fat": 推定脂質量(数値のみ),
    "carbs": 推定炭水化物量(数値のみ)
  }
}

**重要:**
- メニュー表に栄養成分が記載されている場合はその値を使用
- 記載がない場合は一般的な値を推定
- メニュー名は画像に表示されている正確な名前をそのまま使用
- reasonは栄養バランスのみを簡潔に記載（材料や調理方法は不要、栄養素の特徴のみ）
- 1-2行以内で簡潔に
- JSONのみを出力してください（説明文や\`\`\`json等は不要）
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

        console.log('[Gemini API] Parsing JSON:', jsonText);
        const parsedData = JSON.parse(jsonText);

        console.log('[Gemini API] Parsed data:', parsedData);

        return NextResponse.json({
          success: true,
          recommendation: parsedData,
          stage: 'detection'
        });
      } catch (parseError) {
        console.error('[Gemini API] Failed to parse JSON:', parseError);
        console.error('[Gemini API] Original text:', text);
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
      // 通常モード（段階3での推奨結果）- JSON形式でパース
      try {
        // JSONブロックを抽出 (```json ... ``` の場合に対応)
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

        console.log('[Gemini API] Parsing recommendation JSON:', jsonText);
        const parsedData = JSON.parse(jsonText);

        console.log('[Gemini API] Parsed recommendation:', parsedData);

        // メニュー名が存在しない、または空の場合はメニュー未検出と判断
        if (!parsedData.menuName || parsedData.menuName.trim() === '') {
          return NextResponse.json({
            success: false,
            error: 'メニュー情報を読み取れませんでした',
            noMenuDetected: true
          });
        }

        return NextResponse.json({
          success: true,
          recommendation: parsedData,
          stage: 'selection'
        });
      } catch (parseError) {
        console.error('[Gemini API] Failed to parse recommendation JSON:', parseError);
        console.error('[Gemini API] Original text:', text);
        // パース失敗時はメニュー未検出として扱う
        return NextResponse.json({
          success: false,
          error: 'メニュー情報を読み取れませんでした',
          noMenuDetected: true
        });
      }
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
