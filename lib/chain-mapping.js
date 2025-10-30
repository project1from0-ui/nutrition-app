// レストラン名 → chainId + Places API検索キーワード のマッピング
export const CHAIN_MAPPING = {
  'Hotto Motto': {
    chainId: 'hottomotto',
    searchKeyword: 'ほっともっと',
  },
  'STARBUCKS COFFEE': {
    chainId: 'starbucks',
    searchKeyword: 'スターバックス',
  },
  'Taco Bell': {
    chainId: 'tacobell',
    searchKeyword: 'タコベル',
  },
  'いきなりステーキ': {
    chainId: 'ikinari',
    searchKeyword: 'いきなりステーキ',
  },
  'すき家': {
    chainId: 'sukiya',
    searchKeyword: 'すき家',
  },
  'なか卯': {
    chainId: 'nakau',
    searchKeyword: 'なか卯',
  },
  'はなまるうどん': {
    chainId: 'hanamaru',
    searchKeyword: 'はなまるうどん',
  },
  'びっくりドンキー': {
    chainId: 'bikkuri',
    searchKeyword: 'びっくりドンキー',
  },
  'ほっかほっか亭': {
    chainId: 'hokkahokka',
    searchKeyword: 'ほっかほっか亭',
  },
  'やよい軒': {
    chainId: 'yayoiken',
    searchKeyword: 'やよい軒',
  },
  'ウェンディーズ・ファーストキッチン': {
    chainId: 'wendys',
    searchKeyword: 'ウェンディーズ',
  },
  'オリーブの丘': {
    chainId: 'olive',
    searchKeyword: 'オリーブの丘',
  },
  'カレーハウスCoCo壱番屋': {
    chainId: 'coco',
    searchKeyword: 'CoCo壱番屋',
  },
  'キッチンオリジン': {
    chainId: 'origin',
    searchKeyword: 'キッチンオリジン',
  },
  'クリスピー・クリーム・ドーナツ　': {
    chainId: 'krispykreme',
    searchKeyword: 'クリスピークリームドーナツ',
  },
  'ケンタッキーフライドチキン': {
    chainId: 'kfc',
    searchKeyword: 'ケンタッキー',
  },
  'ココス': {
    chainId: 'cocos',
    searchKeyword: 'ココス',
  },
  'サブウェイ': {
    chainId: 'subway',
    searchKeyword: 'サブウェイ',
  },
  'サンマルクカフェ': {
    chainId: 'saintmarc',
    searchKeyword: 'サンマルクカフェ',
  },
  'ジョイフル [Joyfull]': {
    chainId: 'joyful',
    searchKeyword: 'ジョイフル',
  },
  'ジョリーバスタ': {
    chainId: 'jollypasta',
    searchKeyword: 'ジョリーパスタ',
  },
  'ステーキ屋松': {
    chainId: 'matsu',
    searchKeyword: 'ステーキ屋松',
  },
  'ゼッテリア': {
    chainId: 'zetteria',
    searchKeyword: 'ゼッテリア',
  },
  'タリーズコーヒー': {
    chainId: 'tullys',
    searchKeyword: 'タリーズコーヒー',
  },
  'デニーズ': {
    chainId: 'dennys',
    searchKeyword: 'デニーズ',
  },
  'ドトールコーヒー': {
    chainId: 'doutor',
    searchKeyword: 'ドトール',
  },
  'バーガーキング': {
    chainId: 'burgerking',
    searchKeyword: 'バーガーキング',
  },
  'ビッグボーイ': {
    chainId: 'bigboy',
    searchKeyword: 'ビッグボーイ',
  },
  'ファーストキッチン': {
    chainId: 'firstkitchen',
    searchKeyword: 'ファーストキッチン',
  },
  'フレッシュネスバーガー': {
    chainId: 'freshness',
    searchKeyword: 'フレッシュネスバーガー',
  },
  'マクドナルド': {
    chainId: 'mcdonalds',
    searchKeyword: 'マクドナルド',
  },
  'ミスタードーナツ': {
    chainId: 'misterdonut',
    searchKeyword: 'ミスタードーナツ',
  },
  'モスバーガー': {
    chainId: 'mos',
    searchKeyword: 'モスバーガー',
  },
  'ロイヤルホスト': {
    chainId: 'royalhost',
    searchKeyword: 'ロイヤルホスト',
  },
  'ロッテリア': {
    chainId: 'lotteria',
    searchKeyword: 'ロッテリア',
  },
  '吉野家': {
    chainId: 'yoshinoya',
    searchKeyword: '吉野家',
  },
  '大戸屋': {
    chainId: 'ootoya',
    searchKeyword: '大戸屋',
  },
  '天丼てんや': {
    chainId: 'tenya',
    searchKeyword: 'てんや',
  },
  '幸楽苑': {
    chainId: 'kourakuen',
    searchKeyword: '幸楽苑',
  },
  '松のや': {
    chainId: 'matsunoya',
    searchKeyword: '松のや',
  },
  '松屋': {
    chainId: 'matsuya',
    searchKeyword: '松屋',
  },
  '鎌倉パスタ': {
    chainId: 'kamakura',
    searchKeyword: '鎌倉パスタ',
  },
  '長崎ちゃんぽん リンガーハット': {
    chainId: 'ringerhut',
    searchKeyword: 'リンガーハット',
  },
  '鳥貴族': {
    chainId: 'torikizoku',
    searchKeyword: '鳥貴族',
  },
};

// chainId → restaurantName の逆引き
export const CHAIN_ID_TO_NAME = Object.fromEntries(
  Object.entries(CHAIN_MAPPING).map(([name, { chainId }]) => [chainId, name])
);

// Places API検索用のキーワードリスト
export const SEARCH_KEYWORDS = Object.values(CHAIN_MAPPING).map(v => v.searchKeyword);
