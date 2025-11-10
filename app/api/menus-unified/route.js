// app/api/menus-unified/route.js
// 3つのコレクション（menuItems, menuItemsConvenience, menuItemsUnofficialImputed）を統合して検索
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

    console.log('[Firebase Init] Checking credentials...');
    console.log('[Firebase Init] projectId:', projectId ? 'exists' : 'MISSING');
    console.log('[Firebase Init] clientEmail:', clientEmail ? 'exists' : 'MISSING');
    console.log('[Firebase Init] privateKey:', privateKey ? 'exists' : 'MISSING');

    if (!privateKey || !clientEmail || !projectId) {
      console.error('[Firebase Init] Missing credentials:', {
        projectId: !!projectId,
        clientEmail: !!clientEmail,
        privateKey: !!privateKey
      });
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

    console.log('[Firebase Init] Initializing Firebase Admin...');
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    console.log('[Firebase Init] Firebase Admin initialized successfully');
  }
  return getFirestore();
}

export async function GET(request) {
  try {
    const db = getFirebaseAdmin();
    const { searchParams } = new URL(request.url);

    // クエリパラメータ
    const classification = searchParams.get('classification'); // 減量/現状維持/バルクアップ
    const chainsParam = searchParams.get('chains'); // カンマ区切りのチェーン名
    const dataSources = searchParams.get('sources')?.split(',') || ['official', 'convenience', 'ai_imputed'];
    const limit = parseInt(searchParams.get('limit') || '30');
    const minConfidence = parseFloat(searchParams.get('minConfidence') || '0.7'); // AI推計の最小信頼度

    console.log('Unified menu search:', { classification, chainsParam, dataSources, limit });

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
      // コンビニチェーン
      'seven': 'セブン-イレブン',
      'lawson': 'LAWSON',
      'familymart': 'ファミリーマート',
      // AI推計レストラン
      'pronto': 'PRONTO',
      'katsuya': 'かつや',
      'kurasushi': 'くら寿司',
      'hamazushi': 'はま寿司',
      'gusto': 'ガスト',
      'saizeriya': 'サイゼリヤ',
      'sushiro': 'スシロー',
      'bamiyan': 'バーミヤン',
      'pepperlunch': 'ペッパーランチ',
      'kushikatsu': '串カツ田中',
      'fujisoba': '名代 富士そば',
      'sato': '和食さと',
      'yumean': '夢庵',
      'osaka': '大阪王将',
      'hidakaya': '日高屋',
      'rairaiken': '来来軒',
      'goemon': '洋麺屋五右衛門',
      'kinniku': '筋肉食堂',
      'gindako': '築地銀だこ',
      'ginsara': '銀のさら',
      'gyoza': '餃子の王将',
    };

    // 検索するコレクション名のマッピング
    const collectionMap = {
      'official': 'menuItems',
      'convenience': 'menuItemsConvenience',
      'ai_imputed': 'menuItemsUnofficialImputed'
    };

    // 検索するチェーン名の配列（chainIdからrestaurantNameに変換）
    let chains = [];
    let restaurantNames = [];
    if (chainsParam) {
      const chainIds = chainsParam.split(',').map(c => c.trim());

      // chainId → restaurantName に変換
      restaurantNames = chainIds
        .map(id => CHAIN_ID_TO_NAME[id] || id)  // マッピングがない場合はそのまま使用
        .filter(name => name);

      chains = restaurantNames;
      console.log('[Unified API] chainIds:', chainIds, '→ restaurantNames:', restaurantNames);
    }

    // 並列で3つのコレクションから検索
    const searchPromises = dataSources.map(async (source) => {
      const collectionName = collectionMap[source];
      if (!collectionName) return [];

      let query = db.collection(collectionName);

      // チェーン名でフィルタ（すべてのコレクションでrestaurantNameを使用）
      const chainFieldName = 'restaurantName';

      if (chains.length > 0) {
        // Firestoreは配列のin演算子が最大10要素まで
        if (chains.length <= 10) {
          query = query.where(chainFieldName, 'in', chains);
        }
        // 10を超える場合は後でフィルタリング
      }

      const snapshot = await query.limit(limit * 3).get(); // 余裕を持って取得
      console.log(`[${source}] Collection: ${collectionName}, Retrieved ${snapshot.size} documents`);
      const items = [];

      snapshot.forEach(doc => {
        const data = doc.data();

        // チェーン名を複数のフィールドから取得（柔軟な対応）
        const docChainName = data[chainFieldName] || data.restaurant_chain || data.restaurantName || data.chain_name || '';

        // チェーン名フィルタ（10超の場合）
        if (chains.length > 10 && !chains.includes(docChainName)) {
          return;
        }

        // AI推計の場合は信頼度でフィルタ
        if (source === 'ai_imputed') {
          const confidence = data.confidence_score || 0;
          if (confidence < minConfidence) {
            return;
          }
        }

        // 統一フォーマットに変換（複数のフィールド名パターンに対応）
        const unifiedItem = {
          id: doc.id,
          restaurant_chain: docChainName,
          menu_item: data.menu_item || data.menuName || data.menu || data.item_name || '',
          category: data.category || '',
          calories: data.nutrition?.calories || data.calories || 0,
          protein: data.nutrition?.protein || data.protein || 0,
          fat: data.nutrition?.fat || data.fat || 0,
          carbohydrates: data.nutrition?.carbs || data.carbohydrates || data.carbs || 0,
          sodium: data.nutrition?.salt || data.sodium || data.salt || 0,
          sugar: data.sugar || 0,
          fiber: data.fiber || 0,
          price: data.price || 0,
          data_source: source,
          collection: collectionName,
          url: data.url || '',
          scraped_date: data.scraped_date || ''
        };

        // AI推計の追加フィールド
        if (source === 'ai_imputed') {
          unifiedItem.confidence_score = data.confidence_score || 0.85;
          unifiedItem.estimation_method = data.estimation_method || '';
        }

        items.push(unifiedItem);
      });

      console.log(`[${source}] After filtering: ${items.length} items`);
      return items;
    });

    // 全コレクションから結果を取得
    const allResults = await Promise.all(searchPromises);
    let combinedMenus = allResults.flat();

    console.log(`Found ${combinedMenus.length} items from all sources`);

    // 分類に応じたソート
    if (classification === '減量') {
      // カロリーが低く、タンパク質が高い順
      combinedMenus.sort((a, b) => {
        const scoreA = (a.protein || 0) / Math.max(a.calories || 1, 1) * 1000;
        const scoreB = (b.protein || 0) / Math.max(b.calories || 1, 1) * 1000;
        return scoreB - scoreA;
      });
    } else if (classification === '現状維持') {
      // バランスの良い順（タンパク質/カロリー比）
      combinedMenus.sort((a, b) => {
        const balanceA = Math.abs((a.protein || 0) * 4 + (a.carbohydrates || 0) * 4 + (a.fat || 0) * 9 - (a.calories || 0));
        const balanceB = Math.abs((b.protein || 0) * 4 + (b.carbohydrates || 0) * 4 + (b.fat || 0) * 9 - (b.calories || 0));
        return balanceA - balanceB;
      });
    } else if (classification === 'バルクアップ') {
      // カロリーとタンパク質が高い順
      combinedMenus.sort((a, b) => {
        const scoreA = (a.calories || 0) + (a.protein || 0) * 10;
        const scoreB = (b.calories || 0) + (b.protein || 0) * 10;
        return scoreB - scoreA;
      });
    }

    // 件数制限
    combinedMenus = combinedMenus.slice(0, limit);

    const sourceCounts = {
      official: allResults[dataSources.indexOf('official')]?.length || 0,
      convenience: allResults[dataSources.indexOf('convenience')]?.length || 0,
      ai_imputed: allResults[dataSources.indexOf('ai_imputed')]?.length || 0
    };

    console.log(`[Sources] official: ${sourceCounts.official}, convenience: ${sourceCounts.convenience}, ai_imputed: ${sourceCounts.ai_imputed}`);

    return NextResponse.json({
      success: true,
      menus: combinedMenus,
      total: combinedMenus.length,
      sources: sourceCounts
    });

  } catch (error) {
    console.error('Unified menus API error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
