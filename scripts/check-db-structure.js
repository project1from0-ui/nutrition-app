// scripts/check-db-structure.js
// データベースのフィールド構造を確認

const admin = require('firebase-admin');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

// Firebase Admin初期化
if (admin.apps.length === 0) {
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  try {
    privateKey = JSON.parse(privateKey);
  } catch (e) {
    // Already a string
  }

  privateKey = privateKey.replace(/\\n/g, '\n');

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    })
  });
}

const db = admin.firestore();

async function checkStructure() {
  try {
    console.log('🔍 Checking database structure...\n');

    // 1. menuItemsConvenience
    console.log('📦 menuItemsConvenience:');
    const convSnapshot = await db.collection('menuItemsConvenience').limit(3).get();
    convSnapshot.forEach((doc, index) => {
      console.log(`\nSample ${index + 1}:`);
      const data = doc.data();
      console.log('Fields:', Object.keys(data));
      console.log('Data:', JSON.stringify(data, null, 2));
    });

    // 2. menuItemsUnofficialImputed
    console.log('\n\n🤖 menuItemsUnofficialImputed:');
    const aiSnapshot = await db.collection('menuItemsUnofficialImputed').limit(3).get();
    aiSnapshot.forEach((doc, index) => {
      console.log(`\nSample ${index + 1}:`);
      const data = doc.data();
      console.log('Fields:', Object.keys(data));
      console.log('Data:', JSON.stringify(data, null, 2));
    });

    // 3. menuItems (既存の公式データ)
    console.log('\n\n✅ menuItems (official):');
    const officialSnapshot = await db.collection('menuItems').limit(2).get();
    officialSnapshot.forEach((doc, index) => {
      console.log(`\nSample ${index + 1}:`);
      const data = doc.data();
      console.log('Fields:', Object.keys(data));
      console.log('Data:', JSON.stringify(data, null, 2));
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

checkStructure();
