import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// --- 🔍 DEBUGGING: Print missing variables to Vercel Logs ---
if (typeof window === 'undefined') { // Only log during server build
  const missingKeys = Object.entries(firebaseConfig)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingKeys.length > 0) {
    console.error('❌ MISSING ENV VARIABLES:', missingKeys.join(', '));
    console.log('ℹ️ Check your Vercel Project Settings > Environment Variables.');
  } else {
    console.log('✅ All Firebase client variables found.');
  }
}
// ------------------------------------------------------------

let app;
let auth;
let db;

// Safe Initialization
try {
  // Check if config exists before initializing
  if (firebaseConfig.apiKey) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);
  } else {
    console.warn("⚠️ Skipping Firebase init: API Key missing.");
  }
} catch (error) {
  console.error("Firebase Initialization Error:", error);
}

// Authorization helpers
const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  if (!auth) { console.error("Firebase not initialized"); return null; }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    // ... your existing Firestore logic ...
    return user;
  } catch (error) {
    console.error('Error signing in:', error);
    return null;
  }
};

export const handleSignOut = async () => {
  if (!auth) return;
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Error signing out:', error);
  }
};

// Export services (auth might be undefined if init failed)
export { auth, db };
export default app;