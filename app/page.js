'use client';
import { useState, useEffect } from 'react';

// Google Sheets設定
const SPREADSHEET_ID = '1n9tChizEkER2ERdI2Ca8MMCAhEUXx1iKrCZDA1gDA3A';
const API_KEY = 'AIzaSyC5VL8Mx5Doy3uVtSVZeThwMtXmi7u1LrM';
const RANGE = 'A2:I100';

// Googleスプレッドシートからデータを取得
async function fetchMenuData() {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}?key=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.values) {
      console.error('データが見つかりません');
      return [];
    }
    
    return data.values.map(row => ({
      shop: row[0] || '',
      category: row[1] || '',
      menu: row[2] || '',
      size: row[3] || '',
      calories: parseFloat(row[4]) || 0,
      protein: parseFloat(row[5]) || 0,
      fat: parseFloat(row[6]) || 0,
      carbs: parseFloat(row[7]) || 0,
      salt: parseFloat(row[8]) || 0
    }));
  } catch (error) {
    console.error('データ取得エラー:', error);
    return [];
  }
}
export default function Home() {
  const [currentSection, setCurrentSection] = useState('login');
  const [userProfile, setUserProfile] = useState(null);
  const [menuData, setMenuData] = useState([]);
  const [scoredMenus, setScoredMenus] = useState([]);

  // サンプルデータ（10店舗分）
  const sampleMenuData = [
    {
      shop: "マクドナルド",
      category: "バーガー",
      menu: "ビッグマック",
      size: "レギュラー",
      calories: 525,
      protein: 26,
      fat: 28.3,
      carbs: 41.8,
      salt: 2.6
    },
    {
      shop: "吉野家",
      category: "牛丼",
      menu: "牛丼並盛",
      size: "並",
      calories: 635,
      protein: 20,
      fat: 23,
      carbs: 89,
      salt: 2.7
    },
    {
      shop: "サイゼリヤ",
      category: "パスタ",
      menu: "ミートソース",
      size: "レギュラー",
      calories: 580,
      protein: 22,
      fat: 18,
      carbs: 78,
      salt: 2.3
    },
    {
      shop: "スターバックス",
      category: "サンドイッチ",
      menu: "チキン&トマトサンドイッチ",
      size: "レギュラー",
      calories: 320,
      protein: 18,
      fat: 12,
      carbs: 35,
      salt: 1.8
    },
    {
      shop: "モスバーガー",
      category: "バーガー",
      menu: "モスバーガー",
      size: "レギュラー",
      calories: 361,
      protein: 16.1,
      fat: 16.6,
      carbs: 36.5,
      salt: 1.8
    },
    {
      shop: "すき家",
      category: "牛丼",
      menu: "牛丼ミニ",
      size: "ミニ",
      calories: 496,
      protein: 15.3,
      fat: 17.2,
      carbs: 69.1,
      salt: 2.0
    },
    {
      shop: "ガスト",
      category: "ハンバーグ",
      menu: "チーズハンバーグ",
      size: "レギュラー",
      calories: 680,
      protein: 32,
      fat: 35,
      carbs: 52,
      salt: 3.2
    },
    {
      shop: "ケンタッキー",
      category: "チキン",
      menu: "オリジナルチキン",
      size: "1ピース",
      calories: 237,
      protein: 18.3,
      fat: 14.7,
      carbs: 7.9,
      salt: 1.7
    },
    {
      shop: "松屋",
      category: "定食",
      menu: "豚汁定食",
      size: "並",
      calories: 690,
      protein: 25,
      fat: 22,
      carbs: 95,
      salt: 4.5
    },
    {
      shop: "ドトール",
      category: "サンドイッチ",
      menu: "ツナメルトサンド",
      size: "レギュラー",
      calories: 385,
      protein: 15.2,
      fat: 20.1,
      carbs: 35.8,
      salt: 2.1
    }
  ];

  useEffect(() => {
  // スプレッドシートからデータを取得
  fetchMenuData().then(data => {
    if (data.length > 0) {
      setMenuData(data);
      console.log('スプレッドシートからデータを取得しました:', data.length, '件');
    } else {
      // データ取得に失敗した場合はサンプルデータを使用
      setMenuData(sampleMenuData);
      console.log('サンプルデータを使用します');
    }
  });
}, []);

  const handleLogin = () => {
    setCurrentSection('terms');
  };

  const handleTermsAgree = () => {
    const agreed = document.getElementById('agreeTerms').checked;
    if (!agreed) {
      alert('利用規約に同意してください。');
      return;
    }
    setCurrentSection('profile');
  };

  const handleProfileSubmit = () => {
    const gender = document.getElementById('gender').value;
    const height = document.getElementById('height').value;
    const weight = document.getElementById('weight').value;
    const goal = document.getElementById('goal').value;

    if (!gender || !height || !weight || !goal) {
      alert('すべての項目を入力してください。');
      return;
    }

    const profile = {
      gender: gender,
      height: parseFloat(height),
      weight: parseFloat(weight),
      goal: goal
    };

    setUserProfile(profile);
    calculateAndDisplayResults(profile);
  };

  const calculateScore = (menu, profile) => {
    let score = 0;
    
    if (profile.goal === 'diet') {
      // ダイエット目的：低カロリー、高タンパクを優先
      score += (600 - menu.calories) * 0.3;
      score += menu.protein * 2;
      score -= menu.fat * 1.5;
      score -= menu.carbs * 0.5;
    } else {
      // バルクアップ目的：高カロリー、高タンパクを優先
      score += menu.calories * 0.1;
      score += menu.protein * 3;
      score += menu.carbs * 0.3;
    }
    
    // 塩分は両方で減点
    score -= menu.salt * 10;
    return Math.max(0, score);
  };

  const calculateAndDisplayResults = (profile) => {
    const scored = menuData.map(menu => ({
      ...menu,
      score: calculateScore(menu, profile)
    }));
    
    scored.sort((a, b) => b.score - a.score);
    setScoredMenus(scored);
    setCurrentSection('results');
  };

  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    },
    card: {
      maxWidth: '800px',
      margin: '40px auto',
      background: 'white',
      borderRadius: '20px',
      padding: '40px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.1)'
    },
    title: {
      fontSize: '32px',
      textAlign: 'center',
      marginBottom: '20px',
      color: '#333'
    },
    button: {
      display: 'block',
      width: '100%',
      maxWidth: '300px',
      margin: '20px auto',
      padding: '15px 30px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '10px',
      fontSize: '16px',
      cursor: 'pointer'
    },
    input: {
      width: '100%',
      padding: '12px',
      marginBottom: '15px',
      border: '2px solid #e0e0e0',
      borderRadius: '8px',
      fontSize: '16px'
    },
    menuCard: {
      background: '#f8f9fa',
      borderRadius: '15px',
      padding: '20px',
      marginBottom: '15px',
      position: 'relative'
    },
    nutritionGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      gap: '10px',
      marginTop: '15px'
    },
    nutritionItem: {
      textAlign: 'center',
      padding: '10px',
      background: 'white',
      borderRadius: '10px'
    },
    progressBar: {
      width: '100%',
      height: '25px',
      background: '#e0e0e0',
      borderRadius: '12px',
      overflow: 'hidden',
      marginBottom: '8px'
    }
  };

  return (
    <div style={styles.container}>
      {/* ログイン画面 */}
      {currentSection === 'login' && (
        <div style={styles.card}>
          <h1 style={styles.title}>🥗 栄養成分検索アプリ</h1>
          <p style={{ textAlign: 'center', color: '#666', marginBottom: '30px' }}>
            あなたの目的に合った最適なメニューを見つけましょう
          </p>
          <button style={styles.button} onClick={handleLogin}>
            Googleアカウントでログイン
          </button>
        </div>
      )}

      {/* 利用規約 */}
      {currentSection === 'terms' && (
        <div style={styles.card}>
          <h1 style={styles.title}>利用規約への同意</h1>
          <div style={{ 
            background: '#f5f5f5', 
            padding: '20px', 
            borderRadius: '10px', 
            marginBottom: '20px',
            maxHeight: '200px',
            overflowY: 'auto'
          }}>
            <p style={{ lineHeight: '1.6', color: '#666' }}>
              本アプリケーションを利用するにあたり、以下の規約に同意していただく必要があります：<br/><br/>
              1. 個人情報の取り扱い：入力された身長、体重等の情報は、栄養成分の最適化計算にのみ使用されます。<br/>
              2. データの保存：ユーザー情報はブラウザのローカルストレージに保存されます。<br/>
              3. 免責事項：提供される栄養情報は参考値であり、医学的なアドバイスではありません。<br/>
              4. 著作権：本アプリケーションの著作権は開発者に帰属します。
            </p>
          </div>
          <div style={{ marginBottom: '20px' }}>
            <input type="checkbox" id="agreeTerms" style={{ marginRight: '10px' }}/>
            <label htmlFor="agreeTerms">上記の利用規約に同意します</label>
          </div>
          <button style={styles.button} onClick={handleTermsAgree}>
            次へ進む
          </button>
        </div>
      )}

      {/* プロフィール入力 */}
      {currentSection === 'profile' && (
        <div style={styles.card}>
          <h1 style={styles.title}>プロフィール設定</h1>
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#555' }}>性別</label>
            <select id="gender" style={styles.input}>
              <option value="">選択してください</option>
              <option value="male">男性</option>
              <option value="female">女性</option>
            </select>
          </div>
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#555' }}>身長 (cm)</label>
            <input type="number" id="height" placeholder="例: 170" style={styles.input}/>
          </div>
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#555' }}>体重 (kg)</label>
            <input type="number" id="weight" placeholder="例: 65" style={styles.input}/>
          </div>
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#555' }}>食事の目的</label>
            <select id="goal" style={styles.input}>
              <option value="">選択してください</option>
              <option value="diet">ダイエット（減量）</option>
              <option value="bulk">バルクアップ（増量）</option>
            </select>
          </div>
          
          <button style={styles.button} onClick={handleProfileSubmit}>
            メニューを検索
          </button>
        </div>
      )}

      {/* 結果表示 */}
      {currentSection === 'results' && (
        <div style={styles.card}>
          <h1 style={styles.title}>🏆 あなたにおすすめのメニュー</h1>
          
          {scoredMenus.map((menu, index) => (
            <div key={index} style={styles.menuCard}>
              <div style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                width: '40px',
                height: '40px',
                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '18px'
              }}>
                {index + 1}
              </div>
              
              <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: '#333', marginBottom: '5px' }}>
                {menu.menu}
              </h3>
              <p style={{ color: '#666', marginBottom: '10px' }}>
                {menu.shop} - {menu.category}
              </p>
              <span style={{
                display: 'inline-block',
                padding: '8px 16px',
                background: 'linear-gradient(135deg, #56ab2f, #a8e063)',
                color: 'white',
                borderRadius: '20px',
                fontSize: '14px',
                fontWeight: 'bold'
              }}>
                {userProfile?.goal === 'diet' ? 'ダイエット' : 'バルクアップ'}スコア: {Math.round(menu.score)}点
              </span>
              
              <div style={styles.nutritionGrid}>
                <div style={styles.nutritionItem}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#667eea' }}>{menu.calories}</div>
                  <div style={{ fontSize: '12px', color: '#999' }}>カロリー</div>
                </div>
                <div style={styles.nutritionItem}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#667eea' }}>{menu.protein}</div>
                  <div style={{ fontSize: '12px', color: '#999' }}>タンパク質(g)</div>
                </div>
                <div style={styles.nutritionItem}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#667eea' }}>{menu.fat}</div>
                  <div style={{ fontSize: '12px', color: '#999' }}>脂質(g)</div>
                </div>
                <div style={styles.nutritionItem}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#667eea' }}>{menu.carbs}</div>
                  <div style={{ fontSize: '12px', color: '#999' }}>炭水化物(g)</div>
                </div>
                <div style={styles.nutritionItem}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#667eea' }}>{menu.salt}</div>
                  <div style={{ fontSize: '12px', color: '#999' }}>塩分(g)</div>
                </div>
              </div>
              
              <div style={{ marginTop: '20px' }}>
                <div style={styles.progressBar}>
                  <div style={{
                    width: `${Math.min((menu.calories / 1000) * 100, 100)}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #667eea, #764ba2)',
                    borderRadius: '12px',
                    padding: '0 10px',
                    display: 'flex',
                    alignItems: 'center',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}>
                    カロリー: {menu.calories}kcal
                  </div>
                </div>
                <div style={styles.progressBar}>
                  <div style={{
                    width: `${Math.min((menu.protein / 50) * 100, 100)}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #f093fb, #f5576c)',
                    borderRadius: '12px',
                    padding: '0 10px',
                    display: 'flex',
                    alignItems: 'center',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}>
                    タンパク質: {menu.protein}g
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}