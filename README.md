# 外食チェーンAI Agent

ユーザーの位置情報に基づき、近隣の外食チェーン店から最適なメニューを提案するWebアプリケーション。

## 機能

- **位置情報ベースの店舗検索**: Google Places APIを使用して200m圏内の対応チェーン店を検索
- **パーソナライズドメニュー提案**: ユーザーのプロフィール（身長、体重、運動頻度、目標）に基づいて最適なメニューを提案
- **3つのモード**:
  - SLIM（減量）
  - KEEP（現状維持）
  - BULK（筋肉増量）
- **栄養情報の可視化**: カロリー、タンパク質、脂質、炭水化物、塩分を表示
- **地図表示**: 近隣店舗の位置をGoogle Maps上に表示

## 技術スタック

- **Framework**: Next.js 14 (App Router)
- **Database**: Firebase Firestore (8,500+メニュー、44チェーン)
- **Maps**: Google Maps API & Places API
- **Styling**: Tailwind CSS
- **Deployment**: Vercel

## セットアップ

### 1. 環境変数の設定

`.env.local`ファイルを作成し、以下の環境変数を設定：

```bash
# Firebase設定
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id

# Firebase Admin SDK
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com

# Google Maps API
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. 開発サーバーの起動

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) でアプリケーションが起動します。

## プロジェクト構造

```
nutrition-app/
├── app/
│   ├── api/
│   │   ├── clear-cache/    # Places APIキャッシュクリア
│   │   ├── menus/          # メニューデータ取得
│   │   ├── places/         # 近隣店舗検索
│   │   └── profile/        # ユーザープロフィール管理
│   ├── components/
│   │   └── GoogleMap.js    # 地図表示コンポーネント
│   ├── page.js             # メインアプリケーション
│   └── layout.js
├── lib/
│   └── chain-mapping.js    # チェーン店マッピング定義
└── public/
    └── logo.png            # アプリロゴ
```

## 対応チェーン店（44店舗）

- ファストフード: マクドナルド、モスバーガー、ケンタッキー、サブウェイ等
- 牛丼・定食: すき家、吉野家、松屋、なか卯、やよい軒、大戸屋等
- カフェ: スターバックス、ドトール、タリーズ等
- その他: ココス、デニーズ、CoCo壱番屋等

## ライセンス

Private
