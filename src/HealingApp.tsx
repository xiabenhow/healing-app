import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';


// ===================== TYPES =====================

type EmotionKey = 'calm' | 'anxious' | 'tired' | 'warm' | 'low' | 'energized';
type PageType = 'home' | 'diary' | 'recipe' | 'card' | 'healer';
type TaskKey = 'checkin' | 'card' | 'note' | 'breathe' | 'evening' | 'share';

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

// ===================== PAGE: RECIPE =====================

function RecipePage({
  records,
  onCheckIn,
  onTaskComplete,
}: {
  records: HealingRecord[];
  onCheckIn: (emotion: EmotionKey) => void;
  onTaskComplete: (key: TaskKey) => void;
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
    const updated = loadRecords().map(r =>
      r.date === getToday() ? { ...r, note: note.trim() } : r
    );
    saveRecords(updated);
    setNoteSaved(true);
    onTaskComplete('note');
    setTimeout(() => setNoteSaved(false), 2000);
  }, [emotion, note, onTaskComplete]);

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
  { key: 'diary', emoji: '📊', label: '情緒' },
  { key: 'recipe', emoji: '🧴', label: '配方' },
  { key: 'card', emoji: '🃏', label: '抽卡' },
  { key: 'healer', emoji: '🌱', label: '療癒師' },
];

function BottomNav({ active, onChange }: { active: PageType; onChange: (p: PageType) => void }) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40"
      style={{ backgroundColor: '#FFFEF9', borderTop: '1px solid #F0EDE8' }}
    >
      <div className="max-w-md mx-auto flex justify-around items-center h-16">
        {NAV_ITEMS.map(item => (
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
    </div>
  );
}

// ===================== MAIN COMPONENT =====================

export default function HealingApp() {
  const [page, setPage] = useState<PageType>('home');
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
      return updated;
    });
    completeTask('checkin');
    setMorningFlowEmotion(emotion);
    setShowMorningFlow(true);
  }, [completeTask]);

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
      <div className="max-w-md mx-auto px-4 pt-6 pb-24">
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
            {page === 'recipe' && (
              <RecipePage
                records={records}
                onCheckIn={handleCheckIn}
                onTaskComplete={completeTask}
              />
            )}
            {page === 'card' && <CardPage onTaskComplete={completeTask} />}
            {page === 'healer' && <HealerPage records={records} />}
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
