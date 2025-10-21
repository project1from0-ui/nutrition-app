// app/api/menus/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Firebase Admin初期化（サーバーサイド専用）
function getFirebaseAdmin() {
  if (getApps().length === 0) {
    // 環境変数から認証情報を取得
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    if (!privateKey || !clientEmail || !projectId) {
      throw new Error('Firebase Admin credentials are missing');
    }

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

    // クエリパラメータから classification を取得
    const { searchParams } = new URL(request.url);
    const classification = searchParams.get('classification');

    console.log('[Firestore Query]', { classification: classification || 'all' });

    // Firestoreクエリ
    let query = db.collection('menuItemsHirokojiClass');

    // classificationが指定されていればフィルタリング
    if (classification) {
      query = query.where('classification', '==', classification);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      console.log('No menu items found in Firestore');
      return NextResponse.json([], { status: 200 });
    }

    // Firestoreデータをフロントエンド互換形式に変換
    const menus = snapshot.docs.map(doc => {
      const data = doc.data();

      return {
        // 既存フロントエンド互換キー
        shop: data.restaurantName || '',
        category: data.category || '',
        menu: data.menuName || '',
        calories: data.nutrition?.calories || 0,
        protein: data.nutrition?.protein || 0,
        fat: data.nutrition?.fat || 0,
        carbs: data.nutrition?.carbs || 0,
        salt: data.nutrition?.salt || 0,

        // 新規追加フィールド
        genre: data.genre || '',
        classification: data.classification || '',
        price: data.price || 0,

        // 位置情報（GeoPoint型の場合）
        latitude: data.location?._latitude || data.latitude || null,
        longitude: data.location?._longitude || data.longitude || null,

        // 内部用
        id: doc.id,

        // サイズは固定値（後で必要に応じて調整）
        size: '-',
      };
    });

    // 除外フィルター（既存ロジックを維持）
    const excludeKeywords = [
      '調味料','ドリンク','飲み物','ソース','タレ','飲料','ジュース','コーヒー','お茶','水',
      'ケチャップ','マスタード','マヨネーズ','醤油','味噌','塩','胡椒','スパイス','香辛料'
    ];

    const filteredMenus = menus.filter(m => {
      const menuName = (m.menu || '').toLowerCase();
      return !excludeKeywords.some(k => menuName.includes(k.toLowerCase()));
    });

    console.log(`[Firestore] Fetched ${filteredMenus.length} menu items (classification: ${classification || 'all'})`);

    return NextResponse.json(filteredMenus, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });

  } catch (error) {
    console.error('[Firestore Error]', error);
    return NextResponse.json(
      { error: 'Failed to fetch menus from Firestore', details: error.message },
      { status: 500 }
    );
  }
}
