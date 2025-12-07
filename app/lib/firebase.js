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

// --- SAFE INITIALIZATION START ---
let app;
let auth;
let db;

// Only initialize if we are not on the server during build time, 
// or if we have the necessary config.
if (typeof window !== 'undefined' && getApps().length === 0) {
    // Client-side initialization
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} else if (getApps().length > 0) {
    // App already initialized
    app = getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);
} else {
    // Server-side (during build) or missing config
    // We create a dummy object or handle it gracefully to prevent crash
    // Note: This block runs during 'next build' when generating static pages
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
    } catch (e) {
        console.warn("Firebase initialization failed (this is expected during build if vars are missing):", e.message);
    }
}
// --- SAFE INITIALIZATION END ---

// Authorization
const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  if (!auth) {
      console.error("Firebase auth is not initialized.");
      return null;
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    const userDocRef = doc(db, 'profiles', user.uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      await setDoc(userDocRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        createdAt: new Date(),
        height: '',
        weight: '',
        gender: '',
        birthYear: '',
      });
      console.log('New user document created in Firestore');
    } else {
      console.log('User document already exists');
    }
    
    return user; 

  } catch (error) {
    console.error('Error signing in with Google: ', error);
    return null;
  }
};

export const handleSignOut = async () => {
  if (!auth) return;
  try {
    await signOut(auth);
    console.log('User signed out');
  } catch (error) {
    console.error('Error signing out: ', error);
  }
};

// Export services safely
export { auth, db };
export default app;