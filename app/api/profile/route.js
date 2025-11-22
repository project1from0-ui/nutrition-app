import { NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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

// プロフィールを保存（POST）
export async function POST(request) {
  try {
    const db = getFirebaseAdmin();
    const profileData = await request.json();

    // userIdをリクエストボディから取得
    const userId = profileData.userId;

    if(!userId) {
      return NextResponse.json(
        { success: false, error: 'userId is required in profile data' },
        { status: 400 }
      );
    }

    // タイムスタンプを追加
    const dataToSave = {
      ...profileData,
      updatedAt: FieldValue.serverTimestamp()
    };

    // Auth uidであるuserIDをdocument IDとして使用
    const docRef = db.collection('profiles').doc(userId);
    await docRef.set(dataToSave, { merge: true });

    return NextResponse.json({
      success: true,
      userId: userId,
      message: 'Profile updated/created successfully'
    });
  } catch (error) {
    console.error('Error saving profile:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// プロフィールを取得（GET）
export async function GET(request) {
  try {
    const db = getFirebaseAdmin();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId is required' },
        { status: 400 }
      );
    }

    const docRef = db.collection('profiles').doc(userId);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      return NextResponse.json({
        success: true,
        profile: { id: docSnap.id, ...docSnap.data() }
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
