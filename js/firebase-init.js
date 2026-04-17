// js/firebase-init.js
(function() {
    // منع إعادة التهيئة
    if (window.firebaseApp) {
        console.log('✅ Firebase already initialized');
        return;
    }

    const firebaseConfig = {
        apiKey: "AIzaSyABydV5hEXVNZyA87aoyyEGTmF7Ndc3LoE",
        authDomain: "parq-893ca.firebaseapp.com",
        projectId: "parq-893ca",
        storageBucket: "parq-893ca.firebasestorage.app",
        messagingSenderId: "179492676601",
        appId: "1:179492676601:web:061f76928423f2b476d328",
        measurementId: "G-DWE6PCECE8"
    };

    // تهيئة Firebase
    firebase.initializeApp(firebaseConfig);
    window.firebaseApp = firebase.app();
    window.db = firebase.firestore();
    window.auth = firebase.auth();

    // تفعيل التخزين المؤقت (Offline Persistence)
    window.db.enablePersistence({ synchronizeTabs: true })
        .then(() => console.log('✅ Offline persistence enabled'))
        .catch(err => {
            if (err.code === 'failed-precondition') {
                console.warn('⚠️ Multiple tabs open, persistence can only be enabled in one tab.');
            } else if (err.code === 'unimplemented') {
                console.warn('⚠️ Browser does not support offline persistence.');
            }
        });

    console.log('✅ Firebase initialized successfully');
})();
