// app/api/envcheck/route.js
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY;

  return NextResponse.json({
    // Firebase Admin SDK環境変数
    hasFirebaseProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    hasFirebasePrivateKey: !!firebasePrivateKey,
    firebasePrivateKeyLength: firebasePrivateKey?.length || 0,
    firebasePrivateKeyStartsWith: firebasePrivateKey?.substring(0, 30) || 'missing',
    hasFirebaseClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,

    // Firebase Client SDK環境変数
    hasFirebaseApiKey: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    hasFirebaseAuthDomain: !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    hasFirebaseStorageBucket: !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    hasFirebaseMessagingSenderId: !!process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    hasFirebaseAppId: !!process.env.NEXT_PUBLIC_FIREBASE_APP_ID,

    // その他のAPI
    hasGoogleMapsApiKey: !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    hasGeminiApiKey: !!process.env.NEXT_PUBLIC_GEMINI_API_KEY,
  });
}
