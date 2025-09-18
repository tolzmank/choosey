// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

  const firebaseConfig = {
    apiKey: "AIzaSyCqgEU3MC99RRiJcFnh6qZu7cqm2mzH-j0",
    authDomain: "choosey-463422.firebaseapp.com",
    projectId: "choosey-463422",
    storageBucket: "choosey-463422.appspot.com",
    messagingSenderId: "972281558326",
    appId: "1:972281558326:web:4183dcadbd95da4e2c2f97",
    measurementId: "G-X9R8NWZX3G"
  };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { auth, googleProvider };