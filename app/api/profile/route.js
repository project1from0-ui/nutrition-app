import { NextResponse } from 'next/server';
import { db } from '../../../lib/firebase';
import { collection, addDoc, doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

// プロフィールを保存（POST）
export async function POST(request) {
  try {
    const profileData = await request.json();

    // タイムスタンプを追加
    const dataToSave = {
      ...profileData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    // ユーザーIDがある場合は更新、ない場合は新規作成
    if (profileData.userId) {
      const docRef = doc(db, 'profiles', profileData.userId);
      await setDoc(docRef, dataToSave, { merge: true });

      return NextResponse.json({
        success: true,
        userId: profileData.userId,
        message: 'Profile updated successfully'
      });
    } else {
      // 新規作成
      const docRef = await addDoc(collection(db, 'profiles'), dataToSave);

      return NextResponse.json({
        success: true,
        userId: docRef.id,
        message: 'Profile created successfully'
      });
    }
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
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId is required' },
        { status: 400 }
      );
    }

    const docRef = doc(db, 'profiles', userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
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
