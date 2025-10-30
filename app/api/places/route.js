// app/api/places/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Firebase Admin初期化
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

// チェーンマッピング（Places API検索キーワード → chainId）
const CHAIN_MAPPING = {
  'ほっともっと': 'hottomotto',
  'スターバックス': 'starbucks',
  'タコベル': 'tacobell',
  'いきなりステーキ': 'ikinari',
  'すき家': 'sukiya',
  'なか卯': 'nakau',
  'はなまるうどん': 'hanamaru',
  'びっくりドンキー': 'bikkuri',
  'ほっかほっか亭': 'hokkahokka',
  'やよい軒': 'yayoiken',
  'ウェンディーズ': 'wendys',
  'オリーブの丘': 'olive',
  'CoCo壱番屋': 'coco',
  'キッチンオリジン': 'origin',
  'クリスピークリームドーナツ': 'krispykreme',
  'ケンタッキー': 'kfc',
  'ココス': 'cocos',
  'サブウェイ': 'subway',
  'サンマルクカフェ': 'saintmarc',
  'ジョイフル': 'joyful',
  'ジョリーパスタ': 'jollypasta',
  'ステーキ屋松': 'matsu',
  'ゼッテリア': 'zetteria',
  'タリーズコーヒー': 'tullys',
  'デニーズ': 'dennys',
  'ドトール': 'doutor',
  'バーガーキング': 'burgerking',
  'ビッグボーイ': 'bigboy',
  'ファーストキッチン': 'firstkitchen',
  'フレッシュネスバーガー': 'freshness',
  'マクドナルド': 'mcdonalds',
  'ミスタードーナツ': 'misterdonut',
  'モスバーガー': 'mos',
  'ロイヤルホスト': 'royalhost',
  'ロッテリア': 'lotteria',
  '吉野家': 'yoshinoya',
  '大戸屋': 'ootoya',
  'てんや': 'tenya',
  '幸楽苑': 'kourakuen',
  '松のや': 'matsunoya',
  '松屋': 'matsuya',
  '鎌倉パスタ': 'kamakura',
  'リンガーハット': 'ringerhut',
  '鳥貴族': 'torikizoku',
};

const SEARCH_KEYWORDS = Object.keys(CHAIN_MAPPING);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat'));
    const lng = parseFloat(searchParams.get('lng'));

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json(
        { error: 'Invalid lat/lng parameters' },
        { status: 400 }
      );
    }

    console.log(`[Places API] 位置: ${lat}, ${lng}`);

    // キャッシュキー（100m単位で丸める）
    const cacheKey = `${lat.toFixed(3)}_${lng.toFixed(3)}`;
    const db = getFirebaseAdmin();

    // 1. Firestoreキャッシュをチェック
    const cacheRef = db.collection('placesCache').doc(cacheKey);
    const cached = await cacheRef.get();

    if (cached.exists) {
      const cacheData = cached.data();
      const age = Date.now() - cacheData.timestamp;
      const cacheValidDays = 7;

      // 7日以内のキャッシュなら使用
      if (age < cacheValidDays * 24 * 60 * 60 * 1000) {
        console.log(`[Places API] キャッシュヒット: ${cacheKey} (${Math.floor(age / 1000 / 60 / 60)}時間前)`);
        return NextResponse.json({
          chains: cacheData.chains,
          stores: cacheData.stores || [],
          userLocation: cacheData.location || { lat, lng },
          fromCache: true,
        });
      }
    }

    // 2. Places APIで検索
    console.log('[Places API] キャッシュなし、Places API呼び出し中...');

    const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!GOOGLE_API_KEY) {
      throw new Error('GOOGLE_MAPS_API_KEY is missing');
    }

    const nearbyChains = new Set();
    const radius = 200; // 半径200m

    // Haversine距離計算関数
    function calculateDistance(lat1, lon1, lat2, lon2) {
      const R = 6371e3; // 地球の半径（メートル）
      const φ1 = lat1 * Math.PI / 180;
      const φ2 = lat2 * Math.PI / 180;
      const Δφ = (lat2 - lat1) * Math.PI / 180;
      const Δλ = (lon2 - lon1) * Math.PI / 180;

      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

      return R * c; // メートル単位
    }

    const storeDetails = []; // 店舗詳細情報を保存

    // 各チェーンを並列検索
    const searchPromises = SEARCH_KEYWORDS.map(async (keyword) => {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&keyword=${encodeURIComponent(keyword)}&language=ja&key=${GOOGLE_API_KEY}`;

      try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'OK' && data.results.length > 0) {
          // 距離を計算して200m以内の店舗のみ選択
          const chainId = CHAIN_MAPPING[keyword];
          if (!chainId) return;

          for (const place of data.results) {
            const placeName = place.name || '';

            // 店舗名にキーワードが含まれているか検証（誤マッチを防ぐ）
            const keywordMatch = keyword.toLowerCase().replace(/\s/g, '');
            const placeNameNormalized = placeName.toLowerCase().replace(/\s/g, '');

            // キーワードの一部が店舗名に含まれているかチェック
            // 例: 「すき家」が「すき家」に含まれる → OK
            // 例: 「すき家」が「なか卯」に含まれる → NG
            const isValidMatch = placeNameNormalized.includes(keywordMatch) ||
                                 keywordMatch.includes(placeNameNormalized);

            if (!isValidMatch) {
              console.log(`[Places API] スキップ: ${keyword} で検索 → ${placeName} (名前が一致しない)`);
              continue;
            }

            const placeLat = place.geometry.location.lat;
            const placeLng = place.geometry.location.lng;
            const distance = calculateDistance(lat, lng, placeLat, placeLng);

            if (distance <= radius) {
              nearbyChains.add(chainId);
              storeDetails.push({
                chainId,
                name: place.name,
                location: {
                  lat: placeLat,
                  lng: placeLng
                },
                distance: Math.round(distance),
                address: place.vicinity || '',
                place_id: place.place_id || ''
              });
              console.log(`[Places API] ✓ ${keyword} (${chainId}): ${placeName} ${Math.round(distance)}m`);
              break; // 1チェーンにつき最も近い店舗のみ
            }
          }
        }
      } catch (error) {
        console.error(`[Places API] エラー (${keyword}):`, error.message);
      }
    });

    await Promise.all(searchPromises);

    const chainsArray = Array.from(nearbyChains);
    console.log(`[Places API] 合計 ${chainsArray.length} チェーン見つかりました:`, chainsArray);

    // 3. Firestoreにキャッシュ保存
    await cacheRef.set({
      chains: chainsArray,
      stores: storeDetails,
      timestamp: Date.now(),
      location: { lat, lng },
    });

    return NextResponse.json({
      chains: chainsArray,
      stores: storeDetails,
      userLocation: { lat, lng },
      fromCache: false,
    });

  } catch (error) {
    console.error('[Places API Error]', error);
    return NextResponse.json(
      { error: 'Failed to fetch nearby chains', details: error.message },
      { status: 500 }
    );
  }
}
