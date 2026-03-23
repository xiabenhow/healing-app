import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAGsgSr2xEAfSrRR5fPWdpSvDYV_lRe8hM",
  authDomain: "fragrance-calendar-2027.firebaseapp.com",
  projectId: "fragrance-calendar-2027",
  storageBucket: "fragrance-calendar-2027.firebasestorage.app",
  messagingSenderId: "917280770124",
  appId: "1:917280770124:web:dcadeff68b9f0131dd0ce9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const collections = ['calendar_authorized', 'calendars', 'users', 'orders', 'bookings', 'diary', 'records', 'mood', 'members'];

for (const name of collections) {
  try {
    const snap = await getDocs(collection(db, name));
    if (snap.size > 0) {
      console.log(`\n✅ ${name}: ${snap.size} documents`);
      snap.docs.slice(0, 3).forEach(d => {
        console.log(`  - ${d.id}:`, JSON.stringify(d.data()).substring(0, 200));
      });
    } else {
      console.log(`📭 ${name}: empty`);
    }
  } catch (e) {
    console.log(`❌ ${name}: ${e.message?.substring(0, 100)}`);
  }
}

process.exit(0);
