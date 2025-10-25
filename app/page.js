"use client";
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Google Mapsはクライアントサイドのみで動作するため、dynamic importを使用
const GoogleMap = dynamic(() => import('./components/GoogleMap'), { ssr: false });

/* =========================
   Google Sheets 設定
========================= */
const SPREADSHEET_ID = '1n9tChizEkER2ERdI2Ca8MMCAhEUXx1iKrCZDA1gDA3A';
const API_KEY = 'AIzaSyC5VL8Mx5Doy3uVtSVZeThwMtXmi7u1LrM';
const RANGE = 'A2:G';

/* =========================
   S〜D判定レンジ（固定）
   基準：170cm/65kg想定の1食
========================= */
// バルク用
const RANGES_BULK = {
  S: { calories:[650,850], protein:[30,40], fat:[15,25], carbs:[80,110] },
  A: { calories:[600,950], protein:[25,45], fat:[12,28], carbs:[70,120] },
  B: { calories:[500,1050], protein:[20,50], fat:[10,30], carbs:[60,140] },
  C: { calories:[400,1200], protein:[15,55], fat:[5,35],  carbs:[50,160] }
};
const BULK_CENTER = { calories:750, protein:35, fat:20, carbs:95 }; // 並び順の理想中心

// ダイエット用（例：減量時の1食レンジ）
const RANGES_DIET = {
  S: { calories:[400,550], protein:[25,40], fat:[10,18], carbs:[40,70] },
  A: { calories:[350,600], protein:[20,45], fat:[8,20],  carbs:[35,80] },
  B: { calories:[300,650], protein:[18,50], fat:[6,22],  carbs:[30,90] },
  C: { calories:[250,700], protein:[15,55], fat:[5,25],  carbs:[25,100] }
};
const DIET_CENTER = { calories:475, protein:32, fat:14, carbs:55 };

/* =========================
   判定ヘルパー
========================= */
const inRange = (v, [lo, hi]) => Number.isFinite(v) && v >= lo && v <= hi;

const allInRanges = (m, r) =>
  inRange(m.calories, r.calories) &&
  inRange(m.protein,  r.protein)  &&
  inRange(m.fat,      r.fat)      &&
  inRange(m.carbs,    r.carbs);

const countInRanges = (m, r) =>
  (inRange(m.calories, r.calories) ? 1 : 0) +
  (inRange(m.protein,  r.protein)  ? 1 : 0) +
  (inRange(m.fat,      r.fat)      ? 1 : 0) +
  (inRange(m.carbs,    r.carbs)    ? 1 : 0);

// 等級・スコア機能は削除

// === 等級フィルタとゴールから、判定に使うレンジを返す ===
function getActiveRangesForJudge(goal, gradeFilter) {
  const R = goal === 'bulk' ? RANGES_BULK : RANGES_DIET;
  if (gradeFilter === 'ALL') {
    return R.S; // ALWAYS judge by S range when ALL
  }
  if (gradeFilter === 'D') {
    return null; // always fail
  }
  if (R[gradeFilter]) {
    return R[gradeFilter];
  }
  return R.S; // fallback
}

// === 指標ごとの pass 判定（レンジが null なら常に false） ===
function isMetricPass(value, activeRanges, metricKey) {
  if (!activeRanges) return false;
  const rng = activeRanges[metricKey];
  if (!rng) return false;
  return inRange(value, rng);
}

/* =========================
   データ取得
========================= */
const normalizeShop = (s) => (s || '')
  .replace(/\s/g, '')
  .replace(/\[[^\]]*\]/g, '')
  .toLowerCase();
async function fetchMenuData(classification = null) {
  try {
    const url = classification
      ? `/api/menus?classification=${encodeURIComponent(classification)}`
      : '/api/menus';
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      console.error('APIレスポンスエラー:', res.status);
      return [];
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return [];
    return data;
  } catch (e) {
    console.error('データ取得に失敗:', e);
    return [];
  }
}

/* =========================
   UIコンポーネント
========================= */
// Gauge, narrative and grade color removed per requirement

function Stat({ labelJa, unit, val, pass }) {
  const valueColor = pass ? '#2563eb' : '#dc2626';
  return (
    <div style={{
      width: 86, height: 78,
      background:'#f8f9fa', border:'1px solid #e5e7eb',
      borderRadius:8, display:'grid',
      gridTemplateRows:'auto auto auto',
      placeItems:'center', padding:6
    }}>
      <div style={{ fontSize:12, color:'#666', fontWeight:700, lineHeight:1.1, textAlign:'center' }}>
        {labelJa}
      </div>
      <div style={{ fontWeight:800, fontSize:17, color:valueColor, marginTop:2 }}>
        {Number.isFinite(val) ? val : '-'}
      </div>
      <div style={{ fontSize:10, color:'#9ca3af', marginTop:2, lineHeight:1 }}>
        {unit}
      </div>
    </div>
  );
}

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
  const [exerciseTypesList, setExerciseTypesList] = useState(['ウォーキング','ランニング','ウェイトトレーニング','ヨガ','水泳','サイクリング','HIIT','球技']);
  const [selectedExerciseTypes, setSelectedExerciseTypes] = useState([]);
  const [healthNotes, setHealthNotes] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [goal, setGoal] = useState('');       // 'diet' | 'bulk'

  // 画面
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [currentSection, setCurrentSection] = useState('login'); // 'login'|'terms'|'profile'|'goal-select'|'loading'|'shop-select'|'results'|'menu-detail'
  const [isClient, setIsClient] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // 位置情報
  const [allowLocation, setAllowLocation] = useState(true);
  const [userLocation, setUserLocation] = useState(null);

  // ハイライト
  const [highlightedShop, setHighlightedShop] = useState(null);

  // データ
  const [menuData, setMenuData] = useState([]);
  const [scoredMenus, setScoredMenus] = useState([]);
  const [selectedShop, setSelectedShop] = useState('');
  const [selectedMenu, setSelectedMenu] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [currentGoal, setCurrentGoal] = useState('stay');
  const [geminiEvaluatedMenus, setGeminiEvaluatedMenus] = useState([]);

  // BULK AI
  const [bulkAIQuery, setBulkAIQuery] = useState('');
  const [bulkAILoading, setBulkAILoading] = useState(false);
  const [bulkAIError, setBulkAIError] = useState('');
  const [accumulatedRequests, setAccumulatedRequests] = useState([]);

  // フィルタ
  const [gradeFilter, setGradeFilter] = useState('ALL'); // 'ALL'|'S'|'A'|'B'|'C'|'D'
  const [shopGenreFilter, setShopGenreFilter] = useState('ALL'); // 'ALL' | ジャンル名
  const [shopCategoryFilter, setShopCategoryFilter] = useState('ALL'); // 'ALL' | カテゴリ名
  const [shopSearchQuery, setShopSearchQuery] = useState(''); // 店名フリーワード検索
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'map'

  // 健康設定（オプション）
  const BASE_ALLERGIES = ['卵','乳','小麦','そば','落花生','えび','かに'];
  const BASE_CONDITIONS = ['高血圧','糖尿病','脂質異常症','痛風・高尿酸血症','慢性腎臓病','心疾患','妊娠・授乳中'];
  const [allergyList, setAllergyList] = useState(BASE_ALLERGIES);
  const [conditionList, setConditionList] = useState(BASE_CONDITIONS);
  const [selectedAllergies, setSelectedAllergies] = useState([]);
  const [selectedConditions, setSelectedConditions] = useState([]);

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
      fetchMenuData().then(data => {
      console.log('[FETCH OK] rows:', data.length);
          setMenuData(data);
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
      selectedAllergies,
      selectedConditions,
      healthNotes,
      agreeTerms
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

        // プロフィール入力の次はホーム画面へ
        setShowProfileForm(false);
        setCurrentSection('home');
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
    else if (currentSection === 'home') { setShowProfileForm(true); setCurrentSection('profile'); }
    else if (currentSection === 'mode-select') { setCurrentSection('goal-select'); }
    else if (currentSection === 'shop-select') { setCurrentSection('goal-select'); }
    else if (currentSection === 'goal-select') { setCurrentSection('home'); }
    else if (currentSection === 'results') setCurrentSection('shop-select');
    else if (currentSection === 'menu-detail') { setCurrentSection('shop-select'); setSelectedMenu(null); }
  };

  const handleMenuClick = (menu) => { setSelectedMenu(menu); setCurrentSection('menu-detail'); };

  // 目的選択時の共通処理
  const handleGoalSelection = async (goalType, classificationName) => {
    setGoal(goalType);
    const profile = { birthYear, birthMonth, birthDay, gender, height: parseFloat(height), weight: parseFloat(weight), exerciseFrequency, exerciseTypes: selectedExerciseTypes, goal: goalType };
    setUserProfile(profile);

    // ローディング画面へ移行
    setCurrentSection('loading');
    setLoadingProgress(0);

    // プログレスバーアニメーション
    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 200);

    // メニュー取得
    const data = await fetchMenuData(classificationName);
    setMenuData(data);
    setGeminiEvaluatedMenus([]); // リセット
    requestLocationIfAllowed();

    // 100%完了
    setLoadingProgress(100);
    clearInterval(progressInterval);

    // 少し待ってから画面遷移
    setTimeout(() => {
      setCurrentSection('shop-select');
    }, 500);
  };

  // BULK AI - 要望を追加して適用
  const handleAddRequest = async () => {
    if (!bulkAIQuery.trim()) {
      setBulkAIError('要望を入力してください');
      return;
    }

    const newRequest = bulkAIQuery.trim();
    const updatedRequests = [...accumulatedRequests, newRequest];
    setAccumulatedRequests(updatedRequests);
    setBulkAIQuery('');
    setBulkAILoading(true);
    setBulkAIError('');

    try {
      const classification = userProfile?.goal === 'diet' ? '減量' :
                            userProfile?.goal === 'stay' ? '現状維持' :
                            userProfile?.goal === 'bulk' ? 'バルクアップ' :
                            userProfile?.goal === 'cheat' ? 'チート' :
                            currentGoal === 'diet' ? '減量' :
                            currentGoal === 'stay' ? '現状維持' :
                            currentGoal === 'bulk' ? 'バルクアップ' : 'チート';

      const combinedRequest = updatedRequests.map((req, idx) => `${idx + 1}. ${req}`).join('\n');
      const newTop10 = await evaluateMenusWithBulkAI(combinedRequest, menuData, classification);
      setGeminiEvaluatedMenus(newTop10);
    } catch (error) {
      setBulkAIError(error.message || 'その要望には応えられません');
      console.error('[BULK AI] エラー:', error);
    } finally {
      setBulkAILoading(false);
    }
  };

  // BULK AI - 特定の要望を削除して再適用
  const handleRemoveRequest = async (index) => {
    const updatedRequests = accumulatedRequests.filter((_, i) => i !== index);
    setAccumulatedRequests(updatedRequests);

    // 要望が0件になった場合は元のランキングに戻す
    if (updatedRequests.length === 0) {
      setGeminiEvaluatedMenus([]);
      return;
    }

    // 残りの要望で再適用
    setBulkAILoading(true);
    setBulkAIError('');

    try {
      const classification = userProfile?.goal === 'diet' ? '減量' :
                            userProfile?.goal === 'stay' ? '現状維持' :
                            userProfile?.goal === 'bulk' ? 'バルクアップ' :
                            userProfile?.goal === 'cheat' ? 'チート' :
                            currentGoal === 'diet' ? '減量' :
                            currentGoal === 'stay' ? '現状維持' :
                            currentGoal === 'bulk' ? 'バルクアップ' : 'チート';

      const combinedRequest = updatedRequests.map((req, idx) => `${idx + 1}. ${req}`).join('\n');
      const newTop10 = await evaluateMenusWithBulkAI(combinedRequest, menuData, classification);
      setGeminiEvaluatedMenus(newTop10);
    } catch (error) {
      setBulkAIError(error.message || 'その要望には応えられません');
      console.error('[BULK AI] エラー:', error);
    } finally {
      setBulkAILoading(false);
    }
  };

  // BULK AI - すべての要望を適用
  const handleApplyAllRequests = async () => {
    if (accumulatedRequests.length === 0) {
      setBulkAIError('要望を追加してください');
      return;
    }

    setBulkAILoading(true);
    setBulkAIError('');

    try {
      const classification = userProfile?.goal === 'diet' ? '減量' :
                            userProfile?.goal === 'stay' ? '現状維持' :
                            userProfile?.goal === 'bulk' ? 'バルクアップ' :
                            userProfile?.goal === 'cheat' ? 'チート' :
                            currentGoal === 'diet' ? '減量' :
                            currentGoal === 'stay' ? '現状維持' :
                            currentGoal === 'bulk' ? 'バルクアップ' : 'チート';

      const combinedRequest = accumulatedRequests.map((req, idx) => `${idx + 1}. ${req}`).join('\n');
      const newTop10 = await evaluateMenusWithBulkAI(combinedRequest, menuData, classification);
      setGeminiEvaluatedMenus(newTop10);
    } catch (error) {
      setBulkAIError(error.message || 'その要望には応えられません');
      console.error('[BULK AI] エラー:', error);
    } finally {
      setBulkAILoading(false);
    }
  };

  // リセットハンドラー
  const handleResetRanking = () => {
    setGeminiEvaluatedMenus([]);
    setBulkAIQuery('');
    setBulkAIError('');
    setAccumulatedRequests([]);
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

  // Gemini APIでメニューを評価する関数
  const evaluateMenusWithGemini = async (menus, classification) => {
    try {
      const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp",
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "array",
            items: {
              type: "object",
              properties: {
                rank: { type: "integer" },
                menuId: { type: "string" },
                score: { type: "number" },
                reason: { type: "string" }
              },
              required: ["rank", "menuId", "score", "reason"]
            }
          }
        }
      });

      const menuData = menus.map((m, i) => ({
        id: `menu_${i}`,
        shop: m.shop,
        name: m.menu,
        calories: m.calories,
        protein: m.protein,
        fat: m.fat,
        carbs: m.carbs
      }));

      const goalDescription = {
        '減量': '低カロリーで高タンパク質、脂質を抑えたメニュー。300-550kcal、タンパク質20g以上、脂質15g以下が理想。',
        '現状維持': 'バランスの良いPFC比率（15%:25%:60%）のメニュー。500-750kcalが理想。',
        'バルクアップ': '高タンパク質で適度なカロリーのあるメニュー。650-950kcal、タンパク質35g以上が理想。脂質は抑えめ。',
        'チート': '高カロリーのメニュー。800kcal以上が理想。'
      };

      const prompt = `あなたは栄養の専門家です。以下の10個のメニューを「${classification}」という目的に対して評価し、最適な順に並べ替えてください。

目的の詳細: ${goalDescription[classification]}

メニューリスト:
${JSON.stringify(menuData, null, 2)}

各メニューに0-100の点数をつけ、点数の高い順に並べてください。評価理由は簡潔に50文字以内で説明してください。`;

      console.log('[Gemini] リクエスト送信中...');
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      const evaluatedMenus = JSON.parse(text);

      console.log('[Gemini] 評価結果:', evaluatedMenus);

      // 元のメニューデータとマージ
      const rerankedMenus = evaluatedMenus.map(evaluated => {
        const originalIndex = parseInt(evaluated.menuId.replace('menu_', ''));
        return {
          ...menus[originalIndex],
          geminiScore: evaluated.score,
          geminiRank: evaluated.rank,
          geminiReason: evaluated.reason
        };
      });

      return rerankedMenus;
    } catch (error) {
      console.error('[Gemini] エラー:', error);
      // エラー時は元のスコアリングにフォールバック
      return menus;
    }
  };

  // BULK AI用のGemini API呼び出し
  const evaluateMenusWithBulkAI = async (userRequest, menus, classification) => {
    try {
      const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp",
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              menus: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    rank: { type: "integer" },
                    menuId: { type: "string" },
                    score: { type: "number" },
                    reason: { type: "string" }
                  },
                  required: ["rank", "menuId", "score", "reason"]
                }
              }
            },
            required: ["success", "message"]
          }
        }
      });

      const menuData = menus.map((m, i) => ({
        id: `menu_${i}`,
        shop: m.shop,
        name: m.menu,
        category: m.category,
        calories: m.calories,
        protein: m.protein,
        fat: m.fat,
        carbs: m.carbs,
        price: m.price
      }));

      const goalDescription = {
        '減量': '低カロリーで高タンパク質、脂質を抑えたメニュー。300-550kcal、タンパク質20g以上、脂質15g以下が理想。',
        '現状維持': 'バランスの良いPFC比率（15%:25%:60%）のメニュー。500-750kcalが理想。',
        'バルクアップ': '高タンパク質で適度なカロリーのあるメニュー。650-950kcal、タンパク質35g以上が理想。脂質は抑えめ。',
        'チート': '高カロリーのメニュー。800kcal以上が理想。'
      };

      const prompt = `あなたは栄養の専門家です。ユーザーの以下の要望（複数ある場合はすべて）に応えて、適切なメニューを10個選んでランキング形式で提示してください。

【重要な制約】
- 現在の食事目的は「${classification}」です。この目的に合うメニューの中から選んでください。
- 目的の詳細: ${goalDescription[classification]}

【ユーザーの要望】
${userRequest}

【利用可能なメニュー一覧】
${JSON.stringify(menuData, null, 2)}

【指示】
1. **最優先事項**: ユーザーの要望を厳密に守ってください。例えば、「魚」と言われたら、必ず魚料理のみを選んでください。鶏肉や他の食材は絶対に選ばないでください。
2. ユーザーの要望（複数ある場合はすべての要望）を満たし、かつ「${classification}」という食事目的にも適したメニューを10個選んでください
3. 複数の要望がある場合は、すべての要望をバランスよく考慮してください
4. メニュー名、店舗名、カテゴリー名をよく見て、ユーザーの要望に合致するものだけを選んでください
5. 各メニューに1-100の点数をつけ、点数の高い順に並べてください
6. 評価理由は簡潔に50文字以内で説明してください（複数の要望に応えている場合はその旨も記載）
7. もしユーザーの要望に応えられるメニューが見つからない場合、または要望に合うメニューが10個未満の場合は、success: false, message: "その要望には応えられません" を返してください
8. 要望に応えられる場合は、success: true, message: "要望に応じたメニューを選定しました", menus: [...] を返してください`;

      console.log('[BULK AI] リクエスト送信中...');
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      const aiResponse = JSON.parse(text);

      console.log('[BULK AI] 評価結果:', aiResponse);

      if (!aiResponse.success) {
        throw new Error(aiResponse.message || 'その要望には応えられません');
      }

      // 元のメニューデータとマージ
      const rerankedMenus = aiResponse.menus.map(evaluated => {
        const originalIndex = parseInt(evaluated.menuId.replace('menu_', ''));
        return {
          ...menus[originalIndex],
          geminiScore: evaluated.score,
          geminiRank: evaluated.rank,
          geminiReason: evaluated.reason
        };
      });

      return rerankedMenus;
    } catch (error) {
      console.error('[BULK AI] エラー:', error);
      throw error;
    }
  };

  const buildResults = (list, profile) => {
    const classification = profile?.goal === 'diet' ? '減量' :
                          profile?.goal === 'stay' ? '現状維持' :
                          profile?.goal === 'bulk' ? 'バルクアップ' :
                          profile?.goal === 'cheat' ? 'チート' :
                          currentGoal === 'diet' ? '減量' :
                          currentGoal === 'stay' ? '現状維持' :
                          currentGoal === 'bulk' ? 'バルクアップ' :
                          currentGoal === 'cheat' ? 'チート' : '現状維持';

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
      {(() => {
        const activeGoal = (userProfile?.goal || goal || currentGoal);
        if (!activeGoal) return null;
        if (!['shop-select','results','menu-detail'].includes(currentSection)) return null;
        const map = {
          diet:  { label: '減量モード',     bg: '#dcfce7', color: '#166534' },
          stay:  { label: '現状維持モード', bg: '#e5e7eb', color: '#111827' },
          bulk:  { label: 'バルクアップモード', bg: '#fff7ed', color: '#9a3412' },
          cheat: { label: 'チートモード',   bg: '#fffbeb', color: '#92400e' },
        };
        const style = map[activeGoal] || map.diet;
        return (
          <div style={{
            position:'fixed', top:12, left:'50%', transform:'translateX(-50%)',
            zIndex:1000, fontWeight:900, fontSize:24, color:'#111827'
          }}>
            {style.label}
          </div>
        );
      })()}
      {/* ログイン */}
      {currentSection === 'login' && (
        <div style={styles.card}>
          <img src="/logo.png" alt="BULK" style={{ width: '100%', maxWidth: 400, margin: '0 auto 20px', display: 'block' }} />
          <p style={{ textAlign:'center', color:'#666', marginBottom: 30 }}>最適な食事をAIで見つけよう</p>
          <button style={styles.button} onClick={handleLogin}>Start</button>
        </div>
      )}

      {/* ホーム画面 */}
      {currentSection === 'home' && (
        <div style={styles.card}>
          <img src="/logo.png" alt="BULK" style={{ width: '100%', maxWidth: 400, margin: '0 auto 20px', display: 'block' }} />
          <h1 style={{ ...styles.title, marginBottom: 12 }}>ようこそ、BULKへ</h1>
          <p style={{ textAlign:'center', color:'#666', marginBottom: 40, fontSize: 16 }}>
            AIがあなたに最適な食事を提案します
          </p>

          {/* メインアクションカード */}
          <div style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: 16,
            padding: 32,
            marginBottom: 24,
            boxShadow: '0 8px 24px rgba(102, 126, 234, 0.3)',
            color: 'white',
            textAlign: 'center'
          }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>近隣メニュー解析</h2>
            <p style={{ fontSize: 14, marginBottom: 24, opacity: 0.9 }}>
              半径200m圏内のレストランから<br />あなたの目的に合ったメニューを見つけます
            </p>
            <button
              onClick={() => setCurrentSection('goal-select')}
              style={{
                width: '100%',
                padding: '16px 32px',
                background: 'white',
                color: '#667eea',
                border: 'none',
                borderRadius: 12,
                fontSize: 16,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={e => {
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.2)';
              }}
              onMouseLeave={e => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
              }}
            >
              メニューを探す →
            </button>
          </div>

          {/* 機能紹介カード */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div style={{
              background: '#f8f9fa',
              borderRadius: 12,
              padding: 20,
              textAlign: 'center',
              border: '1px solid #e5e7eb'
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 4 }}>目的別提案</h3>
              <p style={{ fontSize: 12, color: '#6b7280' }}>減量・維持・増量</p>
            </div>
            <div style={{
              background: '#f8f9fa',
              borderRadius: 12,
              padding: 20,
              textAlign: 'center',
              border: '1px solid #e5e7eb'
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🤖</div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 4 }}>AI解析</h3>
              <p style={{ fontSize: 12, color: '#6b7280' }}>栄養バランス最適化</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{
              background: '#f8f9fa',
              borderRadius: 12,
              padding: 20,
              textAlign: 'center',
              border: '1px solid #e5e7eb'
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📍</div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 4 }}>位置情報連動</h3>
              <p style={{ fontSize: 12, color: '#6b7280' }}>近隣店舗を検索</p>
            </div>
            <div style={{
              background: '#f8f9fa',
              borderRadius: 12,
              padding: 20,
              textAlign: 'center',
              border: '1px solid #e5e7eb'
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 4 }}>詳細な栄養情報</h3>
              <p style={{ fontSize: 12, color: '#6b7280' }}>PFC バランス表示</p>
            </div>
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
            <button type="button" onClick={() => handleGoalSelection('cheat', 'チート')}
              style={{ height:80, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:16,
                       border: goal==='cheat'?'2px solid #f59e0b':'2px solid #e0e0e0', borderRadius:12,
                       background: goal==='cheat'?'#fffbeb':'white', color: goal==='cheat'?'#92400e':'#666', fontWeight: 700 }}>
              チート
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

          {/* 地図表示（全ピン） */}
          {isClient && menuData.length > 0 && (
            <div style={{ marginBottom: 30 }}>
              <GoogleMap
                menuData={menuData}
                onShopClick={() => {}}
              />
            </div>
          )}

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
              transition: 'width 0.3s ease',
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
            <label style={{ display:'block', marginBottom:8, fontWeight:'bold' }}>運動の種類（任意）</label>
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

          {/* オプション（任意） → 表示ラベルは削除し、疾患のみ任意で表示 */}
          <div style={{ marginBottom:12 }}>
            {/* 疾患（任意） */}
            <div style={{ marginBottom:8 }}>
              <label style={{ display:'block', marginBottom:8, fontWeight:'bold' }}>疾患（任意）</label>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {conditionList.map(name => {
                  const active = selectedConditions.includes(name);
                  return (
                    <button key={name} type="button" onClick={() => {
                        setSelectedConditions(prev => active ? prev.filter(x=>x!==name) : [...prev, name]);
                      }}
                      style={{ padding:'6px 10px', borderRadius:999, border:`2px solid ${active?'#06b6d4':'#e5e7eb'}`,
                               background: active?'#cffafe':'#fff', color: active?'#0e7490':'#374151', fontWeight:800, fontSize:12 }}>
                      {name}
                    </button>
                  );
                })}
                <button type="button" onClick={() => {
                const label = prompt('その他の疾患を入力');
                  const v = (label||'').trim();
                  if (!v) return;
                  if (!conditionList.includes(v)) setConditionList([...conditionList, v]);
                  if (!selectedConditions.includes(v)) setSelectedConditions([...selectedConditions, v]);
                }}
                  style={{ padding:'6px 10px', borderRadius:999, border:'2px dashed #cbd5e1', background:'#fff', color:'#334155', fontWeight:800, fontSize:12 }}>＋</button>
              </div>
            </div>
          </div>

          {/* 食事のこだわり（任意・自由記述） */}
          <div style={{ marginBottom:20 }}>
            <label style={{ display:'block', marginBottom:8, fontWeight:'bold' }}>食事のこだわり（任意）</label>
            <textarea
              value={healthNotes}
              onChange={e=>setHealthNotes(e.target.value)}
              placeholder="例）太ることを気にして普段から糖質を控えるようにしてい"
              rows={3}
              style={{ width:'100%', padding:12, border:'2px solid #e0e0e0', borderRadius:8, fontSize:14 }}
            />
          </div>

          {/* 規約文は非表示にし、同意チェックのみ表示 */}
          <div style={{ marginBottom:8, display:'flex', justifyContent:'center', alignItems:'center' }}>
            <input type="checkbox" id="agreeTermsProfile" checked={agreeTerms} onChange={e=>setAgreeTerms(e.target.checked)} style={{ marginRight:10 }} required/>
            <label htmlFor="agreeTermsProfile">AIによるデータ利用に同意します <span style={{ color:'red' }}>*</span></label>
          </div>

          {/* 位置情報の共有チェックボックス */}
          <div style={{ marginBottom:20, display:'flex', justifyContent:'center', alignItems:'center' }}>
            <input type="checkbox" id="allowLocationProfile" checked={allowLocation} onChange={e=>setAllowLocation(e.target.checked)} style={{ marginRight:10 }} required/>
            <label htmlFor="allowLocationProfile">位置情報の共有に同意します <span style={{ color:'red' }}>*</span></label>
          </div>

          {/* 目的は別ステップへ移動 */}

          <button onClick={handleSearch}
            style={{ ...styles.button,
              opacity: (!birthYear||!birthMonth||!birthDay||!gender||!height||!weight||exerciseFrequency===''||!agreeTerms||!allowLocation) ? 0.5 : 1,
              cursor: (!birthYear||!birthMonth||!birthDay||!gender||!height||!weight||exerciseFrequency===''||!agreeTerms||!allowLocation) ? 'not-allowed' : 'pointer'
            }}
            disabled={!birthYear||!birthMonth||!birthDay||!gender||!height||!weight||exerciseFrequency===''||!agreeTerms||!allowLocation}
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
          <h1 style={styles.title}>近隣メニュー解析結果</h1>
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
                    // Top10を計算
                    const top10 = buildResults(menuData, userProfile);

                      // Gemini評価を実行（stateが空の場合のみ）
                      if (top10.length > 0 && geminiEvaluatedMenus.length === 0) {
                        const classification = userProfile?.goal === 'diet' ? '減量' :
                                              userProfile?.goal === 'stay' ? '現状維持' :
                                              userProfile?.goal === 'bulk' ? 'バルクアップ' :
                                              userProfile?.goal === 'cheat' ? 'チート' :
                                              currentGoal === 'diet' ? '減量' :
                                              currentGoal === 'stay' ? '現状維持' :
                                              currentGoal === 'bulk' ? 'バルクアップ' : 'チート';

                        evaluateMenusWithGemini(top10, classification).then(evaluated => {
                          setGeminiEvaluatedMenus(evaluated);
                        });
                      }

                      // Gemini評価済みデータがあればそれを使用、なければtop10を使用
                      const displayMenus = geminiEvaluatedMenus.length > 0 ? geminiEvaluatedMenus : top10;

                      return (
                        <>
                          {/* 地図表示（Top10の店舗のみ） */}
                          {isClient && (
                            <div style={{ marginBottom: 16 }}>
                              <GoogleMap
                                menuData={displayMenus}
                                highlightedShop={highlightedShop}
                                onShopHover={(shop) => setHighlightedShop(shop)}
                                onShopClick={(shop) => {
                                  setSelectedShop(shop);
                                  const filtered = menuData.filter(item =>
                                    normalizeShop(item.shop).includes(normalizeShop(shop))
                                  );
                                  if (filtered.length === 0) return alert('この店舗のデータが見つかりません');
                                  const results = buildResults(filtered, userProfile);
                                  setScoredMenus(results);
                                  setGradeFilter('ALL');
                                  setShopCategoryFilter('ALL');
                                  setCurrentSection('menu-detail');
                                }}
                              />
                            </div>
                          )}

                          {/* タイトル */}
                          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 16, textAlign: 'center' }}>おすすめTop10メニュー</h2>

                          {/* メニューリスト */}
                          <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight: 420, overflowY:'auto', marginBottom: 20 }}>
                            {displayMenus.map((m, i) => {
                              const isHighlighted = highlightedShop === m.shop;
                              return (
                                <button
                                  key={`${m.shop}-${m.menu}-${i}`}
                                  onClick={() => { setSelectedMenu(m); setCurrentSection('menu-detail'); }}
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
                                      {m.source === 'menuItemsHirokojiClass' && (
                                        <span style={{ fontSize: 10, color: '#667eea', fontWeight: 600, padding: '2px 6px', background: '#eff6ff', borderRadius: 4 }}>公式</span>
                                      )}
                                    </div>
                                    <div style={{ fontSize: 14, color: '#111827', fontWeight: 600, paddingLeft: 4 }}>
                                      {m.menu || ''}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          {/* BULK AI入力欄 */}
                          <div style={{
                            padding: 16,
                            background: '#f8f9fa',
                            borderRadius: 12,
                            border: '1px solid #e5e7eb'
                          }}>
                            <h3 style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: '#667eea',
                              marginBottom: 12
                            }}>
                              BULK AI
                            </h3>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <input
                                type="text"
                                value={bulkAIQuery}
                                onChange={(e) => setBulkAIQuery(e.target.value)}
                                onKeyPress={(e) => {
                                  if (e.key === 'Enter' && !bulkAILoading) {
                                    handleAddRequest();
                                  }
                                }}
                                placeholder="例: あっさりしたものがいい、魚料理が食べたい"
                                disabled={bulkAILoading}
                                style={{
                                  flex: 1,
                                  padding: '10px 12px',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: 8,
                                  fontSize: 14,
                                  outline: 'none',
                                  transition: 'border-color 0.2s',
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#667eea'}
                                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                              />
                              <button
                                onClick={handleAddRequest}
                                disabled={bulkAILoading}
                                style={{
                                  padding: '10px 20px',
                                  background: bulkAILoading ? '#9ca3af' : '#667eea',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: 8,
                                  fontSize: 14,
                                  fontWeight: 700,
                                  cursor: bulkAILoading ? 'not-allowed' : 'pointer',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                要望
                              </button>
                            </div>

                            {/* 要望履歴 */}
                            {accumulatedRequests.length > 0 && (
                              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {accumulatedRequests.map((request, index) => (
                                  <div
                                    key={index}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      fontSize: 12,
                                      color: '#666',
                                      gap: 4
                                    }}
                                  >
                                    <button
                                      onClick={() => handleRemoveRequest(index)}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#999',
                                        cursor: 'pointer',
                                        fontSize: 14,
                                        padding: 0,
                                        lineHeight: 1
                                      }}
                                      title="削除"
                                    >
                                      ×
                                    </button>
                                    <span>{request}</span>
                                  </div>
                                ))}
                              </div>
                            )}
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
                
                <div className="title" style={{ fontSize:16, fontWeight:'bold', color:'#333', flex:1, marginLeft:32, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.menu}</div>
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
            <p style={{ textAlign:'center', color:'#666', marginBottom:20, fontSize:18 }}>{selectedMenu.shop} - {selectedMenu.category}</p>
          </div>

          {/* メニュー画像 */}
          <div style={{
            width: '100%',
            maxWidth: 500,
            height: 280,
            margin: '0 auto 30px',
            borderRadius: 16,
            overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
          }}>
            <img
              src={`https://source.unsplash.com/500x280/?${encodeURIComponent(selectedMenu.menu + ' food japanese')}`}
              alt={selectedMenu.menu}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
            <div style={{
              display: 'none',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              color: '#9ca3af',
              fontSize: 48
            }}>
              <span>🍽️</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{selectedMenu.menu}</span>
            </div>
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
            {(() => {
              const activeRangesDetail = getActiveRangesForJudge((userProfile?.goal || currentGoal), gradeFilter);
              const kcalPassD = isMetricPass(selectedMenu.calories, activeRangesDetail, 'calories');
              const pPassD    = isMetricPass(selectedMenu.protein,  activeRangesDetail, 'protein');
              const fPassD    = isMetricPass(selectedMenu.fat,      activeRangesDetail, 'fat');
              const cPassD    = isMetricPass(selectedMenu.carbs,    activeRangesDetail, 'carbs');
              const idealRanges = ((userProfile?.goal || currentGoal) === 'bulk') ? RANGES_BULK.S : RANGES_DIET.S;

              const nutrients = [
                { label:'エネルギー', value:selectedMenu.calories, unit:'kcal', denom:1000, pass:kcalPassD, idealLow:idealRanges.calories[0], idealHigh:idealRanges.calories[1] },
                { label:'たんぱく質', value:selectedMenu.protein, unit:'g', denom:50, pass:pPassD, idealLow:idealRanges.protein[0], idealHigh:idealRanges.protein[1] },
                { label:'脂質', value:selectedMenu.fat, unit:'g', denom:30, pass:fPassD, idealLow:idealRanges.fat[0], idealHigh:idealRanges.fat[1] },
                { label:'炭水化物', value:selectedMenu.carbs, unit:'g', denom:120, pass:cPassD, idealLow:idealRanges.carbs[0], idealHigh:idealRanges.carbs[1] }
              ];

              return (
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  {nutrients.map((n, idx) => (
                    <div key={idx} style={{ display:'flex', alignItems:'center', gap:16 }}>
                      <div style={{ width:100, fontSize:14, fontWeight:600, color:'#374151', textAlign:'right' }}>
                        {n.label}
                      </div>
                      <div style={{ flex:1, position:'relative' }}>
                        <div style={{
                          height:40,
                          background:'#f3f4f6',
                          borderRadius:8,
                          overflow:'hidden',
                          position:'relative',
                          border:`2px solid ${n.pass ? '#e5e7eb' : '#fca5a5'}`
                        }}>
                          <div style={{
                            width:`${Math.min((n.value / n.denom) * 100, 100)}%`,
                            height:'100%',
                            background:n.pass ? 'linear-gradient(90deg, #667eea, #764ba2)' : 'linear-gradient(90deg, #f093fb, #f5576c)',
                            transition:'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                            position:'relative'
                          }}>
                            <div style={{
                              position:'absolute',
                              right:12,
                              top:'50%',
                              transform:'translateY(-50%)',
                              fontSize:15,
                              fontWeight:700,
                              color:'white',
                              textShadow:'0 1px 2px rgba(0,0,0,0.2)'
                            }}>
                              {Number.isFinite(n.value) ? `${n.value} ${n.unit}` : '-'}
                            </div>
                          </div>
                        </div>
                        {!n.pass && (
                          <div style={{ position:'absolute', top:42, left:0, fontSize:11, color:'#dc2626', fontWeight:600 }}>
                            {n.value > n.idealHigh ? `+${(n.value - n.idealHigh).toFixed(0)}${n.unit} 超過` :
                             n.value < n.idealLow ? `-${(n.idealLow - n.value).toFixed(0)}${n.unit} 不足` : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* AI評価削除 */}

          {/* 決定ボタン */}
          <div style={{ marginTop: 40, textAlign: 'center' }}>
            <a
              href={(() => {
                const shopData = menuData.find(item => item.shop === selectedMenu.shop && item.latitude && item.longitude);
                if (shopData) {
                  return `https://www.google.com/maps/dir/?api=1&origin=35.7080,139.7731&destination=${shopData.latitude},${shopData.longitude}&travelmode=walking`;
                }
                return '#';
              })()}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                const shopData = menuData.find(item => item.shop === selectedMenu.shop && item.latitude && item.longitude);
                if (!shopData) {
                  e.preventDefault();
                  alert('この店舗の位置情報が見つかりません');
                }
              }}
              style={{
                display: 'inline-block',
                width: '100%',
                maxWidth: 400,
                padding: '16px 32px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: 12,
                fontSize: 18,
                fontWeight: 700,
                textDecoration: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(102, 126, 234, 0.3)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={e => {
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.4)';
              }}
              onMouseLeave={e => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 4px 16px rgba(102, 126, 234, 0.3)';
              }}
            >
              この店舗への経路を表示 🗺️
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================
   補助表示用バー
========================= */
// 置換：理想レンジの可視化を強化（ストライプ＋中央ラベル＋境界キャップ＋凡例）
function Bar({ name, value, unit = '', denom = 100, pass, idealLow, idealHigh, showLegend = false }) {
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const pct = clamp((value / denom) * 100, 0, 100);

  const barFill  = pass ? 'rgba(37, 99, 235, 0.35)' : 'rgba(220, 38, 38, 0.35)';
  const textColor = pass ? '#1e3a8a' : '#7f1d1d';

  // 理想レンジの描画要素は非表示

  let gapText = '';
  if (!pass && Number.isFinite(value)) {
    if (value > idealHigh) {
      gapText = `+${(value - idealHigh).toFixed(0)}${unit ? ` ${unit}` : ''}`;
    } else if (value < idealLow) {
      gapText = `-${(idealLow - value).toFixed(0)}${unit ? ` ${unit}` : ''}`;
    }
  }

  const BAR_H = 30;
  const RADIUS = BAR_H / 2;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            flex: 1,
            position: 'relative',
            background: '#f4f6fa',
            height: BAR_H,
            borderRadius: RADIUS,
            overflow: 'hidden',
            border: '1px solid #e5e7eb',
            marginLeft: (name === 'たんぱく質' || name === '脂質' || name === '炭水化物') ? '25%' : '10%',
          }}
        >
          {/* 理想レンジの表示は削除 */}

          {/* 実測バー（クリア色） */}
          <div
            style={{
              width: `${pct}%`,
                    height: '100%',
              background: barFill,
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.35)',
            }}
          />

          {/* 数値（左寄せ） */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
                    display: 'flex',
                    alignItems: 'center',
              justifyContent: 'flex-start',
              paddingLeft: 12,
            }}
          >
            <span
              style={{
                fontWeight: 800,
                fontSize: 18,
                color: textColor,
                background: 'rgba(255,255,255,0.6)',
                padding: '2px 10px',
                borderRadius: 999,
                backdropFilter: 'saturate(120%) blur(1px)',
              }}
            >
              {Number.isFinite(value) ? `${value}${unit ? ` ${unit}` : ''}` : '-'}
            </span>
                  </div>

          {/* ▼ 右端ギャップ表示（赤＆未クリアのときのみ） */}
          {gapText && (
            <div
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 12,
                fontWeight: 800,
                color: '#991b1b',
                background: 'rgba(255, 255, 255, 0.85)',
                padding: '2px 8px',
                borderRadius: 999,
                boxShadow: '0 0 0 1px rgba(153,27,27,0.15)',
              }}
              title="理想レンジ（S）との差"
            >
              {gapText}
                </div>
          )}

          {/* 理想レンジラベルは表示しない */}
              </div>
            </div>

      {/* 凡例は非表示 */}
    </div>
  );
}
