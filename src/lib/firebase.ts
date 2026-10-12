import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBYZyQmlgIWwLPM0yEXuu2AjDBCPhA7nb0",
  authDomain: "better-ajo-b629a.firebaseapp.com",
  projectId: "better-ajo-b629a",
  storageBucket: "better-ajo-b629a.firebasestorage.app",
  messagingSenderId: "575486317735",
  appId: "1:575486317735:web:4548a2854af91be9213782",
  measurementId: "G-CEJG539WL4"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
