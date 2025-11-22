"use client";
import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { CHAIN_ID_TO_NAME } from '../lib/chain-mapping';

// 認証hookとサインイン関数をインポート
import { useAuth } from '../context/AuthContext';
import { signInWithGoogle, handleSignOut } from './lib/firebase';

// Google Mapsはクライアントサイドのみで動作するため、dynamic importを使用
const GoogleMap = dynamic(() => import('./components/GoogleMap'), { ssr: false });

// CSSアニメーションをインラインスタイルで追加
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    @keyframes pulse {
      0%, 100% {
        transform: scale(1);
        opacity: 1;
      }
      50% {
        transform: scale(1.02);
        opacity: 0.8;
      }
    }
  `;
  if (!document.head.querySelector('style[data-blink-animation]')) {
    style.setAttribute('data-blink-animation', 'true');
    document.head.appendChild(style);
  }
}

/* =========================
   データ取得
========================= */
const normalizeShop = (s) => (s || '')
  .replace(/\s/g, '')
  .replace(/\[[^\]]*\]/g, '')
  .toLowerCase();

// 2点間の距離を計算（Haversine公式）
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

  const distance = R * c; // メートル単位
  return Math.round(distance); // 整数に丸める
}
// 位置情報ベースのメニュー取得（クライアントキャッシュ付き）
// 戻り値: { menus: [], stores: [], userLocation: {} }
async function fetchMenuDataByLocation(classification = null) {
  try {
    console.log('[位置情報] 取得開始...');
    console.log('[位置情報] navigator.geolocation:', !!navigator.geolocation);
    console.log('[位置情報] isSecureContext:', window.isSecureContext);
    console.log('[位置情報] location.protocol:', window.location.protocol);
    console.log('[位置情報] location.hostname:', window.location.hostname);

    // 位置情報APIがサポートされているか確認
    if (!navigator.geolocation) {
      throw new Error('お使いのブラウザは位置情報に対応していません。最新版のブラウザをご利用ください。');
    }

    // 1. 位置情報を取得（複数の方法を試す）
    let position = null;

    // 方法1: 高精度モード（GPS）で取得
    try {
      console.log('[位置情報] 方法1: 高精度モードで取得中...');
      position = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation APIがサポートされていません'));
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            console.log('[位置情報] 方法1: 成功', pos);
            resolve(pos);
          },
          (err) => {
            console.error('[位置情報] 方法1: 失敗', err);
            console.error('[位置情報] エラーコード:', err.code);
            console.error('[位置情報] エラーメッセージ:', err.message);
            reject(err);
          },
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
          }
        );
      });
    } catch (error1) {
      console.warn('[位置情報] 方法1失敗、方法2を試行...');

      // 方法2: 低精度モード（Wi-Fi/IPベース）で取得
      try {
        console.log('[位置情報] 方法2: 低精度モードで取得中...');
        position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              console.log('[位置情報] 方法2: 成功', pos);
              resolve(pos);
            },
            (err) => {
              console.error('[位置情報] 方法2: 失敗', err);
              reject(err);
            },
            {
              enableHighAccuracy: false,
              timeout: 10000,
              maximumAge: 60000
            }
          );
        });
      } catch (error2) {
        console.error('[位置情報] 方法2も失敗');
        // 最初のエラーを投げる（より詳細な情報を含む）
        throw error1;
      }
    }

    if (!position) {
      throw new Error('位置情報を取得できませんでした');
    }

    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const accuracy = position.coords.accuracy;
    console.log('[位置情報] 取得成功:', { lat, lng, accuracy: `${Math.round(accuracy)}m` });

    // 精度が低すぎる場合は警告
    if (accuracy > 500) {
      console.warn(`[位置情報] 精度が低いです: ${Math.round(accuracy)}m`);
    }

    // 2. キャッシュキー（100m単位で丸める）
    // v3: store.location構造に変更
    const cacheKey = `nearbyChains_v3_${lat.toFixed(3)}_${lng.toFixed(3)}`;

    // 3. ローカルストレージからキャッシュ確認（24時間有効）
    const cached = localStorage.getItem(cacheKey);
    let chains = null;
    let stores = [];
    let userLoc = { lat, lng };

    if (cached) {
      try {
        const { chains: cachedChains, stores: cachedStores, userLocation: cachedUserLoc, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        if (age < 24 * 60 * 60 * 1000) {
          chains = cachedChains;
          stores = cachedStores || [];
          userLoc = cachedUserLoc || userLoc;
          console.log('[キャッシュ] 店舗情報を復元:', stores.length, '件');
          console.log(`[キャッシュ] ヒット: ${chains.length}チェーン (${Math.floor(age/1000/60)}分前)`);
        }
  } catch (e) {
        console.error('[キャッシュ] パースエラー:', e);
      }
    }

    // 4. キャッシュがなければPlaces APIで検索
    if (!chains) {
      console.log('[Places API] 近隣チェーン検索中...');
      const placesRes = await fetch(`/api/places?lat=${lat}&lng=${lng}`, {
        cache: 'no-store'
      });

      if (!placesRes.ok) {
        throw new Error(`Places API error: ${placesRes.status}`);
      }

      const placesData = await placesRes.json();
      chains = placesData.chains || [];
      stores = placesData.stores || [];
      userLoc = placesData.userLocation || { lat, lng };

      // キャッシュ保存
      localStorage.setItem(cacheKey, JSON.stringify({
        chains,
        stores,
        userLocation: userLoc,
        timestamp: Date.now()
      }));

      console.log('[Places API] 店舗情報を保存:', stores.length, '件');

      console.log(`[Places API] ${chains.length}チェーン見つかりました:`, chains);
    }

    // 5. 近隣チェーンがない場合でも全チェーンのメニューを取得（3つのコレクションから統合取得）
    let menuUrl;
    if (chains.length === 0) {
      console.warn('[Places API] 近くに対応店舗がありません - 全チェーンのメニューを表示します');
      // 全65チェーン店のメニューを取得（店舗なしとして表示）※コンビニ3店舗 + AI推計21店舗を含む
      const allChains = 'hottomotto,starbucks,tacobell,ikinari,sukiya,nakau,hanamaru,bikkuri,hokkahokka,yayoiken,wendys,olive,coco,origin,krispykreme,kfc,cocos,subway,saintmarc,joyful,jollypasta,matsu,zetteria,tullys,dennys,doutor,burgerking,bigboy,firstkitchen,freshness,mcdonalds,misterdonut,mos,royalhost,lotteria,yoshinoya,ootoya,tenya,kourakuen,matsunoya,matsuya,kamakura,ringerhut,torikizoku,seven,lawson,familymart,pronto,katsuya,kurasushi,hamazushi,gusto,saizeriya,sushiro,bamiyan,pepperlunch,kushikatsu,fujisoba,sato,yumean,osaka,hidakaya,rairaiken,goemon,kinniku,gindako,ginsara,gyoza';
      menuUrl = classification
        ? `/api/menus-unified?chains=${allChains}&classification=${encodeURIComponent(classification)}&limit=100&sources=official,convenience,ai_imputed&minConfidence=0`
        : `/api/menus-unified?chains=${allChains}&limit=100&sources=official,convenience,ai_imputed&minConfidence=0`;
    } else {
      // 6. メニューデータを取得（3つのコレクションから統合取得）
      // 近くにあるチェーンのメニューを取得
      menuUrl = classification
        ? `/api/menus-unified?chains=${chains.join(',')}&classification=${encodeURIComponent(classification)}&limit=100&sources=official,convenience,ai_imputed&minConfidence=0`
        : `/api/menus-unified?chains=${chains.join(',')}&limit=100&sources=official,convenience,ai_imputed&minConfidence=0`;
    }

    console.log('[メニュー取得] URL:', menuUrl);

    const menuRes = await fetch(menuUrl, { cache: 'no-store' });
    if (!menuRes.ok) {
      console.error('[メニュー取得] APIレスポンスエラー:', menuRes.status);
      return { menus: [], stores, userLocation: userLoc };
    }

    const data = await menuRes.json();

    // restaurantName → chainId の逆引きマップ
    const NAME_TO_CHAIN_ID = {
      'Hotto Motto': 'hottomotto',
      'STARBUCKS COFFEE': 'starbucks',
      'Taco Bell': 'tacobell',
      'いきなりステーキ': 'ikinari',
      'すき家': 'sukiya',
      'なか卯': 'nakau',
      'はなまるうどん': 'hanamaru',
      'びっくりドンキー': 'bikkuri',
      'ほっかほっか亭': 'hokkahokka',
      'やよい軒': 'yayoiken',
      'ウェンディーズ・ファーストキッチン': 'wendys',
      'オリーブの丘': 'olive',
      'カレーハウスCoCo壱番屋': 'coco',
      'キッチンオリジン': 'origin',
      'クリスピー・クリーム・ドーナツ　': 'krispykreme',
      'ケンタッキーフライドチキン': 'kfc',
      'ココス': 'cocos',
      'サブウェイ': 'subway',
      'サンマルクカフェ': 'saintmarc',
      'ジョイフル [Joyfull]': 'joyful',
      'ジョリーバスタ': 'jollypasta',
      'ステーキ屋松': 'matsu',
      'ゼッテリア': 'zetteria',
      'タリーズコーヒー': 'tullys',
      'デニーズ': 'dennys',
      'ドトールコーヒー': 'doutor',
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
      '天丼てんや': 'tenya',
      '幸楽苑': 'kourakuen',
      '松のや': 'matsunoya',
      '松屋': 'matsuya',
      '鎌倉パスタ': 'kamakura',
      '長崎ちゃんぽん リンガーハット': 'ringerhut',
      '鳥貴族': 'torikizoku',
      // コンビニ
      'セブン-イレブン': 'seven',
      'LAWSON': 'lawson',
      'ファミリーマート': 'familymart',
      // AI推計レストラン
      'PRONTO': 'pronto',
      'かつや': 'katsuya',
      'くら寿司': 'kurasushi',
      'はま寿司': 'hamazushi',
      'ガスト': 'gusto',
      'サイゼリヤ': 'saizeriya',
      'スシロー': 'sushiro',
      'バーミヤン': 'bamiyan',
      'ペッパーランチ': 'pepperlunch',
      '串カツ田中': 'kushikatsu',
      '名代 富士そば': 'fujisoba',
      '和食さと': 'sato',
      '夢庵': 'yumean',
      '大阪王将': 'osaka',
      '日高屋': 'hidakaya',
      '来来軒': 'rairaiken',
      '洋麺屋五右衛門': 'goemon',
      '筋肉食堂': 'kinniku',
      '築地銀だこ': 'gindako',
      '銀のさら': 'ginsara',
      '餃子の王将': 'gyoza',
    };

    // 統合APIのレスポンス形式に対応
    let menus = [];
    if (data.success && Array.isArray(data.menus)) {
      // 統合APIのデータを旧フォーマットに変換
      menus = data.menus.map(item => {
        const chainId = NAME_TO_CHAIN_ID[item.restaurant_chain] || '';
        if (!chainId && item.data_source === 'convenience') {
          console.warn('[メニュー取得] コンビニメニューのchainIdが空です:', item.restaurant_chain, 'マッピング:', NAME_TO_CHAIN_ID);
        }
        return {
          shop: item.restaurant_chain || '',
          menu: item.menu_item || '',
          category: item.category || '',
          calories: item.calories || 0,
          protein: item.protein || 0,
          fat: item.fat || 0,
          carbs: item.carbohydrates || 0,
          salt: item.sodium || 0,
          price: item.price || 0,
          data_source: item.data_source,
          confidence_score: item.confidence_score,
          id: item.id,
          source: item.collection,
          chainId: chainId, // chainIdを追加
        };
      });
      console.log(`[メニュー取得] 成功: ${data.total}件 (公式:${data.sources?.official || 0}, コンビニ:${data.sources?.convenience || 0}, AI推計:${data.sources?.ai_imputed || 0})`);
      console.log('[メニュー取得] 変換後のメニューサンプル:', menus.slice(0, 5));
      console.log('[メニュー取得] コンビニメニュー数:', menus.filter(m => m.data_source === 'convenience').length);
    } else if (Array.isArray(data)) {
      // 旧形式との互換性のため
      menus = data;
      console.log(`[メニュー取得] 成功: ${data.length}件`);
    } else {
      console.warn('[メニュー取得] データなし');
      return { menus: [], stores, userLocation: userLoc };
    }

    return { menus, stores, userLocation: userLoc };

  } catch (e) {
    console.error('[メニュー取得] エラー:', e);
    console.error('[メニュー取得] エラー詳細:', {
      code: e.code,
      message: e.message,
      name: e.name,
      stack: e.stack
    });

    // デバッグ情報を収集
    const debugInfo = {
      hasGeolocation: !!navigator.geolocation,
      isSecureContext: window.isSecureContext,
      protocol: window.location.protocol,
      hostname: window.location.hostname,
      userAgent: navigator.userAgent,
      permissions: null
    };

    // Permissions API が利用可能な場合、位置情報の許可状態を確認
    if (navigator.permissions) {
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
        debugInfo.permissions = permissionStatus.state; // 'granted', 'denied', 'prompt'
        console.log('[位置情報] 許可状態:', permissionStatus.state);
      } catch (permErr) {
        console.log('[位置情報] Permissions API利用不可:', permErr);
      }
    }

    console.log('[デバッグ情報]', debugInfo);

    // 位置情報は必須。取得できない場合はエラーメッセージを表示
    if (e.code === 1) {
      // ユーザーが位置情報を拒否した
      const userAgent = navigator.userAgent.toLowerCase();
      const isIOS = /iphone|ipad|ipod/.test(userAgent);
      const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);
      const isChrome = /chrome/.test(userAgent);

      let instructions = '🚨 位置情報へのアクセスが拒否されました\n\nこのアプリは近隣200m圏内のメニューを表示するため、位置情報が必須です。\n\n';

      // デバッグ情報を追加
      instructions += `【デバッグ情報】\n`;
      instructions += `・許可状態: ${debugInfo.permissions || '不明'}\n`;
      instructions += `・セキュアコンテキスト: ${debugInfo.isSecureContext ? 'はい' : 'いいえ'}\n`;
      instructions += `・プロトコル: ${debugInfo.protocol}\n`;
      instructions += `・ホスト名: ${debugInfo.hostname}\n\n`;

      if (!debugInfo.isSecureContext && debugInfo.protocol === 'http:') {
        instructions += '⚠️ HTTPSではない接続のため、位置情報が制限されている可能性があります。\n\n';
      }

      if (isIOS) {
        instructions += '【iPhoneでの確認手順】\n\n';
        instructions += '1️⃣ まず位置情報サービス全体がONか確認\n';
        instructions += '「設定」→「プライバシーとセキュリティ」→「位置情報サービス」→ ON（緑色）\n\n';

        if (isSafari) {
          instructions += '2️⃣ Safariの位置情報を許可\n';
          instructions += '「設定」→「Safari」→「位置情報」→「確認」または「このWebサイトの使用中」\n\n';
          instructions += '3️⃣ Safariを完全終了して再起動\n';
          instructions += 'ホームボタンをダブルタップ（またはスワイプアップ）→ Safariを上にスワイプして終了\n\n';
        } else if (isChrome) {
          instructions += '2️⃣ Chromeアプリの位置情報を許可\n';
          instructions += '「設定」→「Chrome」→「位置情報」→「このAppの使用中」\n\n';
          instructions += '3️⃣ Chromeを完全終了して再起動\n';
        } else {
          instructions += '2️⃣ ブラウザアプリの位置情報を許可\n';
          instructions += '「設定」→ お使いのブラウザ → 「位置情報」→「このAppの使用中」\n\n';
        }

        instructions += '4️⃣ ブラウザでこのページを再読み込み\n\n';
        instructions += '💡 それでもダメな場合:\n';
        instructions += '・iPhoneを再起動してみる\n';
        instructions += '・別のブラウザ（Chrome/Safari）を試す\n';
        instructions += '・「設定」→「Safari」→「履歴とWebサイトデータを消去」';
      } else {
        // Android or Desktop
        instructions += '【設定方法】\n';
        instructions += '1. ブラウザのアドレスバー左の鍵アイコンをタップ\n';
        instructions += '2. 「位置情報」を「許可」に変更\n';
        instructions += '3. ページを再読み込み\n\n';
        instructions += 'または:\n';
        instructions += '1. ブラウザの設定を開く\n';
        instructions += '2. サイトの設定 → 位置情報\n';
        instructions += '3. このサイトを「許可」に設定';
      }

      alert(instructions);
    } else if (e.code === 2) {
      // 位置情報が利用できない
      alert('🚨 位置情報が取得できませんでした\n\n【確認事項】\n・GPS/位置情報サービスが有効になっているか\n・機内モードになっていないか\n・Wi-Fiまたはモバイルデータ通信が有効か\n・屋内の場合、窓の近くに移動してみる\n\n【許可状態】' + (debugInfo.permissions || '不明') + '\n\n設定後、ページを再読み込みしてください。');
    } else if (e.code === 3) {
      // タイムアウト
      alert('⏱️ 位置情報の取得がタイムアウトしました\n\n【対処方法】\n・Wi-Fiまたはモバイルデータ通信を確認\n・GPS信号を受信できる場所に移動（窓の近くなど）\n・ページを再読み込みして再試行\n\nしばらく待ってからもう一度お試しください。');
    } else if (e.message?.includes('位置情報') || e.message?.includes('Geolocation')) {
      // その他の位置情報関連エラー
      alert('🚨 位置情報の取得に失敗しました\n\nエラー: ' + e.message + '\n\n【許可状態】' + (debugInfo.permissions || '不明') + '\n【プロトコル】' + debugInfo.protocol + '\n【ホスト名】' + debugInfo.hostname + '\n\nページを再読み込みして再試行してください。');
    }

    return { menus: [], stores: [], userLocation: null };
  }
}

// デフォルトはlocationベース
const fetchMenuData = fetchMenuDataByLocation;


/* =========================
   メインページ
========================= */
export default function Page() {
  const restaurantList = [
    "ケンタッキーフライドチキン",
    "なか卯",
    "カレーハウスCoCo壱番屋",
    "ジョイフル [Joyfull]",
    "すき家",
    "モスバーガー",
    "長崎ちゃんぽん リンガーハット",
    "吉野家",
    "松屋",
    "鳥貴族",
    "マクドナルド",
    "Hotto Motto",
    "いきなりステーキ",
    "ロイヤルホスト",
    "デニーズ",
    "びっくりドンキー",
    "ステーキ屋松",
    "バーガーキング",
    "ミスタードーナツ",
    "ドトールコーヒー",
    "やよい軒",
    "松のや",
    "大戸屋",
    "サブウェイ",
    "Taco Bell",
    "天丼てんや",
    "STARBUCKS COFFEE",
    "ほっかほっか亭",
    "タリーズコーヒー",
    "サンマルクカフェ",
    "ジョリーパスタ",
    "鎌倉パスタ",
    "ビッグボーイ",
    "ロッテリア",
    "ウェンディーズ・ファーストキッチン",
    "フレッシュネスバーガー",
    "ファーストキッチン",
    "クリスピー・クリーム・ドーナツ",
    "ココス",
    "ゼッテリア",
    "幸楽苑",
    "はなまるうどん"
  ];

  // プロフィール
  const [birthYear, setBirthYear] = useState('2000');
  const [birthMonth, setBirthMonth] = useState('1');
  const [birthDay, setBirthDay] = useState('1');
  const [gender, setGender] = useState('male');
  const [height, setHeight] = useState('170');
  const [weight, setWeight] = useState('65'); // 65kgを初期値に
  const [exerciseFrequency, setExerciseFrequency] = useState('ほとんど運動しない'); // 必須・4択（デフォルト選択）
  const [exerciseTypesList, setExerciseTypesList] = useState(['筋トレ','ヨガ','ランニング','ピラティス']);
  const [selectedExerciseTypes, setSelectedExerciseTypes] = useState([]);
  const [diseasesList, setDiseasesList] = useState(['糖尿病','高血圧','脂質異常症','腎臓病','心臓病']);
  const [selectedDiseases, setSelectedDiseases] = useState([]);
  const [goal, setGoal] = useState('');       // 'diet' | 'bulk'

  // 画面
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [currentSection, setCurrentSection] = useState('logo-zoom'); // 'logo-zoom'|'terms'|'profile'|'mode-select'|'home'|'goal-select'|'loading'|'shop-select'|'results'|'menu-detail'|'directions'|'nutrition-detail'
  const [mode, setMode] = useState(''); // 'slim'|'keep'|'bulk'
  const [isClient, setIsClient] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [showTargetSettings, setShowTargetSettings] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false); // カレンダー表示フラグ
  const [selectedStore, setSelectedStore] = useState(null); // 経路案内用の選択された店舗
  const [showModeDescription, setShowModeDescription] = useState(null); // 'slim'|'keep'|'bulk'|null
  const [isLongPress, setIsLongPress] = useState(false); // 長押しフラグ

  // 位置情報
  const [allowLocation, setAllowLocation] = useState(true);
  const [userLocation, setUserLocation] = useState(null);
  const [nearbyStores, setNearbyStores] = useState([]); // 近隣店舗情報（地図表示用）

  // ハイライト
  const [highlightedShop, setHighlightedShop] = useState(null);

  // データ
  const [menuData, setMenuData] = useState([]);
  const [scoredMenus, setScoredMenus] = useState([]);
  const [selectedShop, setSelectedShop] = useState('');
  const [selectedMenu, setSelectedMenu] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [currentGoal, setCurrentGoal] = useState('stay');
  const [accumulatedRequests, setAccumulatedRequests] = useState([]);
  const [displayCount, setDisplayCount] = useState(5); // 表示件数（初期値は5）
  const [sortType, setSortType] = useState('protein-efficiency'); // 'protein-efficiency' | 'calories-low' | 'calories-high' | 'protein-high'
  const [filterCategory, setFilterCategory] = useState('all'); // 'all' | 'main' | 'side' | 'drink'
  const [showFilterModal, setShowFilterModal] = useState(false); // フィルターモーダル表示状態

  // フィルタ
  const [gradeFilter, setGradeFilter] = useState('ALL'); // 'ALL'|'S'|'A'|'B'|'C'|'D'
  const [shopGenreFilter, setShopGenreFilter] = useState('ALL'); // 'ALL' | ジャンル名
  const [shopCategoryFilter, setShopCategoryFilter] = useState('ALL'); // 'ALL' | カテゴリ名
  const [shopSearchQuery, setShopSearchQuery] = useState(''); // 店名フリーワード検索
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'map'

  // Gemini カメラ機能
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [geminiRecommendation, setGeminiRecommendation] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanningInterval, setScanningInterval] = useState(null);
  const [detectedMenuNames, setDetectedMenuNames] = useState([]);
  const [countdown, setCountdown] = useState(null); // Adobe Scan風カウントダウン (3, 2, 1)
  const [countdownTimer, setCountdownTimer] = useState(null);
  const isMenuDetectedRef = useRef(false); // 検出済みフラグ（再レンダリング防止のためuseRef使用）

  // 新機能: 栄養トラッキング、お気に入り、履歴
  const [todayNutrition, setTodayNutrition] = useState({
    date: new Date().toISOString().split('T')[0],
    meals: [],
    totalCalories: 0,
    totalProtein: 0,
    totalFat: 0,
    totalCarbs: 0
  });
  const [favorites, setFavorites] = useState([]); // menuIdの配列
  const [history, setHistory] = useState([]); // 最近選んだメニュー

  // 食事履歴ページ用の選択日付
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [showManualInputModal, setShowManualInputModal] = useState(false);
  const [manualInput, setManualInput] = useState({
    menu: '',
    shop: '',
    calories: '',
    protein: '',
    fat: '',
    carbs: ''
  });

  // コンテキストからauth情報を取得
  const { user, loading } = useAuth();


  useEffect(() => { setIsClient(true); }, []);

  // auth情報をユーザープロフィールに反映
  useEffect(() => {
    if (loading) {
      setCurrentSection('loading');
      return;
    }

    if (user) {
      // ログイン済み
      // APIからプロフィールを取得して反映
      fetch(`/api/profile?userId=${user.uid}`)
        .then(res => res.json())
        .then(data => {
        if (data.success && data.profile) {
          setUserProfile(data.profile); //プロフィールオブジェクトをセット
          // Firestoreのプロフィール情報を各フィールドに反映
          setBirthYear(data.profile.birthYear || '2000');
          setBirthMonth(data.profile.birthMonth || '1');
          setBirthDay(data.profile.birthDay || '1');
          setGender(data.profile.gender || 'male');
          setHeight(data.profile.height || '170');
          setWeight(data.profile.weight || '65');
          setExerciseFrequency(data.profile.exerciseFrequency || 'ほとんど運動しない');
          setSelectedExerciseTypes(data.profile.exerciseTypes || []);
          // プロフィールが埋まっているかを確認し、不十分ならプロフィール入力へ誘導
          if (!data.profile.birthYear || !data.profile.height || !data.profile.weight || !data.profile.gender || !data.profile.birthYear) {
            setShowProfileForm(true);
            setCurrentSection('profile');
          } else { // プロフィールが埋まっていればモード選択へ
            setShowProfileForm(false);
            setCurrentSection('mode-select');
          }
        } else {
          // プロフィールがない場合、プロフィール入力へ誘導
          setShowProfileForm(true);
          setCurrentSection('profile');
        }
      });
    } else {
      // 未ログイン
      setUserProfile(null);
      setCurrentSection('logo-zoom');
    }
  }, [user, loading]); // このeffectはuserまたはloadingの変更時に実行


  // 新機能: localStorageから読み込み
  useEffect(() => {
    if (!isClient) return;
    try {
      // 今日の栄養データを読み込み
      const savedNutrition = JSON.parse(localStorage.getItem('todayNutrition') || 'null');
      const today = new Date().toISOString().split('T')[0];
      if (savedNutrition && savedNutrition.date === today) {
        setTodayNutrition(savedNutrition);
      }

      // お気に入りを読み込み
      const savedFavorites = JSON.parse(localStorage.getItem('favorites') || '[]');
      setFavorites(savedFavorites);

      // 履歴を読み込み（過去7日分のみ保持）
      const savedHistory = JSON.parse(localStorage.getItem('menuHistory') || '[]');
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const recentHistory = savedHistory.filter(h => h.timestamp > sevenDaysAgo);
      setHistory(recentHistory);
    } catch (e) {
      console.error('データ読み込みエラー:', e);
    }
  }, [isClient]);

  // 新機能: localStorageに保存
  useEffect(() => {
    if (!isClient) return;
    localStorage.setItem('todayNutrition', JSON.stringify(todayNutrition));
  }, [todayNutrition, isClient]);

  useEffect(() => {
    if (!isClient) return;
    localStorage.setItem('favorites', JSON.stringify(favorites));
  }, [favorites, isClient]);

  useEffect(() => {
    if (!isClient) return;
    localStorage.setItem('menuHistory', JSON.stringify(history));
  }, [history, isClient]);
  useEffect(() => {
    if (!isClient) return;
      fetchMenuData().then(result => {
      const data = result.menus || [];
      console.log('[FETCH OK] rows:', data.length);
          setMenuData(data);
      setNearbyStores(result.stores || []);
      setUserLocation(result.userLocation || null);
      if (data.length === 0) alert('データの取得に失敗しました。インターネット接続をご確認ください。');
    });
  }, [isClient]);

  // ページ遷移時にスクロール位置をリセット（特に shop-select -> results）
  useEffect(() => {
    if (!isClient) return;
    if (currentSection === 'results') {
      try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch {}
    }
  }, [currentSection, isClient]);

  const [isZooming, setIsZooming] = useState(false);

  // 新機能: メニューを今日の食事に追加
  const addMealToToday = (menu) => {
    const today = new Date().toISOString().split('T')[0];
    const meal = {
      id: menu.id,
      shop: menu.shop,
      menu: menu.menu,
      calories: menu.calories || 0,
      protein: menu.protein || 0,
      fat: menu.fat || 0,
      carbs: menu.carbs || 0,
      timestamp: Date.now()
    };

    setTodayNutrition(prev => {
      // 日付が変わっていたらリセット
      if (prev.date !== today) {
        return {
          date: today,
          meals: [meal],
          totalCalories: meal.calories,
          totalProtein: meal.protein,
          totalFat: meal.fat,
          totalCarbs: meal.carbs
        };
      }

      // 同じメニューを追加
      return {
        ...prev,
        meals: [...prev.meals, meal],
        totalCalories: prev.totalCalories + meal.calories,
        totalProtein: prev.totalProtein + meal.protein,
        totalFat: prev.totalFat + meal.fat,
        totalCarbs: prev.totalCarbs + meal.carbs
      };
    });

    // 履歴にも追加
    setHistory(prev => [meal, ...prev].slice(0, 50)); // 最新50件まで保持
  };

  // 新機能: お気に入りに追加/削除
  const toggleFavorite = (menuId) => {
    setFavorites(prev => {
      if (prev.includes(menuId)) {
        return prev.filter(id => id !== menuId);
      } else {
        return [...prev, menuId];
      }
    });
  };

  // 新機能: 今日の食事から削除
  const removeMealFromToday = (index) => {
    setTodayNutrition(prev => {
      const newMeals = [...prev.meals];
      const removed = newMeals.splice(index, 1)[0];

      return {
        ...prev,
        meals: newMeals,
        totalCalories: Math.max(0, prev.totalCalories - removed.calories),
        totalProtein: Math.max(0, prev.totalProtein - removed.protein),
        totalFat: Math.max(0, prev.totalFat - removed.fat),
        totalCarbs: Math.max(0, prev.totalCarbs - removed.carbs)
      };
    });
  };

  // 日付切り替え関数
  const changeDateBy = (days) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };

  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekday = weekdays[date.getDay()];

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return `${month}/${day}（${weekday}）`;
    } else if (date < yesterday) {
      // 昨日より以前は年を表示
      return `${year}/${month}/${day}（${weekday}）`;
    } else {
      // 昨日は年なしで表示
      return `${month}/${day}（${weekday}）`;
    }
  };

  // 今日かどうかチェック
  const isSelectedDateToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  // 日付が今日以降かチェック（時刻を無視して日付のみ比較）
  const isTodayOrFuture = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);
    return compareDate >= today;
  };

  // 選択された日付の栄養データを取得
  const getSelectedDateNutrition = () => {
    const dateStr = selectedDate.toISOString().split('T')[0];

    // 今日の場合は todayNutrition を返す
    if (dateStr === new Date().toISOString().split('T')[0]) {
      return todayNutrition;
    }

    // 過去の日付の場合は localStorage から取得
    try {
      const savedData = localStorage.getItem(`nutrition_${dateStr}`);
      if (savedData) {
        return JSON.parse(savedData);
      }
    } catch (e) {
      console.error('Error loading nutrition data:', e);
    }

    // データがない場合は空のデータを返す
    return {
      date: dateStr,
      meals: [],
      totalCalories: 0,
      totalProtein: 0,
      totalFat: 0,
      totalCarbs: 0
    };
  };

  // 1日の目標摂取量を計算
  const calculateDailyIntake = () => {
    if (!userProfile) return null;

    const { height, weight, gender, exerciseFrequency, goal } = userProfile;

    // 年齢を計算
    const today = new Date();
    const birthDate = new Date(birthYear, birthMonth - 1, birthDay);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    // 基礎代謝量（BMR）をHarris-Benedict式で計算
    let bmr;
    if (gender === 'male') {
      bmr = 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age);
    } else {
      bmr = 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age);
    }

    // 活動レベル係数
    const activityMultiplier = {
      none: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9
    };

    // TDEE（総消費カロリー）
    const tdee = bmr * (activityMultiplier[exerciseFrequency] || 1.2);

    // 目標に応じた摂取カロリー
    let targetCalories;
    if (goal === 'diet') {
      targetCalories = tdee - 500; // 減量: -500kcal
    } else if (goal === 'bulk') {
      targetCalories = tdee + 300; // 増量: +300kcal
    } else {
      targetCalories = tdee; // 維持
    }

    // PFCバランス（タンパク質、脂質、炭水化物）
    const proteinGrams = weight * (goal === 'bulk' ? 2.0 : 1.6); // 体重×1.6-2.0g
    const fatGrams = (targetCalories * 0.25) / 9; // 総カロリーの25%を脂質から
    const carbsGrams = (targetCalories - (proteinGrams * 4 + fatGrams * 9)) / 4; // 残りを炭水化物で

    return {
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      targetCalories: Math.round(targetCalories),
      protein: Math.round(proteinGrams),
      fat: Math.round(fatGrams),
      carbs: Math.round(carbsGrams)
    };
  };

  const handleLogin = () => {
    setIsZooming(true);
    setTimeout(() => {
      setCurrentSection('logo-zoom');
      setIsZooming(false);
    }, 1000);
  };


  const handleSearch = async () => {
    // 保存前にログイン済みか確認
    if (!user) {
      alert('プロフィールを保存するにはログインが必要です。');
      return;
    }

    if (!birthYear || !birthMonth || !birthDay || !gender || !height || !weight) {
      alert('すべての項目を入力してください。');
      return;
    }

    if (!allowLocation) {
      alert('位置情報の共有に同意してください。このアプリは近隣200m圏内のメニューを表示するため、位置情報が必須です。');
      return;
    }

    // プロフィールデータを準備
    const profileData = {
      birthYear,
      birthMonth,
      birthDay,
      gender,
      height: parseFloat(height),
      weight: parseFloat(weight),
      exerciseFrequency,
      exerciseTypes: selectedExerciseTypes,
      diseases: selectedDiseases,
      userId: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL
    };

    // ローカルストレージからuserIdを取得（既存ユーザーの場合）
    let userId = null;
    try {
      const saved = JSON.parse(localStorage.getItem('nutrition_profile') || '{}');
      userId = saved.userId;
    } catch {}

    if (userId) {
      profileData.userId = userId;
    }

    // 位置情報の同意を得たので、即座に位置情報を取得
    console.log('[プロフィール登録] 位置情報の取得を開始します...');
    try {
      const locationResult = await fetchMenuData();
      setMenuData(locationResult.menus || []);
      setNearbyStores(locationResult.stores || []);
      setUserLocation(locationResult.userLocation || null);
      console.log('[プロフィール登録] 位置情報取得成功:', locationResult.userLocation);
    } catch (error) {
      console.error('[プロフィール登録] 位置情報取得エラー:', error);
      // 位置情報が取得できない場合は処理を中断
      alert('位置情報の取得に失敗しました。位置情報を許可してからもう一度お試しください。');
      return;
    }

    // Firestoreに保存
    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData)
      });

      const result = await response.json();

      if (result.success) {
        // userIdをローカルストレージに保存
        const savedProfile = {
          ...profileData,
          userId: result.userId
        };
        localStorage.setItem('nutrition_profile', JSON.stringify(savedProfile));

        // 保存成功をコンソールに表示
        console.log('✅ プロフィールがFirestoreに保存されました');
        console.log('User ID:', result.userId);
        console.log('保存データ:', profileData);

        // プロフィール入力の次はMode選択画面へ
        setShowProfileForm(false);
        setCurrentSection('mode-select');
      } else {
        console.error('❌ 保存失敗:', result.error);
        alert('プロフィールの保存に失敗しました: ' + result.error);
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('プロフィールの保存中にエラーが発生しました。');
    }
  };

  const handleBack = () => {
    if (currentSection === 'terms') setCurrentSection('login');
    else if (currentSection === 'profile') { setShowProfileForm(false); setCurrentSection('login'); }
    else if (currentSection === 'mode-select') { setShowProfileForm(true); setCurrentSection('profile'); }
    else if (currentSection === 'home') { setCurrentSection('mode-select'); }
    else if (currentSection === 'shop-select') { setCurrentSection('home'); }
    else if (currentSection === 'results') setCurrentSection('shop-select');
    else if (currentSection === 'menu-detail') { setCurrentSection('shop-select'); setSelectedMenu(null); setSelectedStore(null); }
    else if (currentSection === 'nutrition-detail') setCurrentSection('home');
  };

  const handleMenuClick = (menu) => {
    console.log('[handleMenuClick] ===== START =====');
    console.log('[handleMenuClick] Clicked menu:', menu);
    console.log('[handleMenuClick] menu.chainId:', menu?.chainId);
    console.log('[handleMenuClick] nearbyStores:', nearbyStores);

    setSelectedMenu(menu);

    // メニュー選択時に対応する店舗も保存
    const store = findStoreForMenu(menu);
    console.log('[handleMenuClick] Found store:', store);

    setSelectedStore(store);
    setCurrentSection('menu-detail');
    console.log('[handleMenuClick] ===== END =====');
  };

  // メニューのchainIdから該当する店舗を見つける
  const findStoreForMenu = (menuItem) => {
    console.log('[DEBUG findStoreForMenu] ===== START =====');
    console.log('[DEBUG findStoreForMenu] menuItem:', menuItem);
    console.log('[DEBUG findStoreForMenu] menuItem.menu:', menuItem?.menu);
    console.log('[DEBUG findStoreForMenu] menuItem.chainId:', menuItem?.chainId);
    console.log('[DEBUG findStoreForMenu] menuItem.shop:', menuItem?.shop);

    if (!nearbyStores || nearbyStores.length === 0) {
      console.log('[DEBUG findStoreForMenu] nearbyStores is empty or null');
      console.log('[DEBUG findStoreForMenu] nearbyStores:', nearbyStores);
      return null;
    }

    console.log('[DEBUG findStoreForMenu] nearbyStores count:', nearbyStores.length);
    console.log('[DEBUG findStoreForMenu] nearbyStores:', nearbyStores.map(s => ({ name: s.name, chainId: s.chainId })));

    if (!menuItem || !menuItem.chainId) {
      console.warn('[DEBUG findStoreForMenu] menuItem or chainId is missing');
      return null;
    }

    // menuItemのchainIdと一致する店舗を探す
    const store = nearbyStores.find(s => s.chainId === menuItem.chainId);

    if (store) {
      console.log(`[DEBUG findStoreForMenu] ✓ Match found: menu chainId=${menuItem.chainId} <-> store ${store.name} (${store.chainId})`);
    } else {
      console.warn(`[DEBUG findStoreForMenu] ✗ No store found for menu chainId=${menuItem.chainId}, shop=${menuItem.shop}`);
      console.warn('[DEBUG findStoreForMenu] Available chainIds:', nearbyStores.map(s => s.chainId).join(', '));
    }

    console.log('[DEBUG findStoreForMenu] ===== END =====');
    return store;
  };

  // 目的選択時の共通処理
  const handleGoalSelection = async (goalType, classificationName) => {
    setGoal(goalType);
    const profile = { birthYear, birthMonth, birthDay, gender, height: parseFloat(height), weight: parseFloat(weight), exerciseFrequency, exerciseTypes: selectedExerciseTypes, diseases: selectedDiseases, goal: goalType };
    setUserProfile(profile);

    // 表示件数をリセット
    setDisplayCount(5);

    // ローディング画面へ移行
    setCurrentSection('loading');
    setLoadingProgress(0);

    // プログレスバーアニメーション（スムーズに）
    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 2.5;
      });
    }, 300);

    // メニュー取得
    const result = await fetchMenuData(classificationName);
    setMenuData(result.menus || []);
    setNearbyStores(result.stores || []);
    setUserLocation(result.userLocation || null);
    requestLocationIfAllowed();

    // 100%完了
    setLoadingProgress(100);
    clearInterval(progressInterval);

    // 少し待ってから画面遷移
    setTimeout(() => {
      setCurrentSection('shop-select');
    }, 500);
  };

  /* ============ 判定・整形（核心） ============ */
  // 各分類に最適なメニューをスコアリングして上位10件を取得
  const calculateMenuScore = (menu, classification) => {
    const cal = menu.calories || 0;
    const protein = menu.protein || 0;
    const fat = menu.fat || 0;
    const carbs = menu.carbs || 0;

    switch (classification) {
      case '減量':
        // カロリーが低く、タンパク質が高く、脂質が低いものを優先
        // スコア = タンパク質効率 - 脂質ペナルティ
        if (cal === 0) return 0;
        return (protein / cal) * 1000 - (fat / 10);

      case '現状維持':
        // バランスが良いものを優先（理想的なPFCバランスに近いもの）
        // 理想比率: P:F:C = 15%:25%:60% (カロリーベース)
        if (cal === 0) return 0;
        const pCal = protein * 4;
        const fCal = fat * 9;
        const cCal = carbs * 4;
        const totalMacro = pCal + fCal + cCal;
        if (totalMacro === 0) return 0;

        const pRatio = pCal / totalMacro;
        const fRatio = fCal / totalMacro;
        const cRatio = cCal / totalMacro;

        // 理想との差分を計算（差が小さいほど高得点）
        const pDiff = Math.abs(pRatio - 0.15);
        const fDiff = Math.abs(fRatio - 0.25);
        const cDiff = Math.abs(cRatio - 0.60);
        const balanceScore = 100 - (pDiff + fDiff + cDiff) * 100;

        // カロリーが適正範囲（500-750）に近いほど高得点
        const calScore = cal >= 500 && cal <= 750 ? 50 : 50 - Math.abs(cal - 625) / 10;

        return balanceScore + calScore;

      case 'バルクアップ':
        // タンパク質が高く、カロリーも十分にあるものを優先
        // 脂質は抑えめが理想
        return protein * 2 + (cal / 10) - (fat / 5);

      case 'チート':
        // カロリーが高いものを優先
        return cal;

      default:
        return 0;
    }
  };

  const buildResults = (list, profile) => {
    const classification = profile?.goal === 'diet' ? '減量' :
                          profile?.goal === 'stay' ? '現状維持' :
                          profile?.goal === 'bulk' ? 'バルクアップ' :
                          currentGoal === 'diet' ? '減量' :
                          currentGoal === 'stay' ? '現状維持' :
                          currentGoal === 'bulk' ? 'バルクアップ' : '現状維持';

    // 各メニューにスコアを付与
    const scored = list.map(menu => ({
      ...menu,
      score: calculateMenuScore(menu, classification)
    }));

    // スコアの高い順にソート（全件返す）
    const sortedMenus = scored.sort((a, b) => b.score - a.score);

    console.log(`[buildResults] 分類: ${classification}, 対象メニュー数: ${list.length}, ソート完了`);
    if (sortedMenus.length > 0) {
      console.log('[buildResults] Top3メニュー:', sortedMenus.slice(0, 3).map(m => ({
        shop: m.shop,
        menu: m.menu,
        score: m.score.toFixed(2),
        cal: m.calories,
        protein: m.protein,
        fat: m.fat
      })));
    }

    return sortedMenus;
  };

  // 位置情報取得関数（目的選択時に呼ばれる）
  const requestLocationIfAllowed = () => {
    if (!allowLocation) {
      console.log('位置情報の共有が許可されていません');
      return;
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserLocation(location);
          console.log('位置情報取得成功:', location);
        },
        (error) => {
          console.error('位置情報取得エラー:', error);
        }
      );
    }
  };

  // 連続スキャン機能
  const startContinuousScanning = () => {
    setIsScanning(true);
    isMenuDetectedRef.current = false; // 検出フラグをリセット

    // 1.5秒ごとにスキャンを実行（ちらつき防止のため間隔を長く）
    const interval = setInterval(async () => {
      await scanMenuFromCamera();
    }, 1500);

    setScanningInterval(interval);
  };

  const stopContinuousScanning = () => {
    if (scanningInterval) {
      clearInterval(scanningInterval);
      setScanningInterval(null);
    }
    setIsScanning(false);
    setDetectedMenuNames([]);
    isMenuDetectedRef.current = false; // 検出フラグもリセット
  };

  // Adobe Scan風: カウントダウン後に自動スクリーンショット＆分析
  const startAutoCaptureCountdown = () => {
    // 既存のカウントダウンタイマーがあればクリア
    if (countdownTimer) {
      clearInterval(countdownTimer);
    }

    // 3秒からカウントダウン開始
    let count = 3;
    setCountdown(count);

    const timer = setInterval(() => {
      count--;
      if (count > 0) {
        setCountdown(count);
      } else {
        // カウントダウン終了 -> スクリーンショット撮影
        clearInterval(timer);
        setCountdownTimer(null);
        setCountdown(null);

        console.log('[Countdown] Finished! Taking screenshot...');
        captureAndAnalyzeMenu();
      }
    }, 1000);

    setCountdownTimer(timer);
  };

  // スクリーンショット撮影＆メニュー分析
  const captureAndAnalyzeMenu = async () => {
    const video = document.querySelector('#gemini-camera-video');
    if (!video) {
      console.error('[Capture] Video element not found');
      return;
    }

    try {
      console.log('[Capture] Taking screenshot...');

      // カメラ映像からスクリーンショット撮影
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      const screenshotData = canvas.toDataURL('image/jpeg', 0.9);

      console.log('[Capture] Screenshot captured! Size:', screenshotData.length);

      // スクリーンショットを保存
      setCapturedImage(screenshotData);

      // カメラを停止
      stopCamera();
      setShowCamera(false);

      // Gemini APIでメニュー分析開始
      setIsAnalyzing(true);

      const modeText = convertModeToJapanese(userProfile?.goal || currentGoal);

      const response = await fetch('/api/gemini-menu-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: screenshotData,
          userMode: modeText,
          continuousMode: false  // 通常モード: 1メニュー選定
        })
      });

      const data = await response.json();

      if (data.success) {
        setGeminiRecommendation(data.recommendation);
        console.log('[Analysis] Menu recommendation:', data.recommendation);
      } else {
        throw new Error(data.error || 'Analysis failed');
      }
    } catch (error) {
      console.error('[Capture] Error:', error);
      alert(`分析に失敗しました: ${error.message}`);
    } finally {
      setIsAnalyzing(false);
      setDetectedMenuNames([]);
    }
  };

  // カウントダウンキャンセル
  const cancelCountdown = () => {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      setCountdownTimer(null);
    }
    setCountdown(null);
    setDetectedMenuNames([]);
    startContinuousScanning(); // 再スキャン開始
  };

  // ユーザーモードを日本語に変換するヘルパー関数
  const convertModeToJapanese = (mode) => {
    if (mode === 'diet' || mode === '減量') return '減量';
    if (mode === 'stay' || mode === '現状維持') return '現状維持';
    if (mode === 'bulk' || mode === 'バルクアップ') return 'バルクアップ';
    return '健康的な食事';
  };

  const scanMenuFromCamera = async () => {
    // 既に検出済みの場合はスキップ（重複setState防止 - useRefで再レンダリングなし）
    if (isMenuDetectedRef.current) {
      return;
    }

    const video = document.querySelector('#gemini-camera-video');
    if (!video || !video.videoWidth || !video.videoHeight) {
      return; // 静かに終了（ログ不要）
    }

    try {
      // 高速化: 画像を1/2サイズに縮小して転送
      const targetWidth = Math.floor(video.videoWidth / 2);
      const targetHeight = Math.floor(video.videoHeight / 2);

      // カメラ映像をキャプチャ（検出用: 縮小＆低画質で高速化）
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
      const imageData = canvas.toDataURL('image/jpeg', 0.5);  // JPEG 50%で高速化

      // ユーザーモードを日本語に変換
      const modeText = convertModeToJapanese(userProfile?.goal || currentGoal);

      // 段階1: メニュー表が映っているか簡易チェック（バックグラウンドで静かに実行）
      const response = await fetch('/api/gemini-menu-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageData,
          userMode: modeText,
          continuousMode: true
        })
      });

      const data = await response.json();

      if (data.success && data.recommendation && data.recommendation.detectedMenus) {
        const menus = data.recommendation.detectedMenus;

        // 信頼度が高く、メニューが検出された場合
        if (menus.length > 0 && data.recommendation.confidence >= 0.8) {
          console.log('✓ メニュー表を検出しました');
          isMenuDetectedRef.current = true; // 検出フラグを立てる（これ以降スキャンしない・再レンダリングなし）
          setDetectedMenuNames(['メニュー表']); // UI用: 緑枠表示のため
          stopContinuousScanning(); // スキャン停止

          // Adobe Scan風: 3秒カウントダウン後に自動スクリーンショット
          startAutoCaptureCountdown();
        }
      }
    } catch (error) {
      // エラーも静かに処理（連続スキャン中のエラーは無視）
    }
  };

  // 段階3: 検出されたメニューから最適な1品を選択（自動実行版）
  const selectBestMenuAuto = async (menus) => {
    if (!menus || menus.length === 0) return;

    try {
      console.log('[Stage 3] Auto-selecting best menu from:', menus);
      setIsAnalyzing(true); // ローディング表示

      // ユーザーモードを日本語に変換
      const modeText = convertModeToJapanese(userProfile?.goal || currentGoal);

      // ダミー画像（空白の1x1ピクセル）を送信（APIの互換性のため）
      const dummyImage = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARC AAEAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCjgA//2Q==';

      const response = await fetch('/api/gemini-menu-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: dummyImage,
          userMode: modeText,
          continuousMode: false,
          detectedMenus: menus
        })
      });

      const data = await response.json();

      if (data.success && data.recommendation) {
        console.log('[Stage 3] Best menu recommendation:', data.recommendation);
        setGeminiRecommendation(data.recommendation);
        stopCamera(); // カメラ停止
        setShowCamera(false); // カメラ画面を閉じる
      }
    } catch (error) {
      console.error('[Stage 3] Error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 段階3: 検出されたメニューから最適な1品を選択（手動実行版・互換性のため残す）
  const selectBestMenu = async () => {
    if (detectedMenuNames.length === 0) return;

    try {
      console.log('[Stage 3] Selecting best menu from:', detectedMenuNames);

      // ユーザーモードを日本語に変換
      const modeText = convertModeToJapanese(userProfile?.goal || currentGoal);

      // ダミー画像（空白の1x1ピクセル）を送信（APIの互換性のため）
      const dummyImage = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARC AAEAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCjgA//2Q==';

      const response = await fetch('/api/gemini-menu-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: dummyImage,
          userMode: modeText,
          continuousMode: false,
          detectedMenus: detectedMenuNames
        })
      });

      const data = await response.json();

      if (data.success && data.recommendation) {
        console.log('[Stage 3] Best menu selected:', data.recommendation);
        setGeminiRecommendation(data.recommendation);
        stopCamera(); // カメラ停止
      }
    } catch (error) {
      console.error('[Stage 3] Error:', error);
    }
  };

  // Gemini カメラ機能
  const startCamera = async () => {
    try {
      console.log('[Camera] Checking camera access...');

      // カメラアクセスの確認
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('お使いのブラウザはカメラに対応していません');
      }

      console.log('[Camera] Requesting camera permission...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // 背面カメラを優先
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });

      console.log('[Camera] Camera stream obtained:', stream);
      setCameraStream(stream);
      setShowCamera(true);
      setCapturedImage(null);
      setGeminiRecommendation(null);

      // ビデオのメタデータが読み込まれるまで待ってからスキャン開始
      setTimeout(() => {
        const video = document.querySelector('#gemini-camera-video');
        if (video) {
          video.addEventListener('loadedmetadata', () => {
            console.log('[Camera] Video metadata loaded, starting scan');
            startContinuousScanning();
          }, { once: true });

          // メタデータがすでに読み込まれている場合
          if (video.videoWidth > 0) {
            console.log('[Camera] Video already ready, starting scan');
            startContinuousScanning();
          }
        }
      }, 500);
    } catch (error) {
      console.error('[Camera] Failed to start camera:', error);
      console.error('[Camera] Error name:', error.name);
      console.error('[Camera] Error message:', error.message);

      let errorMessage = 'カメラの起動に失敗しました。\n\n';

      if (error.name === 'NotAllowedError') {
        errorMessage += 'カメラの許可が拒否されています。\nブラウザの設定からカメラへのアクセスを許可してください。';
      } else if (error.name === 'NotFoundError') {
        errorMessage += 'カメラが見つかりません。\nデバイスにカメラが接続されているか確認してください。';
      } else if (error.name === 'NotReadableError') {
        errorMessage += 'カメラが使用中です。\n他のアプリでカメラを使用していないか確認してください。';
      } else if (error.name === 'SecurityError') {
        errorMessage += 'セキュリティエラー。\nHTTPS接続が必要です。';
      } else {
        errorMessage += `エラー: ${error.message}`;
      }

      alert(errorMessage);
    }
  };

  const stopCamera = () => {
    stopContinuousScanning();
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setShowCamera(false);
  };

  const captureImage = async () => {
    const video = document.querySelector('#gemini-camera-video');
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    setCapturedImage(imageData);
    stopCamera();

    // Gemini APIで画像を分析
    await analyzeMenuWithGemini(imageData);
  };

  const analyzeMenuWithGemini = async (imageData) => {
    setIsAnalyzing(true);
    try {
      // ユーザーモードを日本語に変換
      const modeText = convertModeToJapanese(userProfile?.goal || currentGoal);

      console.log('[Gemini] Analyzing image with user mode:', modeText);

      const response = await fetch('/api/gemini-menu-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageData,
          userMode: modeText
        })
      });

      const data = await response.json();

      if (data.success) {
        setGeminiRecommendation(data.recommendation);
        console.log('[Gemini] Recommendation:', data.recommendation);
      } else {
        throw new Error(data.error || 'Analysis failed');
      }
    } catch (error) {
      console.error('[Gemini] Error analyzing menu:', error);
      alert('メニュー分析に失敗しました。もう一度お試しください。');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    setGeminiRecommendation(null);
    startCamera();
  };

  const styles = {
    container: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100vw',
      height: '100vh',
      background: 'white',
      padding: 0,
      margin: 0,
      overflow: 'auto',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      boxSizing: 'border-box'
    },
    card: {
      width: '100%',
      height: '100%',
      margin: 0,
      background: 'white',
      borderRadius: 0,
      padding: 20,
      boxShadow: 'none',
      position: 'relative',
      minHeight: '100vh',
      boxSizing: 'border-box'
    },
    title: { fontSize: 32, textAlign: 'center', marginBottom: 20, color: '#333' },
    button: {
      display: 'block', width: '100%', maxWidth: 300, margin: '20px auto', padding: '15px 30px',
      background: '#000',
      color: 'white', border: 'none', borderRadius: 10, fontSize: 16, cursor: 'pointer',
      transition: 'background 0.2s ease'
    },
    input: { width: '100%', padding: 12, marginBottom: 15, border: '2px solid #e0e0e0', borderRadius: 8, fontSize: 16 },
    pill: (active) => ({
      padding: '6px 10px', borderRadius: 999,
      border: `1px solid ${active ? '#333' : '#e5e7eb'}`,
      background: active ? '#f5f5f5' : '#fff',
      color: active ? '#000' : '#374151',
      fontSize: 12, fontWeight: 700, cursor: 'pointer'
    }),
    aiEvalCard: {
      marginTop: 0, background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: 12,
      display: 'flex', position: 'relative', alignItems: 'center', justifyContent: 'flex-start',
      width: '100%', maxWidth: '100%', boxSizing: 'border-box', height: 180, overflow: 'hidden',
      boxShadow: '0 8px 24px rgba(0,0,0,0.06)'
    },
    aiEvalLabel: { position: 'absolute', top: 12, left: 12, fontSize: 14, fontWeight: 700, color: '#111827' }
  };
  // 共通：戻るボタン（白丸・固定左上）
  styles.backButton = {
    position: 'fixed',
    top: 12,
    left: 16, // 少し右へ
    width: 40,
    height: 40,
    borderRadius: '9999px', // 完全な円
    background: '#ffffff',
    border: 'none',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    color: '#111',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: '40px',
    fontSize: 20,
    cursor: 'pointer',
    zIndex: 1000
  };

  if (!isClient) return null;

  return (
    <div className="container" style={styles.container}>

      {/* ロゴズーム画面 */}
      {currentSection === 'logo-zoom' && (
        <div
          onClick={async () => { await signInWithGoogle(); }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            background: 'black',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: '0 40px',
            margin: 0,
            animation: 'fadeIn 0.5s ease-in-out',
            boxSizing: 'border-box',
            overflow: 'hidden'
          }}
        >
          <p style={{
            color: 'white',
            fontSize: 27,
            lineHeight: 1.8,
            textAlign: 'left',
            animation: 'fadeInText 1.5s ease-out',
            margin: 0,
            padding: 0,
            whiteSpace: 'pre-line'
          }}>
            {`BULKは、
毎日の栄養管理を革新し、
あなたをサポートする
AIエージェントです。`}
          </p>
          <p style={{
            position: 'absolute',
            bottom: '100px',
            left: '50%',
            transform: 'translateX(-50%)',
            textAlign: 'center',
            color: '#999',
            fontSize: 16,
            animation: 'blinkText 1.5s ease-in-out infinite',
            margin: 0
          }}>
            BULKを始める
          </p>
          <style jsx>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes zoomIn {
              from {
                transform: scale(0.3);
                opacity: 0;
              }
              to {
                transform: scale(1);
                opacity: 1;
              }
            }
            @keyframes fadeInText {
              0% {
                opacity: 0;
                transform: translateY(20px);
              }
              50% {
                opacity: 0;
              }
              100% {
                opacity: 1;
                transform: translateY(0);
              }
            }
            @keyframes blinkText {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.3; }
            }
          `}</style>
        </div>
      )}

      {/* Mode選択画面 */}
      {currentSection === 'mode-select' && (
        <div style={styles.card}>
          <button onClick={handleBack} style={styles.backButton}>←</button>
          <h1 style={{ ...styles.title, marginBottom: 10 }}>MODE</h1>

          {/* 説明文 */}
          <p style={{ textAlign: 'center', fontSize: 16, color: '#333', marginBottom: 15, fontWeight: 500 }}>
            食事の目的を選択してください
          </p>

          {/* ヒント */}
          <p style={{
            textAlign: 'center',
            fontSize: 14,
            color: '#666',
            marginBottom: 30,
            animation: 'blink 1.5s ease-in-out infinite'
          }}>
            各モードを長押しで詳細を確認できます
          </p>
          <style jsx>{`
            @keyframes blink {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.3; }
            }
          `}</style>

          {/* 3つのモードボタン */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 20 }}>
            <button
              onTouchStart={(e) => {
                e.preventDefault();
                setShowModeDescription(null);
                e.currentTarget.dataset.startTime = Date.now();
                const timer = setTimeout(() => {
                  setShowModeDescription('slim');
                }, 500);
                e.currentTarget.dataset.timer = timer;
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                clearTimeout(e.currentTarget.dataset.timer);
                const duration = Date.now() - (parseInt(e.currentTarget.dataset.startTime) || 0);

                setShowModeDescription(null);

                // 短いタップ（500ms未満）の場合のみモード選択
                if (duration < 500) {
                  setMode('slim');
                  setCurrentSection('home');
                }
              }}
              onTouchCancel={(e) => {
                clearTimeout(e.target.dataset.timer);
                setShowModeDescription(null);
                setIsLongPress(false);
              }}
              onMouseDown={(e) => {
                setIsLongPress(false);
                const timer = setTimeout(() => {
                  setIsLongPress(true);
                  setShowModeDescription('slim');
                }, 500);
                e.target.dataset.timer = timer;
              }}
              onMouseUp={(e) => {
                clearTimeout(e.target.dataset.timer);
                setShowModeDescription(null);

                // 長押しでなければモード選択して画面遷移
                if (!isLongPress) {
                  setMode('slim');
                  setCurrentSection('home');
                }

                // 長押しフラグをリセット
                setTimeout(() => setIsLongPress(false), 100);
              }}
              style={{
                padding: '48px 40px',
                background: mode === 'slim' ? '#000' : 'white',
                color: mode === 'slim' ? 'white' : '#333',
                border: `2px solid ${mode === 'slim' ? '#000' : '#e0e0e0'}`,
                borderRadius: 12,
                fontSize: 32,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                transition: 'all 0.2s ease',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none',
                minHeight: '80px'
              }}
              onMouseEnter={e => {
                if (mode !== 'slim') {
                  e.target.style.background = '#000';
                  e.target.style.color = 'white';
                  e.target.style.borderColor = '#000';
                }
              }}
              onMouseLeave={e => {
                clearTimeout(e.target.dataset.timer);
                setShowModeDescription(null);
                setIsLongPress(false);
                if (mode !== 'slim') {
                  e.target.style.background = 'white';
                  e.target.style.color = '#333';
                  e.target.style.borderColor = '#e0e0e0';
                }
              }}
            >
              SLIM
            </button>

            <button
              onTouchStart={(e) => {
                e.preventDefault();
                setShowModeDescription(null);
                e.currentTarget.dataset.startTime = Date.now();
                const timer = setTimeout(() => {
                  setShowModeDescription('keep');
                }, 500);
                e.currentTarget.dataset.timer = timer;
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                clearTimeout(e.currentTarget.dataset.timer);
                const duration = Date.now() - (parseInt(e.currentTarget.dataset.startTime) || 0);

                setShowModeDescription(null);

                // 短いタップ（500ms未満）の場合のみモード選択
                if (duration < 500) {
                  setMode('keep');
                  setCurrentSection('home');
                }
              }}
              onTouchCancel={(e) => {
                clearTimeout(e.target.dataset.timer);
                setShowModeDescription(null);
                setIsLongPress(false);
              }}
              onMouseDown={(e) => {
                setIsLongPress(false);
                const timer = setTimeout(() => {
                  setIsLongPress(true);
                  setShowModeDescription('keep');
                }, 500);
                e.target.dataset.timer = timer;
              }}
              onMouseUp={(e) => {
                clearTimeout(e.target.dataset.timer);
                setShowModeDescription(null);

                // 長押しでなければモード選択して画面遷移
                if (!isLongPress) {
                  setMode('keep');
                  setCurrentSection('home');
                }

                // 長押しフラグをリセット
                setTimeout(() => setIsLongPress(false), 100);
              }}
              style={{
                padding: '48px 40px',
                background: mode === 'keep' ? '#000' : 'white',
                color: mode === 'keep' ? 'white' : '#333',
                border: `2px solid ${mode === 'keep' ? '#000' : '#e0e0e0'}`,
                borderRadius: 12,
                fontSize: 32,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                transition: 'all 0.2s ease',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none',
                minHeight: '80px'
              }}
              onMouseEnter={e => {
                if (mode !== 'keep') {
                  e.target.style.background = '#000';
                  e.target.style.color = 'white';
                  e.target.style.borderColor = '#000';
                }
              }}
              onMouseLeave={e => {
                if (mode !== 'keep') {
                  e.target.style.background = 'white';
                  e.target.style.color = '#333';
                  e.target.style.borderColor = '#e0e0e0';
                }
              }}
            >
              KEEP
            </button>

            <button
              onTouchStart={(e) => {
                e.preventDefault();
                setShowModeDescription(null);
                e.currentTarget.dataset.startTime = Date.now();
                const timer = setTimeout(() => {
                  setShowModeDescription('bulk');
                }, 500);
                e.currentTarget.dataset.timer = timer;
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                clearTimeout(e.currentTarget.dataset.timer);
                const duration = Date.now() - (parseInt(e.currentTarget.dataset.startTime) || 0);

                setShowModeDescription(null);

                // 短いタップ（500ms未満）の場合のみモード選択
                if (duration < 500) {
                  setMode('bulk');
                  setCurrentSection('home');
                }
              }}
              onTouchCancel={(e) => {
                clearTimeout(e.target.dataset.timer);
                setShowModeDescription(null);
                setIsLongPress(false);
              }}
              onMouseDown={(e) => {
                setIsLongPress(false);
                const timer = setTimeout(() => {
                  setIsLongPress(true);
                  setShowModeDescription('bulk');
                }, 500);
                e.target.dataset.timer = timer;
              }}
              onMouseUp={(e) => {
                clearTimeout(e.target.dataset.timer);
                setShowModeDescription(null);

                // 長押しでなければモード選択して画面遷移
                if (!isLongPress) {
                  setMode('bulk');
                  setCurrentSection('home');
                }

                // 長押しフラグをリセット
                setTimeout(() => setIsLongPress(false), 100);
              }}
              style={{
                padding: '48px 40px',
                background: mode === 'bulk' ? '#000' : 'white',
                color: mode === 'bulk' ? 'white' : '#333',
                border: `2px solid ${mode === 'bulk' ? '#000' : '#e0e0e0'}`,
                borderRadius: 12,
                fontSize: 32,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                transition: 'all 0.2s ease',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none',
                minHeight: '80px'
              }}
              onMouseEnter={e => {
                if (mode !== 'bulk') {
                  e.target.style.background = '#000';
                  e.target.style.color = 'white';
                  e.target.style.borderColor = '#000';
                }
              }}
              onMouseLeave={e => {
                if (mode !== 'bulk') {
                  e.target.style.background = 'white';
                  e.target.style.color = '#333';
                  e.target.style.borderColor = '#e0e0e0';
                }
              }}
            >
              BULK
            </button>
          </div>

          {/* モード説明モーダル */}
          {showModeDescription && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
                padding: 20,
                pointerEvents: 'none'
              }}
            >
              <div
                style={{
                  background: 'white',
                  borderRadius: 16,
                  padding: 32,
                  maxWidth: 500,
                  width: '100%',
                  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
                }}
              >
                <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 20, color: '#333', textAlign: 'center' }}>
                  {showModeDescription === 'slim' && 'SLIM'}
                  {showModeDescription === 'keep' && 'KEEP'}
                  {showModeDescription === 'bulk' && 'BULK'}
                </h2>
                <p style={{ fontSize: 16, lineHeight: 1.8, color: '#666', marginBottom: 0 }}>
                  {showModeDescription === 'slim' && '体重を減らしたい方向けのモードです。低カロリーで高タンパク質なメニューを優先的に提案します。健康的に体脂肪を落としながら、筋肉を維持することを目指します。'}
                  {showModeDescription === 'keep' && '現在の体型を維持したい方向けのモードです。バランスの良い栄養素のメニューを提案します。日常的な健康管理に最適で、無理なく継続できる食事プランをサポートします。'}
                  {showModeDescription === 'bulk' && '筋肉を増やしたい方向けのモードです。高タンパク質で適度なカロリーのメニューを優先的に提案します。効率的に筋肉量を増やすことを目指します。'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ホーム画面 */}
      {currentSection === 'home' && (
        <div style={{
          minHeight: '100vh',
          background: 'white',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* 固定ヘッダーエリア */}
          <div style={{
            position: 'sticky',
            top: 0,
            zIndex: 100,
            background: 'white',
            paddingTop: 20,
            paddingBottom: 12,
            paddingLeft: 20,
            paddingRight: 20,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)'
          }}>
            {/* ハンバーガーメニューボタン */}
            <button
              onClick={() => setShowMenu(!showMenu)}
              style={{
                position: 'absolute',
                top: 20,
                right: 20,
                width: 40,
                height: 40,
                background: 'white',
                border: '2px solid #000',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 4,
                padding: 0,
                zIndex: 1000,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={e => {
                e.target.style.background = '#000';
                Array.from(e.target.children).forEach(child => child.style.background = 'white');
              }}
              onMouseLeave={e => {
                e.target.style.background = 'white';
                Array.from(e.target.children).forEach(child => child.style.background = '#000');
              }}
            >
              <div style={{ width: 20, height: 2, background: '#000', transition: 'all 0.2s ease' }}></div>
              <div style={{ width: 20, height: 2, background: '#000', transition: 'all 0.2s ease' }}></div>
              <div style={{ width: 20, height: 2, background: '#000', transition: 'all 0.2s ease' }}></div>
            </button>

            {/* メニューパネル */}
            {showMenu && (
              <div style={{
                position: 'fixed',
                top: 70,
                right: 20,
                width: 250,
                background: 'white',
                border: '2px solid #000',
                borderRadius: 12,
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
                zIndex: 999,
                overflow: 'hidden'
              }}>
                <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb' }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>メニュー</h3>
                </div>
                <div style={{ padding: '8px 0' }}>
                  <button
                    onClick={() => { setCurrentSection('mode-select'); setShowMenu(false); }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      fontSize: 14,
                      fontWeight: 600,
                      color: '#374151',
                      cursor: 'pointer',
                      transition: 'background 0.2s ease'
                    }}
                    onMouseEnter={e => e.target.style.background = '#f3f4f6'}
                    onMouseLeave={e => e.target.style.background = 'transparent'}
                  >
                    MODE変更
                  </button>
                  <button
                    onClick={() => { setShowProfileForm(true); setCurrentSection('profile'); setShowMenu(false); }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      fontSize: 14,
                      fontWeight: 600,
                      color: '#374151',
                      cursor: 'pointer',
                      transition: 'background 0.2s ease'
                    }}
                    onMouseEnter={e => e.target.style.background = '#f3f4f6'}
                    onMouseLeave={e => e.target.style.background = 'transparent'}
                  >
                    PROFILE編集
                  </button>
                  <button
                    onClick={() => { setCurrentSection('history'); setShowMenu(false); }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      fontSize: 14,
                      fontWeight: 600,
                      color: '#374151',
                      cursor: 'pointer',
                      transition: 'background 0.2s ease'
                    }}
                    onMouseEnter={e => e.target.style.background = '#f3f4f6'}
                    onMouseLeave={e => e.target.style.background = 'transparent'}
                  >
                    過去の食事履歴
                  </button>
                  <button
                    onClick={() => { handleSignOut(); setShowMenu(false); }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      fontSize: 14,
                      fontWeight: 600,
                      color: '#ef4444',
                      cursor: 'pointer',
                      transition: 'background 0.2s ease'
                    }}
                    onMouseEnter={e => e.target.style.background = '#fef2f2'}
                    onMouseLeave={e => e.target.style.background = 'transparent'}
                  >
                    ログアウト
                  </button>
                </div>
              </div>
            )}

            {/* 選択されたMode表示 */}
            {mode && (
              <div style={{
                textAlign: 'center',
                marginBottom: 12,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 2
              }}>
                <span style={{
                  fontSize: 36,
                  fontWeight: 800,
                  color: '#111827',
                  lineHeight: 1
                }}>
                  {mode === 'slim' && 'SLIM'}
                  {mode === 'keep' && 'KEEP'}
                  {mode === 'bulk' && 'BULK'}
                  {mode === 'other' && 'OTHER'}
                </span>
                <span style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: '#9ca3af',
                  lineHeight: 1,
                  letterSpacing: '0.5px'
                }}>
                  MODE
                </span>
              </div>
            )}

            {/* 日付切り替えヘッダー */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 6px',
              background: '#000',
              borderRadius: 6,
              color: 'white'
            }}>
            <button
              onClick={() => changeDateBy(-1)}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 4,
                width: 48,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                fontWeight: 700,
                color: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s',
                flexShrink: 0
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              ＜
            </button>

            <div style={{
              flex: 1,
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span
                onClick={() => setShowCalendarModal(true)}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: isSelectedDateToday(selectedDate) ? 'underline' : 'none',
                  textDecorationThickness: '1px',
                  textUnderlineOffset: '6px',
                  cursor: 'pointer',
                  padding: '4px 8px'
                }}
              >
                {formatDate(selectedDate)}
              </span>
            </div>

            <button
              onClick={() => changeDateBy(1)}
              disabled={isTodayOrFuture(selectedDate)}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 4,
                width: 48,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                fontWeight: 700,
                color: 'white',
                cursor: isTodayOrFuture(selectedDate) ? 'not-allowed' : 'pointer',
                opacity: isTodayOrFuture(selectedDate) ? 0.3 : 1,
                transition: 'all 0.2s',
                flexShrink: 0
              }}
              onMouseEnter={(e) => {
                if (!isTodayOrFuture(selectedDate)) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isTodayOrFuture(selectedDate)) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              ＞
            </button>
          </div>
          </div>

          {/* スクロール可能なコンテンツエリア */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0 20px 20px 20px'
          }}>

          {/* U字型のラッパー：前回の食事＋今日の栄養データ */}
          {(() => {
            // 今日かチェック
            const today = new Date();
            const isToday = selectedDate.toDateString() === today.toDateString();

            return (
              <div style={{ position: 'relative', marginBottom: 20 }}>
                {/* 前回の食事からの経過時間（今日のみ） */}
                {isToday && (() => {
                  // 最後の食事の時刻を取得
                  let hoursSinceLastMeal = null;
                  let lastMealTime = null;

                  if (todayNutrition.meals.length > 0) {
                    const lastMealTimestamp = todayNutrition.meals[todayNutrition.meals.length - 1].timestamp;
                    lastMealTime = new Date(lastMealTimestamp);
                    const now = new Date();
                    hoursSinceLastMeal = (now - lastMealTime) / (1000 * 60 * 60);
                  }

                  // 時間表示
                  let timeDisplay = '';
                  let progress = 0;
                  const idealMaxHours = 5;

                  if (hoursSinceLastMeal === null) {
                    timeDisplay = '未記録';
                    progress = 0;
                  } else {
                    progress = Math.min((hoursSinceLastMeal / idealMaxHours) * 100, 100);
                    const hours = Math.floor(hoursSinceLastMeal);
                    const minutes = Math.round((hoursSinceLastMeal - hours) * 60);
                    timeDisplay = hours > 0 ? `前回の食事から${hours}時間${minutes}分` : `前回の食事から${minutes}分`;
                  }

                  return (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      padding: 0,
                      marginBottom: 12,
                      position: 'relative',
                      zIndex: 1
                    }}>
                      {/* プログレスバー（テキスト込み） */}
                      <div style={{ width: '100%', position: 'relative' }}>
                        <div style={{
                          width: '100%',
                          height: 16,
                          background: '#f3f4f6',
                          borderRadius: 8,
                          overflow: 'hidden',
                          position: 'relative',
                          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)'
                        }}>
                          <div style={{
                            width: `${progress}%`,
                            height: '100%',
                            background: progress < 60
                              ? 'linear-gradient(90deg, #10b981, #34d399)'
                              : progress < 80
                              ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                              : 'linear-gradient(90deg, #ef4444, #f87171)',
                            transition: 'all 0.5s ease',
                            borderRadius: 8
                          }}></div>
                          <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 9,
                            fontWeight: 600,
                            color: '#374151',
                            letterSpacing: '0.1px',
                            zIndex: 1,
                            mixBlendMode: 'multiply',
                            lineHeight: 1
                          }}>
                            {timeDisplay}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

            {/* 新機能: 栄養サマリー（今日のみ） */}
            {isToday && (
            <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingLeft: 4 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#000' }}>
                今日の栄養データ
              </h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, gridTemplateRows: 'auto auto' }}>
              {(() => {
                const dailyIntake = calculateDailyIntake();
                const selectedNutrition = getSelectedDateNutrition();

                // 各栄養素の進捗率を計算
                const calorieProgress = dailyIntake ? Math.min((selectedNutrition.totalCalories / dailyIntake.targetCalories) * 100, 100) : 0;
                const proteinProgress = dailyIntake ? Math.min((selectedNutrition.totalProtein / dailyIntake.protein) * 100, 100) : 0;
                const fatProgress = dailyIntake ? Math.min((selectedNutrition.totalFat / dailyIntake.fat) * 100, 100) : 0;
                const carbsProgress = dailyIntake ? Math.min((selectedNutrition.totalCarbs / dailyIntake.carbs) * 100, 100) : 0;

                return (
                  <>
                    {/* カロリー */}
                    <div style={{
                      background: '#f9fafb',
                      borderRadius: 10,
                      padding: '14px 12px',
                      position: 'relative',
                      overflow: 'hidden',
                      minHeight: '95px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}>
                      {/* 液体の背景 - オレンジ */}
                      <div style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: `${calorieProgress}%`,
                        background: 'linear-gradient(to top, rgba(249, 115, 22, 0.4), rgba(251, 146, 60, 0.2))',
                        transition: 'height 0.6s ease',
                        borderRadius: '0 0 10px 10px'
                      }}></div>

                      {/* コンテンツ */}
                      <div style={{ position: 'relative', zIndex: 1 }}>
                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, fontWeight: 600 }}>カロリー</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: '#000', display: 'flex', alignItems: 'baseline', gap: 3 }}>
                          <span>{Math.round(selectedNutrition.totalCalories)}</span>
                          <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>kcal</span>
                        </div>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>
                          目標: {dailyIntake ? Math.round(dailyIntake.targetCalories) : '---'} kcal
                        </div>
                      </div>
                    </div>

                    {/* タンパク質 */}
                    <div style={{
                      background: '#f9fafb',
                      borderRadius: 10,
                      padding: '14px 12px',
                      position: 'relative',
                      overflow: 'hidden',
                      minHeight: '95px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}>
                      {/* 液体の背景 - 赤 */}
                      <div style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: `${proteinProgress}%`,
                        background: 'linear-gradient(to top, rgba(239, 68, 68, 0.4), rgba(248, 113, 113, 0.2))',
                        transition: 'height 0.6s ease',
                        borderRadius: '0 0 10px 10px'
                      }}></div>

                      <div style={{ position: 'relative', zIndex: 1 }}>
                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, fontWeight: 600 }}>タンパク質</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: '#000', display: 'flex', alignItems: 'baseline', gap: 3 }}>
                          <span>{Math.round(selectedNutrition.totalProtein)}</span>
                          <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>g</span>
                        </div>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>
                          目標: {dailyIntake ? Math.round(dailyIntake.protein) : '---'} g
                        </div>
                      </div>
                    </div>

                    {/* 脂質 */}
                    <div style={{
                      background: '#f9fafb',
                      borderRadius: 10,
                      padding: '14px 12px',
                      position: 'relative',
                      overflow: 'hidden',
                      minHeight: '95px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}>
                      {/* 液体の背景 - 黄色 */}
                      <div style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: `${fatProgress}%`,
                        background: 'linear-gradient(to top, rgba(234, 179, 8, 0.4), rgba(250, 204, 21, 0.2))',
                        transition: 'height 0.6s ease',
                        borderRadius: '0 0 10px 10px'
                      }}></div>

                      <div style={{ position: 'relative', zIndex: 1 }}>
                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, fontWeight: 600 }}>脂質</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: '#000', display: 'flex', alignItems: 'baseline', gap: 3 }}>
                          <span>{Math.round(selectedNutrition.totalFat)}</span>
                          <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>g</span>
                        </div>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>
                          目標: {dailyIntake ? Math.round(dailyIntake.fat) : '---'} g
                        </div>
                      </div>
                    </div>

                    {/* 炭水化物 */}
                    <div style={{
                      background: '#f9fafb',
                      borderRadius: 10,
                      padding: '14px 12px',
                      position: 'relative',
                      overflow: 'hidden',
                      minHeight: '95px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}>
                      {/* 液体の背景 - 青 */}
                      <div style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: `${carbsProgress}%`,
                        background: 'linear-gradient(to top, rgba(59, 130, 246, 0.4), rgba(96, 165, 250, 0.2))',
                        transition: 'height 0.6s ease',
                        borderRadius: '0 0 10px 10px'
                      }}></div>

                      <div style={{ position: 'relative', zIndex: 1 }}>
                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, fontWeight: 600 }}>炭水化物</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: '#000', display: 'flex', alignItems: 'baseline', gap: 3 }}>
                          <span>{Math.round(selectedNutrition.totalCarbs)}</span>
                          <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>g</span>
                        </div>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>
                          目標: {dailyIntake ? Math.round(dailyIntake.carbs) : '---'} g
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
              </div>
            )}

            {/* 昨日以前: 栄養詳細ページの内容を直接表示 */}
            {(() => {
              const today = new Date();
              const isNotToday = selectedDate.toDateString() !== today.toDateString();

              if (!isNotToday) return null;

              const selectedNutrition = getSelectedDateNutrition();
              const dailyIntake = calculateDailyIntake();

              // 総合スコアを計算
              let totalScore = 0;
              let scoreColor = '#10b981';
              if (dailyIntake) {
                const calorieScore = Math.min((selectedNutrition.totalCalories / dailyIntake.targetCalories) * 100, 100);
                const proteinScore = Math.min((selectedNutrition.totalProtein / dailyIntake.protein) * 100, 100);
                const fatScore = Math.min((selectedNutrition.totalFat / dailyIntake.fat) * 100, 100);
                const carbsScore = Math.min((selectedNutrition.totalCarbs / dailyIntake.carbs) * 100, 100);
                totalScore = Math.round((calorieScore + proteinScore + fatScore + carbsScore) / 4);

                if (totalScore < 40) scoreColor = '#ef4444'; // 赤
                else if (totalScore < 70) scoreColor = '#f59e0b'; // オレンジ
                else scoreColor = '#10b981'; // 緑
              }

              return (
                <div style={{
                  background: 'white',
                  padding: 20,
                  color: '#000'
                }}>
                  {/* 総合スコア円形ゲージ */}
                  {dailyIntake && (
                    <div style={{
                      padding: 32,
                      marginBottom: 24,
                      background: 'linear-gradient(135deg, #f9fafb 0%, #ffffff 100%)',
                      borderRadius: 20,
                      border: '2px solid #e5e7eb',
                      position: 'relative'
                    }}>
                      {/* 総合スコア ラベル - 左上 */}
                      <div style={{
                        position: 'absolute',
                        top: 24,
                        left: 24,
                        fontSize: 18,
                        fontWeight: 700,
                        color: '#374151',
                        letterSpacing: '0.5px'
                      }}>
                        総合スコア
                      </div>

                      {/* 円形ゲージ - 中央 */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginTop: 20
                      }}>
                        <div style={{ position: 'relative', width: 180, height: 180 }}>
                          <svg width="180" height="180" style={{ transform: 'rotate(-90deg)' }}>
                            {/* 背景の円 */}
                            <circle
                              cx="90"
                              cy="90"
                              r="75"
                              fill="none"
                              stroke="#e5e7eb"
                              strokeWidth="12"
                            />
                            {/* プログレスの円 */}
                            <circle
                              cx="90"
                              cy="90"
                              r="75"
                              fill="none"
                              stroke={scoreColor}
                              strokeWidth="12"
                              strokeLinecap="round"
                              strokeDasharray={`${(totalScore / 100) * 471.24} 471.24`}
                              style={{ transition: 'stroke-dasharray 0.5s ease' }}
                            />
                          </svg>
                          {/* 中央のスコア表示 */}
                          <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            textAlign: 'center'
                          }}>
                            <div style={{
                              fontSize: 48,
                              fontWeight: 800,
                              color: scoreColor,
                              lineHeight: 1
                            }}>
                              {totalScore}
                            </div>
                            <div style={{
                              fontSize: 14,
                              color: '#6b7280',
                              marginTop: 4
                            }}>
                              / 100
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 1日の摂取栄養 */}
                  <div style={{
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: 16,
                    padding: 24,
                    marginBottom: 20,
                    color: '#000'
                  }}>
                    <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: '#000' }}>
                      1日の摂取栄養
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div style={{ textAlign: 'center', padding: 16, background: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                        <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>カロリー</div>
                        <div style={{ fontSize: 32, fontWeight: 800, color: '#667eea' }}>
                          {Math.round(selectedNutrition.totalCalories)}
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>kcal</div>
                      </div>
                      <div style={{ textAlign: 'center', padding: 16, background: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                        <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>タンパク質</div>
                        <div style={{ fontSize: 32, fontWeight: 800, color: '#10b981' }}>
                          {Math.round(selectedNutrition.totalProtein)}
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>g</div>
                      </div>
                      <div style={{ textAlign: 'center', padding: 16, background: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                        <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>脂質</div>
                        <div style={{ fontSize: 32, fontWeight: 800, color: '#f59e0b' }}>
                          {Math.round(selectedNutrition.totalFat)}
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>g</div>
                      </div>
                      <div style={{ textAlign: 'center', padding: 16, background: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                        <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>炭水化物</div>
                        <div style={{ fontSize: 32, fontWeight: 800, color: '#3b82f6' }}>
                          {Math.round(selectedNutrition.totalCarbs)}
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>g</div>
                      </div>
                    </div>
                  </div>

                  {/* 1日の目標摂取量 */}
                  {(() => {
                    if (!dailyIntake) return null;

                    return (
                      <div style={{
                        background: '#f9fafb',
                        border: '1px solid #e5e7eb',
                        borderRadius: 16,
                        padding: 24,
                        marginBottom: 20,
                        color: '#000'
                      }}>
                        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: '#000' }}>
                          1日の目標摂取量
                        </h2>

                        <div style={{ marginBottom: 20 }}>
                          <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>基礎代謝量（BMR）</div>
                          <div style={{ fontSize: 18, fontWeight: 600, color: '#000' }}>{dailyIntake.bmr} kcal</div>
                        </div>

                        <div style={{ marginBottom: 20 }}>
                          <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>総消費カロリー（TDEE）</div>
                          <div style={{ fontSize: 18, fontWeight: 600, color: '#000' }}>{dailyIntake.tdee} kcal</div>
                        </div>

                        <div style={{
                          padding: 16,
                          background: 'white',
                          border: '1px solid #e5e7eb',
                          borderRadius: 12,
                          color: '#000',
                          marginBottom: 20
                        }}>
                          <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>目標摂取カロリー</div>
                          <div style={{ fontSize: 28, fontWeight: 800 }}>{dailyIntake.targetCalories} kcal</div>
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                            {goal === 'diet' ? '減量目標' : goal === 'bulk' ? '増量目標' : '維持目標'}
                          </div>
                        </div>

                        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: '#000' }}>
                          目標PFCバランス
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                          <div style={{ textAlign: 'center', padding: 12, background: 'white', borderRadius: 8, border: '2px solid #10b981' }}>
                            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>タンパク質</div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: '#10b981' }}>{dailyIntake.protein}</div>
                            <div style={{ fontSize: 11, color: '#6b7280' }}>g</div>
                          </div>
                          <div style={{ textAlign: 'center', padding: 12, background: 'white', borderRadius: 8, border: '2px solid #f59e0b' }}>
                            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>脂質</div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: '#f59e0b' }}>{dailyIntake.fat}</div>
                            <div style={{ fontSize: 11, color: '#6b7280' }}>g</div>
                          </div>
                          <div style={{ textAlign: 'center', padding: 12, background: 'white', borderRadius: 8, border: '2px solid #3b82f6' }}>
                            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>炭水化物</div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: '#3b82f6' }}>{dailyIntake.carbs}</div>
                            <div style={{ fontSize: 11, color: '#6b7280' }}>g</div>
                          </div>
                        </div>

                        {/* 進捗バー */}
                        <div style={{ marginTop: 24 }}>
                          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: '#000' }}>
                            1日の達成率
                          </h3>

                          {/* カロリー */}
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: 14, fontWeight: 600, color: '#000' }}>カロリー</span>
                              <span style={{ fontSize: 14, fontWeight: 600, color: '#000' }}>
                                {Math.round((selectedNutrition.totalCalories / dailyIntake.targetCalories) * 100)}%
                              </span>
                            </div>
                            <div style={{ width: '100%', height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{
                                width: `${Math.min((selectedNutrition.totalCalories / dailyIntake.targetCalories) * 100, 100)}%`,
                                height: '100%',
                                background: '#667eea',
                                transition: 'width 0.3s'
                              }}></div>
                            </div>
                          </div>

                          {/* タンパク質 */}
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: 14, fontWeight: 600, color: '#000' }}>タンパク質</span>
                              <span style={{ fontSize: 14, fontWeight: 600, color: '#000' }}>
                                {Math.round((selectedNutrition.totalProtein / dailyIntake.protein) * 100)}%
                              </span>
                            </div>
                            <div style={{ width: '100%', height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{
                                width: `${Math.min((selectedNutrition.totalProtein / dailyIntake.protein) * 100, 100)}%`,
                                height: '100%',
                                background: '#10b981',
                                transition: 'width 0.3s'
                              }}></div>
                            </div>
                          </div>

                          {/* 脂質 */}
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: 14, fontWeight: 600, color: '#000' }}>脂質</span>
                              <span style={{ fontSize: 14, fontWeight: 600, color: '#000' }}>
                                {Math.round((selectedNutrition.totalFat / dailyIntake.fat) * 100)}%
                              </span>
                            </div>
                            <div style={{ width: '100%', height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{
                                width: `${Math.min((selectedNutrition.totalFat / dailyIntake.fat) * 100, 100)}%`,
                                height: '100%',
                                background: '#f59e0b',
                                transition: 'width 0.3s'
                              }}></div>
                            </div>
                          </div>

                          {/* 炭水化物 */}
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: 14, fontWeight: 600, color: '#000' }}>炭水化物</span>
                              <span style={{ fontSize: 14, fontWeight: 600, color: '#000' }}>
                                {Math.round((selectedNutrition.totalCarbs / dailyIntake.carbs) * 100)}%
                              </span>
                            </div>
                            <div style={{ width: '100%', height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{
                                width: `${Math.min((selectedNutrition.totalCarbs / dailyIntake.carbs) * 100, 100)}%`,
                                height: '100%',
                                background: '#3b82f6',
                                transition: 'width 0.3s'
                              }}></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* 食べたメニュー */}
                  {selectedNutrition.meals && selectedNutrition.meals.length > 0 && (
                    <div style={{
                      background: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: 16,
                      padding: 24,
                      marginBottom: 20,
                      color: '#000'
                    }}>
                      <h2 style={{
                        fontSize: 20,
                        fontWeight: 700,
                        marginBottom: 16,
                        color: '#000',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                      }}>
                        食べたメニュー ({selectedNutrition.meals.length}件)
                      </h2>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {selectedNutrition.meals.map((meal, index) => (
                          <div
                            key={index}
                            style={{
                              padding: 16,
                              background: 'white',
                              borderRadius: 12,
                              border: '1px solid #e5e7eb'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 10 }}>
                              <div>
                                <div style={{ fontSize: 16, fontWeight: 600, color: '#000', marginBottom: 4 }}>
                                  {meal.menu}
                                </div>
                                <div style={{ fontSize: 14, color: '#6b7280' }}>
                                  {meal.shop}
                                </div>
                              </div>
                              <div style={{ fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap', marginLeft: 8 }}>
                                {new Date(meal.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, fontSize: 13 }}>
                              <div>
                                <span style={{ color: '#6b7280' }}>カロリー: </span>
                                <span style={{ fontWeight: 600, color: '#000' }}>{meal.calories}kcal</span>
                              </div>
                              <div>
                                <span style={{ color: '#6b7280' }}>P: </span>
                                <span style={{ fontWeight: 600, color: '#10b981' }}>{meal.protein}g</span>
                              </div>
                              <div>
                                <span style={{ color: '#6b7280' }}>F: </span>
                                <span style={{ fontWeight: 600, color: '#f59e0b' }}>{meal.fat}g</span>
                              </div>
                              <div>
                                <span style={{ color: '#6b7280' }}>C: </span>
                                <span style={{ fontWeight: 600, color: '#3b82f6' }}>{meal.carbs}g</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            </div>
          );
        })()}

          {/* 旧: 前回の食事からの経過時間メーター（削除） */}
          {false && (() => {
            // 最後の食事の時刻を取得
            let hoursSinceLastMeal = null;
            let lastMealTime = null;

            if (todayNutrition.meals.length > 0) {
              const lastMealTimestamp = todayNutrition.meals[todayNutrition.meals.length - 1].timestamp;
              lastMealTime = new Date(lastMealTimestamp);
              const now = new Date();
              hoursSinceLastMeal = (now - lastMealTime) / (1000 * 60 * 60);
            }

            // 理想的な食事間隔: 3-5時間
            const idealMinHours = 3;
            const idealMaxHours = 5;

            // メッセージとカラー
            let message = '';
            let meterColor = '';
            let bgColor = '';
            let progress = 0;
            let timeDisplay = '';

            if (hoursSinceLastMeal === null) {
              // 食事記録がない場合
              message = '本日の食事を記録しましょう！';
              meterColor = '#6b7280'; // グレー
              bgColor = '#f9fafb';
              progress = 0;
              timeDisplay = '未記録';
            } else {
              // メーターの進捗率（0-100%）
              progress = Math.min((hoursSinceLastMeal / idealMaxHours) * 100, 100);

              // 時間表示
              const hours = Math.floor(hoursSinceLastMeal);
              const minutes = Math.round((hoursSinceLastMeal - hours) * 60);
              timeDisplay = hours > 0 ? `前回の食事から${hours}時間${minutes}分` : `前回の食事から${minutes}分`;

              if (hoursSinceLastMeal < idealMinHours) {
                message = '前回の食事から間もないです。もう少し時間をおきましょう';
                meterColor = '#3b82f6'; // 青
                bgColor = '#eff6ff';
              } else if (hoursSinceLastMeal < idealMaxHours) {
                message = 'そろそろ次の食事のタイミングです！';
                meterColor = '#10b981'; // 緑
                bgColor = '#f0fdf4';
              } else if (hoursSinceLastMeal < 7) {
                message = '食事のタイミングです。栄養補給をおすすめします！';
                meterColor = '#f59e0b'; // オレンジ
                bgColor = '#fffbeb';
              } else {
                message = '食事の時間が大幅に空いています。すぐに栄養補給しましょう！';
                meterColor = '#ef4444'; // 赤
                bgColor = '#fef2f2';
              }
            }

            return (
              <div style={{
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 12
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{
                    width: '100%',
                    height: 4,
                    background: '#e5e7eb',
                    borderRadius: 2,
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${progress}%`,
                      height: '100%',
                      background: '#000',
                      transition: 'width 0.5s ease',
                      borderRadius: 2
                    }}></div>
                  </div>
                </div>
                <div style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#000',
                  whiteSpace: 'nowrap'
                }}>
                  {timeDisplay}
                </div>
              </div>
            );
          })()}

          {/* 新機能: お気に入りメニュー */}
          {favorites.length > 0 && (
            <div style={{
              background: 'white',
              border: '2px solid #f3f4f6',
              borderRadius: 16,
              padding: 20,
              marginBottom: 20
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                ⭐ お気に入り ({favorites.length}件)
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {favorites.slice(0, 3).map(fav => {
                  const menu = menuData.find(m => m.id === fav);
                  return menu ? (
                    <div key={fav} style={{
                      padding: 12,
                      background: '#f9fafb',
                      borderRadius: 8,
                      fontSize: 14
                    }}>
                      <div style={{ fontWeight: 600 }}>{menu.menu}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                        {menu.shop} • {menu.calories}kcal
                      </div>
                    </div>
                  ) : null;
                })}
                {favorites.length > 3 && (
                  <div style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', marginTop: 4 }}>
                    他 {favorites.length - 3}件
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 最適な食事を摂取セクション - 今日のみ表示 */}
          {isSelectedDateToday(selectedDate) && (
          <div style={{
            padding: 20,
            background: 'white',
            borderRadius: 16,
            border: '2px solid #e5e7eb',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
            marginBottom: 20
          }}>
            <h3 style={{
              fontSize: 18,
              fontWeight: 700,
              color: '#000',
              marginBottom: 16,
              letterSpacing: '1px'
            }}>
              〈AI解析〉最適な食事を摂取
            </h3>

            {/* メインアクションカード - 横並び */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              {/* 近くで見つけるボタン */}
            <button
              onClick={() => {
                // modeに基づいて分類を決定
                let goalType = 'diet';
                let classification = '減量';

                if (mode === 'slim') {
                  goalType = 'diet';
                  classification = '減量';
                } else if (mode === 'keep') {
                  goalType = 'stay';
                  classification = '現状維持';
                } else if (mode === 'bulk') {
                  goalType = 'bulk';
                  classification = 'バルクアップ';
                } else if (mode === 'other') {
                  goalType = 'diet';
                  classification = '減量';
                }

                handleGoalSelection(goalType, classification);
              }}
              style={{
                aspectRatio: '1',
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: 16,
                padding: '20px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                cursor: 'pointer',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                transition: 'all 0.3s ease',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)';
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.08))';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                e.currentTarget.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.4)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.3)';
              }}
            >
              <span style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#000',
                letterSpacing: '0.5px',
                textAlign: 'center',
                lineHeight: 1.3
              }}>近くで見つける</span>
            </button>

            {/* 店内で見つけるボタン */}
            <button
              onClick={startCamera}
              style={{
                aspectRatio: '1',
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: 16,
                padding: '20px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                cursor: 'pointer',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                transition: 'all 0.3s ease',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)';
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.08))';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                e.currentTarget.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.4)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.3)';
              }}
            >
              <span style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#000',
                letterSpacing: '0.5px',
                textAlign: 'center'
              }}>店内で見つける</span>
            </button>
          </div>
          </div>
          )}

          {/* 食事を記録セクション - 今日のみ表示 */}
          {isSelectedDateToday(selectedDate) && (
          <div style={{
            padding: '12px 16px',
            background: 'white',
            borderRadius: 12,
            border: '2px solid #e5e7eb',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
            marginBottom: 20
          }}>
            <h3 style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#000',
              marginBottom: 10,
              letterSpacing: '0.5px'
            }}>
              食事を記録
            </h3>

          {/* 2つのボタンを横並び */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {/* スキャンボタン */}
            <button
              onClick={() => {
                // スキャン機能の実装予定
                alert('スキャン機能は準備中です');
              }}
              style={{
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: 10,
                padding: '10px 16px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.08))';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.4)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.3)';
              }}
            >
              <span style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#000',
                letterSpacing: '0.5px'
              }}>スキャン</span>
            </button>

            {/* 記入ボタン */}
            <button
              onClick={() => {
                // 記入機能の実装予定
                alert('記入機能は準備中です');
              }}
              style={{
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: 10,
                padding: '10px 16px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.08))';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.4)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.3)';
              }}
            >
              <span style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#000',
                letterSpacing: '0.5px'
              }}>記入</span>
            </button>
          </div>
          </div>
          )}

          </div>
          {/* スクロール可能なコンテンツエリア終了 */}

          <style jsx>{`
            @keyframes blinkSearch {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.3; }
            }
          `}</style>
        </div>
      )}

      {/* 目的選択 */}
      {currentSection === 'goal-select' && (
        <div style={styles.card}>
          <button onClick={handleBack} style={styles.backButton}>←</button>
          <h1 style={styles.title}>食事の目的</h1>
          <p style={{ textAlign:'center', color:'#666', marginBottom:20 }}>この目的は一覧の並びや判定に使われます</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:12, maxWidth:480, margin:'0 auto 16px' }}>
            <button type="button" onClick={() => handleGoalSelection('diet', '減量')}
              style={{ height:80, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:16,
                       border: goal==='diet'?'2px solid #22c55e':'2px solid #e0e0e0', borderRadius:12,
                       background: goal==='diet'?'#f0fdf4':'white', color: goal==='diet'?'#166534':'#666', fontWeight: 700 }}>
              減量
            </button>
            <button type="button" onClick={() => handleGoalSelection('stay', '現状維持')}
              style={{ height:80, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:16,
                       border: goal==='stay'?'2px solid #60a5fa':'2px solid #e0e0e0', borderRadius:12,
                       background: goal==='stay'?'#eff6ff':'white', color: goal==='stay'?'#1e3a8a':'#666', fontWeight: 700 }}>
              現状維持
            </button>
            <button type="button" onClick={() => handleGoalSelection('bulk', 'バルクアップ')}
              style={{ height:80, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:16,
                       border: goal==='bulk'?'2px solid #f97316':'2px solid #e0e0e0', borderRadius:12,
                       background: goal==='bulk'?'#fff7ed':'white', color: goal==='bulk'?'#9a3412':'#666', fontWeight: 700 }}>
              バルクアップ
            </button>
          </div>
          {/* 目的決定ボタンは廃止し、各ボタンで直接遷移 */}
        </div>
      )}


      {/* ローディング画面 */}
      {currentSection === 'loading' && (
        <div style={{
          ...styles.card,
          maxWidth: '100%',
          padding: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh'
        }}>
          <div style={{
            position: 'relative',
            width: 280,
            height: 280,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {/* 円形プログレスバー */}
            <svg style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              transform: 'rotate(-90deg)'
            }}>
              {/* 背景の円 */}
              <circle
                cx="140"
                cy="140"
                r="120"
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="8"
              />
              {/* プログレスの円 */}
              <circle
                cx="140"
                cy="140"
                r="120"
                fill="none"
                stroke="#000"
                strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 120}`}
                strokeDashoffset={`${2 * Math.PI * 120 * (1 - loadingProgress / 100)}`}
                strokeLinecap="round"
                style={{
                  transition: 'stroke-dashoffset 0.5s ease-out'
                }}
              />
            </svg>

            {/* 中央のテキスト */}
            <div style={{
              textAlign: 'center',
              zIndex: 1,
              padding: '0 30px'
            }}>
              <h2 style={{
                fontSize: 18,
                fontWeight: 700,
                color: '#333',
                marginBottom: 8,
                lineHeight: 1.5
              }}>
                半径200m圏内で<br />
                あなたに最適な<br />
                メニューを解析中
              </h2>
              <p style={{
                fontSize: 24,
                fontWeight: 700,
                color: '#000',
                margin: 0
              }}>
                {loadingProgress}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 規約はプロフィールページ下部へ統合 */}

      {/* プロフィール */}
      {currentSection === 'profile' && showProfileForm && (
       <div style={{
         ...styles.card,
         overflowY: 'auto',
         height: '100vh',
         paddingBottom: 100
       }}>
         <button onClick={handleBack} style={styles.backButton}>←</button>
         <h1 style={styles.title}>PROFILE</h1>
          
          {/* 生年月日 */}
          <div style={{ marginBottom:20 }}>
            <label style={{ display:'block', marginBottom:8, fontWeight:'bold' }}>生年月日 <span style={{ color:'red' }}>*</span></label>
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:10 }}>
              <select value={birthYear} onChange={e=>setBirthYear(e.target.value)} style={styles.input}>
                <option value="">年を選択</option>
                {Array.from({length: 80}, (_, i) => 2024 - i).map(y => <option key={y} value={y}>{y}年</option>)}
              </select>
              <select value={birthMonth} onChange={e=>setBirthMonth(e.target.value)} style={styles.input}>
                <option value="">月を選択</option>
                {Array.from({length: 12}, (_, i) => i+1).map(m => <option key={m} value={m}>{m}月</option>)}
              </select>
              <select value={birthDay} onChange={e=>setBirthDay(e.target.value)} style={styles.input}>
                <option value="">日を選択</option>
                {Array.from({length: 31}, (_, i) => i+1).map(d => <option key={d} value={d}>{d}日</option>)}
              </select>
            </div>
          </div>

          {/* 性別 */}
          <div style={{ marginBottom:20 }}>
            <label style={{ display:'block', marginBottom:8, fontWeight:'bold' }}>性別 <span style={{ color:'red' }}>*</span></label>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:10 }}>
              {['male','female'].map(g => (
                <button key={g} type="button" onClick={()=>setGender(g)}
                style={{
                    padding:12, border: gender===g ? '2px solid #000':'2px solid #e0e0e0',
                    borderRadius:8, background: gender===g ? '#f0f4ff':'white',
                    color: gender===g ? '#667eea':'#666', fontWeight: gender===g ? 'bold':'normal', cursor:'pointer'
                  }}
                >
                  {g==='male'?'男性':'女性'}
              </button>
              ))}
            </div>
          </div>

          {/* 身長 */}
          <div style={{ marginBottom:20 }}>
            <label style={{ display:'block', marginBottom:8, fontWeight:'bold' }}>身長 (cm) <span style={{ color:'red' }}>*</span></label>
            <select value={height} onChange={e=>setHeight(e.target.value)} style={styles.input}>
              <option value="">身長を選択</option>
              {Array.from({length: 81}, (_, i) => 130 + i).map(h => <option key={h} value={h}>{h} cm</option>)}
            </select>
          </div>

          {/* 体重 */}
          <div style={{ marginBottom:20 }}>
            <label style={{ display:'block', marginBottom:8, fontWeight:'bold' }}>体重 (kg) <span style={{ color:'red' }}>*</span></label>
            <select value={weight} onChange={e=>setWeight(e.target.value)} style={styles.input}>
              <option value="">体重を選択</option>
              {Array.from({length: 151}, (_, i) => 30 + i).map(w => <option key={w} value={w}>{w} kg</option>)}
            </select>
          </div>

          {/* 運動頻度（必須） */}
          <div style={{ marginBottom:20 }}>
            <label style={{ display:'block', marginBottom:8, fontWeight:'bold' }}>運動頻度 <span style={{ color:'red' }}>*</span></label>
            <select value={exerciseFrequency} onChange={e=>setExerciseFrequency(e.target.value)} style={styles.input}>
              <option value="">選択してください</option>
              <option value="ほとんど運動しない">ほとんど運動しない</option>
              <option value="週1〜2回程度">週1〜2回程度</option>
              <option value="週3〜5回程度">週3〜5回程度</option>
              <option value="ほぼ毎日する">ほぼ毎日する</option>
            </select>
          </div>

          {/* 運動種類（チップ複数可） */}
          <div style={{ marginBottom:20 }}>
            <label style={{ display:'block', marginBottom:8, fontWeight:'bold' }}>運動の種類 <span style={{ color:'red' }}>*</span></label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {exerciseTypesList.map(name => {
                const active = selectedExerciseTypes.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setSelectedExerciseTypes(prev => active ? prev.filter(x=>x!==name) : [...prev, name])}
                    style={{
                      padding:'6px 10px', borderRadius:999,
                      border: `2px solid ${active ? '#22c55e' : '#e5e7eb'}`,
                      background: active ? '#dcfce7' : '#fff',
                      color: active ? '#166534' : '#374151',
                      fontWeight:800, fontSize:12,
                      cursor:'pointer'
                    }}
                  >
                    {name}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  const label = prompt('その他の運動を入力');
                  const v = (label||'').trim();
                  if (!v) return;
                  if (!exerciseTypesList.includes(v)) setExerciseTypesList([...exerciseTypesList, v]);
                  if (!selectedExerciseTypes.includes(v)) setSelectedExerciseTypes([...selectedExerciseTypes, v]);
                }}
                style={{ padding:'6px 10px', borderRadius:999, border:'2px dashed #cbd5e1', background:'#fff', color:'#334155', fontWeight:800, fontSize:12 }}
              >
                ＋
              </button>
            </div>
          </div>

          {/* 疾患（チップ複数可・オプション） */}
          <div style={{ marginBottom:20 }}>
            <label style={{ display:'block', marginBottom:8, fontWeight:'bold' }}>疾患</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {diseasesList.map(name => {
                const active = selectedDiseases.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setSelectedDiseases(prev => active ? prev.filter(x=>x!==name) : [...prev, name])}
                    style={{
                      padding:'6px 10px', borderRadius:999,
                      border: `2px solid ${active ? '#3b82f6' : '#e5e7eb'}`,
                      background: active ? '#dbeafe' : '#fff',
                      color: active ? '#1e40af' : '#374151',
                      fontWeight:800, fontSize:12,
                      cursor:'pointer'
                    }}
                  >
                    {name}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  const label = prompt('その他の疾患を入力');
                  const v = (label||'').trim();
                  if (!v) return;
                  if (!diseasesList.includes(v)) setDiseasesList([...diseasesList, v]);
                  if (!selectedDiseases.includes(v)) setSelectedDiseases([...selectedDiseases, v]);
                }}
                style={{ padding:'6px 10px', borderRadius:999, border:'2px dashed #cbd5e1', background:'#fff', color:'#334155', fontWeight:800, fontSize:12 }}
              >
                ＋
              </button>
            </div>
          </div>

          {/* 位置情報の共有チェックボックス */}
          <div style={{ marginBottom:20, display:'flex', justifyContent:'center', alignItems:'center' }}>
            <input type="checkbox" id="allowLocationProfile" checked={allowLocation} onChange={e=>setAllowLocation(e.target.checked)} style={{ marginRight:10 }} required/>
            <label htmlFor="allowLocationProfile">位置情報の共有に同意します <span style={{ color:'red' }}>*</span></label>
          </div>

          {/* 目的は別ステップへ移動 */}

          <button onClick={handleSearch}
            style={{ ...styles.button,
              opacity: (!birthYear||!birthMonth||!birthDay||!gender||!height||!weight||exerciseFrequency===''||selectedExerciseTypes.length===0||!allowLocation) ? 0.5 : 1,
              cursor: (!birthYear||!birthMonth||!birthDay||!gender||!height||!weight||exerciseFrequency===''||selectedExerciseTypes.length===0||!allowLocation) ? 'not-allowed' : 'pointer',
              marginBottom: 40
            }}
            disabled={!birthYear||!birthMonth||!birthDay||!gender||!height||!weight||exerciseFrequency===''||selectedExerciseTypes.length===0||!allowLocation}
          >
            決定
          </button>
        </div>
      )}

      {/* 健康設定（オプション）はプロフィール直下へ統合済み */}

      {/* 店舗選択 */}
      {currentSection === 'shop-select' && (
        <div style={{ ...styles.card, maxWidth: '100%', padding: '20px' }}>
          <button onClick={handleBack} style={styles.backButton}>←</button>

          {/* ヘッダー */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
            position: 'relative'
          }}>
            <h1 style={{ ...styles.title, marginBottom: 0 }}>BEST MENU</h1>
          </div>

          {/* 要望入力・フィルターセクション */}
          <div style={{
            display: 'flex',
            gap: 8,
            marginBottom: 20,
            alignItems: 'center'
          }}>
            {/* 要望入力タブ */}
            <input
              type="text"
              placeholder="メニューの要望を入力"
              style={{
                flex: 1,
                height: 36,
                borderRadius: 6,
                border: '1px solid #d1d5db',
                fontSize: 12,
                fontWeight: 400,
                color: '#6b7280',
                background: '#f9fafb',
                padding: '0 12px',
                outline: 'none'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#9ca3af';
                e.currentTarget.style.background = 'white';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#d1d5db';
                e.currentTarget.style.background = '#f9fafb';
              }}
            />

            {/* フィルターアイコンボタン */}
            <button
              onClick={() => setShowFilterModal(true)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 6,
                border: '1px solid #d1d5db',
                background: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
                flexShrink: 0
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f3f4f6';
                e.currentTarget.style.borderColor = '#9ca3af';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'white';
                e.currentTarget.style.borderColor = '#d1d5db';
              }}
            >
              {/* Sliders Icon (SVG) */}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="4" y1="21" x2="4" y2="14"></line>
                <line x1="4" y1="10" x2="4" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12" y2="3"></line>
                <line x1="20" y1="21" x2="20" y2="16"></line>
                <line x1="20" y1="12" x2="20" y2="3"></line>
                <line x1="1" y1="14" x2="7" y2="14"></line>
                <line x1="9" y1="8" x2="15" y2="8"></line>
                <line x1="17" y1="16" x2="23" y2="16"></line>
              </svg>
            </button>
          </div>
          {(() => {
            // ジャンルごとに店舗をグルーピング
            const map = new Map(); // genre -> Set<shop>
            for (const it of menuData) {
              const genre = (it.genre || '未分類').trim();
              const shop = (it.shop || '').trim();
              if (!shop) continue;
              if (!map.has(genre)) map.set(genre, new Set());
              map.get(genre).add(shop);
            }
            const groups = Array.from(map.entries())
              .map(([g, set]) => [g, Array.from(set).sort((a,b)=>a.localeCompare(b,'ja'))])
              .sort((a,b)=>a[0].localeCompare(b[0],'ja'));
            const total = new Set(menuData.map(it => (it.shop || '').trim()).filter(Boolean)).size;
            const genreList = groups.map(([g]) => g);
            const groupsToShow = shopGenreFilter==='ALL' ? groups : groups.filter(([g]) => g === shopGenreFilter);
            const queryNorm = normalizeShop(shopSearchQuery || '');
            return (
              <div>
                
                {/* 店名で検索は削除 */}

                {/* メニュー一覧（シンプルなラベルのみ） */}
                <div style={{ marginTop: 20 }}>
                  {(() => {
                    // 200m圏内に存在するチェーンのchainIdリストを作成
                    console.log('[フィルタリング] nearbyStores:', nearbyStores);
                    const nearbyChainIds = new Set();
                    if (nearbyStores && nearbyStores.length > 0) {
                      nearbyStores.forEach(store => {
                        console.log('[フィルタリング] store.chainId:', store.chainId, 'store.name:', store.name);
                        if (store.chainId) {
                          nearbyChainIds.add(store.chainId);
                        } else {
                          console.warn('[フィルタリング] chainIdが見つかりません:', store.name);
                        }
                      });
                    } else {
                      console.warn('[フィルタリング] nearbyStoresが空、またはundefined');
                    }
                    console.log('[フィルタリング] 200m圏内のchainIds:', Array.from(nearbyChainIds));

                    // menuDataを200m圏内のchainIdでフィルタリング
                    // 200m圏内に店舗が存在しないチェーンのデータは表示しない
                    const filteredMenuData = nearbyChainIds.size > 0
                      ? menuData.filter(menu => {
                          const isNearby = menu.chainId && nearbyChainIds.has(menu.chainId);
                          if (menu.chainId) {
                            console.log('[フィルタリング]', menu.shop, '(chainId:', menu.chainId, ') -', isNearby ? '表示' : '除外');
                          }
                          return isNearby;
                        })
                      : menuData; // nearbyStoresがない場合は全て表示（後方互換性）

                    console.log(`[フィルタリング] ${menuData.length}件 → ${filteredMenuData.length}件（200m圏内のみ）`);
                    console.log('[フィルタリング] フィルタ後のTop3店舗とchainId:', filteredMenuData.slice(0, 3).map(m => `${m.shop} (${m.chainId})`));

                    // フィルタリング後のデータで全メニューを計算
                    let allMenus = buildResults(filteredMenuData, userProfile);

                    // 絞り込み適用
                    if (filterCategory !== 'all') {
                      // ここでは簡易的にカテゴリ名で絞り込み（実際のデータ構造に合わせて調整が必要）
                      allMenus = allMenus.filter(menu => {
                        const categoryLower = (menu.category || '').toLowerCase();
                        if (filterCategory === 'main') {
                          return !categoryLower.includes('サイド') && !categoryLower.includes('ドリンク');
                        } else if (filterCategory === 'side') {
                          return categoryLower.includes('サイド');
                        } else if (filterCategory === 'drink') {
                          return categoryLower.includes('ドリンク');
                        }
                        return true;
                      });
                    }

                    // 並び替え適用
                    if (sortType === 'protein-high') {
                      allMenus = [...allMenus].sort((a, b) => b.protein - a.protein);
                    } else if (sortType === 'calories-low') {
                      allMenus = [...allMenus].sort((a, b) => a.calories - b.calories);
                    } else if (sortType === 'calories-high') {
                      allMenus = [...allMenus].sort((a, b) => b.calories - a.calories);
                    }
                    // protein-efficiency はデフォルトのbuildResultsのソート順を使用

                    const displayMenus = allMenus.slice(0, displayCount);
                    const hasMore = allMenus.length > displayCount;

                    console.log('[Display] allMenus.length:', allMenus.length, 'displayCount:', displayCount, 'hasMore:', hasMore);

                      return (
                        <>
                          {/* メニューリスト */}
                          <div style={{ display:'flex', flexDirection:'column', gap:14, maxHeight: 'calc(100vh - 200px)', overflowY:'auto', marginBottom: 20 }}>
                            {displayMenus.map((m, i) => {
                              const isHighlighted = highlightedShop === m.shop;
                              const storeInfo = findStoreForMenu(m);

                              return (
                      <button
                        key={`${m.shop}-${m.menu}-${i}`}
                                  onClick={() => handleMenuClick(m)}
                        style={{
                                    padding: '16px 12px',
                                    border: isHighlighted ? '2px solid #000' : '1px solid #e5e7eb',
                                    borderRadius:10,
                                    background: isHighlighted ? '#f0f4ff' : '#fff',
                                    color:'#111827', fontSize:14, fontWeight:700, textAlign:'left', cursor:'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    transition: 'all 0.2s ease',
                                    minHeight: '95px'
                                  }}
                                  onMouseEnter={e=>{
                                    e.currentTarget.style.borderColor='#000';
                                    e.currentTarget.style.borderWidth='2px';
                                    e.currentTarget.style.background='#f0f4ff';
                                    setHighlightedShop(m.shop);
                                  }}
                                  onMouseLeave={e=>{
                                    if (highlightedShop !== m.shop) {
                                      e.currentTarget.style.borderColor='#e5e7eb';
                                      e.currentTarget.style.borderWidth='1px';
                                      e.currentTarget.style.background='#fff';
                                    }
                                    setHighlightedShop(null);
                                  }}
                                >
                                  <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                                      <span style={{ fontSize: 20, fontWeight: 800, color: '#000' }}>{i + 1}位</span>
                                      {storeInfo ? (
                                        <>
                                          <span style={{ fontSize: 11, color: '#000', fontWeight: 600 }}>{storeInfo.name}</span>
                                          <span style={{ fontSize: 13, fontWeight: 700, color: '#000' }}>{storeInfo.distance}m</span>
                                        </>
                                      ) : (
                                        <span style={{ fontSize: 11, color: '#999', fontWeight: 600 }}>店舗なし</span>
                                      )}
                                    </div>
                                    <div style={{ fontSize: 15, color: '#111827', fontWeight: 600, paddingLeft: 4, lineHeight: 1.4 }}>
                                      {m.menu || ''}
                                    </div>
                                  </div>
                      </button>
                              );
                            })}
                  </div>

                  {/* もっと見るボタン */}
                  {hasMore && (
                    <div style={{ marginTop: 20, textAlign: 'center' }}>
                      <button
                        onClick={() => {
                          console.log('[もっと見る] クリックされました');
                          console.log('[もっと見る] 現在のdisplayCount:', displayCount);
                          console.log('[もっと見る] allMenus.length:', allMenus.length);
                          setDisplayCount(prev => {
                            // 初回（5件表示中）は10件に増やす、それ以降は5件ずつ増やす
                            const increment = prev === 5 ? 5 : 5;
                            const newCount = prev + increment;
                            console.log('[もっと見る] 新しいdisplayCount:', newCount);
                            return newCount;
                          });
                        }}
                        style={{
                          padding: '8px 16px',
                          background: 'transparent',
                          color: '#9ca3af',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.color = '#6b7280';
                          e.target.style.textDecoration = 'underline';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.color = '#9ca3af';
                          e.target.style.textDecoration = 'none';
                        }}
                      >
                        {displayCount === 5 ? '6位以降を表示' : `${displayCount + 1}位以降を表示`}
                      </button>
                    </div>
                  )}
                      </>
                      );
                    })()}
                </div>

              </div>
            );
          })()}
        </div>
      )}

      {/* 結果表示 */}
      {currentSection === 'results' && (
        <div style={styles.card}>
          <button onClick={handleBack} style={styles.backButton}>←</button>
          <h1 style={styles.title}>
            🏆 {
              selectedShop
                ? (selectedShop === '__ALL__'
                    ? '全店舗Tier'
                    : `${selectedShop} Tier`)
                : 'Tier'
            }
          </h1>

          {/* カテゴリで絞る（メニュー用） */}
          {(() => {
            const categories = Array.from(new Set(scoredMenus.map(m => (m.category || '').trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'ja'));
            return (
              <div className="category-filter" style={{ display:'flex', justifyContent:'center', marginBottom:12, flexWrap:'nowrap' }}>
                <label style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'nowrap', whiteSpace:'nowrap' }}>
                  <span style={{ fontWeight:700, color:'#374151', whiteSpace:'nowrap' }}>カテゴリで絞る</span>
                  <select value={shopCategoryFilter} onChange={e=>setShopCategoryFilter(e.target.value)}
                    style={{ height:32, padding:'2px 8px', border:'1px solid #e5e7eb', borderRadius:8, width:160, minWidth:160, fontSize:12 }}>
                    <option value="ALL">ALL</option>
                    {categories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
              </div>
            );
          })()}
          {/* 等級フィルタ：ALL のみ（カテゴリの下へ移動） */}
          <div className="filter-row" style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:16, flexWrap:'wrap' }}>
            <button onClick={()=>setGradeFilter('ALL')} style={styles.pill(gradeFilter==='ALL')}>ALL</button>
          </div>
          
          {/* プロフィール表示は非表示 */}

          <div className="menu-list" style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {(scoredMenus)
              .filter(m => shopCategoryFilter==='ALL' ? true : (m.category || '').trim() === shopCategoryFilter)
              .map((m, i) => (
              <button key={`${m.menu}-${i}`} onClick={()=>handleMenuClick(m)}
                className="menu-card"
                style={{
                  width:'100%', maxWidth:'100%', boxSizing:'border-box', overflow:'hidden',
                  margin:'0 -20px 0 0',
                  background:'white', border:'1px solid #e5e7eb', borderRadius:12, padding:16, textAlign:'left',
                  cursor:'pointer', display:'flex', alignItems:'center', gap:16, boxShadow:'0 2px 8px rgba(0,0,0,0.04)', position:'relative'
                }}
                onMouseEnter={e=>{ e.currentTarget.style.borderColor='#667eea'; e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.08)'; }}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor='#e5e7eb'; e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.04)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, gap: 16 }}>
                <div className="title" style={{ fontSize:16, fontWeight:'bold', color:'#333', flex:1, marginLeft:32, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.menu}</div>
                  {m.latitude && m.longitude && (
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#000', whiteSpace: 'nowrap' }}>
                      {calculateDistance(35.7080, 139.7731, m.latitude, m.longitude)}m
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* 履歴セクション */}
          {history.length > 0 && (
            <div style={{
              marginTop: 32,
              padding: 20,
              background: '#f9fafb',
              borderRadius: 12,
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{
                fontSize: 18,
                fontWeight: 700,
                color: '#111827',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                📜 最近選んだメニュー
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {history.slice(0, 5).map((item, index) => {
                  const menu = item.menu;
                  const timeAgo = Math.floor((Date.now() - item.timestamp) / 1000 / 60 / 60);
                  return (
                    <div
                      key={index}
                      onClick={() => handleMenuClick(menu)}
                      style={{
                        padding: 12,
                        background: 'white',
                        borderRadius: 8,
                        border: '1px solid #e5e7eb',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#667eea';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#e5e7eb';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
                          {menu.menu}
                        </div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>
                          {menu.shop} • {menu.calories}kcal
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap', marginLeft: 8 }}>
                        {timeAgo === 0 ? '今' : `${timeAgo}時間前`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

            </div>
          )}

      {/* 食事履歴詳細ページ */}
      {currentSection === 'history' && (
        <div style={{
          minHeight: '100vh',
          background: '#000',
          padding: 20,
          color: 'white'
        }}>
          <button onClick={() => setCurrentSection('home')} style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: 8,
            padding: '8px 16px',
            color: 'white',
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: 20,
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
          >
            ← ホームに戻る
          </button>

          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24, textAlign: 'center' }}>食事履歴</h1>

          {/* 日付切り替えヘッダー */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            marginBottom: 24,
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: 12,
            color: 'white'
          }}>
            <button
              onClick={() => changeDateBy(-1)}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                borderRadius: 8,
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                fontWeight: 700,
                color: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                e.currentTarget.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              ＜
            </button>

            <div style={{
              flex: 1,
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span
                onClick={() => setShowCalendarModal(true)}
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  textDecoration: isSelectedDateToday(selectedDate) ? 'underline' : 'none',
                  textDecorationThickness: '1px',
                  textUnderlineOffset: '6px',
                  cursor: 'pointer',
                  padding: '4px 12px'
                }}
              >
                {formatDate(selectedDate)}
              </span>
            </div>

            <button
              onClick={() => changeDateBy(1)}
              disabled={isTodayOrFuture(selectedDate)}
              style={{
                background: isTodayOrFuture(selectedDate)
                  ? 'rgba(255, 255, 255, 0.1)'
                  : 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                borderRadius: 8,
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                fontWeight: 700,
                color: 'white',
                cursor: isTodayOrFuture(selectedDate) ? 'not-allowed' : 'pointer',
                opacity: isTodayOrFuture(selectedDate) ? 0.5 : 1,
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (!isTodayOrFuture(selectedDate)) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                  e.currentTarget.style.transform = 'scale(1.1)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isTodayOrFuture(selectedDate)) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.transform = 'scale(1)';
                }
              }}
            >
              ＞
            </button>
          </div>


          {/* 最近見たメニュー */}
          <div style={{
            padding: 20,
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 16
          }}>
            <h2 style={{
              fontSize: 18,
              fontWeight: 700,
              color: 'white',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              最近見たメニュー
            </h2>

            {history.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {history.map((item, index) => {
                  const menu = item.menu;
                  const timeAgo = Math.floor((Date.now() - item.timestamp) / 1000 / 60 / 60);
                  return (
                    <div
                      key={index}
                      onClick={() => handleMenuClick(menu)}
                      style={{
                        padding: 14,
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: 12,
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'white', marginBottom: 6 }}>
                          {menu.menu}
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.6)' }}>
                          {menu.shop} • {menu.calories}kcal • P:{menu.protein}g
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.5)', whiteSpace: 'nowrap', marginLeft: 12 }}>
                        {timeAgo === 0 ? '今' : timeAgo < 24 ? `${timeAgo}時間前` : `${Math.floor(timeAgo / 24)}日前`}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{
                padding: 40,
                textAlign: 'center',
                color: 'rgba(255, 255, 255, 0.5)',
                fontSize: 14
              }}>
                まだ閲覧履歴がありません
              </div>
            )}
          </div>
        </div>
      )}

      {/* 栄養詳細ページ */}
      {currentSection === 'nutrition-detail' && (
        <div style={{
          minHeight: '100vh',
          background: 'white',
          padding: 20,
          color: '#000'
        }}>
          <button onClick={handleBack} style={{
            background: '#f3f4f6',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            padding: '8px 16px',
            color: '#000',
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: 20,
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#e5e7eb'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#f3f4f6'}
          >
            ← ホームに戻る
          </button>

          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24, textAlign: 'center', color: '#000' }}>
            栄養詳細
          </h1>

          {/* 今日の摂取栄養 */}
          <div style={{
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: 16,
            padding: 24,
            marginBottom: 20,
            color: '#000'
          }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: '#000' }}>
              今日の摂取栄養
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ textAlign: 'center', padding: 16, background: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>カロリー</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: '#667eea' }}>
                  {Math.round(todayNutrition.totalCalories)}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>kcal</div>
              </div>
              <div style={{ textAlign: 'center', padding: 16, background: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>タンパク質</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: '#10b981' }}>
                  {Math.round(todayNutrition.totalProtein)}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>g</div>
              </div>
              <div style={{ textAlign: 'center', padding: 16, background: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>脂質</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: '#f59e0b' }}>
                  {Math.round(todayNutrition.totalFat)}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>g</div>
              </div>
              <div style={{ textAlign: 'center', padding: 16, background: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>炭水化物</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: '#3b82f6' }}>
                  {Math.round(todayNutrition.totalCarbs)}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>g</div>
              </div>
            </div>
          </div>

          {/* 1日の目標摂取量 */}
          {(() => {
            const dailyIntake = calculateDailyIntake();
            if (!dailyIntake) return null;

            return (
              <div style={{
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: 16,
                padding: 24,
                marginBottom: 20,
                color: '#000'
              }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: '#000' }}>
                  1日の目標摂取量
                </h2>

                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>基礎代謝量（BMR）</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#000' }}>{dailyIntake.bmr} kcal</div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>総消費カロリー（TDEE）</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#000' }}>{dailyIntake.tdee} kcal</div>
                </div>

                <div style={{
                  padding: 16,
                  background: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  color: '#000',
                  marginBottom: 20
                }}>
                  <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>目標摂取カロリー</div>
                  <div style={{ fontSize: 28, fontWeight: 800 }}>{dailyIntake.targetCalories} kcal</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                    {goal === 'diet' ? '減量目標' : goal === 'bulk' ? '増量目標' : '維持目標'}
                  </div>
                </div>

                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: '#000' }}>
                  目標PFCバランス
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div style={{ textAlign: 'center', padding: 12, background: 'white', borderRadius: 8, border: '2px solid #10b981' }}>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>タンパク質</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#10b981' }}>{dailyIntake.protein}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>g</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: 12, background: 'white', borderRadius: 8, border: '2px solid #f59e0b' }}>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>脂質</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#f59e0b' }}>{dailyIntake.fat}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>g</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: 12, background: 'white', borderRadius: 8, border: '2px solid #3b82f6' }}>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>炭水化物</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#3b82f6' }}>{dailyIntake.carbs}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>g</div>
                  </div>
                </div>

                {/* 進捗バー */}
                <div style={{ marginTop: 24 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: '#000' }}>
                    本日の達成率
                  </h3>

                  {/* カロリー */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#000' }}>カロリー</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#000' }}>
                        {Math.round((todayNutrition.totalCalories / dailyIntake.targetCalories) * 100)}%
                      </span>
                    </div>
                    <div style={{ width: '100%', height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min((todayNutrition.totalCalories / dailyIntake.targetCalories) * 100, 100)}%`,
                        height: '100%',
                        background: '#667eea',
                        transition: 'width 0.3s'
                      }}></div>
                    </div>
                  </div>

                  {/* タンパク質 */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#000' }}>タンパク質</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#000' }}>
                        {Math.round((todayNutrition.totalProtein / dailyIntake.protein) * 100)}%
                      </span>
                    </div>
                    <div style={{ width: '100%', height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min((todayNutrition.totalProtein / dailyIntake.protein) * 100, 100)}%`,
                        height: '100%',
                        background: '#10b981',
                        transition: 'width 0.3s'
                      }}></div>
                    </div>
                  </div>

                  {/* 脂質 */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#000' }}>脂質</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#000' }}>
                        {Math.round((todayNutrition.totalFat / dailyIntake.fat) * 100)}%
                      </span>
                    </div>
                    <div style={{ width: '100%', height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min((todayNutrition.totalFat / dailyIntake.fat) * 100, 100)}%`,
                        height: '100%',
                        background: '#f59e0b',
                        transition: 'width 0.3s'
                      }}></div>
                    </div>
                  </div>

                  {/* 炭水化物 */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#000' }}>炭水化物</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#000' }}>
                        {Math.round((todayNutrition.totalCarbs / dailyIntake.carbs) * 100)}%
                      </span>
                    </div>
                    <div style={{ width: '100%', height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min((todayNutrition.totalCarbs / dailyIntake.carbs) * 100, 100)}%`,
                        height: '100%',
                        background: '#3b82f6',
                        transition: 'width 0.3s'
                      }}></div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 今日食べたメニュー */}
          <div style={{
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: 16,
            padding: 24,
            marginBottom: 20,
            color: '#000'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{
                fontSize: 20,
                fontWeight: 700,
                color: '#000',
                margin: 0
              }}>
                今日食べたメニュー ({todayNutrition.meals.length}件)
              </h2>
              <span
                onClick={() => setShowManualInputModal(true)}
                style={{
                  fontSize: 12,
                  color: '#9ca3af',
                  cursor: 'pointer',
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#667eea'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#9ca3af'}
              >
                手動で追加
              </span>
            </div>
            {todayNutrition.meals.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {todayNutrition.meals.map((meal, index) => (
                  <div
                    key={index}
                    style={{
                      padding: 16,
                      background: 'white',
                      borderRadius: 12,
                      border: '1px solid #e5e7eb'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: '#000', marginBottom: 4 }}>
                          {meal.menu}
                        </div>
                        <div style={{ fontSize: 14, color: '#6b7280' }}>
                          {meal.shop}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap', marginLeft: 8 }}>
                        {new Date(meal.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, fontSize: 13 }}>
                      <div>
                        <span style={{ color: '#6b7280' }}>カロリー: </span>
                        <span style={{ fontWeight: 600, color: '#000' }}>{meal.calories}kcal</span>
                      </div>
                      <div>
                        <span style={{ color: '#6b7280' }}>P: </span>
                        <span style={{ fontWeight: 600, color: '#10b981' }}>{meal.protein}g</span>
                      </div>
                      <div>
                        <span style={{ color: '#6b7280' }}>F: </span>
                        <span style={{ fontWeight: 600, color: '#f59e0b' }}>{meal.fat}g</span>
                      </div>
                      <div>
                        <span style={{ color: '#6b7280' }}>C: </span>
                        <span style={{ fontWeight: 600, color: '#3b82f6' }}>{meal.carbs}g</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                textAlign: 'center',
                padding: 40,
                color: '#9ca3af',
                fontSize: 14
              }}>
                まだ食事が記録されていません
              </div>
            )}
          </div>

        </div>
      )}

      {/* 詳細 */}
      {currentSection === 'menu-detail' && selectedMenu && (
        <div className="detail-wrap" style={styles.card}>
          <button onClick={handleBack} style={styles.backButton}>←</button>
          <div className="detail-header">
            <h1 style={styles.title}>{selectedMenu.menu}</h1>
            <p style={{ textAlign:'center', color:'#666', marginBottom:20, fontSize:18 }}>
              {(() => {
                const store = findStoreForMenu(selectedMenu);
                return store ? store.name : selectedMenu.shop;
              })()}
            </p>
          </div>

          {/* 評価ゲージ削除 */}
              
          {/* 栄養表示 */}
          <div style={{ marginBottom:24 }}>
            <h2 style={{ fontSize:22, fontWeight:800, color:'#111827', marginBottom:16 }}>
              {selectedMenu.data_source === 'ai_imputed' ? '〈AI推計〉栄養成分' : '〈公式〉栄養成分'}
            </h2>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              padding: 20,
              background: '#f9fafb',
              borderRadius: 12
            }}>
                  {/* エネルギー */}
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, fontWeight: 600 }}>エネルギー</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#111827' }}>
                  {selectedMenu.calories}
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginLeft: 2 }}>kcal</span>
                    </div>
                  </div>

                  {/* たんぱく質 */}
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, fontWeight: 600 }}>たんぱく質</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#111827' }}>
                  {selectedMenu.protein}
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginLeft: 2 }}>g</span>
                </div>
                </div>

                  {/* 脂質 */}
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, fontWeight: 600 }}>脂質</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#111827' }}>
                  {selectedMenu.fat}
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginLeft: 2 }}>g</span>
                </div>
              </div>
              
                  {/* 炭水化物 */}
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, fontWeight: 600 }}>炭水化物</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#111827' }}>
                  {selectedMenu.carbs}
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginLeft: 2 }}>g</span>
                    </div>
                    </div>
                  </div>
          </div>

          {/* AI評価削除 */}

          {/* 店舗の地図表示 */}
          {isClient && selectedMenu && (() => {
            const shopData = menuData.find(item => item.shop === selectedMenu.shop && item.latitude && item.longitude);
            if (shopData) {
              return (
                <div style={{ marginTop: 30, marginBottom: 30 }}>
                  <h2 style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginBottom: 16 }}>店舗位置</h2>
                  <GoogleMap
                    menuData={[shopData]}
                    onShopClick={() => {}}
                  />
    </div>
  );
}
            return null;
          })()}

          {/* アクションボタン */}
          <div style={{ marginTop: 30, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* 経路を表示ボタン */}
            <button
              onClick={() => {
                console.log('[Google Maps] Button clicked');
                console.log('[Google Maps] selectedMenu:', selectedMenu);
                console.log('[Google Maps] selectedStore:', selectedStore);
                console.log('[Google Maps] userLocation:', userLocation);

                // selectedStoreは既にhandleMenuClickで設定されている
                if (selectedStore && selectedStore.location && userLocation) {
                  // Google Mapsで経路案内を開く（現在地から店舗まで・徒歩）
                  const mapsUrl = `https://www.google.com/maps/dir/${userLocation.lat},${userLocation.lng}/${selectedStore.location.lat},${selectedStore.location.lng}/@${userLocation.lat},${userLocation.lng},17z/data=!3m1!4b1!4m2!4m1!3e2`;

                  console.log('[Google Maps] Opening URL (walking):', mapsUrl);
                  console.log('[Google Maps] From:', userLocation);
                  console.log('[Google Maps] To:', selectedStore.name, selectedStore.location);

                  window.open(mapsUrl, '_blank');
                } else if (selectedStore && selectedStore.location) {
                  // userLocationがない場合は目的地のみ
                  const mapsUrl = `https://www.google.com/maps/dir//${selectedStore.location.lat},${selectedStore.location.lng}/@${selectedStore.location.lat},${selectedStore.location.lng},17z/data=!3m1!4b1!4m2!4m1!3e2`;
                  console.log('[Google Maps] Opening URL (no origin, walking):', mapsUrl);
                  window.open(mapsUrl, '_blank');
                } else {
                  // 店舗情報が見つからない場合はアラート
                  alert('店舗情報が見つかりませんでした。');
                  console.error('[Google Maps] Store not found');
                  console.error('[Google Maps] selectedStore:', selectedStore);
                  console.error('[Google Maps] nearbyStores:', nearbyStores);
                  console.error('[Google Maps] selectedMenu.chainId:', selectedMenu?.chainId);
                }
              }}
              style={{
                padding: '14px 0',
                background: 'white',
                color: '#000',
                border: '2px solid #000',
                borderRadius: 12,
                fontSize: 16,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                width: '100%'
              }}
              onMouseEnter={e => {
                e.target.style.background = '#f9fafb';
              }}
              onMouseLeave={e => {
                e.target.style.background = 'white';
              }}
            >
              経路を表示
            </button>

            {/* このメニューに決定（記録）ボタン */}
            <button
              onClick={() => {
                // 食事記録をtodayNutritionに追加
                const mealRecord = {
                  menu: selectedMenu.menu,
                  shop: selectedMenu.shop,
                  calories: selectedMenu.calories,
                  protein: selectedMenu.protein,
                  fat: selectedMenu.fat,
                  carbs: selectedMenu.carbs,
                  timestamp: Date.now()
                };

                const updatedMeals = [...todayNutrition.meals, mealRecord];
                const updatedNutrition = {
                  date: new Date().toISOString().split('T')[0],
                  totalCalories: todayNutrition.totalCalories + selectedMenu.calories,
                  totalProtein: todayNutrition.totalProtein + selectedMenu.protein,
                  totalFat: todayNutrition.totalFat + selectedMenu.fat,
                  totalCarbs: todayNutrition.totalCarbs + selectedMenu.carbs,
                  meals: updatedMeals
                };

                setTodayNutrition(updatedNutrition);
                localStorage.setItem('todayNutrition', JSON.stringify(updatedNutrition));

                // 履歴にも追加
                const updatedHistory = [mealRecord, ...history];
                setHistory(updatedHistory);
                localStorage.setItem('mealHistory', JSON.stringify(updatedHistory));

                // ホームに戻る
                setCurrentSection('home');
                setSelectedMenu(null);
                setSelectedStore(null);
              }}
              style={{
                padding: '14px 0',
                background: '#000',
                color: 'white',
                border: '2px solid #000',
                borderRadius: 12,
                fontSize: 16,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                width: '100%'
              }}
              onMouseEnter={e => {
                e.target.style.background = '#333';
              }}
              onMouseLeave={e => {
                e.target.style.background = '#000';
              }}
            >
              このメニューに決定（記録）
            </button>
          </div>
        </div>
      )}

      {/* フィルターモーダル */}
      {showFilterModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20
          }}
          onClick={() => setShowFilterModal(false)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 16,
              padding: 24,
              maxWidth: 400,
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* モーダルヘッダー */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 24
            }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>
                フィルター設定
              </h2>
              <button
                onClick={() => setShowFilterModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 24,
                  color: '#6b7280',
                  cursor: 'pointer',
                  padding: 0,
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>

            {/* 並び替えセクション */}
            <div style={{ marginBottom: 24 }}>
              <label style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 600,
                color: '#374151',
                marginBottom: 8
              }}>
                ⇅ 並び替え
              </label>
              <select
                value={sortType}
                onChange={(e) => setSortType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#111827',
                  background: 'white',
                  cursor: 'pointer'
                }}
              >
                <option value="protein-efficiency">タンパク質効率順</option>
                <option value="protein-high">タンパク質が多い順</option>
                <option value="calories-low">カロリーが低い順</option>
                <option value="calories-high">カロリーが高い順</option>
              </select>
            </div>

            {/* カテゴリ絞り込みセクション */}
            <div style={{ marginBottom: 24 }}>
              <label style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 600,
                color: '#374151',
                marginBottom: 8
              }}>
                ☰ カテゴリ
              </label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#111827',
                  background: 'white',
                  cursor: 'pointer'
                }}
              >
                <option value="all">すべて</option>
                <option value="main">メインのみ</option>
                <option value="side">サイドのみ</option>
                <option value="drink">ドリンクのみ</option>
              </select>
            </div>

            {/* 適用ボタン */}
            <button
              onClick={() => setShowFilterModal(false)}
              style={{
                width: '100%',
                padding: '12px 24px',
                background: '#000',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#333'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#000'}
            >
              適用する
            </button>
          </div>
        </div>
      )}

      {/* カレンダーモーダル */}
      {showCalendarModal && (
        <div
          onClick={() => setShowCalendarModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: 16,
              padding: 24,
              maxWidth: 400,
              width: '100%'
            }}
          >
            {/* 年月選択 */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, justifyContent: 'center', alignItems: 'center' }}>
              <select
                value={selectedDate.getFullYear()}
                onChange={(e) => {
                  const newDate = new Date(selectedDate);
                  newDate.setFullYear(parseInt(e.target.value));
                  setSelectedDate(newDate);
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: 'white'
                }}
              >
                {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(year => (
                  <option key={year} value={year}>{year}年</option>
                ))}
              </select>

              <select
                value={selectedDate.getMonth()}
                onChange={(e) => {
                  const newDate = new Date(selectedDate);
                  newDate.setMonth(parseInt(e.target.value));
                  setSelectedDate(newDate);
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: 'white'
                }}
              >
                {Array.from({ length: 12 }, (_, i) => i).map(month => (
                  <option key={month} value={month}>{month + 1}月</option>
                ))}
              </select>
            </div>

            {(() => {
              const year = selectedDate.getFullYear();
              const month = selectedDate.getMonth();
              const firstDay = new Date(year, month, 1);
              const lastDay = new Date(year, month + 1, 0);
              const daysInMonth = lastDay.getDate();
              const startDayOfWeek = firstDay.getDay();

              const days = [];
              const today = new Date();
              today.setHours(0, 0, 0, 0);

              // 曜日ヘッダー
              const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

              return (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 8 }}>
                    {weekdays.map((day, i) => (
                      <div key={i} style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#666', padding: 8 }}>
                        {day}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
                    {Array.from({ length: startDayOfWeek }).map((_, i) => (
                      <div key={`empty-${i}`} />
                    ))}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const day = i + 1;
                      const date = new Date(year, month, day);
                      date.setHours(0, 0, 0, 0);
                      const isToday = date.getTime() === today.getTime();
                      const isSelected = date.toDateString() === selectedDate.toDateString();
                      const isFuture = date > today;

                      return (
                        <button
                          key={day}
                          onClick={() => {
                            if (!isFuture) {
                              setSelectedDate(new Date(year, month, day));
                              setShowCalendarModal(false);
                            }
                          }}
                          disabled={isFuture}
                          style={{
                            padding: 12,
                            borderRadius: 8,
                            border: isSelected ? '2px solid #000' : isToday ? '2px solid #667eea' : '1px solid #e5e7eb',
                            background: isFuture ? '#f5f5f5' : isSelected ? '#000' : isToday ? '#eff6ff' : 'white',
                            color: isFuture ? '#ccc' : isSelected ? 'white' : isToday ? '#667eea' : '#000',
                            fontSize: 14,
                            fontWeight: isSelected || isToday ? 700 : 400,
                            cursor: isFuture ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            opacity: isFuture ? 0.5 : 1
                          }}
                          onMouseEnter={(e) => {
                            if (!isFuture && !isSelected) {
                              e.currentTarget.style.background = '#f9fafb';
                              e.currentTarget.style.borderColor = '#667eea';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isFuture && !isSelected) {
                              e.currentTarget.style.background = isToday ? '#eff6ff' : 'white';
                              e.currentTarget.style.borderColor = isToday ? '#667eea' : '#e5e7eb';
                            }
                          }}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <button
              onClick={() => setShowCalendarModal(false)}
              style={{
                width: '100%',
                marginTop: 20,
                padding: 12,
                background: '#f3f4f6',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                color: '#374151',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#e5e7eb'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#f3f4f6'}
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* 手動入力モーダル */}
      {showManualInputModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 20
        }}
        onClick={() => setShowManualInputModal(false)}
        >
          <div style={{
            background: 'white',
            borderRadius: 20,
            padding: 24,
            maxWidth: 500,
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 20, color: '#000', textAlign: 'center' }}>
              手動で食事を記録
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* メニュー名 */}
              <div>
                <label style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'block' }}>
                  メニュー名 <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={manualInput.menu}
                  onChange={(e) => setManualInput({...manualInput, menu: e.target.value})}
                  placeholder="例: チキン南蛮定食"
                  style={{
                    width: '100%',
                    padding: 12,
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    fontSize: 16,
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#667eea'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#d1d5db'}
                />
              </div>

              {/* 店舗名 */}
              <div>
                <label style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'block' }}>
                  店舗名
                </label>
                <input
                  type="text"
                  value={manualInput.shop}
                  onChange={(e) => setManualInput({...manualInput, shop: e.target.value})}
                  placeholder="例: やよい軒"
                  style={{
                    width: '100%',
                    padding: 12,
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    fontSize: 16,
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#667eea'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#d1d5db'}
                />
              </div>

              {/* 栄養情報 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* カロリー */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'block' }}>
                    カロリー (kcal) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    value={manualInput.calories}
                    onChange={(e) => setManualInput({...manualInput, calories: e.target.value})}
                    placeholder="650"
                    style={{
                      width: '100%',
                      padding: 12,
                      border: '1px solid #d1d5db',
                      borderRadius: 8,
                      fontSize: 16,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = '#667eea'}
                    onBlur={(e) => e.currentTarget.style.borderColor = '#d1d5db'}
                  />
                </div>

                {/* タンパク質 */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'block' }}>
                    タンパク質 (g) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    value={manualInput.protein}
                    onChange={(e) => setManualInput({...manualInput, protein: e.target.value})}
                    placeholder="25"
                    style={{
                      width: '100%',
                      padding: 12,
                      border: '1px solid #d1d5db',
                      borderRadius: 8,
                      fontSize: 16,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = '#667eea'}
                    onBlur={(e) => e.currentTarget.style.borderColor = '#d1d5db'}
                  />
                </div>

                {/* 脂質 */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'block' }}>
                    脂質 (g) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    value={manualInput.fat}
                    onChange={(e) => setManualInput({...manualInput, fat: e.target.value})}
                    placeholder="20"
                    style={{
                      width: '100%',
                      padding: 12,
                      border: '1px solid #d1d5db',
                      borderRadius: 8,
                      fontSize: 16,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = '#667eea'}
                    onBlur={(e) => e.currentTarget.style.borderColor = '#d1d5db'}
                  />
                </div>

                {/* 炭水化物 */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'block' }}>
                    炭水化物 (g) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    value={manualInput.carbs}
                    onChange={(e) => setManualInput({...manualInput, carbs: e.target.value})}
                    placeholder="85"
                    style={{
                      width: '100%',
                      padding: 12,
                      border: '1px solid #d1d5db',
                      borderRadius: 8,
                      fontSize: 16,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = '#667eea'}
                    onBlur={(e) => e.currentTarget.style.borderColor = '#d1d5db'}
                  />
                </div>
              </div>
            </div>

            {/* ボタン */}
            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button
                onClick={() => {
                  setShowManualInputModal(false);
                  setManualInput({
                    menu: '',
                    shop: '',
                    calories: '',
                    protein: '',
                    fat: '',
                    carbs: ''
                  });
                }}
                style={{
                  flex: 1,
                  padding: 14,
                  background: '#f3f4f6',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#374151',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#e5e7eb'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#f3f4f6'}
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  // バリデーション
                  if (!manualInput.menu || !manualInput.calories || !manualInput.protein || !manualInput.fat || !manualInput.carbs) {
                    alert('必須項目を入力してください');
                    return;
                  }

                  // 今日の栄養データに追加
                  const newMeal = {
                    menu: manualInput.menu,
                    shop: manualInput.shop || '手動入力',
                    calories: parseFloat(manualInput.calories),
                    protein: parseFloat(manualInput.protein),
                    fat: parseFloat(manualInput.fat),
                    carbs: parseFloat(manualInput.carbs),
                    timestamp: new Date().toISOString()
                  };

                  const updatedNutrition = {
                    ...todayNutrition,
                    meals: [...todayNutrition.meals, newMeal],
                    totalCalories: todayNutrition.totalCalories + newMeal.calories,
                    totalProtein: todayNutrition.totalProtein + newMeal.protein,
                    totalFat: todayNutrition.totalFat + newMeal.fat,
                    totalCarbs: todayNutrition.totalCarbs + newMeal.carbs,
                    date: new Date().toISOString().split('T')[0]
                  };

                  setTodayNutrition(updatedNutrition);
                  localStorage.setItem('todayNutrition', JSON.stringify(updatedNutrition));

                  // モーダルを閉じて入力をリセット
                  setShowManualInputModal(false);
                  setManualInput({
                    menu: '',
                    shop: '',
                    calories: '',
                    protein: '',
                    fat: '',
                    carbs: ''
                  });

                  alert('食事を記録しました！');
                }}
                style={{
                  flex: 1,
                  padding: 14,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: 16,
                  fontWeight: 600,
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
                }}
              >
                記録する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gemini カメラモーダル */}
      {(showCamera || capturedImage || geminiRecommendation) && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.95)',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {/* カメラビュー - 全画面表示 */}
          {showCamera && !capturedImage && (
            <>
              {/* 全画面カメラビデオ */}
              <video
                id="gemini-camera-video"
                autoPlay
                playsInline
                ref={video => {
                  if (video && cameraStream) {
                    video.srcObject = cameraStream;
                  }
                }}
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  zIndex: 0
                }}
              />

              {/* 段階1-2: メニュー表をかざしてくださいのメッセージ - メニュー検出前のみ表示 */}
              {detectedMenuNames.length === 0 && (
                <div style={{
                  position: 'fixed',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  color: 'white',
                  fontSize: 20,
                  fontWeight: 700,
                  textAlign: 'center',
                  textShadow: '0 2px 8px rgba(0, 0, 0, 0.8)',
                  zIndex: 10001,
                  pointerEvents: 'none',
                  animation: 'blink 1.5s ease-in-out infinite',
                  whiteSpace: 'nowrap'
                }}>
                  メニュー表をかざしてください
                </div>
              )}

              {/* メニュー検出後: メニュー表の位置を緑線で囲む */}
              {detectedMenuNames.length > 0 && (
                <>
                  {/* メニュー表検出エリア（画面中央の70%）を緑色の枠で囲む */}
                  <div style={{
                    position: 'fixed',
                    top: '15%',
                    left: '10%',
                    width: '80%',
                    height: '60%',
                    border: '6px solid #00ff00',
                    borderRadius: 16,
                    boxShadow: '0 0 30px rgba(0, 255, 0, 0.8), inset 0 0 20px rgba(0, 255, 0, 0.2)',
                    zIndex: 10000,
                    pointerEvents: 'none',
                    animation: 'pulse 1s ease-in-out infinite'
                  }} />

                  {/* 四隅にコーナーマーカーを追加（よりAdobe Scan風）*/}
                  {[
                    { top: 'calc(15% - 3px)', left: 'calc(10% - 3px)', borderTop: '6px solid #00ff00', borderLeft: '6px solid #00ff00' },
                    { top: 'calc(15% - 3px)', right: 'calc(10% - 3px)', borderTop: '6px solid #00ff00', borderRight: '6px solid #00ff00' },
                    { bottom: 'calc(25% - 3px)', left: 'calc(10% - 3px)', borderBottom: '6px solid #00ff00', borderLeft: '6px solid #00ff00' },
                    { bottom: 'calc(25% - 3px)', right: 'calc(10% - 3px)', borderBottom: '6px solid #00ff00', borderRight: '6px solid #00ff00' }
                  ].map((style, i) => (
                    <div key={i} style={{
                      position: 'fixed',
                      width: 30,
                      height: 30,
                      zIndex: 10001,
                      pointerEvents: 'none',
                      ...style
                    }} />
                  ))}

                  {/* カウントダウン表示 (Adobe Scan風) */}
                  {countdown !== null ? (
                    <div style={{
                      position: 'fixed',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      fontSize: 120,
                      fontWeight: 900,
                      color: '#00ff00',
                      textShadow: '0 0 60px rgba(0, 255, 0, 0.8), 0 4px 20px rgba(0, 0, 0, 0.9)',
                      zIndex: 10002,
                      pointerEvents: 'none',
                      animation: 'pulse 0.5s ease-in-out'
                    }}>
                      {countdown}
                    </div>
                  ) : (
                    /* 検出成功メッセージ */
                    <div style={{
                      position: 'fixed',
                      top: 60,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'rgba(0, 255, 0, 0.9)',
                      color: 'white',
                      padding: '12px 32px',
                      borderRadius: 12,
                      fontSize: 18,
                      fontWeight: 700,
                      textAlign: 'center',
                      zIndex: 10001,
                      pointerEvents: 'none',
                      boxShadow: '0 4px 20px rgba(0, 255, 0, 0.5)'
                    }}>
                      ✓ メニュー表を検出しました
                    </div>
                  )}
                </>
              )}

              {/* 段階2-3: メニュー検出後、キャンセルボタン表示 (Adobe Scan風) */}
              {detectedMenuNames.length > 0 && (
                <div style={{
                  position: 'fixed',
                  bottom: 40,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 10001
                }}>
                  {/* キャンセルボタン */}
                  <button
                    onClick={cancelCountdown}
                    style={{
                      padding: '16px 48px',
                      background: 'rgba(0, 0, 0, 0.8)',
                      color: 'white',
                      border: '2px solid rgba(255, 255, 255, 0.5)',
                      borderRadius: 12,
                      fontSize: 18,
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)'
                    }}
                  >
                    キャンセル
                  </button>
                </div>
              )}

              {/* スキャン終了ボタン - メニュー検出前のみ表示 */}
              {detectedMenuNames.length === 0 && (
                <button
                  onClick={stopCamera}
                  style={{
                    position: 'fixed',
                    bottom: 40,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    padding: '16px 48px',
                    background: 'rgba(0, 0, 0, 0.7)',
                    color: 'white',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: 12,
                    fontSize: 16,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
                    zIndex: 10001
                  }}
                >
                  スキャン終了
                </button>
              )}
            </>
          )}

          {/* 撮影画像プレビュー & 分析中 */}
          {capturedImage && !geminiRecommendation && (
            <div style={{
              width: '90%',
              maxWidth: 500,
              background: 'white',
              borderRadius: 16,
              padding: 24,
              textAlign: 'center'
            }}>
              <img
                src={capturedImage}
                alt="Captured menu"
                style={{
                  width: '100%',
                  borderRadius: 12,
                  marginBottom: 20
                }}
              />
              {isAnalyzing ? (
                <div style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#667eea'
                }}>
                  メニューを分析中...
                </div>
              ) : (
                <button
                  onClick={retakePhoto}
                  style={{
                    padding: '12px 24px',
                    background: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  撮り直す
                </button>
              )}
            </div>
          )}

          {/* Gemini推薦結果 */}
          {geminiRecommendation && (
            <div style={{
              width: '90%',
              maxWidth: 600,
              maxHeight: '80vh',
              background: 'white',
              borderRadius: 16,
              padding: 24,
              overflow: 'auto'
            }}>
              <h2 style={{
                fontSize: 22,
                fontWeight: 800,
                color: '#111827',
                marginBottom: 20,
                textAlign: 'center'
              }}>
                おすすめメニュー
              </h2>
              <div style={{
                whiteSpace: 'pre-wrap',
                fontSize: 14,
                lineHeight: 1.8,
                color: '#374151',
                marginBottom: 24
              }}>
                {geminiRecommendation}
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={retakePhoto}
                  style={{
                    flex: 1,
                    padding: '12px 24px',
                    background: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  もう一度撮影
                </button>
                <button
                  onClick={() => {
                    setCapturedImage(null);
                    setGeminiRecommendation(null);
                    setShowCamera(false);
                  }}
                  style={{
                    flex: 1,
                    padding: '12px 24px',
                    background: '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  閉じる
                </button>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

