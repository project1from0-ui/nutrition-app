// app/api/menus/route.js
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
  const SHEET_ID = process.env.SPREADSHEET_ID;
  const RANGE = process.env.SHEETS_RANGE || 'A2:G2168';

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

    const excludeKeywords = [
      '調味料','ドリンク','飲み物','ソース','タレ','飲料','ジュース','コーヒー','お茶','水',
      'ケチャップ','マスタード','マヨネーズ','醤油','味噌','塩','胡椒','スパイス','香辛料'
    ];

    const rows = values
      .filter(r => !excludeKeywords.some(k => (r[1] || '').toLowerCase().includes(k)))
      .map(r => ({
        shop:     r[0] || '',
        category: r[1] || '',
        menu:     r[2] || '',
        calories: parseFloat(r[3]),
        protein:  parseFloat(r[4]),
        fat:      parseFloat(r[5]),
        carbs:    parseFloat(r[6]),
        size: '-',
        salt: 0,
      }))
      .filter(m =>
        Number.isFinite(m.calories) &&
        Number.isFinite(m.protein) &&
        Number.isFinite(m.fat) &&
        Number.isFinite(m.carbs)
      );

    return NextResponse.json(rows, { status: 200 });
  } catch (e) {
    console.error('Fetch failed', e);
    return NextResponse.json({ error: 'Fetch failed' }, { status: 500 });
  }
}