const admin = require('firebase-admin');

// We'll use environment variables for Firebase initialization.
// The private key needs to handle escaped newlines.
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY 
    ? (process.env.FIREBASE_PRIVATE_KEY.includes('\\n') 
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
        : process.env.FIREBASE_PRIVATE_KEY)
    : undefined,
};

if (serviceAccount.projectId && serviceAccount.clientEmail && serviceAccount.privateKey) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('Firebase Admin initialized successfully');
  } catch (err) {
    console.error('Firebase initialization error:', err.message);
  }
} else {
  console.warn('Firebase environment variables missing:');
  if (!serviceAccount.projectId) console.warn('- FIREBASE_PROJECT_ID is missing');
  if (!serviceAccount.clientEmail) console.warn('- FIREBASE_CLIENT_EMAIL is missing');
  if (!serviceAccount.privateKey) console.warn('- FIREBASE_PRIVATE_KEY is missing');
  console.warn('Firestore functionality will be disabled.');
}

const db = admin.apps.length > 0 ? admin.firestore() : null;

module.exports = { db, admin };
