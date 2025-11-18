'use client';

import { useState, useEffect } from 'react';
import {
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { auth } from '../lib/firebase';

export default function Auth({ onAuthSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Googleログイン
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      console.log('Googleログイン成功:', result.user);
      onAuthSuccess(result.user);
    } catch (error) {
      console.error('Googleログインエラー:', error);
      setError('Googleログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // メール/パスワードログイン
  const handleEmailSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isSignUp) {
        // 新規登録
        const result = await createUserWithEmailAndPassword(auth, email, password);
        console.log('アカウント作成成功:', result.user);
        onAuthSuccess(result.user);
      } else {
        // ログイン
        const result = await signInWithEmailAndPassword(auth, email, password);
        console.log('ログイン成功:', result.user);
        onAuthSuccess(result.user);
      }
    } catch (error) {
      console.error('認証エラー:', error);
      if (error.code === 'auth/email-already-in-use') {
        setError('このメールアドレスは既に使用されています');
      } else if (error.code === 'auth/invalid-email') {
        setError('無効なメールアドレスです');
      } else if (error.code === 'auth/weak-password') {
        setError('パスワードは6文字以上で設定してください');
      } else if (error.code === 'auth/user-not-found') {
        setError('ユーザーが見つかりません');
      } else if (error.code === 'auth/wrong-password') {
        setError('パスワードが間違っています');
      } else {
        setError(isSignUp ? 'アカウント作成に失敗しました' : 'ログインに失敗しました');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20
    }}>
      <div style={{
        background: 'white',
        borderRadius: 24,
        padding: 40,
        maxWidth: 400,
        width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        {/* ロゴ */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{
            fontSize: 28,
            fontWeight: 800,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: 8
          }}>
            外食チェーンAI Agent
          </h1>
          <p style={{ fontSize: 14, color: '#666' }}>
            {isSignUp ? 'アカウントを作成' : 'ログインして始める'}
          </p>
        </div>

        {/* Googleログインボタン */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          style={{
            width: '100%',
            padding: '14px 20px',
            background: 'white',
            border: '2px solid #e0e0e0',
            borderRadius: 12,
            fontSize: 16,
            fontWeight: 600,
            color: '#333',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            marginBottom: 24,
            transition: 'all 0.2s',
            opacity: loading ? 0.6 : 1
          }}
          onMouseEnter={(e) => !loading && (e.currentTarget.style.borderColor = '#667eea')}
          onMouseLeave={(e) => !loading && (e.currentTarget.style.borderColor = '#e0e0e0')}
        >
          <svg width="20" height="20" viewBox="0 0 20 20">
            <path fill="#4285F4" d="M19.6 10.23c0-.82-.1-1.42-.25-2.05H10v3.72h5.5c-.15.96-.74 2.31-2.04 3.22v2.45h3.16c1.89-1.73 2.98-4.3 2.98-7.34z"/>
            <path fill="#34A853" d="M13.46 15.13c-.83.59-1.96 1-3.46 1-2.64 0-4.88-1.74-5.68-4.15H1.07v2.52C2.72 17.75 6.09 20 10 20c2.7 0 4.96-.89 6.62-2.42l-3.16-2.45z"/>
            <path fill="#FBBC05" d="M3.99 10c0-.69.12-1.35.32-1.97V5.51H1.07A9.973 9.973 0 000 10c0 1.61.39 3.14 1.07 4.49l3.24-2.52c-.2-.62-.32-1.28-.32-1.97z"/>
            <path fill="#EA4335" d="M10 3.88c1.88 0 3.13.81 3.85 1.48l2.84-2.76C14.96.99 12.7 0 10 0 6.09 0 2.72 2.25 1.07 5.51l3.24 2.52C5.12 5.62 7.36 3.88 10 3.88z"/>
          </svg>
          Googleでログイン
        </button>

        {/* 区切り線 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: 24
        }}>
          <div style={{ flex: 1, height: 1, background: '#e0e0e0' }} />
          <span style={{ padding: '0 16px', color: '#999', fontSize: 14 }}>または</span>
          <div style={{ flex: 1, height: 1, background: '#e0e0e0' }} />
        </div>

        {/* メール/パスワードフォーム */}
        <form onSubmit={handleEmailSignIn}>
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block',
              fontSize: 14,
              fontWeight: 600,
              color: '#333',
              marginBottom: 8
            }}>
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '2px solid #e0e0e0',
                borderRadius: 12,
                fontSize: 16,
                outline: 'none',
                transition: 'border-color 0.2s',
                opacity: loading ? 0.6 : 1
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = '#667eea'}
              onBlur={(e) => e.currentTarget.style.borderColor = '#e0e0e0'}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: 'block',
              fontSize: 14,
              fontWeight: 600,
              color: '#333',
              marginBottom: 8
            }}>
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              minLength={6}
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '2px solid #e0e0e0',
                borderRadius: 12,
                fontSize: 16,
                outline: 'none',
                transition: 'border-color 0.2s',
                opacity: loading ? 0.6 : 1
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = '#667eea'}
              onBlur={(e) => e.currentTarget.style.borderColor = '#e0e0e0'}
            />
          </div>

          {/* エラーメッセージ */}
          {error && (
            <div style={{
              background: '#fee',
              color: '#c33',
              padding: 12,
              borderRadius: 8,
              fontSize: 14,
              marginBottom: 16,
              textAlign: 'center'
            }}>
              {error}
            </div>
          )}

          {/* ログインボタン */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px 20px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 700,
              color: 'white',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.2s',
              opacity: loading ? 0.6 : 1
            }}
            onMouseEnter={(e) => !loading && (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => !loading && (e.currentTarget.style.opacity = '1')}
          >
            {loading ? '処理中...' : (isSignUp ? 'アカウントを作成' : 'ログイン')}
          </button>
        </form>

        {/* 切り替えリンク */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
            disabled={loading}
            style={{
              background: 'none',
              border: 'none',
              color: '#667eea',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              textDecoration: 'underline',
              opacity: loading ? 0.6 : 1
            }}
          >
            {isSignUp ? 'すでにアカウントをお持ちの方' : 'アカウントをお持ちでない方'}
          </button>
        </div>
      </div>
    </div>
  );
}
