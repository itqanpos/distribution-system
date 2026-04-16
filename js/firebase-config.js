// js/firebase-config.js
// إعدادات Firebase (compat version) - مشروع parq-893ca

const firebaseConfig = {
  apiKey: "AIzaSyABydV5hEXVNZyA87aoyyEGTmF7Ndc3LoE",
  authDomain: "parq-893ca.firebaseapp.com",
  projectId: "parq-893ca",
  storageBucket: "parq-893ca.firebasestorage.app",
  messagingSenderId: "179492676601",
  appId: "1:179492676601:web:061f76928423f2b476d328",
  measurementId: "G-DWE6PCECE8"
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
console.log('✅ Firebase (compat) initialized for project: parq-893ca');
