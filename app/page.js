"use client";
import { getProfile } from "../lib/profile.js";
import { getIdealRanges as getIdealRangesGoal } from "../lib/scoring.js";
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

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
  const [currentSection, setCurrentSection] = useState('login'); // 'login'|'terms'|'profile'|'goal-select'|'shop-select'|'results'|'menu-detail'
  const [isClient, setIsClient] = useState(false);

  // データ
  const [menuData, setMenuData] = useState([]);
  const [scoredMenus, setScoredMenus] = useState([]);
  const [selectedShop, setSelectedShop] = useState('');
  const [selectedMenu, setSelectedMenu] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [currentGoal, setCurrentGoal] = useState('stay');

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


  const handleSearch = () => {
    if (!birthYear || !birthMonth || !birthDay || !gender || !height || !weight) {
      alert('すべての項目を入力してください。');
      return;
    }
    // プロフィール入力の次は目的選択へ
    setShowProfileForm(false);
    setCurrentSection('goal-select');
  };

  const handleBack = () => {
    if (currentSection === 'terms') setCurrentSection('login');
    else if (currentSection === 'profile') { setShowProfileForm(false); setCurrentSection('login'); }
    else if (currentSection === 'mode-select') { setCurrentSection('goal-select'); }
    else if (currentSection === 'shop-select') { setCurrentSection('goal-select'); }
    else if (currentSection === 'goal-select') { setShowProfileForm(true); setCurrentSection('profile'); }
    else if (currentSection === 'results') setCurrentSection('shop-select');
    else if (currentSection === 'menu-detail') { setCurrentSection('shop-select'); setSelectedMenu(null); }
  };

  const handleMenuClick = (menu) => { setSelectedMenu(menu); setCurrentSection('menu-detail'); };

  /* ============ 判定・整形（核心） ============ */
  const buildResults = (list, profile) => {
    const isBulk = (profile.goal === 'bulk') || (currentGoal === 'bulk');
    const R = isBulk ? RANGES_BULK : RANGES_DIET;
    const CENTER = isBulk ? BULK_CENTER : DIET_CENTER;
    // 评分・スコアを廃止。単純な並び（カロリー昇順）に変更
    const simple = [...list].sort((a,b) => (a.calories ?? 0) - (b.calories ?? 0));
    return simple;
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
          <h1 style={{ ...styles.title, fontSize: 64 }}>BULK</h1>
          <p style={{ textAlign:'center', color:'#666', marginBottom: 30 }}>最適な食事をAIで見つけよう</p>
          <button style={styles.button} onClick={handleLogin}>Start</button>
        </div>
      )}

      {/* 目的選択 */}
      {currentSection === 'goal-select' && (
        <div style={styles.card}>
          <button onClick={handleBack} style={styles.backButton}>←</button>
          <h1 style={styles.title}>食事の目的</h1>
          <p style={{ textAlign:'center', color:'#666', marginBottom:20 }}>この目的は一覧の並びや判定に使われます</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:12, maxWidth:480, margin:'0 auto 16px' }}>
            <button type="button" onClick={async () => {
              const g = 'diet';
              setGoal(g);
              const profile = { birthYear, birthMonth, birthDay, gender, height: parseFloat(height), weight: parseFloat(weight), exerciseFrequency, exerciseTypes: selectedExerciseTypes, goal: g };
              setUserProfile(profile);
              // 減量メニューのみ取得
              const data = await fetchMenuData('減量');
              setMenuData(data);
              setCurrentSection('shop-select');
            }}
              style={{ height:80, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:16,
                       border: goal==='diet'?'2px solid #22c55e':'2px solid #e0e0e0', borderRadius:12,
                       background: goal==='diet'?'#f0fdf4':'white', color: goal==='diet'?'#166534':'#666', fontWeight: 700 }}>
              減量
            </button>
            <button type="button" onClick={async () => {
              const g = 'stay';
              setGoal(g);
              const profile = { birthYear, birthMonth, birthDay, gender, height: parseFloat(height), weight: parseFloat(weight), exerciseFrequency, exerciseTypes: selectedExerciseTypes, goal: g };
              setUserProfile(profile);
              // 現状維持メニューのみ取得
              const data = await fetchMenuData('現状維持');
              setMenuData(data);
              setCurrentSection('shop-select');
            }}
              style={{ height:80, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:16,
                       border: goal==='stay'?'2px solid #60a5fa':'2px solid #e0e0e0', borderRadius:12,
                       background: goal==='stay'?'#eff6ff':'white', color: goal==='stay'?'#1e3a8a':'#666', fontWeight: 700 }}>
              現状維持
            </button>
            <button type="button" onClick={async () => {
              const g = 'bulk';
              setGoal(g);
              const profile = { birthYear, birthMonth, birthDay, gender, height: parseFloat(height), weight: parseFloat(weight), exerciseFrequency, exerciseTypes: selectedExerciseTypes, goal: g };
              setUserProfile(profile);
              // バルクアップメニューのみ取得
              const data = await fetchMenuData('バルクアップ');
              setMenuData(data);
              setCurrentSection('shop-select');
            }}
              style={{ height:80, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:16,
                       border: goal==='bulk'?'2px solid #f97316':'2px solid #e0e0e0', borderRadius:12,
                       background: goal==='bulk'?'#fff7ed':'white', color: goal==='bulk'?'#9a3412':'#666', fontWeight: 700 }}>
              バルクアップ
            </button>
            <button type="button" onClick={async () => {
              const g = 'cheat';
              setGoal(g);
              const profile = { birthYear, birthMonth, birthDay, gender, height: parseFloat(height), weight: parseFloat(weight), exerciseFrequency, exerciseTypes: selectedExerciseTypes, goal: g };
              setUserProfile(profile);
              // チートメニューのみ取得
              const data = await fetchMenuData('チート');
              setMenuData(data);
              setCurrentSection('shop-select');
            }}
              style={{ height:80, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:16,
                       border: goal==='cheat'?'2px solid #f59e0b':'2px solid #e0e0e0', borderRadius:12,
                       background: goal==='cheat'?'#fffbeb':'white', color: goal==='cheat'?'#92400e':'#666', fontWeight: 700 }}>
              チート
            </button>
          </div>
          {/* 目的決定ボタンは廃止し、各ボタンで直接遷移 */}
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

          {/* 目的は別ステップへ移動 */}

          <button onClick={handleSearch}
            style={{ ...styles.button,
              opacity: (!birthYear||!birthMonth||!birthDay||!gender||!height||!weight||exerciseFrequency===''||!agreeTerms) ? 0.5 : 1,
              cursor: (!birthYear||!birthMonth||!birthDay||!gender||!height||!weight||exerciseFrequency===''||!agreeTerms) ? 'not-allowed' : 'pointer'
            }}
            disabled={!birthYear||!birthMonth||!birthDay||!gender||!height||!weight||exerciseFrequency===''||!agreeTerms}
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
          <h1 style={styles.title}>あなたに最適なメニューを解析</h1>
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

                {/* 地図表示 */}
                {isClient && (
                  <div style={{ marginBottom: 24 }}>
                    <GoogleMap
                      menuData={menuData}
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

                {/* メニュー一覧（シンプルなラベルのみ） */}
                <div style={{ marginTop: 20 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 16, textAlign: 'center' }}>メニュー一覧</h2>
                  <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight: 420, overflowY:'auto' }}>
                    {menuData.map((m, i) => (
                      <button
                        key={`${m.shop}-${m.menu}-${i}`}
                        onClick={() => { setSelectedMenu(m); setCurrentSection('menu-detail'); }}
                        style={{
                          padding:8, border:'1px solid #e5e7eb', borderRadius:8, background:'#fff',
                          color:'#111827', fontSize:14, fontWeight:700, textAlign:'left', cursor:'pointer'
                        }}
                        onMouseEnter={e=>{ e.currentTarget.style.borderColor='#667eea'; e.currentTarget.style.background='#f0f4ff'; }}
                        onMouseLeave={e=>{ e.currentTarget.style.borderColor='#e5e7eb'; e.currentTarget.style.background='#fff'; }}
                      >
                        {`${m.shop || ''}  -  ${m.menu || ''}`}
                      </button>
                    ))}
                  </div>
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
            <p style={{ textAlign:'center', color:'#666', marginBottom:30, fontSize:18 }}>{selectedMenu.shop} - {selectedMenu.category}</p>
          </div>

          {/* 評価ゲージ削除 */}
              
          {/* 栄養表示 */}
          <div className="detail-grid" style={{ background:'#f8f9fa', borderRadius:15, padding:24, marginBottom:24 }}>
            <h2 style={{ fontSize:20, fontWeight:'bold', color:'#333', marginBottom:20, textAlign:'center' }}>栄養成分</h2>
            {(() => {
              const activeRangesDetail = getActiveRangesForJudge((userProfile?.goal || currentGoal), gradeFilter);
              const kcalPassD = isMetricPass(selectedMenu.calories, activeRangesDetail, 'calories');
              const pPassD    = isMetricPass(selectedMenu.protein,  activeRangesDetail, 'protein');
              const fPassD    = isMetricPass(selectedMenu.fat,      activeRangesDetail, 'fat');
              const cPassD    = isMetricPass(selectedMenu.carbs,    activeRangesDetail, 'carbs');
              const idealRanges = ((userProfile?.goal || currentGoal) === 'bulk') ? RANGES_BULK.S : RANGES_DIET.S;
              return (
                <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
                  {/* エネルギー */}
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <div style={{ display:'flex', alignItems:'center' }}>
                      <span style={{ fontSize:16, fontWeight:'bold', color:'#333' }}>エネルギー</span>
                    </div>
                    <div className="chart">
                      <Bar value={selectedMenu.calories} unit="kcal" denom={1000} pass={kcalPassD}
                        idealLow={idealRanges.calories[0]} idealHigh={idealRanges.calories[1]} showLegend={true} />
                    </div>
                  </div>

                  {/* たんぱく質 */}
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <div style={{ display:'flex', alignItems:'center' }}>
                      <span style={{ fontSize:16, fontWeight:'bold', color:'#333', paddingLeft:'24px' }}>たんぱく質</span>
                </div>
                    <div className="chart">
                      <Bar name="たんぱく質" value={selectedMenu.protein} unit="g" denom={50} pass={pPassD}
                        idealLow={idealRanges.protein[0]} idealHigh={idealRanges.protein[1]} />
                </div>
                </div>

                  {/* 脂質 */}
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <div style={{ display:'flex', alignItems:'center' }}>
                      <span style={{ fontSize:16, fontWeight:'bold', color:'#333', paddingLeft:'24px' }}>脂質</span>
                    </div>
                    <div className="chart">
                      <Bar name="脂質" value={selectedMenu.fat} unit="g" denom={30} pass={fPassD}
                        idealLow={idealRanges.fat[0]} idealHigh={idealRanges.fat[1]} />
                </div>
              </div>
              
                  {/* 炭水化物 */}
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <div style={{ display:'flex', alignItems:'center' }}>
                      <span style={{ fontSize:16, fontWeight:'bold', color:'#333', paddingLeft:'24px' }}>炭水化物</span>
                    </div>
                    <div className="chart">
                      <Bar name="炭水化物" value={selectedMenu.carbs} unit="g" denom={120} pass={cPassD}
                        idealLow={idealRanges.carbs[0]} idealHigh={idealRanges.carbs[1]} />
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* AI評価削除 */}
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
