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

// Initialize Firebase (シングルトンパターン)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);

// Authorization
const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // **This is the key part: Link Auth to Firestore**
    // We use the 'profiles' collection to match your /api/profile route
    const userDocRef = doc(db, 'profiles', user.uid);
    const userDoc = await getDoc(userDocRef);

    // If the user document does NOT exist, create a basic one
    if (!userDoc.exists()) {
      await setDoc(userDocRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        createdAt: new Date(),
        // Add any other defaults your app/page.js expects
        height: '',
        weight: '',
        gender: '',
        birthYear: '',
      });
      console.log('New user document created in Firestore');
    } else {
      console.log('User document already exists');
    }
    
    return user; // Return the user object on success

  } catch (error) {
    console.error('Error signing in with Google: ', error);
    // Handle errors here
    return null;
  }
};

export const handleSignOut = async () => {
  try {
    await signOut(auth);
    console.log('User signed out');
  } catch (error) {
    console.error('Error signing out: ', error);
  }
};

export default app;
