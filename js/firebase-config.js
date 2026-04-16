// js/firebase-config.js
// إعدادات Firebase (compat version)

const firebaseConfig = {
  apiKey: "AIzaSyDX2wxXGLkuXCXI3ow2UxaZ88etbNjm4vY",
  authDomain: "itqan-pos.firebaseapp.com",
  projectId: "itqan-pos",
  storageBucket: "itqan-pos.firebasestorage.app",
  messagingSenderId: "697089164410",
  appId: "1:697089164410:web:c40cc455f018ee26b4e7c3",
  measurementId: "G-JZX3TS8HXE"
};

// Initialize Firebase (compat)
firebase.initializeApp(firebaseConfig);

// Firestore
const db = firebase.firestore();

// (اختياري) تفعيل التخزين المؤقت
db.enablePersistence({ synchronizeTabs: true })
  .then(() => console.log('✅ Offline persistence enabled'))
  .catch(err => console.warn('⚠️ Persistence error:', err));

// تعريض db عالميًا
window.db = db;
console.log('✅ Firebase (compat) initialized');
