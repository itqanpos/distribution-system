// js/firebase-config.js
const firebaseConfig = {
  ap             // استبدل بالقيم الخاصة بك
  au
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAC8oWtV_03-A0pV6uWsYy3dn3s72jWNwE",
  authDomain: "fooddist-web.firebaseapp.com",
  projectId: "fooddist-web",
  storageBucket: "fooddist-web.firebasestorage.app",
  messagingSenderId: "527614074210",
  appId: "1:527614074210:web:02f6ad63a37917a302a03b",
  measurementId: "G-HSZKH6FYBW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
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
