// js/firebase-config.js
const firebaseConfig = {
  apiKey: "AIzaSyD...",              // استبدل بقيم
  
<script type="module">
  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
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
</script>
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
