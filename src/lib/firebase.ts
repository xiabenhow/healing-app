import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

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
