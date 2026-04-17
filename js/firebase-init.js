// js/firebase-init.js
(function() {
    if (window.firebaseApp) return;

    const firebaseConfig = {
        apiKey: "AIzaSyABydV5hEXVNZyA87aoyyEGTmF7Ndc3LoE",
        authDomain: "parq-893ca.firebaseapp.com",
        projectId: "parq-893ca",
        storageBucket: "parq-893ca.firebasestorage.app",
        messagingSenderId: "179492676601",
        appId: "1:179492676601:web:061f76928423f2b476d328",
        measurementId: "G-DWE6PCECE8"
    };

    firebase.initializeApp(firebaseConfig);
    window.firebaseApp = firebase.app();
    window.db = firebase.firestore();
    window.auth = firebase.auth();

    window.db.enablePersistence({ synchronizeTabs: true })
        .then(() => console.log('✅ Offline persistence enabled'))
        .catch(err => console.warn('⚠️ Persistence error:', err));

    console.log('✅ Firebase initialized');
})();
