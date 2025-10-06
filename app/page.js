'use client';
import { useState, useEffect } from 'react';

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

// 汎用：指定レンジでS〜Dを返す（「AはS条件3項目以上」「BはA条件3項目以上」）
const getLetterByRanges = (m, R) => {
  if (allInRanges(m, R.S)) return 'S';
  if (allInRanges(m, R.A) && countInRanges(m, R.S) >= 3) return 'A';
  if (allInRanges(m, R.B) && countInRanges(m, R.A) >= 3) return 'B';
  if (allInRanges(m, R.C)) return 'C';
  return 'D';
};

// 理想中心への近さで並び替えのスコア（大→良）
const closenessScore = (m, CENTER, width = {cal:200, pro:10, fat:10, carb:30}) => {
  const norm = (v, c, w) => (v - c) / w; // 大まかな半幅
  const e = norm(m.calories, CENTER.calories, width.cal);
  const p = norm(m.protein,  CENTER.protein,  width.pro);
  const f = norm(m.fat,      CENTER.fat,      width.fat);
  const c = norm(m.carbs,    CENTER.carbs,    width.carb);
  const dist2 = e*e + p*p + f*f + c*c;
  return 10000 - Math.floor(dist2 * 10000);
};

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

// 置換：ゆるめのナラティブ生成
// 置換：少し長め＆栄養に軽く言及するナラティブ
function buildMenuNarrative(menu, profile, gradeFilter) {
  const goal = profile?.goal === 'diet' ? 'diet' : 'bulk';
  const R = goal === 'diet' ? RANGES_DIET : RANGES_BULK;
  const ideal = R.S; // 理想は常に S レンジ

  const inR = (val, [lo, hi]) => Number.isFinite(val) && val >= lo && val <= hi;

  const feel = (v, [lo, hi]) => {
    if (!Number.isFinite(v)) return 'ちょうど';
    const mid = (lo + hi) / 2;
    const tol = (hi - lo) / 3;
    if (v < mid - tol) return '控えめ';
    if (v > mid + tol) return 'しっかりめ';
    return 'ちょうど';
  };

  const kcalOk = inR(menu.calories, ideal.calories);
  const proOk  = inR(menu.protein,  ideal.protein);
  const fatOk  = inR(menu.fat,      ideal.fat);
  const carbOk = inR(menu.carbs,    ideal.carbs);
  const okCount = [kcalOk, proOk, fatOk, carbOk].filter(Boolean).length;

  const kcalFeel = feel(menu.calories, ideal.calories);
  const proFeel  = feel(menu.protein,  ideal.protein);
  const fatFeel  = feel(menu.fat,      ideal.fat);
  const carbFeel = feel(menu.carbs,    ideal.carbs);

  let intro;
  if (okCount >= 3) {
    intro = '全体のまとまりがよく、狙いに寄り添いやすい一皿です。';
  } else if (okCount === 2) {
    intro = '良いところと気になるところが半々で、状況に合わせて使いやすい一皿です。';
  } else {
    intro = 'やや個性強めの配置で、好みやシーンによって評価が分かれそうな一皿です。';
  }

  const lightNutriLine = `エネルギーは${kcalFeel}、タンパク質は${proFeel}。脂質は${fatFeel}で、炭水化物は${carbFeel}の印象です。`;

  let effect;
  if (goal === 'bulk') {
    if (proOk && kcalOk) {
      effect = '筋合成と回復の下支えになりやすく、トレーニング日のメインにも馴染みます。';
    } else if (proOk && !kcalOk) {
      effect = '材料は入りやすい一方で、満足感はやや控えめに感じるかもしれません。';
    } else if (!proOk && kcalOk) {
      effect = 'エネルギーは乗りますが、材料面は細め。満腹感と狙いのバランスに好みが出そうです。';
    } else {
      effect = '満足感優先の組み合わせになりやすく、鍛える目的が強い場合は好みが分かれます。';
    }
  } else {
    if (kcalOk && proOk && fatOk) {
      effect = '軽さと満足感のバランスがよく、日常にも取り入れやすい整い方です。';
    } else if (kcalOk && proOk) {
      effect = '重すぎず材料は確保でき、体調を崩しにくい穏やかなまとまりです。';
    } else if (kcalOk && !proOk) {
      effect = 'さらっと食べやすい一方で、材料は控えめ。タイミングに合わせて選びたい一皿です。';
    } else {
      effect = '味や満足感を優先したい日に向いていて、軽さ重視のときは他候補も比較すると安心です。';
    }
  }

  let wrap;
  if (okCount >= 3) wrap = '気負わず選べる仕上がりなので、今の目的にスッと馴染みます。';
  else if (okCount === 2) wrap = '小さな癖はありますが、使いどころを選べば心地よく収まりそうです。';
  else wrap = '今日はこの雰囲気を楽しみつつ、別の選択肢も視野に入れると良さそうです。';

  return `${intro}\n${lightNutriLine}\n${effect}\n${wrap}`;
}

const getGradeColor = (letter) => {
  switch (letter) {
    case 'S': return '#d4af37'; // gold
    case 'A': return '#22c55e'; // green
    case 'B': return '#eab308'; // yellow
    case 'C': return '#f97316'; // orange
    default:  return '#ef4444'; // red
  }
};

/* =========================
   データ取得
========================= */
const normalizeShop = (s) => (s || '')
  .replace(/\s/g, '')
  .replace(/\[[^\]]*\]/g, '')
  .toLowerCase();
async function fetchMenuData() {
  try {
    const res = await fetch('/api/menus', { cache: 'no-store' });
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
function Gauge({ letter, size=200 }) {
  const strokeWidth = 16;
  const r = (size - strokeWidth) / 2;
  const cir = 2 * Math.PI * r;
  const ratio = ({S:1, A:0.85, B:0.7, C:0.5, D:0.3}[letter]) ?? 0.3;
  const color = getGradeColor(letter);
  return (
    <svg width="140" height="140" viewBox={`0 0 ${size} ${size}`} style={{ display:'block' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="#ffffff" stroke="#e5e7eb" strokeWidth={strokeWidth}/>
      <circle
        cx={size/2} cy={size/2} r={r}
        fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={cir} strokeDashoffset={cir*(1-ratio)}
        transform={`rotate(-90 ${size/2} ${size/2})`}
      />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="64" fontWeight="700" fill="#111827">
        {letter}
      </text>
    </svg>
  );
}

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
    "ファミリーレストラン ジョイフル [Joyfull]",
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
    "ゼッテリア"
  ];

  // プロフィール
  const [birthYear, setBirthYear] = useState('2000');
  const [birthMonth, setBirthMonth] = useState('1');
  const [birthDay, setBirthDay] = useState('1');
  const [gender, setGender] = useState('');
  const [height, setHeight] = useState('170');
  const [weight, setWeight] = useState('65'); // 65kgを初期値に
  const [goal, setGoal] = useState('');       // 'diet' | 'bulk'

  // 画面
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [currentSection, setCurrentSection] = useState('login'); // 'login'|'terms'|'profile'|'shop-select'|'results'|'menu-detail'
  const [isClient, setIsClient] = useState(false);

  // データ
  const [menuData, setMenuData] = useState([]);
  const [scoredMenus, setScoredMenus] = useState([]);
  const [selectedShop, setSelectedShop] = useState('');
  const [selectedMenu, setSelectedMenu] = useState(null);
  const [userProfile, setUserProfile] = useState(null);

  // フィルタ
  const [gradeFilter, setGradeFilter] = useState('ALL'); // 'ALL'|'S'|'A'|'B'|'C'|'D'

  useEffect(() => { setIsClient(true); }, []);
  useEffect(() => {
    if (!isClient) return;
    fetchMenuData().then(data => {
      console.log('[FETCH OK] rows:', data.length);
      setMenuData(data);
      if (data.length === 0) alert('データの取得に失敗しました。インターネット接続をご確認ください。');
    });
  }, [isClient]);

  const handleLogin = () => setCurrentSection('terms');

  const handleTermsAgree = () => {
    const agreed = document.getElementById('agreeTerms')?.checked;
    if (!agreed) return alert('利用規約に同意してください。');
    setShowProfileForm(true);
    setCurrentSection('profile');
  };

  const handleSearch = () => {
    if (!birthYear || !birthMonth || !birthDay || !gender || !height || !weight || !goal) {
      alert('すべての項目を入力してください。');
      return;
    }
    const profile = {
      birthYear,
      birthMonth,
      birthDay,
      gender,
      height: parseFloat(height),
      weight: parseFloat(weight),
      goal
    };
    setUserProfile(profile);
    setShowProfileForm(false);
    setCurrentSection('shop-select');
  };

  const handleBack = () => {
    if (currentSection === 'terms') setCurrentSection('login');
    else if (currentSection === 'profile') { setShowProfileForm(false); setCurrentSection('terms'); }
    else if (currentSection === 'shop-select') { setShowProfileForm(true); setCurrentSection('profile'); }
    else if (currentSection === 'results') setCurrentSection('shop-select');
    else if (currentSection === 'menu-detail') { setCurrentSection('results'); setSelectedMenu(null); }
  };

  const handleMenuClick = (menu) => { setSelectedMenu(menu); setCurrentSection('menu-detail'); };

  /* ============ 判定・整形（核心） ============ */
  const buildResults = (list, profile) => {
    const isBulk = profile.goal === 'bulk';
    const R = isBulk ? RANGES_BULK : RANGES_DIET;
    const CENTER = isBulk ? BULK_CENTER : DIET_CENTER;
    const enriched = list.map(m => ({
      ...m,
      letterGrade: getLetterByRanges(m, R),
      score: closenessScore(m, CENTER, isBulk ? {cal:200,pro:10,fat:10,carb:30} : {cal:100,pro:10,fat:6,carb:20})
    }));
    // S→A→B→C→D、同一等級内は理想中心に近い順
    const order = { S:0, A:1, B:2, C:3, D:4 };
    enriched.sort((a,b) => (order[a.letterGrade]-order[b.letterGrade]) || (b.score - a.score));
    return enriched;
  };

  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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

  if (!isClient) return null;

  return (
    <div style={styles.container}>
      {/* ログイン */}
      {currentSection === 'login' && (
        <div style={styles.card}>
          <h1 style={styles.title}>🥗 栄養成分検索アプリ</h1>
          <p style={{ textAlign:'center', color:'#666', marginBottom: 30 }}>目的に合った最適なメニューを見つけよう</p>
          <button style={styles.button} onClick={handleLogin}>Googleアカウントでログイン</button>
        </div>
      )}

      {/* 規約 */}
      {currentSection === 'terms' && (
        <div style={styles.card}>
          <button onClick={handleBack} style={{position:'absolute',top:20,left:20,background:'none',border:'none',fontSize:24,cursor:'pointer',color:'#667eea'}}>←</button>
          <h1 style={styles.title}>利用規約への同意</h1>
          <div style={{ background:'#f5f5f5', padding:20, borderRadius:10, marginBottom:20, maxHeight:200, overflowY:'auto' }}>
            <p style={{ lineHeight:1.6, color:'#666' }}>
              1. 個人情報は栄養計算のみに使用します。<br/>
              2. データはブラウザのローカルに保存されます。<br/>
              3. 栄養情報は参考値であり医学的助言ではありません。<br/>
              4. 著作権は開発者に帰属します。
            </p>
          </div>
          <div style={{ marginBottom:20 }}>
            <input type="checkbox" id="agreeTerms" style={{ marginRight:10 }}/>
            <label htmlFor="agreeTerms">上記の利用規約に同意します</label>
          </div>
          <button style={styles.button} onClick={handleTermsAgree}>次へ進む</button>
        </div>
      )}

      {/* プロフィール */}
      {currentSection === 'profile' && showProfileForm && (
        <div style={styles.card}>
          <button onClick={handleBack} style={{position:'absolute',top:20,left:20,background:'none',border:'none',fontSize:24,cursor:'pointer',color:'#667eea'}}>←</button>
          <h1 style={styles.title}>プロフィール設定</h1>

          {/* 生年月日 */}
          <div style={{ marginBottom:20 }}>
            <label style={{ display:'block', marginBottom:8, fontWeight:'bold' }}>生年月日 <span style={{ color:'red' }}>*</span></label>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10 }}>
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
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10 }}>
              {['male','female','other'].map(g => (
                <button key={g} type="button" onClick={()=>setGender(g)}
                  style={{
                    padding:12, border: gender===g ? '2px solid #667eea':'2px solid #e0e0e0',
                    borderRadius:8, background: gender===g ? '#f0f4ff':'white',
                    color: gender===g ? '#667eea':'#666', fontWeight: gender===g ? 'bold':'normal', cursor:'pointer'
                  }}
                >
                  {g==='male'?'男性':g==='female'?'女性':'その他'}
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

          {/* 目的 */}
          <div style={{ marginBottom:30 }}>
            <label style={{ display:'block', marginBottom:8, fontWeight:'bold' }}>食事の目的 <span style={{ color:'red' }}>*</span></label>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:10 }}>
              <button type="button" onClick={()=>setGoal('diet')}
                style={{ padding:20, border: goal==='diet'?'2px solid #22c55e':'2px solid #e0e0e0', borderRadius:8,
                         background: goal==='diet'?'#f0fdf4':'white', color: goal==='diet'?'#22c55e':'#666', fontWeight: goal==='diet'?'bold':'normal' }}>
                <div style={{ fontSize:24, marginBottom:8 }}>🥗</div>ダイエット
              </button>
              <button type="button" onClick={()=>setGoal('bulk')}
                style={{ padding:20, border: goal==='bulk'?'2px solid #f97316':'2px solid #e0e0e0', borderRadius:8,
                         background: goal==='bulk'?'#fff7ed':'white', color: goal==='bulk'?'#f97316':'#666', fontWeight: goal==='bulk'?'bold':'normal' }}>
                <div style={{ fontSize:24, marginBottom:8 }}>💪</div>バルクアップ
              </button>
            </div>
          </div>

          <button onClick={handleSearch}
            style={{ ...styles.button,
              opacity: (!birthYear||!birthMonth||!birthDay||!gender||!height||!weight||!goal) ? 0.5 : 1,
              cursor: (!birthYear||!birthMonth||!birthDay||!gender||!height||!weight||!goal) ? 'not-allowed' : 'pointer'
            }}
            disabled={!birthYear||!birthMonth||!birthDay||!gender||!height||!weight||!goal}
          >
            検索を開始
          </button>
        </div>
      )}

      {/* 店舗選択 */}
      {currentSection === 'shop-select' && (
        <div style={styles.card}>
          <button onClick={handleBack} style={{position:'absolute',top:20,left:20,background:'none',border:'none',fontSize:24,cursor:'pointer',color:'#667eea'}}>←</button>
          <h1 style={styles.title}>🏪 店舗を選択</h1>
          <p style={{ textAlign:'center', color:'#666', marginBottom:30 }}>栄養情報を見たい店舗を選んでください</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:10, maxWidth:400, margin:'0 auto' }}>
            {/* ▼ 追加：全店舗比較カード（小さめ） */}
            <button
              onClick={() => {
                setSelectedShop('__ALL__');
                const results = buildResults(menuData, userProfile);
                setScoredMenus(results);
                setGradeFilter('ALL');
                setCurrentSection('results');
              }}
              style={{
                padding: '12px',
                background: 'white',
                border: '2px dashed #c7d2fe',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 'bold',
                cursor: 'pointer',
                color: '#4338ca',
                display: 'block',
                maxWidth: '400px',
                margin: '0 auto 8px',
                opacity: 0.95
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#667eea';
                e.currentTarget.style.background = '#f5f7ff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#c7d2fe';
                e.currentTarget.style.background = 'white';
              }}
            >
              🔍 全店舗比較（ランキング）
            </button>
            {restaurantList.map((shop) => (
              <button key={shop}
                onClick={() => {
                  setSelectedShop(shop);
                  const filtered = menuData.filter(item =>
                    normalizeShop(item.shop).includes(normalizeShop(shop))
                  );
                  if (filtered.length === 0) return alert('この店舗のデータが見つかりません');
                  const results = buildResults(filtered, userProfile);
                  setScoredMenus(results);
                  setGradeFilter('ALL');
                  setCurrentSection('results');
                }}
                style={{ padding:15, background:'white', border:'2px solid #e0e0e0', borderRadius:10, fontSize:14, fontWeight:'bold', cursor:'pointer' }}
                onMouseEnter={e=>{ e.currentTarget.style.borderColor='#667eea'; e.currentTarget.style.background='#f0f4ff'; }}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor='#e0e0e0'; e.currentTarget.style.background='white'; }}
              >
                {shop}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 結果表示 */}
      {currentSection === 'results' && (
        <div style={styles.card}>
          <button onClick={handleBack} style={{position:'absolute',top:20,left:20,background:'none',border:'none',fontSize:24,cursor:'pointer',color:'#667eea'}}>←</button>
          <h1 style={styles.title}>
            🏆 {
              selectedShop
                ? (selectedShop === '__ALL__'
                    ? '全店舗のおすすめメニュー'
                    : `${selectedShop}のおすすめメニュー`)
                : 'おすすめメニュー'
            }
          </h1>

          {/* 等級フィルタ（このページに存在する等級のみ） */}
          {(() => {
            const gradeOrder = ['S','A','B','C','D'];
            const availableSet = new Set(scoredMenus.map(m => m.letterGrade));
            const availableGrades = gradeOrder.filter(g => availableSet.has(g));
            return (
              <div style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:16, flexWrap:'wrap' }}>
                {['ALL', ...availableGrades].map(g => (
                  <button key={g} onClick={()=>setGradeFilter(g)} style={styles.pill(gradeFilter===g)}>{g}</button>
                ))}
              </div>
            );
          })()}

          {/* プロフィール表示 */}
          {userProfile && (
            <div style={{ background:'linear-gradient(to right, #f0f4ff, #f0fdf4)', padding:16, borderRadius:12, marginBottom:24 }}>
              <div style={{ display:'flex', flexWrap:'wrap', gap:16, fontSize:14 }}>
                <div><b>生年月日:</b> {userProfile.birthYear}年{userProfile.birthMonth}月{userProfile.birthDay}日</div>
                <div><b>性別:</b> {userProfile.gender==='male'?'男性':userProfile.gender==='female'?'女性':'その他'}</div>
                <div><b>身長:</b> {userProfile.height} cm</div>
                <div><b>体重:</b> {userProfile.weight} kg</div>
                <div>
                  <b>目的:</b>{' '}
                  <span style={{
                    padding:'2px 8px', borderRadius:4, fontWeight:'bold',
                    background: userProfile.goal==='diet' ? '#dcfce7' : '#fed7aa',
                    color: userProfile.goal==='diet' ? '#166534' : '#9a3412'
                  }}>
                    {userProfile.goal==='diet'?'ダイエット':'バルクアップ'}
                  </span>
                </div>
              </div>
              <button onClick={()=>{ setShowProfileForm(true); setCurrentSection('profile'); }}
                style={{ marginTop:12, background:'none', border:'none', color:'#667eea', textDecoration:'underline', cursor:'pointer', fontSize:14 }}>
                プロフィールを変更
              </button>
            </div>
          )}

          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {(gradeFilter==='ALL' ? scoredMenus : scoredMenus.filter(m => m.letterGrade===gradeFilter)).map((m, i) => (
              <button key={`${m.menu}-${i}`} onClick={()=>handleMenuClick(m)}
                style={{
                  background:'white', border:'1px solid #e5e7eb', borderRadius:12, padding:16, textAlign:'left',
                  cursor:'pointer', display:'flex', alignItems:'center', gap:16, boxShadow:'0 2px 8px rgba(0,0,0,0.04)'
                }}
                onMouseEnter={e=>{ e.currentTarget.style.borderColor='#667eea'; e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.08)'; }}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor='#e5e7eb'; e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.04)'; }}
              >
                <div style={{ width:32, height:32, background:'linear-gradient(135deg, #667eea, #764ba2)', borderRadius:'50%', color:'#fff', display:'grid', placeItems:'center', fontWeight:700 }}>{i+1}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:16, fontWeight:'bold', color:'#333', marginBottom:4 }}>{m.menu}</div>
                  <div style={{ fontSize:14, color:'#666', marginBottom:6 }}>{m.shop} - {m.category}</div>
                </div>
                {(() => {
                  const activeRanges = getActiveRangesForJudge(userProfile?.goal, gradeFilter);
                  const kcalPass = isMetricPass(m.calories, activeRanges, 'calories');
                  const pPass    = isMetricPass(m.protein,  activeRanges, 'protein');
                  const fPass    = isMetricPass(m.fat,      activeRanges, 'fat');
                  const cPass    = isMetricPass(m.carbs,    activeRanges, 'carbs');
                  return (
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <Stat labelJa="エネルギー" unit="kcal" val={m.calories} pass={kcalPass}/>
                      <Stat labelJa="たんぱく質" unit="g"    val={m.protein}  pass={pPass}/>
                      <Stat labelJa="脂質"       unit="g"    val={m.fat}      pass={fPass}/>
                      <Stat labelJa="炭水化物"   unit="g"    val={m.carbs}    pass={cPass}/>
                    </div>
                  );
                })()}
                <div style={{ padding:'6px 12px', background:getGradeColor(m.letterGrade), color:'#fff', borderRadius:8, fontSize:18, fontWeight:900, letterSpacing:0.5, minWidth:42, textAlign:'center' }}>
                  {m.letterGrade}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 詳細 */}
      {currentSection === 'menu-detail' && selectedMenu && (
        <div style={styles.card}>
          <button onClick={handleBack} style={{position:'absolute',top:20,left:20,background:'none',border:'none',fontSize:24,cursor:'pointer',color:'#667eea'}}>←</button>
          <h1 style={styles.title}>{selectedMenu.menu}</h1>
          <p style={{ textAlign:'center', color:'#666', marginBottom:30, fontSize:18 }}>{selectedMenu.shop} - {selectedMenu.category}</p>

          {/* 栄養表示 */}
          <div style={{ background:'#f8f9fa', borderRadius:15, padding:24, marginBottom:24 }}>
            <h2 style={{ fontSize:20, fontWeight:'bold', color:'#333', marginBottom:20, textAlign:'center' }}>栄養成分</h2>
            {(() => {
              const activeRangesDetail = getActiveRangesForJudge(userProfile?.goal, gradeFilter);
              const kcalPassD = isMetricPass(selectedMenu.calories, activeRangesDetail, 'calories');
              const pPassD    = isMetricPass(selectedMenu.protein,  activeRangesDetail, 'protein');
              const fPassD    = isMetricPass(selectedMenu.fat,      activeRangesDetail, 'fat');
              const cPassD    = isMetricPass(selectedMenu.carbs,    activeRangesDetail, 'carbs');
              const idealRanges = (userProfile?.goal === 'diet') ? RANGES_DIET.S : RANGES_BULK.S;
              return (
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  <Bar name="エネルギー" value={selectedMenu.calories} unit="kcal" denom={1000} pass={kcalPassD}
                    idealLow={idealRanges.calories[0]} idealHigh={idealRanges.calories[1]} showLegend={true} />
                  <Bar name="たんぱく質" value={selectedMenu.protein} unit="g" denom={50} pass={pPassD}
                    idealLow={idealRanges.protein[0]} idealHigh={idealRanges.protein[1]} />
                  <Bar name="脂質" value={selectedMenu.fat} unit="g" denom={30} pass={fPassD}
                    idealLow={idealRanges.fat[0]} idealHigh={idealRanges.fat[1]} />
                  <Bar name="炭水化物" value={selectedMenu.carbs} unit="g" denom={120} pass={cPassD}
                    idealLow={idealRanges.carbs[0]} idealHigh={idealRanges.carbs[1]} />
                </div>
              );
            })()}
          </div>

          {/* AI評価 */}
          <div style={{ ...styles.aiEvalCard }}>
            <div style={styles.aiEvalLabel}>AI総合評価</div>
            <div style={{ width:140, height:140, marginLeft:40 }}>
              <Gauge letter={selectedMenu.letterGrade}/>
            </div>
            <div style={{ marginLeft: 24, flex: 1 }}>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: '#374151', fontSize: 14 }}>
                {buildMenuNarrative(selectedMenu, userProfile, gradeFilter)}
              </div>
            </div>
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
        <div style={{ width: 150, fontSize: 16, fontWeight: 'bold', color: '#333' }}>{name}</div>
        <div
          style={{
            flex: 1,
            position: 'relative',
            background: '#f4f6fa',
            height: BAR_H,
            borderRadius: RADIUS,
            overflow: 'hidden',
            border: '1px solid #e5e7eb',
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
