// Firestoreのコレクション一覧を確認するスクリプト
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// 環境変数を読み込む
require('dotenv').config({ path: '.env.local' });

// Firebase Admin初期化
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

if (!privateKey || !clientEmail || !projectId) {
  console.error('❌ Firebase認証情報が見つかりません');
  process.exit(1);
}

initializeApp({
  credential: cert({
    projectId,
    clientEmail,
    privateKey,
  }),
});

const db = getFirestore();

async function checkCollections() {
  console.log('\n📊 Firestoreコレクション一覧\n');
  console.log('プロジェクトID:', projectId);
  console.log('━'.repeat(60));

  try {
    // コレクション一覧を取得
    const collections = await db.listCollections();

    if (collections.length === 0) {
      console.log('⚠️  コレクションが見つかりません');
      return;
    }

    console.log(`\n✅ ${collections.length}個のコレクションが見つかりました:\n`);

    // 各コレクションのドキュメント数を取得
    for (const collection of collections) {
      const snapshot = await collection.count().get();
      const count = snapshot.data().count;

      console.log(`📁 ${collection.id}`);
      console.log(`   └─ ドキュメント数: ${count}件`);

      // 最初のドキュメントのサンプルを表示
      if (count > 0) {
        const firstDoc = await collection.limit(1).get();
        if (!firstDoc.empty) {
          const data = firstDoc.docs[0].data();
          const keys = Object.keys(data).slice(0, 5);
          console.log(`   └─ フィールド例: ${keys.join(', ')}${Object.keys(data).length > 5 ? '...' : ''}`);
        }
      }
      console.log('');
    }

  } catch (error) {
    console.error('❌ エラー:', error.message);
  }
}

checkCollections().then(() => {
  console.log('✨ 確認完了\n');
  process.exit(0);
});
