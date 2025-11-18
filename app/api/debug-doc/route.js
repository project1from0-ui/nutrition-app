// app/api/debug-doc/route.js
// 特定のドキュメントを取得してデータ構造を確認
import { NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    } catch (e) {}

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

export async function GET(request) {
  try {
    const db = getFirebaseAdmin();

    const results = {};

    // menuItems から1件
    const menuItemsDoc = await db.collection('menuItems').doc('00DeBRiYrLoPk3WRkq7J').get();
    results.menuItems = {
      exists: menuItemsDoc.exists,
      data: menuItemsDoc.exists ? menuItemsDoc.data() : null
    };

    // menuItemsConvenience から指定のドキュメント
    const convenienceDoc = await db.collection('menuItemsConvenience').doc('04Ry2IsuJSUjuQTcG097').get();
    results.menuItemsConvenience = {
      exists: convenienceDoc.exists,
      data: convenienceDoc.exists ? convenienceDoc.data() : null
    };

    // menuItemsUnofficialImputed から指定のドキュメント
    const imputedDoc = await db.collection('menuItemsUnofficialImputed').doc('01nVdExk0kR0o99O17qm').get();
    results.menuItemsUnofficialImputed = {
      exists: imputedDoc.exists,
      data: imputedDoc.exists ? imputedDoc.data() : null
    };

    // 各コレクションの最初の3件をrestaurantNameでフィルタなしで取得
    const convenienceSnapshot = await db.collection('menuItemsConvenience').limit(3).get();
    results.convenienceSample = [];
    convenienceSnapshot.forEach(doc => {
      results.convenienceSample.push({
        id: doc.id,
        restaurantName: doc.data().restaurantName,
        menuName: doc.data().menuName,
        allFields: Object.keys(doc.data())
      });
    });

    const imputedSnapshot = await db.collection('menuItemsUnofficialImputed').limit(3).get();
    results.imputedSample = [];
    imputedSnapshot.forEach(doc => {
      results.imputedSample.push({
        id: doc.id,
        restaurantName: doc.data().restaurantName,
        menuName: doc.data().menuName,
        allFields: Object.keys(doc.data())
      });
    });

    console.log('[Debug Doc] Results:', JSON.stringify(results, null, 2));

    return NextResponse.json({
      success: true,
      results
    });

  } catch (error) {
    console.error('Debug doc error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
