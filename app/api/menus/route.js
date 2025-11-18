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
    const limit = parseInt(searchParams.get('limit') || '10', 10); // 取得件数（デフォルト10）

    console.log('[Firestore Query]', {
      classification: classification || 'all',
      chains: chainsParam || 'all',
      limit: limit
    });

    // chainId → restaurantName マッピング
    const CHAIN_ID_TO_NAME = {
      'hottomotto': 'Hotto Motto',
      'starbucks': 'STARBUCKS COFFEE',
      'tacobell': 'Taco Bell',
      'ikinari': 'いきなりステーキ',
      'sukiya': 'すき家',
      'nakau': 'なか卯',
      'hanamaru': 'はなまるうどん',
      'bikkuri': 'びっくりドンキー',
      'hokkahokka': 'ほっかほっか亭',
      'yayoiken': 'やよい軒',
      'wendys': 'ウェンディーズ・ファーストキッチン',
      'olive': 'オリーブの丘',
      'coco': 'カレーハウスCoCo壱番屋',
      'origin': 'キッチンオリジン',
      'krispykreme': 'クリスピー・クリーム・ドーナツ　',
      'kfc': 'ケンタッキーフライドチキン',
      'cocos': 'ココス',
      'subway': 'サブウェイ',
      'saintmarc': 'サンマルクカフェ',
      'joyful': 'ジョイフル [Joyfull]',
      'jollypasta': 'ジョリーバスタ',
      'matsu': 'ステーキ屋松',
      'zetteria': 'ゼッテリア',
      'tullys': 'タリーズコーヒー',
      'dennys': 'デニーズ',
      'doutor': 'ドトールコーヒー',
      'burgerking': 'バーガーキング',
      'bigboy': 'ビッグボーイ',
      'firstkitchen': 'ファーストキッチン',
      'freshness': 'フレッシュネスバーガー',
      'mcdonalds': 'マクドナルド',
      'misterdonut': 'ミスタードーナツ',
      'mos': 'モスバーガー',
      'royalhost': 'ロイヤルホスト',
      'lotteria': 'ロッテリア',
      'yoshinoya': '吉野家',
      'ootoya': '大戸屋',
      'tenya': '天丼てんや',
      'kourakuen': '幸楽苑',
      'matsunoya': '松のや',
      'matsuya': '松屋',
      'kamakura': '鎌倉パスタ',
      'ringerhut': '長崎ちゃんぽん リンガーハット',
      'torikizoku': '鳥貴族',
    };

    // 全てmenuItemsコレクションを使用（44チェーン、8500メニュー）

    // chainIdsが指定されている場合は絞り込み、なければ全て取得
    let query = db.collection('menuItems');

    let restaurantNames = [];
    if (chainsParam) {
      const chainIds = chainsParam.split(',').filter(c => c);

      if (chainIds.length === 0) {
        return NextResponse.json([], { status: 200 });
      }

      // chainId → restaurantName に変換
      restaurantNames = chainIds
        .map(id => CHAIN_ID_TO_NAME[id])
        .filter(name => name);

      console.log('[Firestore] chainIds:', chainIds, '→ restaurantNames:', restaurantNames);

      // Firestore制限: 10個まで
      if (restaurantNames.length > 0) {
        query = query.where('restaurantName', 'in', restaurantNames.slice(0, 10));
      } else {
        // マッピングが見つからない場合は空配列を返す
        return NextResponse.json([], { status: 200 });
      }
    }

    const snapshot = await query.get();
    const filterInfo = restaurantNames.length > 0
      ? `restaurants: ${restaurantNames.join(', ')}`
      : 'all';
    console.log(`[Firestore] menuItems: ${snapshot.docs.length} documents (${filterInfo})`);

    // restaurantName → chainId の逆引きマップ
    const NAME_TO_CHAIN_ID = {};
    Object.entries(CHAIN_ID_TO_NAME).forEach(([chainId, name]) => {
      NAME_TO_CHAIN_ID[name] = chainId;
    });

    const menus = snapshot.docs.map(doc => {
      const data = doc.data();
      const restaurantName = data.restaurantName || '';

      // restaurantNameからchainIdを逆引き
      const chainId = data.chainId || NAME_TO_CHAIN_ID[restaurantName] || '';

      return {
        // フロントエンド互換キー
        shop: restaurantName,
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
        chainId: chainId, // restaurantNameから逆引きしたchainId
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

    const resultCount = Math.min(scored.length, limit);
    console.log(`[Firestore] 返却: ${resultCount} メニュー (要求: ${limit}件)`);

    return NextResponse.json(scored.slice(0, limit), {
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
