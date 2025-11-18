# 統合メニューAPI使用ガイド

## 概要

3つのメニューコレクションを統合して検索できるAPI

- `menuItems` - 44チェーンの公式栄養データ（8,500+件）
- `menuItemsConvenience` - コンビニの公式栄養成分メニュー
- `menuItemsUnofficialImputed` - AI推計の栄養成分データ

## API仕様

### エンドポイント

```
GET /api/menus-unified
```

### クエリパラメータ

| パラメータ | 型 | 必須 | 説明 | デフォルト | 例 |
|-----------|-----|------|------|-----------|-----|
| `classification` | string | No | 目的による分類 | - | `減量`, `現状維持`, `バルクアップ` |
| `chains` | string | No | カンマ区切りのチェーン名 | - | `マクドナルド,サブウェイ,セブンイレブン` |
| `sources` | string | No | カンマ区切りのデータソース | `official,convenience,ai_imputed` | `official,convenience` |
| `limit` | number | No | 取得件数 | `30` | `50` |
| `minConfidence` | number | No | AI推計の最小信頼度(0-1) | `0.7` | `0.85` |

### データソースの種類

- `official` - 公式データ（menuItems）
- `convenience` - コンビニデータ（menuItemsConvenience）
- `ai_imputed` - AI推計データ（menuItemsUnofficialImputed）

## 使用例

### 例1: 全データソースから減量向けメニューを取得

```javascript
const response = await fetch(
  '/api/menus-unified?classification=減量&limit=20'
);
const data = await response.json();

console.log(data);
// {
//   success: true,
//   menus: [
//     {
//       id: "abc123",
//       restaurant_chain: "サブウェイ",
//       menu_item: "ターキーブレスト",
//       calories: 266,
//       protein: 18.2,
//       data_source: "official",
//       collection: "menuItems"
//     },
//     {
//       id: "def456",
//       restaurant_chain: "セブンイレブン",
//       menu_item: "サラダチキン",
//       calories: 113,
//       protein: 24.1,
//       data_source: "convenience",
//       collection: "menuItemsConvenience"
//     }
//   ],
//   total: 20,
//   sources: {
//     official: 12,
//     convenience: 5,
//     ai_imputed: 3
//   }
// }
```

### 例2: 公式データとコンビニデータのみ

```javascript
const response = await fetch(
  '/api/menus-unified?sources=official,convenience&limit=30'
);
```

### 例3: 特定チェーンのみ（複数ソース）

```javascript
const response = await fetch(
  '/api/menus-unified?' +
  'chains=マクドナルド,セブンイレブン,ファミリーマート&' +
  'classification=バルクアップ&' +
  'limit=15'
);
```

### 例4: AI推計のみ、信頼度90%以上

```javascript
const response = await fetch(
  '/api/menus-unified?' +
  'sources=ai_imputed&' +
  'minConfidence=0.9&' +
  'limit=10'
);
```

## レスポンスフィールド

### 共通フィールド

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `id` | string | ドキュメントID |
| `restaurant_chain` | string | チェーン名 |
| `menu_item` | string | メニュー名 |
| `category` | string | カテゴリ |
| `calories` | number | カロリー (kcal) |
| `protein` | number | タンパク質 (g) |
| `fat` | number | 脂質 (g) |
| `carbohydrates` | number | 炭水化物 (g) |
| `sodium` | number | 塩分 (mg) |
| `price` | number | 価格 (円) |
| `data_source` | string | データソース (`official`, `convenience`, `ai_imputed`) |
| `collection` | string | Firestoreコレクション名 |

### AI推計データの追加フィールド

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `confidence_score` | number | 信頼度スコア (0-1) |
| `estimation_method` | string | 推計方法の説明 |

## フロントエンドでの使用例

```javascript
// page.js内での使用例
const fetchUnifiedMenus = async (classification, chains) => {
  try {
    setLoadingMenus(true);

    const params = new URLSearchParams({
      classification: classification,
      limit: '30'
    });

    if (chains && chains.length > 0) {
      params.append('chains', chains.join(','));
    }

    // デフォルトで全データソースを検索
    // params.append('sources', 'official,convenience,ai_imputed');

    const response = await fetch(`/api/menus-unified?${params}`);
    const data = await response.json();

    if (data.success) {
      console.log(`Found ${data.total} menus from:`, data.sources);
      setMenus(data.menus);

      // データソース別の表示
      data.menus.forEach(menu => {
        const badge = menu.data_source === 'ai_imputed'
          ? `🤖 AI推計 (${Math.round(menu.confidence_score * 100)}%)`
          : menu.data_source === 'convenience'
          ? '🏪 コンビニ'
          : '✅ 公式';
        console.log(`${badge} ${menu.restaurant_chain} - ${menu.menu_item}`);
      });
    }

  } catch (error) {
    console.error('Menu fetch error:', error);
  } finally {
    setLoadingMenus(false);
  }
};
```

## データ投入方法

### サンプルデータの投入

```bash
cd /Users/nakaotatsuya/Desktop/nutrition-app
node scripts/populate-sample-data.js
```

### カスタムデータの追加

```javascript
// Firestore直接追加の例
const db = getFirestore();

// コンビニメニュー追加
await db.collection('menuItemsConvenience').add({
  restaurant_chain: 'セブンイレブン',
  menu_item: 'おにぎり 梅',
  category: 'おにぎり',
  calories: 170,
  protein: 3.8,
  fat: 0.8,
  carbohydrates: 37.5,
  sodium: 480,
  price: 115,
  data_source: 'convenience',
  url: 'https://www.sej.co.jp/',
  scraped_date: new Date().toISOString()
});

// AI推計メニュー追加
await db.collection('menuItemsUnofficialImputed').add({
  restaurant_chain: 'ラーメン二郎',
  menu_item: 'ラーメン小',
  category: 'ラーメン',
  calories: 1200,
  protein: 35.0,
  fat: 45.0,
  carbohydrates: 150.0,
  sodium: 3500,
  price: 900,
  data_source: 'ai_imputed',
  confidence_score: 0.85,
  estimation_method: 'GPT-4V画像解析',
  scraped_date: new Date().toISOString()
});
```

## パフォーマンス最適化

### キャッシング推奨

よく使われる検索結果はクライアント側でキャッシュ：

```javascript
const menuCache = new Map();

const fetchWithCache = async (cacheKey, fetchFn) => {
  if (menuCache.has(cacheKey)) {
    console.log('Cache hit:', cacheKey);
    return menuCache.get(cacheKey);
  }

  const result = await fetchFn();
  menuCache.set(cacheKey, result);
  return result;
};

// 使用例
const menus = await fetchWithCache(
  `unified_${classification}_${chains.join(',')}`,
  () => fetchUnifiedMenus(classification, chains)
);
```

## トラブルシューティング

### Q: データが返ってこない

A: データソースが正しく設定されているか確認：

```bash
# Firestoreコレクションの確認
firebase firestore:collections

# サンプルデータが投入されているか確認
node scripts/populate-sample-data.js
```

### Q: AI推計データの信頼度が低い

A: `minConfidence`パラメータを調整：

```javascript
// 信頼度80%以上のみ取得
fetch('/api/menus-unified?sources=ai_imputed&minConfidence=0.8')
```

### Q: レスポンスが遅い

A: `limit`を減らすか、特定のソースのみ検索：

```javascript
// 公式データのみに絞る
fetch('/api/menus-unified?sources=official&limit=20')
```
