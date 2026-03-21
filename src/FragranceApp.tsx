import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ───────────────────────────────────────────────────────────
type Mood =
  | '疲倦' | '焦慮' | '低落'
  | '溫暖' | '平靜' | '熱情'
  | '煩躁' | '感性' | '期待';

type Page = 'checkin' | 'prescription' | 'weekly' | 'draw' | 'journal';

interface Oil { name: string; drops: number }

interface Prescription {
  emoji: string;
  oils: Oil[];
  quote: string;
  mental: string;
  physical: string;
}

interface OilInfoData {
  chName: string;
  enName: string;
  family: string;
  aroma: string;
  psychology: string;
  physiology: string;
  caution: string;
  pairing: string;
}

interface DrawCard {
  id: number;
  name: string;
  emoji: string;
  recipe: string;
  ritual: string;
  color: string;
}

// ─── Data ────────────────────────────────────────────────────────────
const moods: { emoji: string; label: Mood }[] = [
  { emoji: '😴', label: '疲倦' },
  { emoji: '😰', label: '焦慮' },
  { emoji: '😔', label: '低落' },
  { emoji: '🥰', label: '溫暖' },
  { emoji: '😌', label: '平靜' },
  { emoji: '🔥', label: '熱情' },
  { emoji: '😤', label: '煩躁' },
  { emoji: '🫀', label: '感性' },
  { emoji: '✨', label: '期待' },
];

const prescriptions: Record<Mood, Prescription> = {
  疲倦: {
    emoji: '😴',
    oils: [
      { name: '歐洲赤松', drops: 5 },
      { name: '迷迭香', drops: 3 },
      { name: '甜橙', drops: 2 },
    ],
    quote: '針葉木質喚醒沉睡的你，今天先從深呼吸開始。',
    mental: '提振精神、恢復活力',
    physical: '促進循環、舒緩肌肉疲勞',
  },
  焦慮: {
    emoji: '😰',
    oils: [
      { name: '洋甘菊', drops: 5 },
      { name: '花梨木', drops: 3 },
      { name: '雪松', drops: 2 },
    ],
    quote: '讓焦慮的心先落地。不用現在就解決，先把自己穩住。',
    mental: '安撫焦慮、帶來安全感',
    physical: '緩解緊繃肌肉、調節神經系統',
  },
  低落: {
    emoji: '😔',
    oils: [
      { name: '佛手柑', drops: 5 },
      { name: '甜橙', drops: 3 },
      { name: '依蘭依蘭', drops: 2 },
    ],
    quote: '陽光調的香氣，輕輕把你的心托起來。',
    mental: '提升正向情緒、緩解憂鬱感',
    physical: '平衡荷爾蒙、舒緩心悸',
  },
  溫暖: {
    emoji: '🥰',
    oils: [
      { name: '玫瑰天竺葵', drops: 5 },
      { name: '佛手柑', drops: 3 },
      { name: '花梨木', drops: 2 },
    ],
    quote: '今天的你很美。讓這個溫度繼續留著。',
    mental: '增強幸福感、感恩情緒',
    physical: '護膚、平衡油脂',
  },
  平靜: {
    emoji: '😌',
    oils: [
      { name: '真正薰衣草', drops: 5 },
      { name: '絲柏', drops: 3 },
      { name: '乳香', drops: 2 },
    ],
    quote: '已經很好了。讓這份安靜陪著你。',
    mental: '深層放鬆、穩定情緒',
    physical: '助眠、調節呼吸',
  },
  熱情: {
    emoji: '🔥',
    oils: [
      { name: '迷迭香', drops: 5 },
      { name: '歐洲赤松', drops: 3 },
      { name: '克萊門橙', drops: 2 },
    ],
    quote: '把這股能量好好用。你今天可以做到很多事。',
    mental: '提升專注力、激發創造力',
    physical: '促進血液循環、提升代謝',
  },
  煩躁: {
    emoji: '😤',
    oils: [
      { name: '快樂鼠尾草', drops: 5 },
      { name: '真正薰衣草', drops: 3 },
      { name: '苦橙葉', drops: 2 },
    ],
    quote: '煩躁是訊號，不是錯誤。先給自己五分鐘。',
    mental: '緩解憤怒與急躁、清理思緒',
    physical: '緩解頭痛、調節荷爾蒙',
  },
  感性: {
    emoji: '🫀',
    oils: [
      { name: '橙花', drops: 5 },
      { name: '玫瑰天竺葵', drops: 3 },
      { name: '乳香', drops: 2 },
    ],
    quote: '感性是天賦。讓你的心說說話。',
    mental: '釋放深層情緒、提升靈性連結',
    physical: '護膚、舒緩心臟系統',
  },
  期待: {
    emoji: '✨',
    oils: [
      { name: '佛手柑', drops: 5 },
      { name: '迷迭香', drops: 3 },
      { name: '絲柏', drops: 2 },
    ],
    quote: '你期待的事情，值得你全力去試。',
    mental: '提升自信心、清晰思路',
    physical: '提振免疫力、淨化空氣',
  },
};

const oilInfo: Record<string, OilInfoData> = {
  洋甘菊: { chName: '洋甘菊', enName: 'Roman Chamomile', family: '菊科', aroma: '清甜蘋果花香，略帶草本氣息', psychology: '安撫焦慮、平靜急躁、提升安全感、改善失眠', physiology: '緩解痙攣疼痛、消炎抗敏、修復敏感肌膚', caution: '孕初期避免，嬰幼兒需稀釋', pairing: '花梨木、雪松、克萊門橙、薰衣草' },
  歐洲赤松: { chName: '歐洲赤松', enName: 'Scots Pine', family: '松科', aroma: '清新針葉林氣息，帶有森林後韻', psychology: '提振精神、建立信心、增加行動力', physiology: '促進循環、舒緩肌肉疲勞、支持呼吸道', caution: '嬰幼兒及腎臟病患慎用', pairing: '迷迭香、絲柏、佛手柑' },
  佛手柑: { chName: '佛手柑', enName: 'Bergamot (FCF)', family: '芸香科', aroma: '清新柑橘，帶有花香尾韻', psychology: '提升正向情緒、緩解憂鬱感、增加活力', physiology: '平衡荷爾蒙、舒緩消化不適、淨化空氣', caution: 'FCF版無光敏，一般版避免日曬', pairing: '依蘭依蘭、甜橙、花梨木' },
  依蘭依蘭: { chName: '依蘭依蘭', enName: 'Ylang Ylang', family: '番荔枝科', aroma: '濃郁花香，帶有異國情調甜感', psychology: '緩解憂鬱、提升愉悅感、平衡情緒', physiology: '舒緩心悸、平衡荷爾蒙、降低血壓', caution: '用量不宜過多，可能引起頭痛', pairing: '佛手柑、花梨木、玫瑰天竺葵' },
  玫瑰天竺葵: { chName: '玫瑰天竺葵', enName: 'Rose Geranium', family: '牻牛兒苗科', aroma: '玫瑰般花香，帶有草本清新感', psychology: '增強幸福感、平衡情緒、緩解PMS情緒波動', physiology: '平衡油脂、護膚、調節荷爾蒙', caution: '孕期避免', pairing: '橙花、佛手柑、克萊門橙' },
  真正薰衣草: { chName: '真正薰衣草', enName: 'True Lavender', family: '唇形科', aroma: '清新花香，平衡草本與花卉調', psychology: '深層放鬆、平靜焦慮、改善睡眠品質', physiology: '助眠、舒緩頭痛、修復皮膚', caution: '低血壓者避免大量使用', pairing: '洋甘菊、乳香、絲柏' },
  快樂鼠尾草: { chName: '快樂鼠尾草', enName: 'Clary Sage', family: '唇形科', aroma: '草本甜香，略帶堅果氣息', psychology: '緩解憤怒、清理思緒、帶來樂觀感', physiology: '調節荷爾蒙、緩解經痛、放鬆肌肉', caution: '孕期嚴禁，勿與酒精併用', pairing: '薰衣草、佛手柑、苦橙葉' },
  橙花: { chName: '橙花', enName: 'Neroli', family: '芸香科', aroma: '細膩花香，清雅高貴', psychology: '釋放深層情緒、帶來靈性平靜、撫慰心碎', physiology: '護膚、舒緩心臟系統、助消化', caution: '價格昂貴，注意真偽', pairing: '玫瑰天竺葵、乳香、佛手柑' },
  乳香: { chName: '乳香', enName: 'Frankincense', family: '橄欖科', aroma: '深邃樹脂香，帶有神聖感', psychology: '深層冥想、連結靈性、放慢思緒', physiology: '提升免疫力、護膚抗老、調節呼吸', caution: '孕期避免大量使用', pairing: '絲柏、花梨木、玫瑰天竺葵' },
  迷迭香: { chName: '迷迭香', enName: 'Rosemary', family: '唇形科', aroma: '清新草本，帶有穿透力', psychology: '提升專注力、激發記憶力、增強意志力', physiology: '促進血液循環、舒緩頭痛、提升代謝', caution: '高血壓、癲癇患者避免，孕期避免', pairing: '歐洲赤松、絲柏、佛手柑' },
  絲柏: { chName: '絲柏', enName: 'Cypress', family: '柏科', aroma: '清爽木質，帶有涼感針葉香', psychology: '穩定接地、平靜過度情緒、帶來清晰感', physiology: '改善靜脈循環、收斂、支持呼吸道', caution: '荷爾蒙相關疾病者慎用', pairing: '乳香、花梨木、歐洲赤松' },
  花梨木: { chName: '花梨木', enName: 'Rosewood', family: '樟科', aroma: '溫柔木質玫瑰香，溫暖包覆', psychology: '溫柔包覆情緒、提升自我價值感、平靜過勞', physiology: '護膚、抗菌、支持免疫系統', caution: '無特殊禁忌，老少皆宜', pairing: '洋甘菊、乳香、橙花' },
  苦橙葉: { chName: '苦橙葉', enName: 'Petitgrain', family: '芸香科', aroma: '清新木質花香，帶苦橙葉片氣息', psychology: '緩解憤怒、清醒思緒、帶來平衡感', physiology: '調節神經系統、抗菌、舒緩肌肉痙攣', caution: '無特殊禁忌', pairing: '快樂鼠尾草、薰衣草、佛手柑' },
  雪松: { chName: '雪松', enName: 'Cedarwood', family: '松科', aroma: '溫暖木質，接地且穩定', psychology: '接地穩定情緒、增強耐力、平靜恐懼', physiology: '促進淋巴循環、護髮護膚、舒緩呼吸道', caution: '孕期避免', pairing: '洋甘菊、花梨木、歐洲赤松' },
  克萊門橙: { chName: '克萊門橙', enName: 'Clementine', family: '芸香科', aroma: '甜蜜清新柑橘，活潑輕盈', psychology: '提振情緒、帶來快樂感、緩解緊繃', physiology: '促消化、舒緩腸胃緊張、提升食慾', caution: '避免日曬（有光敏性）', pairing: '洋甘菊、花梨木、薰衣草' },
  甜橙: { chName: '甜橙', enName: 'Sweet Orange', family: '芸香科', aroma: '溫暖甜蜜柑橘，最親切的香氣', psychology: '帶來溫暖愉悅、緩解孤獨感、提升活力', physiology: '促消化、抗菌、提升免疫', caution: '有光敏性，避免日曬使用', pairing: '佛手柑、依蘭依蘭、玫瑰天竺葵' },
};

const drawCards: DrawCard[] = [
  { id: 1, name: '晨霧儀式', emoji: '🌅', recipe: '迷迭香 5滴 + 薄荷 3滴 + 檸檬 2滴', ritual: '在第一口呼吸裡，把今天拿回來。', color: 'from-amber-50 to-orange-50' },
  { id: 2, name: '入夜安放', emoji: '🌙', recipe: '真正薰衣草 5滴 + 乳香 3滴 + 雪松 2滴', ritual: '放下今天所有的重量，你已經做夠了。', color: 'from-indigo-50 to-purple-50' },
  { id: 3, name: '正午清醒', emoji: '☀️', recipe: '歐洲赤松 4滴 + 佛手柑 3滴 + 迷迭香 3滴', ritual: '這一刻只屬於你，深呼吸一次再繼續。', color: 'from-yellow-50 to-amber-50' },
  { id: 4, name: '溫柔邊界', emoji: '🌿', recipe: '洋甘菊 5滴 + 花梨木 3滴 + 苦橙葉 2滴', ritual: '你可以溫柔，也可以有底線。', color: 'from-emerald-50 to-teal-50' },
  { id: 5, name: '心動時刻', emoji: '💛', recipe: '橙花 5滴 + 玫瑰天竺葵 3滴 + 佛手柑 2滴', ritual: '讓心跳快一點也沒關係，這是活著的感覺。', color: 'from-rose-50 to-pink-50' },
  { id: 6, name: '森林呼吸', emoji: '🌲', recipe: '絲柏 4滴 + 加拿大冷杉 4滴 + 雪松 2滴', ritual: '把根扎下去，讓風過去。', color: 'from-green-50 to-emerald-50' },
  { id: 7, name: '感恩收尾', emoji: '🙏', recipe: '乳香 5滴 + 玫瑰天竺葵 3滴 + 甜橙 2滴', ritual: '今天有什麼值得記住？先謝謝自己。', color: 'from-orange-50 to-rose-50' },
  { id: 8, name: '重啟按鈕', emoji: '🔄', recipe: '快樂鼠尾草 4滴 + 佛手柑 3滴 + 薰衣草 3滴', ritual: '不是重來，是重新開始——帶著你學到的。', color: 'from-sky-50 to-blue-50' },
  { id: 9, name: '孤獨美好', emoji: '🕯️', recipe: '乳香 5滴 + 絲柏 3滴 + 花梨木 2滴', ritual: '一個人也可以很完整。', color: 'from-stone-50 to-amber-50' },
  { id: 10, name: '創意流動', emoji: '🎨', recipe: '依蘭依蘭 3滴 + 佛手柑 4滴 + 迷迭香 3滴', ritual: '讓想法自由流動，不用現在就有答案。', color: 'from-fuchsia-50 to-pink-50' },
  { id: 11, name: '關係滋養', emoji: '🌸', recipe: '玫瑰天竺葵 5滴 + 橙花 3滴 + 克萊門橙 2滴', ritual: '你給出的愛，也記得留一些給自己。', color: 'from-rose-50 to-orange-50' },
  { id: 12, name: '勇氣一刻', emoji: '⚡', recipe: '歐洲赤松 5滴 + 迷迭香 3滴 + 乳香 2滴', ritual: '你比你以為的更有能力。', color: 'from-violet-50 to-indigo-50' },
];

const weeklyData: { day: string; mood: Mood }[] = [
  { day: '一', mood: '煩躁' },
  { day: '二', mood: '焦慮' },
  { day: '三', mood: '疲倦' },
  { day: '四', mood: '平靜' },
  { day: '五', mood: '溫暖' },
  { day: '六', mood: '感性' },
  { day: '日', mood: '期待' },
];

const DEMO_MODE = true;

const demoJournalEntries = [
  { date: '2026-03-19', emotion: '焦慮', emotionEmoji: '😰', recipe: '洋甘菊 5滴 + 花梨木 3滴 + 雪松 2滴', note: '今天開會被問到不會的問題，有點緊張，用了配方之後慢慢穩下來了。' },
  { date: '2026-03-18', emotion: '疲倦', emotionEmoji: '😴', recipe: '歐洲赤松 5滴 + 迷迭香 3滴 + 甜橙 2滴', note: '' },
];

interface JournalEntry {
  date: string;
  emotion: string;
  emotionEmoji: string;
  recipe: string;
  note: string;
}

function loadJournalEntries(): JournalEntry[] {
  const entries: JournalEntry[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('journal_')) continue;
    try {
      const raw = JSON.parse(localStorage.getItem(key) || '');
      const emotion = raw.emotion as string;
      const emoji = moods.find((m) => m.label === emotion)?.emoji ?? '';
      const rx = prescriptions[emotion as Mood];
      const recipe = rx ? rx.oils.map((o) => `${o.name} ${o.drops}滴`).join(' + ') : '';
      entries.push({
        date: raw.date || key.replace('journal_', ''),
        emotion,
        emotionEmoji: emoji,
        recipe,
        note: raw.note || '',
      });
    } catch { /* skip invalid */ }
  }
  entries.sort((a, b) => b.date.localeCompare(a.date));
  return entries;
}

function formatJournalDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getMonth() + 1}月${d.getDate()}日 週${weekdays[d.getDay()]}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────
function formatDate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${year} 年 ${month} 月 ${day} 日　星期${weekdays[d.getDay()]}`;
}

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `journal_${y}-${m}-${day}`;
}

function emojiForMood(mood: Mood) {
  return moods.find((m) => m.label === mood)?.emoji ?? '';
}

// ─── Page transition wrapper ─────────────────────────────────────────
const pageVariants = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: -16, transition: { duration: 0.3, ease: 'easeIn' as const } },
};

// ─── Drop visualisation ─────────────────────────────────────────────
function DropDots({ count }: { count: number }) {
  return (
    <span className="inline-flex gap-1 ml-2">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: '#8FA886' }}
        />
      ))}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════
export default function FragranceApp() {
  const [page, setPage] = useState<Page>('checkin');
  const [selectedMood, setSelectedMood] = useState<Mood | null>(null);

  // Feature 1: Journal
  const [journalNote, setJournalNote] = useState('');
  const [journalSaved, setJournalSaved] = useState(false);

  // Feature 2: Oil info modal
  const [selectedOil, setSelectedOil] = useState<OilInfoData | null>(null);

  // Feature 3: Draw card
  const [drawnCard, setDrawnCard] = useState<DrawCard | null>(null);
  const [cardFlipped, setCardFlipped] = useState(false);

  function saveJournal() {
    if (!journalNote.trim() || !selectedMood) return;
    const key = todayKey();
    const data = { emotion: selectedMood, note: journalNote, date: new Date().toISOString().slice(0, 10) };
    localStorage.setItem(key, JSON.stringify(data));
    setJournalSaved(true);
    setTimeout(() => setJournalSaved(false), 2000);
  }

  function drawRandomCard() {
    setCardFlipped(false);
    setDrawnCard(null);
    setTimeout(() => {
      const card = drawCards[Math.floor(Math.random() * drawCards.length)];
      setDrawnCard(card);
      setTimeout(() => setCardFlipped(true), 100);
    }, 50);
  }

  // ── Page 1: Checkin ────────────────────────────────────────────────
  function CheckinPage() {
    return (
      <motion.div
        key="checkin"
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="flex flex-col items-center px-6 pt-12 pb-10"
      >
        {/* Header */}
        <h1
          className="text-3xl font-bold tracking-wide"
          style={{ color: '#8FA886' }}
        >
          即時共鳴
        </h1>
        <p className="mt-1 text-sm" style={{ color: '#C9A96E' }}>
          你的香氛日曆
        </p>
        <p className="mt-4 text-sm" style={{ color: '#999' }}>
          {formatDate()}
        </p>
        <p className="mt-6 text-lg font-medium" style={{ color: '#444' }}>
          今天，你感覺怎麼樣？
        </p>

        {/* Mood grid */}
        <div className="grid grid-cols-3 gap-4 mt-8 w-full max-w-xs">
          {moods.map((m) => {
            const active = selectedMood === m.label;
            return (
              <button
                key={m.label}
                onClick={() => setSelectedMood(m.label)}
                className="flex flex-col items-center justify-center rounded-3xl py-4 transition-all duration-200"
                style={{
                  backgroundColor: active ? '#EEF3EB' : '#FFFEF9',
                  border: active ? '2px solid #8FA886' : '2px solid transparent',
                  boxShadow: active
                    ? '0 2px 12px rgba(143,168,134,.25)'
                    : '0 1px 4px rgba(0,0,0,.06)',
                }}
              >
                <span className="text-3xl leading-none">{m.emoji}</span>
                <span
                  className="mt-2 text-xs font-medium"
                  style={{ color: active ? '#8FA886' : '#777' }}
                >
                  {m.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* CTA */}
        <AnimatePresence>
          {selectedMood && (
            <motion.button
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              onClick={() => setPage('prescription')}
              className="mt-8 w-full max-w-xs py-3.5 rounded-2xl text-white font-medium text-sm tracking-wide"
              style={{ backgroundColor: '#8FA886' }}
            >
              取得今日香氛處方 →
            </motion.button>
          )}
        </AnimatePresence>

        {/* Secondary nav */}
        <div className="mt-4 flex items-center gap-6">
          <button
            onClick={() => {
              setDrawnCard(null);
              setCardFlipped(false);
              setPage('draw');
            }}
            className="text-sm font-medium"
            style={{ color: '#8FA886' }}
          >
            🃏 今日抽卡
          </button>
          <button
            onClick={() => setPage('journal')}
            className="text-sm font-medium"
            style={{ color: '#8FA886' }}
          >
            📅 我的紀錄
          </button>
        </div>
      </motion.div>
    );
  }

  // ── Page 2: Prescription ───────────────────────────────────────────
  function PrescriptionPage() {
    if (!selectedMood) return null;
    const rx = prescriptions[selectedMood];

    return (
      <motion.div
        key="prescription"
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="flex flex-col items-center px-6 pt-10 pb-10"
      >
        <p className="text-sm font-medium" style={{ color: '#C9A96E' }}>
          今天的香氛處方
        </p>

        {/* Mood badge */}
        <div className="mt-4 flex items-center gap-2">
          <span className="text-4xl">{rx.emoji}</span>
          <span className="text-xl font-semibold" style={{ color: '#555' }}>
            {selectedMood}
          </span>
        </div>

        {/* Oil cards — clickable */}
        <div className="mt-8 w-full max-w-sm flex flex-col gap-3">
          {rx.oils.map((oil) => (
            <div
              key={oil.name}
              className="flex items-center justify-between rounded-2xl px-5 py-4"
              style={{
                backgroundColor: '#FFFEF9',
                boxShadow: '0 1px 6px rgba(0,0,0,.06)',
              }}
            >
              <button
                onClick={() => oilInfo[oil.name] && setSelectedOil(oilInfo[oil.name])}
                className="text-lg font-semibold flex items-center gap-1"
                style={{ color: '#444', borderBottom: oilInfo[oil.name] ? '1px dashed #8FA886' : 'none' }}
              >
                {oil.name}
                {oilInfo[oil.name] && <span className="text-xs" style={{ color: '#8FA886' }}>ℹ</span>}
              </button>
              <span className="flex items-center text-sm" style={{ color: '#8FA886' }}>
                {oil.drops} 滴
                <DropDots count={oil.drops} />
              </span>
            </div>
          ))}
        </div>

        {/* Quote */}
        <div
          className="mt-8 rounded-2xl px-6 py-5 w-full max-w-sm text-center"
          style={{
            backgroundColor: '#F5F1EB',
            color: '#6B6358',
          }}
        >
          <p className="text-sm leading-relaxed italic">「{rx.quote}」</p>
        </div>

        {/* Benefits */}
        <div className="mt-6 w-full max-w-sm flex gap-3">
          <div
            className="flex-1 rounded-2xl px-4 py-4"
            style={{ backgroundColor: '#FFFEF9', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}
          >
            <p className="text-xs font-semibold mb-1" style={{ color: '#8FA886' }}>
              心理
            </p>
            <p className="text-xs leading-relaxed" style={{ color: '#666' }}>
              {rx.mental}
            </p>
          </div>
          <div
            className="flex-1 rounded-2xl px-4 py-4"
            style={{ backgroundColor: '#FFFEF9', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}
          >
            <p className="text-xs font-semibold mb-1" style={{ color: '#C9A96E' }}>
              生理
            </p>
            <p className="text-xs leading-relaxed" style={{ color: '#666' }}>
              {rx.physical}
            </p>
          </div>
        </div>

        {/* Navigation */}
        <div className="mt-10 w-full max-w-sm flex flex-col gap-3">
          <button
            onClick={() => setPage('weekly')}
            className="w-full py-3.5 rounded-2xl text-white font-medium text-sm tracking-wide"
            style={{ backgroundColor: '#8FA886' }}
          >
            本週課程推薦 →
          </button>
          <button
            onClick={() => {
              setSelectedMood(null);
              setPage('checkin');
            }}
            className="w-full py-3 rounded-2xl text-sm font-medium"
            style={{ color: '#8FA886', backgroundColor: 'transparent' }}
          >
            ← 重新打卡
          </button>
        </div>

        {/* Feature 1: Journal */}
        <div
          className="mt-8 w-full max-w-sm rounded-2xl px-5 py-5"
          style={{ backgroundColor: '#FFFEF9', boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}
        >
          <p className="text-sm font-semibold mb-3" style={{ color: '#555' }}>
            📝 記下今天
          </p>
          <textarea
            rows={3}
            placeholder="今天的感受或想法..."
            value={journalNote}
            onChange={(e) => setJournalNote(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none"
            style={{
              backgroundColor: '#FAF8F5',
              border: '1px solid #E5E0D8',
              color: '#444',
            }}
          />
          <button
            onClick={saveJournal}
            className="mt-3 w-full py-3 rounded-2xl text-white text-sm font-medium"
            style={{ backgroundColor: '#8FA886' }}
          >
            儲存今天的心情
          </button>
          <AnimatePresence>
            {journalSaved && (
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-2 text-center text-sm"
                style={{ color: '#8FA886' }}
              >
                ✓ 已記下
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    );
  }

  // ── Page 3: Weekly report ──────────────────────────────────────────
  function WeeklyPage() {
    return (
      <motion.div
        key="weekly"
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="flex flex-col items-center px-6 pt-10 pb-10"
      >
        <p className="text-sm font-medium" style={{ color: '#C9A96E' }}>
          你這週的情緒地圖
        </p>

        {/* Timeline */}
        <div className="mt-8 w-full max-w-sm overflow-x-auto">
          <div className="flex justify-between min-w-[320px]">
            {weeklyData.map((d) => (
              <div key={d.day} className="flex flex-col items-center gap-1.5">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-xl"
                  style={{
                    backgroundColor: '#FFFEF9',
                    boxShadow: '0 1px 4px rgba(0,0,0,.06)',
                  }}
                >
                  {emojiForMood(d.mood)}
                </div>
                <span className="text-[11px]" style={{ color: '#999' }}>
                  週{d.day}
                </span>
                <span className="text-[10px] font-medium" style={{ color: '#666' }}>
                  {d.mood}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Summary card */}
        <div
          className="mt-8 w-full max-w-sm rounded-2xl px-5 py-5"
          style={{
            backgroundColor: '#FFFEF9',
            boxShadow: '0 1px 6px rgba(0,0,0,.06)',
          }}
        >
          <p className="text-sm leading-relaxed" style={{ color: '#555' }}>
            你這週主要感受是{' '}
            <strong style={{ color: '#8FA886' }}>焦慮與疲倦</strong>
          </p>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: '#777' }}>
            建議本週多使用{' '}
            <span style={{ color: '#C9A96E' }}>洋甘菊 + 歐洲赤松</span>
            ，幫助穩定與恢復能量
          </p>
        </div>

        {/* Course recommendation */}
        <div
          className="mt-5 w-full max-w-sm rounded-2xl px-5 py-5"
          style={{
            backgroundColor: '#EEF3EB',
            boxShadow: '0 1px 6px rgba(0,0,0,.05)',
          }}
        >
          <p className="text-sm leading-relaxed" style={{ color: '#555' }}>
            你這週偏緊繃，週末的調香體驗課很適合你
          </p>
          <p className="mt-2 text-xs" style={{ color: '#999' }}>
            西門壹號店 ｜ 漢口街2段121號
          </p>
          <button
            className="mt-4 w-full py-3 rounded-2xl text-white text-sm font-medium"
            style={{ backgroundColor: '#C9A96E' }}
          >
            立即查詢課程
          </button>
        </div>

        {/* Navigation */}
        <div className="mt-8 flex items-center gap-6">
          <button
            onClick={() => {
              setSelectedMood(null);
              setPage('checkin');
            }}
            className="text-sm font-medium"
            style={{ color: '#8FA886' }}
          >
            ← 回首頁
          </button>
          <button
            onClick={() => {
              setDrawnCard(null);
              setCardFlipped(false);
              setPage('draw');
            }}
            className="py-2.5 px-5 rounded-2xl text-white text-sm font-medium"
            style={{ backgroundColor: '#8FA886' }}
          >
            🃏 今日抽卡
          </button>
        </div>
      </motion.div>
    );
  }

  // ── Page 4: Draw card ──────────────────────────────────────────────
  function DrawPage() {
    return (
      <motion.div
        key="draw"
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="flex flex-col items-center px-6 pt-10 pb-10"
      >
        <h2 className="text-2xl font-bold" style={{ color: '#8FA886' }}>
          精油占卜
        </h2>
        <p className="mt-2 text-sm" style={{ color: '#999' }}>
          抽一張今天的香氣，讓它帶你一天
        </p>

        {/* Card area */}
        <div className="mt-10 w-full max-w-xs" style={{ perspective: '1000px' }}>
          <div
            className="relative w-full transition-transform duration-700"
            style={{
              transformStyle: 'preserve-3d',
              transform: cardFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              minHeight: drawnCard ? '380px' : '280px',
            }}
          >
            {/* Card back */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl"
              style={{
                backfaceVisibility: 'hidden',
                backgroundColor: '#EEF3EB',
                boxShadow: '0 4px 24px rgba(143,168,134,.2)',
                border: '2px solid #8FA886',
              }}
            >
              <span className="text-6xl mb-4">🌿</span>
              <p className="text-lg font-bold" style={{ color: '#8FA886' }}>即時共鳴</p>
              <p className="text-xs mt-1" style={{ color: '#999' }}>你的香氛日曆</p>
            </div>

            {/* Card front */}
            {drawnCard && (
              <div
                className={`absolute inset-0 flex flex-col items-center justify-center rounded-3xl px-6 py-6 bg-gradient-to-b ${drawnCard.color}`}
                style={{
                  backfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                  boxShadow: '0 4px 24px rgba(0,0,0,.1)',
                }}
              >
                <span className="text-6xl">{drawnCard.emoji}</span>
                <h3 className="mt-4 text-xl font-bold" style={{ color: '#444' }}>
                  {drawnCard.name}
                </h3>
                <p
                  className="mt-4 text-sm leading-relaxed italic text-center px-2"
                  style={{ color: '#6B6358' }}
                >
                  「{drawnCard.ritual}」
                </p>
                <div
                  className="mt-5 rounded-xl px-4 py-3 w-full text-center"
                  style={{ backgroundColor: 'rgba(255,255,255,.6)' }}
                >
                  <p className="text-xs font-semibold mb-1" style={{ color: '#8FA886' }}>配方</p>
                  <p className="text-sm" style={{ color: '#555' }}>{drawnCard.recipe}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-8 w-full max-w-xs flex flex-col gap-3">
          <button
            onClick={drawRandomCard}
            className="w-full py-3.5 rounded-2xl text-white font-medium text-sm tracking-wide"
            style={{ backgroundColor: '#8FA886' }}
          >
            {cardFlipped ? '🔄 再抽一次' : '✨ 抽出今日香氛'}
          </button>
          <button
            onClick={() => {
              setSelectedMood(null);
              setPage('checkin');
            }}
            className="w-full py-3 rounded-2xl text-sm font-medium"
            style={{ color: '#8FA886', backgroundColor: 'transparent' }}
          >
            ← 回首頁
          </button>
        </div>
      </motion.div>
    );
  }

  // ── Page 5: Journal history ───────────────────────────────────────
  function JournalPage() {
    const realEntries = loadJournalEntries();
    const entries = realEntries.length > 0 ? realEntries : (DEMO_MODE ? demoJournalEntries : []);

    return (
      <motion.div
        key="journal"
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="flex flex-col items-center px-6 pt-10 pb-10"
      >
        <h2 className="text-2xl font-bold" style={{ color: '#8FA886' }}>
          我的香氛日記 🌿
        </h2>
        <p className="mt-2 text-sm" style={{ color: '#999' }}>
          每一天的情緒，都是你認識自己的一步
        </p>

        {entries.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-4">
            <span className="text-6xl">🌱</span>
            <p className="text-sm" style={{ color: '#999' }}>
              還沒有記錄，今天先打一張卡吧
            </p>
            <button
              onClick={() => {
                setSelectedMood(null);
                setPage('checkin');
              }}
              className="mt-2 py-3 px-8 rounded-2xl text-white text-sm font-medium"
              style={{ backgroundColor: '#8FA886' }}
            >
              去打卡 →
            </button>
          </div>
        ) : (
          <div className="mt-8 w-full max-w-sm flex flex-col gap-4">
            {entries.map((entry) => (
              <div
                key={entry.date}
                className="rounded-2xl px-5 py-4"
                style={{
                  backgroundColor: '#FFFEF9',
                  boxShadow: '0 1px 6px rgba(0,0,0,.06)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold" style={{ color: '#444' }}>
                    {formatJournalDate(entry.date)}
                  </span>
                  <span className="text-sm">
                    {entry.emotionEmoji} {entry.emotion}
                  </span>
                </div>
                <p className="mt-2 text-xs" style={{ color: '#8FA886' }}>
                  今日配方：{entry.recipe}
                </p>
                {entry.note && (
                  <>
                    <div className="mt-3 border-t" style={{ borderColor: '#E5E0D8' }} />
                    <p className="mt-3 text-sm leading-relaxed" style={{ color: '#777' }}>
                      {entry.note}
                    </p>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => {
            setSelectedMood(null);
            setPage('checkin');
          }}
          className="mt-10 text-sm font-medium"
          style={{ color: '#8FA886' }}
        >
          ← 回首頁
        </button>
      </motion.div>
    );
  }

  // ── Oil Info Modal (Feature 2) ─────────────────────────────────────
  function OilModal() {
    if (!selectedOil) return null;
    return (
      <AnimatePresence>
        <motion.div
          key="oil-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setSelectedOil(null)}
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,.35)' }}
        >
          <motion.div
            key="oil-modal-content"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[430px] rounded-t-3xl px-6 pt-5 pb-8 overflow-y-auto"
            style={{ backgroundColor: '#FFFEF9', maxHeight: '85vh' }}
          >
            {/* Close button */}
            <button
              onClick={() => setSelectedOil(null)}
              className="absolute top-4 right-5 text-lg"
              style={{ color: '#999' }}
            >
              ✕
            </button>

            {/* Title */}
            <h3 className="text-2xl font-bold" style={{ color: '#444' }}>
              {selectedOil.chName}
            </h3>
            <p className="text-sm mt-1" style={{ color: '#999' }}>
              {selectedOil.enName}　·　{selectedOil.family}
            </p>

            {/* Aroma */}
            <div className="mt-5 rounded-2xl px-4 py-4" style={{ backgroundColor: '#F5F1EB' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: '#C9A96E' }}>香氣</p>
              <p className="text-sm leading-relaxed" style={{ color: '#6B6358' }}>{selectedOil.aroma}</p>
            </div>

            {/* Psychology */}
            <div className="mt-3 rounded-2xl px-4 py-4" style={{ backgroundColor: '#EEF3EB' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: '#8FA886' }}>🧠 心理功效</p>
              <p className="text-sm leading-relaxed" style={{ color: '#555' }}>{selectedOil.psychology}</p>
            </div>

            {/* Physiology */}
            <div className="mt-3 rounded-2xl px-4 py-4" style={{ backgroundColor: '#EEF3EB' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: '#8FA886' }}>🫀 生理功效</p>
              <p className="text-sm leading-relaxed" style={{ color: '#555' }}>{selectedOil.physiology}</p>
            </div>

            {/* Caution */}
            <div className="mt-3 rounded-2xl px-4 py-4" style={{ backgroundColor: '#FFF8F0' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: '#C9A96E' }}>⚠️ 注意事項</p>
              <p className="text-sm leading-relaxed" style={{ color: '#777' }}>{selectedOil.caution}</p>
            </div>

            {/* Pairing */}
            <div className="mt-3 rounded-2xl px-4 py-4" style={{ backgroundColor: '#FFFEF9', border: '1px solid #E5E0D8' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: '#8FA886' }}>推薦搭配</p>
              <p className="text-sm leading-relaxed" style={{ color: '#555' }}>{selectedOil.pairing}</p>
            </div>

            {/* Back button */}
            <button
              onClick={() => setSelectedOil(null)}
              className="mt-6 w-full py-3 rounded-2xl text-sm font-medium"
              style={{ color: '#8FA886', backgroundColor: '#EEF3EB' }}
            >
              ← 回到處方
            </button>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen flex justify-center"
      style={{
        backgroundColor: '#FAF8F5',
        fontFamily:
          '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
      }}
    >
      <div className="w-full max-w-[430px]">
        <AnimatePresence mode="wait">
          {page === 'checkin' && <CheckinPage />}
          {page === 'prescription' && <PrescriptionPage />}
          {page === 'weekly' && <WeeklyPage />}
          {page === 'draw' && <DrawPage />}
          {page === 'journal' && <JournalPage />}
        </AnimatePresence>
      </div>

      {/* Oil info modal overlay */}
      <OilModal />
    </div>
  );
}
