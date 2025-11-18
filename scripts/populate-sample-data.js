// scripts/populate-sample-data.js
// menuItemsConvenience と menuItemsUnofficialImputed にサンプルデータを投入

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// 環境変数から認証情報を読み込み
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

// Firebase Admin初期化
if (admin.apps.length === 0) {
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  try {
    privateKey = JSON.parse(privateKey);
  } catch (e) {
    // Already a string
  }

  privateKey = privateKey.replace(/\\n/g, '\n');

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    })
  });
}

const db = admin.firestore();

// サンプルデータ: コンビニメニュー
const convenienceSamples = [
  {
    restaurant_chain: 'セブンイレブン',
    menu_item: 'おにぎり 鮭',
    category: 'おにぎり',
    calories: 180,
    protein: 4.5,
    fat: 1.2,
    carbohydrates: 38.0,
    sodium: 450,
    sugar: 0,
    fiber: 0.5,
    price: 130,
    data_source: 'convenience',
    url: 'https://www.sej.co.jp/',
    scraped_date: new Date().toISOString()
  },
  {
    restaurant_chain: 'ファミリーマート',
    menu_item: 'ファミチキ',
    category: 'ホットスナック',
    calories: 242,
    protein: 11.8,
    fat: 14.2,
    carbohydrates: 16.4,
    sodium: 630,
    sugar: 0,
    fiber: 0,
    price: 180,
    data_source: 'convenience',
    url: 'https://www.family.co.jp/',
    scraped_date: new Date().toISOString()
  },
  {
    restaurant_chain: 'ローソン',
    menu_item: 'からあげクン レギュラー',
    category: 'ホットスナック',
    calories: 220,
    protein: 12.5,
    fat: 12.0,
    carbohydrates: 15.8,
    sodium: 580,
    sugar: 0,
    fiber: 0,
    price: 216,
    data_source: 'convenience',
    url: 'https://www.lawson.co.jp/',
    scraped_date: new Date().toISOString()
  }
];

// サンプルデータ: AI推計メニュー
const aiImputedSamples = [
  {
    restaurant_chain: 'ラーメン二郎',
    menu_item: 'ラーメン小',
    category: 'ラーメン',
    calories: 1200,
    protein: 35.0,
    fat: 45.0,
    carbohydrates: 150.0,
    sodium: 3500,
    sugar: 5.0,
    fiber: 8.0,
    price: 900,
    data_source: 'ai_imputed',
    confidence_score: 0.85,
    estimation_method: 'GPT-4V画像解析 + 類似メニュー参照',
    url: 'https://example.com',
    scraped_date: new Date().toISOString()
  },
  {
    restaurant_chain: '一風堂',
    menu_item: '白丸元味',
    category: 'ラーメン',
    calories: 680,
    protein: 28.0,
    fat: 25.0,
    carbohydrates: 78.0,
    sodium: 2800,
    sugar: 3.0,
    fiber: 4.0,
    price: 890,
    data_source: 'ai_imputed',
    confidence_score: 0.92,
    estimation_method: 'GPT-4V画像解析 + 類似メニュー参照',
    url: 'https://www.ippudo.com/',
    scraped_date: new Date().toISOString()
  },
  {
    restaurant_chain: 'てんや',
    menu_item: '天丼（上）',
    category: '丼',
    calories: 850,
    protein: 22.0,
    fat: 28.0,
    carbohydrates: 115.0,
    sodium: 1800,
    sugar: 8.0,
    fiber: 3.0,
    price: 780,
    data_source: 'ai_imputed',
    confidence_score: 0.88,
    estimation_method: 'GPT-4V画像解析 + 栄養計算',
    url: 'https://www.tenya.co.jp/',
    scraped_date: new Date().toISOString()
  }
];

async function populateData() {
  try {
    console.log('🔥 Starting data population...\n');

    // 1. menuItemsConvenienceにサンプルデータを追加
    console.log('📦 Populating menuItemsConvenience...');
    const convenienceBatch = db.batch();

    for (const item of convenienceSamples) {
      const docRef = db.collection('menuItemsConvenience').doc();
      convenienceBatch.set(docRef, item);
      console.log(`  ✅ ${item.restaurant_chain} - ${item.menu_item}`);
    }

    await convenienceBatch.commit();
    console.log(`✨ Added ${convenienceSamples.length} items to menuItemsConvenience\n`);

    // 2. menuItemsUnofficialImputedにサンプルデータを追加
    console.log('🤖 Populating menuItemsUnofficialImputed...');
    const aiImputedBatch = db.batch();

    for (const item of aiImputedSamples) {
      const docRef = db.collection('menuItemsUnofficialImputed').doc();
      aiImputedBatch.set(docRef, item);
      console.log(`  ✅ ${item.restaurant_chain} - ${item.menu_item} (confidence: ${item.confidence_score})`);
    }

    await aiImputedBatch.commit();
    console.log(`✨ Added ${aiImputedSamples.length} items to menuItemsUnofficialImputed\n`);

    // 3. データ確認
    console.log('🔍 Verifying data...');

    const convenienceCount = await db.collection('menuItemsConvenience').count().get();
    const aiImputedCount = await db.collection('menuItemsUnofficialImputed').count().get();

    console.log(`📊 Total counts:`);
    console.log(`  - menuItemsConvenience: ${convenienceCount.data().count} items`);
    console.log(`  - menuItemsUnofficialImputed: ${aiImputedCount.data().count} items`);

    console.log('\n✅ Data population completed successfully!');

  } catch (error) {
    console.error('❌ Error populating data:', error);
  } finally {
    process.exit(0);
  }
}

// 実行
populateData();
