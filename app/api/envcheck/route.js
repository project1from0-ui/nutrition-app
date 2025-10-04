// app/api/envcheck/route.js
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    hasKey: !!process.env.GOOGLE_SHEETS_API_KEY,
    hasSheet: !!process.env.SPREADSHEET_ID,
    range: process.env.SHEETS_RANGE,
  });
}
