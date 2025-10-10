// app/api/menus/route.js
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
  const SHEET_ID = process.env.SPREADSHEET_ID;
  const RANGE = process.env.SHEETS_RANGE || 'A1:H';

  console.log('[ENV CHECK]', {
    hasKey: !!API_KEY,
    hasSheet: !!SHEET_ID,
    range: RANGE,
  });

  if (!API_KEY || !SHEET_ID) {
    return NextResponse.json({ error: 'Missing env' }, { status: 500 });
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(RANGE)}?key=${API_KEY}`;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('Sheets error', res.status, text);
      return NextResponse.json({ error: 'Sheets error', status: res.status }, { status: 500 });
    }

    const data = await res.json();
    const values = Array.isArray(data.values) ? data.values : [];
    if (values.length === 0) {
      return NextResponse.json([], { status: 200 });
    }

    // ---- header-based mapping ----
    const header = values[0].map(h => (h ?? '').trim());
    const rowsRaw = values.slice(1);
    const idx = (name) => header.findIndex(h => h === name);
    const pick = (row, name) => {
      const i = idx(name);
      return i >= 0 ? String(row[i] ?? '').trim() : '';
    };
    const toNumber = (s) => {
      const n = Number(String(s).replace(/[, ]/g, ''));
      return Number.isFinite(n) ? n : NaN;
    };

    // 必須ヘッダー（シートの1行目に完全一致）
    const required = [
      'ジャンル',
      '店名',
      'カテゴリー',
      'メニュー名',
      'エネルギー(kcal)',
      'たんぱく質(g)',
      '脂質(g)',
      '炭水化物(g)',
    ];
    const missing = required.filter(h => idx(h) === -1);
    if (missing.length) {
      console.error('MissingHeaders', missing);
      return NextResponse.json({ error: `MissingHeaders: ${missing.join(',')}` }, { status: 500 });
    }

    const excludeKeywords = [
      '調味料','ドリンク','飲み物','ソース','タレ','飲料','ジュース','コーヒー','お茶','水',
      'ケチャップ','マスタード','マヨネーズ','醤油','味噌','塩','胡椒','スパイス','香辛料'
    ];

    const rows = rowsRaw
      // 除外ワードは「メニュー名」に対して判定
      .filter(r => {
        const menuName = pick(r, 'メニュー名');
        const lower = (menuName || '').toLowerCase();
        return !excludeKeywords.some(k => lower.includes(k.toLowerCase()));
      })
      .map(r => {
        const genre  = pick(r, 'ジャンル');
        const shop   = pick(r, '店名');
        const cat    = pick(r, 'カテゴリー');
        const menu   = pick(r, 'メニュー名');
        const kcal   = toNumber(pick(r, 'エネルギー(kcal)'));
        const p      = toNumber(pick(r, 'たんぱく質(g)'));
        const f      = toNumber(pick(r, '脂質(g)'));
        const c      = toNumber(pick(r, '炭水化物(g)'));
        return {
          // 既存フロント互換キー
          shop: shop,
          category: cat,
          menu: menu,
          calories: kcal,
          protein: p,
          fat: f,
          carbs: c,
          size: '-',
          salt: 0,
          // 追加：ジャンル（見出し用）
          genre: genre,
        };
      })
      .filter(m =>
        Number.isFinite(m.calories) &&
        Number.isFinite(m.protein)  &&
        Number.isFinite(m.fat)      &&
        Number.isFinite(m.carbs)
      );

    return NextResponse.json(rows, { status: 200 });
  } catch (e) {
    console.error('Fetch failed', e);
    return NextResponse.json({ error: 'Fetch failed' }, { status: 500 });
  }
}