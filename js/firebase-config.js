// js/firebase-config.js
const firebaseConfig = {
  // استبدل بقيم مشروعك
  apiKey: "AIzaSy...",
  au// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDdhJFdNaCiRjbig_GdQG_4fQ-T-Xy1RFQ",
  authDomain: "flutter-ai-playground-af830.firebaseapp.com",
  projectId: "flutter-ai-playground-af830",
  storageBucket: "flutter-ai-playground-af830.firebasestorage.app",
  messagingSenderId: "957185649772",
  appId: "1:957185649772:web:52d0d54b8d66ec605dbc49"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
db.enablePersistence({ synchronizeTabs: true }).catch(err => console.warn('Persistence error:', err));
window.db = db;
