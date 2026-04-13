// js/firebase-config.js
const firebaseConfig = {
  apiKey: "AIzaSyD...",              // استبدل بقيمتك
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};

// تهيئة Firebase
firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();
const auth = firebase.auth();

// تفعيل التخزين المؤقت (Offline Persistence)
db.enablePersistence()
  .then(() => console.log('Offline persistence enabled'))
  .catch(err => console.error('Persistence error:', err));

// تصدير للاستخدام العام
window.db = db;
window.auth = auth;
