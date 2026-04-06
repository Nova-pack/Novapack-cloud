// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCHIqqwPtx5SFzf5d-cb6H0VSwX5eP_5lE",
    authDomain: "novapack-68f05.firebaseapp.com",
    projectId: "novapack-68f05",
    storageBucket: "novapack-68f05.firebasestorage.app",
    messagingSenderId: "139474143296",
    appId: "1:139474143296:web:92e8bf80a50adba0cd77a5",
};

// Google Maps API Key
var GOOGLE_MAPS_API_KEY = 'AIzaSyCE39TSVCQMIyWVP2Kk8givggrq0vU-R5A';

// Initialize Firebase (Global Variables)
var firebaseApp = firebase.initializeApp(firebaseConfig);
var auth = firebase.auth();
var db = firebase.firestore();
