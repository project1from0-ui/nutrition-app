// test-gemini.js - Gemini APIの動作テスト
const { GoogleGenerativeAI } = require('@google/generative-ai');

const API_KEY = 'AIzaSyCOdBG1aEc3tuH-CpCmYG0Q8hwEwUlitdo';

async function testGeminiAPI() {
  console.log('=== Gemini API Test ===\n');

  try {
    const genAI = new GoogleGenerativeAI(API_KEY);

    // モデル一覧を取得
    console.log('1. 利用可能なモデルを確認中...');
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
    const data = await response.json();

    const flashModels = data.models.filter(m => m.name.includes('flash'));
    console.log('\nFlashモデル一覧:');
    flashModels.forEach(m => {
      console.log(`  - ${m.name}`);
    });

    // gemini-2.5-flashをテスト
    console.log('\n2. gemini-2.5-flash でテキスト生成をテスト...');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `
この画像はレストランのメニュー表です。
画像内に表示されているすべてのメニュー名を抽出してください。

以下のJSON形式で出力してください：
{
  "detectedMenus": ["メニュー名1", "メニュー名2"],
  "confidence": 0.95
}
`;

    // ダミー画像 (1x1白ピクセルのJPEG)
    const dummyImageBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCjgA//2Q==';

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: dummyImageBase64,
          mimeType: 'image/jpeg'
        }
      }
    ]);

    const text = result.response.text();
    console.log('\nGemini APIレスポンス:');
    console.log(text);

    console.log('\n✅ Gemini API は正常に動作しています!');

  } catch (error) {
    console.error('\n❌ エラーが発生しました:');
    console.error('Error:', error.message);
    if (error.status) {
      console.error('Status:', error.status);
    }
    if (error.errorDetails) {
      console.error('Details:', error.errorDetails);
    }
  }
}

testGeminiAPI();
