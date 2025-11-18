// app/api/check-collections/route.js
// Firestoreのコレクション一覧とドキュメント数を確認
import { NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getFirebaseAdmin() {
  if (getApps().length === 0) {
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    if (!privateKey || !clientEmail || !projectId) {
      throw new Error('Firebase Admin credentials are missing');
    }

    try {
      privateKey = JSON.parse(privateKey);
    } catch (e) {
      // JSON形式でない場合はそのまま使用
    }

    privateKey = privateKey.replace(/\\n/g, '\n');

    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }
  return getFirestore();
}

export async function GET(request) {
  try {
    const db = getFirebaseAdmin();

    // チェックするコレクション名のリスト
    const collectionsToCheck = [
      'menuItems',
      'menuItemsConvenience',
      'menuItemsUnofficialImputed',
      'menuItemsHirokojiClass',
      'menu_items',
      'convenience',
      'ai_imputed'
    ];

    const results = {};

    for (const collectionName of collectionsToCheck) {
      try {
        const snapshot = await db.collection(collectionName).limit(1).get();
        results[collectionName] = {
          exists: !snapshot.empty,
          sampleDoc: snapshot.empty ? null : snapshot.docs[0].id
        };

        if (!snapshot.empty) {
          // ドキュメント数を取得（最初の10件のみカウント）
          const countSnapshot = await db.collection(collectionName).limit(10).get();
          results[collectionName].count = `${countSnapshot.size}+ documents`;

          // サンプルデータの構造を確認
          const sampleData = snapshot.docs[0].data();
          results[collectionName].fields = Object.keys(sampleData);
        }
      } catch (error) {
        results[collectionName] = {
          exists: false,
          error: error.message
        };
      }
    }

    // すべてのコレクション一覧を取得（Firestore Admin SDKでは制限あり）
    console.log('[Collection Check] Results:', JSON.stringify(results, null, 2));

    return NextResponse.json({
      success: true,
      collections: results
    });

  } catch (error) {
    console.error('Collection check error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
