import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAGsgSr2xEAfSrRR5fPWdpSvDYV_lRe8hM",
  authDomain: "fragrance-calendar-2027.firebaseapp.com",
  projectId: "fragrance-calendar-2027",
  storageBucket: "fragrance-calendar-2027.firebasestorage.app",
  messagingSenderId: "917280770124",
  appId: "1:917280770124:web:dcadeff68b9f0131dd0ce9"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
