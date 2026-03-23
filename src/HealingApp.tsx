import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import { auth, googleProvider, db } from './lib/firebase';
import { OIL_LIBRARY, FAMILY_EMOJI, type OilLibraryItem } from './oilLibraryData';


// ===================== TYPES =====================

type EmotionKey = 'calm' | 'anxious' | 'tired' | 'warm' | 'low' | 'energized';
type PageType = 'home' | 'diary' | 'recipe' | 'card' | 'healer' | 'library' | 'calendar' | 'sound' | 'booking' | 'member' | 'shop';
type TaskKey = 'checkin' | 'card' | 'note' | 'breathe' | 'evening' | 'share';

interface CartItem {
  id: string;
  productId: number;
  variationId?: number;
  name: string;
  specs: string;
  price: number;
  quantity: number;
  isVirtual: boolean;
  image?: string;
  bookingDate?: string;
  bookingTime?: string;
  persons?: number;
}

interface WCProduct {
  id: number;
  name: string;
  price: string;
  description: string;
  short_description: string;
  images: { src: string }[];
  type: string;
}

interface HealingRecord {
  date: string;
  emotion: EmotionKey;
  note?: string;
}

interface EmotionInfo {
  key: EmotionKey;
  label: string;
  emoji: string;
  gradient: string;
  color: string;
  ringColor: string;
}

interface OilInfo {
  name: string;
  nameEn: string;
  family: string;
  scent: string;
  mental: string;
  physical: string;
  caution: string;
}

interface RecipeInfo {
  oils: { name: string; drops: number; role: string }[];
  usage: string;
  message: string;
}

interface CardInfo {
  id: number;
  name: string;
  emoji: string;
  recipe: string;
  ritual: string;
  gradient: string;
}

interface OrderItem {
  id: number;
  date: string;
  status: string;
  total: number;
}

// ===================== CONSTANTS =====================

const EMOTIONS: EmotionInfo[] = [
  { key: 'calm', label: '平靜', emoji: '😌', gradient: 'from-teal-100 to-cyan-50', color: '#7EC8C8', ringColor: 'ring-teal-300' },
  { key: 'anxious', label: '焦慮', emoji: '😰', gradient: 'from-purple-100 to-violet-50', color: '#B8A0E0', ringColor: 'ring-purple-300' },
  { key: 'tired', label: '疲倦', emoji: '😴', gradient: 'from-slate-200 to-blue-50', color: '#A0B0C8', ringColor: 'ring-slate-300' },
  { key: 'warm', label: '溫暖', emoji: '🥰', gradient: 'from-orange-100 to-pink-50', color: '#F0A878', ringColor: 'ring-orange-300' },
  { key: 'low', label: '低落', emoji: '😔', gradient: 'from-gray-200 to-stone-100', color: '#A0A0A8', ringColor: 'ring-gray-300' },
  { key: 'energized', label: '充能', emoji: '🔥', gradient: 'from-amber-100 to-yellow-50', color: '#F0C848', ringColor: 'ring-amber-300' },
];

const DAILY_QUOTES = [
  '你不需要解決所有事，今天先照顧自己就好。',
  '慢下來，不是落後，是在聽自己說話。',
  '你已經比昨天的自己多走了一步。',
  '今天的感受，都是真實且值得被看見的。',
  '不完美的今天，也是完整的一天。',
  '你很好，就算你現在不這麼覺得。',
  '先深呼吸，再說其他的。',
];

const MICRO_TASKS = [
  '4-7-8 呼吸法：吸氣4秒，屏息7秒，呼氣8秒。做三次。',
  '把肩膀往下放，感覺後背靠在椅子上。停留30秒。',
  '喝一杯溫水，慢慢喝。這是今天給自己的儀式。',
  '閉上眼睛，想一個讓你感到安心的地方。停留一下。',
];

// --- NEW: Daily Task System ---
const TASK_LABELS: Record<TaskKey, string> = {
  checkin: '晨間情緒打卡',
  card: '抽一張精油卡',
  note: '寫今日情緒筆記',
  breathe: '做呼吸練習',
  evening: '晚間回饋打卡',
  share: '分享今日卡片',
};

const TASK_KEYS: TaskKey[] = ['checkin', 'card', 'note', 'breathe', 'evening', 'share'];

const emptyTasks = (): Record<TaskKey, boolean> => ({
  checkin: false, card: false, note: false, breathe: false, evening: false, share: false,
});

// --- NEW: Evening Feedback Responses ---
const EVENING_RESPONSES: Record<string, string> = {
  better: '很好 🌸 你今天做到了。薰衣草精油晚上可以繼續陪你入睡，好好休息。',
  little: '一點點進步也是進步 🌿 今晚試試把肩膀放下來，讓身體好好休息。',
  same: '沒關係，有些天就是這樣 😔 今晚不需要逼自己好起來，先讓身體休息。',
};

// --- NEW: Milestone Days ---
const MILESTONE_DAYS = [7, 14, 30, 60];

// --- Order Status Mapping ---
const ORDER_STATUS_MAP: Record<string, string> = {
  'processing': '處理中',
  'completed': '已完成',
  'on-hold': '待確認',
  'pending': '待付款',
  'cancelled': '已取消',
  'refunded': '已退款',
};

const API_BASE = 'https://us-central1-fragrance-calendar-2027.cloudfunctions.net/api';

const OILS: Record<string, OilInfo> = {
  '真正薰衣草': { name: '真正薰衣草', nameEn: 'True Lavender', family: '唇形科', scent: '草本花香，溫柔安撫', mental: '安撫焦慮、放鬆緊繃的心情，帶來平靜與安心感', physical: '助眠、緩解頭痛、舒緩肌肉緊張', caution: '低血壓者留意用量' },
  '絲柏': { name: '絲柏', nameEn: 'Cypress', family: '柏科', scent: '清新木質調，沉穩內斂', mental: '穩定情緒波動，給予安定感與方向感', physical: '促進循環、收斂、淨化呼吸道', caution: '孕婦避免使用' },
  '乳香': { name: '乳香', nameEn: 'Frankincense', family: '橄欖科', scent: '溫暖樹脂香，神聖沉靜', mental: '深層放鬆、幫助冥想、連結內在平靜', physical: '修護肌膚、抗發炎、強化免疫', caution: '一般使用安全' },
  '洋甘菊': { name: '洋甘菊', nameEn: 'Roman Chamomile', family: '菊科', scent: '甜美草本香，如蘋果般溫潤', mental: '化解煩躁、安撫內在小孩、溫柔包容', physical: '助眠、舒緩敏感肌、緩和消化不適', caution: '菊科過敏者注意' },
  '花梨木': { name: '花梨木', nameEn: 'Rosewood', family: '樟科', scent: '柔和木質花香，溫暖細膩', mental: '療癒受傷的心、重建自信與安全感', physical: '護膚、提升免疫力', caution: '一般使用安全' },
  '雪松': { name: '雪松', nameEn: 'Cedarwood', family: '松科', scent: '沉穩木質調，如森林般厚實', mental: '增強自信與穩定感，接地扎根', physical: '促進循環、收斂毛孔', caution: '孕婦避免使用' },
  '歐洲赤松': { name: '歐洲赤松', nameEn: 'Scots Pine', family: '松科', scent: '清新森林氣息，充滿活力', mental: '注入活力與動力，化解疲憊與無力感', physical: '提振精神、淨化呼吸道、增強體力', caution: '敏感肌膚低劑量使用' },
  '迷迭香': { name: '迷迭香', nameEn: 'Rosemary', family: '唇形科', scent: '草本清新，提神醒腦', mental: '增強專注力與記憶力，清理思緒', physical: '促進血液循環、緩解肌肉疲勞', caution: '孕婦及癲癇患者避免使用' },
  '甜橙': { name: '甜橙', nameEn: 'Sweet Orange', family: '芸香科', scent: '明亮甜美果香，溫暖愉悅', mental: '帶來快樂與正向能量，化解憂鬱', physical: '助消化、促進食慾', caution: '具光敏性，使用後避免日曬' },
  '玫瑰天竺葵': { name: '玫瑰天竺葵', nameEn: 'Rose Geranium', family: '牻牛兒苗科', scent: '玫瑰般花香，甜美平衡', mental: '平衡情緒、療癒心靈、提升自我愛', physical: '平衡荷爾蒙、護膚養顏', caution: '孕早期避免使用' },
  '橙花': { name: '橙花', nameEn: 'Neroli', family: '芸香科', scent: '優雅花香，清新而高貴', mental: '深層療癒、釋放壓力、帶來希望', physical: '護膚修復、助眠、舒緩心悸', caution: '一般使用安全' },
  '佛手柑': { name: '佛手柑', nameEn: 'Bergamot', family: '芸香科', scent: '清新果香帶花香，明亮優雅', mental: '提振心情、化解低落、帶來陽光感', physical: '舒緩消化不適、抗菌', caution: '具光敏性，使用後避免日曬' },
  '依蘭依蘭': { name: '依蘭依蘭', nameEn: 'Ylang Ylang', family: '番荔枝科', scent: '濃郁花香，甜美感性', mental: '釋放壓力、喚醒感官、提升自信', physical: '平衡油脂分泌、調節血壓', caution: '高劑量可能引起頭痛' },
  '克萊門橙': { name: '克萊門橙', nameEn: 'Clementine', family: '芸香科', scent: '清甜果香，活潑明亮', mental: '帶來輕鬆愉快感、激發創造力', physical: '助消化、提振精神', caution: '具光敏性，使用後避免日曬' },
  '快樂鼠尾草': { name: '快樂鼠尾草', nameEn: 'Clary Sage', family: '唇形科', scent: '溫暖草本帶甜香', mental: '釋放情緒壓力、帶來幸福感與放鬆', physical: '平衡荷爾蒙、緩解經期不適', caution: '孕婦避免使用，不宜與酒精併用' },
  '苦橙葉': { name: '苦橙葉', nameEn: 'Petitgrain', family: '芸香科', scent: '清新草本帶微甜木質調', mental: '舒緩焦慮、穩定情緒、幫助入眠', physical: '平衡油脂、舒緩肌肉痙攣', caution: '一般使用安全' },
  '薄荷': { name: '薄荷', nameEn: 'Peppermint', family: '唇形科', scent: '清涼提神，醒腦振奮', mental: '清醒頭腦、提升專注力', physical: '緩解頭痛、舒緩鼻塞、助消化', caution: '嬰幼兒及孕婦避免使用' },
  '檸檬': { name: '檸檬', nameEn: 'Lemon', family: '芸香科', scent: '清新明亮果香', mental: '淨化心情、帶來清新正向感', physical: '抗菌、促進血液循環', caution: '具光敏性，使用後避免日曬' },
  '加拿大冷杉': { name: '加拿大冷杉', nameEn: 'Balsam Fir', family: '松科', scent: '清新森林香氣，甜美針葉調', mental: '接地安定、回歸自然的平靜', physical: '淨化呼吸道、舒緩肌肉緊張', caution: '敏感肌膚低劑量使用' },
};

const RECIPES: Record<EmotionKey, RecipeInfo> = {
  calm: {
    oils: [{ name: '真正薰衣草', drops: 5, role: '主力' }, { name: '絲柏', drops: 3, role: '輔助' }, { name: '乳香', drops: 2, role: '點綴' }],
    usage: '睡前擴香15分鐘',
    message: '你已經找到了今天的平靜。讓香氣延續這份安寧，好好休息吧。',
  },
  anxious: {
    oils: [{ name: '洋甘菊', drops: 5, role: '主力' }, { name: '花梨木', drops: 3, role: '輔助' }, { name: '雪松', drops: 2, role: '點綴' }],
    usage: '隨時嗅吸 + 擴香',
    message: '讓焦慮的心先落地。不用現在就解決，先把自己穩住。',
  },
  tired: {
    oils: [{ name: '歐洲赤松', drops: 5, role: '主力' }, { name: '迷迭香', drops: 3, role: '輔助' }, { name: '甜橙', drops: 2, role: '點綴' }],
    usage: '早晨擴香提神',
    message: '疲倦是身體在說話。先給自己充電，再出發也不遲。',
  },
  warm: {
    oils: [{ name: '玫瑰天竺葵', drops: 5, role: '主力' }, { name: '橙花', drops: 3, role: '輔助' }, { name: '佛手柑', drops: 2, role: '點綴' }],
    usage: '隨時擴香',
    message: '溫暖的感覺很珍貴，好好記住這個瞬間。',
  },
  low: {
    oils: [{ name: '佛手柑', drops: 5, role: '主力' }, { name: '甜橙', drops: 3, role: '輔助' }, { name: '依蘭依蘭', drops: 2, role: '點綴' }],
    usage: '白天擴香',
    message: '低落不代表你不好。給自己時間，陽光會回來的。',
  },
  energized: {
    oils: [{ name: '迷迭香', drops: 4, role: '主力' }, { name: '歐洲赤松', drops: 4, role: '輔助' }, { name: '克萊門橙', drops: 2, role: '點綴' }],
    usage: '工作前擴香',
    message: '充滿能量的你真棒！把這股力量用在最重要的事上吧。',
  },
};

const CARDS: CardInfo[] = [
  { id: 1, name: '晨霧儀式', emoji: '🌅', recipe: '迷迭香 5滴 + 薄荷 3滴 + 檸檬 2滴', ritual: '在第一口呼吸裡，把今天拿回來。', gradient: 'from-amber-100 to-orange-100' },
  { id: 2, name: '入夜安放', emoji: '🌙', recipe: '真正薰衣草 5滴 + 乳香 3滴 + 雪松 2滴', ritual: '放下今天所有的重量，你已經做夠了。', gradient: 'from-indigo-100 to-purple-100' },
  { id: 3, name: '正午清醒', emoji: '☀️', recipe: '歐洲赤松 4滴 + 佛手柑 3滴 + 迷迭香 3滴', ritual: '這一刻只屬於你，深呼吸一次再繼續。', gradient: 'from-yellow-100 to-amber-100' },
  { id: 4, name: '溫柔邊界', emoji: '🌿', recipe: '洋甘菊 5滴 + 花梨木 3滴 + 苦橙葉 2滴', ritual: '你可以溫柔，也可以有底線。', gradient: 'from-emerald-100 to-teal-100' },
  { id: 5, name: '心動時刻', emoji: '💛', recipe: '橙花 5滴 + 玫瑰天竺葵 3滴 + 佛手柑 2滴', ritual: '讓心跳快一點也沒關係，這是活著的感覺。', gradient: 'from-rose-100 to-pink-100' },
  { id: 6, name: '森林呼吸', emoji: '🌲', recipe: '絲柏 4滴 + 加拿大冷杉 4滴 + 雪松 2滴', ritual: '把根扎下去，讓風過去。', gradient: 'from-green-100 to-emerald-100' },
  { id: 7, name: '感恩收尾', emoji: '🙏', recipe: '乳香 5滴 + 玫瑰天竺葵 3滴 + 甜橙 2滴', ritual: '今天有什麼值得記住？先謝謝自己。', gradient: 'from-orange-100 to-rose-100' },
  { id: 8, name: '重啟按鈕', emoji: '🔄', recipe: '快樂鼠尾草 4滴 + 佛手柑 3滴 + 薰衣草 3滴', ritual: '不是重來，是重新開始——帶著你學到的。', gradient: 'from-sky-100 to-blue-100' },
  { id: 9, name: '孤獨美好', emoji: '🕯️', recipe: '乳香 5滴 + 絲柏 3滴 + 花梨木 2滴', ritual: '一個人也可以很完整。', gradient: 'from-stone-100 to-amber-100' },
  { id: 10, name: '創意流動', emoji: '🎨', recipe: '依蘭依蘭 3滴 + 佛手柑 4滴 + 迷迭香 3滴', ritual: '讓想法自由流動，不用現在就有答案。', gradient: 'from-fuchsia-100 to-pink-100' },
  { id: 11, name: '關係滋養', emoji: '🌸', recipe: '玫瑰天竺葵 5滴 + 橙花 3滴 + 克萊門橙 2滴', ritual: '你給出的愛，也記得留一些給自己。', gradient: 'from-rose-100 to-orange-100' },
  { id: 12, name: '勇氣一刻', emoji: '⚡', recipe: '歐洲赤松 5滴 + 迷迭香 3滴 + 乳香 2滴', ritual: '你比你以為的更有能力。', gradient: 'from-violet-100 to-indigo-100' },
];



// ===================== HELPERS =====================

const formatDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getToday = (): string => formatDate(new Date());


const getDayOfYear = (): number => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
};

const getDisplayDate = (): string => {
  const now = new Date();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  return `${m}月${d}日 週${days[now.getDay()]}`;
};

const loadRecords = (): HealingRecord[] => {
  try {
    const data = localStorage.getItem('healing_records');
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const saveRecords = (records: HealingRecord[]): void => {
  localStorage.setItem('healing_records', JSON.stringify(records));
};

// Firestore-enabled versions for async operations
const loadRecordsFromFirestore = async (userId: string): Promise<HealingRecord[]> => {
  try {
    const recordsRef = collection(db, `diary/${userId}/records`);
    const q = query(recordsRef, orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      date: doc.data().date,
      emotion: doc.data().emotion,
      note: doc.data().note,
    })) as HealingRecord[];
  } catch (error) {
    console.error('Error loading records from Firestore:', error);
    return [];
  }
};

const saveRecordToFirestore = async (userId: string, record: HealingRecord): Promise<void> => {
  try {
    const docRef = doc(db, `diary/${userId}/records`, record.date);
    await setDoc(docRef, {
      date: record.date,
      emotion: record.emotion,
      note: record.note || null,
      createdAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error saving record to Firestore:', error);
  }
};

const loadSavedCards = (): number[] => {
  try {
    const data = localStorage.getItem('healing_cards');
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const saveSavedCards = (cards: number[]): void => {
  localStorage.setItem('healing_cards', JSON.stringify(cards));
};

const getEmotionInfo = (key: EmotionKey): EmotionInfo => {
  return EMOTIONS.find(e => e.key === key)!;
};

const getStreak = (records: HealingRecord[]): number => {
  if (records.length === 0) return 0;
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
  const uniqueDates = [...new Set(sorted.map(r => r.date))];
  let streak = 0;
  const today = new Date();

  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const dateStr = formatDate(checkDate);
    if (uniqueDates.includes(dateStr)) {
      streak++;
    } else if (i === 0) {
      continue;
    } else {
      break;
    }
  }
  return streak;
};

const getWeekCheckins = (records: HealingRecord[]): number => {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset);

  let count = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = formatDate(d);
    if (records.some(r => r.date === dateStr)) count++;
  }
  return count;
};

const getStabilityStars = (records: HealingRecord[]): number => {
  if (records.length < 3) return 3;
  const recent = records.slice(-7);
  const variety = new Set(recent.map(r => r.emotion)).size;
  if (variety <= 2) return 5;
  if (variety <= 3) return 4;
  if (variety <= 4) return 3;
  return 2;
};

const getMostFrequentEmotion = (records: HealingRecord[]): EmotionKey | null => {
  if (records.length === 0) return null;
  const counts: Partial<Record<EmotionKey, number>> = {};
  records.forEach(r => {
    counts[r.emotion] = (counts[r.emotion] || 0) + 1;
  });
  let maxKey: EmotionKey | null = null;
  let maxCount = 0;
  for (const [key, count] of Object.entries(counts)) {
    if (count! > maxCount) {
      maxKey = key as EmotionKey;
      maxCount = count!;
    }
  }
  return maxKey;
};

const seedDemoData = (): HealingRecord[] => {
  const demoEmotions: EmotionKey[] = ['anxious', 'tired', 'calm', 'warm', 'energized', 'warm', 'calm'];
  const records: HealingRecord[] = [];
  const today = new Date();
  for (let i = 6; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    records.push({ date: formatDate(d), emotion: demoEmotions[6 - i] });
  }
  return records;
};

// --- NEW: Daily Task Storage ---
const loadDailyTasks = (): Record<TaskKey, boolean> => {
  try {
    const data = localStorage.getItem(`healing_tasks_${getToday()}`);
    return data ? { ...emptyTasks(), ...JSON.parse(data) } : emptyTasks();
  } catch { return emptyTasks(); }
};

const saveDailyTasks = (tasks: Record<TaskKey, boolean>): void => {
  localStorage.setItem(`healing_tasks_${getToday()}`, JSON.stringify(tasks));
};

// --- NEW: Evening Feedback Storage ---
const loadEveningFeedback = (): string | null => {
  try { return localStorage.getItem(`healing_evening_${getToday()}`); }
  catch { return null; }
};

const saveEveningFeedback = (val: string): void => {
  localStorage.setItem(`healing_evening_${getToday()}`, val);
};

// --- NEW: Milestone Storage ---
const loadShownMilestones = (): number[] => {
  try {
    const data = localStorage.getItem('healing_milestones_shown');
    return data ? JSON.parse(data) : [];
  } catch { return []; }
};

const addShownMilestone = (n: number): void => {
  const existing = loadShownMilestones();
  if (!existing.includes(n)) {
    localStorage.setItem('healing_milestones_shown', JSON.stringify([...existing, n]));
  }
};

const getLevel = (days: number) => {
  if (days >= 60) return { name: '穩定之心', emoji: '✨', level: 4, next: Infinity, min: 60 };
  if (days >= 22) return { name: '自我療癒者', emoji: '🌸', level: 3, next: 60, min: 22 };
  if (days >= 8) return { name: '情緒觀察者', emoji: '🌿', level: 2, next: 22, min: 8 };
  return { name: '療癒旅人', emoji: '🌱', level: 1, next: 8, min: 0 };
};

const renderStars = (count: number): string => {
  return '★'.repeat(count) + '☆'.repeat(5 - count);
};

// ===================== ANIMATION VARIANTS =====================

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.08 } },
};

const staggerItem = {
  initial: { opacity: 0, y: 15 },
  animate: { opacity: 1, y: 0 },
};

// ===================== SUB-COMPONENTS =====================

function OilModal({ oilName, onClose }: { oilName: string; onClose: () => void }) {
  const oil = OILS[oilName];
  if (!oil) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-md rounded-t-3xl p-6 pb-10"
        style={{ backgroundColor: '#FFFEF9' }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-gray-300" />
        <h3 className="text-xl font-bold mb-1" style={{ color: '#3D3530' }}>{oil.name}</h3>
        <p className="text-sm mb-1" style={{ color: '#8C7B72' }}>{oil.nameEn} · {oil.family}</p>
        <p className="text-sm mb-4" style={{ color: '#8C7B72' }}>🌸 {oil.scent}</p>

        <div className="space-y-3">
          <div className="rounded-2xl p-4" style={{ backgroundColor: '#FAF8F5' }}>
            <p className="text-sm font-medium mb-1" style={{ color: '#3D3530' }}>🧠 心理功效</p>
            <p className="text-sm" style={{ color: '#8C7B72' }}>{oil.mental}</p>
          </div>
          <div className="rounded-2xl p-4" style={{ backgroundColor: '#FAF8F5' }}>
            <p className="text-sm font-medium mb-1" style={{ color: '#3D3530' }}>🫀 生理功效</p>
            <p className="text-sm" style={{ color: '#8C7B72' }}>{oil.physical}</p>
          </div>
          <div className="rounded-2xl p-4" style={{ backgroundColor: '#FAF8F5' }}>
            <p className="text-sm font-medium mb-1" style={{ color: '#3D3530' }}>⚠️ 注意事項</p>
            <p className="text-sm" style={{ color: '#8C7B72' }}>{oil.caution}</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-2xl py-3 text-white font-medium"
          style={{ backgroundColor: '#8FA886' }}
        >
          關閉
        </button>
      </motion.div>
    </motion.div>
  );
}

function EmotionPicker({
  selected,
  onSelect,
}: {
  selected: EmotionKey | null;
  onSelect: (key: EmotionKey) => void;
}) {
  return (
    <motion.div
      className="grid grid-cols-3 gap-3"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {EMOTIONS.map((emo) => (
        <motion.button
          key={emo.key}
          variants={staggerItem}
          whileTap={{ scale: 0.92 }}
          onClick={() => onSelect(emo.key)}
          className={`flex flex-col items-center justify-center rounded-2xl py-4 px-2 bg-gradient-to-br ${emo.gradient} transition-all ${
            selected === emo.key ? `ring-3 ${emo.ringColor} scale-105` : ''
          }`}
        >
          <span className="text-3xl mb-1">{emo.emoji}</span>
          <span className="text-xs font-medium" style={{ color: '#3D3530' }}>{emo.label}</span>
        </motion.button>
      ))}
    </motion.div>
  );
}

function BreathingCircle() {
  const [step, setStep] = useState(0);
  const phases = ['吸氣 4 秒...', '屏息 4 秒...', '呼氣 4 秒...'];
  const scales = [1.35, 1.35, 1];

  useEffect(() => {
    const interval = setInterval(() => {
      setStep(s => (s + 1) % 3);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      <motion.div
        className="w-28 h-28 rounded-full bg-gradient-to-br from-teal-200 to-emerald-100 flex items-center justify-center shadow-md"
        animate={{ scale: scales[step] }}
        transition={{ duration: 3.5, ease: 'easeInOut' }}
      >
        <span className="text-sm font-medium" style={{ color: '#3D3530' }}>🌿</span>
      </motion.div>
      <motion.p
        key={step}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-sm font-medium"
        style={{ color: '#8C7B72' }}
      >
        {phases[step]}
      </motion.p>
    </div>
  );
}

// ===================== NEW: MORNING FLOW MODAL =====================

function MorningFlowModal({
  emotion,
  onDone,
}: {
  emotion: EmotionKey;
  onDone: () => void;
}) {
  const emoInfo = getEmotionInfo(emotion);
  const recipe = RECIPES[emotion];
  const dayIndex = getDayOfYear();

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <motion.div
        className="relative w-full max-w-md rounded-t-3xl p-6 pb-10 space-y-5"
        style={{ backgroundColor: '#FFFEF9' }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        <div className="mx-auto mb-2 h-1 w-12 rounded-full bg-gray-300" />

        {/* Checkin confirmed */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-100 to-emerald-50 flex items-center justify-center">
            <span className="text-2xl">{emoInfo.emoji}</span>
          </div>
          <div>
            <p className="text-base font-bold" style={{ color: '#3D3530' }}>晨間打卡完成 ✅</p>
            <p className="text-sm" style={{ color: '#8C7B72' }}>今天感覺：{emoInfo.label}</p>
          </div>
        </div>

        {/* Today's recipe */}
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, #FAF8F5, #FFF8E7)' }}>
          <p className="text-xs font-medium mb-2" style={{ color: '#C9A96E' }}>🌿 今日香氛處方</p>
          <p className="text-sm font-medium mb-1" style={{ color: '#3D3530' }}>
            {recipe.oils.map(o => o.name).join(' + ')}
          </p>
          <p className="text-xs italic" style={{ color: '#8C7B72' }}>「{recipe.message}」</p>
          <p className="text-xs mt-1" style={{ color: '#8FA886' }}>使用方式：{recipe.usage}</p>
        </div>

        {/* Today's micro task */}
        <div className="rounded-2xl p-4" style={{ backgroundColor: '#FAF8F5' }}>
          <p className="text-xs font-medium mb-2" style={{ color: '#3D3530' }}>✨ 今日微任務</p>
          <p className="text-sm" style={{ color: '#8C7B72' }}>{MICRO_TASKS[dayIndex % MICRO_TASKS.length]}</p>
        </div>

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onDone}
          className="w-full rounded-2xl py-3 text-white font-medium"
          style={{ backgroundColor: '#8FA886' }}
        >
          開始今天 →
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

// ===================== NEW: MILESTONE MODAL =====================

function MilestoneModal({
  days,
  onClose,
}: {
  days: number;
  onClose: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-sm rounded-3xl p-8 text-center"
        style={{ backgroundColor: '#FFFEF9' }}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      >
        <motion.div
          className="text-6xl mb-4"
          animate={{ rotate: [0, -10, 10, -5, 5, 0] }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          🎉
        </motion.div>
        <h2 className="text-xl font-bold mb-2" style={{ color: '#3D3530' }}>
          你已經連續照顧自己 {days} 天了！
        </h2>
        <p className="text-sm leading-relaxed mb-6" style={{ color: '#8C7B72' }}>
          你已經開始理解自己的情緒了 🌱<br />
          推薦你來做一堂專屬香氛體驗——<br />
          讓香氛師根據你的情緒，調製屬於你的那瓶香。
        </p>

        <a
          href="https://xiabenhow.com"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full rounded-2xl py-3 text-white font-medium text-sm mb-3"
          style={{ backgroundColor: '#C9A96E' }}
        >
          🌸 了解調香體驗課程
        </a>
        <button
          onClick={onClose}
          className="w-full rounded-2xl py-3 text-sm font-medium"
          style={{ backgroundColor: '#FAF8F5', color: '#8C7B72' }}
        >
          繼續我的療癒旅程
        </button>
      </motion.div>
    </motion.div>
  );
}

// ===================== NEW: DAILY TASK LIST =====================

function DailyTaskList({
  tasks,
  onToggle,
}: {
  tasks: Record<TaskKey, boolean>;
  onToggle: (key: TaskKey) => void;
}) {
  const completed = TASK_KEYS.filter(k => tasks[k]).length;
  const pct = Math.round((completed / TASK_KEYS.length) * 100);

  return (
    <div className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-base font-bold" style={{ color: '#3D3530' }}>今日任務</p>
        <span className="text-xs font-medium" style={{ color: '#8FA886' }}>{completed}/{TASK_KEYS.length} 完成</span>
      </div>
      {/* Progress bar */}
      <div className="w-full h-2 rounded-full mb-4 overflow-hidden" style={{ backgroundColor: '#FAF8F5' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, #8FA886, #C9A96E)' }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      {/* Task items */}
      <div className="space-y-2">
        {TASK_KEYS.map((key) => (
          <motion.button
            key={key}
            whileTap={{ scale: 0.97 }}
            onClick={() => onToggle(key)}
            className="w-full flex items-center gap-3 rounded-xl p-2 text-left transition-opacity"
            style={{ opacity: tasks[key] ? 0.6 : 1 }}
          >
            <div
              className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center border-2 transition-all"
              style={{
                borderColor: tasks[key] ? '#8FA886' : '#D0CCC8',
                backgroundColor: tasks[key] ? '#8FA886' : 'transparent',
              }}
            >
              {tasks[key] && (
                <motion.svg
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  width="10" height="10" viewBox="0 0 10 10" fill="none"
                >
                  <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </motion.svg>
              )}
            </div>
            <span
              className="text-sm"
              style={{
                color: tasks[key] ? '#8C7B72' : '#3D3530',
                textDecoration: tasks[key] ? 'line-through' : 'none',
              }}
            >
              {TASK_LABELS[key]}
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

// ===================== NEW: EVENING FEEDBACK =====================

function EveningFeedback({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(loadEveningFeedback());

  const handleSelect = (val: string) => {
    setSelected(val);
    saveEveningFeedback(val);
    onComplete();
  };

  if (selected) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl p-5 shadow-sm"
        style={{ backgroundColor: '#FFFEF9' }}
      >
        <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>🌙 晚間回饋</p>
        <p className="text-sm leading-relaxed" style={{ color: '#8C7B72' }}>{EVENING_RESPONSES[selected]}</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl p-5 shadow-sm"
      style={{ backgroundColor: '#FFFEF9' }}
    >
      <p className="text-sm font-bold mb-1" style={{ color: '#3D3530' }}>🌙 今天有比早上好嗎？</p>
      <p className="text-xs mb-4" style={{ color: '#8C7B72' }}>讓我知道你今天的狀態</p>
      <div className="flex gap-2">
        {[
          { val: 'better', label: '😊 有好一點' },
          { val: 'little', label: '🌿 一點點' },
          { val: 'same', label: '😔 還是很累' },
        ].map(({ val, label }) => (
          <motion.button
            key={val}
            whileTap={{ scale: 0.94 }}
            onClick={() => handleSelect(val)}
            className="flex-1 rounded-2xl py-2 text-xs font-medium"
            style={{ backgroundColor: '#FAF8F5', color: '#3D3530' }}
          >
            {label}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

// ===================== PAGE: HOME =====================

function HomePage({
  records,
  onCheckIn,
  onGoToRecipe,
  dailyTasks,
  onTaskToggle,
  onTaskComplete,
}: {
  records: HealingRecord[];
  onCheckIn: (emotion: EmotionKey) => void;
  onGoToRecipe: () => void;
  dailyTasks: Record<TaskKey, boolean>;
  onTaskToggle: (key: TaskKey) => void;
  onTaskComplete: (key: TaskKey) => void;
}) {
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionKey | null>(null);
  const todayRecord = records.find(r => r.date === getToday());
  const streak = getStreak(records);
  const weekCheckins = getWeekCheckins(records);
  const stabilityStars = getStabilityStars(records);
  const dayIndex = getDayOfYear();
  const currentHour = new Date().getHours();
  const showEvening = currentHour >= 17 && !dailyTasks.evening;

  const handleSelect = (key: EmotionKey) => {
    setSelectedEmotion(key);
    onCheckIn(key);
  };

  return (
    <motion.div
      className="space-y-5"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* Header */}
      <motion.div variants={staggerItem} className="flex items-center justify-between">
        <div>
          <p className="text-xs tracking-widest" style={{ color: '#C9A96E' }}>即時共鳴</p>
          <p className="text-sm" style={{ color: '#8C7B72' }}>你的香氛療癒空間</p>
        </div>
        <p className="text-sm" style={{ color: '#8C7B72' }}>{getDisplayDate()}</p>
      </motion.div>

      {/* 🔥 BIG STREAK CARD */}
      <motion.div
        variants={staggerItem}
        className="rounded-3xl p-5 shadow-sm flex items-center gap-4"
        style={{ background: 'linear-gradient(135deg, #FFF8E7, #FAF8F5)' }}
      >
        <div className="text-center">
          <p className="text-5xl font-bold leading-none" style={{ color: '#C9A96E' }}>{streak}</p>
          <p className="text-xs mt-1" style={{ color: '#8C7B72' }}>連續天數</p>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1 mb-2">
            <span className="text-lg">🔥</span>
            <p className="text-sm font-bold" style={{ color: '#3D3530' }}>持續照顧自己</p>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#E8E3DC' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #C9A96E, #F0C878)' }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (streak / 30) * 100)}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <p className="text-xs" style={{ color: '#8C7B72' }}>本週 {weekCheckins}/7 天</p>
            <p className="text-xs" style={{ color: '#8FA886' }}>穩定 {renderStars(stabilityStars)}</p>
          </div>
        </div>
      </motion.div>

      {/* Daily Quote */}
      <motion.div
        variants={staggerItem}
        className="rounded-3xl p-5 shadow-sm"
        style={{ backgroundColor: '#FFFEF9' }}
      >
        <p className="text-sm leading-relaxed italic text-center" style={{ color: '#8C7B72' }}>
          「{DAILY_QUOTES[dayIndex % DAILY_QUOTES.length]}」
        </p>
      </motion.div>

      {/* Emotion Check-in */}
      <motion.div variants={staggerItem} className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
        <p className="text-base font-bold mb-4" style={{ color: '#3D3530' }}>
          今天，你感覺怎樣？
        </p>
        <EmotionPicker
          selected={selectedEmotion || todayRecord?.emotion || null}
          onSelect={handleSelect}
        />
        <AnimatePresence>
          {(selectedEmotion || todayRecord) && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              whileTap={{ scale: 0.96 }}
              onClick={onGoToRecipe}
              className="mt-4 w-full rounded-2xl py-3 text-white font-medium text-sm"
              style={{ backgroundColor: '#8FA886' }}
            >
              查看今日處方 →
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Today's Aroma quick view */}
      {todayRecord && (
        <motion.div variants={staggerItem} className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-base font-bold mb-2" style={{ color: '#3D3530' }}>🧴 今日香氛處方</p>
          <p className="text-sm mb-1" style={{ color: '#8C7B72' }}>
            {RECIPES[todayRecord.emotion].oils.map(o => o.name).join(' + ')}
          </p>
          <div className="flex gap-2 mt-3">
            <a
              href="https://xiabenhow.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-xl py-2 text-xs font-medium text-center border"
              style={{ borderColor: '#8FA886', color: '#8FA886' }}
            >
              🛍️ 購買精油
            </a>
            <a
              href="https://xiabenhow.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-xl py-2 text-xs font-medium text-center text-white"
              style={{ backgroundColor: '#8FA886' }}
            >
              🌿 預約體驗
            </a>
          </div>
        </motion.div>
      )}

      {/* Evening Feedback (only show after 17:00) */}
      {showEvening && (
        <motion.div variants={staggerItem}>
          <EveningFeedback onComplete={() => onTaskComplete('evening')} />
        </motion.div>
      )}

      {/* Daily Task List */}
      <motion.div variants={staggerItem}>
        <DailyTaskList tasks={dailyTasks} onToggle={onTaskToggle} />
      </motion.div>
    </motion.div>
  );
}

// ===================== PAGE: DIARY =====================

function DiaryPage({ records }: { records: HealingRecord[] }) {
  const [tab, setTab] = useState<'week' | 'month'>('week');

  const getLast7Days = (): string[] => {
    const days: string[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(formatDate(d));
    }
    return days;
  };

  const getWeekday = (dateStr: string): string => {
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    return '週' + days[new Date(dateStr).getDay()];
  };

  const last7 = getLast7Days();

  const weekRecords = last7.map(date => {
    const rec = records.find(r => r.date === date);
    return { date, record: rec || null };
  });

  const monthRecords = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    return records.filter(r => {
      const d = new Date(r.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }, [records]);

  const displayRecords = tab === 'week'
    ? weekRecords.filter(w => w.record).map(w => w.record!)
    : monthRecords;

  const mostFrequent = getMostFrequentEmotion(displayRecords);
  const mostFrequentInfo = mostFrequent ? getEmotionInfo(mostFrequent) : null;

  const EMOTION_Y: Record<EmotionKey, number> = {
    energized: 25, warm: 45, calm: 60, tired: 75, anxious: 90, low: 105,
  };

  const chartPoints = weekRecords.map((wr, i) => {
    const x = 30 + i * 40;
    const y = wr.record ? EMOTION_Y[wr.record.emotion] : 65;
    return { x, y, record: wr.record, date: wr.date };
  });

  const polylinePoints = chartPoints
    .filter(p => p.record)
    .map(p => `${p.x},${p.y}`)
    .join(' ');

  return (
    <motion.div className="space-y-5" {...fadeInUp}>
      <div className="flex gap-2">
        {(['week', 'month'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === t ? 'text-white' : ''}`}
            style={tab === t ? { backgroundColor: '#8FA886' } : { backgroundColor: '#FFFEF9', color: '#8C7B72' }}
          >
            {t === 'week' ? '本週' : '本月'}
          </button>
        ))}
      </div>
      {tab === 'week' && (
        <motion.div className="rounded-3xl p-4 shadow-sm" style={{ backgroundColor: '#FFFEF9' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <svg viewBox="0 0 310 140" className="w-full h-auto">
            {polylinePoints && (
              <polyline points={polylinePoints} fill="none" stroke="#C9A96E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
            )}
            {chartPoints.map((pt, i) => (
              <g key={i}>
                {pt.record ? (
                  <>
                    <circle cx={pt.x} cy={pt.y} r="8" fill={getEmotionInfo(pt.record.emotion).color} opacity="0.8" />
                    <text x={pt.x} y={pt.y + 22} textAnchor="middle" fontSize="12">{getEmotionInfo(pt.record.emotion).emoji}</text>
                  </>
                ) : (
                  <circle cx={pt.x} cy={pt.y} r="4" fill="#E0DDD8" opacity="0.5" />
                )}
                <text x={pt.x} y={135} textAnchor="middle" fontSize="9" fill="#8C7B72">{getWeekday(pt.date).slice(1)}</text>
              </g>
            ))}
          </svg>
        </motion.div>
      )}
      {mostFrequentInfo && (
        <motion.div className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }} variants={staggerItem}>
          <p className="text-sm leading-relaxed" style={{ color: '#3D3530' }}>
            {tab === 'week' ? '這週' : '這個月'}你最常感到{' '}
            <span className="font-bold">{mostFrequentInfo.emoji} {mostFrequentInfo.label}</span>
          </p>
          <p className="text-sm mt-2 leading-relaxed" style={{ color: '#8C7B72' }}>{RECIPES[mostFrequent!].message}</p>
          <p className="text-sm mt-2 font-medium" style={{ color: '#8FA886' }}>推薦使用：{RECIPES[mostFrequent!].oils.map(o => o.name).join(' + ')}</p>
        </motion.div>
      )}
      <div className="space-y-3">
        {displayRecords.length === 0 && (
          <div className="rounded-3xl p-6 text-center shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
            <p className="text-sm" style={{ color: '#8C7B72' }}>還沒有記錄，去首頁打卡吧 🌱</p>
          </div>
        )}
        {[...displayRecords].reverse().map((rec, i) => {
          const emo = getEmotionInfo(rec.emotion);
          return (
            <motion.div key={rec.date + i} className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#FFFEF9' }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{emo.emoji}</span>
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#3D3530' }}>{rec.date.slice(5)} {getWeekday(rec.date)}</p>
                    <p className="text-xs" style={{ color: '#8C7B72' }}>{emo.label}</p>
                  </div>
                </div>
                <p className="text-xs" style={{ color: '#8C7B72' }}>{RECIPES[rec.emotion].oils[0].name}</p>
              </div>
              {rec.note && <p className="text-xs mt-2 pl-8" style={{ color: '#8C7B72' }}>{rec.note}</p>}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ===================== PAGE: SOUND =====================

// ===================== WEB AUDIO GENERATOR =====================

class SoundGenerator {
  private ctx: AudioContext | null = null;
  private nodes: Map<string, { bufferSource: AudioBufferSourceNode; gain: GainNode }> = new Map();

  getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private createNoiseBuffer(generator: (data: Float32Array, sampleRate: number) => void, seconds: number = 4, channels: number = 1): { source: AudioBufferSourceNode; output: AudioNode } {
    const ctx = this.getContext();
    const bufferSize = seconds * ctx.sampleRate;
    const buffer = ctx.createBuffer(channels, bufferSize, ctx.sampleRate);
    for (let ch = 0; ch < channels; ch++) {
      generator(buffer.getChannelData(ch), ctx.sampleRate);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return { source, output: source };
  }

  createWhiteNoise() {
    return this.createNoiseBuffer((data) => {
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }, 2);
  }

  createBrownNoise() {
    return this.createNoiseBuffer((data) => {
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const w = Math.random() * 2 - 1;
        data[i] = (last + 0.02 * w) / 1.02;
        last = data[i];
        data[i] *= 3.5;
      }
    }, 2);
  }

  createPinkNoise() {
    return this.createNoiseBuffer((data) => {
      let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
      for (let i = 0; i < data.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886*b0 + w*0.0555179;
        b1 = 0.99332*b1 + w*0.0750759;
        b2 = 0.96900*b2 + w*0.1538520;
        b3 = 0.86650*b3 + w*0.3104856;
        b4 = 0.55000*b4 + w*0.5329522;
        b5 = -0.7616*b5 - w*0.0168980;
        data[i] = (b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11;
        b6 = w * 0.115926;
      }
    }, 2);
  }

  createRain() {
    const { source } = this.createNoiseBuffer((data) => {
      for (let i = 0; i < data.length; i++) {
        const base = Math.random() * 2 - 1;
        const droplet = Math.random() > 0.997 ? Math.random() * 0.5 : 0;
        data[i] = base * 0.3 + droplet;
      }
    }, 4, 2);
    const ctx = this.getContext();
    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass'; bpf.frequency.value = 8000; bpf.Q.value = 0.5;
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass'; lpf.frequency.value = 12000;
    source.connect(bpf); bpf.connect(lpf);
    return { source, output: lpf };
  }

  createOcean() {
    const { source } = this.createNoiseBuffer((data, sr) => {
      for (let i = 0; i < data.length; i++) {
        const t = i / sr;
        const wave = Math.sin(t*Math.PI*2/8)*0.5+0.5;
        const wave2 = Math.sin(t*Math.PI*2/13+1)*0.3+0.5;
        data[i] = (Math.random()*2-1)*(wave*0.6+wave2*0.4)*0.5;
      }
    }, 8, 2);
    const ctx = this.getContext();
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass'; lpf.frequency.value = 2000;
    source.connect(lpf);
    return { source, output: lpf };
  }

  createForest() {
    const { source } = this.createNoiseBuffer((data, sr) => {
      for (let i = 0; i < data.length; i++) {
        const t = i / sr;
        const wind = (Math.random()*2-1)*0.08*(Math.sin(t*0.3)*0.5+0.5);
        const rustle = (Math.random()*2-1)*0.03*(Math.sin(t*1.2)*0.5+0.5);
        data[i] = wind + rustle;
        if (Math.random() > 0.9997) {
          const freq = 2000+Math.random()*4000;
          const dur = Math.floor((0.05+Math.random()*0.1)*sr);
          for (let j = 0; j < dur && (i+j) < data.length; j++) {
            data[i+j] += Math.sin(2*Math.PI*freq*j/sr)*Math.sin(Math.PI*j/dur)*0.15;
          }
        }
      }
    }, 10, 2);
    const ctx = this.getContext();
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass'; hpf.frequency.value = 200;
    source.connect(hpf);
    return { source, output: hpf };
  }

  createFireplace() {
    const { source } = this.createNoiseBuffer((data, sr) => {
      for (let i = 0; i < data.length; i++) {
        const t = i / sr;
        const rumble = (Math.random()*2-1)*0.1*(Math.sin(t*0.5)*0.3+0.7);
        const crackle = Math.random() > 0.995 ? (Math.random()-0.5)*0.8 : 0;
        const pop = Math.random() > 0.9998 ? (Math.random()-0.5)*1.2 : 0;
        data[i] = rumble + crackle*0.4 + pop*0.3;
      }
    }, 6, 2);
    const ctx = this.getContext();
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass'; lpf.frequency.value = 4000;
    source.connect(lpf);
    return { source, output: lpf };
  }

  createStream() {
    const { source } = this.createNoiseBuffer((data, sr) => {
      for (let i = 0; i < data.length; i++) {
        const t = i / sr;
        const flow = (Math.random()*2-1)*0.2;
        const bubble = Math.random() > 0.998 ? Math.sin(2*Math.PI*(800+Math.random()*2000)*t)*0.15*Math.exp(-((i%1000)/200)) : 0;
        data[i] = (flow + bubble) * (Math.sin(t*0.7)*0.3+0.7);
      }
    }, 6, 2);
    const ctx = this.getContext();
    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass'; bpf.frequency.value = 3000; bpf.Q.value = 0.3;
    source.connect(bpf);
    return { source, output: bpf };
  }

  play(key: string, type: string, volume: number): void {
    this.stop(key);
    const ctx = this.getContext();
    let result: { source: AudioBufferSourceNode; output: AudioNode };
    switch (type) {
      case 'white': result = this.createWhiteNoise(); break;
      case 'brown': result = this.createBrownNoise(); break;
      case 'pink': result = this.createPinkNoise(); break;
      case 'rain': result = this.createRain(); break;
      case 'ocean': result = this.createOcean(); break;
      case 'forest': result = this.createForest(); break;
      case 'fireplace': result = this.createFireplace(); break;
      case 'stream': result = this.createStream(); break;
      default: result = this.createWhiteNoise();
    }
    const gain = ctx.createGain();
    gain.gain.value = volume;
    result.output.connect(gain);
    gain.connect(ctx.destination);
    result.source.start(0);
    this.nodes.set(key, { bufferSource: result.source, gain });
  }

  stop(key: string): void {
    const node = this.nodes.get(key);
    if (node) {
      try { node.bufferSource.stop(); } catch {}
      try { node.gain.disconnect(); } catch {}
      this.nodes.delete(key);
    }
  }

  setVolume(key: string, vol: number): void {
    const node = this.nodes.get(key);
    if (node) node.gain.gain.setValueAtTime(vol, this.getContext().currentTime);
  }

  stopAll(): void {
    this.nodes.forEach((_, key) => this.stop(key));
  }
}

const soundGen = new SoundGenerator();

interface SoundItem {
  key: string;
  type: string;
  emoji: string;
  label: string;
  desc: string;
  color: string;
}

const SOUND_LIST: SoundItem[] = [
  { key: 'white', type: 'white', emoji: '⚪', label: '白噪音', desc: '純淨的聲音毯子，覆蓋所有雜音', color: '#F5F5F5' },
  { key: 'brown', type: 'brown', emoji: '🟤', label: '棕噪音', desc: '深沉低頻，像雷聲遠處滾動', color: '#F0E6D8' },
  { key: 'pink', type: 'pink', emoji: '🩷', label: '粉紅噪音', desc: '延長深度睡眠的柔和頻率', color: '#FDE8E8' },
  { key: 'rain', type: 'rain', emoji: '🌧️', label: '細雨聲', desc: '讓紛亂的思緒隨雨滴慢慢沉澱', color: '#E8EFF5' },
  { key: 'ocean', type: 'ocean', emoji: '🌊', label: '海浪聲', desc: '像被大海的節奏溫柔地搖著', color: '#E3F0F8' },
  { key: 'forest', type: 'forest', emoji: '🌲', label: '森林鳥鳴', desc: '回到最原始的寧靜', color: '#E8F5E8' },
  { key: 'fireplace', type: 'fireplace', emoji: '🔥', label: '壁爐柴火', desc: '溫暖的火光陪你度過安靜的夜晚', color: '#FFF0E0' },
  { key: 'stream', type: 'stream', emoji: '💧', label: '溪流聲', desc: '讓心跟著水流慢慢放鬆', color: '#E0F5F5' },
];

function SoundPage() {
  const [playing, setPlaying] = useState<Record<string, boolean>>({});
  const [volumes, setVolumes] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    SOUND_LIST.forEach(s => { init[s.key] = 0.5; });
    return init;
  });
  const [timer, setTimer] = useState<number>(0);
  const [timerLeft, setTimerLeft] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeCount = Object.values(playing).filter(Boolean).length;

  useEffect(() => {
    if (timer > 0) {
      setTimerLeft(timer * 60);
      timerRef.current = setInterval(() => {
        setTimerLeft(prev => {
          if (prev <= 1) {
            soundGen.stopAll();
            setPlaying({});
            setTimer(0);
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimerLeft(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timer]);

  useEffect(() => {
    return () => { soundGen.stopAll(); };
  }, []);

  const toggleSound = (item: SoundItem) => {
    if (playing[item.key]) {
      soundGen.stop(item.key);
      setPlaying(prev => ({ ...prev, [item.key]: false }));
    } else {
      soundGen.play(item.key, item.type, volumes[item.key]);
      setPlaying(prev => ({ ...prev, [item.key]: true }));
    }
  };

  const handleVolume = (key: string, vol: number) => {
    setVolumes(prev => ({ ...prev, [key]: vol }));
    if (playing[key]) soundGen.setVolume(key, vol);
  };

  const stopAll = () => {
    soundGen.stopAll();
    setPlaying({});
    setTimer(0);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div className="space-y-5" {...fadeInUp}>
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>🎵 療癒音景</h2>
        <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>
          可以同時播放多個音景，混合出你最舒服的聲音
        </p>
      </div>

      {/* Active indicator & controls */}
      {activeCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-4"
          style={{ backgroundColor: '#F0EDE8', border: '1px solid #E0DCD5' }}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium" style={{ color: '#3D3530' }}>
                🎧 正在播放 {activeCount} 個音景
              </p>
              {timerLeft > 0 && (
                <p className="text-xs mt-1" style={{ color: '#8FA886' }}>
                  ⏱️ 剩餘 {formatTime(timerLeft)}
                </p>
              )}
            </div>
            <button
              onClick={stopAll}
              className="px-3 py-1.5 rounded-full text-xs font-medium"
              style={{ backgroundColor: '#E8D5D0', color: '#8B5E3C' }}
            >
              全部停止
            </button>
          </div>

          {/* Timer buttons */}
          <div className="flex gap-2">
            <p className="text-xs self-center" style={{ color: '#8C7B72' }}>計時：</p>
            {[15, 30, 60, 0].map(m => (
              <button
                key={m}
                onClick={() => setTimer(m)}
                className="px-2.5 py-1 rounded-full text-xs"
                style={{
                  backgroundColor: timer === m ? '#8FA886' : '#FFFEF9',
                  color: timer === m ? '#fff' : '#8C7B72',
                  border: `1px solid ${timer === m ? '#8FA886' : '#E0DCD5'}`
                }}
              >
                {m === 0 ? '不限' : `${m}分`}
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Sound cards grid */}
      <div className="grid grid-cols-2 gap-3">
        {SOUND_LIST.map(item => {
          const isActive = !!playing[item.key];
          return (
            <motion.div
              key={item.key}
              whileTap={{ scale: 0.97 }}
              className="rounded-2xl p-4 cursor-pointer transition-all"
              style={{
                backgroundColor: isActive ? item.color : '#FFFEF9',
                border: isActive ? '2px solid #8FA886' : '1px solid #F0EDE8',
                boxShadow: isActive ? '0 4px 12px rgba(143,168,134,0.2)' : 'none'
              }}
              onClick={() => toggleSound(item)}
            >
              <div className="text-2xl mb-2">{item.emoji}</div>
              <p className="text-sm font-medium" style={{ color: '#3D3530' }}>{item.label}</p>
              <p className="text-xs mt-1" style={{ color: '#8C7B72' }}>{item.desc}</p>

              {isActive && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-3"
                  onClick={e => e.stopPropagation()}
                >
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volumes[item.key]}
                    onChange={e => handleVolume(item.key, parseFloat(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ accentColor: '#8FA886' }}
                  />
                  <div className="flex justify-between mt-1">
                    <span className="text-xs" style={{ color: '#8C7B72' }}>🔈</span>
                    <span className="text-xs" style={{ color: '#8C7B72' }}>🔊</span>
                  </div>
                </motion.div>
              )}

              {isActive && (
                <motion.div
                  className="mt-2 flex justify-center"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#8FA886' }} />
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Tips */}
      <div className="rounded-2xl p-4" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
        <p className="text-sm font-medium mb-2" style={{ color: '#3D3530' }}>💡 混音小秘訣</p>
        <div className="space-y-1">
          <p className="text-xs" style={{ color: '#8C7B72' }}>· 雨聲 + 壁爐 = 溫暖雨夜</p>
          <p className="text-xs" style={{ color: '#8C7B72' }}>· 海浪 + 粉紅噪音 = 深度睡眠</p>
          <p className="text-xs" style={{ color: '#8C7B72' }}>· 森林 + 溪流 = 大自然散步</p>
          <p className="text-xs" style={{ color: '#8C7B72' }}>· 棕噪音 + 白噪音 = 完美專注</p>
        </div>
      </div>
    </motion.div>
  );
}

// ===================== PAGE: SHOP (COMMERCE) =====================

function ShopPage() {
  const [view, setView] = useState<'menu' | 'products' | 'detail' | 'cart' | 'checkout'>('menu');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<WCProduct | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number>(130);

  const addToCart = (item: CartItem) => {
    const existingItem = cart.find(c => c.id === item.id);
    if (existingItem) {
      setCart(cart.map(c => c.id === item.id ? { ...c, quantity: c.quantity + item.quantity } : c));
    } else {
      setCart([...cart, item]);
    }
    setView('menu');
  };

  const removeFromCart = (itemId: string) => {
    setCart(cart.filter(c => c.id !== itemId));
  };

  const updateCartQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
    } else {
      setCart(cart.map(c => c.id === itemId ? { ...c, quantity } : c));
    }
  };

  const handleSelectProduct = (product: WCProduct) => {
    console.log('選擇商品:', product.name);
    setSelectedProduct(product);
    setView('detail');
  };

  const handleBackFromDetail = () => {
    setSelectedProduct(null);
    setView('products');
  };

  return (
    <motion.div className="space-y-5" {...fadeInUp}>
      {view === 'menu' && <ShopMenuView onNavigate={() => { setView('products'); setSelectedCategoryId(130); }} cartCount={cart.length} />}
      {view === 'products' && <ShopProductsView categoryId={selectedCategoryId} onSelectCategory={setSelectedCategoryId} onSelectProduct={handleSelectProduct} onNavigateCart={() => setView('cart')} onBack={() => setView('menu')} cartCount={cart.length} />}
      {view === 'detail' && selectedProduct && <ProductDetailView product={selectedProduct} onBack={handleBackFromDetail} onAddToCart={addToCart} />}
      {view === 'cart' && <CartView cart={cart} onUpdateQuantity={updateCartQuantity} onRemove={removeFromCart} onCheckout={() => setView('checkout')} onBack={() => setView('products')} />}
      {view === 'checkout' && <CheckoutView cart={cart} onBack={() => setView('cart')} />}
    </motion.div>
  );
}

function ShopMenuView({ onNavigate, cartCount }: { onNavigate: () => void; cartCount: number }) {
  return (
    <motion.div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>🛍️ 商城</h2>
          <p className="text-sm mt-0.5" style={{ color: '#8C7B72' }}>探索精油體驗與手作商品</p>
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onNavigate}
          className="relative px-4 py-2 rounded-xl text-2xl"
          style={{ backgroundColor: '#FAF8F5' }}
        >
          🛒
          {cartCount > 0 && (
            <span className="absolute top-0 right-0 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center" style={{ backgroundColor: '#8FA886', color: '#fff' }}>
              {cartCount}
            </span>
          )}
        </motion.button>
      </div>

      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileTap={{ scale: 0.96 }}
        onClick={onNavigate}
        className="w-full rounded-2xl p-5 text-left transition-all"
        style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
      >
        <div className="flex items-center gap-4">
          <div className="text-4xl">🏪</div>
          <div className="flex-1">
            <h3 className="font-bold" style={{ color: '#3D3530' }}>進入商城</h3>
            <p className="text-sm" style={{ color: '#8C7B72' }}>瀏覽所有商品</p>
          </div>
          <div className="text-xl">→</div>
        </div>
      </motion.button>
    </motion.div>
  );
}

function ShopProductsView({
  categoryId,
  onSelectCategory,
  onSelectProduct,
  onNavigateCart,
  onBack,
  cartCount,
}: {
  categoryId: number;
  onSelectCategory: (id: number) => void;
  onSelectProduct: (product: WCProduct) => void;
  onNavigateCart: () => void;
  onBack: () => void;
  cartCount: number;
}) {
  const [products, setProducts] = useState<WCProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const categoryScrollRef = useRef<HTMLDivElement>(null);

  const MAIN_CATEGORIES = [
    { id: 130, name: '全部' },
    { id: 21, name: '手作飾品' },
    { id: 22, name: '多肉植栽' },
    { id: 24, name: '畫畫課程' },
    { id: 25, name: '花藝課程' },
    { id: 18, name: '蠟燭課程' },
    { id: 173, name: '精油調香' },
    { id: 212, name: '皮革課程' },
    { id: 75, name: 'DIY材料包' },
    { id: 27, name: '把我帶回家' },
  ];

  useEffect(() => {
    const fetchProducts = async () => {
      console.log(`載入分類 ${categoryId} 的商品...`);
      setLoading(true);
      setError(null);
      try {
        const url = categoryId === 130
          ? `${API_BASE}/wc/products?featured=true`
          : `${API_BASE}/wc/products?category=${categoryId}`;

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('載入商品失敗');
        }
        const data = await response.json();
        console.log(`成功載入 ${data?.length || 0} 件商品`);
        setProducts(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('載入商品錯誤:', err);
        setError('無法載入商品，請重試');
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [categoryId]);

  return (
    <motion.div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <motion.button whileTap={{ scale: 0.9 }} onClick={onBack} className="text-xl">←</motion.button>
          <div>
            <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>🛍️ 商城</h2>
            <p className="text-xs" style={{ color: '#8C7B72' }}>探索精油體驗與手作商品</p>
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onNavigateCart}
          className="relative px-4 py-2 rounded-xl text-2xl"
          style={{ backgroundColor: '#FAF8F5' }}
        >
          🛒
          {cartCount > 0 && (
            <span className="absolute top-0 right-0 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center" style={{ backgroundColor: '#8FA886', color: '#fff' }}>
              {cartCount}
            </span>
          )}
        </motion.button>
      </div>

      {/* Category Tabs - Horizontal Scrollable */}
      <div
        ref={categoryScrollRef}
        className="flex gap-2 overflow-x-auto pb-2"
        style={{ scrollBehavior: 'smooth' }}
      >
        {MAIN_CATEGORIES.map(cat => (
          <motion.button
            key={cat.id}
            whileTap={{ scale: 0.95 }}
            onClick={() => onSelectCategory(cat.id)}
            className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap"
            style={{
              backgroundColor: categoryId === cat.id ? '#8FA886' : '#FAF8F5',
              color: categoryId === cat.id ? '#fff' : '#3D3530',
              border: categoryId === cat.id ? '2px solid #8FA886' : '1px solid #F0EDE8',
            }}
          >
            {cat.name}
          </motion.button>
        ))}
      </div>

      {/* Loading State */}
      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl p-8 text-center"
          style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
        >
          <p style={{ color: '#8C7B72' }}>載入中...</p>
        </motion.div>
      )}

      {/* Error State */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl p-4 text-center"
          style={{ backgroundColor: '#FFE8E8', border: '1px solid #F0D0D0' }}
        >
          <p style={{ color: '#A85050' }}>{error}</p>
        </motion.div>
      )}

      {/* Products Grid */}
      {!loading && !error && products.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl p-8 text-center"
          style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
        >
          <p style={{ color: '#8C7B72' }}>此分類暫無商品</p>
        </motion.div>
      )}

      {!loading && !error && products.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {products.map((product, idx) => (
            <motion.button
              key={product.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSelectProduct(product)}
              className="rounded-2xl overflow-hidden transition-all text-left"
              style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
            >
              {/* Product Image */}
              <div
                className="w-full aspect-square bg-gradient-to-br from-orange-100 to-pink-50 flex items-center justify-center overflow-hidden"
              >
                {product.images && product.images.length > 0 && product.images[0].src ? (
                  <img
                    src={product.images[0].src}
                    alt={product.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div style={{ color: '#F0A878' }} className="text-4xl">📦</div>
                )}
              </div>

              {/* Product Info */}
              <div className="p-3">
                <p
                  className="text-xs font-bold line-clamp-2"
                  style={{ color: '#3D3530' }}
                >
                  {product.name}
                </p>
                <p
                  className="text-sm font-bold mt-1"
                  style={{ color: '#8FA886' }}
                >
                  NT${parseFloat(product.price).toLocaleString('zh-TW', { maximumFractionDigits: 0 })}
                </p>
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function ProductDetailView({ product, onBack, onAddToCart }: { product: WCProduct; onBack: () => void; onAddToCart: (item: CartItem) => void }) {
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const [quantity, setQuantity] = useState(1);

  const cleanHtml = (html: string) => {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').trim();
  };

  const handleAddToCart = () => {
    console.log(`加入購物車: ${product.name}`);
    const item: CartItem = {
      id: `product-${product.id}-${quantity}`,
      productId: product.id,
      name: product.name,
      specs: `數量: ${quantity}`,
      price: Math.round(parseFloat(product.price)),
      quantity,
      isVirtual: false,
      image: product.images && product.images.length > 0 ? product.images[0].src : undefined,
    };
    onAddToCart(item);
  };

  const images = product.images && product.images.length > 0 ? product.images : [];

  return (
    <motion.div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <motion.button whileTap={{ scale: 0.9 }} onClick={onBack} className="text-xl">←</motion.button>
        <h2 className="text-lg font-bold" style={{ color: '#3D3530' }}>商品詳情</h2>
      </div>

      {/* Image Carousel */}
      <motion.div
        className="rounded-2xl overflow-hidden relative"
        style={{ backgroundColor: '#FAF8F5', paddingBottom: '100%' }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-orange-100 to-pink-50 flex items-center justify-center">
          {images.length > 0 && images[currentImageIdx]?.src ? (
            <img
              src={images[currentImageIdx].src}
              alt={product.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div style={{ color: '#F0A878' }} className="text-6xl">📦</div>
          )}
        </div>

        {/* Image Navigation */}
        {images.length > 1 && (
          <>
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={() => setCurrentImageIdx(Math.max(0, currentImageIdx - 1))}
              className="absolute left-2 top-1/2 transform -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-sm"
              style={{ backgroundColor: 'rgba(0,0,0,0.3)', color: '#fff' }}
            >
              ←
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={() => setCurrentImageIdx(Math.min(images.length - 1, currentImageIdx + 1))}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-sm"
              style={{ backgroundColor: 'rgba(0,0,0,0.3)', color: '#fff' }}
            >
              →
            </motion.button>
            <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff' }}>
              {currentImageIdx + 1} / {images.length}
            </div>
          </>
        )}
      </motion.div>

      {/* Product Info */}
      <motion.div className="rounded-2xl p-4" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
        <h3 className="text-lg font-bold mb-2" style={{ color: '#3D3530' }}>
          {product.name}
        </h3>
        <p className="text-2xl font-bold mb-3" style={{ color: '#8FA886' }}>
          NT${parseFloat(product.price).toLocaleString('zh-TW', { maximumFractionDigits: 0 })}
        </p>
        {product.short_description && (
          <p className="text-sm" style={{ color: '#8C7B72' }}>
            {cleanHtml(product.short_description)}
          </p>
        )}
      </motion.div>

      {/* Description */}
      {product.description && (
        <motion.div className="rounded-2xl p-4" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
          <p className="text-sm" style={{ color: '#8C7B72' }}>
            {cleanHtml(product.description).substring(0, 200)}...
          </p>
        </motion.div>
      )}

      {/* Quantity Selection */}
      <motion.div className="rounded-2xl p-4" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
        <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>📦 數量</p>
        <div className="flex items-center justify-center gap-4">
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: '#FAF8F5', color: '#3D3530', border: '1px solid #F0EDE8' }}
          >
            −
          </motion.button>
          <span className="text-lg font-bold" style={{ color: '#3D3530' }}>
            {quantity}
          </span>
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={() => setQuantity(quantity + 1)}
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: '#FAF8F5', color: '#3D3530', border: '1px solid #F0EDE8' }}
          >
            +
          </motion.button>
        </div>
      </motion.div>

      {/* Add to Cart Button */}
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={handleAddToCart}
        className="w-full py-3 rounded-xl font-bold text-white transition-all"
        style={{ backgroundColor: '#8FA886' }}
      >
        加入購物車
      </motion.button>
    </motion.div>
  );
}


function CartView({ cart, onUpdateQuantity, onRemove, onCheckout, onBack }: { cart: CartItem[]; onUpdateQuantity: (id: string, qty: number) => void; onRemove: (id: string) => void; onCheckout: () => void; onBack: () => void }) {
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <motion.div className="space-y-5">
      <div className="flex items-center gap-3">
        <motion.button whileTap={{ scale: 0.9 }} onClick={onBack} className="text-xl">←</motion.button>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>🛒 購物車</h2>
      </div>

      {cart.length === 0 ? (
        <motion.div className="rounded-2xl p-8 text-center" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
          <p className="text-lg" style={{ color: '#8C7B72' }}>購物車是空的</p>
          <p className="text-sm mt-2" style={{ color: '#8FA886' }}>開始購物吧 →</p>
        </motion.div>
      ) : (
        <>
          <div className="space-y-3">
            {cart.map(item => (
              <motion.div key={item.id} className="rounded-2xl p-4" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-bold text-sm" style={{ color: '#3D3530' }}>{item.name}</p>
                      <p className="text-xs mt-1" style={{ color: '#8C7B72' }}>{item.specs}</p>
                    </div>
                    <motion.button whileTap={{ scale: 0.8 }} onClick={() => onRemove(item.id)} className="text-lg">🗑️</motion.button>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: '#F0EDE8' }}>
                    <p className="font-bold" style={{ color: '#8FA886' }}>NT${(item.price * item.quantity).toLocaleString()}</p>
                    <div className="flex items-center gap-2">
                      <motion.button whileTap={{ scale: 0.85 }} onClick={() => onUpdateQuantity(item.id, item.quantity - 1)} className="w-7 h-7 rounded text-xs flex items-center justify-center" style={{ backgroundColor: '#FAF8F5', color: '#3D3530' }}>−</motion.button>
                      <span className="w-6 text-center text-sm" style={{ color: '#3D3530' }}>{item.quantity}</span>
                      <motion.button whileTap={{ scale: 0.85 }} onClick={() => onUpdateQuantity(item.id, item.quantity + 1)} className="w-7 h-7 rounded text-xs flex items-center justify-center" style={{ backgroundColor: '#FAF8F5', color: '#3D3530' }}>+</motion.button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div className="rounded-2xl p-5 text-center" style={{ backgroundColor: '#FAF8F5' }}>
            <p className="text-sm mb-2" style={{ color: '#8C7B72' }}>訂單小計</p>
            <p className="text-2xl font-bold" style={{ color: '#8FA886' }}>NT${total.toLocaleString()}</p>
          </motion.div>

          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onCheckout}
            className="w-full py-3 rounded-xl font-bold text-white transition-all"
            style={{ backgroundColor: '#8FA886' }}
          >
            前往結帳
          </motion.button>
        </>
      )}
    </motion.div>
  );
}

function CheckoutView({ cart, onBack }: { cart: CartItem[]; onBack: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [shippingMethod, setShippingMethod] = useState('7-eleven');
  const [paymentMethod, setPaymentMethod] = useState('credit');
  const [invoiceType, setInvoiceType] = useState('personal');

  const hasPhysical = cart.some(item => !item.isVirtual);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleCheckout = async () => {
    console.log('開始結帳流程...');
    if (!name || !phone || !email) {
      alert('請填寫必填欄位');
      return;
    }
    if (hasPhysical && !address) {
      alert('請填寫配送地址');
      return;
    }

    try {
      // 步驟1: 建立WooCommerce訂單
      console.log('建立WooCommerce訂單...');
      const orderData = {
        billing: {
          first_name: name,
          email,
          phone,
        },
        shipping: hasPhysical ? {
          first_name: name,
          address_1: address,
          city,
        } : undefined,
        line_items: cart.map(item => ({
          product_id: item.productId,
          quantity: item.quantity,
          variation_id: item.variationId,
        })),
        payment_method: paymentMethod === 'credit' ? 'credit_card' : paymentMethod === 'bank' ? 'bank_transfer' : paymentMethod === 'convenience' ? 'convenience_store' : 'line_pay',
        set_paid: false,
      };

      const orderResponse = await fetch(`${API_BASE}/wc/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });

      if (!orderResponse.ok) {
        throw new Error('建立訂單失敗');
      }

      const order = await orderResponse.json();
      const orderId = order.id;
      console.log('訂單已建立, ID:', orderId);

      // 步驟2: 根據付款方式導向
      if (paymentMethod === 'credit' || paymentMethod === 'bank' || paymentMethod === 'convenience') {
        // ECPay付款
        console.log('導向ECPay付款...');
        const ecpayWindow = window.open(
          `${API_BASE}/ecpay/create?order_id=${orderId}`,
          '付款',
          'width=800,height=600'
        );
        if (!ecpayWindow) {
          alert('無法開啟付款視窗，請檢查瀏覽器設定');
        }
      } else if (paymentMethod === 'line') {
        // LINE Pay付款
        console.log('導向LINE Pay付款...');
        const linePayResponse = await fetch(`${API_BASE}/linepay/request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: orderId, amount: total }),
        });

        if (!linePayResponse.ok) {
          throw new Error('LINE Pay請求失敗');
        }

        const linePayData = await linePayResponse.json();
        if (linePayData.info?.paymentUrl?.web) {
          const linePayWindow = window.open(linePayData.info.paymentUrl.web, '付款', 'width=800,height=600');
          if (!linePayWindow) {
            alert('無法開啟付款視窗，請檢查瀏覽器設定');
          }
        } else {
          throw new Error('無法取得LINE Pay付款網址');
        }
      }

      alert(`訂單已建立\n訂單編號: ${orderId}\n金額: NT$${total.toLocaleString()}`);
    } catch (error) {
      console.error('結帳錯誤:', error);
      alert('結帳失敗，請重試: ' + (error instanceof Error ? error.message : '未知錯誤'));
    }
  };

  return (
    <motion.div className="space-y-5">
      <div className="flex items-center gap-3">
        <motion.button whileTap={{ scale: 0.9 }} onClick={onBack} className="text-xl">←</motion.button>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>💳 結帳</h2>
      </div>

      {/* Customer Info */}
      <motion.div className="rounded-2xl p-5 space-y-3" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
        <p className="text-sm font-bold" style={{ color: '#3D3530' }}>📝 基本資訊</p>
        <div>
          <label className="text-xs" style={{ color: '#8C7B72' }}>姓名 *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="請輸入姓名" className="w-full mt-1 p-2.5 rounded-lg text-sm" style={{ backgroundColor: '#FAF8F5', border: '1px solid #F0EDE8', color: '#3D3530' }} />
        </div>
        <div>
          <label className="text-xs" style={{ color: '#8C7B72' }}>聯絡電話 *</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="請輸入電話" className="w-full mt-1 p-2.5 rounded-lg text-sm" style={{ backgroundColor: '#FAF8F5', border: '1px solid #F0EDE8', color: '#3D3530' }} />
        </div>
        <div>
          <label className="text-xs" style={{ color: '#8C7B72' }}>電子郵件 *</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="請輸入電子郵件" className="w-full mt-1 p-2.5 rounded-lg text-sm" style={{ backgroundColor: '#FAF8F5', border: '1px solid #F0EDE8', color: '#3D3530' }} />
        </div>
      </motion.div>

      {/* Shipping Info (if physical items) */}
      {hasPhysical && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl p-5 space-y-3" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>🚚 配送資訊</p>
          <div>
            <label className="text-xs" style={{ color: '#8C7B72' }}>運送方式</label>
            <div className="space-y-2 mt-2">
              {[
                { id: '7-eleven', label: '7-ELEVEN 超商取貨' },
                { id: 'family', label: '全家便利店 超商取貨' },
                { id: 'delivery', label: '中華郵政 宅配' },
              ].map(method => (
                <label key={method.id} className="flex items-center gap-2 p-2 rounded-lg cursor-pointer" style={{ backgroundColor: shippingMethod === method.id ? '#E8F0E8' : '#FAF8F5' }}>
                  <input type="radio" name="shipping" checked={shippingMethod === method.id} onChange={() => setShippingMethod(method.id)} />
                  <span className="text-sm" style={{ color: '#3D3530' }}>{method.label}</span>
                </label>
              ))}
            </div>
          </div>
          {shippingMethod === 'delivery' && (
            <>
              <div>
                <label className="text-xs" style={{ color: '#8C7B72' }}>街道地址 *</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="請輸入街道地址" className="w-full mt-1 p-2.5 rounded-lg text-sm" style={{ backgroundColor: '#FAF8F5', border: '1px solid #F0EDE8', color: '#3D3530' }} />
              </div>
              <div>
                <label className="text-xs" style={{ color: '#8C7B72' }}>鄉鎮市 *</label>
                <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="請輸入鄉鎮市" className="w-full mt-1 p-2.5 rounded-lg text-sm" style={{ backgroundColor: '#FAF8F5', border: '1px solid #F0EDE8', color: '#3D3530' }} />
              </div>
            </>
          )}
        </motion.div>
      )}

      {/* Invoice */}
      <motion.div className="rounded-2xl p-5 space-y-3" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
        <p className="text-sm font-bold" style={{ color: '#3D3530' }}>📋 發票資訊（選填）</p>
        <div>
          <label className="text-xs" style={{ color: '#8C7B72' }}>發票類型</label>
          <div className="space-y-2 mt-2">
            {[
              { id: 'personal', label: '個人' },
              { id: 'donate', label: '捐贈' },
              { id: 'company', label: '公司' },
            ].map(type => (
              <label key={type.id} className="flex items-center gap-2 p-2 rounded-lg cursor-pointer" style={{ backgroundColor: invoiceType === type.id ? '#E8F0E8' : '#FAF8F5' }}>
                <input type="radio" name="invoice" checked={invoiceType === type.id} onChange={() => setInvoiceType(type.id)} />
                <span className="text-sm" style={{ color: '#3D3530' }}>{type.label}</span>
              </label>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Payment Method */}
      <motion.div className="rounded-2xl p-5 space-y-3" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
        <p className="text-sm font-bold" style={{ color: '#3D3530' }}>💳 付款方式</p>
        <div className="space-y-2">
          {[
            { id: 'credit', label: '信用卡 (VISA/Master/JCB)' },
            { id: 'bank', label: '匯款/ATM 轉帳' },
            { id: 'convenience', label: '超商代碼' },
            { id: 'line', label: 'LINE Pay' },
          ].map(method => (
            <label key={method.id} className="flex items-center gap-2 p-2 rounded-lg cursor-pointer" style={{ backgroundColor: paymentMethod === method.id ? '#E8F0E8' : '#FAF8F5' }}>
              <input type="radio" name="payment" checked={paymentMethod === method.id} onChange={() => setPaymentMethod(method.id)} />
              <span className="text-sm" style={{ color: '#3D3530' }}>{method.label}</span>
            </label>
          ))}
        </div>
      </motion.div>

      {/* Order Summary */}
      <motion.div className="rounded-2xl p-5 text-center" style={{ backgroundColor: '#FAF8F5' }}>
        <p className="text-sm mb-2" style={{ color: '#8C7B72' }}>訂單金額</p>
        <p className="text-2xl font-bold" style={{ color: '#8FA886' }}>NT${total.toLocaleString()}</p>
      </motion.div>

      {/* Checkout Button */}
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={handleCheckout}
        className="w-full py-3 rounded-xl font-bold text-white transition-all"
        style={{ backgroundColor: '#8FA886' }}
      >
        完成結帳
      </motion.button>
    </motion.div>
  );
}

// ===================== PAGE: MEMBER =====================

function MemberPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [points, setPoints] = useState<number>(0);
  const [pointsLoading, setPointsLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [pointsError, setPointsError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Load orders and points when user changes
  useEffect(() => {
    if (user?.email) {
      loadOrders(user.email);
      loadPoints(user.email);
    }
  }, [user?.email]);

  const loadOrders = async (email: string) => {
    setOrdersLoading(true);
    setOrdersError(null);
    try {
      const response = await fetch(`${API_BASE}/api/wc/orders?email=${encodeURIComponent(email)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }
      const data = await response.json();
      setOrders(data || []);
    } catch (error) {
      console.error('Error loading orders:', error);
      setOrdersError('目前無法取得訂單資料');
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadPoints = async (email: string) => {
    setPointsLoading(true);
    setPointsError(null);
    try {
      const response = await fetch(`${API_BASE}/api/member/points?email=${encodeURIComponent(email)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch points');
      }
      const data = await response.json();
      setPoints(data?.points || 0);
    } catch (error) {
      console.error('Error loading points:', error);
      setPointsError('目前無法取得紅利點數');
      setPoints(0);
    } finally {
      setPointsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error('Google 登入失敗:', error);
      // Fallback to redirect
      try {
        await signInWithRedirect(auth, googleProvider);
      } catch (redirectError) {
        console.error('Redirect 登入也失敗:', redirectError);
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setOrders([]);
      setPoints(0);
    } catch (error) {
      console.error('登出失敗:', error);
    }
  };

  if (loading) {
    return (
      <motion.div className="flex items-center justify-center py-12" {...fadeInUp}>
        <p style={{ color: '#8C7B72' }}>正在載入...</p>
      </motion.div>
    );
  }

  if (!user) {
    return (
      <motion.div className="space-y-5" {...fadeInUp}>
        {/* Header */}
        <div>
          <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>👤 會員中心</h2>
          <p className="text-sm mt-0.5" style={{ color: '#8C7B72' }}>登入以查看你的訂單和會員資訊</p>
        </div>

        {/* Login Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-8 text-center space-y-4"
          style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
        >
          <div className="text-5xl mb-4">👤</div>
          <p className="text-sm" style={{ color: '#8C7B72' }}>
            使用 Google 帳號登入，查看你的訂單和會員福利
          </p>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleGoogleLogin}
            className="w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
            style={{ backgroundColor: '#8FA886', color: '#fff' }}
          >
            <span>🔐</span>
            <span>使用 Google 帳號登入</span>
          </motion.button>
        </motion.div>

        {/* Benefits Preview */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl p-4"
          style={{ backgroundColor: '#FAF8F5' }}
        >
          <p className="text-xs font-medium mb-3" style={{ color: '#3D3530' }}>🎁 會員獨享</p>
          <ul className="space-y-2 text-xs" style={{ color: '#8C7B72' }}>
            <li>✓ 訂單管理與追蹤</li>
            <li>✓ 會員專屬優惠</li>
            <li>✓ 體驗紀錄保存</li>
          </ul>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-5" {...fadeInUp}>
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>👤 會員中心</h2>
        <p className="text-sm mt-0.5" style={{ color: '#8C7B72' }}>歡迎回來</p>
      </div>

      {/* User Profile Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-5"
        style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
      >
        <div className="flex items-center gap-4 mb-4">
          {user.photoURL && (
            <img
              src={user.photoURL}
              alt={user.displayName || 'User'}
              className="w-16 h-16 rounded-full"
            />
          )}
          <div className="flex-1">
            <p className="font-bold" style={{ color: '#3D3530' }}>
              {user.displayName || '使用者'}
            </p>
            <p className="text-sm" style={{ color: '#8C7B72' }}>
              {user.email}
            </p>
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={handleLogout}
          className="w-full py-2 rounded-xl text-sm font-medium transition-all"
          style={{ backgroundColor: '#FAF8F5', color: '#8B5E3C' }}
        >
          登出
        </motion.button>
      </motion.div>

      {/* My Orders */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl p-5"
        style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
      >
        <p className="font-bold mb-4" style={{ color: '#3D3530' }}>📋 我的訂單</p>
        {ordersLoading ? (
          <div className="text-center py-4">
            <p className="text-sm" style={{ color: '#8C7B72' }}>載入中...</p>
          </div>
        ) : ordersError ? (
          <div className="text-center py-4">
            <p className="text-sm" style={{ color: '#8C7B72' }}>{ordersError}</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm" style={{ color: '#8C7B72' }}>暫無訂單記錄</p>
            <p className="text-xs mt-2" style={{ color: '#8FA886' }}>預約體驗後，訂單將在此顯示</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div
                key={order.id}
                className="p-3 rounded-lg"
                style={{ backgroundColor: '#FAF8F5' }}
              >
                <div className="flex justify-between items-start mb-2">
                  <p className="text-sm font-medium" style={{ color: '#3D3530' }}>
                    訂單 #{order.id}
                  </p>
                  <span
                    className="text-xs px-2 py-1 rounded-full"
                    style={{
                      backgroundColor: '#E8F5E9',
                      color: '#2E7D32',
                    }}
                  >
                    {ORDER_STATUS_MAP[order.status] || order.status}
                  </span>
                </div>
                <p className="text-xs mb-1" style={{ color: '#8C7B72' }}>
                  {order.date}
                </p>
                <p className="text-sm font-bold" style={{ color: '#8FA886' }}>
                  NT${order.total.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* My Points */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="rounded-2xl p-5"
        style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
      >
        <p className="font-bold mb-4" style={{ color: '#3D3530' }}>⭐ 我的紅利點數</p>
        {pointsLoading ? (
          <div className="text-center py-4">
            <p className="text-sm" style={{ color: '#8C7B72' }}>載入中...</p>
          </div>
        ) : pointsError ? (
          <div className="text-center py-4">
            <p className="text-sm" style={{ color: '#8C7B72' }}>{pointsError}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-4 rounded-lg text-center" style={{ backgroundColor: '#FAF8F5' }}>
              <p className="text-3xl font-bold" style={{ color: '#8FA886' }}>
                {points}
              </p>
              <p className="text-xs mt-2" style={{ color: '#8C7B72' }}>
                可用點數（每1點 = NT$1）
              </p>
            </div>
            <div className="p-3 rounded-lg" style={{ backgroundColor: '#FAF8F5' }}>
              <p className="text-xs font-medium mb-2" style={{ color: '#3D3530' }}>💡 點數說明</p>
              <p className="text-xs" style={{ color: '#8C7B72' }}>
                消費金額的 2% 累積為紅利點數，可於下次購物時折抵現金使用。
              </p>
            </div>
          </div>
        )}
      </motion.div>

      {/* Member Benefits */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-2xl p-4"
        style={{ backgroundColor: '#FAF8F5' }}
      >
        <p className="text-xs font-medium mb-3" style={{ color: '#3D3530' }}>🎁 你的會員福利</p>
        <ul className="space-y-2 text-xs" style={{ color: '#8C7B72' }}>
          <li>✓ 訂單歷史查詢</li>
          <li>✓ 會員專屬優惠與最新資訊</li>
          <li>✓ 體驗記錄與評分</li>
        </ul>
      </motion.div>
    </motion.div>
  );
}

// ===================== PAGE: RECIPE =====================

function RecipePage({
  records,
  onCheckIn,
  onTaskComplete,
  user,
}: {
  records: HealingRecord[];
  onCheckIn: (emotion: EmotionKey) => void;
  onTaskComplete: (key: TaskKey) => void;
  user: User | null;
}) {
  const todayRecord = records.find(r => r.date === getToday());
  const [selectedOil, setSelectedOil] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);

  const emotion = todayRecord?.emotion;
  const recipe = emotion ? RECIPES[emotion] : null;
  const emotionInfo = emotion ? getEmotionInfo(emotion) : null;

  const handleSaveNote = useCallback(() => {
    if (!emotion || !note.trim()) return;
    const today = getToday();
    const updated = loadRecords().map(r =>
      r.date === today ? { ...r, note: note.trim() } : r
    );
    saveRecords(updated);
    // Also save to Firestore if logged in
    if (user) {
      const record = updated.find(r => r.date === today);
      if (record) {
        saveRecordToFirestore(user.uid, record);
      }
    }
    setNoteSaved(true);
    onTaskComplete('note');
    setTimeout(() => setNoteSaved(false), 2000);
  }, [emotion, note, onTaskComplete, user]);

  useEffect(() => {
    if (todayRecord?.note) setNote(todayRecord.note);
  }, [todayRecord?.note]);

  if (!emotion || !recipe || !emotionInfo) {
    return (
      <motion.div className="space-y-5" {...fadeInUp}>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>🧴 今日香氛處方</h2>
        <p className="text-sm" style={{ color: '#8C7B72' }}>先選擇你的今日情緒：</p>
        <EmotionPicker selected={null} onSelect={onCheckIn} />
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-5" {...fadeInUp}>
      <AnimatePresence>
        {selectedOil && (
          <OilModal oilName={selectedOil} onClose={() => setSelectedOil(null)} />
        )}
      </AnimatePresence>

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>為你量身調配</h2>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xl">{emotionInfo.emoji}</span>
          <span className="text-sm font-medium" style={{ color: '#8C7B72' }}>{emotionInfo.label}</span>
        </div>
      </div>

      {/* Healer Message */}
      <motion.div
        className="rounded-3xl p-5 shadow-sm"
        style={{ background: 'linear-gradient(135deg, #FAF8F5, #FFF8E7)' }}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <p className="text-sm leading-relaxed italic" style={{ color: '#3D3530' }}>
          「{recipe.message}」
        </p>
      </motion.div>

      {/* Recipe Cards */}
      <div className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>精油配方</p>
          <span className="text-xs px-2 py-1 rounded-xl" style={{ backgroundColor: '#FAF8F5', color: '#8C7B72' }}>
            {recipe.usage}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {recipe.oils.map((oil) => (
            <motion.button
              key={oil.name}
              whileTap={{ scale: 0.93 }}
              onClick={() => setSelectedOil(oil.name)}
              className="flex flex-col items-center rounded-2xl p-3 bg-gradient-to-br from-stone-50 to-amber-50"
            >
              <span className="text-lg font-bold mb-1" style={{ color: '#C9A96E' }}>{oil.drops}</span>
              <span className="text-xs font-medium mb-1" style={{ color: '#3D3530' }}>{oil.name}</span>
              <span className="text-xs" style={{ color: '#8C7B72' }}>{oil.role}</span>
            </motion.button>
          ))}
        </div>

        {/* --- NEW: CTA Buttons --- */}
        <div className="flex gap-2 mt-4 pt-4" style={{ borderTop: '1px solid #F0EDE8' }}>
          <a
            href="https://xiabenhow.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-xl py-2.5 text-xs font-medium text-center border"
            style={{ borderColor: '#C9A96E', color: '#C9A96E' }}
          >
            🛍️ 購買精油組合
          </a>
          <a
            href="https://xiabenhow.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-xl py-2.5 text-xs font-medium text-center text-white"
            style={{ backgroundColor: '#8FA886' }}
          >
            🌿 預約調香體驗
          </a>
        </div>
      </div>

      {/* Breathing */}
      <div className="rounded-3xl p-6 shadow-sm text-center" style={{ backgroundColor: '#FFFEF9' }}>
        <p className="text-sm font-bold mb-4" style={{ color: '#3D3530' }}>🫧 呼吸引導</p>
        <BreathingCircle />
        <button
          onClick={() => onTaskComplete('breathe')}
          className="mt-4 text-xs font-medium px-4 py-1.5 rounded-xl"
          style={{ backgroundColor: '#FAF8F5', color: '#8FA886' }}
        >
          ✅ 完成呼吸練習
        </button>
      </div>

      {/* Notes */}
      <div className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
        <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>📝 情緒筆記</p>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="記錄今天的感受..."
          className="w-full rounded-2xl p-3 text-sm resize-none border-0 outline-none"
          style={{ backgroundColor: '#FAF8F5', color: '#3D3530', minHeight: '80px' }}
          rows={3}
        />
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={handleSaveNote}
          className="mt-2 w-full rounded-2xl py-3 text-white font-medium text-sm"
          style={{ backgroundColor: noteSaved ? '#C9A96E' : '#8FA886' }}
        >
          {noteSaved ? '已記下 ✓' : '記下今天'}
        </motion.button>
      </div>
    </motion.div>
  );
}

// ===================== PAGE: CARD =====================

function CardPage({ onTaskComplete }: { onTaskComplete: (key: TaskKey) => void }) {
  const [drawnCard, setDrawnCard] = useState<CardInfo | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [savedCards, setSavedCards] = useState<number[]>(loadSavedCards);

  const drawCard = () => {
    const randomIndex = Math.floor(Math.random() * CARDS.length);
    setDrawnCard(CARDS[randomIndex]);
    setIsFlipped(false);
    setTimeout(() => {
      setIsFlipped(true);
      onTaskComplete('card');
    }, 300);
  };

  const redraw = () => {
    setIsFlipped(false);
    setTimeout(() => {
      const randomIndex = Math.floor(Math.random() * CARDS.length);
      setDrawnCard(CARDS[randomIndex]);
      setTimeout(() => setIsFlipped(true), 300);
    }, 400);
  };

  const saveCard = () => {
    if (!drawnCard) return;
    if (!savedCards.includes(drawnCard.id)) {
      const updated = [...savedCards, drawnCard.id];
      setSavedCards(updated);
      saveSavedCards(updated);
    }
  };

  const shareCard = () => {
    onTaskComplete('share');
    if (navigator.share && drawnCard) {
      navigator.share({
        title: `今日香氛籤：${drawnCard.name}`,
        text: `「${drawnCard.ritual}」\n精油：${drawnCard.recipe}\n#下班隨手作 #香氛療癒`,
      }).catch(() => {});
    }
  };

  return (
    <motion.div className="space-y-6" {...fadeInUp}>
      <div className="text-center">
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>🃏 今日香氛籤</h2>
        <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>每天一次，讓香氣帶你一天</p>
      </div>

      {/* Card Area */}
      <div className="flex justify-center">
        <div style={{ perspective: 1000 }} className="w-56">
          <motion.div
            className="relative w-56 h-80 card-flip-inner"
            animate={{ rotateY: isFlipped ? 180 : 0 }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
          >
            {/* Back Face */}
            <div
              className="absolute inset-0 rounded-3xl shadow-md flex flex-col items-center justify-center card-face"
              style={{ backgroundColor: '#FFFEF9' }}
            >
              <div className="border-2 border-dashed rounded-2xl px-6 py-10 text-center" style={{ borderColor: '#C9A96E' }}>
                <p className="text-lg font-bold mb-2" style={{ color: '#C9A96E' }}>即時共鳴</p>
                <p className="text-3xl mb-2">🌿</p>
                <p className="text-xs" style={{ color: '#8C7B72' }}>✦ 香氛療癒 ✦</p>
              </div>
            </div>

            {/* Front Face */}
            {drawnCard && (
              <div
                className={`absolute inset-0 rounded-3xl shadow-md flex flex-col items-center justify-center p-5 bg-gradient-to-br ${drawnCard.gradient} card-face-back`}
              >
                <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>{drawnCard.name}</p>
                <p className="text-6xl mb-3">{drawnCard.emoji}</p>
                <p className="text-xs italic text-center leading-relaxed mb-3 px-2" style={{ color: '#3D3530' }}>
                  「{drawnCard.ritual}」
                </p>
                <p className="text-xs text-center" style={{ color: '#8C7B72' }}>
                  {drawnCard.recipe}
                </p>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Buttons */}
      {!drawnCard ? (
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={drawCard}
          className="w-full rounded-2xl py-3 text-white font-medium text-sm"
          style={{ backgroundColor: '#8FA886' }}
        >
          ✨ 抽出今日香氛
        </motion.button>
      ) : isFlipped ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-3">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={redraw}
              className="flex-1 rounded-2xl py-3 font-medium text-sm"
              style={{ backgroundColor: '#FFFEF9', color: '#3D3530' }}
            >
              🔄 再抽一次
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={saveCard}
              className="flex-1 rounded-2xl py-3 text-white font-medium text-sm"
              style={{ backgroundColor: savedCards.includes(drawnCard?.id ?? -1) ? '#C9A96E' : '#8FA886' }}
            >
              {savedCards.includes(drawnCard?.id ?? -1) ? '已收藏 ✓' : '💾 收藏這張'}
            </motion.button>
          </div>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={shareCard}
            className="w-full rounded-2xl py-2.5 text-sm font-medium"
            style={{ backgroundColor: '#FAF8F5', color: '#8C7B72' }}
          >
            📤 分享今日卡片
          </motion.button>
        </div>
      ) : null}

      {/* Saved Cards */}
      {savedCards.length > 0 && (
        <div>
          <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>我的收藏</p>
          <div className="grid grid-cols-4 gap-2">
            {savedCards.map(id => {
              const card = CARDS.find(c => c.id === id);
              if (!card) return null;
              return (
                <motion.div
                  key={id}
                  className={`rounded-2xl p-3 text-center bg-gradient-to-br ${card.gradient} shadow-sm`}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setDrawnCard(card);
                    setIsFlipped(true);
                  }}
                >
                  <p className="text-2xl">{card.emoji}</p>
                  <p className="text-xs mt-1" style={{ color: '#3D3530' }}>{card.name}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ===================== PAGE: HEALER =====================

function HealerPage({ records }: { records: HealingRecord[] }) {
  const totalDays = new Set(records.map(r => r.date)).size;
  const level = getLevel(totalDays);
  const mostFrequent = getMostFrequentEmotion(records);
  const mostFrequentInfo = mostFrequent ? getEmotionInfo(mostFrequent) : null;
  const stabilityStars = getStabilityStars(records);

  const progressPercent = level.next === Infinity
    ? 100
    : Math.min(100, ((totalDays - level.min) / (level.next - level.min)) * 100);

  const chatBubbles = useMemo(() => {
    const bubbles: string[] = [];
    if (!mostFrequent) {
      bubbles.push('歡迎你來到這裡。開始記錄你的情緒，我會慢慢了解你。');
      bubbles.push('每天花一點時間感受自己，這就是療癒的開始。');
      bubbles.push('準備好了嗎？去首頁完成你的第一次打卡吧。');
    } else {
      if (mostFrequent === 'anxious' || mostFrequent === 'tired') {
        bubbles.push('我注意到你最近壓力偏高，記得每晚睡前擴香洋甘菊，讓身體先放鬆。');
      } else if (mostFrequent === 'warm' || mostFrequent === 'calm') {
        bubbles.push('你最近的狀態很穩定，這樣的感覺很珍貴，好好記住。');
      } else if (mostFrequent === 'low') {
        bubbles.push('我感受到你最近有些低落。記得，低潮是暫時的，你不是一個人。');
      } else {
        bubbles.push('你最近充滿活力！好好利用這股能量，去做一件一直想做的事。');
      }
      bubbles.push('今天有沒有完成你的微任務？呼吸練習只要30秒，但效果很大。');
      const recentRecord = records[records.length - 1];
      if (recentRecord) {
        const emo = getEmotionInfo(recentRecord.emotion);
        bubbles.push(`你上次記錄感到${emo.label}，希望今天的你更好一些。`);
      }
    }
    return bubbles;
  }, [records, mostFrequent]);

  const courseRecommendation = useMemo(() => {
    if (mostFrequent === 'anxious' || mostFrequent === 'tired') {
      return { title: '睡眠香氛調配工作坊 🌙', desc: '學習用香氣改善睡眠品質' };
    }
    if (mostFrequent === 'low') {
      return { title: '花語心靈蠟燭課程 🕯️', desc: '用手作療癒心靈' };
    }
    if (mostFrequent === 'energized') {
      return { title: '調香師入門體驗 ⚗️', desc: '探索屬於你的專屬香氣' };
    }
    return { title: '芳療生活入門課程 🌿', desc: '認識精油，開啟療癒旅程' };
  }, [mostFrequent]);

  return (
    <motion.div
      className="space-y-5"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* Healer Profile */}
      <motion.div
        variants={staggerItem}
        className="rounded-3xl p-6 shadow-sm text-center"
        style={{ backgroundColor: '#FFFEF9' }}
      >
        <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-purple-200 to-teal-200 flex items-center justify-center mb-3 shadow-sm">
          <span className="text-3xl">🌿</span>
        </div>
        <h2 className="text-lg font-bold" style={{ color: '#3D3530' }}>AURA 芳療師</h2>
        <p className="text-sm" style={{ color: '#8C7B72' }}>溫柔地陪伴你，每一天</p>
      </motion.div>

      {/* Analysis Card */}
      <motion.div
        variants={staggerItem}
        className="rounded-3xl p-5 shadow-sm"
        style={{ backgroundColor: '#FFFEF9' }}
      >
        {totalDays < 3 ? (
          <div className="text-center">
            <p className="text-sm leading-relaxed" style={{ color: '#3D3530' }}>
              開始記錄你的情緒旅程吧 🌱
            </p>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: '#8C7B72' }}>
              打卡越多，我越能了解你，給你更精準的陪伴。
            </p>
            <p className="text-sm mt-2" style={{ color: '#8FA886' }}>
              目前已記錄 {totalDays} 天，再打卡 {3 - totalDays} 天解鎖個人化建議。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {mostFrequentInfo && (
              <p className="text-sm" style={{ color: '#3D3530' }}>
                你這週最常感到 <span className="font-bold">{mostFrequentInfo.emoji} {mostFrequentInfo.label}</span>
              </p>
            )}
            <p className="text-sm" style={{ color: '#3D3530' }}>
              情緒穩定指數：<span style={{ color: '#C9A96E' }}>{renderStars(stabilityStars)}</span> {stabilityStars}/5
            </p>
            {mostFrequent && (
              <>
                <p className="text-sm" style={{ color: '#8C7B72' }}>
                  療癒建議：{RECIPES[mostFrequent].message}
                </p>
                <p className="text-sm font-medium" style={{ color: '#8FA886' }}>
                  推薦精油：{RECIPES[mostFrequent].oils.map(o => o.name).join(' + ')}
                </p>
              </>
            )}
          </div>
        )}
      </motion.div>

      {/* Chat Bubbles */}
      <motion.div variants={staggerItem} className="space-y-3">
        <p className="text-sm font-bold" style={{ color: '#3D3530' }}>💬 療癒師的話</p>
        {chatBubbles.map((msg, i) => (
          <motion.div
            key={i}
            className="rounded-2xl rounded-tl-sm p-4 shadow-sm"
            style={{ backgroundColor: '#FFFEF9' }}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.15 }}
          >
            <p className="text-sm leading-relaxed" style={{ color: '#8C7B72' }}>{msg}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Growth System */}
      <motion.div
        variants={staggerItem}
        className="rounded-3xl p-5 shadow-sm"
        style={{ backgroundColor: '#FFFEF9' }}
      >
        <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>🌱 成長旅程</p>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">{level.emoji}</span>
          <div>
            <p className="text-sm font-medium" style={{ color: '#3D3530' }}>
              {level.name} Lv.{level.level}
            </p>
            <p className="text-xs" style={{ color: '#8C7B72' }}>
              已記錄 {totalDays} 天
              {level.next !== Infinity && ` · 距離下一等級還差 ${level.next - totalDays} 天`}
            </p>
          </div>
        </div>
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#FAF8F5' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: '#8FA886' }}
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs" style={{ color: '#8C7B72' }}>
          <span>🌱 療癒旅人</span>
          <span>🌿 觀察者</span>
          <span>🌸 療癒者</span>
          <span>✨ 穩定之心</span>
        </div>
      </motion.div>

      {/* Course Recommendation */}
      <motion.div
        variants={staggerItem}
        className="rounded-3xl p-5 shadow-sm"
        style={{ background: 'linear-gradient(135deg, #FAF8F5, #FFF8E7)' }}
      >
        <p className="text-xs mb-2" style={{ color: '#8C7B72' }}>根據你最近的情緒狀態，推薦你這個體驗</p>
        <p className="text-base font-bold mb-1" style={{ color: '#3D3530' }}>{courseRecommendation.title}</p>
        <p className="text-sm mb-1" style={{ color: '#8C7B72' }}>{courseRecommendation.desc}</p>
        <p className="text-xs mb-3" style={{ color: '#8C7B72' }}>📍 下班隨手作 · 漢口街2段121號</p>
        <a
          href="https://xiabenhow.com"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full rounded-2xl py-3 text-white font-medium text-sm text-center"
          style={{ backgroundColor: '#C9A96E' }}
        >
          立即預約
        </a>
      </motion.div>
    </motion.div>
  );
}

// ===================== BOTTOM NAV =====================

const NAV_ITEMS: { key: PageType; emoji: string; label: string }[] = [
  { key: 'home', emoji: '🏠', label: '首頁' },
  { key: 'diary', emoji: '📊', label: '心情' },
  { key: 'sound', emoji: '🎵', label: '白噪音' },
  { key: 'card', emoji: '🃏', label: '抽卡' },
  { key: 'healer', emoji: '🌱', label: '療癒師' },
  { key: 'shop', emoji: '🛍️', label: '預約' },
  { key: 'library', emoji: '📚', label: '精油庫' },
  { key: 'calendar', emoji: '🗓️', label: '日曆' },
  { key: 'member', emoji: '👤', label: '會員' },
];

// ===================== PAGE: OIL LIBRARY =====================

function OilLibraryPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<OilLibraryItem | null>(null);
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    OIL_LIBRARY.forEach(o => o.tags.forEach(t => set.add(t)));
    return [...set];
  }, []);

  const filtered = useMemo(() => {
    return OIL_LIBRARY.filter(o => {
      const q = search.toLowerCase();
      const matchSearch = !q || o.name.includes(q) || o.en.toLowerCase().includes(q) || o.family.includes(q);
      const matchTag = !filterTag || o.tags.includes(filterTag);
      return matchSearch && matchTag;
    });
  }, [search, filterTag]);

  return (
    <motion.div className="space-y-4" {...fadeInUp}>
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>📚 精油圖書館</h2>
        <p className="text-sm mt-0.5" style={{ color: '#8C7B72' }}>認識每一滴的力量</p>
      </div>

      {/* Search */}
      <div
        className="flex items-center gap-2 rounded-2xl px-4 py-2.5"
        style={{ backgroundColor: '#FFFEF9' }}
      >
        <span style={{ color: '#8C7B72' }}>🔍</span>
        <input
          type="text"
          placeholder="搜尋精油名稱或科別..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 text-sm bg-transparent outline-none border-0"
          style={{ color: '#3D3530' }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{ color: '#8C7B72' }}>✕</button>
        )}
      </div>

      {/* Tag Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => setFilterTag(null)}
          className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium"
          style={!filterTag ? { backgroundColor: '#8FA886', color: '#fff' } : { backgroundColor: '#FFFEF9', color: '#8C7B72' }}
        >
          全部
        </button>
        {allTags.slice(0, 12).map(tag => (
          <button
            key={tag}
            onClick={() => setFilterTag(filterTag === tag ? null : tag)}
            className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium"
            style={filterTag === tag ? { backgroundColor: '#C9A96E', color: '#fff' } : { backgroundColor: '#FFFEF9', color: '#8C7B72' }}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Count */}
      <p className="text-xs" style={{ color: '#8C7B72' }}>共 {filtered.length} 支精油</p>

      {/* Oil Grid */}
      <div className="grid grid-cols-2 gap-3">
        {filtered.map((oil, i) => (
          <motion.button
            key={oil.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setSelected(oil)}
            className="rounded-2xl p-4 text-left shadow-sm"
            style={{ backgroundColor: '#FFFEF9' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{oil.emoji}</span>
              <span className="text-xs px-2 py-0.5 rounded-lg" style={{ backgroundColor: '#FAF8F5', color: '#8C7B72' }}>
                {FAMILY_EMOJI[oil.family] || '🌿'} {oil.family}
              </span>
            </div>
            <p className="text-sm font-bold mb-0.5" style={{ color: '#3D3530' }}>{oil.name}</p>
            <p className="text-xs mb-2" style={{ color: '#8C7B72' }}>{oil.en}</p>
            <p className="text-xs" style={{ color: '#8C7B72' }}>萃取：{oil.part}</p>
            {oil.tags.slice(0, 2).map(tag => (
              <span
                key={tag}
                className="inline-block mr-1 mt-1 px-2 py-0.5 rounded-lg text-xs"
                style={{ backgroundColor: '#F0EDE8', color: '#8C7B72' }}
              >
                {tag}
              </span>
            ))}
          </motion.button>
        ))}
      </div>

      {/* Detail Drawer */}
      <AnimatePresence>
        {selected && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => setSelected(null)} />
            <motion.div
              className="relative w-full max-w-md rounded-t-3xl p-6 pb-10 overflow-y-auto"
              style={{ backgroundColor: '#FFFEF9', maxHeight: '85vh' }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-gray-300" />

              <div className="flex items-center gap-3 mb-4">
                <span className="text-4xl">{selected.emoji}</span>
                <div>
                  <h3 className="text-xl font-bold" style={{ color: '#3D3530' }}>{selected.name}</h3>
                  <p className="text-sm" style={{ color: '#8C7B72' }}>{selected.en} · {selected.family}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>萃取部位：{selected.part}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-4">
                {selected.tags.map(tag => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 rounded-xl text-xs font-medium"
                    style={{ backgroundColor: '#F0EDE8', color: '#8C7B72' }}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div className="space-y-3">
                {selected.use && (
                  <div className="rounded-2xl p-4" style={{ backgroundColor: '#FAF8F5' }}>
                    <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>💊 臨床應用</p>
                    <p className="text-sm whitespace-pre-line leading-relaxed" style={{ color: '#8C7B72' }}>{selected.use}</p>
                  </div>
                )}
                {selected.physical && (
                  <div className="rounded-2xl p-4" style={{ backgroundColor: '#FAF8F5' }}>
                    <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>🫀 生理功效</p>
                    <p className="text-sm whitespace-pre-line leading-relaxed" style={{ color: '#8C7B72' }}>{selected.physical}</p>
                  </div>
                )}
                {selected.mental && (
                  <div className="rounded-2xl p-4" style={{ backgroundColor: '#FAF8F5' }}>
                    <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>🧠 心靈功效</p>
                    <p className="text-sm whitespace-pre-line leading-relaxed" style={{ color: '#8C7B72' }}>{selected.mental}</p>
                  </div>
                )}
              </div>

              <button
                onClick={() => setSelected(null)}
                className="mt-5 w-full rounded-2xl py-3 text-white font-medium"
                style={{ backgroundColor: '#8FA886' }}
              >
                關閉
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ===================== PAGE: FRAGRANCE CALENDAR =====================

function FragranceCalendarPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(false);

  // Check Firestore authorized list
  const checkAuthorized = async (u: User) => {
    if (!u.email) return false;
    setCheckingAuth(true);
    try {
      const ref = doc(db, 'calendar_authorized', u.email.replace(/\./g, '_'));
      const snap = await getDoc(ref);
      return snap.exists() && snap.data()?.active === true;
    } catch {
      return false;
    } finally {
      setCheckingAuth(false);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const ok = await checkAuthorized(u);
        setIsAuthorized(ok);
      } else {
        setIsAuthorized(false);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const ok = await checkAuthorized(result.user);
      setIsAuthorized(ok);
    } catch (e) {
      console.error(e);
    }
    setSigningIn(false);
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setIsAuthorized(false);
  };

  if (loading || checkingAuth) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: '#8FA886', borderTopColor: 'transparent' }} />
        <p className="text-sm" style={{ color: '#8C7B72' }}>驗證中...</p>
      </div>
    );
  }

  // Not signed in
  if (!user) {
    return (
      <motion.div className="space-y-6" {...fadeInUp}>
        <div>
          <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>🗓️ 調香日曆 2027</h2>
          <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>52週·即時共鳴·香氛日曆</p>
        </div>

        {/* Coming Soon Preview */}
        <div className="rounded-3xl overflow-hidden shadow-sm relative">
          <img
            src="/coming-soon.jpg"
            alt="2027 Fragrance Calendar Coming Soon"
            className="w-full object-cover"
            style={{ maxHeight: '280px' }}
          />
          <div
            className="absolute inset-0 flex flex-col items-center justify-end pb-6"
            style={{ background: 'linear-gradient(transparent 30%, rgba(61,53,48,0.85))' }}
          >
            <p className="text-white text-xl font-bold">2027 Fragrance Calendar</p>
            <p className="text-white text-sm opacity-80 mt-1">Coming Soon ✨</p>
          </div>
        </div>

        <div className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>🔒 此內容僅限購買者使用</p>
          <p className="text-sm leading-relaxed mb-4" style={{ color: '#8C7B72' }}>
            購買 2027 香氛日曆後，使用你的 Google 帳號登入即可解鎖完整電子版。
          </p>

          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleSignIn}
            disabled={signingIn}
            className="w-full rounded-2xl py-3 font-medium text-sm flex items-center justify-center gap-2"
            style={{ backgroundColor: '#4285F4', color: '#fff' }}
          >
            {signingIn ? (
              <span>登入中...</span>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#fff"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#fff"/>
                  <path d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#fff"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#fff"/>
                </svg>
                使用 Google 帳號登入
              </>
            )}
          </motion.button>

          <a
            href="https://xiabenhow.com"
            target="_blank"
            rel="noopener noreferrer"
            className="block mt-3 w-full rounded-2xl py-3 text-center font-medium text-sm"
            style={{ backgroundColor: '#FAF8F5', color: '#C9A96E' }}
          >
            🛍️ 購買 2027 調香日曆
          </a>
        </div>
      </motion.div>
    );
  }

  // Signed in but not authorized
  if (!isAuthorized) {
    return (
      <motion.div className="space-y-5" {...fadeInUp}>
        <div>
          <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>🗓️ 調香日曆 2027</h2>
        </div>

        <div className="rounded-3xl overflow-hidden shadow-sm relative">
          <img
            src="/coming-soon.jpg"
            alt="2027 Fragrance Calendar Coming Soon"
            className="w-full object-cover"
            style={{ maxHeight: '280px' }}
          />
          <div
            className="absolute inset-0 flex flex-col items-center justify-end pb-6"
            style={{ background: 'linear-gradient(transparent 30%, rgba(61,53,48,0.85))' }}
          >
            <p className="text-white text-xl font-bold">2027 Fragrance Calendar</p>
            <p className="text-white text-sm opacity-80 mt-1">Coming Soon ✨</p>
          </div>
        </div>

        <div className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <div className="flex items-center gap-2 mb-3">
            {user.photoURL && (
              <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full" />
            )}
            <div>
              <p className="text-sm font-medium" style={{ color: '#3D3530' }}>{user.displayName || user.email}</p>
              <p className="text-xs" style={{ color: '#8C7B72' }}>{user.email}</p>
            </div>
          </div>
          <p className="text-sm leading-relaxed mb-4" style={{ color: '#8C7B72' }}>
            此帳號尚未購買 2027 香氛日曆，或尚在審核中。購買後請聯繫客服開通帳號。
          </p>
          <a
            href="https://xiabenhow.com"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-2xl py-3 text-center text-white font-medium text-sm mb-2"
            style={{ backgroundColor: '#C9A96E' }}
          >
            🛍️ 購買 2027 調香日曆
          </a>
          <button
            onClick={handleSignOut}
            className="w-full rounded-2xl py-2.5 text-sm font-medium"
            style={{ backgroundColor: '#FAF8F5', color: '#8C7B72' }}
          >
            登出
          </button>
        </div>
      </motion.div>
    );
  }

  // Authorized user — show content
  return (
    <motion.div className="space-y-5" {...fadeInUp}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>🗓️ 調香日曆 2027</h2>
          <p className="text-sm" style={{ color: '#8C7B72' }}>52週·即時共鳴</p>
        </div>
        <div className="flex items-center gap-2">
          {user.photoURL && (
            <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full" />
          )}
          <button onClick={handleSignOut} className="text-xs" style={{ color: '#8C7B72' }}>登出</button>
        </div>
      </div>

      {/* Main Coming Soon */}
      <div className="rounded-3xl overflow-hidden shadow-sm relative">
        <img
          src="/coming-soon.jpg"
          alt="2027 Fragrance Calendar Coming Soon"
          className="w-full object-cover"
        />
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ background: 'rgba(61,53,48,0.5)' }}
        >
          <p className="text-white text-2xl font-bold mb-2">2027 Fragrance Calendar</p>
          <p className="text-white text-base mb-1">Coming Soon ✨</p>
          <p className="text-white text-sm opacity-80">敬請期待，即將上線</p>
        </div>
      </div>

      <div className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
        <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>✅ 帳號已驗證</p>
        <p className="text-sm" style={{ color: '#8C7B72' }}>
          嗨，{user.displayName}！你的帳號已開通 2027 調香日曆。<br />
          電子版正在最後製作階段，完成後將立即通知你 🌸
        </p>
      </div>
    </motion.div>
  );
}

// ===================== BOTTOM NAV =====================

function BottomNav({ active, onChange }: { active: PageType; onChange: (p: PageType) => void }) {
  // Split nav into two rows: main 5 + extra 4
  const mainNav = NAV_ITEMS.slice(0, 5);
  const extraNav = NAV_ITEMS.slice(5);

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40"
      style={{ backgroundColor: '#FFFEF9', borderTop: '1px solid #F0EDE8' }}
    >
      <div className="max-w-md mx-auto">
        {/* Main nav */}
        <div className="flex justify-around items-center h-16">
          {mainNav.map(item => (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              className="flex flex-col items-center gap-0.5 relative py-1 px-3"
            >
              <span className="text-lg">{item.emoji}</span>
              <span
                className="text-xs font-medium"
                style={{ color: active === item.key ? '#8FA886' : '#8C7B72' }}
              >
                {item.label}
              </span>
              {active === item.key && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute -bottom-0.5 w-6 h-0.5 rounded-full"
                  style={{ backgroundColor: '#8FA886' }}
                />
              )}
            </button>
          ))}
        </div>
        {/* Extra nav - icon 在字上面 */}
        <div
          className="flex justify-around items-center h-14 border-t"
          style={{ borderColor: '#F0EDE8' }}
        >
          {extraNav.map(item => (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              className="flex flex-col items-center gap-0.5 py-1 px-3 relative"
            >
              <span className="text-lg">{item.emoji}</span>
              <span
                className="text-xs font-medium"
                style={{ color: active === item.key ? '#8FA886' : '#8C7B72' }}
              >
                {item.label}
              </span>
              {active === item.key && (
                <motion.div
                  layoutId="nav-indicator-extra"
                  className="absolute -bottom-0.5 w-6 h-0.5 rounded-full"
                  style={{ backgroundColor: '#8FA886' }}
                />
              )}
            </button>
          ))}
          <a
            href="https://page.line.me/296yrpvh?openQrModal=true"
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-0.5 py-1 px-3"
          >
            <span className="text-lg">💬</span>
            <span className="text-xs font-medium" style={{ color: '#8C7B72' }}>客服</span>
          </a>
        </div>
      </div>
    </div>
  );
}

// ===================== MAIN COMPONENT =====================

export default function HealingApp() {
  const [page, setPage] = useState<PageType>('home');
  const [user, setUser] = useState<User | null>(null);
  const [records, setRecords] = useState<HealingRecord[]>(() => {
    const existing = loadRecords();
    if (existing.length === 0) {
      const demo = seedDemoData();
      saveRecords(demo);
      return demo;
    }
    return existing;
  });

  // --- NEW STATE ---
  const [dailyTasks, setDailyTasks] = useState<Record<TaskKey, boolean>>(loadDailyTasks);
  const [showMorningFlow, setShowMorningFlow] = useState(false);
  const [morningFlowEmotion, setMorningFlowEmotion] = useState<EmotionKey | null>(null);
  const [showMilestone, setShowMilestone] = useState<number | null>(null);

  // Listen for auth changes and load Firestore records if logged in
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Load from Firestore if logged in
        const firestoreRecords = await loadRecordsFromFirestore(currentUser.uid);
        if (firestoreRecords.length > 0) {
          setRecords(firestoreRecords);
        }
      }
    });
    return unsubscribe;
  }, []);

  const completeTask = useCallback((key: TaskKey) => {
    setDailyTasks(prev => {
      if (prev[key]) return prev;
      const updated = { ...prev, [key]: true };
      saveDailyTasks(updated);
      return updated;
    });
  }, []);

  const toggleTask = useCallback((key: TaskKey) => {
    setDailyTasks(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      saveDailyTasks(updated);
      return updated;
    });
  }, []);

  const handleCheckIn = useCallback((emotion: EmotionKey) => {
    const today = getToday();
    setRecords(prev => {
      const filtered = prev.filter(r => r.date !== today);
      const updated = [...filtered, { date: today, emotion }];
      saveRecords(updated);
      // Also save to Firestore if logged in
      if (user) {
        saveRecordToFirestore(user.uid, { date: today, emotion });
      }
      return updated;
    });
    completeTask('checkin');
    setMorningFlowEmotion(emotion);
    setShowMorningFlow(true);
  }, [completeTask, user]);

  const handleMorningFlowDone = useCallback(() => {
    setShowMorningFlow(false);
    // Check for milestone
    const streak = getStreak(records);
    const shown = loadShownMilestones();
    for (const m of MILESTONE_DAYS) {
      if (streak >= m && !shown.includes(m)) {
        addShownMilestone(m);
        setTimeout(() => setShowMilestone(m), 400);
        break;
      }
    }
  }, [records]);

  const goToRecipe = useCallback(() => setPage('recipe'), []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAF8F5' }}>
      <div className="max-w-md mx-auto px-4 pt-6 pb-36">
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            {page === 'home' && (
              <HomePage
                records={records}
                onCheckIn={handleCheckIn}
                onGoToRecipe={goToRecipe}
                dailyTasks={dailyTasks}
                onTaskToggle={toggleTask}
                onTaskComplete={completeTask}
              />
            )}
            {page === 'diary' && <DiaryPage records={records} />}
            {page === 'sound' && <SoundPage />}
            {page === 'recipe' && (
              <RecipePage
                records={records}
                onCheckIn={handleCheckIn}
                onTaskComplete={completeTask}
                user={user}
              />
            )}
            {page === 'card' && <CardPage onTaskComplete={completeTask} />}
            {page === 'healer' && <HealerPage records={records} />}
            {page === 'shop' && <ShopPage />}
            {page === 'library' && <OilLibraryPage />}
            {page === 'calendar' && <FragranceCalendarPage />}
            {page === 'member' && <MemberPage />}
          </motion.div>
        </AnimatePresence>
      </div>
      <BottomNav active={page} onChange={setPage} />

      {/* Morning Flow Modal */}
      <AnimatePresence>
        {showMorningFlow && morningFlowEmotion && (
          <MorningFlowModal
            emotion={morningFlowEmotion}
            onDone={handleMorningFlowDone}
          />
        )}
      </AnimatePresence>

      {/* Milestone Modal */}
      <AnimatePresence>
        {showMilestone && (
          <MilestoneModal
            days={showMilestone}
            onClose={() => setShowMilestone(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
