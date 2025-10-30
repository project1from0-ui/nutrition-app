"use client";
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { CHAIN_ID_TO_NAME } from '../lib/chain-mapping';

// Google Mapsはクライアントサイドのみで動作するため、dynamic importを使用
const GoogleMap = dynamic(() => import('./components/GoogleMap'), { ssr: false });

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

    // 5. 近隣チェーンがない場合でも全チェーンのメニューを取得
    let menuUrl;
    if (chains.length === 0) {
      console.warn('[Places API] 近くに対応店舗がありません - 全チェーンのメニューを表示します');
      // 全44チェーン店のメニューを取得（店舗なしとして表示）
      const allChains = 'hottomotto,starbucks,tacobell,ikinari,sukiya,nakau,hanamaru,bikkuri,hokkahokka,yayoiken,wendys,olive,coco,origin,krispykreme,kfc,cocos,subway,saintmarc,joyful,jollypasta,matsu,zetteria,tullys,dennys,doutor,burgerking,bigboy,firstkitchen,freshness,mcdonalds,misterdonut,mos,royalhost,lotteria,yoshinoya,ootoya,tenya,kourakuen,matsunoya,matsuya,kamakura,ringerhut,torikizoku';
      menuUrl = classification
        ? `/api/menus?chains=${allChains}&classification=${encodeURIComponent(classification)}`
        : `/api/menus?chains=${allChains}`;
    } else {
      // 6. メニューデータを取得
      menuUrl = classification
        ? `/api/menus?chains=${chains.join(',')}&classification=${encodeURIComponent(classification)}`
        : `/api/menus?chains=${chains.join(',')}`;
    }

    console.log('[メニュー取得] URL:', menuUrl);

    const menuRes = await fetch(menuUrl, { cache: 'no-store' });
    if (!menuRes.ok) {
      console.error('[メニュー取得] APIレスポンスエラー:', menuRes.status);
      return { menus: [], stores, userLocation: userLoc };
    }

    const data = await menuRes.json();
    if (!Array.isArray(data) || data.length === 0) {
      console.warn('[メニュー取得] データなし');
      return { menus: [], stores, userLocation: userLoc };
    }

    console.log(`[メニュー取得] 成功: ${data.length}件`);
    return { menus: data, stores, userLocation: userLoc };

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
  const [exerciseTypesList, setExerciseTypesList] = useState(['筋トレ','ヨガ','ランニング']);
  const [selectedExerciseTypes, setSelectedExerciseTypes] = useState([]);
  const [goal, setGoal] = useState('');       // 'diet' | 'bulk'

  // 画面
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [currentSection, setCurrentSection] = useState('login'); // 'login'|'terms'|'profile'|'mode-select'|'home'|'goal-select'|'loading'|'shop-select'|'results'|'menu-detail'|'directions'
  const [mode, setMode] = useState(''); // 'slim'|'keep'|'bulk'
  const [isClient, setIsClient] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [showTargetSettings, setShowTargetSettings] = useState(false);
  const [selectedStore, setSelectedStore] = useState(null); // 経路案内用の選択された店舗

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

  // フィルタ
  const [gradeFilter, setGradeFilter] = useState('ALL'); // 'ALL'|'S'|'A'|'B'|'C'|'D'
  const [shopGenreFilter, setShopGenreFilter] = useState('ALL'); // 'ALL' | ジャンル名
  const [shopCategoryFilter, setShopCategoryFilter] = useState('ALL'); // 'ALL' | カテゴリ名
  const [shopSearchQuery, setShopSearchQuery] = useState(''); // 店名フリーワード検索
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'map'


  useEffect(() => { setIsClient(true); }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = JSON.parse(localStorage.getItem('nutrition_profile') || '{}');
      const g = (saved.goal || 'stay');
      setCurrentGoal(g);
    } catch {}
  }, []);
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

  const handleLogin = () => { setShowProfileForm(true); setCurrentSection('profile'); };


  const handleSearch = async () => {
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
      exerciseTypes: selectedExerciseTypes
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
    const profile = { birthYear, birthMonth, birthDay, gender, height: parseFloat(height), weight: parseFloat(weight), exerciseFrequency, exerciseTypes: selectedExerciseTypes, goal: goalType };
    setUserProfile(profile);

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
        return prev + 5;
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

    // スコアの高い順にソートして上位10件を取得
    const top10 = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    console.log(`[buildResults] 分類: ${classification}, 対象メニュー数: ${list.length}, Top10選出完了`);
    if (top10.length > 0) {
      console.log('[buildResults] Top3メニュー:', top10.slice(0, 3).map(m => ({
        shop: m.shop,
        menu: m.menu,
        score: m.score.toFixed(2),
        cal: m.calories,
        protein: m.protein,
        fat: m.fat
      })));
    }

    return top10;
  };

  const styles = {
    container: {
      minHeight: '100vh',
      background: 'transparent',
      padding: 20,
      fontFamily: 'system-ui, -apple-system, sans-serif'
    },
    card: {
      maxWidth: 800,
      margin: '40px auto',
      background: 'white',
      borderRadius: 20,
      padding: 40,
      boxShadow: '0 20px 60px rgba(0,0,0,0.1)',
      position: 'relative'
    },
    title: { fontSize: 32, textAlign: 'center', marginBottom: 20, color: '#333' },
    button: {
      display: 'block', width: '100%', maxWidth: 300, margin: '20px auto', padding: '15px 30px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white', border: 'none', borderRadius: 10, fontSize: 16, cursor: 'pointer'
    },
    input: { width: '100%', padding: 12, marginBottom: 15, border: '2px solid #e0e0e0', borderRadius: 8, fontSize: 16 },
    pill: (active) => ({
      padding: '6px 10px', borderRadius: 999,
      border: `1px solid ${active ? '#667eea' : '#e5e7eb'}`,
      background: active ? '#eef2ff' : '#fff',
      color: active ? '#4338ca' : '#374151',
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

  return (
    <div className="container" style={styles.container}>
      {/* ログイン */}
      {currentSection === 'login' && (
        <div style={styles.card}>
          <p style={{ textAlign:'center', color:'#667eea', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>外食チェーンAI Agent</p>
          <img src="/logo.png" alt="BULK" style={{ width: '100%', maxWidth: 400, margin: '0 auto 8px', display: 'block' }} />
          <p style={{ textAlign:'center', color:'#666', marginBottom: 30 }}>最適な食事を一瞬で見つけよう</p>
          <button style={styles.button} onClick={handleLogin}>Start</button>
        </div>
      )}

      {/* Mode選択画面 */}
      {currentSection === 'mode-select' && (
        <div style={styles.card}>
          <button onClick={handleBack} style={styles.backButton}>←</button>
          <h1 style={{ ...styles.title, marginBottom: 40 }}>Mode</h1>

          {/* メインモードボタン（3つ） */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
            <button
              onClick={() => { setMode('slim'); setCurrentSection('home'); }}
              style={{
                padding: '24px 32px',
                background: mode === 'slim' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'white',
                color: mode === 'slim' ? 'white' : '#667eea',
                border: `2px solid ${mode === 'slim' ? 'transparent' : '#667eea'}`,
                borderRadius: 12,
                fontSize: 20,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={e => {
                if (mode !== 'slim') {
                  e.target.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                  e.target.style.color = 'white';
                }
              }}
              onMouseLeave={e => {
                if (mode !== 'slim') {
                  e.target.style.background = 'white';
                  e.target.style.color = '#667eea';
                }
              }}
            >
              SLIM（痩せたい）
            </button>

            <button
              onClick={() => { setMode('keep'); setCurrentSection('home'); }}
              style={{
                padding: '24px 32px',
                background: mode === 'keep' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'white',
                color: mode === 'keep' ? 'white' : '#667eea',
                border: `2px solid ${mode === 'keep' ? 'transparent' : '#667eea'}`,
                borderRadius: 12,
                fontSize: 20,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={e => {
                if (mode !== 'keep') {
                  e.target.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                  e.target.style.color = 'white';
                }
              }}
              onMouseLeave={e => {
                if (mode !== 'keep') {
                  e.target.style.background = 'white';
                  e.target.style.color = '#667eea';
                }
              }}
            >
              KEEP（体型を維持したい）
            </button>

            <button
              onClick={() => { setMode('bulk'); setCurrentSection('home'); }}
              style={{
                padding: '24px 32px',
                background: mode === 'bulk' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'white',
                color: mode === 'bulk' ? 'white' : '#667eea',
                border: `2px solid ${mode === 'bulk' ? 'transparent' : '#667eea'}`,
                borderRadius: 12,
                fontSize: 20,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={e => {
                if (mode !== 'bulk') {
                  e.target.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                  e.target.style.color = 'white';
                }
              }}
              onMouseLeave={e => {
                if (mode !== 'bulk') {
                  e.target.style.background = 'white';
                  e.target.style.color = '#667eea';
                }
              }}
            >
              BULK（筋肉を付けたい）
            </button>
          </div>
        </div>
      )}

      {/* ホーム画面 */}
      {currentSection === 'home' && (
        <div style={styles.card}>
          {/* ハンバーガーメニューボタン */}
          <button
            onClick={() => setShowMenu(!showMenu)}
            style={{
              position: 'fixed',
              top: 20,
              right: 20,
              width: 40,
              height: 40,
              background: 'white',
              border: '2px solid #667eea',
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
              e.target.style.background = '#667eea';
              Array.from(e.target.children).forEach(child => child.style.background = 'white');
            }}
            onMouseLeave={e => {
              e.target.style.background = 'white';
              Array.from(e.target.children).forEach(child => child.style.background = '#667eea');
            }}
          >
            <div style={{ width: 20, height: 2, background: '#667eea', transition: 'all 0.2s ease' }}></div>
            <div style={{ width: 20, height: 2, background: '#667eea', transition: 'all 0.2s ease' }}></div>
            <div style={{ width: 20, height: 2, background: '#667eea', transition: 'all 0.2s ease' }}></div>
          </button>

          {/* メニューパネル */}
          {showMenu && (
            <div style={{
              position: 'fixed',
              top: 70,
              right: 20,
              width: 250,
              background: 'white',
              border: '2px solid #667eea',
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
                  Mode設定
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
                  プロフィール編集
                </button>
              </div>
            </div>
          )}

          {/* 選択されたMode表示 */}
          {mode && (
            <div style={{
              textAlign: 'center',
              marginBottom: 30
            }}>
              <span style={{
                fontSize: 32,
                fontWeight: 800,
                color: '#111827'
              }}>
                {mode === 'slim' && 'SLIM'}
                {mode === 'keep' && 'KEEP'}
                {mode === 'bulk' && 'BULK'}
                {mode === 'other' && 'OTHER'}
              </span>
            </div>
          )}

          {/* メインアクションカード */}
          <div style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: 16,
            padding: 32,
            boxShadow: '0 8px 24px rgba(102, 126, 234, 0.3)',
            color: 'white',
            textAlign: 'center'
          }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>近隣メニューを解析</h2>
            <p style={{ fontSize: 14, marginBottom: 24, opacity: 0.9 }}>
              あなたに最適なメニューを見つけます
            </p>
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
                width: 120,
                height: 120,
                background: 'white',
                color: '#667eea',
                border: 'none',
                borderRadius: '50%',
                fontSize: 18,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                transition: 'all 0.2s ease',
                margin: '0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={e => {
                e.target.style.transform = 'scale(1.05)';
                e.target.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.2)';
              }}
              onMouseLeave={e => {
                e.target.style.transform = 'scale(1)';
                e.target.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
              }}
            >
              Search
            </button>
          </div>
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
        <div style={{ ...styles.card, maxWidth: '100%', padding: '20px' }}>
          <h1 style={{ ...styles.title, marginBottom: 20 }}>半径200m圏内で</h1>
          <h1 style={{ ...styles.title, marginTop: 0, marginBottom: 40 }}>あなたに最適なメニューを解析中</h1>

          {/* プログレスバー */}
          <div style={{
            width: '100%',
            maxWidth: 400,
            height: 8,
            background: '#e5e7eb',
            borderRadius: 999,
            overflow: 'hidden',
            margin: '0 auto 20px'
          }}>
            <div style={{
              width: `${loadingProgress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
              transition: 'width 0.5s ease-out',
              borderRadius: 999
            }} />
          </div>

          {/* パーセンテージ表示 */}
          <p style={{
            textAlign: 'center',
            fontSize: 18,
            fontWeight: 700,
            color: '#667eea',
            marginBottom: 20
          }}>
            {loadingProgress}%
          </p>

          <style jsx>{`
            @keyframes pulse {
              0%, 100% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.2); opacity: 0.7; }
            }
          `}</style>
        </div>
      )}

      {/* 規約はプロフィールページ下部へ統合 */}

      {/* プロフィール */}
      {currentSection === 'profile' && showProfileForm && (
       <div style={styles.card}>
         <button onClick={handleBack} style={styles.backButton}>←</button>
         <h1 style={styles.title}>プロフィール設定</h1>
          
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
                    padding:12, border: gender===g ? '2px solid #667eea':'2px solid #e0e0e0',
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

          {/* 位置情報の共有チェックボックス */}
          <div style={{ marginBottom:20, display:'flex', justifyContent:'center', alignItems:'center' }}>
            <input type="checkbox" id="allowLocationProfile" checked={allowLocation} onChange={e=>setAllowLocation(e.target.checked)} style={{ marginRight:10 }} required/>
            <label htmlFor="allowLocationProfile">位置情報の共有に同意します <span style={{ color:'red' }}>*</span></label>
          </div>

          {/* 目的は別ステップへ移動 */}

          <button onClick={handleSearch}
            style={{ ...styles.button,
              opacity: (!birthYear||!birthMonth||!birthDay||!gender||!height||!weight||exerciseFrequency===''||selectedExerciseTypes.length===0||!allowLocation) ? 0.5 : 1,
              cursor: (!birthYear||!birthMonth||!birthDay||!gender||!height||!weight||exerciseFrequency===''||selectedExerciseTypes.length===0||!allowLocation) ? 'not-allowed' : 'pointer'
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
          <h1 style={styles.title}>近隣Top5メニュー</h1>
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

                    // フィルタリング後のデータでTop10を計算して上位5件を表示
                    const top10 = buildResults(filteredMenuData, userProfile);
                    const displayMenus = top10.slice(0, 5);

                      return (
                        <>
                          {/* メニューリスト */}
                          <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight: 420, overflowY:'auto', marginBottom: 20, marginTop: 20 }}>
                            {displayMenus.map((m, i) => {
                              const isHighlighted = highlightedShop === m.shop;
                              const storeInfo = findStoreForMenu(m);

                              return (
                                <button
                                  key={`${m.shop}-${m.menu}-${i}`}
                                  onClick={() => handleMenuClick(m)}
                                  style={{
                                    padding:8,
                                    border: isHighlighted ? '2px solid #667eea' : '1px solid #e5e7eb',
                                    borderRadius:8,
                                    background: isHighlighted ? '#f0f4ff' : '#fff',
                                    color:'#111827', fontSize:14, fontWeight:700, textAlign:'left', cursor:'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    transition: 'all 0.2s ease'
                                  }}
                                  onMouseEnter={e=>{
                                    e.currentTarget.style.borderColor='#667eea';
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
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                      <span style={{ fontSize: 16, fontWeight: 800, color: '#667eea' }}>{i + 1}位</span>
                                      <span style={{ fontSize: 11, color: '#999', fontWeight: 500 }}>{m.shop || ''}</span>
                                    </div>
                                    <div style={{ fontSize: 14, color: '#111827', fontWeight: 600, paddingLeft: 4 }}>
                                      {m.menu || ''}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginLeft: 8, minWidth: 100 }}>
                                    {storeInfo ? (
                                      <>
                                        <div style={{ fontSize: 10, color: '#667eea', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                          {storeInfo.name}まで
                                        </div>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#667eea', whiteSpace: 'nowrap' }}>
                                          {storeInfo.distance}m
                                        </div>
                                      </>
                                    ) : (
                                      <div style={{ fontSize: 10, color: '#999', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                        店舗なし
                                      </div>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
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
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#667eea', whiteSpace: 'nowrap' }}>
                      {calculateDistance(35.7080, 139.7731, m.latitude, m.longitude)}m
                    </div>
                  )}
                </div>
              </button>
            ))}
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
            <h2 style={{ fontSize:22, fontWeight:800, color:'#111827', marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
              {selectedMenu.source === 'menuItemsHirokojiClass' && (
                <span style={{ fontSize:11, color:'#667eea', fontWeight:600, padding:'4px 8px', background:'#eff6ff', borderRadius:6 }}>公式</span>
              )}
              栄養成分
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

          {/* このメニューを食べるボタン */}
          <div style={{ marginTop: 30, textAlign: 'center' }}>
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
                padding: '16px 48px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: 12,
                fontSize: 16,
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={e => {
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 8px 20px rgba(102, 126, 234, 0.4)';
              }}
              onMouseLeave={e => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.3)';
              }}
            >
              このメニューに決定（経路を表示）
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

