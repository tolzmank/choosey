// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDbLjSQL_J5s1_vPpTNGBNndhc0ptNCsaQ",
  authDomain: "choosey-473722.firebaseapp.com",
  projectId: "choosey-473722",
  storageBucket: "choosey-473722.firebasestorage.app",
  messagingSenderId: "815398912499",
  appId: "1:815398912499:web:a2d7633d784b2e74ed1286",
  measurementId: "G-8396Q4LJJF"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { auth, googleProvider };