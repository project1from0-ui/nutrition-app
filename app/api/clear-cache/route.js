// app/api/clear-cache/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Firebase Admin初期化
function getFirebaseAdmin() {
  if (getApps().length === 0) {
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    if (!privateKey || !clientEmail || !projectId) {
      throw new Error('Firebase Admin credentials are missing');
    }

    try {
      privateKey = JSON.parse(privateKey);
    } catch (e) {
      // JSON形式でない場合はそのまま使用
    }

    privateKey = privateKey.replace(/\\n/g, '\n');

    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }
  return getFirestore();
}

export async function POST(request) {
  try {
    const db = getFirebaseAdmin();

    // placesCache コレクション内の全ドキュメントを削除
    const snapshot = await db.collection('placesCache').get();

    const deletePromises = [];
    snapshot.docs.forEach((doc) => {
      deletePromises.push(doc.ref.delete());
    });

    await Promise.all(deletePromises);

    console.log(`[Cache Clear] ${snapshot.docs.length} キャッシュドキュメントを削除しました`);

    return NextResponse.json({
      success: true,
      deletedCount: snapshot.docs.length,
      message: 'Places API cache cleared successfully'
    });

  } catch (error) {
    console.error('[Cache Clear Error]', error);
    return NextResponse.json(
      { error: 'Failed to clear cache', details: error.message },
      { status: 500 }
    );
  }
}
