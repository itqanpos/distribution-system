// js/firebase-config.js
const firebaseConfig = {
  apiKey: "AIzaSy...",              // استبدل بالقيم الخاصة بك
  au// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyChQFntrb_ewOFUl4wssdL8k_0kvlndTFQ",
  authDomain: "flutter-ai-playground-af830.firebaseapp.com",
  projectId: "flutter-ai-playground-af830",
  storageBucket: "flutter-ai-playground-af830.firebasestorage.app",
  messagingSenderId: "957185649772",
  appId: "1:957185649772:web:c87254acedaf7ae85dbc49"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
};

// تهيئة Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// تفعيل التخزين المؤقت للعمل دون اتصال
db.enablePersistence({ synchronizeTabs: true })
  .then(() => console.log('✅ Offline persistence enabled'))
  .catch(err => console.warn('⚠️ Persistence error:', err));

// تعريض db للنطاق العام
window.db = db;
console.log('✅ Firebase initialized, db ready');
