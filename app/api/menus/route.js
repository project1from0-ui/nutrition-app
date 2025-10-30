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
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    if (!privateKey || !clientEmail || !projectId) {
      throw new Error('Firebase Admin credentials are missing');
    }

    // JSON形式でパースを試みる（ダブルクォート付きの場合）
    try {
      privateKey = JSON.parse(privateKey);
    } catch (e) {
      // JSON形式でない場合はそのまま使用
    }

    // \nを実際の改行に置き換え
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

    // クエリパラメータを取得
    const { searchParams } = new URL(request.url);
    const classification = searchParams.get('classification');
    const chainsParam = searchParams.get('chains'); // カンマ区切りのchainId

    console.log('[Firestore Query]', {
      classification: classification || 'all',
      chains: chainsParam || 'all'
    });

    // 全てmenuItemsコレクションを使用（44チェーン、8500メニュー）

    // chainIdsが指定されている場合は絞り込み、なければ全て取得
    let query = db.collection('menuItems');

    if (chainsParam) {
      const chainIds = chainsParam.split(',').filter(c => c);

      if (chainIds.length === 0) {
        return NextResponse.json([], { status: 200 });
      }

      // Firestore制限: 10個まで
      query = query.where('chainId', 'in', chainIds.slice(0, 10));
    }

    const snapshot = await query.get();
    console.log(`[Firestore] menuItems: ${snapshot.docs.length} documents (chains: ${chainsParam || 'all'})`);

    const menus = snapshot.docs.map(doc => {
      const data = doc.data();

      return {
        // フロントエンド互換キー
        shop: data.restaurantName || '',
        category: data.category || '',
        menu: data.menuName || '',
        calories: data.nutrition?.calories || 0,
        protein: data.nutrition?.protein || 0,
        fat: data.nutrition?.fat || 0,
        carbs: data.nutrition?.carbs || 0,
        salt: data.nutrition?.salt || 0,

        genre: data.genre || '',
        classification: data.classification || '',
        price: data.price || 0,

        id: doc.id,
        source: 'menuItems',
        size: '-',
        chainId: data.chainId || '', // Add chainId for location-based filtering
      };
    });

    // 除外フィルター（サイドメニュー、トッピング、ドリンク等）
    const excludeKeywords = [
      // ドリンク・飲み物
      '調味料','ドリンク','飲み物','ソース','タレ','飲料','ジュース','コーヒー','お茶','水',
      'ケチャップ','マスタード','マヨネーズ','醤油','味噌','塩','胡椒','スパイス','香辛料',

      // サイドメニュー
      'サイド','トッピング','単品','追加','オプション',

      // 小さいメニュー（昼食に不適切）
      'スナック','おやつ','デザート','アイス','シェイク','フロート',
      'ポテト','フライ','ナゲット','チキンナゲット','サラダ','スープ',
      'コーンスープ','みそ汁','味噌汁','漬物','キムチ','のり','海苔',
      '生卵','卵','たまご','温泉卵','半熟卵','ゆで卵',
      'チーズ','バター','マーガリン','ジャム','はちみつ','蜂蜜',

      // トッピング
      'トッピング','増量','大盛','特盛','メガ盛','追加チーズ','追加肉',
      '具材追加','具追加','ライス大盛','ごはん大盛',

      // その他
      'ドリンクバー','セットドリンク','お子様','キッズ'
    ];

    const filteredMenus = menus.filter(m => {
      const menuName = (m.menu || '').toLowerCase();
      const category = (m.category || '').toLowerCase();

      // メニュー名またはカテゴリに除外キーワードが含まれていたら除外
      const hasExcludeKeyword = excludeKeywords.some(k =>
        menuName.includes(k.toLowerCase()) || category.includes(k.toLowerCase())
      );

      // 昼食として不適切な小さすぎるメニューを除外（カロリー200kcal未満）
      const isTooSmall = m.calories < 200;

      return !hasExcludeKeyword && !isTooSmall;
    });

    // タンパク質効率スコアでソート
    const scored = filteredMenus.map(m => ({
      ...m,
      score: m.calories > 0 ? (m.protein / m.calories) * 1000 : 0
    }));

    scored.sort((a, b) => b.score - a.score);

    console.log(`[Firestore] 返却: ${Math.min(scored.length, 10)} メニュー`);

    return NextResponse.json(scored.slice(0, 10), {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });

  } catch (error) {
    console.error('[Firestore Error]', error);
    return NextResponse.json(
      { error: 'Failed to fetch menus from Firestore', details: error.message },
      { status: 500 }
    );
  }
}
