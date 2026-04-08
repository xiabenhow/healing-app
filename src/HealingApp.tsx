import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs, query, orderBy, Timestamp, addDoc, where, updateDoc, deleteDoc, increment, onSnapshot, limit as fsLimit } from 'firebase/firestore';
import { auth, googleProvider, db } from './lib/firebase';
import { uploadImage, uploadImages } from './lib/imageUtils';
import { isNative, initNativeApp, openPaymentUrl, openUrl, hapticLight, hapticSuccess, takePhoto, pickPhotos } from './capacitorHelpers';
import { usePWA } from './usePWA';
import { OIL_LIBRARY, FAMILY_EMOJI, type OilLibraryItem } from './oilLibraryData';
import { CRYSTAL_LIBRARY, CHAKRA_EMOJI, EMOTION_CRYSTAL_MAP, type CrystalItem } from './crystalData';
import {
  type EmotionKey, type EmotionLevel, type MainEmotion,
  MAIN_EMOTIONS,
  getHealingData, getMainEmotion, getRandomWarmMessage, getRandomNightFeedback,
} from './emotionHealingData';
import {
  SCAPE_PRESETS as SCAPE_PRESETS_IMPORT,
  CRYSTAL_BOWL_PRESETS,
  EMOTION_WELLNESS_MAP,
  SCENE_MODES,
  type SceneMode,
  useSoundscape as useSoundscapeHook,
} from './soundscapeEngine';
import {
  HEALING_PATHS,
  LIBRARY_SOUNDS,
  LIBRARY_PRACTICES,
  LIBRARY_ARTICLES,
  type HealingPath,
  type LibraryArticle,
  type LibrarySoundItem,
  type LibraryPractice,
} from './healingLibraryData';
import {
  HEALING_CARDS,
  CARD_COLOR_CONFIG,
  drawRandomCard,
  drawCardByColor,
  getAllColors,
  type HealingCard,
  type CardColor,
} from './healingCardsData';


// ===================== CONSTANTS =====================
const ADMIN_EMAIL = 'xiabenhow@gmail.com';

// ===================== TYPES =====================

type PageType = 'home' | 'diary' | 'recipe' | 'card' | 'healer' | 'library' | 'calendar' | 'sound' | 'booking' | 'member' | 'shop' | 'healing' | 'bedtime' | 'custom' | 'service' | 'wishlist' | 'my-works' | 'collections' | 'course-journey' | 'exclusive-content' | 'community' | 'explore' | 'journal' | 'admin-dashboard' | 'ebook' | 'ebook-checkout' | 'xia-tasks' | 'crystal-energy' | 'plant-care' | 'oil-wiki' | 'ai-cs';
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
  virtual: boolean;
  categories?: { id: number; name: string }[];
  stock_quantity: number | null;
  stock_status: string;
  manage_stock: boolean;
  attributes?: { id: number; name: string; options: string[]; variation: boolean }[];
  meta_data?: { key: string; value: unknown }[];
}

interface HealingRecord {
  date: string;
  emotion: EmotionKey;
  level?: EmotionLevel;
  subEmotion?: string;
  note?: string;
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


// CardInfo 已移至 healingCardsData.ts (HealingCard interface)

interface OrderItem {
  id: number;
  date: string;
  status: string;
  total: number;
}

// 心情日記條目
interface MoodDiaryEntry {
  id?: string;
  emotion: EmotionKey;
  note: string;
  timestamp: number; // Date.now()
  date: string; // YYYY-MM-DD
  recommendedOils?: string[];
}

// Wishlist / 我的陪伴清單
type WishlistTag = '想上的課' | '想帶回家的香氣' | '想送的禮物' | '晚點再決定';

interface WishlistItem {
  productId: number;
  name: string;
  price: string;
  image?: string;
  tag: WishlistTag;
  addedAt: number;
}

const WISHLIST_TAGS: { key: WishlistTag; emoji: string }[] = [
  { key: '想上的課', emoji: '🎨' },
  { key: '想帶回家的香氣', emoji: '🕯️' },
  { key: '想送的禮物', emoji: '🎁' },
  { key: '晚點再決定', emoji: '💭' },
];

function loadWishlist(): WishlistItem[] {
  try {
    const raw = localStorage.getItem('healing_wishlist');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveWishlist(items: WishlistItem[]) {
  localStorage.setItem('healing_wishlist', JSON.stringify(items));
  saveWishlistToFirestore(items);
}
function isInWishlist(productId: number): boolean {
  return loadWishlist().some(w => w.productId === productId);
}

// ===================== 陪伴能量 COMPANION ENERGY =====================

type EnergyActionType = 'checkin' | 'note' | 'sound' | 'bedtime';

interface EnergyLog {
  date: string; // YYYY-MM-DD
  action: EnergyActionType;
  points: number;
  label: string;
  timestamp: number;
}

interface CompanionCoupon {
  id: string;
  type: 'small_heart' | 'warm_return' | 'scent_companion' | 'healing_time' | 'unconditional';
  name: string;
  emoji: string;
  discount: number;         // NT$ discount amount
  description: string;      // warm brand copy
  thresholdEnergy: number;  // energy needed to unlock
  unlockedAt: number;       // timestamp when unlocked, 0 = not yet
  usedAt: number;           // timestamp when used, 0 = not yet
  applicableTo?: string;    // restriction text, e.g. "精油調香課程" or "任一課程"
}

interface EnergyState {
  totalEnergy: number;
  logs: EnergyLog[];
  coupons: CompanionCoupon[];
  streakDays: number;       // current consecutive check-in streak for energy
  lastCheckinDate: string;  // YYYY-MM-DD
}

const ENERGY_ACTIONS: Record<EnergyActionType, { label: string; emoji: string }> = {
  checkin: { label: '情緒打卡', emoji: '🌅' },
  note: { label: '寫一則筆記', emoji: '📝' },
  sound: { label: '聆聽音景', emoji: '🎧' },
  bedtime: { label: '睡前陪伴', emoji: '🌙' },
};

const COUPON_TIERS: Omit<CompanionCoupon, 'id' | 'unlockedAt' | 'usedAt'>[] = [
  {
    type: 'small_heart',
    name: '一點小心意',
    emoji: '🌿',
    discount: 30,
    description: '這幾天你有好好陪自己，這是一點小小心意。',
    thresholdEnergy: 10,
    applicableTo: '全館商品',
  },
  {
    type: 'warm_return',
    name: '溫柔的回饋',
    emoji: '🕯️',
    discount: 60,
    description: '你的堅持被看見了，讓我陪你做點什麼。',
    thresholdEnergy: 20,
    applicableTo: '全館商品',
  },
  {
    type: 'scent_companion',
    name: '香氛陪伴券',
    emoji: '🌸',
    discount: 100,
    description: '累積了這麼多溫柔，送你一段香氣時光。',
    thresholdEnergy: 30,
    applicableTo: '精油調香體驗',
  },
  {
    type: 'healing_time',
    name: '療癒時光券',
    emoji: '✨',
    discount: 150,
    description: '你值得一段完整的療癒時光，這是我們的心意。',
    thresholdEnergy: 50,
    applicableTo: '任一課程',
  },
  {
    type: 'unconditional',
    name: '無條件陪伴券',
    emoji: '💛',
    discount: 300,
    description: '謝謝你一直在，這份陪伴沒有條件。',
    thresholdEnergy: 100,
    applicableTo: '任一課程',
  },
];

// localStorage helpers for energy
function loadEnergy(): EnergyState {
  try {
    const raw = localStorage.getItem('healing_energy');
    return raw ? JSON.parse(raw) : { totalEnergy: 0, logs: [], coupons: [], streakDays: 0, lastCheckinDate: '' };
  } catch { return { totalEnergy: 0, logs: [], coupons: [], streakDays: 0, lastCheckinDate: '' }; }
}

function saveEnergy(state: EnergyState) {
  localStorage.setItem('healing_energy', JSON.stringify(state));
  try {
    const u = auth.currentUser;
    if (u) setDoc(doc(db, 'user_data', u.uid), { energy: JSON.parse(JSON.stringify(state)) }, { merge: true }).catch(e => console.error('[Firestore] saveEnergy failed:', e));
  } catch (e) { console.error('[Firestore] saveEnergy sync error:', e); }
}

/** inline date formatter to avoid hoisting issues */
function _energyToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Record an energy-earning action. Returns the updated state + points earned (0 if already done today). */
function earnEnergy(action: EnergyActionType): { state: EnergyState; earned: number } {
  const state = loadEnergy();
  const today = _energyToday();
  // Check if already earned for this action today
  const alreadyDone = state.logs.some(l => l.date === today && l.action === action);
  if (alreadyDone) return { state, earned: 0 };

  const info = ENERGY_ACTIONS[action];
  const log: EnergyLog = {
    date: today,
    action,
    points: 1,
    label: info.label,
    timestamp: Date.now(),
  };
  state.logs.push(log);
  state.totalEnergy += 1;

  // Streak logic for check-in
  if (action === 'checkin') {
    const yd = new Date(Date.now() - 86400000);
    const yesterday = `${yd.getFullYear()}-${String(yd.getMonth() + 1).padStart(2, '0')}-${String(yd.getDate()).padStart(2, '0')}`;
    if (state.lastCheckinDate === yesterday) {
      state.streakDays += 1;
    } else if (state.lastCheckinDate !== today) {
      state.streakDays = 1;
    }
    state.lastCheckinDate = today;

    // Streak bonuses
    if (state.streakDays === 3) {
      const bonusLog: EnergyLog = { date: today, action: 'checkin', points: 2, label: '連續簽到 3 天獎勵', timestamp: Date.now() };
      state.logs.push(bonusLog);
      state.totalEnergy += 2;
    }
    if (state.streakDays === 7) {
      const bonusLog: EnergyLog = { date: today, action: 'checkin', points: 5, label: '連續簽到 7 天獎勵', timestamp: Date.now() };
      state.logs.push(bonusLog);
      state.totalEnergy += 5;
    }
  }

  // Check if new coupons should be unlocked
  for (const tier of COUPON_TIERS) {
    const alreadyHas = state.coupons.some(c => c.type === tier.type);
    if (!alreadyHas && state.totalEnergy >= tier.thresholdEnergy) {
      state.coupons.push({
        ...tier,
        id: `coupon_${tier.type}_${Date.now()}`,
        unlockedAt: Date.now(),
        usedAt: 0,
      });
    }
  }

  saveEnergy(state);
  return { state, earned: 1 };
}

function getAvailableCoupons(): CompanionCoupon[] {
  const state = loadEnergy();
  return state.coupons.filter(c => c.unlockedAt > 0 && c.usedAt === 0);
}

function useCoupon(couponId: string): boolean {
  const state = loadEnergy();
  const coupon = state.coupons.find(c => c.id === couponId);
  if (!coupon || coupon.usedAt > 0) return false;
  coupon.usedAt = Date.now();
  saveEnergy(state);
  return true;
}

function getBestCouponForAmount(amount: number): CompanionCoupon | null {
  const available = getAvailableCoupons();
  // Find the highest-value coupon that doesn't exceed the order amount
  const eligible = available.filter(c => c.discount <= amount);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, c) => c.discount > best.discount ? c : best, eligible[0]);
}

// 服務大廳分類資料
interface ServiceQuickItem {
  q: string;
  a: string;
  navigateTo?: PageType;
  shopCategory?: number; // jump to shop with specific category
}

interface ServiceCategory {
  id: string;
  emoji: string;
  title: string;
  sub: string;
  quickItems: ServiceQuickItem[];
  navigateTo?: PageType;
}

const SERVICE_CATEGORIES: ServiceCategory[] = [
  {
    id: 'course', emoji: '🎨', title: '我想看看課程',
    sub: '手作、調香、花藝⋯⋯找到適合你的體驗',
    quickItems: [
      {
        q: '挑選課程',
        a: '',
        navigateTo: 'shop',
      },
      {
        q: '適合新手嗎',
        a: '完全適合。我們的課程分成「平板自己做」和「老師教我做」兩種。平板自己做是跟著平板教學一步一步來，到目前為止還沒有人失敗過。老師教我做則有專業老師全程帶著你，不需要任何基礎，放心來就好。',
      },
      {
        q: '一個人可以參加嗎',
        a: '當然可以，很多人都是自己來的。一個人安靜地做手作，其實是很療癒的事。如果有朋友想陪但不想做，也可以，陪同費是 NT$199。',
      },
      {
        q: '有哪些城市可以上課',
        a: '目前在台北（萬華區漢口街二段121號，西門壹號店）、台中、高雄都有課程。台北是我們的主要據點，每天 10:00-22:00 都有開課。台中和高雄的課程種類可能會少一些，建議來之前先確認一下。',
      },
      {
        q: '如何改期或取消',
        a: '改期的話，請提前 3 天聯繫我們（LINE 或電話 02-2371-4171），每次預約可以改期一次，需在兩個月內重新選時間。取消退費的話：60 天前退 95%、8-59 天前退 90%、1-7 天前退 80%。當天就沒辦法退費或改期了，因為老師已經準備好了。',
      },
      {
        q: '今天還可以預約嗎',
        a: '可以試試看！如果是當天或前一天預約，建議先打電話（02-2371-4171）或 LINE 確認是否還有名額。有空位的話當天也能直接來。遲到超過 15 分鐘沒通知的話，位子就會被取消喔。',
      },
      {
        q: '課程大概多久',
        a: '大部分課程在 1-2 小時左右，看你選的項目和做的速度。水晶手鍊大約 1-1.5 小時，蠟燭和花藝大約 1.5-2 小時。不用趕，慢慢做就好。',
      },
      {
        q: '價位大概多少',
        a: '課程價格從 NT$490 到 NT$3,680 不等，大部分熱門課程落在 NT$590-NT$1,380 之間。價格已經包含所有材料費和教學，不會有額外費用。做完的成品可以直接帶走。',
      },
    ],
  },
  {
    id: 'scent', emoji: '🌿', title: '我想找香氣',
    sub: '不確定也沒關係，從感覺開始就好',
    quickItems: [
      {
        q: '不知道選什麼，想有人陪我挑',
        a: '沒關係，很多人一開始也不確定。你可以到商城逛逛，我們有依照情緒分類的入口（想放鬆、想好睡、穩定情緒⋯⋯），從你現在的感覺出發就好。如果還是不確定，也可以直接 LINE 我們，有人可以陪你聊。',
      },
      {
        q: '想找放鬆的香氣',
        a: '推薦可以看看薰衣草、佛手柑、雪松、檀香類的精油或擴香商品。我們也有調香體驗課，可以現場聞過之後，調一瓶最適合你的。如果想在家慢慢用，商城裡有擴香石、蠟燭、精油可以選。',
        shopCategory: 173,
      },
      {
        q: '想找適合送禮的',
        a: '商城裡有禮盒組合可以看看，包含蠟燭禮盒、擴香禮盒、手作體驗禮券等。如果想更有心意，也可以帶對方一起來上課，做一份獨一無二的禮物。體驗課程也可以買課程券當禮物送人。',
      },
      {
        q: '精油和擴香怎麼用',
        a: '精油可以搭配擴香儀或擴香石使用，滴 3-5 滴讓香氣自然散開。擴香石放在桌上或枕邊，精油滴上去就好，不需要插電。蠟燭的話點燃 1-2 小時就能讓空間充滿香氣。第一次用的話建議從擴香石開始，最簡單。',
      },
      {
        q: '想做一瓶專屬的',
        a: '可以來上精油調香課（分類：精油調香），由調香師帶著你，從幾十種精油裡挑選你喜歡的味道，調出一瓶只屬於你的香氛。也可以在 App 裡用「調一瓶更像你的」功能，根據你的情緒狀態讓調香師為你量身配方。',
      },
    ],
  },
  {
    id: 'companion', emoji: '🤲', title: '找適合我的陪伴',
    sub: '不用整理好自己，從最接近感受的方向開始',
    navigateTo: 'home',
    quickItems: [
      {
        q: '我現在壓力蠻大的',
        a: '辛苦了。如果你現在只是想喘口氣，可以先試試 App 裡的「聆聽」功能，有海浪、雨聲、森林的聲音可以陪你。如果想動手轉移注意力，蠟燭課和調香課都蠻適合的，專注在手上的事情，壓力會慢慢鬆開。',
      },
      {
        q: '想動手做點什麼',
        a: '太好了！我們有很多可以動手的選擇：水晶手鍊（挑珠子、串珠子的過程很療癒）、蠟燭（倒蠟、調色）、花藝（跟花相處）、皮革（敲打裁切）。如果想在家做，也有 DIY 材料包可以寄到家裡，慢慢來就好。',
      },
      {
        q: '想找安靜的方式',
        a: '試試 App 裡的「聆聽」和「陪伴卡」功能，不需要說話、不需要社交，就是安靜陪著你。如果想出門但不想太多人，可以選平日白天來上平板自己做的課，跟著平板教學，安安靜靜地完成一件作品。',
      },
      {
        q: '不太確定我需要什麼',
        a: '不確定也沒關係，你可以先回到首頁做個情緒打卡，App 會根據你今天的感受，給你一些方向建議。不用想得很清楚，從最接近你現在感覺的選項開始就好。',
      },
      {
        q: '想找人說說話',
        a: '如果想聊聊，可以直接 LINE 我們（底下有按鈕），不一定要問什麼具體問題，想說就說。如果你覺得需要更專業的傾聽，我們也可以幫你推薦適合的資源。',
      },
    ],
  },
  {
    id: 'order', emoji: '📦', title: '查看訂單或預約',
    sub: '看看你之前的訂單、預約狀態',
    navigateTo: 'member',
    quickItems: [
      {
        q: '我的訂單在哪裡',
        a: '登入會員後，在「我的」頁面就可以看到你的訂單記錄。也可以到官網 xiabenhow.com 登入「我的帳號」查看更詳細的訂單狀態。',
      },
      {
        q: '想改預約時間',
        a: '請提前 3 天聯繫我們，每筆預約可以改期一次，需在 2 個月內選新時間。聯繫方式：LINE 官方帳號或電話 02-2371-4171。當天是沒辦法改期的喔。',
      },
      {
        q: '東西還沒收到',
        a: '商品出貨後通常 1-3 個工作天會到。如果超過 5 天還沒收到，請 LINE 或來電告訴我們你的訂單編號，我們幫你查。如果是超商取貨，記得到指定門市領取，有 7 天的領取期限。',
      },
      {
        q: '想看物流進度',
        a: '出貨後會寄送通知到你的 email，裡面有物流追蹤編號。如果沒收到通知，可以在官網「我的帳號」裡查看訂單狀態，或直接 LINE 我們提供訂單號碼，幫你查進度。',
      },
    ],
  },
  {
    id: 'after', emoji: '💬', title: '售後問題',
    sub: '有什麼不對勁，讓我們知道',
    quickItems: [
      {
        q: '商品有狀況',
        a: '收到商品如果有任何問題（破損、漏液、跟預期不一樣），請在收到後 7 天內 LINE 我們，附上照片說明狀況，我們會盡快幫你處理。手作商品和客製品因為是獨一無二的，可能會有些手工痕跡，這是正常的。',
      },
      {
        q: '想退換貨',
        a: '收到商品後 7 天內可以申請退換貨。不過客製品和手作品因為是個人化商品，不接受無理由退貨。一般商品退貨請保持原包裝完整。超過 7 天或不符合退貨條件的話，我們可能沒辦法受理，所以建議購買前先跟我們確認喔。',
      },
      {
        q: '發票問題',
        a: '我們開立的是電子發票，會寄到你結帳時填的 email。如果需要公司統編發票，結帳時記得填寫統一編號和公司名稱。如果發票沒收到或需要補開，請 LINE 我們提供訂單編號。',
      },
      {
        q: '寄送問題',
        a: '我們支援超商取貨（7-11、全家、萊爾富）和宅配。下單後通常 1-3 個工作天出貨。超商取貨有 7 天領取期限，過期會被退回。如果指定地址有誤需要改，請在出貨前趕快 LINE 我們。',
      },
    ],
  },
  {
    id: 'team', emoji: '👥', title: '企業 / 團隊方案',
    sub: '用手作和香氣，陪你的團隊喘口氣',
    quickItems: [
      {
        q: '想辦團隊活動',
        a: '我們已經辦過將近 5,000 場企業手作活動，合作客戶涵蓋 Google、保時捷、南山人壽等知名品牌。17 大類、100 多種課程可選，門市最多容納 65 人，也可派老師至全台各地現場服務。活動價格依人數和課程而定，基本從 NT$690/人起。請 LINE 或 email 告訴我們人數、預算和偏好，我們幫你規劃。',
      },
      {
        q: '大量訂購',
        a: '禮盒、蠟燭、擴香等商品都可以大量訂購，30 份以上有優惠價。可客製包裝、加印 LOGO、選香味。詳細報價請 email（xiabenhow@gmail.com）或 LINE 提供品項、數量、交期需求。',
      },
    ],
  },
  {
    id: 'other', emoji: '🌸', title: '其他',
    sub: '不在上面也沒關係，從這裡開始',
    quickItems: [
      {
        q: '我想合作',
        a: '歡迎！不管是品牌聯名、場地合作、內容合作、KOL 體驗邀約，都可以 email 到 xiabenhow@gmail.com，標題寫「合作洽詢」加上你的品牌或名稱，我們會盡快回覆。',
      },
      {
        q: '有建議想說',
        a: '我們很想聽你的想法。任何使用上的感受、覺得可以更好的地方、或是你希望有什麼新功能，都可以 LINE 告訴我們，或直接在這裡留言。每一個意見我們都會看到。',
      },
      {
        q: '想了解更多品牌故事',
        a: '下班隨手作從一間小小的手作教室開始，希望讓忙碌的人下班後有個地方可以慢下來、用雙手做點什麼。現在我們在台北、台中、高雄都有據點，超過 100 種課程，辦了近千場企業活動。不管你是想放鬆、想學東西、還是想找一個安靜的角落，這裡都歡迎你。',
      },
    ],
  },
];

// 情緒→商品推薦對應
const EMOTION_PRODUCT_SUGGESTIONS: Record<string, { title: string; desc: string; categoryId: number; emoji: string }[]> = {
  anxious: [
    { title: '精油調香體驗', desc: '用香氣讓思緒慢下來', categoryId: 173, emoji: '🌿' },
    { title: 'DIY 蠟燭', desc: '專注在手上的溫度', categoryId: 18, emoji: '🕯️' },
  ],
  sad: [
    { title: '花藝手作', desc: '被花和色彩圍繞一下', categoryId: 25, emoji: '💐' },
    { title: '多肉植栽', desc: '照顧一個小小的生命', categoryId: 22, emoji: '🌱' },
  ],
  angry: [
    { title: '皮革手作', desc: '把力氣放進敲打裡', categoryId: 212, emoji: '🔨' },
    { title: '畫畫體驗', desc: '不用說話，用顏色表達', categoryId: 24, emoji: '🎨' },
  ],
  tired: [
    { title: '精油調香', desc: '調一瓶陪你休息的香氣', categoryId: 173, emoji: '🌿' },
    { title: 'DIY 材料包', desc: '在家慢慢做，不趕時間', categoryId: 75, emoji: '📦' },
  ],
  lonely: [
    { title: '手作飾品體驗', desc: '做一個陪你的小東西', categoryId: 21, emoji: '💍' },
    { title: '蠟燭課程', desc: '安靜的空間，有人在旁邊', categoryId: 18, emoji: '🕯️' },
  ],
  happy: [
    { title: '把我帶回家', desc: '把這份好心情延續下去', categoryId: 27, emoji: '🏠' },
    { title: '送禮選物', desc: '把快樂分享給重要的人', categoryId: 27, emoji: '🎁' },
  ],
  numb: [
    { title: '多肉植栽', desc: '不需要感覺什麼，先碰碰泥土', categoryId: 22, emoji: '🌱' },
    { title: 'DIY 材料包', desc: '讓手先動起來就好', categoryId: 75, emoji: '📦' },
  ],
  confused: [
    { title: '精油調香', desc: '用嗅覺幫思緒找到方向', categoryId: 173, emoji: '🌿' },
    { title: '畫畫體驗', desc: '不用想清楚，先畫就好', categoryId: 24, emoji: '🎨' },
  ],
};

// 動手做一點什麼 - 情境卡資料
const HANDS_ON_CARDS = [
  { emoji: '🕯️', title: '點一盞光', desc: '做一支蠟燭，讓今天慢慢有了氣味', categoryId: 18 },
  { emoji: '🌿', title: '調一瓶香氣', desc: '選一個，今天想靠近的味道', categoryId: 173 },
  { emoji: '🌱', title: '種一棵小植物', desc: '替它留一點水，也替自己留一點心', categoryId: 22 },
  { emoji: '💍', title: '做一個小飾品', desc: '做一個小東西，安靜陪在你身邊', categoryId: 21 },
  { emoji: '🎨', title: '畫點什麼', desc: '今天不用畫得很好，動筆就很好', categoryId: 24 },
  { emoji: '💐', title: '插一束花', desc: '替今天的空間，放進一點新的呼吸', categoryId: 25 },
  { emoji: '📦', title: '在家做', desc: '把材料帶回家，照自己的步調慢慢做', categoryId: 75 },
];

// ===================== CONSTANTS =====================


const DAILY_QUOTES = [
  '今天不用把所有事都解決。',
  '慢下來的時候，比較聽得見自己。',
  '今天你來了，這樣就很好。',
  '今天有什麼感覺，都可以先放在這裡。',
  '今天不完美，也還是今天。',
  '就算今天不這麼覺得，你也還是你。',
  '先深呼吸一下，其他的晚一點再說。',
  '你來了，這裡就在。',
  '今天不用很厲害，安穩就好。',
];

const MICRO_TASKS = [
  '先陪自己呼吸三次。慢慢吸，慢慢吐。',
  '把肩膀放下來，先讓身體回來。',
  '倒一杯溫水，讓今天慢一點。',
  '閉上眼睛，先回到一個安心的地方。',
  '伸展一下，讓身體先鬆開。',
];

// --- NEW: Daily Task System ---
const TASK_LABELS: Record<TaskKey, string> = {
  checkin: '跟今天的自己碰個面',
  card: '翻一張，今天的卡',
  note: '留一句話給自己',
  breathe: '陪自己呼吸一下',
  evening: '替今天收個尾',
  share: '把這份感覺送出去',
};

const TASK_KEYS: TaskKey[] = ['checkin', 'card', 'note', 'breathe', 'evening', 'share'];

// --- NEW: Evening Feedback Responses ---
const EVENING_RESPONSES: Record<string, string> = {
  better: '真好，今晚把這份感覺帶去睡吧。',
  little: '一點點也很好，今天就先到這裡。',
  same: '沒關係，今天就先這樣也可以。',
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

// CARDS 已移至 healingCardsData.ts (HEALING_CARDS)



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
      level: record.level || 'L1',
      subEmotion: record.subEmotion || null,
      note: record.note || null,
      createdAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error saving record to Firestore:', error);
  }
};

// ===================== 心情日記 Firestore =====================
const saveMoodDiary = async (userId: string, entry: MoodDiaryEntry): Promise<string | null> => {
  try {
    const colRef = collection(db, `mood_diaries`);
    const docRef = await addDoc(colRef, {
      userId,
      emotion: entry.emotion,
      note: entry.note,
      timestamp: entry.timestamp,
      date: entry.date,
      recommendedOils: entry.recommendedOils || [],
      createdAt: Timestamp.now(),
    });
    return docRef.id;
  } catch (error) {
    console.error('儲存心情日記失敗:', error);
    return null;
  }
};

const loadMoodDiaries = async (userId: string, date?: string): Promise<MoodDiaryEntry[]> => {
  try {
    const colRef = collection(db, 'mood_diaries');
    let q;
    if (date) {
      q = query(colRef, where('userId', '==', userId), where('date', '==', date), orderBy('timestamp', 'desc'));
    } else {
      q = query(colRef, where('userId', '==', userId), orderBy('timestamp', 'desc'));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({
      id: d.id,
      emotion: d.data().emotion,
      note: d.data().note,
      timestamp: d.data().timestamp,
      date: d.data().date,
      recommendedOils: d.data().recommendedOils || [],
    }));
  } catch (error) {
    console.error('載入心情日記失敗:', error);
    return [];
  }
};

// 根據情緒推薦精油
const getOilRecommendation = (emotion: EmotionKey): { oils: string[]; description: string } => {
  const healingData = getHealingData(emotion, 'L2');
  if (healingData) {
    return {
      oils: healingData.blend.oils,
      description: healingData.blend.note,
    };
  }
  return { oils: ['薰衣草', '甜橙', '乳香'], description: '基礎放鬆配方' };
};

const loadSavedCards = (): string[] => {
  try {
    const data = localStorage.getItem('healing_cards_v2');
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const saveSavedCards = (cards: string[]): void => {
  localStorage.setItem('healing_cards_v2', JSON.stringify(cards));
  // Also sync to Firestore if user is logged in
  try {
    const u = auth.currentUser;
    if (u) setDoc(doc(db, 'user_data', u.uid), { savedCards: cards }, { merge: true }).catch(e => console.error('[Firestore] write:', e));
  } catch {}
};

// Load saved cards from Firestore (call on auth)
const loadSavedCardsFromFirestore = async (uid: string): Promise<string[]> => {
  try {
    const snap = await getDoc(doc(db, 'user_data', uid));
    if (snap.exists() && snap.data().savedCards) {
      const cards = snap.data().savedCards as string[];
      localStorage.setItem('healing_cards_v2', JSON.stringify(cards));
      return cards;
    }
  } catch {}
  return loadSavedCards();
};

// Save wishlist to Firestore
const saveWishlistToFirestore = (items: WishlistItem[]): void => {
  try {
    const u = auth.currentUser;
    if (u) setDoc(doc(db, 'user_data', u.uid), { wishlist: JSON.parse(JSON.stringify(items)) }, { merge: true }).catch(e => console.error('[Firestore] write:', e));
  } catch {}
};

const loadWishlistFromFirestore = async (uid: string): Promise<WishlistItem[]> => {
  try {
    const snap = await getDoc(doc(db, 'user_data', uid));
    if (snap.exists() && snap.data().wishlist) {
      const items = snap.data().wishlist as WishlistItem[];
      localStorage.setItem('healing_wishlist', JSON.stringify(items));
      return items;
    }
  } catch {}
  return loadWishlist();
};

// ===================== Firestore sync for Energy =====================
const saveEnergyToFirestore = (state: EnergyState): void => {
  try {
    const u = auth.currentUser;
    if (u) setDoc(doc(db, 'user_data', u.uid), { energy: JSON.parse(JSON.stringify(state)) }, { merge: true }).catch(e => console.error('[Firestore] saveEnergy:', e));
  } catch (e) { console.error('[Firestore] saveEnergy sync:', e); }
};

const loadEnergyFromFirestore = async (uid: string): Promise<EnergyState | null> => {
  try {
    const snap = await getDoc(doc(db, 'user_data', uid));
    if (snap.exists() && snap.data().energy) {
      const energy = snap.data().energy as EnergyState;
      localStorage.setItem('healing_energy', JSON.stringify(energy));
      return energy;
    }
  } catch (e) { console.error('[Firestore] loadEnergy:', e); }
  return null;
};

// ===================== Firestore sync for Milestones =====================
const saveMilestonesToFirestore = (milestones: number[]): void => {
  try {
    const u = auth.currentUser;
    if (u) setDoc(doc(db, 'user_data', u.uid), { milestonesShown: milestones }, { merge: true }).catch(e => console.error('[Firestore] saveMilestones:', e));
  } catch (e) { console.error('[Firestore] saveMilestones sync:', e); }
};

const loadMilestonesFromFirestore = async (uid: string): Promise<number[]> => {
  try {
    const snap = await getDoc(doc(db, 'user_data', uid));
    if (snap.exists() && snap.data().milestonesShown) {
      const m = snap.data().milestonesShown as number[];
      localStorage.setItem('healing_milestones_shown', JSON.stringify(m));
      return m;
    }
  } catch (e) { console.error('[Firestore] loadMilestones:', e); }
  return [];
};

// ===================== Firestore sync for Evening Feedback =====================
const saveEveningToFirestore = (date: string, val: string): void => {
  try {
    const u = auth.currentUser;
    if (u) setDoc(doc(db, 'user_data', u.uid), { [`evening_${date}`]: val }, { merge: true }).catch(e => console.error('[Firestore] saveEvening:', e));
  } catch (e) { console.error('[Firestore] saveEvening sync:', e); }
};

// ===================== Firestore sync for Card Draws =====================
const saveCardDrawToFirestore = (dateStr: string, cardData: any): void => {
  try {
    const u = auth.currentUser;
    if (u) setDoc(doc(db, 'user_data', u.uid), { [`cardDraw_${dateStr}`]: cardData }, { merge: true }).catch(e => console.error('[Firestore] saveCardDraw:', e));
  } catch (e) { console.error('[Firestore] saveCardDraw sync:', e); }
};

// ===================== Firestore sync for Personality =====================
const savePersonalityToFirestore = (profile: any): void => {
  try {
    const u = auth.currentUser;
    if (u) setDoc(doc(db, 'user_data', u.uid), { personalityProfile: JSON.parse(JSON.stringify(profile)) }, { merge: true }).catch(e => console.error('[Firestore] savePersonality:', e));
  } catch (e) { console.error('[Firestore] savePersonality sync:', e); }
};

const loadPersonalityFromFirestore = async (uid: string): Promise<any | null> => {
  try {
    const snap = await getDoc(doc(db, 'user_data', uid));
    if (snap.exists() && snap.data().personalityProfile) {
      const p = snap.data().personalityProfile;
      localStorage.setItem('healing_personality', JSON.stringify(p));
      return p;
    }
  } catch (e) { console.error('[Firestore] loadPersonality:', e); }
  return null;
};

// ===================== Firestore sync for Test Results =====================
const saveTestResultToFirestore = (testId: string, resultKey: string): void => {
  try {
    const u = auth.currentUser;
    if (u) setDoc(doc(db, 'user_data', u.uid), { [`testResult_${testId}`]: resultKey }, { merge: true }).catch(e => console.error('[Firestore] saveTestResult:', e));
  } catch (e) { console.error('[Firestore] saveTestResult sync:', e); }
};

const loadTestResultsFromFirestore = async (uid: string): Promise<Record<string, string>> => {
  try {
    const snap = await getDoc(doc(db, 'user_data', uid));
    if (snap.exists()) {
      const data = snap.data();
      const results: Record<string, string> = {};
      Object.keys(data).filter(k => k.startsWith('testResult_')).forEach(k => {
        results[k.replace('testResult_', '')] = data[k];
      });
      if (Object.keys(results).length > 0) {
        localStorage.setItem('healing_test_results', JSON.stringify(results));
      }
      return results;
    }
  } catch (e) { console.error('[Firestore] loadTestResults:', e); }
  return {};
};

// ===================== Firestore sync for Journal PIN =====================
const saveJournalPinToFirestore = (pin: string, securityAnswer?: string): void => {
  try {
    const u = auth.currentUser;
    if (u) {
      const data: any = { journalPin: pin };
      if (securityAnswer !== undefined) data.journalSecurityAnswer = securityAnswer;
      setDoc(doc(db, 'user_data', u.uid), data, { merge: true }).catch(e => console.error('[Firestore] saveJournalPin:', e));
    }
  } catch (e) { console.error('[Firestore] saveJournalPin sync:', e); }
};

// ===================== 登入時一次性同步 localStorage → Firestore =====================
const syncAllLocalStorageToFirestore = async (uid: string): Promise<void> => {
  try {
    // 先檢查 Firestore 有沒有資料
    const snap = await getDoc(doc(db, 'user_data', uid));
    const existingData = snap.exists() ? snap.data() : {};
    const hasRealData = Object.keys(existingData).some(k => k !== '_test');

    // 收集所有 localStorage 資料
    const payload: Record<string, any> = {};

    const energy = localStorage.getItem('healing_energy');
    if (energy && !existingData.energy) {
      try { payload.energy = JSON.parse(energy); } catch {}
    }

    const milestones = localStorage.getItem('healing_milestones_shown');
    if (milestones && !existingData.milestonesShown) {
      try { payload.milestonesShown = JSON.parse(milestones); } catch {}
    }

    const personality = localStorage.getItem('healing_personality');
    if (personality && !existingData.personalityProfile) {
      try { payload.personalityProfile = JSON.parse(personality); } catch {}
    }

    const testResults = localStorage.getItem('healing_test_results');
    if (testResults) {
      try {
        const results = JSON.parse(testResults);
        Object.entries(results).forEach(([testId, resultKey]) => {
          if (!existingData[`testResult_${testId}`]) payload[`testResult_${testId}`] = resultKey;
        });
      } catch {}
    }

    const journalPin = localStorage.getItem('journal_pin');
    if (journalPin && !existingData.journalPin) payload.journalPin = journalPin;
    const journalSecurity = localStorage.getItem('journal_security_answer');
    if (journalSecurity && !existingData.journalSecurityAnswer) payload.journalSecurityAnswer = journalSecurity;

    const appPin = localStorage.getItem('healing_app_pin');
    if (appPin && !existingData.appPin) payload.appPin = appPin;

    // Card draws and evening feedback
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith('healing_card_')) {
        const dateStr = key.replace('healing_card_', '');
        if (!existingData[`cardDraw_${dateStr}`]) {
          try { payload[`cardDraw_${dateStr}`] = JSON.parse(localStorage.getItem(key) || ''); } catch {}
        }
      }
      if (key.startsWith('healing_evening_')) {
        const dateStr = key.replace('healing_evening_', '');
        if (!existingData[`evening_${dateStr}`]) {
          payload[`evening_${dateStr}`] = localStorage.getItem(key);
        }
      }
      if (key.startsWith('aftercare_')) {
        if (!existingData[`aftercare_${key}`]) {
          try { payload[`aftercare_${key}`] = JSON.parse(localStorage.getItem(key) || ''); } catch {}
        }
      }
    }

    // savedCards and wishlist
    const savedCards = localStorage.getItem('healing_saved_cards');
    if (savedCards && !existingData.savedCards) {
      try { payload.savedCards = JSON.parse(savedCards); } catch {}
    }
    const wishlist = localStorage.getItem('healing_wishlist');
    if (wishlist && !existingData.wishlist) {
      try { payload.wishlist = JSON.parse(wishlist); } catch {}
    }

    if (Object.keys(payload).length > 0) {
      await setDoc(doc(db, 'user_data', uid), payload, { merge: true });
      console.log('[Firestore] Synced localStorage → Firestore:', Object.keys(payload));
    } else {
      console.log('[Firestore] No new localStorage data to sync');
    }
  } catch (e) {
    console.error('[Firestore] syncAllLocalStorage failed:', e);
  }
};

const loadJournalPinFromFirestore = async (uid: string): Promise<void> => {
  try {
    const snap = await getDoc(doc(db, 'user_data', uid));
    if (snap.exists()) {
      if (snap.data().journalPin) localStorage.setItem('journal_pin', snap.data().journalPin);
      if (snap.data().journalSecurityAnswer) localStorage.setItem('journal_security_answer', snap.data().journalSecurityAnswer);
    }
  } catch (e) { console.error('[Firestore] loadJournalPin:', e); }
};

// ===================== Firestore sync for Aftercare =====================
const saveAftercareToFirestore = (key: string, data: any): void => {
  try {
    const u = auth.currentUser;
    if (u) setDoc(doc(db, 'user_data', u.uid), { [`aftercare_${key}`]: JSON.parse(JSON.stringify(data)) }, { merge: true }).catch(e => console.error('[Firestore] saveAftercare:', e));
  } catch (e) { console.error('[Firestore] saveAftercare sync:', e); }
};

const loadAftercareFromFirestore = async (uid: string): Promise<void> => {
  try {
    const snap = await getDoc(doc(db, 'user_data', uid));
    if (snap.exists()) {
      const data = snap.data();
      const STORAGE_KEYS_MAP: Record<string, string> = {
        'aftercare_plants': 'healing_aftercare_plants',
        'aftercare_fragrances': 'healing_aftercare_fragrances',
        'aftercare_works': 'healing_aftercare_works',
        'aftercare_course_types': 'healing_aftercare_course_types',
      };
      Object.entries(STORAGE_KEYS_MAP).forEach(([fbKey, lsKey]) => {
        if (data[fbKey]) localStorage.setItem(lsKey, JSON.stringify(data[fbKey]));
      });
    }
  } catch {}
};

const getEmotionInfo = (key: EmotionKey) => {
  const me = getMainEmotion(key);
  if (me) return { key: me.key, label: me.label, emoji: me.emoji, color: me.color, gradient: '', ringColor: '' };
  return { key, label: key, emoji: '😶', color: '#AAA', gradient: '', ringColor: '' };
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

// --- NEW: Evening Feedback Storage ---
const loadEveningFeedback = (): string | null => {
  try { return localStorage.getItem(`healing_evening_${getToday()}`); }
  catch { return null; }
};

const saveEveningFeedback = (val: string): void => {
  localStorage.setItem(`healing_evening_${getToday()}`, val);
  try { const u = auth.currentUser; if (u) setDoc(doc(db, 'user_data', u.uid), { [`evening_${getToday()}`]: val }, { merge: true }).catch(e => console.error('[Firestore] write:', e)); } catch {}
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
    try { const u = auth.currentUser; if (u) setDoc(doc(db, 'user_data', u.uid), { milestonesShown: [...existing, n] }, { merge: true }).catch(e => console.error('[Firestore] write:', e)); } catch {}
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
            <p className="text-sm font-medium mb-1" style={{ color: '#3D3530' }}>🌿 心理功效</p>
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

          {/* 搭配水晶推薦 */}
          {(() => {
            const matched = CRYSTAL_LIBRARY.filter(c => c.pairedOils.includes(oilName));
            if (matched.length === 0) return null;
            return (
              <div className="rounded-2xl p-4" style={{ backgroundColor: '#F0EDE8' }}>
                <p className="text-sm font-medium mb-2" style={{ color: '#9B7EC8' }}>💎 搭配水晶</p>
                <div className="flex flex-wrap gap-2">
                  {matched.map(crystal => (
                    <span key={crystal.name}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs"
                      style={{ backgroundColor: crystal.color + '20', color: '#3D3530' }}>
                      {crystal.emoji} {crystal.name}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
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

// ===================== NEW: 12-EMOTION MULTI-STEP CHECK-IN =====================

function EmotionPicker({
  selected,
  onSelect,
}: {
  selected: EmotionKey | null;
  onSelect: (key: EmotionKey) => void;
}) {
  return (
    <motion.div
      className="grid grid-cols-4 gap-2"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {MAIN_EMOTIONS.map((emo) => (
        <motion.button
          key={emo.key}
          variants={staggerItem}
          whileTap={{ scale: 0.92 }}
          onClick={() => onSelect(emo.key)}
          className="flex flex-col items-center justify-center rounded-2xl py-3 px-1 transition-all"
          style={{
            backgroundColor: selected === emo.key ? emo.color + '30' : '#FAF8F5',
            border: selected === emo.key ? `2px solid ${emo.color}` : '2px solid transparent',
          }}
        >
          <span className="text-2xl mb-1">{emo.emoji}</span>
          <span className="text-xs font-medium" style={{ color: '#3D3530' }}>{emo.label}</span>
        </motion.button>
      ))}
    </motion.div>
  );
}

/** 子情緒選擇 */
function SubEmotionPicker({
  emotion,
  selected,
  onSelect,
  onBack,
}: {
  emotion: MainEmotion;
  selected: string | null;
  onSelect: (sub: string) => void;
  onBack: () => void;
}) {
  return (
    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
      <button onClick={onBack} className="text-xs mb-3 flex items-center gap-1" style={{ color: '#B8ADA6' }}>
        ← 換一個
      </button>
      <p className="text-base font-bold mb-1" style={{ color: '#3D3530' }}>
        {emotion.emoji} {emotion.label}
      </p>
      <p className="text-xs mb-4" style={{ color: '#8C7B72' }}>{emotion.description}</p>
      <p className="text-sm mb-3" style={{ color: '#3D3530' }}>再靠近一點，你現在比較像...</p>
      <div className="space-y-2">
        {emotion.subEmotions.map((sub) => (
          <motion.button
            key={sub.key}
            whileTap={{ scale: 0.97 }}
            onClick={() => onSelect(sub.key)}
            className="w-full flex items-center gap-3 rounded-2xl p-3 text-left transition-all"
            style={{
              backgroundColor: selected === sub.key ? emotion.color + '20' : '#FAF8F5',
              border: selected === sub.key ? `2px solid ${emotion.color}` : '2px solid transparent',
            }}
          >
            <span className="text-xl">{sub.emoji}</span>
            <span className="text-sm font-medium" style={{ color: '#3D3530' }}>{sub.label}</span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

/** 強度等級選擇 */
function LevelPicker({
  emotion,
  selected,
  onSelect,
  onBack,
}: {
  emotion: MainEmotion;
  selected: EmotionLevel | null;
  onSelect: (level: EmotionLevel) => void;
  onBack: () => void;
}) {
  const levels: { key: EmotionLevel; label: string; icon: string }[] = [
    { key: 'L1', label: '淡淡的', icon: '🌤️' },
    { key: 'L2', label: '有點重', icon: '🌥️' },
    { key: 'L3', label: '蠻強的', icon: '🌧️' },
  ];

  return (
    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
      <button onClick={onBack} className="text-xs mb-3 flex items-center gap-1" style={{ color: '#B8ADA6' }}>
        ← 回去看看
      </button>
      <p className="text-base font-bold mb-1" style={{ color: '#3D3530' }}>
        這份感覺，大概有多重？
      </p>
      <p className="text-xs mb-4" style={{ color: '#8C7B72' }}>隨意選，沒有標準答案</p>
      <div className="space-y-3">
        {levels.map((lv) => (
          <motion.button
            key={lv.key}
            whileTap={{ scale: 0.97 }}
            onClick={() => onSelect(lv.key)}
            className="w-full rounded-2xl p-4 text-left transition-all"
            style={{
              backgroundColor: selected === lv.key ? emotion.color + '20' : '#FAF8F5',
              border: selected === lv.key ? `2px solid ${emotion.color}` : '2px solid transparent',
            }}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{lv.icon}</span>
              <div>
                <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{lv.label}</p>
                <p className="text-xs" style={{ color: '#8C7B72' }}>{emotion.levelDescriptions[lv.key]}</p>
              </div>
            </div>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

/** 完整情緒打卡流程組件（首頁嵌入）— 輕量版，自然過渡 */
function EmotionCheckInFlow({
  onComplete,
  initialEmotion,
}: {
  onComplete: (emotion: EmotionKey, level: EmotionLevel, subEmotion: string) => void;
  initialEmotion?: EmotionKey | null;
}) {
  const [step, setStep] = useState<'emotion' | 'sub' | 'level'>(initialEmotion ? 'sub' : 'emotion');
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionKey | null>(initialEmotion || null);
  const [selectedSub, setSelectedSub] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<EmotionLevel | null>(null);

  const mainEmotion = selectedEmotion ? getMainEmotion(selectedEmotion) : null;

  const handleEmotionSelect = (key: EmotionKey) => {
    setSelectedEmotion(key);
    setSelectedSub(null);
    setSelectedLevel(null);
    // 稍微延遲，讓選中動畫完成後再切換
    setTimeout(() => setStep('sub'), 300);
  };

  const handleSubSelect = (sub: string) => {
    setSelectedSub(sub);
    setTimeout(() => setStep('level'), 250);
  };

  const handleLevelSelect = (level: EmotionLevel) => {
    setSelectedLevel(level);
    if (selectedEmotion && selectedSub) {
      onComplete(selectedEmotion, level, selectedSub);
    }
  };

  // 根據步驟的溫柔提示語
  const stepHints: Record<string, string> = {
    emotion: '不用想太多，選最靠近你的那一個',
    sub: '慢慢來，看看哪個詞最像現在的你',
    level: '沒有對錯，只是讓我更懂你',
  };

  return (
    <div className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
      {/* 柔和的進度提示，不用明顯的 dots */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs" style={{ color: '#B8ADA6' }}>
          {stepHints[step]}
        </p>
        {step !== 'emotion' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex gap-1">
            {['emotion', 'sub', 'level'].map((s, i) => (
              <div key={s} className="w-1.5 h-1.5 rounded-full transition-all"
                style={{
                  backgroundColor: ['emotion', 'sub', 'level'].indexOf(step) >= i
                    ? (mainEmotion?.color || '#C9A96E') : '#E8E3DC',
                }}
              />
            ))}
          </motion.div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {step === 'emotion' && (
          <motion.div key="emo"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
          >
            <p className="text-base font-bold mb-4" style={{ color: '#3D3530' }}>
              嗨，今天好嗎？
            </p>
            <EmotionPicker selected={selectedEmotion} onSelect={handleEmotionSelect} />
          </motion.div>
        )}
        {step === 'sub' && mainEmotion && (
          <SubEmotionPicker
            key="sub"
            emotion={mainEmotion}
            selected={selectedSub}
            onSelect={handleSubSelect}
            onBack={() => setStep('emotion')}
          />
        )}
        {step === 'level' && mainEmotion && (
          <LevelPicker
            key="level"
            emotion={mainEmotion}
            selected={selectedLevel}
            onSelect={handleLevelSelect}
            onBack={() => setStep('sub')}
          />
        )}
      </AnimatePresence>
    </div>
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
  level,
  onDone,
  onViewHealing,
}: {
  emotion: EmotionKey;
  level: EmotionLevel;
  onDone: () => void;
  onViewHealing: () => void;
}) {
  const emoInfo = getEmotionInfo(emotion);
  const healingData = getHealingData(emotion, level);
  const warmMsg = getRandomWarmMessage(emotion, level);
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
        className="relative w-full max-w-md rounded-t-3xl p-6 pb-10 space-y-5 max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: '#FFFEF9' }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        <div className="mx-auto mb-2 h-1 w-12 rounded-full bg-gray-300" />

        {/* Checkin confirmed */}
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ backgroundColor: emoInfo.color + '25' }}
          >
            <span className="text-2xl">{emoInfo.emoji}</span>
          </div>
          <div>
            <p className="text-base font-bold" style={{ color: '#3D3530' }}>我聽到你了 ✨</p>
            <p className="text-sm" style={{ color: '#8C7B72' }}>
              {emoInfo.label} · {healingData?.levelLabel || level}
            </p>
          </div>
        </div>

        {/* Warm message */}
        <div className="rounded-2xl p-4" style={{ background: `linear-gradient(135deg, ${emoInfo.color}15, #FFF8E7)` }}>
          <p className="text-sm leading-relaxed italic text-center" style={{ color: '#3D3530' }}>
            「{warmMsg}」
          </p>
        </div>

        {/* Today's recipe */}
        {healingData && (
          <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, #FAF8F5, #FFF8E7)' }}>
            <p className="text-xs font-medium mb-2" style={{ color: '#C9A96E' }}>🌿 今天為你準備的香氛</p>
            <p className="text-sm font-medium mb-1" style={{ color: '#3D3530' }}>
              {healingData.blend.oils.join(' + ')}
            </p>
            <p className="text-xs" style={{ color: '#8C7B72' }}>{healingData.blend.recipe}</p>
            <p className="text-xs mt-1 italic" style={{ color: '#8C7B72' }}>「{healingData.blend.note}」</p>
          </div>
        )}

        {/* 推薦水晶 — 根據今日情緒 */}
        {EMOTION_CRYSTAL_MAP[emotion] && (
          <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, #F0EDE8, #FAF8F5)' }}>
            <p className="text-xs font-medium mb-2" style={{ color: '#9B7EC8' }}>💎 今日推薦水晶</p>
            <div className="flex flex-wrap gap-2">
              {(EMOTION_CRYSTAL_MAP[emotion] || []).slice(0, 2).map(crystalName => {
                const crystal = CRYSTAL_LIBRARY.find(c => c.name === crystalName);
                if (!crystal) return null;
                return (
                  <span key={crystalName} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
                    style={{ backgroundColor: crystal.color + '20', color: '#3D3530' }}>
                    {crystal.emoji} {crystal.name}
                  </span>
                );
              })}
            </div>
            <p className="text-xs mt-2 italic" style={{ color: '#8C7B72' }}>
              搭配精油使用，讓療癒力量加倍
            </p>
          </div>
        )}

        {/* Today's micro task */}
        <div className="rounded-2xl p-4" style={{ backgroundColor: '#FAF8F5' }}>
          <p className="text-xs font-medium mb-2" style={{ color: '#3D3530' }}>✨ 今日微任務</p>
          <p className="text-sm" style={{ color: '#8C7B72' }}>{MICRO_TASKS[dayIndex % MICRO_TASKS.length]}</p>
        </div>

        <div className="flex gap-2">
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onViewHealing}
            className="flex-1 rounded-2xl py-3 text-white font-medium text-sm"
            style={{ backgroundColor: emoInfo.color || '#C9A96E' }}
          >
            看看你的療癒配方 →
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onDone}
            className="flex-1 rounded-2xl py-3 font-medium text-sm"
            style={{ backgroundColor: '#FAF8F5', color: '#8C7B72' }}
          >
            好的，去吧
          </motion.button>
        </div>
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

// ===================== 心情日記小工具 (首頁) =====================

function MoodDiaryWidget({
  user,
  onViewFull,
  onGoToCustom,
}: {
  user: User | null;
  onViewFull: () => void;
  onGoToCustom: () => void;
}) {
  const [note, setNote] = useState('');
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionKey | null>(null);
  const [todayEntries, setTodayEntries] = useState<MoodDiaryEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const today = getToday();

  // 載入今天的日記
  useEffect(() => {
    if (user) {
      loadMoodDiaries(user.uid, today).then(setTodayEntries);
    } else {
      // 未登入用 localStorage
      const stored = localStorage.getItem(`mood_diary_${today}`);
      if (stored) setTodayEntries(JSON.parse(stored));
    }
  }, [user, today]);

  const handleSave = async () => {
    if (!selectedEmotion || !note.trim()) return;
    setSaving(true);

    const recommendation = getOilRecommendation(selectedEmotion);
    const entry: MoodDiaryEntry = {
      emotion: selectedEmotion,
      note: note.trim(),
      timestamp: Date.now(),
      date: today,
      recommendedOils: recommendation.oils,
    };

    if (user) {
      const id = await saveMoodDiary(user.uid, entry);
      if (id) entry.id = id;
    }

    const updated = [entry, ...todayEntries];
    setTodayEntries(updated);
    if (!user) {
      localStorage.setItem(`mood_diary_${today}`, JSON.stringify(updated));
    }

    setNote('');
    setSelectedEmotion(null);
    setSaving(false);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);
  };

  const emoInfo = selectedEmotion ? getEmotionInfo(selectedEmotion) : null;
  const recommendation = selectedEmotion ? getOilRecommendation(selectedEmotion) : null;

  return (
    <div className="rounded-3xl p-5 shadow-sm relative overflow-hidden" style={{ backgroundColor: '#FFFEF9' }}>
      {/* 水彩背景 SVG */}
      <svg className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-[0.08]" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="wc1" cx="20%" cy="30%" r="40%">
            <stop offset="0%" stopColor="#C9A96E" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#C9A96E" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="wc2" cx="75%" cy="60%" r="35%">
            <stop offset="0%" stopColor="#8FA886" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#8FA886" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="wc3" cx="50%" cy="80%" r="30%">
            <stop offset="0%" stopColor="#B8A8C8" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#B8A8C8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="wc4" cx="85%" cy="20%" r="25%">
            <stop offset="0%" stopColor="#E8A87C" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#E8A87C" stopOpacity="0" />
          </radialGradient>
          <filter id="wcblur">
            <feGaussianBlur stdDeviation="20" />
          </filter>
        </defs>
        <ellipse cx="80" cy="90" rx="120" ry="80" fill="url(#wc1)" filter="url(#wcblur)" />
        <ellipse cx="300" cy="180" rx="100" ry="70" fill="url(#wc2)" filter="url(#wcblur)" />
        <ellipse cx="200" cy="240" rx="90" ry="60" fill="url(#wc3)" filter="url(#wcblur)" />
        <ellipse cx="340" cy="60" rx="70" ry="50" fill="url(#wc4)" filter="url(#wcblur)" />
        {/* 水彩飛濺效果 */}
        <circle cx="60" cy="200" r="15" fill="#C9A96E" opacity="0.15" filter="url(#wcblur)" />
        <circle cx="350" cy="130" r="12" fill="#8FA886" opacity="0.12" filter="url(#wcblur)" />
        <circle cx="150" cy="50" r="18" fill="#B8A8C8" opacity="0.1" filter="url(#wcblur)" />
      </svg>

      <div className="relative z-10">
        {/* 標題 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎨</span>
            <p className="text-base font-bold" style={{ color: '#3D3530' }}>心情日記</p>
          </div>
          {todayEntries.length > 0 && (
            <button onClick={onViewFull} className="text-xs" style={{ color: '#C9A96E' }}>
              查看全部 →
            </button>
          )}
        </div>

        {/* 情緒選擇 */}
        <p className="text-xs mb-2" style={{ color: '#8C7B72' }}>現在的心情是...</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {MAIN_EMOTIONS.slice(0, 6).map((emo) => (
            <motion.button
              key={emo.key}
              whileTap={{ scale: 0.92 }}
              onClick={() => setSelectedEmotion(emo.key)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                backgroundColor: selectedEmotion === emo.key ? emo.color + '30' : '#FAF8F5',
                color: selectedEmotion === emo.key ? emo.color : '#8C7B72',
                border: selectedEmotion === emo.key ? `1.5px solid ${emo.color}` : '1.5px solid transparent',
              }}
            >
              <span>{emo.emoji}</span>
              <span>{emo.label}</span>
            </motion.button>
          ))}
        </div>

        {/* 備註輸入 */}
        <div className="relative mb-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="寫下此刻的感受..."
            rows={2}
            className="w-full rounded-2xl p-3 text-sm resize-none outline-none"
            style={{
              backgroundColor: '#FAF8F5',
              color: '#3D3530',
              border: '1px solid #E8E3DC',
            }}
          />
        </div>

        {/* 推薦精油顯示 */}
        <AnimatePresence>
          {selectedEmotion && recommendation && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-3 rounded-2xl p-3 overflow-hidden"
              style={{ backgroundColor: (emoInfo?.color || '#C9A96E') + '12' }}
            >
              <p className="text-xs font-medium mb-1" style={{ color: emoInfo?.color || '#C9A96E' }}>
                🌿 為你推薦的香氛
              </p>
              <p className="text-sm" style={{ color: '#3D3530' }}>
                {recommendation.oils.join(' + ')}
              </p>
              <p className="text-xs mt-1" style={{ color: '#8C7B72' }}>
                {recommendation.description}
              </p>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={onGoToCustom}
                className="mt-2 text-xs font-medium px-3 py-1 rounded-full"
                style={{ backgroundColor: emoInfo?.color || '#C9A96E', color: 'white' }}
              >
                客製化調配 →
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 儲存按鈕 */}
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={handleSave}
          disabled={!selectedEmotion || !note.trim() || saving}
          className="w-full rounded-2xl py-2.5 text-sm font-medium transition-all"
          style={{
            backgroundColor: selectedEmotion && note.trim() ? '#C9A96E' : '#E8E3DC',
            color: selectedEmotion && note.trim() ? 'white' : '#B5AFA8',
          }}
        >
          {saving ? '儲存中...' : showSuccess ? '✓ 已記錄' : '記錄心情'}
        </motion.button>

        {/* 今日已記錄的心情 */}
        {todayEntries.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium" style={{ color: '#8C7B72' }}>
              今日記錄 ({todayEntries.length})
            </p>
            {todayEntries.slice(0, 3).map((entry, i) => {
              const entryEmo = getEmotionInfo(entry.emotion);
              const time = new Date(entry.timestamp);
              return (
                <div key={i} className="flex items-start gap-2 rounded-xl p-2" style={{ backgroundColor: '#FAF8F5' }}>
                  <span className="text-sm mt-0.5">{entryEmo.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium" style={{ color: entryEmo.color }}>{entryEmo.label}</span>
                      <span className="text-xs" style={{ color: '#B5AFA8' }}>
                        {time.getHours().toString().padStart(2, '0')}:{time.getMinutes().toString().padStart(2, '0')}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5 truncate" style={{ color: '#8C7B72' }}>{entry.note}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ===================== NEW: DAILY TASK LIST =====================
// 保留此組件供未來使用 (Kept for future use but not currently used)

function _DailyTaskList({
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
// 保留此組件供未來使用 (Kept for future use but not currently used)

function _EveningFeedback({
  onComplete,
  todayEmotion,
  todayLevel,
}: {
  onComplete: () => void;
  todayEmotion?: EmotionKey;
  todayLevel?: EmotionLevel;
}) {
  const [selected, setSelected] = useState<string | null>(loadEveningFeedback());
  const nightQ = todayEmotion && todayLevel ? getRandomNightFeedback(todayEmotion, todayLevel) : '今天還好嗎？';

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
      <p className="text-sm font-bold mb-1" style={{ color: '#3D3530' }}>🌙 {nightQ}</p>
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
  onGoToHealing,
  onGoToBedtime,
  onGoToDiary,
  onGoToCustom,
  user,
  onGoToSound,
  onNavigate,
}: {
  records: HealingRecord[];
  onCheckIn: (emotion: EmotionKey, level: EmotionLevel, subEmotion: string) => void;
  onGoToHealing: () => void;
  onGoToBedtime: () => void;
  onGoToDiary: () => void;
  onGoToCustom: () => void;
  user: User | null;
  onGoToSound?: () => void;
  onNavigate?: (p: PageType) => void;
}) {
  const todayRecord = records.find(r => r.date === getToday());
  const streak = getStreak(records);
  const currentHour = new Date().getHours();
  const showBedtime = currentHour >= 20;
  const dayIndex = getDayOfYear();

  const todayHealingData = todayRecord?.emotion
    ? getHealingData(todayRecord.emotion, todayRecord.level || 'L1')
    : null;
  const todayEmoInfo = todayRecord?.emotion ? getEmotionInfo(todayRecord.emotion) : null;

  // 時段問候
  const getGreeting = () => {
    if (currentHour >= 6 && currentHour < 11) return '「早安，新的一天從照顧自己開始。」';
    if (currentHour >= 11 && currentHour < 14) return '「午安，記得喝口水、深呼吸。」';
    if (currentHour >= 14 && currentHour < 17) return '「下午了，如果累了，這裡可以讓你喘口氣。」';
    if (currentHour >= 17 && currentHour < 20) return '「辛苦了今天，讓我們慢慢把節奏放下來。」';
    return '「晚上好，今天夠了，準備好好休息吧。」';
  };

  // 隨機推薦音景
  const getRecommendedSound = () => {
    const sounds = [
      { emoji: '🌊', label: '海浪聲', reason: '讓思緒隨波流動' },
      { emoji: '🌧️', label: '雨聲', reason: '舒緩焦慮的完美陪伴' },
      { emoji: '🌲', label: '森林', reason: '回歸寧靜的懷抱' },
      { emoji: '🔥', label: '壁爐', reason: '溫暖的陪伴' },
    ];
    return sounds[Math.floor(Math.random() * sounds.length)];
  };

  const recommendedSound = getRecommendedSound();

  const HOME_GRID_ITEMS: { icon: string; label: string; page: PageType; color: string }[] = [
    { icon: '/icons/療癒配方.png', label: '療癒配方', page: 'recipe', color: '#D2B4A1' },
    { icon: '/icons/電子書.png', label: '電子書', page: 'ebook', color: '#C9A96E' },
    { icon: '/icons/心理測驗.png', label: '心理測驗', page: 'healer', color: '#9B7EC8' },
    { icon: '/icons/水晶能量.png', label: '水晶能量', page: 'crystal-energy', color: '#7EC8C8' },
    { icon: '/icons/植栽照顧.png', label: '植栽照顧', page: 'plant-care', color: '#6B8F5E' },
    { icon: '/icons/精油百科.png', label: '精油百科', page: 'oil-wiki', color: '#A8B876' },
    { icon: '/icons/課後照顧.png', label: '課後照顧', page: 'library', color: '#8C7B72' },
    { icon: '/icons/社群.png', label: '社群', page: 'community', color: '#E8A8A8' },
    { icon: '/icons/我的作品.png', label: '我的作品集', page: 'my-works', color: '#C88ED8' },
    { icon: '/icons/聆聽.png', label: '聆聽', page: 'sound', color: '#6B6B9B' },
    { icon: '/icons/療癒商城.png', label: '療癒商城', page: 'shop', color: '#5E8FA8' },
    { icon: '/icons/XIA幣任務.png', label: 'XIA幣任務', page: 'xia-tasks', color: '#E8B735' },
    { icon: '/icons/日記.png', label: '日記', page: 'journal', color: '#C4A882' },
    { icon: '/icons/收藏.png', label: '收藏', page: 'collections', color: '#E0A8A8' },
    { icon: '/icons/智能客服.png', label: '智能客服', page: 'ai-cs', color: '#5EAAB8' },
  ];

  const getTimeGreeting = () => {
    if (currentHour >= 5 && currentHour < 12) return '嗨！早安';
    if (currentHour >= 12 && currentHour < 18) return '嗨！午安';
    return '嗨！晚安';
  };

  return (
    <motion.div
      className="space-y-5"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* Header: Logo + Greeting */}
      <motion.div variants={staggerItem} className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center border" style={{ borderColor: '#E8E3DC' }}>
          <span className="text-[6px] font-bold leading-tight text-center" style={{ color: '#3D3530' }}>XIA{'\n'}BEN{'\n'}HOW</span>
        </div>
        <h1 className="text-lg font-bold" style={{ color: '#3D3530' }}>{getTimeGreeting()}</h1>
      </motion.div>

      {/* Banner */}
      <motion.div
        variants={staggerItem}
        className="rounded-2xl p-4"
        style={{ background: 'linear-gradient(135deg, #6B5F54, #8C7B6E)' }}
      >
        <p className="text-sm font-bold text-white">✨ 新課程上線</p>
        <p className="text-xs text-white mt-1" style={{ opacity: 0.85 }}>探索最新的療癒課程與香氛體驗</p>
      </motion.div>

      {/* Feature Grid (3 columns) */}
      <motion.div variants={staggerItem}>
        <div className="grid grid-cols-3 gap-3">
          {HOME_GRID_ITEMS.map((item) => (
            <motion.button
              key={item.label}
              whileTap={{ scale: 0.93 }}
              onClick={() => onNavigate?.(item.page)}
              className="p-3 flex flex-col items-center gap-2"
              style={{ background: 'transparent' }}
            >
              <img src={item.icon} alt={item.label} style={{ width: 50, height: 50 }} className="object-contain" />
              <p className="text-sm font-medium" style={{ color: '#3D3530' }}>{item.label}</p>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ===================== PAGE: DIARY =====================

function DiaryPage({ records, onUpdateRecord, onCheckIn }: {
  records: HealingRecord[];
  onUpdateRecord?: (record: HealingRecord) => void;
  onCheckIn?: (emotion: EmotionKey, level: EmotionLevel, subEmotion: string) => void;
}) {
  const [viewMode, setViewMode] = useState<'calendar' | 'timeline'>('calendar');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [showMiniCheckIn, setShowMiniCheckIn] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinLocked, setPinLocked] = useState(() => !!localStorage.getItem('healing_app_pin'));
  const [pinVerified, setPinVerified] = useState(false);

  const getWeekday = (dateStr: string): string => {
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    return '週' + days[new Date(dateStr).getDay()];
  };

  const getShortWeekday = (dateStr: string): string => {
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    return days[new Date(dateStr).getDay()];
  };

  // === Calendar helpers ===
  const daysInMonth = new Date(calendarMonth.year, calendarMonth.month + 1, 0).getDate();
  const firstDayOfWeek = new Date(calendarMonth.year, calendarMonth.month, 1).getDay();
  const monthLabel = `${calendarMonth.year}年${calendarMonth.month + 1}月`;

  const calendarDays = useMemo(() => {
    const days: { date: string; day: number; record: HealingRecord | null; isToday: boolean; inMonth: boolean }[] = [];
    const today = formatDate(new Date());
    // Fill leading blanks
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push({ date: '', day: 0, record: null, isToday: false, inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(calendarMonth.year, calendarMonth.month, d);
      const dateStr = formatDate(dateObj);
      const rec = records.find(r => r.date === dateStr) || null;
      days.push({ date: dateStr, day: d, record: rec, isToday: dateStr === today, inMonth: true });
    }
    return days;
  }, [calendarMonth, records, daysInMonth, firstDayOfWeek]);

  const navigateMonth = (delta: number) => {
    setCalendarMonth(prev => {
      let m = prev.month + delta;
      let y = prev.year;
      if (m < 0) { m = 11; y--; }
      if (m > 11) { m = 0; y++; }
      return { year: y, month: m };
    });
  };

  // === Month records for summary ===
  const monthRecords = useMemo(() => {
    return records.filter(r => {
      const d = new Date(r.date);
      return d.getFullYear() === calendarMonth.year && d.getMonth() === calendarMonth.month;
    });
  }, [records, calendarMonth]);

  // === Week records ===
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

  const last7 = getLast7Days();
  const weekRecords = last7.map(date => {
    const rec = records.find(r => r.date === date);
    return { date, record: rec || null };
  });

  // === Smart summary ===
  const mostFrequent = getMostFrequentEmotion(monthRecords);
  const mostFrequentInfo = mostFrequent ? getEmotionInfo(mostFrequent) : null;
  const checkinRate = monthRecords.length > 0 ? Math.round((monthRecords.length / daysInMonth) * 100) : 0;

  // === Emotion distribution for month ===
  const emotionDistribution = useMemo(() => {
    const dist: Partial<Record<EmotionKey, number>> = {};
    monthRecords.forEach(r => { dist[r.emotion] = (dist[r.emotion] || 0) + 1; });
    return Object.entries(dist)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key: key as EmotionKey, count, info: getEmotionInfo(key as EmotionKey) }));
  }, [monthRecords]);

  // === Selected date record ===
  const selectedRecord = selectedDate ? records.find(r => r.date === selectedDate) || null : null;

  // === Emotion color strip (week view) ===

  const handleDateClick = (dateStr: string) => {
    if (!dateStr) return;
    setSelectedDate(dateStr);
    const rec = records.find(r => r.date === dateStr);
    if (rec) {
      setShowEntryModal(true);
    } else {
      // No record for this date — offer to check in
      const today = formatDate(new Date());
      if (dateStr === today) {
        setShowMiniCheckIn(true);
      } else {
        setShowEntryModal(true);
      }
    }
  };

  const handleNoteSave = (note: string) => {
    if (selectedRecord && onUpdateRecord) {
      onUpdateRecord({ ...selectedRecord, note });
    }
    setShowEntryModal(false);
  };

  const handleMiniCheckInDone = (emotion: EmotionKey, level: EmotionLevel, subEmotion: string) => {
    if (onCheckIn) {
      onCheckIn(emotion, level, subEmotion);
    }
    setShowMiniCheckIn(false);
  };

  return (
    <motion.div className="space-y-4" {...fadeInUp}>
      {/* 慢慢認識自己 - Emotion Summary Section */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl p-5 shadow-sm"
        style={{ backgroundColor: '#FFFEF9' }}
      >
        <p className="text-base font-bold mb-3" style={{ color: '#3D3530' }}>慢慢認識自己</p>

        {/* Emotion summary text */}
        {monthRecords.length > 0 ? (
          <>
            <p className="text-sm leading-relaxed mb-3" style={{ color: '#5C534C' }}>
              {mostFrequentInfo
                ? `這個月你最常出現的是${mostFrequentInfo.label}，你最近比較需要被陪伴的是理解與安定。`
                : `你這個月已經有 ${monthRecords.length} 次情緒打卡，慢慢認識自己，這件事本身就很了不起。`
              }
            </p>
          </>
        ) : (
          <p className="text-sm leading-relaxed mb-3" style={{ color: '#5C534C' }}>
            你正在慢慢認識自己，這就是最好的開始。
          </p>
        )}

        {/* Recent 7-day emotion color dots */}
        <div className="flex gap-1.5 items-center">
          <span className="text-xs" style={{ color: '#8C7B72' }}>最近 7 天：</span>
          {weekRecords.map((w, i) => (
            <div
              key={i}
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: w.record ? getEmotionInfo(w.record.emotion).color : '#E8E3DC' }}
            />
          ))}
        </div>
      </motion.div>

      {/* Top bar: view mode + privacy + month nav */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {(['calendar', 'timeline'] as const).map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
              style={viewMode === mode
                ? { backgroundColor: '#8FA886', color: '#fff' }
                : { backgroundColor: '#FFFEF9', color: '#8C7B72' }}>
              {mode === 'calendar' ? '📅 日曆' : '📋 時間軸'}
            </button>
          ))}
        </div>
        <button onClick={() => {
            if (pinLocked && !pinVerified) {
              setShowPinModal(true);
            } else {
              setPrivacyMode(!privacyMode);
            }
          }}
          className="px-3 py-1.5 rounded-xl text-xs transition-all"
          style={{ backgroundColor: privacyMode ? '#3D3530' : '#FFFEF9', color: privacyMode ? '#fff' : '#8C7B72' }}>
          {privacyMode ? '🔒' : '🔓'}
        </button>
        <button onClick={() => setShowPinModal(true)}
          className="px-2 py-1.5 rounded-xl text-[10px]"
          style={{ backgroundColor: '#FAF8F5', color: '#8C7B72' }}>
          {pinLocked ? '⚙️' : '設定密碼'}
        </button>
      </div>

      {/* === CALENDAR VIEW === */}
      {viewMode === 'calendar' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {/* Month navigator */}
          <div className="flex items-center justify-between px-2">
            <button onClick={() => navigateMonth(-1)} className="p-2 rounded-full" style={{ color: '#8C7B72' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <span className="text-sm font-bold" style={{ color: '#3D3530' }}>{monthLabel}</span>
            <button onClick={() => navigateMonth(1)} className="p-2 rounded-full" style={{ color: '#8C7B72' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </div>

          {/* Day-of-week header */}
          <div className="grid grid-cols-7 gap-1 px-1">
            {['日', '一', '二', '三', '四', '五', '六'].map(d => (
              <div key={d} className="text-center text-xs py-1" style={{ color: '#B8ADA6' }}>{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1 px-1">
            {calendarDays.map((cd, i) => (
              <motion.button key={i}
                onClick={() => cd.inMonth && handleDateClick(cd.date)}
                className="relative flex flex-col items-center justify-center rounded-xl transition-all"
                style={{
                  height: '44px',
                  backgroundColor: cd.isToday ? '#F5F0E8' : 'transparent',
                  border: selectedDate === cd.date ? '2px solid #C9A96E' : '2px solid transparent',
                  opacity: cd.inMonth ? 1 : 0,
                }}
                whileTap={cd.inMonth ? { scale: 0.92 } : undefined}
              >
                <span className="text-xs" style={{ color: cd.isToday ? '#3D3530' : '#8C7B72', fontWeight: cd.isToday ? 700 : 400 }}>
                  {cd.day > 0 ? cd.day : ''}
                </span>
                {cd.record && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -bottom-0.5 w-2.5 h-2.5 rounded-full"
                    style={{
                      backgroundColor: getEmotionInfo(cd.record.emotion).color,
                      filter: privacyMode ? 'blur(4px)' : 'none',
                    }}
                  />
                )}
              </motion.button>
            ))}
          </div>

          {/* Emotion Color Strip (mini week bar at bottom of calendar) */}
          <div className="rounded-2xl p-3 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
            <p className="text-xs mb-2" style={{ color: '#B8ADA6' }}>本週情緒色帶</p>
            <div className="flex gap-1 items-end" style={{ height: '32px' }}>
              {weekRecords.map((wr, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <motion.div
                    className="w-full rounded-sm"
                    style={{
                      height: wr.record ? '20px' : '4px',
                      backgroundColor: wr.record ? getEmotionInfo(wr.record.emotion).color : '#E8E3DC',
                      opacity: wr.record ? 0.8 : 0.4,
                      filter: privacyMode ? 'blur(4px)' : 'none',
                    }}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: i * 0.05 }}
                  />
                  <span className="text-xs" style={{ color: '#B8ADA6', fontSize: '9px' }}>{getShortWeekday(wr.date)}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* === TIMELINE VIEW === */}
      {viewMode === 'timeline' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
          {monthRecords.length === 0 ? (
            <div className="rounded-3xl p-6 text-center shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
              <p className="text-sm" style={{ color: '#8C7B72' }}>這個月還沒有記錄 🌱</p>
            </div>
          ) : (
            <div className="relative pl-6">
              {/* Vertical line */}
              <div className="absolute left-3 top-2 bottom-2 w-0.5 rounded-full" style={{ backgroundColor: '#E8E3DC' }} />
              {[...monthRecords].reverse().map((rec, i) => {
                const emo = getEmotionInfo(rec.emotion);
                return (
                  <motion.div key={rec.date + i}
                    className="relative mb-3"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                  >
                    {/* Timeline dot */}
                    <div className="absolute -left-3 top-3 w-3 h-3 rounded-full border-2"
                      style={{ backgroundColor: emo.color, borderColor: '#FAF8F5', filter: privacyMode ? 'blur(3px)' : 'none' }} />
                    {/* Card */}
                    <motion.div
                      className="rounded-2xl p-4 shadow-sm cursor-pointer"
                      style={{ backgroundColor: '#FFFEF9' }}
                      onClick={() => { setSelectedDate(rec.date); setShowEntryModal(true); }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg" style={{ filter: privacyMode ? 'blur(4px)' : 'none' }}>{emo.emoji}</span>
                          <div>
                            <p className="text-sm font-medium" style={{ color: '#3D3530' }}>
                              {rec.date.slice(5)} {getWeekday(rec.date)}
                            </p>
                            <p className="text-xs" style={{ color: '#8C7B72', filter: privacyMode ? 'blur(4px)' : 'none' }}>
                              {emo.label}{rec.subEmotion ? ` · ${rec.subEmotion}` : ''}
                              {rec.level ? ` · ${rec.level === 'L1' ? '微微' : rec.level === 'L2' ? '中等' : '強烈'}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: emo.color }} />
                          <p className="text-xs" style={{ color: '#B8ADA6' }}>
                            {(() => { const hd = getHealingData(rec.emotion, rec.level || 'L1'); return hd ? hd.blend.oils[0] : ''; })()}
                          </p>
                        </div>
                      </div>
                      {rec.note && (
                        <p className="text-xs mt-2 pl-7 leading-relaxed"
                          style={{ color: '#8C7B72', filter: privacyMode ? 'blur(6px)' : 'none' }}>
                          {rec.note}
                        </p>
                      )}
                    </motion.div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}

      {/* === WEEKLY SMART SUMMARY === */}
      {monthRecords.length > 0 && (
        <motion.div className="rounded-3xl p-5 shadow-sm space-y-3" style={{ backgroundColor: '#FFFEF9' }}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold" style={{ color: '#3D3530' }}>
              {monthLabel.slice(5)} 情緒摘要
            </p>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F5F0E8', color: '#C9A96E' }}>
              打卡率 {checkinRate}%
            </span>
          </div>
          {/* Emotion frequency bars */}
          {emotionDistribution.slice(0, 4).map((ed, i) => (
            <div key={ed.key} className="flex items-center gap-2">
              <span className="text-sm" style={{ filter: privacyMode ? 'blur(4px)' : 'none' }}>{ed.info.emoji}</span>
              <span className="text-xs w-10" style={{ color: '#8C7B72', filter: privacyMode ? 'blur(4px)' : 'none' }}>{ed.info.label}</span>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#F5F0E8' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: ed.info.color, filter: privacyMode ? 'blur(4px)' : 'none' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round((ed.count / monthRecords.length) * 100)}%` }}
                  transition={{ delay: i * 0.1 + 0.2, duration: 0.5 }}
                />
              </div>
              <span className="text-xs w-6 text-right" style={{ color: '#B8ADA6' }}>{ed.count}</span>
            </div>
          ))}
          {/* Warm insight */}
          {mostFrequentInfo && (
            <div className="pt-2 border-t" style={{ borderColor: '#F0EDE8' }}>
              <p className="text-xs leading-relaxed" style={{ color: '#8C7B72', filter: privacyMode ? 'blur(6px)' : 'none' }}>
                這個月你最常感到 <span className="font-medium" style={{ color: '#3D3530' }}>{mostFrequentInfo.emoji} {mostFrequentInfo.label}</span>，
                {(() => { const hd = getHealingData(mostFrequent!, 'L1'); return hd ? hd.warmMessages[0] : '繼續照顧自己的情緒吧'; })()}
              </p>
              <p className="text-xs mt-1 font-medium" style={{ color: '#8FA886' }}>
                推薦：{(() => { const hd = getHealingData(mostFrequent!, 'L1'); return hd ? hd.blend.oils.join(' + ') : '薰衣草 + 乳香'; })()}
              </p>
            </div>
          )}
        </motion.div>
      )}

      {/* Empty state */}
      {records.length === 0 && (
        <motion.div className="rounded-3xl p-8 text-center shadow-sm" style={{ backgroundColor: '#FFFEF9' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <p className="text-3xl mb-3">🌿</p>
          <p className="text-sm font-medium" style={{ color: '#3D3530' }}>開始記錄你的情緒旅程</p>
          <p className="text-xs mt-1" style={{ color: '#8C7B72' }}>每天花一點時間，和自己對話</p>
          {onCheckIn && (
            <button onClick={() => setShowMiniCheckIn(true)}
              className="mt-4 px-5 py-2 rounded-2xl text-sm font-medium text-white"
              style={{ backgroundColor: '#8FA886' }}>
              現在打卡
            </button>
          )}
        </motion.div>
      )}

      {/* === ENTRY MODAL (view/edit note) === */}
      <AnimatePresence>
        {showEntryModal && selectedDate && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/30" onClick={() => setShowEntryModal(false)} />
            <motion.div
              className="relative w-full max-w-md rounded-t-3xl p-6 pb-10 shadow-lg"
              style={{ backgroundColor: '#FAF8F5' }}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ backgroundColor: '#E0DDD8' }} />
              <DiaryEntryDetail
                date={selectedDate}
                record={selectedRecord}
                privacyMode={privacyMode}
                onSaveNote={handleNoteSave}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* === MINI CHECK-IN MODAL === */}
      <AnimatePresence>
        {showMiniCheckIn && onCheckIn && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/30" onClick={() => setShowMiniCheckIn(false)} />
            <motion.div
              className="relative w-full max-w-md rounded-t-3xl p-6 pb-10 shadow-lg"
              style={{ backgroundColor: '#FAF8F5', maxHeight: '85vh', overflowY: 'auto' }}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ backgroundColor: '#E0DDD8' }} />
              <EmotionCheckInFlow onComplete={handleMiniCheckInDone} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PIN Lock Modal */}
      <AnimatePresence>
        {showPinModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowPinModal(false)} />
            <motion.div
              className="relative w-80 rounded-3xl p-6 shadow-xl"
              style={{ backgroundColor: '#FFFEF9' }}
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
            >
              <PinLockModal
                onClose={() => setShowPinModal(false)}
                onPinSet={() => { setPinLocked(true); setShowPinModal(false); }}
                onPinVerified={() => { setPinVerified(true); setPrivacyMode(!privacyMode); setShowPinModal(false); }}
                onPinRemoved={() => { setPinLocked(false); setPinVerified(false); setShowPinModal(false); }}
                isLocked={pinLocked}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// === PIN Lock Component ===
function PinLockModal({ onClose, onPinSet, onPinVerified, onPinRemoved, isLocked }: {
  onClose: () => void;
  onPinSet: () => void;
  onPinVerified: () => void;
  onPinRemoved: () => void;
  isLocked: boolean;
}) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm' | 'verify'>(isLocked ? 'verify' : 'enter');
  const [error, setError] = useState('');

  const handleDigit = (digit: string) => {
    setError('');
    if (step === 'enter' && pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 4) setTimeout(() => setStep('confirm'), 300);
    } else if (step === 'confirm' && confirmPin.length < 4) {
      const newConfirm = confirmPin + digit;
      setConfirmPin(newConfirm);
      if (newConfirm.length === 4) {
        setTimeout(() => {
          if (newConfirm === pin) {
            localStorage.setItem('healing_app_pin', btoa(pin));
            try { const u = auth.currentUser; if (u) setDoc(doc(db, 'user_data', u.uid), { appPin: btoa(pin) }, { merge: true }).catch(e => console.error('[Firestore] write:', e)); } catch {}
            onPinSet();
          } else {
            setError('密碼不一致，請重新輸入');
            setPin(''); setConfirmPin(''); setStep('enter');
          }
        }, 300);
      }
    } else if (step === 'verify' && pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 4) {
        setTimeout(() => {
          const stored = localStorage.getItem('healing_app_pin');
          if (stored && atob(stored) === newPin) {
            onPinVerified();
          } else {
            setError('密碼錯誤');
            setPin('');
          }
        }, 300);
      }
    }
  };

  const handleDelete = () => {
    if (step === 'confirm') setConfirmPin(prev => prev.slice(0, -1));
    else setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const currentPin = step === 'confirm' ? confirmPin : pin;
  const title = step === 'enter' ? '設定 4 位數密碼' : step === 'confirm' ? '再次確認密碼' : '請輸入密碼';

  return (
    <div className="text-center space-y-5">
      <div>
        <p className="text-base font-bold" style={{ color: '#3D3530' }}>{title}</p>
        {error && <p className="text-xs mt-1" style={{ color: '#E8735A' }}>{error}</p>}
      </div>
      {/* PIN dots */}
      <div className="flex justify-center gap-4">
        {[0, 1, 2, 3].map(i => (
          <motion.div
            key={i}
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: i < currentPin.length ? '#8FA886' : '#F0EDE8' }}
            animate={{ scale: i === currentPin.length - 1 && currentPin.length > 0 ? [1, 1.3, 1] : 1 }}
            transition={{ duration: 0.2 }}
          />
        ))}
      </div>
      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3">
        {['1','2','3','4','5','6','7','8','9','','0','←'].map(key => (
          <button
            key={key || 'empty'}
            onClick={() => key === '←' ? handleDelete() : key ? handleDigit(key) : null}
            disabled={!key}
            className="h-12 rounded-2xl text-lg font-medium transition-all active:scale-95"
            style={{
              backgroundColor: key ? '#FAF8F5' : 'transparent',
              color: '#3D3530',
              border: key ? '1px solid #F0EDE8' : 'none',
            }}
          >
            {key}
          </button>
        ))}
      </div>
      {/* Remove PIN option */}
      <div className="flex gap-2">
        {isLocked && (
          <button onClick={() => { localStorage.removeItem('healing_app_pin'); try { const u = auth.currentUser; if (u) setDoc(doc(db, 'user_data', u.uid), { appPin: null }, { merge: true }).catch(e => console.error('[Firestore] write:', e)); } catch {} onPinRemoved(); }}
            className="flex-1 text-xs py-2 rounded-xl" style={{ color: '#E8735A', backgroundColor: '#FAF8F5' }}>
            移除密碼
          </button>
        )}
        <button onClick={onClose} className="flex-1 text-xs py-2 rounded-xl" style={{ color: '#8C7B72', backgroundColor: '#FAF8F5' }}>
          取消
        </button>
      </div>
    </div>
  );
}

// === Diary Entry Detail (view record + edit note) ===
function DiaryEntryDetail({ date, record, privacyMode, onSaveNote }: {
  date: string;
  record: HealingRecord | null;
  privacyMode: boolean;
  onSaveNote: (note: string) => void;
}) {
  const [note, setNote] = useState(record?.note || '');
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const getWeekday = (dateStr: string): string => {
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    return '週' + days[new Date(dateStr).getDay()];
  };

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  if (!record) {
    return (
      <div className="text-center py-8">
        <p className="text-2xl mb-2">🌿</p>
        <p className="text-sm" style={{ color: '#8C7B72' }}>{date.slice(5)} {getWeekday(date)}</p>
        <p className="text-xs mt-1" style={{ color: '#B8ADA6' }}>這天還沒有記錄</p>
      </div>
    );
  }

  const emo = getEmotionInfo(record.emotion);
  const healingData = getHealingData(record.emotion, record.level || 'L1');

  return (
    <div className="space-y-4">
      {/* Date + Emotion header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: emo.color + '20' }}>
          <span className="text-2xl" style={{ filter: privacyMode ? 'blur(4px)' : 'none' }}>{emo.emoji}</span>
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{date.slice(5)} {getWeekday(date)}</p>
          <p className="text-xs" style={{ color: '#8C7B72', filter: privacyMode ? 'blur(4px)' : 'none' }}>
            {emo.label}
            {record.subEmotion ? ` · ${record.subEmotion}` : ''}
            {record.level ? ` · ${record.level === 'L1' ? '微微的' : record.level === 'L2' ? '中等程度' : '很強烈'}` : ''}
          </p>
        </div>
      </div>

      {/* Note section */}
      <div className="rounded-2xl p-4" style={{ backgroundColor: '#FFFEF9' }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium" style={{ color: '#B8ADA6' }}>心情筆記</p>
          <button onClick={() => { if (isEditing) { onSaveNote(note); } setIsEditing(!isEditing); }}
            className="text-xs px-2 py-1 rounded-lg transition-all"
            style={{ backgroundColor: isEditing ? '#8FA886' : '#F5F0E8', color: isEditing ? '#fff' : '#8C7B72' }}>
            {isEditing ? '儲存' : '編輯'}
          </button>
        </div>
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="寫下此刻的感受..."
            className="w-full text-sm leading-relaxed rounded-xl p-3 resize-none outline-none"
            style={{ backgroundColor: '#FAF8F5', color: '#3D3530', minHeight: '100px', border: '1px solid #E8E3DC' }}
          />
        ) : (
          <p className="text-sm leading-relaxed" style={{
            color: note ? '#3D3530' : '#B8ADA6',
            filter: privacyMode && note ? 'blur(6px)' : 'none',
            minHeight: '40px',
          }}>
            {note || '點擊編輯，寫下你的感受...'}
          </p>
        )}
      </div>

      {/* Healing recommendation */}
      {healingData && (
        <div className="rounded-2xl p-4" style={{ backgroundColor: '#F5F0E8' }}>
          <p className="text-xs font-medium mb-2" style={{ color: '#C9A96E' }}>今日療癒建議</p>
          <p className="text-xs leading-relaxed" style={{ color: '#8C7B72' }}>
            {healingData.warmMessages[0]}
          </p>
          <p className="text-xs mt-2 font-medium" style={{ color: '#8FA886' }}>
            🌿 {healingData.blend.oils.join(' + ')}
          </p>
        </div>
      )}
    </div>
  );
}

// ===================== PAGE: SOUND (SOUNDSCAPE ENGINE) =====================

function SoundPage({ recommendedEmotion }: { recommendedEmotion?: string }) {
  const {
    mainScape, auxScapes, activeBowls, isPlaying, timer, timerLeft,
    activeScene, pomodoro,
    playMain, toggleAux, stopAll, setTimer, playForEmotion, toggleBowl, strikeBowl,
    playScene, stopScene, stopPomodoro,
  } = useSoundscapeHook();

  const [showAux, setShowAux] = useState(true);
  const [showBowls, setShowBowls] = useState(true);
  const [showScenes, setShowScenes] = useState(false);
  const [showBreathing, setShowBreathing] = useState(false);
  // 分類各類預設
  const scapePresets = SCAPE_PRESETS_IMPORT.filter(p => p.isMain && p.category !== 'breathing' && p.category !== 'scene');
  const auxPresets = SCAPE_PRESETS_IMPORT.filter(p => !p.isMain);
  const breathingPresets = SCAPE_PRESETS_IMPORT.filter(p => p.category === 'breathing');
  const activeMainPreset = mainScape ? SCAPE_PRESETS_IMPORT.find(p => p.key === mainScape) : null;

  // 情緒推薦的呼吸/能量/冥想
  const wellnessRec = recommendedEmotion ? EMOTION_WELLNESS_MAP[recommendedEmotion] : undefined;

  // Auto-play emotion recommendation on first visit
  const hasAutoPlayed = useRef(false);
  useEffect(() => {
    if (recommendedEmotion && !hasAutoPlayed.current && !isPlaying) {
      hasAutoPlayed.current = true;
      playForEmotion(recommendedEmotion);
    }
  }, [recommendedEmotion, isPlaying, playForEmotion]);

  // 陪伴能量: earn energy when sound starts playing
  const hasEarnedSoundEnergy = useRef(false);
  useEffect(() => {
    if (isPlaying && !hasEarnedSoundEnergy.current) {
      hasEarnedSoundEnergy.current = true;
      // earnEnergy('sound'); // 暫時隱藏
    }
  }, [isPlaying]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const formatPomodoro = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div className="space-y-5" {...fadeInUp}>
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>聽一些讓你安靜的</h2>
        <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>
          {recommendedEmotion ? `今天的你適合聽：${activeMainPreset ? activeMainPreset.label : '為你挑選中...'}` : '先聽點什麼吧，讓身體慢下來'}
        </p>
      </div>

      {/* 推薦區 - Recommendation card (45% viewport height) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-3xl p-6 shadow-sm flex flex-col items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, #FAF8F5, #FFF8E7)',
          minHeight: '220px',
        }}
      >
        {activeMainPreset ? (
          <>
            <span className="text-6xl mb-3">{activeMainPreset.emoji}</span>
            <p className="text-sm font-bold text-center mb-2" style={{ color: '#3D3530' }}>
              今天的你適合聽：{activeMainPreset.label}
            </p>
            <p className="text-xs text-center mb-4" style={{ color: '#8C7B72' }}>
              {activeMainPreset.subtitle || '陪著你慢慢放鬆'}
            </p>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => playForEmotion(recommendedEmotion || 'neutral')}
              className="w-16 h-16 rounded-full flex items-center justify-center text-2xl shadow-md"
              style={{ backgroundColor: '#8FA886', color: 'white' }}
            >
              ▶
            </motion.button>
          </>
        ) : (
          <>
            <span className="text-5xl mb-3">🎵</span>
            <p className="text-sm font-bold text-center mb-2" style={{ color: '#3D3530' }}>
              先聽點什麼吧
            </p>
            <p className="text-xs text-center" style={{ color: '#8C7B72' }}>
              讓身體慢下來
            </p>
          </>
        )}
      </motion.div>

      {/* 快捷場景 - Quick scene buttons */}
      <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
        {[
          { emoji: '🌙', label: '3分鐘安定', timer: 180, preset: 'deep-night' },
          { emoji: '😴', label: '20分鐘入眠', timer: 1200, preset: 'ocean-night' },
          { emoji: '🧘', label: '專注工作', timer: 0, preset: 'focus' },
          { emoji: '💆', label: '午休放鬆', timer: 900, preset: 'forest-breath' },
        ].map(scene => (
          <motion.button
            key={scene.label}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              const preset = SCAPE_PRESETS_IMPORT.find(p => p.key === scene.preset);
              if (preset) {
                playMain(preset);
                if (scene.timer > 0) setTimer(scene.timer / 60);
              }
            }}
            className="flex-shrink-0 px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap"
            style={{ backgroundColor: '#FAF8F5', color: '#3D3530' }}
          >
            {scene.emoji} {scene.label}
          </motion.button>
        ))}
      </div>

      {/* Now playing */}
      {isPlaying && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-5"
          style={{ background: 'linear-gradient(135deg, #2D2438, #1A1A2E)' }}
        >
          {/* Active scape visualization */}
          <div className="flex items-center gap-3 mb-3">
            <motion.div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: activeMainPreset?.color ? activeMainPreset.color + '40' : '#ffffff20' }}
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <span className="text-xl">{activeMainPreset?.emoji || '🎵'}</span>
            </motion.div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">
                {activeMainPreset?.label || '播放中'}
              </p>
              <p className="text-xs" style={{ color: '#B8A8C8' }}>
                {[
                  activeMainPreset?.breathingPattern ? `🫧 吸${activeMainPreset.breathingPattern.inhale}s 停${activeMainPreset.breathingPattern.hold}s 吐${activeMainPreset.breathingPattern.exhale}s` : '',
                  auxScapes.length > 0 ? `+ ${auxScapes.map(k => SCAPE_PRESETS_IMPORT.find(p => p.key === k)?.label || '').join('、')}` : '',
                  activeBowls.length > 0 ? `🔮 ${activeBowls.map(k => CRYSTAL_BOWL_PRESETS.find(b => b.key === k)?.label || '').join('、')}` : '',
                ].filter(Boolean).join(' ') || activeMainPreset?.subtitle || ''}
              </p>
              {timerLeft > 0 && (
                <p className="text-xs mt-0.5" style={{ color: '#C9A96E' }}>
                  {formatTime(timerLeft)} 後輕輕停下
                </p>
              )}
            </div>
            <button
              onClick={stopAll}
              className="px-3 py-1.5 rounded-full text-xs font-medium"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#E0D0F0' }}
            >
              停止
            </button>
          </div>

          {/* Breathing indicator */}
          <div className="flex justify-center">
            <motion.div
              className="w-16 h-1 rounded-full"
              style={{ backgroundColor: activeMainPreset?.color || '#8FA886' }}
              animate={{ scaleX: [0.6, 1, 0.6], opacity: [0.4, 0.8, 0.4] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>

          {/* Timer */}
          <div className="flex gap-2 mt-3 justify-center">
            <p className="text-xs self-center" style={{ color: '#B8A8C8' }}>陪伴時間：</p>
            {[15, 30, 60, 0].map(m => (
              <button
                key={m}
                onClick={() => setTimer(m)}
                className="px-2.5 py-1 rounded-full text-xs"
                style={{
                  backgroundColor: timer === m ? 'rgba(255,255,255,0.2)' : 'transparent',
                  color: timer === m ? '#fff' : '#8B7BA8',
                  border: `1px solid ${timer === m ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'}`
                }}
              >
                {m === 0 ? '不限' : `${m}分`}
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Main soundscapes */}
      <div>
        <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>
          選一個主要音景
        </p>
        <p className="text-xs mb-3" style={{ color: '#8C7B72' }}>
          每一種都是多層疊合的自然聲音，會像呼吸一樣慢慢起伏
        </p>
        <div className="space-y-2">
          {scapePresets.map(preset => {
            const isActive = mainScape === preset.key;
            return (
              <motion.button
                key={preset.key}
                whileTap={{ scale: 0.98 }}
                onClick={() => playMain(preset)}
                className="w-full rounded-2xl p-4 text-left transition-all"
                style={{
                  backgroundColor: isActive ? preset.color + '20' : '#FFFEF9',
                  border: isActive ? `2px solid ${preset.color}` : '1px solid #F0EDE8',
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{preset.emoji}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: '#3D3530' }}>{preset.label}</p>
                    <p className="text-xs" style={{ color: '#8C7B72' }}>{preset.subtitle}</p>
                  </div>
                  {isActive && (
                    <motion.div
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: preset.color }} />
                    </motion.div>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Aux soundscapes (expandable) */}
      <div>
        <button
          onClick={() => setShowAux(!showAux)}
          className="flex items-center gap-2 mb-2"
        >
          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>
            加一點陪伴
          </p>
          <span className="text-xs" style={{ color: '#8C7B72' }}>
            {showAux ? '收起' : `最多疊 2 個 →`}
          </span>
        </button>
        <AnimatePresence>
          {showAux && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-2"
            >
              {auxPresets.map(preset => {
                const isActive = auxScapes.includes(preset.key);
                return (
                  <motion.button
                    key={preset.key}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => toggleAux(preset)}
                    className="w-full rounded-2xl p-3 text-left transition-all flex items-center gap-3"
                    style={{
                      backgroundColor: isActive ? preset.color + '20' : '#FFFEF9',
                      border: isActive ? `2px solid ${preset.color}` : '1px solid #F0EDE8',
                    }}
                  >
                    <span className="text-xl">{preset.emoji}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium" style={{ color: '#3D3530' }}>{preset.label}</p>
                      <p className="text-xs" style={{ color: '#8C7B72' }}>{preset.subtitle}</p>
                    </div>
                    {isActive && (
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: preset.color }} />
                    )}
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ===================== CRYSTAL BOWL SECTION ===================== */}
      <div>
        <button
          onClick={() => setShowBowls(!showBowls)}
          className="flex items-center gap-2 mb-2"
        >
          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>
            水晶頌缽
          </p>
          <span className="text-xs" style={{ color: '#8C7B72' }}>
            {showBowls ? '收起' : '療癒頻率 →'}
          </span>
          {activeBowls.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#9B7EC820', color: '#9B7EC8' }}>
              {activeBowls.length} 播放中
            </span>
          )}
        </button>
        <AnimatePresence>
          {showBowls && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-2 overflow-hidden"
            >
              <p className="text-xs" style={{ color: '#8C7B72' }}>
                水晶缽的純淨泛音可以與白噪音疊加，帶來更深層的放鬆
              </p>
              {CRYSTAL_BOWL_PRESETS.map(bowl => {
                const isActive = activeBowls.includes(bowl.key);
                return (
                  <motion.div
                    key={bowl.key}
                    className="rounded-2xl p-4 transition-all"
                    style={{
                      backgroundColor: isActive ? bowl.color + '15' : '#FFFEF9',
                      border: isActive ? `2px solid ${bowl.color}` : '1px solid #F0EDE8',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <motion.button
                        whileTap={{ scale: 0.85 }}
                        onClick={() => strikeBowl(bowl)}
                        className="w-11 h-11 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: bowl.color + '20' }}
                      >
                        <span className="text-xl">{bowl.emoji}</span>
                      </motion.button>
                      <div className="flex-1">
                        <p className="text-sm font-medium" style={{ color: '#3D3530' }}>{bowl.label}</p>
                        <p className="text-xs" style={{ color: '#8C7B72' }}>{bowl.subtitle}</p>
                      </div>
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => toggleBowl(bowl)}
                        className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                        style={{
                          backgroundColor: isActive ? bowl.color : '#F5F0E8',
                          color: isActive ? '#fff' : '#8C7B72',
                        }}
                      >
                        {isActive ? '停止' : '持續'}
                      </motion.button>
                    </div>
                    {/* Frequency visualization when active */}
                    {isActive && (
                      <motion.div
                        className="flex justify-center gap-1 mt-2"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        {bowl.harmonics.slice(0, 5).map((_h, i) => (
                          <motion.div
                            key={i}
                            className="w-1 rounded-full"
                            style={{ backgroundColor: bowl.color }}
                            animate={{
                              height: [8, 16 * bowl.harmonicGains[i], 8],
                              opacity: [0.4, 0.8, 0.4],
                            }}
                            transition={{
                              duration: 2 + i * 0.5,
                              repeat: Infinity,
                              ease: 'easeInOut',
                              delay: i * 0.2,
                            }}
                          />
                        ))}
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Now playing: bowl info in player */}
      {activeBowls.length > 0 && !isPlaying && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-4"
          style={{ background: 'linear-gradient(135deg, #2D2438, #1A1A2E)' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">
                {CRYSTAL_BOWL_PRESETS.find(b => b.key === activeBowls[0])?.emoji || '🔮'}
              </span>
              <div>
                <p className="text-sm font-medium text-white">水晶缽播放中</p>
                <p className="text-xs" style={{ color: '#B8A8C8' }}>
                  {activeBowls.map(k => CRYSTAL_BOWL_PRESETS.find(b => b.key === k)?.label || '').join('、')}
                </p>
              </div>
            </div>
            <button
              onClick={stopAll}
              className="px-3 py-1.5 rounded-full text-xs font-medium"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#E0D0F0' }}
            >
              停止
            </button>
          </div>
        </motion.div>
      )}

      {/* Gentle tip */}
      <div className="rounded-2xl p-4" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
        <p className="text-xs leading-relaxed italic text-center" style={{ color: '#8C7B72' }}>
          這些聲音會像呼吸一樣慢慢起伏，偶爾有一點小變化。<br/>
          水晶缽可以和任何音景疊加，帶來更深層的放鬆。
        </p>
      </div>
    </motion.div>
  );
}

// ===================== PAGE: SHOP (COMMERCE) =====================

// 地區設定
type ShopRegion = 'taipei' | 'taichung' | 'kaohsiung';
const SHOP_REGIONS: { key: ShopRegion; label: string; emoji: string; wcCategoryId: number }[] = [
  { key: 'taipei', label: '台北店', emoji: '🏙️', wcCategoryId: 128 },
  { key: 'taichung', label: '台中店', emoji: '🌿', wcCategoryId: 32 },
  { key: 'kaohsiung', label: '高雄店', emoji: '☀️', wcCategoryId: 133 },
];

// 各地區對應的課程分類（子分類在 WC 裡是 parent=17 老師教我做）
const REGION_CATEGORIES: Record<ShopRegion, { id: number; name: string }[]> = {
  taipei: [
    { id: 128, name: '全部' },
    { id: 200, name: '下班隨手飾' },
    { id: 21, name: '手作飾品' },
    { id: 22, name: '多肉植栽' },
    { id: 24, name: '畫畫課程' },
    { id: 25, name: '花藝課程' },
    { id: 18, name: '蠟燭課程' },
    { id: 173, name: '精油調香' },
    { id: 212, name: '皮革課程' },
    { id: 149, name: '環氧樹脂' },
    { id: 150, name: '梭織系列' },
    { id: 151, name: '藍染課程' },
    { id: 61, name: '平板自己做' },
    { id: 75, name: 'DIY材料包' },
    { id: 27, name: '把我帶回家' },
  ],
  taichung: [
    { id: 32, name: '全部' },
    { id: 21, name: '手作飾品' },
    { id: 22, name: '多肉植栽' },
    { id: 24, name: '畫畫課程' },
    { id: 25, name: '花藝課程' },
    { id: 18, name: '蠟燭課程' },
    { id: 173, name: '精油調香' },
    { id: 75, name: 'DIY材料包' },
    { id: 27, name: '把我帶回家' },
  ],
  kaohsiung: [
    { id: 133, name: '全部' },
    { id: 21, name: '手作飾品' },
    { id: 22, name: '多肉植栽' },
    { id: 24, name: '畫畫課程' },
    { id: 25, name: '花藝課程' },
    { id: 18, name: '蠟燭課程' },
    { id: 173, name: '精油調香' },
    { id: 75, name: 'DIY材料包' },
    { id: 27, name: '把我帶回家' },
  ],
};

// Helper: load/save cart from localStorage for persistence across page navigation
function loadCartFromStorage(): CartItem[] {
  try {
    const saved = localStorage.getItem('healing_cart');
    if (saved) return JSON.parse(saved);
  } catch (e) { /* ignore */ }
  return [];
}
function saveCartToStorage(cart: CartItem[]) {
  try {
    localStorage.setItem('healing_cart', JSON.stringify(cart));
  } catch (e) { /* ignore */ }
}

function ShopPage({ initialView, initialProductId }: { initialView?: 'products' | 'cart' | 'checkout'; initialProductId?: number } = {}) {
  const [view, setView] = useState<'products' | 'detail' | 'cart' | 'checkout'>(initialProductId ? 'detail' : (initialView || 'products'));
  const [cart, setCart] = useState<CartItem[]>(() => loadCartFromStorage());
  const [selectedProduct, setSelectedProduct] = useState<WCProduct | null>(null);

  // Fetch product by ID if initialProductId is provided
  useEffect(() => {
    if (initialProductId && !selectedProduct) {
      fetch(`${API_BASE}/api/wc/products/${initialProductId}`)
        .then(r => r.json())
        .then(data => { if (data && data.id) { setSelectedProduct(data); setView('detail'); } })
        .catch(() => setView('products'));
    }
  }, [initialProductId]);
  const [selectedRegion, setSelectedRegion] = useState<ShopRegion>('taipei');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number>(128);

  // Persist cart to localStorage whenever it changes
  useEffect(() => {
    saveCartToStorage(cart);
  }, [cart]);

  const handleRegionChange = (region: ShopRegion) => {
    setSelectedRegion(region);
    // Reset to "全部" for that region
    const regionCats = REGION_CATEGORIES[region];
    setSelectedCategoryId(regionCats[0].id);
  };

  const addToCart = (item: CartItem) => {
    const existingItem = cart.find(c => c.id === item.id);
    if (existingItem) {
      setCart(cart.map(c => c.id === item.id ? { ...c, quantity: c.quantity + item.quantity } : c));
    } else {
      setCart([...cart, item]);
    }
    setView('cart');
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
      {view === 'products' && <ShopProductsView region={selectedRegion} onRegionChange={handleRegionChange} categoryId={selectedCategoryId} onSelectCategory={setSelectedCategoryId} onSelectProduct={handleSelectProduct} onNavigateCart={() => setView('cart')} cartCount={cart.length} />}
      {view === 'detail' && selectedProduct && <ProductDetailView product={selectedProduct} onBack={handleBackFromDetail} onAddToCart={addToCart} onNavigateCart={() => setView('cart')} cartCount={cart.length} />}
      {view === 'cart' && <CartView cart={cart} onUpdateQuantity={updateCartQuantity} onRemove={removeFromCart} onCheckout={() => setView('checkout')} onBack={() => setView('products')} />}
      {view === 'checkout' && <CheckoutView cart={cart} onBack={() => setView('cart')} onClearCart={() => { setCart([]); saveCartToStorage([]); }} />}
    </motion.div>
  );
}


function ShopProductsView({
  region,
  onRegionChange,
  categoryId,
  onSelectCategory,
  onSelectProduct,
  onNavigateCart,
  cartCount,
}: {
  region: ShopRegion;
  onRegionChange: (r: ShopRegion) => void;
  categoryId: number;
  onSelectCategory: (id: number) => void;
  onSelectProduct: (product: WCProduct) => void;
  onNavigateCart: () => void;
  cartCount: number;
}) {
  const [products, setProducts] = useState<WCProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wishlistIds, setWishlistIds] = useState<number[]>(() => loadWishlist().map(w => w.productId));
  const [wishlistToast, setWishlistToast] = useState('');
  const categoryScrollRef = useRef<HTMLDivElement>(null);

  // Scenario tag filter state
  const [activeScenario, setActiveScenario] = useState<string | null>(null);

  // Scenario tag definitions with matching logic
  const SCENARIO_TAGS = [
    {
      emoji: '🧘', label: '想放鬆',
      // 香氛蠟燭(18), 精油調香(173), 花藝(25), booking預約制
      match: (p: WCProduct) => {
        const cids = p.categories?.map(c => c.id) || [];
        return cids.some(id => [18, 173, 25].includes(id)) || p.type === 'phive_booking' ||
          /香氛|蠟燭|精油|調香|花藝|花盒|浮游花/.test(p.name);
      },
    },
    {
      emoji: '😴', label: '想好睡',
      // 香氛蠟燭(18), 精油調香(173)
      match: (p: WCProduct) => {
        const cids = p.categories?.map(c => c.id) || [];
        return cids.some(id => [18, 173].includes(id)) || /香氛|蠟燭|精油|調香|擴香/.test(p.name);
      },
    },
    {
      emoji: '💆', label: '穩定情緒',
      // 水晶飾品(21,200), 多肉植栽(22), 苔球, 生態瓶
      match: (p: WCProduct) => {
        const cids = p.categories?.map(c => c.id) || [];
        return cids.some(id => [21, 22, 200].includes(id)) || p.type === 'phive_booking' ||
          /水晶|多肉|苔球|苔蘚|生態|鹿角蕨|植栽/.test(p.name);
      },
    },
    {
      emoji: '🎨', label: '想創作',
      // 畫畫(24), 皮革(211,212), 梭織(150), 樹脂(149), 流體畫
      match: (p: WCProduct) => {
        const cids = p.categories?.map(c => c.id) || [];
        return cids.some(id => [24, 149, 150, 211, 212].includes(id)) ||
          /畫|皮革|編織|Macrame|藍染|樹脂/.test(p.name);
      },
    },
    {
      emoji: '🕯️', label: '做儀式',
      // 香氛蠟燭(18), 水晶(21), 精油(173)
      match: (p: WCProduct) => {
        const cids = p.categories?.map(c => c.id) || [];
        return cids.some(id => [18, 21, 173].includes(id)) ||
          /蠟燭|精油|調香|水晶|能量/.test(p.name);
      },
    },
    {
      emoji: '🎁', label: '送禮',
      // 把我帶回家(27), 手作禮物(77), 禮盒(86), DIY材料包(75)
      match: (p: WCProduct) => {
        const cids = p.categories?.map(c => c.id) || [];
        return cids.some(id => [27, 77, 86, 75].includes(id)) || /禮物|禮盒|材料包/.test(p.name);
      },
    },
  ];

  // Date filter state
  type DateFilterMode = 'all' | 'this-week' | 'next-week' | 'custom';
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('all');
  const [customDate, setCustomDate] = useState('');
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Helper: parse date from variable product 場次 option string
  // Format examples: "03/01 (日) 1100-1230", "03/15 (日) 1300–1430"
  const parseSessionDate = (opt: string): string | null => {
    const m = opt.match(/^(\d{1,2})\/(\d{1,2})/);
    if (!m) return null;
    const now = new Date();
    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    // Determine year: if month < current month - 2, assume next year
    let year = now.getFullYear();
    if (month < now.getMonth() - 1) year += 1;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return dateStr;
  };

  // Get date range for filter mode
  const getFilterDateRange = (): { start: string; end: string } | null => {
    if (dateFilterMode === 'all') return null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (dateFilterMode === 'custom' && customDate) {
      return { start: customDate, end: customDate };
    }
    if (dateFilterMode === 'this-week') {
      const dayOfWeek = today.getDay(); // 0=Sun
      const startOfWeek = new Date(today);
      // Start from today (not Monday), end on Sunday
      const endOfWeek = new Date(today);
      endOfWeek.setDate(today.getDate() + (7 - dayOfWeek));
      const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { start: fmt(today), end: fmt(endOfWeek) };
    }
    if (dateFilterMode === 'next-week') {
      const dayOfWeek = today.getDay();
      const nextMon = new Date(today);
      nextMon.setDate(today.getDate() + (8 - dayOfWeek));
      const nextSun = new Date(nextMon);
      nextSun.setDate(nextMon.getDate() + 6);
      const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { start: fmt(nextMon), end: fmt(nextSun) };
    }
    return null;
  };

  // Check if a product matches the date filter
  const productMatchesDateFilter = (product: WCProduct): boolean => {
    const range = getFilterDateRange();
    if (!range) return true; // 'all' mode — show everything

    // Booking products: always show (they're available any day unless specifically blocked)
    if (product.type === 'phive_booking') return true;

    // Variable products: check if any 場次 falls within range
    if (product.type === 'variable' && product.attributes) {
      const sessionAttr = product.attributes.find(a => a.name.includes('場次'));
      if (sessionAttr) {
        return sessionAttr.options.some(opt => {
          const dateStr = parseSessionDate(opt);
          if (!dateStr) return false;
          return dateStr >= range.start && dateStr <= range.end;
        });
      }
    }

    // Simple / other products: always show
    return true;
  };

  const toggleWishlist = (product: WCProduct, e: React.MouseEvent) => {
    e.stopPropagation();
    const current = loadWishlist();
    const exists = current.some(w => w.productId === product.id);
    if (exists) {
      const updated = current.filter(w => w.productId !== product.id);
      saveWishlist(updated);
      setWishlistIds(updated.map(w => w.productId));
      setWishlistToast('沒關係，隨時可以再回來看');
    } else {
      // Auto-assign tag based on category
      let tag: WishlistTag = '晚點再決定';
      const cats = product.categories?.map(c => c.id) || [];
      if (product.virtual || cats.some(c => [18, 21, 22, 24, 25, 173, 212].includes(c))) tag = '想上的課';
      else if (cats.includes(27)) tag = '想帶回家的香氣';
      else if (cats.includes(75)) tag = '想帶回家的香氣';

      const item: WishlistItem = {
        productId: product.id,
        name: product.name,
        price: product.price,
        image: product.images?.[0]?.src,
        tag,
        addedAt: Date.now(),
      };
      const updated = [...current, item];
      saveWishlist(updated);
      setWishlistIds(updated.map(w => w.productId));
      setWishlistToast('已經幫你記住了');
    }
    setTimeout(() => setWishlistToast(''), 2000);
  };

  const MAIN_CATEGORIES = REGION_CATEGORIES[region];

  // Categories that are NOT region-specific (show regardless of region)
  const NO_REGION_FILTER_CATS = [75, 27, 61, 200]; // DIY材料包, 把我帶回家, 平板自己做, 下班隨手飾
  const regionInfo = SHOP_REGIONS.find(r => r.key === region)!;

  useEffect(() => {
    const fetchProducts = async () => {
      console.log(`載入 ${region} 分類 ${categoryId} 的商品...`);
      setLoading(true);
      setError(null);
      try {
        const url = `${API_BASE}/api/wc/products?category=${categoryId}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('載入商品失敗');
        const data = await response.json();
        let filtered: WCProduct[] = Array.isArray(data) ? data : [];

        // If we're fetching a shared sub-category (like 手作飾品),
        // filter to only show products also in the current region category
        const isRegionRoot = categoryId === regionInfo.wcCategoryId;
        const isNoRegionCat = NO_REGION_FILTER_CATS.includes(categoryId);
        if (!isRegionRoot && !isNoRegionCat) {
          filtered = filtered.filter(p =>
            p.categories?.some(c => c.id === regionInfo.wcCategoryId)
          );
        }

        console.log(`成功載入 ${filtered.length} 件商品 (原始 ${data?.length || 0})`);
        setProducts(filtered);
      } catch (err) {
        console.error('載入商品錯誤:', err);
        setError('無法載入商品，請重試');
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [categoryId, region]);

  return (
    <motion.div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>🛍️ 商城</h2>
          <p className="text-xs" style={{ color: '#8C7B72' }}>探索精油體驗與手作商品</p>
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

      {/* Region Switcher - 地區切換 */}
      <div className="flex gap-1.5 p-1 rounded-2xl" style={{ backgroundColor: '#F0EDE8' }}>
        {SHOP_REGIONS.map(r => (
          <motion.button
            key={r.key}
            whileTap={{ scale: 0.96 }}
            onClick={() => onRegionChange(r.key)}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-center transition-all"
            style={{
              backgroundColor: region === r.key ? '#FFFEF9' : 'transparent',
              color: region === r.key ? '#3D3530' : '#8C7B72',
              boxShadow: region === r.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {r.emoji} {r.label}
          </motion.button>
        ))}
      </div>

      {/* 台北店特有提示 */}
      {region === 'taipei' && (
        <p className="text-[11px] text-center" style={{ color: '#8C7B72' }}>
          📍 台北西門｜每日 10:00-22:00｜老師教學 + 平板自己做 + 隨手飾
        </p>
      )}
      {region === 'taichung' && (
        <p className="text-[11px] text-center" style={{ color: '#8C7B72' }}>
          📍 台中｜老師教學課程
        </p>
      )}
      {region === 'kaohsiung' && (
        <p className="text-[11px] text-center" style={{ color: '#8C7B72' }}>
          📍 高雄｜老師教學課程
        </p>
      )}

      {/* Date Filter — 日期篩選 */}
      <div className="rounded-2xl p-3" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
        <p className="text-xs font-medium mb-2" style={{ color: '#8C7B72' }}>📅 什麼時候有空？</p>
        <div className="flex gap-2 flex-wrap">
          {([
            { key: 'all' as DateFilterMode, label: '全部' },
            { key: 'this-week' as DateFilterMode, label: '本週' },
            { key: 'next-week' as DateFilterMode, label: '下週' },
            { key: 'custom' as DateFilterMode, label: '選日期' },
          ]).map(f => (
            <motion.button
              key={f.key}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setDateFilterMode(f.key);
                if (f.key === 'custom') {
                  setTimeout(() => dateInputRef.current?.showPicker?.(), 100);
                }
                if (f.key !== 'custom') setCustomDate('');
              }}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                backgroundColor: dateFilterMode === f.key ? '#8FA886' : '#FAF8F5',
                color: dateFilterMode === f.key ? '#fff' : '#3D3530',
                border: `1px solid ${dateFilterMode === f.key ? '#8FA886' : '#F0EDE8'}`,
              }}
            >
              {f.label}
            </motion.button>
          ))}
        </div>
        {dateFilterMode === 'custom' && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-2">
            <input
              ref={dateInputRef}
              type="date"
              value={customDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={e => setCustomDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none"
              style={{ backgroundColor: '#FAF8F5', border: '1px solid #F0EDE8', color: '#3D3530' }}
            />
          </motion.div>
        )}
        {dateFilterMode !== 'all' && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[11px] mt-2" style={{ color: '#8FA886' }}>
            {dateFilterMode === 'custom' && customDate
              ? `📍 顯示 ${customDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$2/$3')} 有場次的課程`
              : dateFilterMode === 'this-week'
                ? '📍 顯示本週內有場次的課程'
                : dateFilterMode === 'next-week'
                  ? '📍 顯示下週有場次的課程'
                  : '📍 選擇日期來篩選課程'
            }
            {' '}· 預約制課程不受日期限制
          </motion.p>
        )}
      </div>

      {/* 情境入口 - Emotion Scenario Buttons */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
        {SCENARIO_TAGS.map(scenario => (
          <motion.button
            key={scenario.label}
            whileTap={{ scale: 0.96 }}
            onClick={() => setActiveScenario(activeScenario === scenario.label ? null : scenario.label)}
            className="flex-shrink-0 px-4 py-2 rounded-full text-xs font-medium transition-all"
            style={{
              backgroundColor: activeScenario === scenario.label ? '#8FA886' : '#FAF8F5',
              color: activeScenario === scenario.label ? '#fff' : '#3D3530',
              whiteSpace: 'nowrap',
              border: `1px solid ${activeScenario === scenario.label ? '#8FA886' : '#F0EDE8'}`,
            }}
          >
            {scenario.emoji} {scenario.label}
          </motion.button>
        ))}
      </div>
      {activeScenario && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between">
          <p className="text-[11px]" style={{ color: '#8FA886' }}>
            ✨ 為「{activeScenario}」的你推薦
          </p>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setActiveScenario(null)}
            className="text-[10px] px-2 py-0.5 rounded-full"
            style={{ backgroundColor: '#FAF8F5', color: '#8C7B72' }}
          >
            清除
          </motion.button>
        </motion.div>
      )}

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
      {(() => {
        const activeTag = SCENARIO_TAGS.find(t => t.label === activeScenario);
        const filteredProducts = products
          .filter(productMatchesDateFilter)
          .filter(p => activeTag ? activeTag.match(p) : true);
        const hasDateFilter = dateFilterMode !== 'all';
        const hasAnyFilter = hasDateFilter || !!activeScenario;
        const hiddenCount = products.length - filteredProducts.length;
        return (<>
      {!loading && !error && filteredProducts.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl p-8 text-center"
          style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
        >
          <p style={{ color: '#8C7B72' }}>
            {hasAnyFilter ? '沒有找到符合的課程，試試調整篩選條件？' : '此分類暫無商品'}
          </p>
          {hasAnyFilter && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => { setDateFilterMode('all'); setCustomDate(''); setActiveScenario(null); }}
              className="mt-3 px-4 py-2 rounded-full text-xs font-medium"
              style={{ backgroundColor: '#8FA886', color: '#fff' }}
            >
              清除所有篩選
            </motion.button>
          )}
        </motion.div>
      )}

      {!loading && !error && filteredProducts.length > 0 && (<>
        {hasAnyFilter && hiddenCount > 0 && (
          <p className="text-[11px] text-center" style={{ color: '#8C7B72' }}>
            已篩選出 {filteredProducts.length} 個符合的商品（已隱藏 {hiddenCount} 個）
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          {filteredProducts.map((product, idx) => (
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
                className="w-full aspect-square bg-gradient-to-br from-orange-100 to-pink-50 flex items-center justify-center overflow-hidden relative"
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
                {/* Out of stock overlay */}
                {product.stock_status === 'outofstock' && (
                  <div className="absolute bottom-0 left-0 right-0 py-1 px-2 text-center"
                    style={{ backgroundColor: 'rgba(61,53,48,0.75)', backdropFilter: 'blur(2px)' }}>
                    <span className="text-[10px] font-bold text-white">預約包班</span>
                  </div>
                )}
                {/* Wishlist Heart */}
                <motion.div
                  whileTap={{ scale: 1.3 }}
                  onClick={(e) => toggleWishlist(product, e)}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: wishlistIds.includes(product.id) ? '#E8475820' : '#00000025',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  <span style={{ fontSize: 16 }}>
                    {wishlistIds.includes(product.id) ? '♥' : '♡'}
                  </span>
                </motion.div>
              </div>

              {/* Product Info */}
              <div className="p-3">
                <p
                  className="text-xs font-bold line-clamp-2"
                  style={{ color: '#3D3530' }}
                >
                  {product.name}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <p
                    className="text-sm font-bold"
                    style={{ color: product.stock_status === 'outofstock' ? '#B5AFA8' : '#8FA886' }}
                  >
                    NT${parseFloat(product.price).toLocaleString('zh-TW', { maximumFractionDigits: 0 })}
                  </p>
                  {product.stock_status === 'outofstock' && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: '#F0EDE8', color: '#8C7B72' }}>
                      預約包班
                    </span>
                  )}
                </div>
                {/* Next session date tag */}
                {product.type === 'variable' && product.attributes && (() => {
                  const sessionAttr = product.attributes.find(a => a.name.includes('場次'));
                  if (!sessionAttr) return null;
                  const todayStr = new Date().toISOString().split('T')[0];
                  const futureSessions = sessionAttr.options
                    .map(opt => ({ opt, date: parseSessionDate(opt) }))
                    .filter(s => s.date && s.date >= todayStr)
                    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
                  if (futureSessions.length === 0) return null;
                  const next = futureSessions[0].opt.split(' ').slice(0, 2).join(' ');
                  return (
                    <p className="text-[10px] mt-1" style={{ color: '#8C7B72' }}>
                      📅 最近：{next}
                    </p>
                  );
                })()}
                {product.type === 'phive_booking' && (
                  <p className="text-[10px] mt-1" style={{ color: '#C9A96E' }}>
                    🕐 預約制・隨時可約
                  </p>
                )}
              </div>
            </motion.button>
          ))}
        </div>
      </>)}
      </>); })()}

      {/* Wishlist Toast */}
      <AnimatePresence>
        {wishlistToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl text-xs font-medium shadow-lg"
            style={{ backgroundColor: '#3D3530', color: 'white' }}
          >
            {wishlistToast}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface WCVariation {
  id: number;
  price: string;
  stock_status: string;
  attributes: { name: string; option: string }[];
}

function ProductDetailView({ product, onBack, onAddToCart, onNavigateCart, cartCount }: { product: WCProduct; onBack: () => void; onAddToCart: (item: CartItem) => void; onNavigateCart?: () => void; cartCount?: number }) {
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [showFullDesc, setShowFullDesc] = useState(false);

  // Variable product state
  const [variations, setVariations] = useState<WCVariation[]>([]);
  const [variationsLoading, setVariationsLoading] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [selectedVariation, setSelectedVariation] = useState<WCVariation | null>(null);

  // Booking product state (phive_booking type)
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  const [bookingSlots, setBookingSlots] = useState<{ date: string; time: string; endTime: string; available: boolean; remainingCapacity: number }[]>([]);
  const [bookingConfig, setBookingConfig] = useState<{ allowedPerSlot: number; maxParticipants: number; minParticipants: number; personEnable: boolean; personsMultiply: boolean; basePrice: number } | null>(null);
  const [bookingSlotsLoading, setBookingSlotsLoading] = useState(false);

  const isVariable = product.type === 'variable';
  const isBooking = product.type === 'phive_booking';

  // Smart isVirtual: 只有「把我帶回家(27)/手作禮物系列(77)/禮盒(86)」且不屬於任何課程分類的商品才是實體
  const catIds = product.categories?.map(c => c.id) || [];
  const COURSE_CAT_IDS = [17, 18, 19, 21, 22, 24, 25, 61, 128, 133, 149, 150, 151, 173, 200, 211, 212];
  const PHYSICAL_CAT_IDS = [27, 77, 86];
  const isCourseProduct = catIds.some(id => COURSE_CAT_IDS.includes(id)) || product.name.includes('手作課程');
  const isPhysicalOnly = catIds.some(id => PHYSICAL_CAT_IDS.includes(id)) && !isCourseProduct;
  const isVirtual = !isPhysicalOnly;

  // Fetch variations for variable products
  useEffect(() => {
    if (!isVariable) return;
    setVariationsLoading(true);
    fetch(`${API_BASE}/api/wc/products/${product.id}/variations`)
      .then(res => res.json())
      .then((data: WCVariation[]) => {
        if (Array.isArray(data)) {
          setVariations(data);
        }
      })
      .catch(err => console.error('載入場次失敗:', err))
      .finally(() => setVariationsLoading(false));
  }, [product.id, isVariable]);

  // Fetch booking slots for booking products
  useEffect(() => {
    if (!isBooking) return;
    setBookingSlotsLoading(true);
    fetch(`${API_BASE}/api/wc/products/${product.id}/booking-slots`)
      .then(res => res.json())
      .then(data => {
        if (data.slots) setBookingSlots(data.slots);
        if (data.config) setBookingConfig(data.config);
      })
      .catch(err => console.error('載入預約時段失敗:', err))
      .finally(() => setBookingSlotsLoading(false));
  }, [product.id, isBooking]);

  // When selected options change, find matching variation
  useEffect(() => {
    if (!isVariable || variations.length === 0) return;
    const attrs = product.attributes || [];
    const allSelected = attrs.every(a => selectedOptions[a.name]);
    if (!allSelected) { setSelectedVariation(null); return; }
    const match = variations.find(v =>
      v.attributes.every(va => selectedOptions[va.name] === va.option)
    );
    setSelectedVariation(match || null);
  }, [selectedOptions, variations, isVariable, product.attributes]);

  // Get product attributes (for variable products)
  const productAttributes = product.attributes || [];

  // Filter available options based on current selections
  const getAvailableOptions = (attrName: string): string[] => {
    const attr = productAttributes.find(a => a.name === attrName);
    if (!attr) return [];
    // Filter to only show options that have at least one in-stock variation
    return attr.options.filter(opt => {
      return variations.some(v => {
        const matchesThis = v.attributes.some(va => va.name === attrName && va.option === opt);
        const matchesOthers = Object.entries(selectedOptions).every(([k, val]) => {
          if (k === attrName) return true;
          return v.attributes.some(va => va.name === k && va.option === val);
        });
        return matchesThis && matchesOthers && v.stock_status === 'instock';
      });
    });
  };

  // Booking: get available dates from slots
  const bookingDateOptions = useMemo(() => {
    if (!isBooking || bookingSlots.length === 0) return [];
    const dateMap = new Map<string, { hasAvailable: boolean; totalCapacity: number }>();
    bookingSlots.forEach(s => {
      const existing = dateMap.get(s.date) || { hasAvailable: false, totalCapacity: 0 };
      if (s.available) {
        existing.hasAvailable = true;
        existing.totalCapacity += s.remainingCapacity;
      }
      dateMap.set(s.date, existing);
    });
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return Array.from(dateMap.entries())
      .filter(([, info]) => info.hasAvailable)
      .map(([dateStr, info]) => {
        const d = new Date(dateStr + 'T00:00:00');
        return {
          value: dateStr,
          label: `${d.getMonth() + 1}/${d.getDate()} (${weekdays[d.getDay()]})`,
          totalCapacity: info.totalCapacity,
        };
      });
  }, [bookingSlots, isBooking]);

  // Booking: get available time slots for selected date
  const bookingTimeOptions = useMemo(() => {
    if (!bookingDate) return [];
    return bookingSlots
      .filter(s => s.date === bookingDate && s.available)
      .map(s => ({
        time: s.time,
        endTime: s.endTime,
        remaining: s.remainingCapacity,
      }));
  }, [bookingSlots, bookingDate]);

  // Selected slot remaining capacity
  const selectedSlotCapacity = useMemo(() => {
    if (!bookingDate || !bookingTime) return null;
    const slot = bookingSlots.find(s => s.date === bookingDate && s.time === bookingTime);
    return slot ? slot.remainingCapacity : null;
  }, [bookingSlots, bookingDate, bookingTime]);

  const unitPrice = selectedVariation ? parseFloat(selectedVariation.price) : parseFloat(product.price);
  const displayPrice = unitPrice;
  const totalPrice = unitPrice * quantity;

  const handleAddToCart = () => {
    if (isVariable && !selectedVariation) {
      alert('請選擇場次與票種');
      return;
    }
    if (isBooking && (!bookingDate || !bookingTime)) {
      alert('請選擇預約日期與時段');
      return;
    }

    const specsArr: string[] = [];
    if (isVariable && selectedVariation) {
      selectedVariation.attributes.forEach(a => specsArr.push(`${a.name}: ${a.option}`));
    }
    if (isBooking) {
      if (bookingDate) specsArr.push(`日期: ${bookingDate}`);
      if (bookingTime) {
        const slot = bookingTimeOptions.find(s => s.time === bookingTime);
        specsArr.push(`時段: ${bookingTime}${slot ? `-${slot.endTime}` : ''}`);
      }
      if (quantity > 1) specsArr.push(`人數: ${quantity}`);
    }

    const item: CartItem = {
      id: `product-${product.id}-${selectedVariation?.id || 'na'}-${bookingDate || 'na'}`,
      productId: product.id,
      variationId: selectedVariation?.id,
      name: product.name,
      specs: specsArr.join(' / '),
      price: Math.round(displayPrice),
      quantity,
      isVirtual,
      image: product.images?.[0]?.src,
      bookingDate: bookingDate || undefined,
      bookingTime: bookingTime || undefined,
    };
    onAddToCart(item);
  };

  const images = product.images && product.images.length > 0 ? product.images : [];

  return (
    <motion.div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <motion.button whileTap={{ scale: 0.9 }} onClick={onBack} className="text-xl">←</motion.button>
          <h2 className="text-lg font-bold" style={{ color: '#3D3530' }}>商品詳情</h2>
        </div>
        {onNavigateCart && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onNavigateCart}
            className="relative px-4 py-2 rounded-xl text-2xl"
            style={{ backgroundColor: '#FAF8F5' }}
          >
            🛒
            {(cartCount ?? 0) > 0 && (
              <span className="absolute top-0 right-0 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center" style={{ backgroundColor: '#8FA886', color: '#fff' }}>
                {cartCount}
              </span>
            )}
          </motion.button>
        )}
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

      {/* Image Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {images.map((img, idx) => (
            <motion.button
              key={idx}
              whileTap={{ scale: 0.9 }}
              onClick={() => setCurrentImageIdx(idx)}
              className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden"
              style={{ border: currentImageIdx === idx ? '2px solid #8FA886' : '1px solid #F0EDE8', opacity: currentImageIdx === idx ? 1 : 0.6 }}
            >
              <img src={img.src} alt="" className="w-full h-full object-cover" />
            </motion.button>
          ))}
        </div>
      )}

      {/* Product Info */}
      <motion.div className="rounded-2xl p-4" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
        <h3 className="text-lg font-bold mb-2" style={{ color: '#3D3530' }}>
          {product.name}
        </h3>
        <p className="text-2xl font-bold mb-2" style={{ color: '#8FA886' }}>
          NT${displayPrice.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}
          {isVariable && !selectedVariation && product.price && (
            <span className="text-sm font-normal ml-1" style={{ color: '#8C7B72' }}>起</span>
          )}
        </p>
        {/* 庫存/剩餘名額 */}
        {product.manage_stock && product.stock_quantity !== null && (
          <div className="mb-3">
            <span
              className="inline-block px-2 py-1 rounded-full text-xs font-medium"
              style={{
                backgroundColor: product.stock_quantity > 5 ? '#E8F0E8' : product.stock_quantity > 0 ? '#FFF3E0' : '#FFE8E8',
                color: product.stock_quantity > 5 ? '#4A7A3D' : product.stock_quantity > 0 ? '#E65100' : '#C62828',
              }}
            >
              {isVirtual
                ? `剩餘名額: ${product.stock_quantity} 位`
                : product.stock_quantity > 0
                  ? `庫存: ${product.stock_quantity} 件`
                  : '已售完'
              }
            </span>
          </div>
        )}
        {!product.manage_stock && product.stock_status === 'outofstock' && !isVariable && (
          <div className="mb-3 p-3 rounded-xl" style={{ backgroundColor: '#FAF8F5', border: '1px solid #F0EDE8' }}>
            <p className="text-xs font-bold" style={{ color: '#C9A96E' }}>目前無場次</p>
            <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>可與老師預約包班，LINE 或來電洽詢</p>
          </div>
        )}
        {product.short_description && (
          <div
            className="text-sm leading-relaxed wc-prose"
            style={{ color: '#5C534C' }}
            dangerouslySetInnerHTML={{ __html: product.short_description }}
          />
        )}
      </motion.div>

      {/* Variable Product: Attribute Selection (場次 / 票價) */}
      {isVariable && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-4 space-y-4"
          style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
        >
          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>🎫 選擇場次</p>

          {variationsLoading ? (
            <p className="text-xs" style={{ color: '#8C7B72' }}>載入場次中...</p>
          ) : productAttributes.length === 0 ? (
            <p className="text-xs" style={{ color: '#8C7B72' }}>此商品無需選擇規格</p>
          ) : (
            productAttributes.filter(a => a.variation).map(attr => {
              const availableOpts = getAvailableOptions(attr.name);
              return (
                <div key={attr.name}>
                  <label className="text-xs font-medium" style={{ color: '#3D3530' }}>{attr.name}</label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {attr.options.map((opt: string) => {
                      const isAvailable = availableOpts.includes(opt);
                      const isSelected = selectedOptions[attr.name] === opt;
                      return (
                        <motion.button
                          key={opt}
                          whileTap={isAvailable ? { scale: 0.95 } : {}}
                          onClick={() => {
                            if (!isAvailable) return;
                            setSelectedOptions(prev => ({ ...prev, [attr.name]: isSelected ? '' : opt }));
                          }}
                          className="py-2 px-3 rounded-lg text-xs font-medium transition-all"
                          style={{
                            backgroundColor: isSelected ? '#8FA886' : isAvailable ? '#FAF8F5' : '#F0EDE8',
                            color: isSelected ? '#fff' : isAvailable ? '#3D3530' : '#C0B8B0',
                            border: `1px solid ${isSelected ? '#8FA886' : '#F0EDE8'}`,
                            opacity: isAvailable ? 1 : 0.4,
                            textDecoration: isAvailable ? 'none' : 'line-through',
                          }}
                        >
                          {opt}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}

          {selectedVariation && (<>
            {/* Persons/Quantity — inside variable section */}
            <div className="pt-2 border-t" style={{ borderColor: '#F0EDE8' }}>
              <label className="text-xs font-medium" style={{ color: '#3D3530' }}>👥 人數</label>
              <div className="flex items-center gap-4 mt-2">
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-sm"
                  style={{ backgroundColor: '#FAF8F5', color: '#3D3530', border: '1px solid #F0EDE8' }}
                >−</motion.button>
                <span className="text-lg font-bold" style={{ color: '#3D3530' }}>{quantity}</span>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-sm"
                  style={{ backgroundColor: '#FAF8F5', color: '#3D3530', border: '1px solid #F0EDE8' }}
                >+</motion.button>
              </div>
            </div>

            {/* Summary with total price */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 rounded-xl" style={{ backgroundColor: '#E8F0E8' }}>
              <p className="text-xs font-medium" style={{ color: '#3D3530' }}>
                已選擇：{selectedVariation.attributes.map(a => a.option).join(' / ')}
              </p>
              <div className="flex justify-between items-center mt-1">
                <span className="text-xs" style={{ color: '#5C534C' }}>
                  NT${parseFloat(selectedVariation.price).toLocaleString('zh-TW', { maximumFractionDigits: 0 })} × {quantity} 人
                </span>
                <span className="text-base font-bold" style={{ color: '#8FA886' }}>
                  NT${totalPrice.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}
                </span>
              </div>
            </motion.div>
          </>)}
        </motion.div>
      )}

      {/* Booking Product: Date/Time Selection + Persons */}
      {isBooking && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-4 space-y-3"
          style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
        >
          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>📅 預約日期與時段</p>

          {bookingSlotsLoading ? (
            <p className="text-xs" style={{ color: '#8C7B72' }}>載入可預約時段中...</p>
          ) : bookingDateOptions.length === 0 ? (
            <p className="text-xs" style={{ color: '#8C7B72' }}>目前暫無可預約日期，請聯繫 LINE 客服</p>
          ) : (<>
            {/* Date selection */}
            <div>
              <label className="text-xs" style={{ color: '#8C7B72' }}>選擇日期</label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {bookingDateOptions.map(d => (
                  <motion.button
                    key={d.value}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { setBookingDate(d.value); setBookingTime(''); setQuantity(1); }}
                    className="py-2 px-1 rounded-lg text-xs font-medium transition-all"
                    style={{
                      backgroundColor: bookingDate === d.value ? '#8FA886' : '#FAF8F5',
                      color: bookingDate === d.value ? '#fff' : '#3D3530',
                      border: `1px solid ${bookingDate === d.value ? '#8FA886' : '#F0EDE8'}`,
                    }}
                  >
                    {d.label}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Time slot selection */}
            {bookingDate && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <label className="text-xs" style={{ color: '#8C7B72' }}>選擇時段</label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {bookingTimeOptions.map(slot => (
                    <motion.button
                      key={slot.time}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => { setBookingTime(slot.time); setQuantity(1); }}
                      className="py-2.5 px-2 rounded-lg text-xs font-medium transition-all text-left"
                      style={{
                        backgroundColor: bookingTime === slot.time ? '#8FA886' : '#FAF8F5',
                        color: bookingTime === slot.time ? '#fff' : '#3D3530',
                        border: `1px solid ${bookingTime === slot.time ? '#8FA886' : '#F0EDE8'}`,
                      }}
                    >
                      <span className="block">{slot.time} - {slot.endTime}</span>
                      <span className="block text-[10px] mt-0.5" style={{ color: bookingTime === slot.time ? 'rgba(255,255,255,0.8)' : '#8C7B72' }}>
                        剩餘 {slot.remaining} 位
                      </span>
                    </motion.button>
                  ))}
                </div>
                {bookingTimeOptions.length === 0 && (
                  <p className="text-xs mt-2" style={{ color: '#8C7B72' }}>此日期暫無可用時段</p>
                )}
              </motion.div>
            )}

            {/* Persons selection — inside booking section */}
            {bookingTime && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-2 border-t" style={{ borderColor: '#F0EDE8' }}>
                <label className="text-xs font-medium" style={{ color: '#3D3530' }}>👥 人數</label>
                <div className="flex items-center gap-4 mt-2">
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => setQuantity(Math.max(bookingConfig?.minParticipants || 1, quantity - 1))}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-sm"
                    style={{ backgroundColor: '#FAF8F5', color: '#3D3530', border: '1px solid #F0EDE8' }}
                  >−</motion.button>
                  <span className="text-lg font-bold" style={{ color: '#3D3530' }}>{quantity}</span>
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => {
                      const max = selectedSlotCapacity || bookingConfig?.maxParticipants || 8;
                      setQuantity(Math.min(max, quantity + 1));
                    }}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-sm"
                    style={{ backgroundColor: '#FAF8F5', color: '#3D3530', border: '1px solid #F0EDE8' }}
                  >+</motion.button>
                  {selectedSlotCapacity !== null && (
                    <span className="text-[10px]" style={{ color: '#8C7B72' }}>（此時段剩餘 {selectedSlotCapacity} 位）</span>
                  )}
                </div>
                {/* Total price for booking */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 p-3 rounded-xl" style={{ backgroundColor: '#E8F0E8' }}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: '#3D3530' }}>
                      NT${displayPrice.toLocaleString('zh-TW', { maximumFractionDigits: 0 })} × {quantity} 人
                    </span>
                    <span className="text-base font-bold" style={{ color: '#8FA886' }}>
                      NT${totalPrice.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </>)}
        </motion.div>
      )}

      {/* Full Description — rendered as HTML */}
      {product.description && (
        <motion.div className="rounded-2xl p-4" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
          <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>📋 商品說明</p>
          <div
            className={`text-sm leading-relaxed wc-prose overflow-hidden ${!showFullDesc ? 'max-h-60' : ''}`}
            style={{ color: '#5C534C' }}
            dangerouslySetInnerHTML={{ __html: product.description }}
          />
          {product.description.length > 300 && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setShowFullDesc(!showFullDesc)}
              className="mt-2 text-xs font-medium"
              style={{ color: '#8FA886' }}
            >
              {showFullDesc ? '收起 ▲' : '展開完整說明 ▼'}
            </motion.button>
          )}
        </motion.div>
      )}

      {/* Quantity Selection — only for simple (non-variable, non-booking) products */}
      {!isVariable && !isBooking && (
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
          {quantity > 1 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 p-3 rounded-xl text-center" style={{ backgroundColor: '#E8F0E8' }}>
              <span className="text-xs" style={{ color: '#5C534C' }}>
                NT${displayPrice.toLocaleString('zh-TW', { maximumFractionDigits: 0 })} × {quantity}
              </span>
              <span className="text-base font-bold ml-2" style={{ color: '#8FA886' }}>
                = NT${totalPrice.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}
              </span>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Add to Cart Button */}
      {product.stock_status === 'outofstock' || (product.manage_stock && product.stock_quantity !== null && product.stock_quantity <= 0) ? (
        <motion.a
          whileTap={{ scale: 0.96 }}
          href="https://page.line.me/296yrpvh?openQrModal=true"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full py-3 rounded-xl font-bold text-white text-center transition-all"
          style={{ backgroundColor: '#C9A96E' }}
        >
          預約包班 → LINE 聯繫
        </motion.a>
      ) : (
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={handleAddToCart}
          className="w-full py-3 rounded-xl font-bold text-white transition-all"
          style={{ backgroundColor: '#8FA886' }}
        >
          {isVirtual ? '預約並加入購物車' : '加入購物車'}
        </motion.button>
      )}
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

          <div className="space-y-2">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={onCheckout}
              className="w-full py-3 rounded-xl font-bold text-white transition-all"
              style={{ backgroundColor: '#8FA886' }}
            >
              前往結帳
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={onBack}
              className="w-full py-3 rounded-xl font-bold transition-all"
              style={{ backgroundColor: '#FAF8F5', color: '#8FA886', border: '1px solid #8FA886' }}
            >
              繼續購物
            </motion.button>
          </div>
        </>
      )}
    </motion.div>
  );
}

function CheckoutView({ cart, onBack, onClearCart }: { cart: CartItem[]; onBack: () => void; onClearCart?: () => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [shippingMethod, setShippingMethod] = useState('7-eleven');
  const [paymentMethod, setPaymentMethod] = useState('credit');
  const [invoiceType, setInvoiceType] = useState('personal');
  const [donationCode, setDonationCode] = useState('');
  const [companyTaxId, setCompanyTaxId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [selectedStore, setSelectedStore] = useState<{ storeId: string; storeName: string; storeAddress: string } | null>(null);

  // WooCommerce loyalty points
  const [wcPoints, setWcPoints] = useState(0);
  const [useWcPoints, setUseWcPoints] = useState(false);
  const [wcPointsLoading, setWcPointsLoading] = useState(false);
  const [showCouponField, setShowCouponField] = useState(false);
  const [manualCouponCode, setManualCouponCode] = useState('');

  // Check auth state and auto-fill user info
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        if (currentUser.displayName && !name) setName(currentUser.displayName);
        if (currentUser.email && !email) setEmail(currentUser.email);
        // Load WooCommerce loyalty points
        loadWcPoints(currentUser.email || '');
      }
    });
    return unsub;
  }, []);

  const loadWcPoints = async (userEmail: string) => {
    if (!userEmail) return;
    setWcPointsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/member/points?email=${encodeURIComponent(userEmail)}`);
      if (response.ok) {
        const data = await response.json();
        const pts = data?.points || 0;
        setWcPoints(pts);
        if (pts > 0) setUseWcPoints(true); // Auto-apply if they have points
      }
    } catch (e) {
      console.error('[Checkout] Failed to load WC points:', e);
    } finally {
      setWcPointsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error('Login failed:', e);
    }
  };

  // 監聽超商門市選擇結果
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'ECPAY_STORE_SELECTED') {
        const { storeId, storeName, storeAddress } = event.data.data;
        setSelectedStore({ storeId, storeName, storeAddress });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const hasPhysical = cart.some(item => !item.isVirtual);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleCheckout = async () => {
    console.log('開始結帳流程...');
    if (!name || !phone || !email) {
      alert('請填寫必填欄位');
      return;
    }
    if (hasPhysical && shippingMethod === 'delivery' && !address) {
      alert('請填寫配送地址');
      return;
    }
    if (hasPhysical && shippingMethod !== 'delivery' && !selectedStore) {
      alert('請選擇取貨門市');
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
        shipping: hasPhysical ? (shippingMethod === 'delivery' ? {
          first_name: name,
          address_1: address,
          city,
        } : {
          first_name: name,
          address_1: selectedStore?.storeAddress || '',
          city: selectedStore?.storeName || '',
          company: `超商取貨: ${selectedStore?.storeName || ''} (${selectedStore?.storeId || ''})`,
        }) : undefined,
        line_items: cart.map(item => ({
          product_id: item.productId,
          quantity: item.quantity,
          variation_id: item.variationId,
        })),
        payment_method: paymentMethod === 'credit' ? 'credit_card' : paymentMethod === 'bank' ? 'bank_transfer' : paymentMethod === 'convenience' ? 'convenience_store' : 'line_pay',
        set_paid: false,
      };

      const orderResponse = await fetch(`${API_BASE}/api/wc/orders`, {
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
        await openPaymentUrl(`${API_BASE}/api/ecpay/create?order_id=${orderId}&payment=${paymentMethod}`);
      } else if (paymentMethod === 'line') {
        // LINE Pay付款
        console.log('導向LINE Pay付款...');
        const linePayResponse = await fetch(`${API_BASE}/api/linepay/request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: String(orderId),
            amount: total,
            products: cart.map(item => ({ name: item.name, quantity: item.quantity, price: item.price })),
          }),
        });

        if (!linePayResponse.ok) {
          const errData = await linePayResponse.json().catch(() => ({}));
          console.error('LINE Pay error response:', errData);
          throw new Error(`LINE Pay請求失敗: ${errData.error || linePayResponse.status}`);
        }

        const linePayData = await linePayResponse.json();
        const lpUrl = linePayData.paymentUrl || linePayData.info?.paymentUrl?.web;
        if (lpUrl) {
          await openPaymentUrl(lpUrl);
        } else {
          throw new Error('無法取得LINE Pay付款網址');
        }
      }

      // Deduct WooCommerce loyalty points if used
      const pointsDiscount = useWcPoints ? Math.min(wcPoints, total) : 0;
      if (pointsDiscount > 0 && email) {
        try {
          await fetch(`${API_BASE}/api/member/points/redeem`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, points: pointsDiscount, orderId }),
          });
        } catch (e) {
          console.error('[Checkout] Failed to redeem points:', e);
        }
      }

      const finalAmount = Math.max(0, total - pointsDiscount);
      alert(`訂單已建立\n訂單編號: ${orderId}\n金額: NT$${finalAmount.toLocaleString()}${pointsDiscount > 0 ? `\n紅利點數折抵 NT$${pointsDiscount}` : ''}`);
      // Clear cart after successful order
      if (onClearCart) onClearCart();
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

      {/* Login prompt for non-logged-in users */}
      {!user && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl p-4 shadow-sm flex items-center gap-3"
          style={{ background: 'linear-gradient(135deg, #FAF8F5 0%, #E8F0E8 100%)', border: '1px solid #8FA88640' }}
        >
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: '#3D3530' }}>登入享更多優惠</p>
            <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>自動帶入資料、使用紅利點數折抵</p>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleGoogleLogin}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5"
            style={{ backgroundColor: '#8FA886' }}
          >
            <span>G</span> 登入
          </motion.button>
        </motion.div>
      )}

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
                { id: '7-eleven', label: '7-ELEVEN 超商取貨', subType: 'UNIMART' },
                { id: 'family', label: '全家便利商店 超商取貨', subType: 'FAMI' },
                { id: 'hilife', label: '萊爾富 超商取貨', subType: 'HILIFE' },
                { id: 'delivery', label: '中華郵政 宅配', subType: '' },
              ].map(method => (
                <label key={method.id} className="flex items-center gap-2 p-2 rounded-lg cursor-pointer" style={{ backgroundColor: shippingMethod === method.id ? '#E8F0E8' : '#FAF8F5' }}>
                  <input type="radio" name="shipping" checked={shippingMethod === method.id} onChange={() => { setShippingMethod(method.id); setSelectedStore(null); }} />
                  <span className="text-sm" style={{ color: '#3D3530' }}>{method.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 超商取貨：開啟綠界門市地圖 */}
          {(shippingMethod === '7-eleven' || shippingMethod === 'family' || shippingMethod === 'hilife') && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  const subTypeMap: Record<string, string> = { '7-eleven': 'UNIMARTC2C', family: 'FAMIC2C', hilife: 'HILIFEC2C' };
                  const subType = subTypeMap[shippingMethod] || 'UNIMARTC2C';
                  openUrl(`${API_BASE}/api/ecpay/logistics/map?subtype=${subType}`, { windowName: '選擇門市', windowFeatures: 'width=800,height=600' });
                }}
                className="w-full py-2.5 rounded-lg text-sm font-medium transition-all"
                style={{ backgroundColor: '#8FA886', color: '#fff' }}
              >
                📍 選擇取貨門市
              </motion.button>
              {selectedStore && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 rounded-lg text-xs space-y-1" style={{ backgroundColor: '#E8F0E8', color: '#3D3530' }}>
                  <p className="font-bold">已選擇門市：{selectedStore.storeName}</p>
                  <p>{selectedStore.storeAddress}</p>
                  <p className="text-xs" style={{ color: '#8C7B72' }}>門市代號: {selectedStore.storeId}</p>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* 宅配地址 */}
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
        <p className="text-sm font-bold" style={{ color: '#3D3530' }}>📋 發票資訊</p>
        <div>
          <label className="text-xs" style={{ color: '#8C7B72' }}>發票類型</label>
          <div className="space-y-2 mt-2">
            {[
              { id: 'personal', label: '個人（Email 寄送）' },
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

        {/* 個人：提示 email 寄送 */}
        {invoiceType === 'personal' && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="p-3 rounded-lg text-xs" style={{ backgroundColor: '#E8F0E8', color: '#3D3530' }}>
            發票將以電子郵件寄送至：{email || '（請於上方填寫 Email）'}
          </motion.div>
        )}

        {/* 捐贈：輸入捐贈碼 */}
        {invoiceType === 'donate' && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2">
            <div>
              <label className="text-xs" style={{ color: '#8C7B72' }}>捐贈碼（愛心碼）</label>
              <input
                value={donationCode}
                onChange={(e) => setDonationCode(e.target.value)}
                placeholder="例：168001、25885"
                maxLength={7}
                className="w-full mt-1 p-2.5 rounded-lg text-sm"
                style={{ backgroundColor: '#FAF8F5', border: '1px solid #F0EDE8', color: '#3D3530' }}
              />
              <p className="text-xs mt-1" style={{ color: '#8C7B72' }}>請輸入 3~7 碼數字捐贈碼</p>
            </div>
          </motion.div>
        )}

        {/* 公司：統編 + 抬頭 */}
        {invoiceType === 'company' && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2">
            <div>
              <label className="text-xs" style={{ color: '#8C7B72' }}>統一編號 *</label>
              <input
                value={companyTaxId}
                onChange={(e) => setCompanyTaxId(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="請輸入 8 碼統一編號"
                maxLength={8}
                className="w-full mt-1 p-2.5 rounded-lg text-sm"
                style={{ backgroundColor: '#FAF8F5', border: '1px solid #F0EDE8', color: '#3D3530' }}
              />
            </div>
            <div>
              <label className="text-xs" style={{ color: '#8C7B72' }}>公司抬頭</label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="請輸入公司名稱"
                className="w-full mt-1 p-2.5 rounded-lg text-sm"
                style={{ backgroundColor: '#FAF8F5', border: '1px solid #F0EDE8', color: '#3D3530' }}
              />
            </div>
          </motion.div>
        )}
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

      {/* 折價碼 / 紅利點數 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-5 space-y-3"
        style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
      >
        {!showCouponField ? (
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setShowCouponField(true);
              // Auto-apply WC points when opening coupon field
              if (user && wcPoints > 0) {
                setUseWcPoints(true);
              }
            }}
            className="w-full flex items-center gap-2 text-left"
          >
            <span className="text-base">🏷️</span>
            <span className="text-sm" style={{ color: '#C9A96E', fontWeight: 500 }}>按此輸入您的折價碼</span>
            <span className="ml-auto" style={{ color: '#C9A96E' }}>›</span>
          </motion.button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-bold" style={{ color: '#3D3530' }}>🏷️ 折價碼</p>

            {/* Manual coupon code input */}
            <div className="flex gap-2">
              <input
                value={manualCouponCode}
                onChange={e => setManualCouponCode(e.target.value)}
                placeholder="輸入折價碼"
                className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
                style={{ backgroundColor: '#FAF8F5', border: '1px solid #F0EDE8', color: '#3D3530' }}
              />
              <motion.button
                whileTap={{ scale: 0.95 }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white"
                style={{ backgroundColor: '#C9A96E' }}
              >
                套用
              </motion.button>
            </div>

            {/* WooCommerce loyalty points auto-apply */}
            {wcPointsLoading && (
              <p className="text-xs" style={{ color: '#8C7B72' }}>載入紅利點數中...</p>
            )}
            {user && wcPoints > 0 && !wcPointsLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-3 rounded-xl"
                style={{ backgroundColor: useWcPoints ? '#E8F0E820' : '#FAF8F5', border: useWcPoints ? '1px solid #8FA886' : '1px solid #F0EDE8' }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold" style={{ color: '#3D3530' }}>🎁 紅利點數折抵</p>
                    <p className="text-[10px] mt-0.5" style={{ color: '#8C7B72' }}>
                      可用 {wcPoints.toLocaleString()} 點（1 點 = NT$1）
                    </p>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setUseWcPoints(!useWcPoints)}
                    className="w-11 h-6 rounded-full flex items-center transition-all px-0.5"
                    style={{ backgroundColor: useWcPoints ? '#8FA886' : '#E0D8D0' }}
                  >
                    <motion.div
                      className="w-5 h-5 rounded-full bg-white shadow-sm"
                      animate={{ x: useWcPoints ? 20 : 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    />
                  </motion.button>
                </div>
                {useWcPoints && (
                  <p className="text-xs font-bold mt-1.5" style={{ color: '#8FA886' }}>
                    ✓ 已折抵 NT${Math.min(wcPoints, total).toLocaleString()}
                  </p>
                )}
              </motion.div>
            )}
            {!user && (
              <div className="p-3 rounded-xl flex items-center gap-2" style={{ backgroundColor: '#FAF8F5', border: '1px solid #F0EDE8' }}>
                <p className="text-xs flex-1" style={{ color: '#8C7B72' }}>登入後可使用紅利點數折抵</p>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleGoogleLogin}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-white"
                  style={{ backgroundColor: '#8FA886' }}
                >
                  登入
                </motion.button>
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* Order Summary */}
      {(() => {
        const pointsDiscount = useWcPoints ? Math.min(wcPoints, total) : 0;
        const finalTotal = Math.max(0, total - pointsDiscount);
        return (
          <motion.div className="rounded-2xl p-5 text-center" style={{ backgroundColor: '#FAF8F5' }}>
            <p className="text-sm mb-2" style={{ color: '#8C7B72' }}>訂單金額</p>
            <p className="text-2xl font-bold" style={{ color: '#8FA886' }}>NT${total.toLocaleString()}</p>
            {pointsDiscount > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-xs" style={{ color: '#8C7B72' }}>
                  🎁 紅利點數 — <span style={{ color: '#C48B6C', fontWeight: 600 }}>-NT${pointsDiscount.toLocaleString()}</span>
                </p>
                <p className="text-lg font-bold" style={{ color: '#C9A96E' }}>
                  實付 NT${finalTotal.toLocaleString()}
                </p>
              </div>
            )}
          </motion.div>
        );
      })()}

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

function MemberPage({ records, onNavigate }: { records: HealingRecord[]; onNavigate: (p: PageType) => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [points, setPoints] = useState<number>(0);
  const [pointsCollected, setPointsCollected] = useState<number>(0);
  const [pointsToRedeem, setPointsToRedeem] = useState<number>(0);
  const [pointsUsed, setPointsUsed] = useState<number>(0);
  const [totalSpent, setTotalSpent] = useState<number>(0);
  const [pointsHistory, setPointsHistory] = useState<Array<{ date: string; description: string; points: number }>>([]);
  const [pointsLoading, setPointsLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [pointsError, setPointsError] = useState<string | null>(null);
  // 陪伴能量 — 暫時隱藏，之後再決定
  // const [energyState, setEnergyState] = useState<EnergyState>(() => loadEnergy());
  // const [showEnergyDetail, setShowEnergyDetail] = useState(false);

  const streak = getStreak(records);
  const monthCheckins = records.filter(r => {
    const d = new Date(r.date);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const monthRecords = records.filter(r => {
    const d = new Date(r.date);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const mostFrequent = getMostFrequentEmotion(monthRecords);
  const mostFrequentInfo = mostFrequent ? getEmotionInfo(mostFrequent) : null;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    // Fallback: if auth state takes too long (custom authDomain), stop loading after 2s
    const timeout = setTimeout(() => setLoading(false), 2000);
    return () => { unsubscribe(); clearTimeout(timeout); };
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
      setPointsCollected(data?.pointsCollected || 0);
      setPointsToRedeem(data?.pointsToRedeem || 0);
      setPointsUsed(data?.pointsUsed || 0);
      setTotalSpent(data?.totalSpent || 0);
      setPointsHistory(data?.history || []);
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
      if (isNative()) {
        // Native apps must use redirect-based auth
        await signInWithRedirect(auth, googleProvider);
      } else {
        // Use popup for all web browsers (desktop & mobile)
        // Do NOT fallback to signInWithRedirect — it causes "missing initial state"
        // error on mobile browsers due to storage partitioning with custom authDomain
        await signInWithPopup(auth, googleProvider);
      }
    } catch (error: any) {
      console.error('Google 登入失敗:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setOrders([]);
      setPoints(0);
      setPointsCollected(0);
      setPointsToRedeem(0);
      setPointsUsed(0);
      setTotalSpent(0);
      setPointsHistory([]);
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
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>我的空間</h2>
        <p className="text-sm mt-0.5" style={{ color: '#8C7B72' }}>
          {user.displayName ? `歡迎回來，${user.displayName}` : '歡迎回來'}
        </p>
      </div>

      {/* User Profile Card - simplified */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-4"
        style={{ backgroundColor: '#FAF8F5' }}
      >
        <div className="flex items-center gap-3 mb-4">
          {user.photoURL && (
            <img
              src={user.photoURL}
              alt={user.displayName || 'User'}
              className="w-12 h-12 rounded-full"
            />
          )}
          <div>
            <div className="flex items-center gap-2">
              <p className="font-bold text-sm" style={{ color: '#3D3530' }}>
                {user.displayName || '使用者'}
              </p>
              <PersonalityBadge profile={loadPersonalityProfile()} size="sm" />
            </div>
            <p className="text-xs" style={{ color: '#8C7B72' }}>
              {user.email}
            </p>
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={handleLogout}
          className="w-full py-2 rounded-xl text-xs font-medium transition-all"
          style={{ backgroundColor: '#FFFEF9', color: '#8B5E3C' }}
        >
          登出
        </motion.button>

        {/* Admin Dashboard Entry (admin only) */}
        {user.email === ADMIN_EMAIL && (
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => onNavigate('admin-dashboard')}
            className="w-full mt-3 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #C9A96E20 0%, #8FA88620 100%)', color: '#C9A96E', border: '1px solid #C9A96E30' }}
          >
            📊 管理後台（情緒統計 · 推送）
          </motion.button>
        )}
      </motion.div>

      {/* BLOCK: 我的累積 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.13 }}
        className="rounded-3xl p-5 shadow-sm relative overflow-hidden"
        style={{
          backgroundImage: 'url(/bg-my-collection.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 rounded-3xl" style={{ backgroundColor: 'rgba(255,254,249,0.45)' }} />
        <div className="relative z-10">
        <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>我的累積</p>
        <div className="grid grid-cols-2 gap-2.5">
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => onNavigate('my-works')} className="rounded-2xl p-3.5 text-left" style={{ backgroundColor: 'rgba(250,248,245,0.85)' }}>
            <p className="text-xl mb-1">🎨</p>
            <p className="text-xs font-medium" style={{ color: '#3D3530' }}>我的作品牆</p>
            <p className="text-[10px] mt-0.5" style={{ color: '#8C7B72' }}>做過的課程與作品</p>
          </motion.button>
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => onNavigate('collections')} className="rounded-2xl p-3.5 text-left" style={{ backgroundColor: 'rgba(250,248,245,0.85)' }}>
            <p className="text-xl mb-1">💝</p>
            <p className="text-xs font-medium" style={{ color: '#3D3530' }}>我的收藏</p>
            <p className="text-[10px] mt-0.5" style={{ color: '#8C7B72' }}>文章・卡片・作品</p>
          </motion.button>
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => onNavigate('exclusive-content')} className="rounded-2xl p-3.5 text-left" style={{ backgroundColor: 'rgba(250,248,245,0.85)' }}>
            <p className="text-xl mb-1">🔓</p>
            <p className="text-xs font-medium" style={{ color: '#3D3530' }}>課後照顧</p>
            <p className="text-[10px] mt-0.5" style={{ color: '#8C7B72' }}>課後解鎖的照顧知識</p>
          </motion.button>
        </div>
        </div>{/* close z-10 wrapper */}
      </motion.div>

      {/* BLOCK: 服務大廳 (放大) */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        onClick={() => onNavigate('service')}
        className="w-full rounded-2xl p-5 shadow-sm text-left relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #FFF8E1 0%, #FFFEF9 100%)', border: '1px solid #F0EDE8' }}
      >
        <div className="flex items-center gap-4">
          <span className="text-4xl">🤲</span>
          <div>
            <p className="text-base font-bold" style={{ color: '#3D3530' }}>服務大廳</p>
            <p className="text-xs mt-1" style={{ color: '#8C7B72' }}>課程預約・問題諮詢・體驗紀錄</p>
          </div>
        </div>
        <div className="absolute -bottom-3 -right-3 text-7xl opacity-[0.04]">🤲</div>
      </motion.button>

      {/* BLOCK: 測驗分析入口 */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.17 }}
        onClick={() => onNavigate('explore')}
        className="w-full rounded-2xl p-5 shadow-sm text-left relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #E8E0F0 0%, #FFFEF9 100%)', border: '1px solid #F0EDE8' }}
      >
        <div className="flex items-center gap-4">
          <span className="text-4xl">🔮</span>
          <div>
            <p className="text-base font-bold" style={{ color: '#3D3530' }}>我的測驗</p>
            <p className="text-xs mt-1" style={{ color: '#8C7B72' }}>心理測驗結果與療癒人格分析</p>
          </div>
        </div>
        <div className="absolute -bottom-3 -right-3 text-7xl opacity-[0.04]">🔮</div>
      </motion.button>

      {/* BLOCK: 快捷入口 (2 column) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.19 }}
        className="grid grid-cols-2 gap-2.5"
      >
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => onNavigate('diary')}
          className="rounded-2xl p-3.5 text-center relative overflow-hidden"
          style={{
            backgroundImage: 'url(/bg-emotion-record.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            border: '1px solid #F0EDE8',
          }}
        >
          <div className="absolute inset-0 rounded-2xl" style={{ backgroundColor: 'rgba(255,254,249,0.4)' }} />
          <div className="relative z-10">
            <p className="text-xl mb-1.5">◎</p>
            <p className="text-[10px] font-medium" style={{ color: '#3D3530' }}>情緒紀錄</p>
          </div>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => onNavigate('ebook')}
          className="rounded-2xl p-3.5 text-center relative overflow-hidden"
          style={{
            backgroundImage: 'url(/bg-fragrance-calendar.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            border: '1px solid #F0EDE8',
          }}
        >
          <div className="absolute inset-0 rounded-2xl" style={{ backgroundColor: 'rgba(255,254,249,0.4)' }} />
          <div className="relative z-10">
            <p className="text-xl mb-1.5">📖</p>
            <p className="text-[10px] font-medium" style={{ color: '#3D3530' }}>電子書</p>
          </div>
        </motion.button>
      </motion.div>

      {/* BLOCK: 知識與工具 (3 column grid) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22 }}
        className="rounded-3xl p-4 shadow-sm"
        style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
      >
        <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>知識與工具</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { emoji: '🧪', label: '療癒配方', page: 'recipe' as PageType, color: '#D2B4A1' },
            { emoji: '🧠', label: '心理測驗', page: 'healer' as PageType, color: '#9B7EC8' },
            { emoji: '💎', label: '水晶能量', page: 'crystal-energy' as PageType, color: '#7EC8C8' },
            { emoji: '🌱', label: '植栽照顧', page: 'plant-care' as PageType, color: '#6B8F5E' },
            { emoji: '🫧', label: '精油百科', page: 'oil-wiki' as PageType, color: '#A8B876' },
            { emoji: '📚', label: '課後照顧', page: 'library' as PageType, color: '#8C7B72' },
            { emoji: '🎧', label: '聆聽', page: 'sound' as PageType, color: '#6B6B9B' },
            { emoji: '🛒', label: '療癒商城', page: 'shop' as PageType, color: '#5E8FA8' },
            { emoji: '🪙', label: 'XIA幣任務', page: 'xia-tasks' as PageType, color: '#E8B735' },
            { emoji: '📓', label: '日記', page: 'journal' as PageType, color: '#C4A882' },
            { emoji: '❤️', label: '收藏', page: 'collections' as PageType, color: '#E0A8A8' },
            { emoji: '🤖', label: '智能客服', page: 'ai-cs' as PageType, color: '#5EAAB8' },
          ].map((item) => (
            <motion.button
              key={item.label}
              whileTap={{ scale: 0.93 }}
              onClick={() => onNavigate(item.page)}
              className="rounded-xl p-2.5 text-center"
              style={{ backgroundColor: `${item.color}15` }}
            >
              <p className="text-lg mb-0.5">{item.emoji}</p>
              <p className="text-[10px] font-medium" style={{ color: '#3D3530' }}>{item.label}</p>
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* BLOCK 4: 帳務與設定 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="rounded-3xl p-5 shadow-sm space-y-4"
        style={{ backgroundColor: '#FFFEF9' }}
      >
        {/* Orders section */}
        <div>
          <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>我的訂單</p>
          {ordersLoading ? (
            <p className="text-xs" style={{ color: '#8C7B72' }}>載入中...</p>
          ) : ordersError ? (
            <p className="text-xs" style={{ color: '#8C7B72' }}>{ordersError}</p>
          ) : orders.length === 0 ? (
            <p className="text-xs" style={{ color: '#8C7B72' }}>暫無訂單記錄</p>
          ) : (
            <div className="space-y-2">
              {orders.slice(0, 3).map((order) => (
                <div key={order.id} className="flex justify-between text-xs" style={{ color: '#8C7B72' }}>
                  <span>訂單 #{order.id}</span>
                  <span>NT${order.total.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Points section */}
        {pointsLoading ? (
          <div>
            <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>紅利點數</p>
            <p className="text-xs" style={{ color: '#8C7B72' }}>載入中...</p>
          </div>
        ) : pointsError ? (
          <div>
            <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>紅利點數</p>
            <p className="text-xs" style={{ color: '#8C7B72' }}>{pointsError}</p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>紅利點數</p>
            <p className="text-2xl font-bold" style={{ color: '#8FA886' }}>{points.toLocaleString()}</p>
            <p className="text-xs mt-1 mb-3" style={{ color: '#8C7B72' }}>目前可用點數（每1點 = NT$1）</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="p-2.5 rounded-xl" style={{ backgroundColor: '#FAF8F5' }}>
                <p className="text-xs" style={{ color: '#8C7B72' }}>累計獲得</p>
                <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{pointsCollected.toLocaleString()}</p>
              </div>
              <div className="p-2.5 rounded-xl" style={{ backgroundColor: '#FAF8F5' }}>
                <p className="text-xs" style={{ color: '#8C7B72' }}>已使用</p>
                <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{pointsUsed.toLocaleString()}</p>
              </div>
            </div>
            {totalSpent > 0 && (
              <p className="text-xs" style={{ color: '#8C7B72' }}>
                累計消費 NT${totalSpent.toLocaleString()}
              </p>
            )}
            {pointsHistory.length > 0 && (
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid #F0EDE8' }}>
                <p className="text-xs font-medium mb-2" style={{ color: '#3D3530' }}>最近紀錄</p>
                <div className="space-y-1.5">
                  {pointsHistory.slice(0, 5).map((h, i) => (
                    <div key={i} className="flex justify-between text-xs" style={{ color: '#8C7B72' }}>
                      <span className="truncate flex-1 mr-2">{h.description || h.date}</span>
                      <span style={{ color: h.points > 0 ? '#8FA886' : '#C48B6C', fontWeight: 600 }}>
                        {h.points > 0 ? '+' : ''}{h.points}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* LINE + logout */}
        <div className="flex gap-2 pt-2">
          <motion.a
            whileTap={{ scale: 0.96 }}
            href="https://page.line.me/296yrpvh?openQrModal=true"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2.5 rounded-xl text-xs font-medium text-center"
            style={{ backgroundColor: '#00C300', color: 'white' }}
          >
            LINE 聊聊
          </motion.a>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleLogout}
            className="flex-1 py-2.5 rounded-xl text-xs font-medium"
            style={{ backgroundColor: '#FAF8F5', color: '#8B5E3C' }}
          >
            登出
          </motion.button>
        </div>
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
  onNavigate,
}: {
  records: HealingRecord[];
  onCheckIn: (emotion: EmotionKey, level?: EmotionLevel, subEmotion?: string) => void;
  onTaskComplete: (key: TaskKey) => void;
  user: User | null;
  onNavigate?: (p: PageType) => void;
}) {
  const todayRecord = records.find(r => r.date === getToday());
  const [selectedOil, setSelectedOil] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);

  const emotion = todayRecord?.emotion;
  const level = (todayRecord?.level || 'L1') as EmotionLevel;
  const healingData = emotion ? getHealingData(emotion, level) : null;
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
    // earnEnergy('note'); // 暫時隱藏
    setTimeout(() => setNoteSaved(false), 2000);
  }, [emotion, note, onTaskComplete, user]);

  useEffect(() => {
    if (todayRecord?.note) setNote(todayRecord.note);
  }, [todayRecord?.note]);

  if (!emotion || !healingData || !emotionInfo) {
    return (
      <motion.div className="space-y-5" {...fadeInUp}>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>🧴 今日香氛處方</h2>
        <p className="text-sm" style={{ color: '#8C7B72' }}>先完成今日情緒打卡：</p>
        <EmotionCheckInFlow onComplete={onCheckIn} />
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
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>這是為你準備的</h2>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xl">{emotionInfo.emoji}</span>
          <span className="text-sm font-medium" style={{ color: '#8C7B72' }}>
            {emotionInfo.label} · {healingData.levelLabel}
          </span>
        </div>
      </div>

      {/* Healer Message */}
      <motion.div
        className="rounded-3xl p-5 shadow-sm"
        style={{ background: `linear-gradient(135deg, ${emotionInfo.color}15, #FFF8E7)` }}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <p className="text-sm leading-relaxed italic" style={{ color: '#3D3530' }}>
          「{healingData.blend.note}」
        </p>
      </motion.div>

      {/* Recipe Cards */}
      <div className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>精油配方</p>
          <span className="text-xs px-2 py-1 rounded-xl" style={{ backgroundColor: '#FAF8F5', color: '#8C7B72' }}>
            {healingData.blend.type === 'spray' ? '噴霧' : '擴香'}
          </span>
        </div>
        <p className="text-sm mb-3" style={{ color: '#3D3530' }}>{healingData.blend.recipe}</p>
        <div className="flex flex-wrap gap-2">
          {healingData.blend.oils.map((oil) => (
            <motion.button
              key={oil}
              whileTap={{ scale: 0.93 }}
              onClick={() => setSelectedOil(oil)}
              className="px-3 py-2 rounded-2xl text-xs font-medium bg-gradient-to-br from-stone-50 to-amber-50"
              style={{ color: '#3D3530' }}
            >
              {oil}
            </motion.button>
          ))}
        </div>

        {/* CTA Buttons */}
        <div className="flex gap-2 mt-4 pt-4" style={{ borderTop: '1px solid #F0EDE8' }}>
          <a href="https://xiabenhow.com" target="_blank" rel="noopener noreferrer"
            className="flex-1 rounded-xl py-2.5 text-xs font-medium text-center border"
            style={{ borderColor: '#C9A96E', color: '#C9A96E' }}>
            🛍️ 購買精油組合
          </a>
          <a href="https://xiabenhow.com" target="_blank" rel="noopener noreferrer"
            className="flex-1 rounded-xl py-2.5 text-xs font-medium text-center text-white"
            style={{ backgroundColor: '#8FA886' }}>
            🌿 預約調香體驗
          </a>
        </div>
      </div>

      {/* Breathing */}
      <div className="rounded-3xl p-6 shadow-sm text-center" style={{ backgroundColor: '#FFFEF9' }}>
        <p className="text-sm font-bold mb-4" style={{ color: '#3D3530' }}>🫧 跟我一起呼吸</p>
        <BreathingCircle />
        <button
          onClick={() => onTaskComplete('breathe')}
          className="mt-4 text-xs font-medium px-4 py-1.5 rounded-xl"
          style={{ backgroundColor: '#FAF8F5', color: '#8FA886' }}
        >
          做到了 ✓
        </button>
      </div>

      {/* Notes */}
      <div className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
        <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>📝 想說什麼嗎</p>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="寫下來，或者只是在這裡待一下也好..."
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
          {noteSaved ? '收到了 ✓' : '記下來'}
        </motion.button>
        <AnimatePresence>
          {noteSaved && (
            <motion.p
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-xs text-center mt-2 italic"
              style={{ color: '#C9A96E' }}
            >
              已經幫你記在心情日記裡了。你的感受很重要。
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* 柔和推薦模組 */}
      {onNavigate && emotion && <CompanionRecommendation emotion={emotion} onNavigate={onNavigate} />}
      {onNavigate && <HandsOnCard onNavigate={onNavigate} />}
    </motion.div>
  );
}

// ===================== PAGE: HEALING PRESCRIPTION =====================

function HealingPrescriptionPage({
  records,
  onCheckIn,
  onTaskComplete,
  onGoToSound,
  onGoToBedtime,
  onNavigate,
  user,
}: {
  records: HealingRecord[];
  onCheckIn: (emotion: EmotionKey, level: EmotionLevel, subEmotion: string) => void;
  onTaskComplete: (key: TaskKey) => void;
  onGoToSound: () => void;
  onGoToBedtime: () => void;
  onNavigate?: (p: PageType) => void;
  user: User | null;
}) {
  const todayRecord = records.find(r => r.date === getToday());
  const [selectedOil, setSelectedOil] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const emotion = todayRecord?.emotion;
  const level = todayRecord?.level || 'L1';
  const healingData = emotion ? getHealingData(emotion, level as EmotionLevel) : null;
  const emoInfo = emotion ? getEmotionInfo(emotion) : null;
  const warmMsg = emotion ? getRandomWarmMessage(emotion, level as EmotionLevel) : '';

  const handleSaveNote = useCallback(() => {
    if (!emotion || !note.trim()) return;
    const today = getToday();
    const updated = loadRecords().map(r =>
      r.date === today ? { ...r, note: note.trim() } : r
    );
    saveRecords(updated);
    if (user) {
      const record = updated.find(r => r.date === today);
      if (record) saveRecordToFirestore(user.uid, record);
    }
    setNoteSaved(true);
    onTaskComplete('note');
    // earnEnergy('note'); // 暫時隱藏
    setTimeout(() => setNoteSaved(false), 2000);
  }, [emotion, note, onTaskComplete, user]);

  useEffect(() => {
    if (todayRecord?.note) setNote(todayRecord.note);
  }, [todayRecord?.note]);

  if (!emotion || !healingData || !emoInfo) {
    return (
      <motion.div className="space-y-5" {...fadeInUp}>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>🌿 今天的療癒配方</h2>
        <p className="text-sm" style={{ color: '#8C7B72' }}>先讓我知道你現在的感覺：</p>
        <EmotionCheckInFlow onComplete={onCheckIn} />
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-5" {...fadeInUp}>
      <AnimatePresence>
        {selectedOil && <OilModal oilName={selectedOil} onClose={() => setSelectedOil(null)} />}
      </AnimatePresence>

      {/* Header with emotion */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>這是為你準備的</h2>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xl">{emoInfo.emoji}</span>
          <span className="text-sm font-medium" style={{ color: '#8C7B72' }}>
            {emoInfo.label} · {healingData.levelLabel}
          </span>
        </div>
      </div>

      {/* Warm message */}
      <motion.div
        className="rounded-3xl p-5 shadow-sm"
        style={{ background: `linear-gradient(135deg, ${emoInfo.color}15, #FFF8E7)` }}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <p className="text-sm leading-relaxed italic text-center" style={{ color: '#3D3530' }}>
          「{warmMsg}」
        </p>
      </motion.div>

      {/* Aroma Blend */}
      <div className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>🧴 香氛配方</p>
          <span className="text-xs px-2 py-1 rounded-xl" style={{ backgroundColor: '#FAF8F5', color: '#8C7B72' }}>
            {healingData.blend.type === 'spray' ? '噴霧' : '擴香'}
          </span>
        </div>
        <p className="text-sm mb-2" style={{ color: '#3D3530' }}>{healingData.blend.recipe}</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {healingData.blend.oils.map((oil) => (
            <motion.button
              key={oil}
              whileTap={{ scale: 0.93 }}
              onClick={() => setSelectedOil(oil)}
              className="px-3 py-1.5 rounded-full text-xs font-medium"
              style={{ backgroundColor: emoInfo.color + '20', color: '#3D3530' }}
            >
              {oil}
            </motion.button>
          ))}
        </div>
        <p className="text-xs italic" style={{ color: '#8C7B72' }}>「{healingData.blend.note}」</p>

        {/* Usage */}
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid #F0EDE8' }}>
          <p className="text-xs font-medium mb-2" style={{ color: '#C9A96E' }}>使用方式</p>
          {healingData.usage.map((u, i) => (
            <p key={i} className="text-xs mb-1" style={{ color: '#8C7B72' }}>• {u}</p>
          ))}
        </div>

        {/* CTA */}
        <div className="flex gap-2 mt-4 pt-3" style={{ borderTop: '1px solid #F0EDE8' }}>
          <a href="https://xiabenhow.com" target="_blank" rel="noopener noreferrer"
            className="flex-1 rounded-xl py-2.5 text-xs font-medium text-center border"
            style={{ borderColor: '#C9A96E', color: '#C9A96E' }}>
            🛍️ 購買精油
          </a>
          <a href="https://xiabenhow.com" target="_blank" rel="noopener noreferrer"
            className="flex-1 rounded-xl py-2.5 text-xs font-medium text-center text-white"
            style={{ backgroundColor: '#8FA886' }}>
            🌿 預約調香
          </a>
        </div>
      </div>

      {/* 水晶推薦卡片 — 根據情緒推薦 */}
      {emotion && EMOTION_CRYSTAL_MAP[emotion] && (
        <div className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold" style={{ color: '#3D3530' }}>💎 推薦水晶</p>
            <span className="text-xs px-2 py-1 rounded-xl" style={{ backgroundColor: '#F0EDE8', color: '#9B7EC8' }}>
              能量共振
            </span>
          </div>
          <p className="text-xs mb-3" style={{ color: '#8C7B72' }}>
            這些水晶的能量頻率，特別適合現在的你
          </p>
          <div className="space-y-2">
            {(EMOTION_CRYSTAL_MAP[emotion] || []).slice(0, 3).map(crystalName => {
              const crystal = CRYSTAL_LIBRARY.find(c => c.name === crystalName);
              if (!crystal) return null;
              return (
                <div key={crystalName} className="flex items-center gap-3 rounded-2xl p-3"
                  style={{ backgroundColor: crystal.color + '10' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: crystal.color + '25' }}>
                    <span className="text-xl">{crystal.emoji}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: '#3D3530' }}>{crystal.name}</p>
                    <p className="text-xs truncate" style={{ color: '#8C7B72' }}>
                      {crystal.mental.split('\n')[0]}
                    </p>
                  </div>
                  <span className="text-xs" style={{ color: '#8C7B72' }}>
                    {CHAKRA_EMOJI[crystal.chakra] || '⚪'}
                  </span>
                </div>
              );
            })}
          </div>
          {/* 精油 × 水晶組合建議 */}
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid #F0EDE8' }}>
            <p className="text-xs font-medium mb-1" style={{ color: '#C9A96E' }}>🌿💎 精油 × 水晶搭配建議</p>
            <p className="text-xs leading-relaxed" style={{ color: '#8C7B72' }}>
              使用「{healingData.blend.oils[0]}」擴香的同時，將「
              {(EMOTION_CRYSTAL_MAP[emotion] || [])[0]}」放在身旁，
              讓香氣與水晶能量同步共振，加深療癒效果。
            </p>
          </div>
        </div>
      )}

      {/* Practical Tips (expandable) */}
      <motion.div className="rounded-3xl shadow-sm overflow-hidden" style={{ backgroundColor: '#FFFEF9' }}>
        <button
          onClick={() => setShowTips(!showTips)}
          className="w-full p-5 flex items-center justify-between text-left"
        >
          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>💡 今天可以試試</p>
          <span className="text-xs" style={{ color: '#8C7B72' }}>{showTips ? '收起' : '展開'}</span>
        </button>
        <AnimatePresence>
          {showTips && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-5 pb-5 space-y-2"
            >
              {healingData.practicalTips.map((tip, i) => (
                <p key={i} className="text-xs leading-relaxed" style={{ color: '#8C7B72' }}>🌱 {tip}</p>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Action & Mindset Guide (expandable) */}
      <motion.div className="rounded-3xl shadow-sm overflow-hidden" style={{ backgroundColor: '#FFFEF9' }}>
        <button
          onClick={() => setShowGuide(!showGuide)}
          className="w-full p-5 flex items-center justify-between text-left"
        >
          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>🧭 如果你願意，可以這樣做</p>
          <span className="text-xs" style={{ color: '#8C7B72' }}>{showGuide ? '收起' : '展開'}</span>
        </button>
        <AnimatePresence>
          {showGuide && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-5 pb-5"
            >
              <p className="text-xs font-medium mb-2" style={{ color: '#C9A96E' }}>行為引導</p>
              {healingData.actionGuide.map((g, i) => (
                <p key={i} className="text-xs mb-1 leading-relaxed" style={{ color: '#8C7B72' }}>→ {g}</p>
              ))}
              <p className="text-xs font-medium mt-3 mb-2" style={{ color: '#C9A96E' }}>心理引導</p>
              {healingData.mindsetGuide.map((g, i) => (
                <p key={i} className="text-xs mb-1 leading-relaxed" style={{ color: '#8C7B72' }}>💭 {g}</p>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Soundscape suggestion */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={onGoToSound}
        className="w-full rounded-3xl p-5 shadow-sm text-left"
        style={{ backgroundColor: '#FFFEF9' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎵</span>
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: '#3D3530' }}>推薦白噪音</p>
            <p className="text-xs" style={{ color: '#8C7B72' }}>
              {healingData.soundscape.label} — {healingData.soundscape.reason.slice(0, 40)}...
            </p>
          </div>
          <span className="text-sm" style={{ color: '#8C7B72' }}>→</span>
        </div>
      </motion.button>

      {/* Breathing */}
      <div className="rounded-3xl p-6 shadow-sm text-center" style={{ backgroundColor: '#FFFEF9' }}>
        <p className="text-sm font-bold mb-4" style={{ color: '#3D3530' }}>🫧 跟我一起呼吸</p>
        <BreathingCircle />
        <button
          onClick={() => onTaskComplete('breathe')}
          className="mt-4 text-xs font-medium px-4 py-1.5 rounded-xl"
          style={{ backgroundColor: '#FAF8F5', color: '#8FA886' }}
        >
          做到了 ✓
        </button>
      </div>

      {/* Notes */}
      <div className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
        <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>📝 想說什麼嗎</p>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="寫下來，或者只是在這裡待一下也好..."
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
          {noteSaved ? '收到了 ✓' : '記下來'}
        </motion.button>
        <AnimatePresence>
          {noteSaved && (
            <motion.p
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-xs text-center mt-2 italic"
              style={{ color: '#C9A96E' }}
            >
              已經幫你記在心情日記裡了。你的感受很重要。
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* 柔和推薦模組 */}
      {onNavigate && <CompanionRecommendation emotion={emotion} onNavigate={onNavigate} />}

      {/* 動手做一點什麼 */}
      {onNavigate && <HandsOnCard onNavigate={onNavigate} />}

      {/* Bedtime entry */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={onGoToBedtime}
        className="w-full rounded-3xl p-5 shadow-sm text-left"
        style={{ background: 'linear-gradient(135deg, #2D2438, #1A1A2E)' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🌙</span>
          <div>
            <p className="text-sm font-bold text-white">睡前，陪你一下</p>
            <p className="text-xs" style={{ color: '#B8A8C8' }}>用香氣把今天輕輕放下</p>
          </div>
          <span className="ml-auto text-white text-sm">→</span>
        </div>
      </motion.button>
    </motion.div>
  );
}

// ===================== PAGE: BEDTIME RITUAL =====================

function BedtimeRitualPage({ records, onClose }: { records: HealingRecord[]; onClose?: () => void }) {
  const todayRecord = records.find(r => r.date === getToday());
  const emotion = todayRecord?.emotion;
  const level = (todayRecord?.level || 'L1') as EmotionLevel;
  const healingData = emotion ? getHealingData(emotion, level) : null;
  const emoInfo = emotion ? getEmotionInfo(emotion) : null;

  const [step, setStep] = useState(0);
  const [whisperIdx, setWhisperIdx] = useState(0);

  // Closing whisper lines
  const closingWhispers = [
    '今天夠了，你可以休息了。',
    '不用再想了，晚上先睡。',
    '你已經很努力了。',
    '明天的事，明天再說。',
    '今晚，什麼都不用做。',
    '你值得好好睡一覺。',
    '辛苦了，晚安。',
  ];

  const ritual = healingData?.bedtimeRitual;
  const totalSteps = ritual ? ritual.actions.length + 3 : 0; // scent + actions + mindset + whisper

  useEffect(() => {
    if (ritual) {
      const interval = setInterval(() => {
        setWhisperIdx(prev => (prev + 1) % ritual.whispers.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [ritual]);

  if (!ritual || !emoInfo) {
    return (
      <motion.div className="space-y-5" {...fadeInUp}>
        <h2 className="text-xl font-bold text-white">🌙 睡前儀式</h2>
        <p className="text-sm" style={{ color: '#B8A8C8' }}>先完成今日情緒打卡，才能為你準備睡前儀式</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{
        backgroundColor: '#0F0F1A',
        color: '#E8E0D4',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      {...fadeInUp}
    >
      <div className="min-h-screen space-y-5 px-4 pt-6 pb-6">
        {/* Close button */}
        {onClose && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full"
            style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6l-12 12M6 6l12 12" />
            </svg>
          </motion.button>
        )}

        {/* Header */}
        <div className="text-center pt-4">
          <h2 className="text-2xl font-bold mb-2" style={{ color: '#E8E0D4' }}>今晚，慢慢來</h2>
          <p className="text-xs mt-1" style={{ color: '#B8A8C8' }}>
            {emoInfo?.label ? `${emoInfo.label}的夜晚，用香氛安放自己` : '讓香氛陪你把今天放下'}
          </p>
        </div>

        {/* Progress */}
        <div className="flex justify-center gap-1">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className="h-1 rounded-full transition-all"
              style={{
                width: step >= i ? '16px' : '6px',
                backgroundColor: step >= i ? (emoInfo?.color || '#8FA886') : '#4A4458',
                opacity: step >= i ? 1 : 0.4,
              }}
            />
          ))}
        </div>

        {/* Step 0: Scent */}
        {step === 0 && (
          <motion.div
            key="scent"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl p-6 text-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
          >
            <p className="text-xs font-medium mb-3" style={{ color: '#C9A96E' }}>今晚的香氛</p>
            <p className="text-lg font-bold mb-2" style={{ color: '#E8E0D4' }}>{ritual.scent}</p>
            <p className="text-sm mb-1" style={{ color: '#B8A8C8' }}>{ritual.usage}</p>
            <p className="text-xs italic mt-2" style={{ color: '#8B7BA8' }}>「{ritual.scentNote}」</p>
          </motion.div>
        )}

        {/* Step 1~N: Actions */}
        {step > 0 && step <= ritual.actions.length && (
          <motion.div
            key={`action-${step}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl p-6 text-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
          >
            <p className="text-xs font-medium mb-3" style={{ color: '#C9A96E' }}>步驟 {step}</p>
            <p className="text-base leading-relaxed" style={{ color: '#E8E0D4' }}>{ritual.actions[step - 1]}</p>
          </motion.div>
        )}

        {/* Step N+1: Mindset */}
        {step === ritual.actions.length + 1 && (
          <motion.div
            key="mindset"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl p-6 text-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
          >
            <p className="text-xs font-medium mb-3" style={{ color: '#C9A96E' }}>心靈引導</p>
            <p className="text-base leading-relaxed italic" style={{ color: '#E8E0D4' }}>「{ritual.mindset}」</p>
          </motion.div>
        )}

      {/* Step N+2: Closing Whisper */}
      {step === ritual.actions.length + 2 && (
        <motion.div
          key="closing"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-8 text-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
        >
          <p className="text-xs font-medium mb-4" style={{ color: '#C9A96E' }}>晚安</p>
          <AnimatePresence mode="wait">
            <motion.p
              key={whisperIdx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-lg italic leading-relaxed"
              style={{ color: '#E8E0D4' }}
            >
              「{closingWhispers[whisperIdx % closingWhispers.length]}」
            </motion.p>
          </AnimatePresence>
        </motion.div>
      )}

        {/* Navigation */}
        <div className="flex gap-3 pt-2">
          {step > 0 && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setStep(s => s - 1)}
              className="flex-1 rounded-2xl py-3 font-medium text-sm"
              style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#B8A8C8' }}
            >
              ← 上一步
            </motion.button>
          )}
          {step < totalSteps - 1 ? (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setStep(s => s + 1)}
              className="flex-1 rounded-2xl py-3 text-white font-medium text-sm"
              style={{ backgroundColor: emoInfo?.color || '#8FA886' }}
            >
              下一步 →
            </motion.button>
          ) : (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => { /* earnEnergy('bedtime'); */ onClose?.(); }}
              className="flex-1 rounded-2xl py-3 text-white font-medium text-sm"
              style={{ backgroundColor: '#8FA886' }}
            >
              晚安，好好休息
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ===================== PAGE: CARD =====================

function CardPage({ onTaskComplete, records }: { onTaskComplete: (key: TaskKey) => void; records: HealingRecord[] }) {
  const todayRecord = records.find(r => r.date === getToday());
  const todayEmoInfo = todayRecord?.emotion ? getEmotionInfo(todayRecord.emotion) : null;

  // Daily draw limit — check localStorage
  const todayKey = `card_drawn_${getToday()}`;
  const getTodayDraw = (): HealingCard | null => {
    try {
      const saved = localStorage.getItem(todayKey);
      if (!saved) return null;
      const data = JSON.parse(saved);
      return HEALING_CARDS.find(c => c.id === data.cardId) || null;
    } catch { return null; }
  };
  const hasDrawnToday = () => !!localStorage.getItem(todayKey);
  const saveTodayDraw = (card: HealingCard) => {
    localStorage.setItem(todayKey, JSON.stringify({ cardId: card.id, timestamp: Date.now() }));
    // Sync to Firestore
    try {
      const u = auth.currentUser;
      if (u) setDoc(doc(db, 'user_data', u.uid), { [`cardDraw_${getToday()}`]: { cardId: card.id, timestamp: Date.now() } }, { merge: true }).catch(e => console.error('[Firestore] write:', e));
    } catch {}
  };

  const [drawnCard, setDrawnCard] = useState<HealingCard | null>(() => getTodayDraw());
  const [isFlipped, setIsFlipped] = useState(() => !!getTodayDraw());
  const [showDetail, setShowDetail] = useState(false);
  const [savedCards, setSavedCards] = useState<string[]>(loadSavedCards);
  const [imgLoaded, setImgLoaded] = useState(() => !!getTodayDraw());
  const [alreadyDrawn] = useState(() => hasDrawnToday());

  const drawCard = () => {
    if (hasDrawnToday()) return; // Safety check
    setImgLoaded(false);
    let card: HealingCard;
    if (todayRecord && todayEmoInfo) {
      const emotionColor: CardColor = (todayEmoInfo.color.toLowerCase() as CardColor) || 'neutral';
      card = drawCardByColor(emotionColor) || drawRandomCard();
    } else {
      card = drawRandomCard();
    }
    setDrawnCard(card);
    saveTodayDraw(card);
    setIsFlipped(false);
    setShowDetail(false);
    setTimeout(() => {
      setIsFlipped(true);
      onTaskComplete('card');
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
        title: `療癒卡：${drawnCard.title}`,
        text: `「${drawnCard.message}」\n${drawnCard.extendedMessage}\n🌿 精油：${drawnCard.pairing.oil}\n💎 水晶：${drawnCard.pairing.crystal}\n#下班隨手作 #療癒卡`,
      }).catch(e => console.error('[Firestore] write:', e));
    }
  };

  const colorConfig = drawnCard ? CARD_COLOR_CONFIG[drawnCard.color] : null;

  return (
    <motion.div className="space-y-5" {...fadeInUp}>
      {/* 標題 */}
      <div className="text-center">
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>送你今天的一句話</h2>
        <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>每天一張，是這個 App 送你的小禮物</p>
      </div>

      {/* 抽卡 */}
      {!drawnCard && !alreadyDrawn && (
        <div className="space-y-4">
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={drawCard}
            className="w-full px-4 py-3 rounded-2xl text-sm font-medium text-white"
            style={{ backgroundColor: '#8FA886' }}
          >
            隨緣抽一張
          </motion.button>
        </div>
      )}

      {/* 卡片區域 */}
      {drawnCard && (
        <>
          <div className="flex justify-center">
            <div style={{ perspective: 1200 }} className="w-72">
              <motion.div
                className="relative w-72 card-flip-inner"
                style={{ aspectRatio: '3/4' }}
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={{ duration: 0.9, ease: 'easeInOut' }}
              >
                {/* 卡背 */}
                <div
                  className="absolute inset-0 rounded-3xl shadow-lg flex flex-col items-center justify-center card-face"
                  style={{ background: `linear-gradient(135deg, ${colorConfig?.hex || '#8FA886'}22, ${colorConfig?.hex || '#8FA886'}08)`, border: '1px solid #E8E2D8' }}
                >
                  <div className="border-2 border-dashed rounded-2xl px-8 py-14 text-center" style={{ borderColor: '#C9A96E' }}>
                    <p className="text-lg font-bold mb-3" style={{ color: '#C9A96E' }}>療癒卡牌</p>
                    <p className="text-5xl mb-3">✦</p>
                    <p className="text-xs mt-2" style={{ color: '#8C7B72' }}>讓一張卡接住你</p>
                  </div>
                </div>

                {/* 卡面 — 整張都是圖片 */}
                <div
                  className="absolute inset-0 rounded-3xl shadow-lg overflow-hidden card-face-back"
                  style={{ background: colorConfig?.gradient || colorConfig?.bgLight || '#FFFEF9' }}
                >
                  {/* 圖片填滿整張卡 */}
                  <img
                    src={drawnCard.image}
                    alt={drawnCard.title}
                    className="absolute inset-0 w-full h-full object-cover"
                    onLoad={() => setImgLoaded(true)}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      setImgLoaded(true);
                    }}
                    style={{ opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.5s' }}
                  />
                  {/* 漸層底圖（圖片載入前或失敗時顯示） */}
                  {!imgLoaded && (
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ background: colorConfig?.gradient || `linear-gradient(135deg, ${colorConfig?.hex}55, ${colorConfig?.hex}22)` }}
                    >
                      <span className="text-6xl opacity-40">✦</span>
                    </div>
                  )}
                  {/* 底部漸層遮罩 + 標題 */}
                  <div
                    className="absolute bottom-0 left-0 right-0 p-4 flex flex-col justify-end"
                    style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)', minHeight: '35%' }}
                  >
                    <div
                      className="inline-flex self-start px-2.5 py-1 rounded-full text-xs font-medium text-white mb-2"
                      style={{ backgroundColor: colorConfig?.hex || '#8FA886', opacity: 0.9 }}
                    >
                      {colorConfig?.label} · {colorConfig?.emotion.split('/')[0].trim()}
                    </div>
                    <p className="text-lg font-bold text-white drop-shadow-md">
                      {drawnCard.title}
                    </p>
                    <p className="text-sm text-white/90 mt-1 drop-shadow-sm leading-relaxed">
                      「{drawnCard.message}」
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>

          {/* 卡片下方內容 */}
          {isFlipped && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="space-y-3"
            >
              {/* 延伸訊息 + Hashtags */}
              <div className="rounded-2xl p-4" style={{ backgroundColor: '#FFFEF9' }}>
                <p className="text-sm leading-relaxed" style={{ color: '#5C534C' }}>
                  {drawnCard.extendedMessage}
                </p>
                <div className="flex gap-1.5 mt-3 flex-wrap">
                  {drawnCard.emotionTags.map(tag => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 rounded-full text-xs font-medium"
                      style={{ backgroundColor: colorConfig?.hex + '15', color: colorConfig?.hex }}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* 小儀式 */}
              <div
                className="rounded-2xl p-4"
                style={{ backgroundColor: colorConfig?.hex + '10' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">🕯️</span>
                  <p className="text-sm font-bold" style={{ color: '#3D3530' }}>今日小儀式</p>
                </div>
                <p className="text-sm font-medium mb-2" style={{ color: colorConfig?.hex }}>
                  {drawnCard.ritual}
                </p>
                <p className="text-xs leading-relaxed" style={{ color: '#6B5F56' }}>
                  {drawnCard.ritualDetail}
                </p>
              </div>

              {/* 展開/收起療癒配對 */}
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowDetail(!showDetail)}
                className="w-full rounded-2xl p-3.5 text-sm font-medium text-center flex items-center justify-center gap-2"
                style={{ backgroundColor: '#FFFEF9', color: '#3D3530', border: `1px solid ${colorConfig?.hex}30` }}
              >
                <span>{showDetail ? '收起療癒配對' : '查看療癒配對'}</span>
                <motion.span animate={{ rotate: showDetail ? 180 : 0 }} transition={{ duration: 0.3 }}>▼</motion.span>
              </motion.button>

              <AnimatePresence>
                {showDetail && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="rounded-2xl p-4 space-y-4 overflow-hidden"
                    style={{ backgroundColor: '#FFFEF9' }}
                  >
                    {/* 精油 */}
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-lg">🌿</span>
                        <div>
                          <p className="text-xs" style={{ color: '#8C7B72' }}>推薦精油</p>
                          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{drawnCard.pairing.oil}</p>
                        </div>
                      </div>
                      <p className="text-xs leading-relaxed ml-8" style={{ color: '#6B5F56' }}>{drawnCard.pairing.oilDesc}</p>
                    </div>
                    {/* 音景 */}
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-lg">🎵</span>
                        <div>
                          <p className="text-xs" style={{ color: '#8C7B72' }}>推薦音景</p>
                          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{drawnCard.pairing.sound}</p>
                        </div>
                      </div>
                      <p className="text-xs leading-relaxed ml-8" style={{ color: '#6B5F56' }}>{drawnCard.pairing.soundDesc}</p>
                    </div>
                    {/* 水晶 */}
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-lg">💎</span>
                        <div>
                          <p className="text-xs" style={{ color: '#8C7B72' }}>推薦水晶</p>
                          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{drawnCard.pairing.crystal}</p>
                        </div>
                      </div>
                      <p className="text-xs leading-relaxed ml-8" style={{ color: '#6B5F56' }}>{drawnCard.pairing.crystalDesc}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 操作按鈕 */}
              <div className="flex gap-2">
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={saveCard}
                  className="flex-1 rounded-2xl py-3 text-white font-medium text-sm"
                  style={{
                    backgroundColor: savedCards.includes(drawnCard.id) ? '#C9A96E' : (colorConfig?.hex || '#8FA886'),
                  }}
                >
                  {savedCards.includes(drawnCard.id) ? '收藏進卡冊 ✓' : '📖 收藏進卡冊'}
                </motion.button>
              </div>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={shareCard}
                className="w-full rounded-2xl py-2.5 text-sm font-medium"
                style={{ backgroundColor: '#FAF8F5', color: '#8C7B72' }}
              >
                📤 分享這張療癒卡
              </motion.button>
              {/* 返回重選 */}
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  setDrawnCard(null);
                  setIsFlipped(false);
                  setShowDetail(false);
                }}
                className="w-full py-2 text-xs"
                style={{ color: '#8C7B72' }}
              >
                ← 回到選擇頁面
              </motion.button>
            </motion.div>
          )}
        </>
      )}

      {/* 我的收藏 - 集卡冊風格（永遠顯示，空位提醒抽卡） */}
      {!drawnCard && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl overflow-hidden relative"
          style={{
            backgroundImage: 'url(/bg-card-album.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            padding: '20px',
          }}
        >
          {/* Semi-transparent overlay for readability */}
          <div className="absolute inset-0 rounded-3xl" style={{ backgroundColor: 'rgba(255,254,249,0.55)' }} />
          <div className="relative z-10">
          <p className="text-sm font-bold mb-4" style={{ color: '#3D3530' }}>💾 我的療癒卡冊（{savedCards.length}）</p>
          <p className="text-xs mb-4" style={{ color: '#8C7B72' }}>每一張都是你的療癒時刻✦</p>

          {/* 卡冊網格 - 3列，卡槽設計 */}
          <div className="grid grid-cols-3 gap-3">
            {(() => {
              // 生成最近30天的日期槽位
              const today = new Date();
              const slots: { date: string; cardId: string | null; emoji: string; title: string }[] = [];

              for (let i = 29; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(d.getDate() - i);
                const dateStr = formatDate(d);
                const cardId = localStorage.getItem(`card_drawn_${dateStr}`)
                  ? HEALING_CARDS.find(c => c.id === (JSON.parse(localStorage.getItem(`card_drawn_${dateStr}`) || '{}').cardId))?.id
                  : null;
                const card = cardId ? HEALING_CARDS.find(c => c.id === cardId) : null;

                slots.push({
                  date: dateStr,
                  cardId: card?.id || null,
                  emoji: card ? CARD_COLOR_CONFIG[card.color]?.label?.charAt(0) || '✨' : '✨',
                  title: card?.title || '未抽卡'
                });
              }

              return slots.map((slot, idx) => {
                const card = slot.cardId ? HEALING_CARDS.find(c => c.id === slot.cardId) : null;
                const cfg = card ? CARD_COLOR_CONFIG[card.color] : null;
                const isDrawn = !!card;
                const dateObj = new Date(slot.date);
                const dayNum = dateObj.getDate();

                return (
                  <motion.div
                    key={slot.date}
                    className="rounded-2xl p-3 flex flex-col items-center justify-center cursor-pointer transition-all"
                    style={{
                      backgroundColor: isDrawn ? (cfg?.bgLight || '#FFFEF9') : '#FFFEF9',
                      border: isDrawn ? `2px solid ${cfg?.hex || '#8FA886'}` : '2px dashed #D4CCCB',
                      aspectRatio: '1',
                    }}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => {
                      if (isDrawn && card) {
                        setDrawnCard(card);
                        setIsFlipped(true);
                        setImgLoaded(false);
                      }
                    }}
                  >
                    {isDrawn && card ? (
                      // 已抽卡 - 展示卡面
                      <motion.div
                        className="w-full h-full flex flex-col items-center justify-center gap-1"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', damping: 15 }}
                      >
                        <span className="text-3xl">{cfg?.label?.charAt(0) || '✦'}</span>
                        <p className="text-[10px] font-medium text-center leading-tight" style={{ color: cfg?.hex }}>
                          {card.title}
                        </p>
                        <span className="text-[8px] mt-0.5" style={{ color: '#8C7B72' }}>
                          {dayNum}
                        </span>
                      </motion.div>
                    ) : (
                      // 未抽卡 - 顯示日期和提示
                      <div className="w-full h-full flex flex-col items-center justify-center gap-0.5">
                        <span className="text-xs" style={{ color: '#8C7B72' }}>?</span>
                        <p className="text-[10px]" style={{ color: '#B8ADA6' }}>未抽卡</p>
                        <span className="text-[8px]" style={{ color: '#D4CCCB' }}>
                          {dayNum}
                        </span>
                      </div>
                    )}
                  </motion.div>
                );
              });
            })()}
          </div>

          {/* 說明文本 */}
          <motion.div
            className="mt-4 rounded-2xl p-3"
            style={{ backgroundColor: '#FAF8F5' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <p className="text-xs" style={{ color: '#8C7B72' }}>
              💡 每天可抽一張療癒卡。點擊已填滿的卡槽，回顧那天的療癒訊息。
            </p>
          </motion.div>
          </div>{/* close z-10 wrapper */}
        </motion.div>
      )}
    </motion.div>
  );
}

// ===================== PAGE: MY WORKS WALL =====================

function MyWorksWallPage({ userEmail, onNavigate, onAskTeacher }: { userEmail: string | null; onNavigate: (p: PageType) => void; onAskTeacher?: (work: MyWorkWall) => void }) {
  const [works, setWorks] = useState<MyWorkWall[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedWork, setSelectedWork] = useState<MyWorkWall | null>(null);

  useEffect(() => {
    if (!userEmail) return;
    const q = query(collection(db, 'user_works'), where('userId', '==', userEmail), orderBy('completedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as MyWorkWall));
      setWorks(items);
    });
    return unsub;
  }, [userEmail]);

  // Demo works if empty
  const displayWorks = works.length > 0 ? works : [
    { id: 'd1', courseType: 'fragrance', courseName: '調香入門體驗', photos: [''], completedAt: '2026-03-15', tags: ['#第一次做', '#香氣迷人'], hasCareReminder: true, notes: '調了一瓶柑橘花香，好喜歡！' },
    { id: 'd2', courseType: 'crystal', courseName: '水晶手鍊工作坊', photos: [''], completedAt: '2026-03-10', tags: ['#送給朋友', '#獨一無二'], hasCareReminder: true, notes: '做了粉晶+月光石手鍊' },
    { id: 'd3', courseType: 'candle', courseName: '療癒蠟燭課', photos: [''], completedAt: '2026-03-01', tags: ['#超滿意', '#週末手作'], hasCareReminder: false, notes: '大豆蠟+玫瑰精油' },
    { id: 'd4', courseType: 'plant', courseName: '多肉組盆體驗', photos: [''], completedAt: '2026-02-20', tags: ['#親子手作'], hasCareReminder: true, notes: '帶小朋友一起做的' },
    { id: 'd5', courseType: 'leather', courseName: '皮革鑰匙圈', photos: [''], completedAt: '2026-02-14', tags: ['#情人節', '#送給朋友'], hasCareReminder: false, notes: '情人節禮物' },
  ];

  const filtered = filterType === 'all' ? displayWorks : displayWorks.filter(w => w.courseType === filterType);
  const topicInfo = (key: string) => TOPICS.find(t => t.key === key);

  if (selectedWork) {
    const ti = topicInfo(selectedWork.courseType);
    const exclusive = COURSE_EXCLUSIVE_CONTENT[selectedWork.courseType];
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <button onClick={() => setSelectedWork(null)} className="text-sm" style={{ color: '#8C7B72' }}>← 返回作品牆</button>
        <div className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">{ti?.emoji || '🎨'}</span>
            <div>
              <p className="text-base font-bold" style={{ color: '#3D3530' }}>{selectedWork.courseName}</p>
              <p className="text-xs" style={{ color: '#8C7B72' }}>{selectedWork.completedAt}</p>
            </div>
          </div>
          {selectedWork.notes && <p className="text-sm mb-3" style={{ color: '#5C534C' }}>{selectedWork.notes}</p>}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {selectedWork.tags.map(tag => (
              <span key={tag} className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: ti?.color || '#F0EDE8', color: '#3D3530' }}>{tag}</span>
            ))}
          </div>
          {selectedWork.hasCareReminder && (
            <div className="p-3 rounded-2xl mb-3" style={{ backgroundColor: '#F0F8ED' }}>
              <p className="text-xs font-medium mb-1" style={{ color: '#5C8A4D' }}>🔔 照顧提醒已開啟</p>
              <p className="text-xs" style={{ color: '#8C7B72' }}>系統會定期提醒你照顧這件作品</p>
            </div>
          )}
          {/* Exclusive content for this course type */}
          {exclusive && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid #F0EDE8' }}>
              <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>🔓 {exclusive.title}</p>
              <div className="space-y-2">
                {exclusive.items.map((item, i) => (
                  <div key={i} className="p-3 rounded-2xl" style={{ backgroundColor: '#FAF8F5' }}>
                    <p className="text-sm font-medium" style={{ color: '#3D3530' }}>{item.emoji} {item.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Ask teacher from work context */}
          {onAskTeacher && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => onAskTeacher(selectedWork)}
              className="w-full mt-3 py-3 rounded-2xl text-sm font-medium text-white"
              style={{ backgroundColor: '#8FA886' }}
            >
              💬 從這件作品詢問老師
            </motion.button>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-lg font-bold" style={{ color: '#3D3530' }}>🎨 我的作品牆</p>
        <p className="text-xs" style={{ color: '#8C7B72' }}>共 {filtered.length} 件作品</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        <button onClick={() => setFilterType('all')} className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap" style={{ backgroundColor: filterType === 'all' ? '#8FA886' : '#FAF8F5', color: filterType === 'all' ? 'white' : '#8C7B72' }}>全部</button>
        {TOPICS.map(t => (
          <button key={t.key} onClick={() => setFilterType(t.key)} className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap" style={{ backgroundColor: filterType === t.key ? t.color : '#FAF8F5', color: filterType === t.key ? '#3D3530' : '#8C7B72' }}>{t.emoji} {t.label}</button>
        ))}
      </div>

      {/* Works grid */}
      <div className="space-y-3">
        {filtered.map(work => {
          const ti = topicInfo(work.courseType);
          return (
            <motion.button
              key={work.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedWork(work)}
              className="w-full text-left rounded-3xl p-4 shadow-sm"
              style={{ backgroundColor: '#FFFEF9' }}
            >
              <div className="flex items-start gap-3">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: ti?.color || '#F0EDE8' }}>
                  <span className="text-2xl">{ti?.emoji || '🎨'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: '#3D3530' }}>{work.courseName}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>{work.completedAt}</p>
                  {work.notes && <p className="text-xs mt-1 truncate" style={{ color: '#5C534C' }}>{work.notes}</p>}
                  <div className="flex items-center gap-2 mt-1.5">
                    {work.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: ti?.color || '#F0EDE8', color: '#3D3530' }}>{tag}</span>
                    ))}
                    {work.hasCareReminder && <span className="text-[10px]">🔔</span>}
                  </div>
                </div>
                <span className="text-sm" style={{ color: '#C9A96E' }}>→</span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

// ===================== PAGE: COLLECTION CENTER =====================

function CollectionCenterPage({ userEmail, onNavigate }: { userEmail: string | null; onNavigate: (p: PageType) => void }) {
  const [tab, setTab] = useState<'article' | 'card' | 'work' | 'community' | 'product'>('article');
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [savedCards] = useState<string[]>(loadSavedCards);
  const [wishlistItems] = useState<WishlistItem[]>(loadWishlist);
  const [likedCommunity, setLikedCommunity] = useState<any[]>([]);
  const [myWorks, setMyWorks] = useState<MyWorkWall[]>([]);

  // === Bookmarked articles (from knowledge articles) ===
  const [bookmarkedArticleIds, setBookmarkedArticleIds] = useState<string[]>([]);
  const [allKnowledgeArticles, setAllKnowledgeArticles] = useState<KnowledgeArticle[]>([]);
  const [selectedBookmarkedArticle, setSelectedBookmarkedArticle] = useState<KnowledgeArticle | null>(null);
  const [showAddWork, setShowAddWork] = useState(false);
  const [addWorkPhotos, setAddWorkPhotos] = useState<string[]>([]);
  const [addWorkCourse, setAddWorkCourse] = useState('');
  const [addWorkCourseType, setAddWorkCourseType] = useState('');
  const [addWorkNotes, setAddWorkNotes] = useState('');
  const [addWorkTags, setAddWorkTags] = useState<string[]>([]);
  const [courseSearchText, setCourseSearchText] = useState('');
  const [showCourseDropdown, setShowCourseDropdown] = useState(false);
  const workPhotoInputRef = useRef<HTMLInputElement>(null);
  const workCameraInputRef = useRef<HTMLInputElement>(null);

  // Load user works from Firestore (same source as MyWorksWallPage)
  useEffect(() => {
    if (!userEmail) return;
    try {
      const q = query(collection(db, 'user_works'), where('userId', '==', userEmail), orderBy('completedAt', 'desc'));
      const unsub = onSnapshot(q, (snap) => {
        setMyWorks(snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as MyWorkWall)));
      });
      return unsub;
    } catch { /* index may not exist yet */ }
  }, [userEmail]);

  useEffect(() => {
    if (!userEmail) return;
    const q = query(collection(db, 'user_collections'), where('userId', '==', userEmail), orderBy('savedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setCollections(snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as CollectionItem)));
    });
    return unsub;
  }, [userEmail]);

  // Load liked community items from Firestore
  useEffect(() => {
    if (!userEmail) return;
    try {
      const q = query(collection(db, 'user_likes'), where('userId', '==', userEmail), orderBy('likedAt', 'desc'));
      const unsub = onSnapshot(q, (snap) => {
        setLikedCommunity(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      return unsub;
    } catch { /* collection may not exist yet */ }
  }, [userEmail]);

  // Load bookmarked article IDs from user_subscriptions
  useEffect(() => {
    if (!userEmail) return;
    const unsub = onSnapshot(doc(db, 'user_subscriptions', userEmail), (snap) => {
      if (snap.exists()) {
        setBookmarkedArticleIds(snap.data().bookmarks || []);
      }
    });
    return unsub;
  }, [userEmail]);

  // Load all knowledge articles (Firestore + sample fallback)
  useEffect(() => {
    const q = query(collection(db, 'knowledge_articles'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const firestoreArticles = snap.docs.map(d => ({ id: d.id, ...d.data() } as KnowledgeArticle));
      // Merge with sample articles so bookmarks on sample articles also work
      const sampleIds = new Set(firestoreArticles.map(a => a.id));
      const sampleArticlesForCollection: KnowledgeArticle[] = [
        { id: 'sa-1', title: '多肉換盆的最佳時機', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2023/01/798736.jpg', coverThumbUrl: '', topic: 'plant', summary: '春秋兩季是最適合換盆的時機', content: '', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-03-20' },
        { id: 'sa-2', title: '葉插繁殖全攻略', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2023/01/798735.jpg', coverThumbUrl: '', topic: 'plant', summary: '用一片葉子就能種出一盆新多肉', content: '', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-03-08' },
        { id: 'sa-3', title: '微景觀組盆的配色美學', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2023/01/1009941_0.jpg', coverThumbUrl: '', topic: 'plant', summary: '組盆不只是把多肉放在一起', content: '', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-03-05' },
        { id: 'sa-4', title: '居家擴香的五個小秘密', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2025/03/精油芳療滾珠瓶5.jpg', coverThumbUrl: '', topic: 'fragrance', summary: '讓空間充滿療癒香氣', content: '', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-03-18' },
        { id: 'sa-5', title: '認識前中後調：調香入門', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2025/03/精油芳療滾珠瓶4.jpg', coverThumbUrl: '', topic: 'fragrance', summary: '前調清新、中調溫柔、後調深邃', content: '', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-03-01' },
        { id: 'sa-6', title: '水晶手鍊斷了怎麼辦？', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2026/03/1043595_0.jpg', coverThumbUrl: '', topic: 'crystal', summary: '手鍊斷裂不用驚慌', content: '', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-03-15' },
        { id: 'sa-7', title: '生命靈數與水晶的搭配', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2026/03/1043594_0.jpg', coverThumbUrl: '', topic: 'crystal', summary: '根據你的出生日期找到與你頻率共振的水晶', content: '', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-02-28' },
        { id: 'sa-8', title: '蠟燭第一次點燃很重要', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2025/03/705960_0.jpg', coverThumbUrl: '', topic: 'candle', summary: '蠟燭也有「記憶」', content: '', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-03-12' },
      ];
      const merged = [...firestoreArticles, ...sampleArticlesForCollection.filter(s => !sampleIds.has(s.id))];
      setAllKnowledgeArticles(merged);
    });
    return unsub;
  }, []);

  // Derive bookmarked articles
  const bookmarkedArticles = useMemo(() => {
    if (bookmarkedArticleIds.length === 0) return [];
    return bookmarkedArticleIds
      .map(id => allKnowledgeArticles.find(a => a.id === id))
      .filter(Boolean) as KnowledgeArticle[];
  }, [bookmarkedArticleIds, allKnowledgeArticles]);

  // Course options from TOPICS for course selection dropdown
  const courseOptions = TOPICS.map(t => ({ key: t.key, label: t.label, emoji: t.emoji }));
  const filteredCourseOptions = courseSearchText
    ? courseOptions.filter(c => c.label.includes(courseSearchText) || c.key.includes(courseSearchText.toLowerCase()))
    : courseOptions;

  const handleAddWorkPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) setAddWorkPhotos(prev => [...prev, ev.target!.result as string]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleSubmitWork = async () => {
    if (!userEmail || (!addWorkPhotos.length && !addWorkCourse)) return;
    try {
      // Upload photos to Firestore storage if available, else store as data URL
      const photoUrls: string[] = [];
      for (const photo of addWorkPhotos) {
        try {
          const result = await uploadImage(`user_works/${userEmail}/work_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`, photo);
          photoUrls.push(result.url);
        } catch {
          photoUrls.push(photo); // fallback to data URL
        }
      }
      await addDoc(collection(db, 'user_works'), {
        userId: userEmail,
        courseType: addWorkCourseType || 'fragrance',
        courseName: addWorkCourse || '手作體驗',
        photos: photoUrls,
        completedAt: new Date().toISOString().split('T')[0],
        tags: addWorkTags,
        hasCareReminder: false,
        notes: addWorkNotes,
      });
      setShowAddWork(false);
      setAddWorkPhotos([]);
      setAddWorkCourse('');
      setAddWorkCourseType('');
      setAddWorkNotes('');
      setAddWorkTags([]);
      setCourseSearchText('');
    } catch (err) {
      console.error('Failed to add work:', err);
    }
  };

  const demoCollections: CollectionItem[] = [
    { id: 'c1', type: 'article', title: '新手必看：多肉植物照顧全攻略', topic: 'plant', savedAt: '2026-03-25' },
    { id: 'c2', type: 'article', title: '水晶消磁方法大全', topic: 'crystal', savedAt: '2026-03-24' },
    { id: 'c4', type: 'article', title: '手工皂入門：冷製皂基礎教學', topic: 'soap', savedAt: '2026-03-22' },
    { id: 'c7', type: 'article', title: '蠟燭燃燒的正確方式', topic: 'candle', savedAt: '2026-03-19' },
  ];

  const items = collections.length > 0 ? collections : demoCollections;

  const tabs: { key: typeof tab; label: string; emoji: string }[] = [
    { key: 'article', label: '文章', emoji: '📄' },
    { key: 'card', label: '卡冊', emoji: '✦' },
    { key: 'work', label: '作品', emoji: '✨' },
    { key: 'product', label: '商品', emoji: '🎁' },
  ];

  // === Article detail view (when user clicks a bookmarked article) ===
  if (selectedBookmarkedArticle) {
    const topicInfo = TOPICS.find(t => t.key === selectedBookmarkedArticle.topic);
    return (
      <motion.div className="space-y-4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => setSelectedBookmarkedArticle(null)}
          className="flex items-center gap-1 text-sm" style={{ color: '#C9A96E' }}>← 返回收藏</motion.button>
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          {selectedBookmarkedArticle.coverUrl && (
            <img src={selectedBookmarkedArticle.coverUrl} alt="" className="w-full h-48 object-cover" />
          )}
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span>{topicInfo?.emoji || '📄'}</span>
              <span className="px-2 py-0.5 rounded-lg text-xs" style={{ backgroundColor: (topicInfo?.color || '#ddd') + '30', color: '#8C7B72' }}>
                {topicInfo?.label || '文章'}
              </span>
            </div>
            <h3 className="text-lg font-bold" style={{ color: '#3D3530' }}>{selectedBookmarkedArticle.title}</h3>
            <div className="flex items-center gap-2">
              <span className="text-sm">{selectedBookmarkedArticle.authorEmoji}</span>
              <p className="text-xs" style={{ color: '#8C7B72' }}>{selectedBookmarkedArticle.authorName} · {selectedBookmarkedArticle.createdAt?.slice(0, 10)}</p>
            </div>
            {selectedBookmarkedArticle.content ? (
              <div className="text-sm leading-relaxed whitespace-pre-line" style={{ color: '#3D3530' }}>{selectedBookmarkedArticle.content}</div>
            ) : (
              <div className="text-center py-6">
                <p className="text-sm" style={{ color: '#8C7B72' }}>{selectedBookmarkedArticle.summary}</p>
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => onNavigate('library')}
                  className="mt-4 px-5 py-2.5 rounded-2xl text-sm font-medium" style={{ backgroundColor: '#8FA886', color: 'white' }}>
                  前往知識專欄閱讀全文 →
                </motion.button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <p className="text-lg font-bold" style={{ color: '#3D3530' }}>💝 我的收藏</p>

      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className="px-3 py-2 rounded-2xl text-xs font-medium whitespace-nowrap" style={{ backgroundColor: tab === t.key ? '#8FA886' : '#FAF8F5', color: tab === t.key ? 'white' : '#8C7B72' }}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* === 卡冊 Tab === */}
      {tab === 'card' && (
        <div>
          <p className="text-sm mb-3" style={{ color: '#8C7B72' }}>已收藏 {savedCards.length} 張療癒卡</p>
          {savedCards.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">✦</p>
              <p className="text-sm" style={{ color: '#8C7B72' }}>還沒有收藏的卡牌</p>
              <p className="text-xs mt-1" style={{ color: '#B5AFA8' }}>去療癒師頁面抽卡後點「收藏」</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {savedCards.map(cardId => {
                const card = HEALING_CARDS.find(c => c.id === cardId);
                if (!card) return null;
                const cfg = CARD_COLOR_CONFIG[card.color];
                return (
                  <motion.div key={cardId} whileTap={{ scale: 0.95 }} className="rounded-2xl overflow-hidden shadow-sm cursor-pointer" style={{ border: `2px solid ${cfg?.hex || '#8FA886'}`, aspectRatio: '3/4' }}
                    onClick={() => onNavigate('healer')}>
                    {card.image ? (
                      <img src={card.image} alt={card.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-2" style={{ background: cfg?.gradient || cfg?.bgLight || '#FAF8F5' }}>
                        <span className="text-2xl mb-1">{cfg?.label?.charAt(0) || '✦'}</span>
                        <p className="text-[10px] text-center font-medium" style={{ color: cfg?.hex }}>{card.title}</p>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* === 商品 Tab (from wishlist) === */}
      {tab === 'product' && (
        <div className="space-y-2">
          {wishlistItems.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">🎁</p>
              <p className="text-sm" style={{ color: '#8C7B72' }}>還沒有收藏的商品</p>
              <p className="text-xs mt-1" style={{ color: '#B5AFA8' }}>去療癒禮物頁面點愛心收藏</p>
            </div>
          ) : wishlistItems.map(item => (
            <motion.div key={item.productId} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} whileTap={{ scale: 0.98 }}
              onClick={() => onNavigate('shop')}
              className="flex items-center gap-3 p-3 rounded-2xl shadow-sm cursor-pointer" style={{ backgroundColor: '#FFFEF9' }}>
              {item.image ? (
                <img src={item.image} alt={item.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#F0EDE8' }}>
                  <span className="text-xl">🎁</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: '#3D3530' }}>{item.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-bold" style={{ color: '#C9A96E' }}>NT${item.price}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FAF8F5', color: '#8C7B72' }}>{item.tag}</span>
                </div>
              </div>
              <span className="text-sm" style={{ color: '#C9A96E' }}>›</span>
            </motion.div>
          ))}
        </div>
      )}

      {/* === 文章 Tab (reads from knowledge article bookmarks) === */}
      {tab === 'article' && (
        <div className="space-y-2">
          <p className="text-sm" style={{ color: '#8C7B72' }}>已收藏 {bookmarkedArticles.length} 篇文章</p>
          {bookmarkedArticles.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">📄</p>
              <p className="text-sm" style={{ color: '#8C7B72' }}>還沒有收藏的文章</p>
              <p className="text-xs mt-1" style={{ color: '#B5AFA8' }}>去知識專欄瀏覽文章，點「收藏」按鈕即可加入</p>
              <motion.button whileTap={{ scale: 0.95 }} onClick={() => onNavigate('library')}
                className="mt-4 px-5 py-2.5 rounded-2xl text-sm font-medium" style={{ backgroundColor: '#8FA886', color: 'white' }}>
                前往知識專欄 →
              </motion.button>
            </div>
          ) : bookmarkedArticles.map(article => {
            const ti = article.topic ? TOPICS.find(t => t.key === article.topic) : null;
            return (
              <motion.div key={article.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedBookmarkedArticle(article)}
                className="flex items-center gap-3 p-3.5 rounded-2xl shadow-sm cursor-pointer" style={{ backgroundColor: '#FFFEF9' }}>
                {article.coverUrl ? (
                  <img src={article.coverUrl} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: ti?.color || '#F0EDE8' }}>
                    <span className="text-lg">{ti?.emoji || '📄'}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: '#3D3530' }}>{article.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px]" style={{ color: '#8FA886' }}>{ti?.label || ''}</span>
                    <span className="text-[10px]" style={{ color: '#8C7B72' }}>{article.authorName}</span>
                  </div>
                </div>
                <span className="text-sm" style={{ color: '#C9A96E' }}>›</span>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* === 作品 Tab (synced with 我的作品牆, from user_works) === */}
      {tab === 'work' && (
        <div className="space-y-3">
          {/* Hidden file inputs */}
          <input type="file" ref={workPhotoInputRef} accept="image/*" multiple onChange={handleAddWorkPhoto} style={{ display: 'none' }} />
          <input type="file" ref={workCameraInputRef} accept="image/*" capture="environment" onChange={handleAddWorkPhoto} style={{ display: 'none' }} />

          {/* + Add button */}
          <div className="flex justify-between items-center">
            <p className="text-sm" style={{ color: '#8C7B72' }}>共 {myWorks.length} 件作品</p>
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowAddWork(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center shadow-sm"
              style={{ backgroundColor: '#8FA886', color: 'white' }}>
              <span className="text-lg font-light">+</span>
            </motion.button>
          </div>

          {/* Add work modal */}
          <AnimatePresence>
            {showAddWork && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                className="rounded-3xl p-5 shadow-md space-y-4" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
                <div className="flex justify-between items-center">
                  <p className="text-sm font-bold" style={{ color: '#3D3530' }}>新增作品</p>
                  <button onClick={() => { setShowAddWork(false); setAddWorkPhotos([]); setAddWorkCourse(''); setAddWorkCourseType(''); setAddWorkNotes(''); setCourseSearchText(''); }} className="text-xs" style={{ color: '#8C7B72' }}>取消</button>
                </div>

                {/* Photo section */}
                <div>
                  <p className="text-xs mb-2" style={{ color: '#8C7B72' }}>拍照 / 上傳作品照片</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {addWorkPhotos.map((photo, idx) => (
                      <div key={idx} className="relative flex-shrink-0">
                        <img src={photo} alt="" className="w-20 h-20 rounded-xl object-cover" />
                        <button onClick={() => setAddWorkPhotos(prev => prev.filter((_, i) => i !== idx))}
                          className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
                          style={{ backgroundColor: '#3D3530', color: 'white' }}>×</button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <button onClick={() => workCameraInputRef.current?.click()}
                        className="w-20 h-20 rounded-xl flex flex-col items-center justify-center" style={{ backgroundColor: '#FAF8F5', border: '1px dashed #F0EDE8' }}>
                        <span className="text-xl">📷</span>
                        <span className="text-[10px]" style={{ color: '#8C7B72' }}>拍照</span>
                      </button>
                      <button onClick={() => workPhotoInputRef.current?.click()}
                        className="w-20 h-20 rounded-xl flex flex-col items-center justify-center" style={{ backgroundColor: '#FAF8F5', border: '1px dashed #F0EDE8' }}>
                        <span className="text-xl">🖼️</span>
                        <span className="text-[10px]" style={{ color: '#8C7B72' }}>相簿</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Course selection */}
                <div className="relative">
                  <p className="text-xs mb-2" style={{ color: '#8C7B72' }}>選擇課程類型</p>
                  <input
                    type="text"
                    value={courseSearchText || addWorkCourse}
                    onChange={(e) => { setCourseSearchText(e.target.value); setShowCourseDropdown(true); setAddWorkCourse(''); setAddWorkCourseType(''); }}
                    onFocus={() => setShowCourseDropdown(true)}
                    placeholder="輸入關鍵字搜尋課程..."
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{ backgroundColor: '#FAF8F5', border: '1px solid #F0EDE8', color: '#3D3530' }}
                  />
                  {showCourseDropdown && (
                    <div className="absolute z-10 left-0 right-0 mt-1 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
                      {filteredCourseOptions.map(opt => (
                        <button key={opt.key} onClick={() => {
                          setAddWorkCourse(opt.label);
                          setAddWorkCourseType(opt.key);
                          setCourseSearchText('');
                          setShowCourseDropdown(false);
                        }} className="w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 hover:bg-opacity-50"
                          style={{ color: '#3D3530' }}>
                          <span>{opt.emoji}</span>
                          <span>{opt.label}</span>
                        </button>
                      ))}
                      {filteredCourseOptions.length === 0 && (
                        <p className="px-3 py-2.5 text-xs" style={{ color: '#8C7B72' }}>找不到相關課程</p>
                      )}
                    </div>
                  )}
                  {addWorkCourse && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#8FA886', color: 'white' }}>
                        {courseOptions.find(c => c.key === addWorkCourseType)?.emoji} {addWorkCourse}
                      </span>
                      <button onClick={() => { setAddWorkCourse(''); setAddWorkCourseType(''); }} className="text-[10px]" style={{ color: '#8C7B72' }}>×</button>
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <p className="text-xs mb-2" style={{ color: '#8C7B72' }}>備註（選填）</p>
                  <textarea
                    value={addWorkNotes}
                    onChange={(e) => setAddWorkNotes(e.target.value)}
                    placeholder="寫下你的心得..."
                    rows={2}
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
                    style={{ backgroundColor: '#FAF8F5', border: '1px solid #F0EDE8', color: '#3D3530' }}
                  />
                </div>

                {/* Tags */}
                <div>
                  <p className="text-xs mb-2" style={{ color: '#8C7B72' }}>標籤（選填）</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['#超滿意', '#第一次做', '#送給朋友', '#週末手作', '#親子手作', '#香氣迷人', '#獨一無二'].map(tag => (
                      <button key={tag} onClick={() => setAddWorkTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                        className="px-2.5 py-1 rounded-full text-[11px]"
                        style={{ backgroundColor: addWorkTags.includes(tag) ? '#8FA886' : '#FAF8F5', color: addWorkTags.includes(tag) ? 'white' : '#8C7B72' }}>
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submit */}
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleSubmitWork}
                  className="w-full py-3 rounded-2xl text-sm font-medium"
                  style={{ backgroundColor: (addWorkPhotos.length > 0 || addWorkCourse) ? '#8FA886' : '#F0EDE8', color: (addWorkPhotos.length > 0 || addWorkCourse) ? 'white' : '#8C7B72' }}>
                  儲存作品
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Works list */}
          {myWorks.length === 0 && !showAddWork ? (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">✨</p>
              <p className="text-sm" style={{ color: '#8C7B72' }}>還沒有作品記錄</p>
              <p className="text-xs mt-1" style={{ color: '#B5AFA8' }}>點擊 + 新增你的第一件作品</p>
            </div>
          ) : myWorks.map(work => {
            const ti = TOPICS.find(t => t.key === work.courseType);
            return (
              <motion.div key={work.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} whileTap={{ scale: 0.98 }}
                onClick={() => onNavigate('my-works')}
                className="flex items-center gap-3 p-3.5 rounded-2xl shadow-sm cursor-pointer" style={{ backgroundColor: '#FFFEF9' }}>
                {work.photos?.[0] && work.photos[0] !== '' ? (
                  <img src={work.photos[0]} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: ti?.color || '#F0EDE8' }}>
                    <span className="text-2xl">{ti?.emoji || '🎨'}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: '#3D3530' }}>{work.courseName}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>{work.completedAt}</p>
                  {work.notes && <p className="text-xs mt-0.5 truncate" style={{ color: '#5C534C' }}>{work.notes}</p>}
                  {work.tags?.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {work.tags.slice(0, 2).map(tag => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: ti?.color || '#F0EDE8', color: '#3D3530' }}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-sm" style={{ color: '#C9A96E' }}>›</span>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

// ===================== PAGE: COURSE JOURNEY =====================

function CourseJourneyPage({ userEmail }: { userEmail: string | null }) {
  const [journeys, setJourneys] = useState<CourseJourney[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!userEmail) return;
    const q = query(collection(db, 'user_courses'), where('userId', '==', userEmail), orderBy('completedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ ...d.data(), courseId: d.id } as unknown as CourseJourney));
      setJourneys(items);
    });
    return unsub;
  }, [userEmail]);

  // Demo
  const demoJourneys: CourseJourney[] = [
    { courseId: 'j1', courseType: 'fragrance', courseName: '調香入門體驗', completedAt: '2026-03-20', day3Shown: true, day7Shown: true, day14Shown: false },
    { courseId: 'j2', courseType: 'crystal', courseName: '水晶手鍊工作坊', completedAt: '2026-03-10', day3Shown: true, day7Shown: true, day14Shown: true },
    { courseId: 'j3', courseType: 'plant', courseName: '多肉組盆體驗', completedAt: '2026-03-23', day3Shown: false, day7Shown: false, day14Shown: false },
  ];

  const displayJourneys = journeys.length > 0 ? journeys : demoJourneys;

  const getDaysSince = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const getActiveJourneyCard = () => {
    for (const j of displayJourneys) {
      const days = getDaysSince(j.completedAt);
      const msgs = COURSE_JOURNEY_MESSAGES[j.courseType];
      if (!msgs) continue;
      if (days >= 3 && days < 7 && !j.day3Shown) return { journey: j, step: 'day3' as const, ...msgs.day3 };
      if (days >= 7 && days < 14 && !j.day7Shown) return { journey: j, step: 'day7' as const, ...msgs.day7 };
      if (days >= 14 && !j.day14Shown) return { journey: j, step: 'day14' as const, ...msgs.day14 };
    }
    return null;
  };

  const activeCard = getActiveJourneyCard();

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <p className="text-lg font-bold" style={{ color: '#3D3530' }}>🗺️ 我的課程地圖</p>

      {/* Active journey card */}
      {activeCard && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-3xl p-5 shadow-sm"
          style={{ background: 'linear-gradient(135deg, #FFF8E7, #F0F8ED)' }}
        >
          <p className="text-xs font-medium mb-1" style={{ color: '#C9A96E' }}>📬 課後旅程提醒</p>
          <p className="text-base font-bold mb-1" style={{ color: '#3D3530' }}>{activeCard.emoji} {activeCard.title}</p>
          <p className="text-sm leading-relaxed" style={{ color: '#5C534C' }}>{activeCard.msg}</p>
          <p className="text-xs mt-2" style={{ color: '#8C7B72' }}>— 來自「{activeCard.journey.courseName}」</p>
        </motion.div>
      )}

      {/* Course list */}
      <div className="space-y-3">
        {displayJourneys.map(j => {
          const ti = TOPICS.find(t => t.key === j.courseType);
          const days = getDaysSince(j.completedAt);
          const msgs = COURSE_JOURNEY_MESSAGES[j.courseType];
          const expanded = expandedId === j.courseId;
          return (
            <motion.div key={j.courseId} className="rounded-3xl shadow-sm overflow-hidden" style={{ backgroundColor: '#FFFEF9' }}>
              <button onClick={() => setExpandedId(expanded ? null : j.courseId)} className="w-full text-left p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: ti?.color || '#F0EDE8' }}>
                    <span className="text-xl">{ti?.emoji || '🎨'}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{j.courseName}</p>
                    <p className="text-xs" style={{ color: '#8C7B72' }}>完成於 {j.completedAt} · 第 {days} 天</p>
                  </div>
                  <span className="text-xs" style={{ color: '#C9A96E' }}>{expanded ? '收起' : '展開'}</span>
                </div>
                {/* Journey progress dots */}
                <div className="flex items-center gap-1 mt-2 ml-15">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: days >= 3 ? '#8FA886' : '#E0DCD8' }} />
                  <div className="w-8 h-0.5" style={{ backgroundColor: days >= 7 ? '#8FA886' : '#E0DCD8' }} />
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: days >= 7 ? '#8FA886' : '#E0DCD8' }} />
                  <div className="w-8 h-0.5" style={{ backgroundColor: days >= 14 ? '#8FA886' : '#E0DCD8' }} />
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: days >= 14 ? '#8FA886' : '#E0DCD8' }} />
                  <span className="text-[10px] ml-1" style={{ color: '#8C7B72' }}>Day 3 → 7 → 14</span>
                </div>
              </button>
              <AnimatePresence>
                {expanded && msgs && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-4 pb-4">
                    <div className="space-y-2 pt-2" style={{ borderTop: '1px solid #F0EDE8' }}>
                      {[{ day: 3, data: msgs.day3, done: days >= 3 }, { day: 7, data: msgs.day7, done: days >= 7 }, { day: 14, data: msgs.day14, done: days >= 14 }].map(step => (
                        <div key={step.day} className="p-3 rounded-2xl" style={{ backgroundColor: step.done ? '#F0F8ED' : '#FAF8F5', opacity: step.done ? 1 : 0.6 }}>
                          <p className="text-xs font-medium" style={{ color: step.done ? '#5C8A4D' : '#8C7B72' }}>
                            {step.done ? '✓' : '○'} Day {step.day}：{step.data.emoji} {step.data.title}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>{step.data.msg}</p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {displayJourneys.length === 0 && (
        <div className="text-center py-8">
          <p className="text-3xl mb-2">🗺️</p>
          <p className="text-sm" style={{ color: '#8C7B72' }}>還沒有上過課，去預約第一堂體驗吧</p>
          <a href="https://xiabenhow.com" target="_blank" rel="noopener noreferrer" className="inline-block mt-3 px-5 py-2 rounded-full text-sm font-medium text-white" style={{ backgroundColor: '#C9A96E' }}>探索課程</a>
        </div>
      )}
    </motion.div>
  );
}

// ===================== PAGE: EXCLUSIVE CONTENT =====================

function ExclusiveContentPage({ userEmail }: { userEmail: string | null }) {
  const [userCourseTypes, setUserCourseTypes] = useState<string[]>([]);

  useEffect(() => {
    if (!userEmail) return;
    const q = query(collection(db, 'user_courses'), where('userId', '==', userEmail));
    const unsub = onSnapshot(q, (snap) => {
      const types = [...new Set(snap.docs.map(d => d.data().courseType as string))];
      setUserCourseTypes(types);
    });
    return unsub;
  }, [userEmail]);

  // Demo: show some unlocked
  const demoTypes = userCourseTypes.length > 0 ? userCourseTypes : ['fragrance', 'crystal', 'plant'];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <p className="text-lg font-bold" style={{ color: '#3D3530' }}>🌿 課後照顧</p>
      <p className="text-xs" style={{ color: '#8C7B72' }}>上過的課程會解鎖專屬照顧內容與進階知識</p>

      {TOPICS.map(topic => {
        const exclusive = COURSE_EXCLUSIVE_CONTENT[topic.key];
        if (!exclusive) return null;
        const unlocked = demoTypes.includes(topic.key);
        return (
          <div key={topic.key} className="rounded-3xl shadow-sm overflow-hidden" style={{ backgroundColor: '#FFFEF9', opacity: unlocked ? 1 : 0.5 }}>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{topic.emoji}</span>
                <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{exclusive.title}</p>
                {unlocked ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#E8F0E8', color: '#5C8A4D' }}>已解鎖</span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#F0EDE8', color: '#8C7B72' }}>🔒 上課後解鎖</span>
                )}
              </div>
              {unlocked ? (
                <div className="space-y-2">
                  {exclusive.items.map((item, i) => (
                    <div key={i} className="p-3 rounded-2xl" style={{ backgroundColor: '#FAF8F5' }}>
                      <p className="text-sm font-medium" style={{ color: '#3D3530' }}>{item.emoji} {item.label}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>{item.desc}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-2xl text-center" style={{ backgroundColor: '#FAF8F5' }}>
                  <p className="text-2xl mb-1">🔒</p>
                  <p className="text-xs" style={{ color: '#8C7B72' }}>上過{topic.label}課程即可解鎖</p>
                  <a href="https://xiabenhow.com" target="_blank" rel="noopener noreferrer" className="inline-block mt-2 px-4 py-1.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: '#C9A96E' }}>預約課程</a>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}

// ===================== CARD COLLECTION ENTRY (Collapsed by default) =====================

function CardCollectionEntry({ onTaskComplete, records }: { onTaskComplete: (key: TaskKey) => void; records: HealingRecord[] }) {
  const [expanded, setExpanded] = useState(false);
  const [albumPage, setAlbumPage] = useState(0);
  const savedCards = loadSavedCards();
  const totalCards = HEALING_CARDS.length;
  const CARDS_PER_PAGE = 15;

  // 取得收藏卡片的完整資料，依日期排序
  const savedCardData = savedCards.map(cardId => {
    const card = HEALING_CARDS.find(c => c.id === cardId);
    // 嘗試從 localStorage 取得抽卡日期
    let date = '';
    for (let i = 0; i < 365; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      try {
        const stored = localStorage.getItem('card_drawn_' + dateStr);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.cardId === cardId) { date = dateStr; break; }
        }
      } catch { /* skip */ }
    }
    return card ? { ...card, date } : null;
  }).filter(Boolean) as (typeof HEALING_CARDS[0] & { date: string })[];

  const totalAlbumPages = Math.max(1, Math.ceil(savedCardData.length / CARDS_PER_PAGE));
  const pageCards = savedCardData.slice(albumPage * CARDS_PER_PAGE, (albumPage + 1) * CARDS_PER_PAGE);

  if (!expanded) {
    return (
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => setExpanded(true)}
        className="w-full rounded-3xl overflow-hidden shadow-sm text-left"
        style={{ border: '1px solid #E8E3DC' }}
      >
        {/* 卡冊封面 */}
        <div className="p-6 text-center" style={{ background: 'linear-gradient(145deg, #F5EDE4 0%, #E8DECE 50%, #D4C4B0 100%)' }}>
          <div className="w-20 h-24 mx-auto rounded-lg shadow-md flex items-center justify-center mb-3"
            style={{ background: 'linear-gradient(135deg, #C9A96E20, #8FA88615)', border: '2px solid #C9A96E40' }}>
            <span className="text-3xl">📖</span>
          </div>
          <p className="text-base font-bold" style={{ color: '#3D3530' }}>我的療癒卡冊</p>
          <p className="text-xs mt-1" style={{ color: '#8C7B72' }}>已收藏 {savedCards.length} 張 · 共 {totalCards} 張</p>
        </div>
        {/* 進度條 */}
        <div className="px-5 py-3" style={{ backgroundColor: '#FFFEF9' }}>
          <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: '#F0EDE8' }}>
            <div className="h-full rounded-full transition-all" style={{ backgroundColor: '#C9A96E', width: String(Math.min(100, (savedCards.length / totalCards) * 100)) + '%' }} />
          </div>
          <div className="flex justify-between mt-1">
            <p className="text-[10px]" style={{ color: '#B5AFA8' }}>收集進度</p>
            <p className="text-[10px] font-medium" style={{ color: '#C9A96E' }}>{Math.round((savedCards.length / totalCards) * 100)}%</p>
          </div>
        </div>
      </motion.button>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
      {/* 卡冊本體 */}
      <div className="rounded-3xl overflow-hidden shadow-md" style={{ border: '2px solid #D4C4B0' }}>
        {/* 卡冊頂部 */}
        <div className="px-5 py-4 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #F5EDE4, #E8DECE)' }}>
          <div className="flex items-center gap-2">
            <span className="text-xl">📖</span>
            <div>
              <p className="text-sm font-bold" style={{ color: '#3D3530' }}>我的療癒卡冊</p>
              <p className="text-[10px]" style={{ color: '#8C7B72' }}>{savedCards.length} / {totalCards} 張</p>
            </div>
          </div>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => setExpanded(false)}
            className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FFFEF960' }}>
            <span className="text-xs" style={{ color: '#8C7B72' }}>✕</span>
          </motion.button>
        </div>

        {/* 卡片網格 */}
        <div className="p-4" style={{ backgroundColor: '#FFFEF9', minHeight: '300px' }}>
          {savedCardData.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-4xl block mb-3">✦</span>
              <p className="text-sm" style={{ color: '#8C7B72' }}>卡冊裡還沒有卡片</p>
              <p className="text-xs mt-1" style={{ color: '#B5AFA8' }}>每天抽一張卡牌，點「收藏進卡冊」就會出現在這裡</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {/* 填滿 15 格：有卡片的顯示卡片，沒有的顯示空位 */}
              {Array.from({ length: CARDS_PER_PAGE }).map((_, i) => {
                const card = pageCards[i];
                if (card) {
                  const cfg = CARD_COLOR_CONFIG[card.color];
                  return (
                    <motion.div key={card.id} whileTap={{ scale: 0.95 }}
                      className="rounded-xl overflow-hidden shadow-sm" style={{ border: '1.5px solid ' + (cfg?.hex || '#8FA886') + '40', aspectRatio: '3/4' }}>
                      {card.image ? (
                        <div className="w-full h-full relative">
                          <img src={card.image} alt={card.title} className="w-full h-full object-cover" />
                          {card.date && (
                            <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 text-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
                              <p className="text-[8px] text-white">{card.date.slice(5)}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-1.5" style={{ background: cfg?.gradient || cfg?.bgLight || '#FAF8F5' }}>
                          <span className="text-lg mb-0.5">{cfg?.label?.charAt(0) || '✦'}</span>
                          <p className="text-[8px] text-center font-medium leading-tight" style={{ color: cfg?.hex }}>{card.title}</p>
                          {card.date && <p className="text-[7px] mt-0.5" style={{ color: '#B5AFA8' }}>{card.date.slice(5)}</p>}
                        </div>
                      )}
                    </motion.div>
                  );
                } else {
                  return (
                    <div key={'empty-' + i} className="rounded-xl flex items-center justify-center"
                      style={{ aspectRatio: '3/4', backgroundColor: '#FAF8F5', border: '1.5px dashed #E8E3DC' }}>
                      <span className="text-lg" style={{ color: '#E8E3DC' }}>✦</span>
                    </div>
                  );
                }
              })}
            </div>
          )}
        </div>

        {/* 翻頁 */}
        {totalAlbumPages > 1 && (
          <div className="flex items-center justify-center gap-4 py-3" style={{ backgroundColor: '#FAF8F5', borderTop: '1px solid #F0EDE8' }}>
            <motion.button whileTap={{ scale: 0.9 }}
              onClick={() => setAlbumPage(p => Math.max(0, p - 1))}
              disabled={albumPage === 0}
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: albumPage === 0 ? '#F0EDE8' : '#C9A96E20', color: albumPage === 0 ? '#B5AFA8' : '#C9A96E' }}>
              ‹
            </motion.button>
            <p className="text-xs font-medium" style={{ color: '#8C7B72' }}>
              {albumPage + 1} / {totalAlbumPages}
            </p>
            <motion.button whileTap={{ scale: 0.9 }}
              onClick={() => setAlbumPage(p => Math.min(totalAlbumPages - 1, p + 1))}
              disabled={albumPage === totalAlbumPages - 1}
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: albumPage === totalAlbumPages - 1 ? '#F0EDE8' : '#C9A96E20', color: albumPage === totalAlbumPages - 1 ? '#B5AFA8' : '#C9A96E' }}>
              ›
            </motion.button>
          </div>
        )}
      </div>

      {/* 繼續抽卡按鈕 */}
      <CardPage onTaskComplete={onTaskComplete} records={records} />
    </motion.div>
  );
}

// ===================== PAGE: HEALER (REDESIGNED) =====================

function HealerPage({ records, userEmail, onNavigate, onTaskComplete, onCheckIn }: { records: HealingRecord[]; userEmail?: string | null; onNavigate?: (p: PageType) => void; onTaskComplete?: () => void; onCheckIn?: (emotion: EmotionKey) => void }) {
  const [activeExploreTab, setActiveExploreTab] = useState<'card' | 'tests' | 'personality'>('card');
  const personalityProfile = loadPersonalityProfile();
  const personalityInfo = personalityProfile ? HEALING_PERSONALITIES[personalityProfile.primary] : null;

  // 內嵌心情記錄
  const [inlineMoodNote, setInlineMoodNote] = useState('');
  const [inlineMoodEmotion, setInlineMoodEmotion] = useState<EmotionKey | null>(null);
  const [inlineMoodSaving, setInlineMoodSaving] = useState(false);
  const [inlineMoodSuccess, setInlineMoodSuccess] = useState(false);

  const totalDays = new Set(records.map(r => r.date)).size;
  const level = getLevel(totalDays);
  const mostFrequent = getMostFrequentEmotion(records);
  const mostFrequentInfo = mostFrequent ? getEmotionInfo(mostFrequent) : null;
  const stabilityStars = getStabilityStars(records);
  const isNewUser = totalDays === 0;

  const progressPercent = level.next === Infinity
    ? 100
    : Math.min(100, ((totalDays - level.min) / (level.next - level.min)) * 100);

  // Update personality scores based on behavior (emotions)
  useEffect(() => {
    if (!personalityProfile || !mostFrequent) return;
    const key = `emotion:${mostFrequent}`;
    const weights = BEHAVIOR_WEIGHTS[key];
    if (!weights) return;
    const newScores = { ...personalityProfile.scores };
    (Object.keys(weights) as HealingPersonalityType[]).forEach(k => {
      newScores[k] += weights[k] || 0;
    });
    const { primary, secondary } = getPersonalityFromScores(newScores);
    if (primary !== personalityProfile.primary || secondary !== personalityProfile.secondary) {
      const updated = { ...personalityProfile, scores: newScores, primary, secondary, lastUpdated: new Date().toISOString() };
      savePersonalityProfile(updated);
    }
  }, [mostFrequent]); // eslint-disable-line

  const chatBubbles = useMemo(() => {
    const bubbles: string[] = [];
    if (isNewUser) {
      // 全新用戶 — 引導語，不顯示任何假統計
      bubbles.push('嗨，我是 AURA，你的療癒師。很高興見到你。');
      bubbles.push('在這裡，你可以每天花 30 秒記錄心情。我會慢慢認識你，給你專屬的香氛和療癒建議。');
    } else if (!mostFrequent) {
      bubbles.push('歡迎回來。繼續記錄你的心情，讓我更了解你。');
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
      const recentRecord = records[records.length - 1];
      if (recentRecord) {
        const emo = getEmotionInfo(recentRecord.emotion);
        const recordDate = new Date(recentRecord.date);
        const today = new Date();
        const diffDays = Math.floor((today.getTime() - recordDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) {
          bubbles.push(`今天你記錄了 ${emo.emoji} ${emo.label}，謝謝你願意感受自己。`);
        } else if (diffDays === 1) {
          bubbles.push(`昨天你感到 ${emo.emoji} ${emo.label}，今天的你還好嗎？`);
        } else {
          bubbles.push(`距離上次記錄已經 ${diffDays} 天了，今天花一點時間感受自己吧。`);
        }
      }
    }
    return bubbles;
  }, [records, mostFrequent, isNewUser]);

  const handleInlineMoodSave = () => {
    if (!inlineMoodEmotion) return;
    setInlineMoodSaving(true);
    if (onCheckIn) onCheckIn(inlineMoodEmotion);
    setInlineMoodSaving(false);
    setInlineMoodSuccess(true);
    setInlineMoodEmotion(null);
    setInlineMoodNote('');
    setTimeout(() => setInlineMoodSuccess(false), 2500);
  };

  const inlineEmoInfo = inlineMoodEmotion ? getEmotionInfo(inlineMoodEmotion) : null;
  const inlineRecommendation = inlineMoodEmotion ? getOilRecommendation(inlineMoodEmotion) : null;

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
        style={{ backgroundColor: '#FFFEF9', backgroundImage: 'url(/healer-bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-purple-200 to-teal-200 flex items-center justify-center mb-3 shadow-sm">
          <span className="text-3xl">🌿</span>
        </div>
        <h2 className="text-lg font-bold" style={{ color: '#3D3530' }}>AURA 療癒師</h2>
        <p className="text-sm" style={{ color: '#8C7B72' }}>你的體驗專家，溫柔地陪伴你</p>
      </motion.div>

      {/* 新用戶引導 — 說明為什麼要記錄心情 */}
      {isNewUser && (
        <motion.div
          variants={staggerItem}
          className="rounded-3xl p-5 shadow-sm"
          style={{ background: 'linear-gradient(135deg, #FAF8F5 0%, #F5F0EB 100%)' }}
        >
          <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>為什麼要記錄心情？</p>
          <div className="space-y-2">
            {[
              { icon: '🧭', text: '了解自己的情緒節奏，找到你的身心規律' },
              { icon: '🌿', text: '累積 7 天後，我會給你專屬的精油和療癒建議' },
              { icon: '📊', text: '看見情緒變化的趨勢，覺察是療癒的第一步' },
              { icon: '🎁', text: '每次記錄都會幫你找到最適合的療癒配方' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-sm flex-shrink-0">{item.icon}</span>
                <p className="text-sm leading-relaxed" style={{ color: '#5C534C' }}>{item.text}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* 內嵌心情快速記錄 */}
      <motion.div
        variants={staggerItem}
        className="rounded-3xl p-5 shadow-sm relative overflow-hidden"
        style={{
          backgroundImage: 'url(/bg-mood-selector.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 rounded-3xl" style={{ backgroundColor: 'rgba(255,254,249,0.5)' }} />
        <div className="relative z-10">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🎨</span>
          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>
            {isNewUser ? '選擇一個心情，開始你的療癒旅程' : '選擇一個心情，給你對應的精油平衡配方'}
          </p>
        </div>

        {inlineMoodSuccess ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-6"
          >
            <span className="text-4xl block mb-2">✨</span>
            <p className="text-sm font-medium" style={{ color: '#8FA886' }}>已記錄！謝謝你願意感受自己</p>
            {inlineRecommendation && (
              <p className="text-xs mt-2" style={{ color: '#8C7B72' }}>推薦香氛：{inlineRecommendation.oils.join(' + ')}</p>
            )}
          </motion.div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              {MAIN_EMOTIONS.map((emo) => (
                <motion.button
                  key={emo.key}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setInlineMoodEmotion(emo.key)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                  style={{
                    backgroundColor: inlineMoodEmotion === emo.key ? emo.color + '30' : '#FAF8F5',
                    color: inlineMoodEmotion === emo.key ? emo.color : '#8C7B72',
                    border: inlineMoodEmotion === emo.key ? `1.5px solid ${emo.color}` : '1.5px solid transparent',
                  }}
                >
                  <span>{emo.emoji}</span>
                  <span>{emo.label}</span>
                </motion.button>
              ))}
            </div>

            {/* 選完情緒後的精油平衡配方 */}
            {inlineMoodEmotion && inlineRecommendation && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mb-3 rounded-2xl p-4"
                style={{ backgroundColor: (inlineEmoInfo?.color || '#C9A96E') + '15', border: `1px solid ${(inlineEmoInfo?.color || '#C9A96E')}25` }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🌿</span>
                  <p className="text-sm font-bold" style={{ color: inlineEmoInfo?.color || '#C9A96E' }}>
                    你的精油平衡配方
                  </p>
                </div>
                <div className="rounded-xl p-3 mb-2" style={{ backgroundColor: '#FFFEF9' }}>
                  <p className="text-sm font-medium" style={{ color: '#3D3530' }}>{inlineRecommendation.oils.join(' + ')}</p>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: '#5C534C' }}>{inlineRecommendation.description}</p>
              </motion.div>
            )}

            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={handleInlineMoodSave}
              disabled={!inlineMoodEmotion || inlineMoodSaving}
              className="w-full rounded-2xl py-2.5 text-sm font-medium transition-all"
              style={{
                backgroundColor: inlineMoodEmotion ? '#C9A96E' : '#E8E3DC',
                color: inlineMoodEmotion ? 'white' : '#B5AFA8',
              }}
            >
              {inlineMoodSaving ? '記錄中...' : '記錄心情'}
            </motion.button>
          </>
        )}
        </div>{/* close z-10 wrapper for mood selector */}
      </motion.div>

      {/* 療癒師的話 */}
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

      {/* Analysis Card — 只有真實紀錄才顯示 */}
      {totalDays > 0 && (
        <motion.div
          variants={staggerItem}
          className="rounded-3xl p-5 shadow-sm"
          style={{ backgroundColor: '#FFFEF9' }}
        >
          {totalDays < 3 ? (
            <div className="text-center">
              <p className="text-sm leading-relaxed" style={{ color: '#3D3530' }}>
                你已經開始了 🌱
              </p>
              <p className="text-sm mt-2 leading-relaxed" style={{ color: '#8C7B72' }}>
                繼續記錄，我會越來越了解你。
              </p>
              <p className="text-sm mt-2" style={{ color: '#8FA886' }}>
                已記錄 {totalDays} 天，再 {3 - totalDays} 天解鎖個人化建議
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
                    療癒建議：{(() => { const hd = getHealingData(mostFrequent, 'L1'); return hd ? hd.warmMessages[0] : '繼續照顧自己吧'; })()}
                  </p>
                  <p className="text-sm font-medium" style={{ color: '#8FA886' }}>
                    推薦精油：{(() => { const hd = getHealingData(mostFrequent, 'L1'); return hd ? hd.blend.oils.join(' + ') : '薰衣草 + 乳香'; })()}
                  </p>
                </>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* Growth System — 已移除 */}

      {/* Explore Tabs Section */}
      <motion.div variants={staggerItem} className="space-y-4">
        <div>
          <h3 className="text-lg font-bold" style={{ color: '#3D3530' }}>🔮 探索</h3>
          <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>透過卡牌與測驗，更深入地認識自己</p>
        </div>

        {/* Tab Buttons — 大格 */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'card' as const, label: '✦ 療癒卡牌', desc: '每日一抽，收集專屬卡片', emoji: '🪷', highlight: true },
            { key: 'tests' as const, label: '🌱 心理測驗', desc: '探索內在，了解自己', emoji: '🧘', highlight: false },
          ].map(tab => (
            <motion.button key={tab.key} whileTap={{ scale: 0.96 }}
              onClick={() => setActiveExploreTab(tab.key)}
              className="rounded-3xl p-5 text-center"
              style={{
                backgroundColor: activeExploreTab === tab.key ? '#FFFEF9' : '#FAF8F5',
                border: activeExploreTab === tab.key ? '2px solid #C9A96E60' : '1.5px solid #F0EDE8',
                minHeight: '120px',
              }}>
              <span className="text-3xl block mb-2">{tab.emoji}</span>
              <p className="text-sm font-bold" style={{ color: activeExploreTab === tab.key ? '#3D3530' : '#8C7B72' }}>{tab.label}</p>
              <p className="text-xs mt-1" style={{ color: '#B5AFA8' }}>{tab.desc}</p>
            </motion.button>
          ))}
        </div>
        {/* 測驗分析 — 小格 */}
        <motion.button whileTap={{ scale: 0.96 }}
          onClick={() => setActiveExploreTab('personality')}
          className="w-full rounded-2xl p-4 flex items-center gap-3"
          style={{
            backgroundColor: activeExploreTab === 'personality' ? '#FFFEF9' : '#FAF8F5',
            border: activeExploreTab === 'personality' ? '2px solid #C9A96E60' : '1.5px solid #F0EDE8',
          }}>
          <span className="text-2xl">📋</span>
          <div className="text-left">
            <p className="text-sm font-bold" style={{ color: activeExploreTab === 'personality' ? '#3D3530' : '#8C7B72' }}>測驗分析</p>
            <p className="text-xs" style={{ color: '#B5AFA8' }}>{personalityInfo ? personalityInfo.label : '查看你的測驗結果與分析'}</p>
          </div>
          <span className="ml-auto text-sm" style={{ color: '#C9A96E' }}>›</span>
        </motion.button>

        {/* 卡牌區 */}
        {activeExploreTab === 'card' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            <CardCollectionEntry onTaskComplete={onTaskComplete || (() => {})} records={records} />
          </motion.div>
        )}

        {/* 心理測驗區 */}
        {activeExploreTab === 'tests' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <PsychTestContainer />
          </motion.div>
        )}

        {/* 療癒人格區 */}
        {activeExploreTab === 'personality' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            {personalityProfile ? (
              <>
                <div className="rounded-2xl p-5 shadow-sm" style={{ background: personalityInfo?.gradient || 'linear-gradient(135deg, #FFFEF9 0%, #FAF8F5 100%)' }}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-4xl">{personalityInfo?.emoji}</span>
                    <div>
                      <p className="text-lg font-bold" style={{ color: '#3D3530' }}>{personalityInfo?.label}</p>
                      <p className="text-xs" style={{ color: '#8C7B72' }}>{personalityInfo?.subtitle}</p>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: '#5C534C' }}>{personalityInfo?.description}</p>
                  {personalityInfo?.traits && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {personalityInfo.traits.map(trait => (
                        <span key={trait} className="text-xs px-2 py-1 rounded-lg" style={{ backgroundColor: '#FFFEF960', color: '#8C7B72' }}>{trait}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-2xl p-4 shadow-sm space-y-3" style={{ backgroundColor: '#FFFEF9' }}>
                  <p className="text-sm font-bold" style={{ color: '#3D3530' }}>人格分佈</p>
                  {(Object.keys(HEALING_PERSONALITIES) as HealingPersonalityType[]).map(type => {
                    const info = HEALING_PERSONALITIES[type];
                    const score = personalityProfile.scores[type] || 0;
                    const maxScore = Math.max(...Object.values(personalityProfile.scores));
                    const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
                    return (
                      <div key={type}>
                        <div className="flex justify-between text-xs mb-1">
                          <span style={{ color: '#3D3530' }}>{info.emoji} {info.label}</span>
                          <span style={{ color: '#8C7B72' }}>{score}</span>
                        </div>
                        <div className="w-full h-2 rounded-full" style={{ backgroundColor: '#F0EDE8' }}>
                          <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }}
                            className="h-full rounded-full" style={{ backgroundColor: info.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <PersonalityRecommendations profile={personalityProfile} />
              </>
            ) : (
              <div className="space-y-4">
                {/* 引導做測驗 */}
                <div className="rounded-3xl p-6 text-center" style={{ background: 'linear-gradient(135deg, #FAF8F5 0%, #F5F0EB 100%)' }}>
                  <span className="text-4xl block mb-3">🔮</span>
                  <p className="text-base font-bold mb-2" style={{ color: '#3D3530' }}>還沒有測驗結果</p>
                  <p className="text-sm leading-relaxed mb-4" style={{ color: '#8C7B72' }}>
                    完成心理測驗後，我會分析你的療癒人格類型，給你更精準的建議。測驗越多，分析越準確。
                  </p>
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setActiveExploreTab('tests')}
                    className="px-6 py-3 rounded-2xl text-sm font-medium text-white"
                    style={{ backgroundColor: '#C9A96E' }}
                  >
                    🌱 開始第一個心理測驗
                  </motion.button>
                </div>
                <PersonalityQuiz onComplete={() => window.location.reload()} />
              </div>
            )}
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ===================== BOTTOM NAV =====================

const NAV_ITEMS: { key: PageType; icon: string; label: string; url?: string }[] = [
  { key: 'home', icon: '🏠', label: '主頁' },
  { key: 'card', icon: '🃏', label: '抽卡' },
  { key: 'home', icon: '🌐', label: '官網', url: 'https://www.xiabenhow.com' },
  { key: 'explore', icon: '🔍', label: '探索' },
  { key: 'member', icon: '👤', label: '我的' },
];

// ===================== PAGE: 課後照顧中心 (Aftercare Center) =====================

// --- 課後照顧 Types ---
interface PlantRecord {
  id: string;
  name: string;
  lastWatered: string; // ISO date string
  intervalDays: number;
  emoji: string;
}

interface FragranceRecord {
  id: string;
  name: string;
  date: string;
  topNotes: string[];
  middleNotes: string[];
  baseNotes: string[];
  memo: string;
}

interface MyWork {
  id: string;
  type: 'fragrance' | 'plant' | 'crystal' | 'leather' | 'candle' | 'other';
  name: string;
  date: string;
  emoji: string;
  memo: string;
}

type CourseType = 'fragrance' | 'plant' | 'crystal' | 'leather' | 'candle';

// --- 課後照顧 知識內容 ---
const AFTERCARE_KNOWLEDGE = {
  plant: [
    { id: 'pk1', emoji: '💧', title: '多肉多久澆一次水？', summary: '一般 7-10 天一次，夏天可縮短、冬天可拉長。觀察土壤乾燥程度是最好的判斷方式。', content: '多肉植物的澆水頻率取決於季節、環境和盆器材質。春秋季約 7 天一次，夏季高溫可能需要 5-7 天，冬季休眠期可延長至 14 天。最簡單的判斷方法是用手指插入土壤約 2 公分深，如果完全乾燥就可以澆水了。\n\n澆水時請澆透，讓水從盆底流出，但不要讓盆器泡在積水中。建議在早上或傍晚澆水，避免正午高溫時澆水。' },
    { id: 'pk2', emoji: '🍃', title: '葉子皺皺的是缺水嗎？', summary: '通常是缺水的信號，但也可能是根部出了問題。輕輕碰觸葉片，如果軟軟的就是該喝水了。', content: '多肉葉片出現皺褶，最常見的原因確實是缺水。健康的多肉葉片應該飽滿有彈性，當水分不足時會開始萎縮。\n\n但也有其他可能：根部腐爛導致無法吸水、換盆後根系還沒恢復、或是曬傷。如果澆水後 2-3 天葉片沒有恢復飽滿，建議檢查根部是否健康。\n\n小提醒：底部老葉自然乾枯是正常的新陳代謝，不需要擔心。' },
    { id: 'pk3', emoji: '☀️', title: '室內養多肉的注意事項', summary: '光照、通風、澆水頻率是三大關鍵。放在靠窗處，保持空氣流通最重要。', content: '室內養多肉最重要的三件事：\n\n光照：多肉需要充足的散射光，建議放在南向或東向窗台。如果葉片開始徒長（莖變長、葉片間距變大），表示光照不足。\n\n通風：保持空氣流通可以預防病蟲害和根部腐爛。避免放在完全密閉的角落。\n\n澆水：室內蒸發較慢，澆水頻率要比室外更低。寧可少澆，多肉比較怕澇不怕旱。\n\n額外提醒：冷氣直吹會讓多肉脫水，暖氣太近會過熱，請找一個溫度適中的位置。' },
    { id: 'pk4', emoji: '🌱', title: '多肉的日照與通風小提醒', summary: '每天至少 4 小時散射光。通風不良容易引發黑腐病，記得偶爾開窗讓空氣流動。', content: '多肉植物原生於乾燥、光照充足的環境，所以充足的光照對它們來說非常重要。\n\n理想的光照條件是每天 4-6 小時的明亮散射光。直射的午後烈日可能會曬傷葉片（出現褐色斑點），建議用紗簾過濾。\n\n通風方面，多肉特別怕悶熱潮濕。如果環境不通風，澆水後水分蒸發慢，容易造成根部腐爛或黑腐病。建議每天至少有一段時間開窗通風，讓空氣自然流動。' },
  ],
  fragrance: [
    { id: 'fk1', emoji: '🫧', title: '香水該怎麼保存？', summary: '避光、避熱、避潮濕。放在陰涼處，不要放浴室或車上。', content: '香水最怕三件事：光線、高溫、潮濕。\n\n保存建議：放在衣櫃、抽屜或化妝台等陰涼避光處。不要放在浴室（潮濕）、車上（高溫）或窗台邊（日曬）。\n\n開封後建議在 1-2 年內使用完畢。如果發現香味變酸、變色或出現沉澱，可能已經氧化變質。\n\n小技巧：噴在手腕、耳後、脖子兩側等脈搏處，體溫會幫助香味慢慢散發。' },
    { id: 'fk2', emoji: '🌸', title: '什麼時候適合補香？', summary: '一般香水約 4-6 小時後開始淡化。下午是很好的補香時機，輕輕補一下就好。', content: '不同濃度的香水持香時間不同：淡香水（EDT）約 3-5 小時，淡香精（EDP）約 6-8 小時。\n\n建議的補香時機：午餐後或下午 3-4 點。輕輕在手腕或衣領噴一下即可，不需要大面積補噴。\n\n如果是自己調的香氛，天然精油的持香時間通常比合成香料短，可能 2-4 小時就會淡化。隨身攜帶滾珠瓶方便隨時補香。' },
    { id: 'fk3', emoji: '📝', title: '精油入門：認識前中後調', summary: '前調清新易揮發，中調是主角，後調深沉持久。三者搭配才是完整的香氣旅程。', content: '調香就像譜一首曲子，前中後三個調性各有角色：\n\n前調（Top Notes）：第一印象，通常是柑橘、薄荷等清新香氣，揮發最快，約 15-30 分鐘。\n\n中調（Middle Notes）：香水的心臟，通常是花香或草本香氣，在前調消散後顯現，持續 2-4 小時。\n\n後調（Base Notes）：深沉持久的底蘊，通常是木質、樹脂或麝香類，持續 6 小時以上。\n\n調香時建議比例：前調 15-25%、中調 30-40%、後調 30-40%，但沒有絕對的規則，跟著感覺走也很好。' },
  ],
  crystal: [
    { id: 'ck1', emoji: '🔮', title: '水晶需要消磁嗎？', summary: '建議定期消磁，讓水晶回到最純淨的狀態。常見方式有月光浴、鼠尾草煙燻、音缽淨化。', content: '水晶消磁是一種能量淨化的概念。當你覺得水晶能量變得沉重或不太對勁時，就是消磁的好時機。\n\n常見消磁方式：\n\n月光浴：滿月夜晚將水晶放在窗邊或陽台，讓月光照拂一整晚。\n\n鼠尾草煙燻：點燃鼠尾草，讓煙繞過水晶表面。\n\n音缽/音叉淨化：用頌缽的聲波震動淨化水晶能量。\n\n流水淨化：放在流動的清水下沖洗（注意：部分水晶不能碰水，如硒石、孔雀石等）。\n\n建議每 1-2 週消磁一次，或在你覺得需要的時候進行。' },
    { id: 'ck2', emoji: '✨', title: '水晶手鍊怎麼保養？', summary: '避免碰水、碰化學品。洗手、洗澡前記得取下。定期用軟布輕拭。', content: '水晶手鍊的日常保養其實很簡單：\n\n避免碰水：洗手、洗澡、游泳前請取下。水分會讓串線老化、金屬配件氧化。\n\n避免化學品：香水、乳液、清潔劑都可能影響水晶光澤。建議先擦乳液、噴香水，等乾燥後再戴手鍊。\n\n存放方式：不戴時放在柔軟的布袋或首飾盒中，避免與其他飾品碰撞（硬度不同可能互相刮傷）。\n\n清潔方式：用柔軟的棉布或眼鏡布輕輕擦拭即可。如果需要深層清潔，可用微濕的布擦拭後立即擦乾。' },
    { id: 'ck3', emoji: '💜', title: '今天適合哪種水晶能量？', summary: '根據你的狀態選擇：想安定選紫水晶、想開心選黃水晶、想被愛選粉晶。', content: '每種水晶都有它獨特的能量特質，你可以根據當下的需求來選擇：\n\n想要平靜安定 → 紫水晶：帶來內心的寧靜與直覺力。\n\n想要開心自信 → 黃水晶：增添陽光般的正面能量與自信。\n\n想要被愛包圍 → 粉晶：溫柔的愛的能量，療癒心輪。\n\n想要清晰專注 → 白水晶：淨化空間、提升專注力。\n\n想要勇氣行動 → 虎眼石：帶來勇氣與決斷力。\n\n沒有一定要很懂才能戴水晶。跟著直覺走，被哪顆吸引就選哪顆，通常就是你當下最需要的。' },
  ],
  leather: [
    { id: 'lk1', emoji: '👜', title: '皮革作品的日常保養', summary: '定期擦拭、避免潮濕、適時上油。好的保養讓皮革越用越有味道。', content: '皮革是有生命力的材質，好好照顧它會越來越美：\n\n日常擦拭：每週用柔軟的棉布輕輕擦去灰塵和指紋。\n\n防潮：皮革怕潮濕，不用時放在通風處，可放入防潮袋。淋雨後用乾布吸乾水分，自然風乾（不要用吹風機）。\n\n上油保養：每 1-3 個月用皮革專用保養油薄薄擦一層。不要用嬰兒油或凡士林，可能會堵塞毛孔。\n\n避免：長時間日曬（會褪色龜裂）、接觸化學品、用力摩擦。\n\n皮革的變色和使用痕跡是它的故事，養出屬於你的獨特色澤是手作皮革最迷人的地方。' },
  ],
};

// ===================== 日記頁面 =====================

interface JournalEntry {
  id?: string;
  text: string;
  symbols: string[];  // selected emoji/symbols
  photos?: string[];  // base64 photo data URLs
  timestamp: number;
  date: string; // YYYY-MM-DD
}

function JournalPage({ user }: { user: User | null }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
  const [currentDate, setCurrentDate] = useState(getToday());
  const [inputText, setInputText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // PIN Lock states
  const [journalLocked, setJournalLocked] = useState(() => !!localStorage.getItem('journal_pin'));
  const [pinVerified, setPinVerified] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinStep, setPinStep] = useState<'enter' | 'set' | 'confirm' | 'forgot'>('enter');
  const [pinError, setPinError] = useState('');
  const [pinFailCount, setPinFailCount] = useState(0);
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [securitySetup, setSecuritySetup] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const symbolPalette = ['😊', '😢', '😤', '😴', '🥰', '😌', '🤔', '💪', '☀️', '🌙', '⭐', '🌈', '🍃', '🔥', '💧', '🎵', '❤️', '💔', '🙏', '✨', '🌸', '🦋', '🎶', '🌻'];

  // Check if PIN exists
  const hasPin = () => !!localStorage.getItem('journal_pin');
  const getStoredPin = () => {
    try { return atob(localStorage.getItem('journal_pin') || ''); } catch { return ''; }
  };
  const getSecurityAnswer = () => {
    try { return atob(localStorage.getItem('journal_security_answer') || ''); } catch { return ''; }
  };

  // If locked and not verified, show lock screen
  const isLocked = journalLocked && !pinVerified;

  // Load entries: always load localStorage first, then try Firestore merge
  useEffect(() => {
    // Always load localStorage immediately
    const stored = localStorage.getItem('journal_entries');
    const localEntries: JournalEntry[] = stored ? JSON.parse(stored) : [];
    if (localEntries.length > 0) setEntries(localEntries);

    // Then try Firestore for logged-in users
    if (user) {
      (async () => {
        try {
          const colRef = collection(db, 'journal_entries');
          let snapshot;
          try {
            // Try indexed query first (requires composite index)
            const q = query(colRef, where('userId', '==', user.uid), orderBy('timestamp', 'desc'));
            snapshot = await getDocs(q);
          } catch (indexErr) {
            // Fallback: simple query without orderBy (no composite index needed), sort client-side
            console.warn('[Firestore] journal indexed query failed, using fallback:', indexErr);
            const fallbackQ = query(colRef, where('userId', '==', user.uid));
            snapshot = await getDocs(fallbackQ);
          }
          const firestoreEntries = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as JournalEntry[];
          console.log('[Firestore] journal entries loaded:', firestoreEntries.length);
          if (firestoreEntries.length > 0) {
            // Merge: use Firestore as source of truth, add any local-only entries
            const fsTimestamps = new Set(firestoreEntries.map(e => e.timestamp));
            const localOnly = localEntries.filter(e => !fsTimestamps.has(e.timestamp));
            const merged = [...firestoreEntries, ...localOnly].sort((a, b) => b.timestamp - a.timestamp);
            setEntries(merged);
            localStorage.setItem('journal_entries', JSON.stringify(merged));
          } else if (localEntries.length > 0) {
            // Firestore empty but local has data — push local to Firestore
            console.log('[Firestore] pushing local journal entries to Firestore:', localEntries.length);
            for (const entry of localEntries) {
              try { await addDoc(colRef, { userId: user.uid, ...entry, createdAt: Timestamp.now() }); } catch (e) { console.error('[Firestore] push journal entry failed:', e); }
            }
          }
        } catch (err) {
          console.error('[Firestore] journal load completely failed:', err);
        }
      })();
    }
  }, [user]);

  // Insert emoji at cursor position in textarea
  const insertEmojiAtCursor = (emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setInputText(prev => prev + emoji);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newText = inputText.slice(0, start) + emoji + inputText.slice(end);
    setInputText(newText);
    // Restore cursor position after emoji
    requestAnimationFrame(() => {
      textarea.focus();
      const newPos = start + emoji.length;
      textarea.setSelectionRange(newPos, newPos);
    });
  };

  // Photo handling
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      if (file.size > 5 * 1024 * 1024) return; // Max 5MB
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setPhotos(prev => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = ''; // Reset input
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const saveEntry = async () => {
    if (!inputText.trim() && photos.length === 0) return;
    setSaving(true);

    const newEntry: JournalEntry = {
      text: inputText.trim(),
      symbols: [],
      photos: photos.length > 0 ? photos : undefined,
      timestamp: Date.now(),
      date: currentDate,
    };

    if (user) {
      try {
        const colRef = collection(db, 'journal_entries');
        const docRef = await addDoc(colRef, {
          userId: user.uid,
          ...newEntry,
          createdAt: Timestamp.now(),
        });
        newEntry.id = docRef.id;
      } catch (error) {
        console.error('Failed to save entry:', error);
      }
    }

    const updated = [newEntry, ...entries];
    setEntries(updated);
    // Always save to localStorage as backup (even when logged in)
    localStorage.setItem('journal_entries', JSON.stringify(updated));

    setInputText('');
    setPhotos([]);
    setSaving(false);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);
  };

  const handleDeleteEntry = async (entry: JournalEntry) => {
    if (!confirm('確定要刪除這篇日記嗎？')) return;
    // Remove from Firestore if has id and user is logged in
    if (entry.id && user) {
      try {
        await deleteDoc(doc(db, 'journal_entries', entry.id));
      } catch (err) {
        console.error('Failed to delete from Firestore:', err);
      }
    }
    // Remove from local state and localStorage
    const updated = entries.filter(e => e.timestamp !== entry.timestamp || e.text !== entry.text);
    setEntries(updated);
    localStorage.setItem('journal_entries', JSON.stringify(updated));
  };

  const filteredEntries = entries.filter(e =>
    searchQuery ? e.text.toLowerCase().includes(searchQuery.toLowerCase()) : true
  );

  const getEntriesForDate = (dateStr: string) =>
    filteredEntries.filter(e => e.date === dateStr);

  const navigateDate = (direction: number) => {
    const d = new Date(currentDate);
    if (viewMode === 'day') {
      d.setDate(d.getDate() + direction);
    } else if (viewMode === 'week') {
      d.setDate(d.getDate() + direction * 7);
    } else {
      d.setMonth(d.getMonth() + direction);
    }
    setCurrentDate(formatDate(d));
  };

  const getDaysInMonth = (dateStr: string) => {
    const [year, month] = dateStr.split('-');
    return new Date(parseInt(year), parseInt(month), 0).getDate();
  };

  // Get recent days for vertical feed
  const getRecentDayEntries = () => {
    const days: { date: string; entries: JournalEntry[] }[] = [];
    const d = new Date(currentDate);
    for (let i = 0; i < 30; i++) {
      const dateStr = formatDate(d);
      const dayEntries = getEntriesForDate(dateStr);
      if (dayEntries.length > 0) {
        days.push({ date: dateStr, entries: dayEntries });
      }
      d.setDate(d.getDate() - 1);
    }
    return days;
  };

  // PIN verification
  const verifyPin = () => {
    const stored = getStoredPin();
    if (pinInput === stored) {
      setPinVerified(true);
      setPinInput('');
      setPinError('');
      setPinFailCount(0);
    } else {
      const newCount = pinFailCount + 1;
      setPinFailCount(newCount);
      setPinError(newCount >= 5 ? '密碼錯誤次數過多，請使用忘記密碼' : `密碼錯誤 (${newCount}/5)`);
      setPinInput('');
    }
  };

  // Set new PIN
  const setNewPin = () => {
    if (pinInput.length < 4) {
      setPinError('密碼至少需要4位數');
      return;
    }
    if (pinStep === 'set') {
      setPinConfirm(pinInput);
      setPinInput('');
      setPinStep('confirm');
      setPinError('');
    } else if (pinStep === 'confirm') {
      if (pinInput === pinConfirm) {
        localStorage.setItem('journal_pin', btoa(pinInput));
        try { const u = auth.currentUser; if (u) setDoc(doc(db, 'user_data', u.uid), { journalPin: btoa(pinInput) }, { merge: true }).catch(e => console.error('[Firestore] write:', e)); } catch {}
        if (securitySetup.trim()) {
          localStorage.setItem('journal_security_answer', btoa(securitySetup.trim().toLowerCase()));
          try { const u = auth.currentUser; if (u) setDoc(doc(db, 'user_data', u.uid), { journalSecurityAnswer: btoa(securitySetup.trim().toLowerCase()) }, { merge: true }).catch(e => console.error('[Firestore] write:', e)); } catch {}
        }
        setJournalLocked(true);
        setPinVerified(true);
        setShowPinSetup(false);
        setPinInput('');
        setPinConfirm('');
        setPinError('');
        setSecuritySetup('');
      } else {
        setPinError('兩次輸入不一致，請重新設定');
        setPinStep('set');
        setPinInput('');
        setPinConfirm('');
      }
    }
  };

  // Forgot password
  const handleForgotPassword = () => {
    const stored = getSecurityAnswer();
    if (!stored) {
      // No security answer set — allow reset after warning
      localStorage.removeItem('journal_pin');
      localStorage.removeItem('journal_security_answer');
      try { const u = auth.currentUser; if (u) setDoc(doc(db, 'user_data', u.uid), { journalPin: null, journalSecurityAnswer: null }, { merge: true }).catch(e => console.error('[Firestore] write:', e)); } catch {}
      setJournalLocked(false);
      setPinVerified(false);
      setPinStep('enter');
      setPinInput('');
      setPinError('');
      setPinFailCount(0);
      return;
    }
    if (securityAnswer.trim().toLowerCase() === stored) {
      localStorage.removeItem('journal_pin');
      localStorage.removeItem('journal_security_answer');
      try { const u = auth.currentUser; if (u) setDoc(doc(db, 'user_data', u.uid), { journalPin: null, journalSecurityAnswer: null }, { merge: true }).catch(e => console.error('[Firestore] write:', e)); } catch {}
      setJournalLocked(false);
      setPinVerified(false);
      setPinStep('enter');
      setPinInput('');
      setPinError('');
      setPinFailCount(0);
      setSecurityAnswer('');
    } else {
      setPinError('安全問題答案不正確');
    }
  };

  // Remove PIN
  const removePin = () => {
    localStorage.removeItem('journal_pin');
    localStorage.removeItem('journal_security_answer');
    try { const u = auth.currentUser; if (u) setDoc(doc(db, 'user_data', u.uid), { journalPin: null, journalSecurityAnswer: null }, { merge: true }).catch(e => console.error('[Firestore] write:', e)); } catch {}
    setJournalLocked(false);
    setPinVerified(false);
  };

  // Entry card renderer (used in both day feed and search)
  const renderEntryCard = (entry: JournalEntry, i: number, showDate?: boolean) => {
    const time = new Date(entry.timestamp);
    return (
      <motion.div
        key={`${entry.date}-${i}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: i * 0.05 }}
        className="rounded-3xl overflow-hidden shadow-sm"
        style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
      >
        {/* Photos (Instagram-style) */}
        {entry.photos && entry.photos.length > 0 && (
          <div className="w-full">
            {entry.photos.length === 1 ? (
              <img src={entry.photos[0]} alt="" className="w-full object-cover" style={{ maxHeight: 400 }} />
            ) : (
              <div className="flex overflow-x-auto snap-x snap-mandatory" style={{ scrollbarWidth: 'none' }}>
                {entry.photos.map((photo, pi) => (
                  <img key={pi} src={photo} alt="" className="w-full flex-shrink-0 snap-center object-cover" style={{ maxHeight: 400 }} />
                ))}
              </div>
            )}
          </div>
        )}
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {showDate && <span className="text-xs font-medium" style={{ color: '#8C7B72' }}>{entry.date}</span>}
              <span className="text-xs" style={{ color: '#B5AFA8' }}>
                {time.getHours().toString().padStart(2, '0')}:{time.getMinutes().toString().padStart(2, '0')}
              </span>
            </div>
            <button onClick={() => handleDeleteEntry(entry)} className="text-xs px-2 py-1 rounded-full" style={{ color: '#B5AFA8' }}>
              刪除
            </button>
          </div>
          {entry.symbols && entry.symbols.length > 0 && (
            <div className="flex gap-1 mb-2">
              {entry.symbols.map((s, si) => <span key={si} className="text-lg">{s}</span>)}
            </div>
          )}
          <p className="text-sm leading-relaxed" style={{ color: '#3D3530' }}>{entry.text}</p>
        </div>
      </motion.div>
    );
  };

  // ============ PIN Lock Screen ============
  if (isLocked) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center px-6" style={{ backgroundColor: '#FFFEF9' }}>
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-xs text-center space-y-5"
        >
          <div className="text-5xl mb-2">🔒</div>
          <h2 className="text-lg font-bold" style={{ color: '#3D3530' }}>日記已鎖定</h2>

          {pinStep === 'enter' && (
            <>
              <p className="text-sm" style={{ color: '#8C7B72' }}>請輸入密碼來解鎖</p>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && verifyPin()}
                placeholder="輸入密碼"
                className="w-full text-center text-2xl tracking-[0.5em] py-3 rounded-2xl outline-none"
                style={{ backgroundColor: '#FAF8F5', color: '#3D3530', border: '1px solid #F0EDE8', letterSpacing: '0.5em' }}
                autoFocus
              />
              {pinError && <p className="text-xs" style={{ color: '#E57373' }}>{pinError}</p>}
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={verifyPin}
                className="w-full py-3 rounded-2xl font-medium text-sm text-white"
                style={{ backgroundColor: '#8FA886' }}
              >
                解鎖
              </motion.button>
              <button
                onClick={() => { setPinStep('forgot'); setPinError(''); }}
                className="text-xs underline"
                style={{ color: '#C9A96E' }}
              >
                忘記密碼？
              </button>
            </>
          )}

          {pinStep === 'forgot' && (
            <>
              <p className="text-sm" style={{ color: '#8C7B72' }}>
                {getSecurityAnswer() ? '請輸入你設定的安全問題答案：「你最喜歡的香味？」' : '確定要重置密碼嗎？這將移除日記鎖定。'}
              </p>
              {getSecurityAnswer() ? (
                <>
                  <input
                    type="text"
                    value={securityAnswer}
                    onChange={(e) => setSecurityAnswer(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleForgotPassword()}
                    placeholder="輸入答案"
                    className="w-full text-center py-3 rounded-2xl outline-none text-sm"
                    style={{ backgroundColor: '#FAF8F5', color: '#3D3530', border: '1px solid #F0EDE8' }}
                    autoFocus
                  />
                  {pinError && <p className="text-xs" style={{ color: '#E57373' }}>{pinError}</p>}
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={handleForgotPassword}
                    className="w-full py-3 rounded-2xl font-medium text-sm text-white"
                    style={{ backgroundColor: '#C9A96E' }}
                  >
                    驗證答案
                  </motion.button>
                </>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={handleForgotPassword}
                  className="w-full py-3 rounded-2xl font-medium text-sm text-white"
                  style={{ backgroundColor: '#E57373' }}
                >
                  確認重置密碼
                </motion.button>
              )}
              <button
                onClick={() => { setPinStep('enter'); setPinError(''); }}
                className="text-xs underline"
                style={{ color: '#8C7B72' }}
              >
                返回輸入密碼
              </button>
            </>
          )}
        </motion.div>
      </div>
    );
  }

  // ============ PIN Setup Modal ============
  const pinSetupModal = showPinSetup && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={() => setShowPinSetup(false)}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-sm rounded-3xl p-6 space-y-4"
        style={{ backgroundColor: '#FFFEF9' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-center" style={{ color: '#3D3530' }}>
          {hasPin() ? '🔒 密碼設定' : '🔓 設定日記密碼'}
        </h3>

        {hasPin() ? (
          <>
            <p className="text-sm text-center" style={{ color: '#8C7B72' }}>日記目前已設定密碼保護</p>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => { removePin(); setShowPinSetup(false); }}
              className="w-full py-2.5 rounded-2xl font-medium text-sm"
              style={{ backgroundColor: '#E5737320', color: '#E57373', border: '1px solid #E5737340' }}
            >
              移除密碼
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => { setPinStep('set'); setPinInput(''); setPinConfirm(''); setPinError(''); }}
              className="w-full py-2.5 rounded-2xl font-medium text-sm"
              style={{ backgroundColor: '#FAF8F5', color: '#8C7B72', border: '1px solid #F0EDE8' }}
            >
              重新設定密碼
            </motion.button>
            {pinStep === 'set' && (
              <div className="space-y-3 pt-2">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && setNewPin()}
                  placeholder="輸入新密碼（4-8位數字）"
                  className="w-full text-center text-xl tracking-[0.3em] py-3 rounded-2xl outline-none"
                  style={{ backgroundColor: '#FAF8F5', color: '#3D3530', border: '1px solid #F0EDE8' }}
                  autoFocus
                />
                {pinError && <p className="text-xs text-center" style={{ color: '#E57373' }}>{pinError}</p>}
                <motion.button whileTap={{ scale: 0.96 }} onClick={setNewPin} className="w-full py-2.5 rounded-2xl font-medium text-sm text-white" style={{ backgroundColor: '#8FA886' }}>
                  下一步
                </motion.button>
              </div>
            )}
            {pinStep === 'confirm' && (
              <div className="space-y-3 pt-2">
                <p className="text-xs text-center" style={{ color: '#8C7B72' }}>請再次輸入密碼確認</p>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && setNewPin()}
                  placeholder="再次輸入密碼"
                  className="w-full text-center text-xl tracking-[0.3em] py-3 rounded-2xl outline-none"
                  style={{ backgroundColor: '#FAF8F5', color: '#3D3530', border: '1px solid #F0EDE8' }}
                  autoFocus
                />
                {pinError && <p className="text-xs text-center" style={{ color: '#E57373' }}>{pinError}</p>}
                <motion.button whileTap={{ scale: 0.96 }} onClick={setNewPin} className="w-full py-2.5 rounded-2xl font-medium text-sm text-white" style={{ backgroundColor: '#8FA886' }}>
                  確認設定
                </motion.button>
              </div>
            )}
          </>
        ) : (
          <>
            {pinStep !== 'confirm' ? (
              <div className="space-y-3">
                <p className="text-sm text-center" style={{ color: '#8C7B72' }}>設定4-8位數字密碼保護你的日記</p>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && setNewPin()}
                  placeholder="輸入密碼（4-8位數字）"
                  className="w-full text-center text-xl tracking-[0.3em] py-3 rounded-2xl outline-none"
                  style={{ backgroundColor: '#FAF8F5', color: '#3D3530', border: '1px solid #F0EDE8' }}
                  autoFocus
                />
                <div>
                  <p className="text-xs mb-1" style={{ color: '#8C7B72' }}>安全問題：你最喜歡的香味？（忘記密碼用）</p>
                  <input
                    type="text"
                    value={securitySetup}
                    onChange={(e) => setSecuritySetup(e.target.value)}
                    placeholder="輸入答案（選填）"
                    className="w-full py-2.5 px-3 rounded-2xl outline-none text-sm"
                    style={{ backgroundColor: '#FAF8F5', color: '#3D3530', border: '1px solid #F0EDE8' }}
                  />
                </div>
                {pinError && <p className="text-xs text-center" style={{ color: '#E57373' }}>{pinError}</p>}
                <motion.button whileTap={{ scale: 0.96 }} onClick={() => { setPinStep('set'); setNewPin(); }} className="w-full py-2.5 rounded-2xl font-medium text-sm text-white" style={{ backgroundColor: '#8FA886' }}>
                  下一步
                </motion.button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-center" style={{ color: '#8C7B72' }}>請再次輸入密碼確認</p>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && setNewPin()}
                  placeholder="再次輸入密碼"
                  className="w-full text-center text-xl tracking-[0.3em] py-3 rounded-2xl outline-none"
                  style={{ backgroundColor: '#FAF8F5', color: '#3D3530', border: '1px solid #F0EDE8' }}
                  autoFocus
                />
                {pinError && <p className="text-xs text-center" style={{ color: '#E57373' }}>{pinError}</p>}
                <motion.button whileTap={{ scale: 0.96 }} onClick={setNewPin} className="w-full py-2.5 rounded-2xl font-medium text-sm text-white" style={{ backgroundColor: '#8FA886' }}>
                  確認設定
                </motion.button>
              </div>
            )}
          </>
        )}

        <button
          onClick={() => { setShowPinSetup(false); setPinStep('enter'); setPinInput(''); setPinError(''); }}
          className="w-full text-center text-xs py-2"
          style={{ color: '#8C7B72' }}
        >
          取消
        </button>
      </motion.div>
    </motion.div>
  );

  return (
    <div className="w-full h-full flex flex-col overflow-hidden" style={{ backgroundColor: '#FFFEF9' }}>
      {/* Hidden file inputs */}
      <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoSelect} />

      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3" style={{ borderBottom: '1px solid #F0EDE8' }}>
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold" style={{ color: '#3D3530' }}>📔 日記</h1>
          <div className="flex items-center gap-2">
            {/* Lock button */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                setPinStep(hasPin() ? 'enter' : 'set');
                setPinInput('');
                setPinError('');
                setShowPinSetup(true);
              }}
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: hasPin() ? '#8FA88620' : '#FAF8F5', border: '1px solid #F0EDE8' }}
            >
              <span className="text-sm">{hasPin() ? '🔒' : '🔓'}</span>
            </motion.button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-2xl" style={{ backgroundColor: '#FAF8F5', border: '1px solid #F0EDE8' }}>
          <span>🔍</span>
          <input
            type="text"
            placeholder="搜尋記錄..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: '#3D3530' }}
          />
        </div>

        {/* View Mode Toggle */}
        <div className="flex gap-2">
          {(['day', 'week', 'month'] as const).map(mode => (
            <motion.button
              key={mode}
              whileTap={{ scale: 0.95 }}
              onClick={() => setViewMode(mode)}
              className="px-3 py-1.5 text-xs font-medium rounded-full transition-all"
              style={{
                backgroundColor: viewMode === mode ? '#8FA886' : '#FAF8F5',
                color: viewMode === mode ? 'white' : '#8C7B72',
                border: viewMode === mode ? 'none' : '1px solid #F0EDE8',
              }}
            >
              {mode === 'day' ? '日' : mode === 'week' ? '週' : '月'}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Input Section */}
        {!searchQuery && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-4 rounded-3xl"
            style={{ backgroundColor: '#FAF8F5', border: '1px solid #F0EDE8' }}
          >
            <p className="text-xs font-medium mb-2" style={{ color: '#8C7B72' }}>今天想說些什麼...</p>
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="寫下你的想法、感受或日常點滴..."
              rows={3}
              className="w-full mb-2 p-3 rounded-2xl resize-none outline-none text-sm"
              style={{
                backgroundColor: '#FFFEF9',
                color: '#3D3530',
                border: '1px solid #F0EDE8',
              }}
            />

            {/* Toolbar: emoji + photo */}
            <div className="flex items-center gap-2 mb-3">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="px-3 py-1.5 text-xs rounded-full flex items-center gap-1"
                style={{
                  backgroundColor: showEmojiPicker ? '#8FA88620' : '#FFFEF9',
                  border: showEmojiPicker ? '1.5px solid #8FA886' : '1px solid #F0EDE8',
                  color: '#8C7B72',
                }}
              >
                <span className="text-base">😊</span> 表情
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => photoInputRef.current?.click()}
                className="px-3 py-1.5 text-xs rounded-full flex items-center gap-1"
                style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8', color: '#8C7B72' }}
              >
                <span className="text-base">🖼️</span> 相簿
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => cameraInputRef.current?.click()}
                className="px-3 py-1.5 text-xs rounded-full flex items-center gap-1"
                style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8', color: '#8C7B72' }}
              >
                <span className="text-base">📷</span> 拍照
              </motion.button>
            </div>

            {/* Emoji Picker (inline insert at cursor) */}
            <AnimatePresence>
              {showEmojiPicker && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-3 overflow-hidden"
                >
                  <div className="flex flex-wrap gap-1.5 p-2 rounded-2xl" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
                    {symbolPalette.map(symbol => (
                      <motion.button
                        key={symbol}
                        whileTap={{ scale: 0.85 }}
                        onClick={() => insertEmojiAtCursor(symbol)}
                        className="text-xl w-9 h-9 rounded-lg flex items-center justify-center transition-all active:bg-green-100"
                        style={{ backgroundColor: 'transparent' }}
                      >
                        {symbol}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Photo preview */}
            {photos.length > 0 && (
              <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                {photos.map((photo, i) => (
                  <div key={i} className="relative flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden" style={{ border: '1px solid #F0EDE8' }}>
                    <img src={photo} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removePhoto(i)}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full text-white text-xs flex items-center justify-center"
                      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Save Button */}
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={saveEntry}
              disabled={(!inputText.trim() && photos.length === 0) || saving}
              className="w-full py-2.5 rounded-2xl font-medium text-sm transition-all"
              style={{
                backgroundColor: (inputText.trim() || photos.length > 0) ? '#8FA886' : '#E8E3DC',
                color: (inputText.trim() || photos.length > 0) ? 'white' : '#B5AFA8',
              }}
            >
              {saving ? '保存中...' : showSuccess ? '✓ 已記錄' : '保存記錄'}
            </motion.button>
          </motion.div>
        )}

        {/* ===== DAY VIEW: Vertical scroll like Instagram ===== */}
        {viewMode === 'day' && !searchQuery && (
          <div className="space-y-6">
            {/* Date navigation */}
            <div className="flex items-center justify-between">
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigateDate(-1)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FAF8F5' }}>
                <span style={{ color: '#8C7B72' }}>←</span>
              </motion.button>
              <p className="font-medium text-sm" style={{ color: '#3D3530' }}>{currentDate}</p>
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigateDate(1)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FAF8F5' }}>
                <span style={{ color: '#8C7B72' }}>→</span>
              </motion.button>
            </div>

            {/* Vertical feed - all entries for this date and earlier */}
            {(() => {
              const recentDays = getRecentDayEntries();
              if (recentDays.length === 0) {
                return (
                  <div className="text-center py-12">
                    <p className="text-3xl mb-3">📝</p>
                    <p className="text-sm" style={{ color: '#B5AFA8' }}>還沒有記錄，開始寫下你的故事吧</p>
                  </div>
                );
              }
              return recentDays.map(day => (
                <div key={day.date} className="space-y-3">
                  {/* Day header */}
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1" style={{ backgroundColor: '#F0EDE8' }} />
                    <span className="text-xs font-medium px-3 py-1 rounded-full" style={{ backgroundColor: '#FAF8F5', color: '#8C7B72' }}>
                      {day.date === getToday() ? '今天' : day.date}
                    </span>
                    <div className="h-px flex-1" style={{ backgroundColor: '#F0EDE8' }} />
                  </div>
                  {/* Entries for this day */}
                  {day.entries.map((entry, i) => renderEntryCard(entry, i))}
                </div>
              ));
            })()}
          </div>
        )}

        {/* ===== WEEK VIEW ===== */}
        {viewMode === 'week' && !searchQuery && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigateDate(-1)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FAF8F5' }}>
                <span style={{ color: '#8C7B72' }}>←</span>
              </motion.button>
              <p className="font-medium text-sm" style={{ color: '#3D3530' }}>周視圖</p>
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigateDate(1)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FAF8F5' }}>
                <span style={{ color: '#8C7B72' }}>→</span>
              </motion.button>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }).map((_, i) => {
                const d = new Date(currentDate);
                d.setDate(d.getDate() + i);
                const dateKey = formatDate(d);
                const dayEntries = getEntriesForDate(dateKey);
                return (
                  <motion.div
                    key={i}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { setCurrentDate(dateKey); setViewMode('day'); }}
                    className="p-2 rounded-lg text-center cursor-pointer"
                    style={{ backgroundColor: dayEntries.length > 0 ? '#8FA88615' : '#FAF8F5' }}
                  >
                    <p className="text-xs font-medium mb-1" style={{ color: '#8C7B72' }}>
                      {d.getDate()}
                    </p>
                    {dayEntries.length > 0 ? (
                      <>
                        <p className="text-xs line-clamp-2" style={{ color: '#3D3530' }}>
                          {dayEntries[0].text.substring(0, 15)}...
                        </p>
                        <p className="text-[10px] mt-1" style={{ color: '#C9A96E' }}>
                          {dayEntries.length} 筆
                        </p>
                      </>
                    ) : (
                      <p className="text-[10px]" style={{ color: '#D4CCCB' }}>—</p>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===== MONTH VIEW ===== */}
        {viewMode === 'month' && !searchQuery && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigateDate(-1)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FAF8F5' }}>
                <span style={{ color: '#8C7B72' }}>←</span>
              </motion.button>
              <p className="font-medium text-sm" style={{ color: '#3D3530' }}>{currentDate.slice(0, 7)}</p>
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigateDate(1)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FAF8F5' }}>
                <span style={{ color: '#8C7B72' }}>→</span>
              </motion.button>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: getDaysInMonth(currentDate) }).map((_, i) => {
                const [year, month] = currentDate.split('-');
                const dateKey = `${year}-${month}-${(i + 1).toString().padStart(2, '0')}`;
                const dayEntries = getEntriesForDate(dateKey);
                const hasEntry = dayEntries.length > 0;
                return (
                  <motion.div
                    key={i}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { setCurrentDate(dateKey); setViewMode('day'); }}
                    className="p-2 rounded-lg text-center aspect-square flex items-center justify-center text-sm cursor-pointer"
                    style={{
                      backgroundColor: hasEntry ? '#8FA88620' : '#FAF8F5',
                      border: hasEntry ? '1.5px solid #8FA886' : '1px solid #F0EDE8',
                      color: '#3D3530',
                    }}
                  >
                    <div>
                      <p className="font-medium">{i + 1}</p>
                      {hasEntry && <p className="text-xs" style={{ color: '#8FA886' }}>●</p>}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Search Results */}
        {searchQuery && (
          <div className="space-y-3">
            <p className="text-xs font-medium" style={{ color: '#8C7B72' }}>
              搜尋結果 ({filteredEntries.length})
            </p>
            {filteredEntries.length === 0 ? (
              <p className="text-center text-sm" style={{ color: '#B5AFA8' }}>沒有符合的記錄</p>
            ) : (
              filteredEntries.map((entry, i) => renderEntryCard(entry, i, true))
            )}
          </div>
        )}
      </div>

      {/* PIN Setup Modal */}
      <AnimatePresence>{pinSetupModal}</AnimatePresence>
    </div>
  );
}

// --- 課後照顧 localStorage helpers ---
const STORAGE_KEYS = {
  plants: 'healing_aftercare_plants',
  fragrances: 'healing_aftercare_fragrances',
  works: 'healing_aftercare_works',
  courseTypes: 'healing_aftercare_course_types',
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function saveToStorage<T>(key: string, data: T) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* ignore */ }
  try { const u = auth.currentUser; if (u) setDoc(doc(db, 'user_data', u.uid), { [`aftercare_${key.replace('healing_aftercare_', '')}`]: JSON.parse(JSON.stringify(data)) }, { merge: true }).catch(e => console.error('[Firestore] write:', e)); } catch {}
}

// --- 澆水天數計算 ---
function getWateringStatus(lastWatered: string, intervalDays: number): { daysLeft: number; message: string; urgent: boolean } {
  const last = new Date(lastWatered);
  const now = new Date();
  const diffMs = now.getTime() - last.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const daysLeft = intervalDays - diffDays;
  if (daysLeft <= 0) return { daysLeft: 0, message: '今天可以幫它補充水分了', urgent: true };
  if (daysLeft === 1) return { daysLeft: 1, message: '明天就可以喝水了', urgent: false };
  return { daysLeft, message: `還有 ${daysLeft} 天後喝水`, urgent: false };
}

// --- 今日提醒生成 ---
function generateDailyReminders(plants: PlantRecord[], fragrances: FragranceRecord[]): { emoji: string; message: string; type: string }[] {
  const reminders: { emoji: string; message: string; type: string }[] = [];
  const today = new Date();
  const dayOfWeek = today.getDay();
  const dayOfMonth = today.getDate();

  // 植物澆水提醒
  plants.forEach(p => {
    const status = getWateringStatus(p.lastWatered, p.intervalDays);
    if (status.urgent) {
      reminders.push({ emoji: '💧', message: `${p.name || '你的多肉'}今天可以喝水了`, type: 'plant' });
    } else if (status.daysLeft === 1) {
      reminders.push({ emoji: '🌱', message: `${p.name || '你的多肉'}明天就該澆水了，記得準備`, type: 'plant' });
    }
  });

  // 補香提醒 (下午時段)
  if (today.getHours() >= 14 && today.getHours() <= 17) {
    reminders.push({ emoji: '🫧', message: '下午了，今天適合幫自己補點香氣', type: 'fragrance' });
  }

  // 水晶消磁提醒 (每週日)
  if (dayOfWeek === 0) {
    reminders.push({ emoji: '🔮', message: '週末了，可以幫水晶做個小小淨化', type: 'crystal' });
  }

  // 皮革保養提醒 (每月1號和15號)
  if (dayOfMonth === 1 || dayOfMonth === 15) {
    reminders.push({ emoji: '👜', message: '記得看看皮革作品，需要擦拭保養嗎？', type: 'leather' });
  }

  // 如果沒有任何提醒，給一個溫暖的默認提醒
  if (reminders.length === 0) {
    const defaultMessages = [
      { emoji: '🌿', message: '今天也別忘了看看你的作品們', type: 'general' },
      { emoji: '✨', message: '每一件作品都值得被好好對待', type: 'general' },
      { emoji: '🌸', message: '今天想先照顧哪一個作品？', type: 'general' },
    ];
    reminders.push(defaultMessages[dayOfMonth % defaultMessages.length]);
  }

  return reminders;
}

type LibraryView = 'home' | 'oil-detail' | 'crystal-detail' | 'article' | 'practice' | 'search'
  | 'care-fragrance' | 'care-plant' | 'care-crystal' | 'care-leather' | 'care-candle'
  | 'my-works' | 'add-plant' | 'add-fragrance' | 'knowledge-detail' | 'plant-detail'
  | 'plant-photo-diary' | 'plant-photo-timeline' | 'ask-teacher' | 'teacher-dashboard'
  | 'knowledge-articles-grid' | 'topic-subscription'
  | 'community-works-board' | 'community-work-detail' | 'post-work' | 'work-comments';

// ---- Firestore-backed interfaces for new features ----

interface PlantPhoto {
  id: string;
  url: string;
  thumbnailUrl?: string;
  note: string;
  createdAt: string; // ISO date
}

interface PlantDiary {
  id: string;
  userId: string;
  name: string;
  emoji: string;
  species?: string;
  createdAt: string;
  photos: PlantPhoto[];
}

interface TeacherQuestion {
  id: string;
  userId: string;
  userEmail: string;
  userName?: string;
  plantName: string;
  plantEmoji: string;
  photoUrl?: string;
  question: string;
  status: 'pending' | 'replied';
  reply?: string;
  repliedAt?: string;
  createdAt: string;
  // Work context (when asking from My Works)
  workCourseType?: string;
  workCourseName?: string;
  fromWork?: boolean;
}

interface KnowledgeArticle {
  id: string;
  title: string;
  coverUrl: string;
  coverThumbUrl?: string;
  topic: string; // e.g. 'plant', 'fragrance', 'crystal', 'lifestyle'
  summary: string;
  content: string;
  authorName: string;
  authorEmoji: string;
  likeCount: number;
  createdAt: string;
}

interface CommunityWork {
  id: string;
  userId: string;
  userName: string;
  userEmoji: string;
  imageUrl: string;
  thumbUrl?: string;
  caption: string;
  workType: string;
  tags: string[];
  likeCount: number;
  commentCount: number;
  featured?: boolean;
  createdAt: string;
}

interface WorkComment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
}

const TOPICS = [
  { key: 'plant', label: '植栽', emoji: '🌱', color: '#C5D9B2' },
  { key: 'fragrance', label: '調香', emoji: '🫧', color: '#E8D5B7' },
  { key: 'crystal', label: '水晶', emoji: '💎', color: '#D4C5E2' },
  { key: 'candle', label: '蠟燭', emoji: '🕯️', color: '#F0E0C8' },
  { key: 'leather', label: '皮革', emoji: '👜', color: '#D9C5B2' },
  { key: 'soap', label: '手工皂', emoji: '🧼', color: '#D4E8E0' },
  { key: 'floral', label: '花藝', emoji: '💐', color: '#F0D4E8' },
  { key: 'resin', label: '樹脂', emoji: '✨', color: '#C8E0F0' },
  { key: 'diffuser', label: '擴香石', emoji: '🪨', color: '#E0D8D0' },
  { key: 'painting', label: '畫畫', emoji: '🎨', color: '#E8D0D4' },
  { key: 'weaving', label: '編織', emoji: '🧶', color: '#E0C8B8' },
  { key: 'indigo', label: '藍染', emoji: '🫐', color: '#B8C8E0' },
  { key: 'lifestyle', label: '生活療癒', emoji: '🌿', color: '#B8D4C8' },
];

const WORK_TAGS = [
  '#第一次做', '#送給朋友', '#母親節禮物', '#情人節', '#生日禮物',
  '#下班療癒', '#週末手作', '#閨蜜同樂', '#親子手作', '#企業團建',
  '#超滿意', '#意外驚喜', '#配色控', '#香氣迷人', '#獨一無二',
];

// ===================== NEW: USER COURSES & WORKS WALL =====================

interface UserCourse {
  id: string;
  courseType: string; // matches TOPICS key
  courseName: string;
  completedAt: string; // ISO date
  workPhotos: string[]; // urls
  hasCareReminder: boolean;
  notes?: string;
}

interface MyWorkWall {
  id: string;
  courseType: string;
  courseName: string;
  photos: string[];
  completedAt: string;
  tags: string[];
  hasCareReminder: boolean;
  notes?: string;
}

interface CollectionItem {
  id: string;
  type: 'article' | 'card' | 'work';
  title: string;
  imageUrl?: string;
  topic?: string;
  savedAt: string;
}

interface CourseJourney {
  courseId: string;
  courseType: string;
  courseName: string;
  completedAt: string;
  day3Shown: boolean;
  day7Shown: boolean;
  day14Shown: boolean;
}

// Course-specific exclusive content
const COURSE_EXCLUSIVE_CONTENT: Record<string, { title: string; items: { emoji: string; label: string; desc: string }[] }> = {
  fragrance: {
    title: '調香學員專屬',
    items: [
      { emoji: '🫧', label: '補香指南', desc: '不同場合的補香時機與技巧' },
      { emoji: '🌸', label: '香氣使用建議', desc: '依季節與心情選擇香氣' },
      { emoji: '⚗️', label: '精油搭配表', desc: '前中後調的黃金比例' },
    ],
  },
  crystal: {
    title: '水晶學員專屬',
    items: [
      { emoji: '🔮', label: '消磁音頻', desc: '每週淨化你的水晶能量' },
      { emoji: '💎', label: '水晶搭配卡', desc: '不同情境的水晶組合推薦' },
      { emoji: '✨', label: '能量方向指引', desc: '本週適合的能量方向' },
    ],
  },
  plant: {
    title: '植栽學員專屬',
    items: [
      { emoji: '🌱', label: '照顧懶人包', desc: '澆水、光照、施肥一次搞懂' },
      { emoji: '🍃', label: '葉況判斷卡', desc: '看葉子狀態就知道植物需要什麼' },
      { emoji: '📸', label: '成長紀錄模板', desc: '記錄你的植物每週變化' },
    ],
  },
  leather: {
    title: '皮革學員專屬',
    items: [
      { emoji: '👜', label: '皮革保養指南', desc: '日常保養讓作品更持久' },
      { emoji: '🧴', label: '油脂選擇建議', desc: '不同皮質適合的保養品' },
      { emoji: '✂️', label: '進階技法分享', desc: '手縫與邊油處理技巧' },
    ],
  },
  candle: {
    title: '蠟燭學員專屬',
    items: [
      { emoji: '🕯️', label: '燃燒技巧', desc: '第一次點蠟燭的正確方式' },
      { emoji: '🫧', label: '香氣搭配', desc: '不同空間的香氣推薦' },
      { emoji: '💡', label: '蠟燭保存法', desc: '延長蠟燭壽命的小撇步' },
    ],
  },
  soap: {
    title: '手工皂學員專屬',
    items: [
      { emoji: '🧼', label: '熟成指南', desc: '皂化完成的判斷與等待' },
      { emoji: '🌿', label: '配方筆記', desc: '油品比例與添加物建議' },
      { emoji: '💧', label: '保存方法', desc: '手工皂的正確保存方式' },
    ],
  },
  floral: {
    title: '花藝學員專屬',
    items: [
      { emoji: '💐', label: '花材保鮮術', desc: '讓鮮花多開好幾天' },
      { emoji: '🌷', label: '季節花材表', desc: '每月推薦花材與搭配' },
      { emoji: '🎨', label: '配色靈感', desc: '花藝配色的黃金法則' },
    ],
  },
  resin: {
    title: '樹脂學員專屬',
    items: [
      { emoji: '✨', label: '樹脂比例表', desc: 'A/B膠的完美比例' },
      { emoji: '🎨', label: '調色技巧', desc: '透明與不透明的調色祕訣' },
      { emoji: '💎', label: '拋光指南', desc: '讓作品閃閃發亮的方法' },
    ],
  },
  diffuser: {
    title: '擴香石學員專屬',
    items: [
      { emoji: '🪨', label: '補香時機', desc: '擴香石何時需要補香' },
      { emoji: '🫧', label: '精油推薦', desc: '最適合擴香石的精油' },
      { emoji: '🏠', label: '擺放建議', desc: '不同空間的擺放位置' },
    ],
  },
  painting: {
    title: '畫畫學員專屬',
    items: [
      { emoji: '🎨', label: '調色參考', desc: '常用色彩的混色指南' },
      { emoji: '🖌️', label: '筆觸練習', desc: '基礎筆法每日練習' },
      { emoji: '🖼️', label: '構圖靈感', desc: '簡單構圖的黃金法則' },
    ],
  },
  weaving: {
    title: '編織學員專屬',
    items: [
      { emoji: '🧶', label: '針法圖解', desc: '基礎到進階針法速查' },
      { emoji: '📏', label: '尺寸換算', desc: '不同線材的尺寸對照' },
      { emoji: '🎨', label: '配色靈感', desc: '編織配色的美感指引' },
    ],
  },
  indigo: {
    title: '藍染學員專屬',
    items: [
      { emoji: '🫐', label: '染液照顧', desc: '藍染缸的日常維護' },
      { emoji: '👕', label: '洗滌須知', desc: '藍染作品的正確洗法' },
      { emoji: '🎨', label: '紋樣圖鑑', desc: '經典藍染紋樣與技法' },
    ],
  },
};

// Course journey messages (3/7/14 day)
const COURSE_JOURNEY_MESSAGES: Record<string, { day3: { emoji: string; title: string; msg: string }; day7: { emoji: string; title: string; msg: string }; day14: { emoji: string; title: string; msg: string } }> = {
  plant: {
    day3: { emoji: '🌱', title: '你的植物適應得還好嗎？', msg: '剛帶回家的前幾天，植物需要適應新環境。不用太擔心，給它安靜的角落就好。' },
    day7: { emoji: '💧', title: '今天可以幫植物喝水了', msg: '觀察一下土壤，如果表面乾了就可以澆水。記得不要澆太多喔！' },
    day14: { emoji: '📸', title: '來記錄第一張成長照片吧', msg: '兩週了！你的植物有長新葉嗎？拍張照片記錄這個時刻吧。' },
  },
  crystal: {
    day3: { emoji: '💎', title: '來看看你的水晶能量小卡', msg: '這幾天有沒有感覺到水晶的能量？試著在冥想時握著它。' },
    day7: { emoji: '🔮', title: '這週適合做一次簡單淨化', msg: '用流動清水輕輕沖洗，或放在月光下一晚，讓水晶恢復能量。' },
    day14: { emoji: '✨', title: '你最常戴的是哪一條？', msg: '兩週的相處，你和水晶有了默契了嗎？分享你的感受吧。' },
  },
  fragrance: {
    day3: { emoji: '🫧', title: '這幾天最喜歡在哪個時刻噴它？', msg: '每個人和香氣的相處方式不同，找到你最喜歡的使用時刻。' },
    day7: { emoji: '💡', title: '來看看補香技巧', msg: '香水的前中後調會隨時間變化，了解補香時機讓香氣更持久。' },
    day14: { emoji: '🌸', title: '你偏好的香氣，也許會喜歡這些', msg: '根據你選的香調，我們推薦幾款你可能會喜歡的精油。' },
  },
  candle: {
    day3: { emoji: '🕯️', title: '第一次點蠟燭了嗎？', msg: '記得第一次燃燒要讓整個表面都融化，這樣才不會產生隧道效應喔。' },
    day7: { emoji: '🌙', title: '蠟燭與夜晚最配', msg: '試著在睡前一小時點燃，搭配輕音樂，享受屬於自己的療癒時光。' },
    day14: { emoji: '📝', title: '分享你的蠟燭體驗', msg: '兩週了，你最喜歡在什麼場景使用呢？來社群分享吧。' },
  },
  leather: {
    day3: { emoji: '👜', title: '皮革作品需要呼吸', msg: '新作品放在通風處讓它自然乾燥，避免直射陽光。' },
    day7: { emoji: '🧴', title: '第一次保養的好時機', msg: '用專用保養油輕輕擦拭，讓皮革保持柔軟光澤。' },
    day14: { emoji: '📸', title: '記錄皮革的變化', msg: '皮革會隨時間產生獨特的光澤，拍張照片記錄這個過程吧。' },
  },
  soap: {
    day3: { emoji: '🧼', title: '手工皂還在熟成中', msg: '耐心等待是值得的，皂化需要時間讓成分完全反應。' },
    day7: { emoji: '💧', title: '可以開始試用了', msg: '一週後的手工皂已經可以使用，先從手部清洗開始試試看。' },
    day14: { emoji: '🌿', title: '分享你的使用心得', msg: '用了兩週，皮膚有什麼變化嗎？來分享你的真實感受。' },
  },
  floral: {
    day3: { emoji: '💐', title: '花材還新鮮嗎？', msg: '記得每天換水、斜切花莖，讓花朵保持最佳狀態。' },
    day7: { emoji: '🌷', title: '乾燥花的好時機', msg: '如果花朵開始凋謝，可以倒掛做成乾燥花，延續美好。' },
    day14: { emoji: '🎨', title: '下一次花藝靈感', msg: '試試用不同的花器和花材，創造屬於你的風格。' },
  },
  resin: {
    day3: { emoji: '✨', title: '樹脂完全硬化了嗎？', msg: '確認作品已經完全硬化，如果還有點軟，再等待一天。' },
    day7: { emoji: '💎', title: '拋光讓作品更閃亮', msg: '用細砂紙和拋光膏，讓你的樹脂作品散發光澤。' },
    day14: { emoji: '📸', title: '拍一張美美的照片', msg: '找個好光線，記錄你的樹脂作品最美的樣子。' },
  },
  diffuser: {
    day3: { emoji: '🪨', title: '擴香石的香氣如何？', msg: '剛做好的擴香石香氣最濃郁，享受這個美好時刻。' },
    day7: { emoji: '🫧', title: '可以補香了', msg: '滴2-3滴喜歡的精油，讓擴香石重新散發香氣。' },
    day14: { emoji: '🏠', title: '找到最佳擺放位置了嗎', msg: '試試放在不同空間，感受擴香石帶來的氛圍變化。' },
  },
  painting: {
    day3: { emoji: '🎨', title: '畫作乾了嗎？', msg: '讓作品自然風乾，避免直接日曬。' },
    day7: { emoji: '🖌️', title: '試試每天練習10分鐘', msg: '簡單的線條練習就好，持續比完美更重要。' },
    day14: { emoji: '🖼️', title: '你的畫可以裱框了', msg: '選一個喜歡的框，讓作品變成家中的風景。' },
  },
  weaving: {
    day3: { emoji: '🧶', title: '編織的節奏找到了嗎？', msg: '不用急，慢慢找到屬於你的編織節奏。' },
    day7: { emoji: '📏', title: '量一下進度', msg: '看看已經完成了多少，給自己一個小獎勵。' },
    day14: { emoji: '🎀', title: '作品快完成了嗎？', msg: '最後的收尾很重要，耐心完成每一針。' },
  },
  indigo: {
    day3: { emoji: '🫐', title: '藍染作品洗過了嗎？', msg: '第一次清洗用冷水手洗，輕柔對待你的作品。' },
    day7: { emoji: '👕', title: '藍染會越洗越美', msg: '隨著清洗次數增加，藍染會呈現獨特的漸層美。' },
    day14: { emoji: '📸', title: '記錄藍染的變化', msg: '兩週後的顏色和剛做好時不同，拍照對比看看。' },
  },
};

// Next step recommendations based on courses taken
const NEXT_STEP_RECOMMENDATIONS: Record<string, { emoji: string; title: string; desc: string; link: string }[]> = {
  fragrance: [
    { emoji: '🌸', title: '芳療客製服務', desc: '讓專業芳療師為你調配專屬香氣', link: 'https://xiabenhow.com' },
    { emoji: '⚗️', title: '進階調香課', desc: '學習更複雜的香調搭配技巧', link: 'https://xiabenhow.com' },
  ],
  crystal: [
    { emoji: '💎', title: '高階晶礦選購', desc: '挑選適合你能量的進階礦石', link: 'https://xiabenhow.com' },
    { emoji: '📿', title: '客製手鍊服務', desc: '依你的需求打造專屬水晶手鍊', link: 'https://xiabenhow.com' },
  ],
  plant: [
    { emoji: '🌿', title: '進階植栽課', desc: '學習組盆、換盆與繁殖技巧', link: 'https://xiabenhow.com' },
    { emoji: '🪴', title: '特殊盆器選購', desc: '為你的植物找一個美麗的家', link: 'https://xiabenhow.com' },
  ],
  leather: [
    { emoji: '👜', title: '進階皮件課', desc: '挑戰更複雜的皮件作品', link: 'https://xiabenhow.com' },
    { emoji: '🧵', title: '皮革材料包', desc: '在家也能繼續練習的材料組', link: 'https://xiabenhow.com' },
  ],
  candle: [
    { emoji: '🕯️', title: '進階蠟燭課', desc: '學習浮雕蠟燭與特殊技法', link: 'https://xiabenhow.com' },
    { emoji: '🫧', title: '香氛精油選購', desc: '為你的蠟燭找到完美的香氣', link: 'https://xiabenhow.com' },
  ],
  soap: [
    { emoji: '🧼', title: '進階皂藝課', desc: '學習渲染皂與造型皂技法', link: 'https://xiabenhow.com' },
    { emoji: '🌿', title: '天然添加物', desc: '探索更多天然入皂材料', link: 'https://xiabenhow.com' },
  ],
};

// Smart reminder data
const SMART_REMINDERS: Record<string, string[]> = {
  crystal: ['你的水晶這週可以消磁了 🔮', '今天適合用紫水晶冥想 💜', '月圓之夜適合淨化水晶 🌕'],
  fragrance: ['你的香氣該補香了 🫧', '今天的心情適合柑橘調 🍊', '睡前擴香薰衣草幫助入眠 💤'],
  plant: ['該幫植物澆水了 💧', '今天適合幫植物曬曬太陽 ☀️', '觀察一下葉子的狀態 🌿'],
  candle: ['蠟燭記得修剪燭芯再點 ✂️', '今晚來點一支療癒蠟燭吧 🕯️'],
  leather: ['皮革作品可以保養一下了 🧴', '定期保養讓皮革更有光澤 ✨'],
  diffuser: ['擴香石可以補香了 🪨', '換一個精油試試不同氛圍 🫧'],
};

// ===================== HEALING PERSONALITY ENGINE =====================

type HealingPersonalityType = 'scent' | 'crystal' | 'lifestyle' | 'gift';

interface HealingPersonality {
  type: HealingPersonalityType;
  label: string;
  emoji: string;
  subtitle: string;
  color: string;
  gradient: string;
  traits: string[];
  description: string;
}

interface PersonalityScore {
  scent: number;
  crystal: number;
  lifestyle: number;
  gift: number;
}

interface PersonalityProfile {
  scores: PersonalityScore;
  primary: HealingPersonalityType;
  secondary: HealingPersonalityType;
  quizDone: boolean;
  lastUpdated: string;
}

const HEALING_PERSONALITIES: Record<HealingPersonalityType, HealingPersonality> = {
  scent: {
    type: 'scent',
    label: '香氣療癒型',
    emoji: '🫧',
    subtitle: '用氣味安定身心',
    color: '#E8D5B7',
    gradient: 'linear-gradient(135deg, #FFF8E7, #F0E4D0)',
    traits: ['木質', '安定', '睡前', '低刺激'],
    description: '你喜歡透過氣味來放鬆自己。木質調、花香調是你的安全感來源。睡前擴香、隨身香氛是你的日常儀式。',
  },
  crystal: {
    type: 'crystal',
    label: '水晶能量型',
    emoji: '💎',
    subtitle: '用能量守護內在',
    color: '#D4C5E2',
    gradient: 'linear-gradient(135deg, #F0E8F8, #E0D4F0)',
    traits: ['人際', '保護', '穩定', '深色系'],
    description: '你相信能量的力量。水晶手鍊是你的護身符，消磁儀式是你的日常。你喜歡深色系的礦石，在不安時會握住它。',
  },
  lifestyle: {
    type: 'lifestyle',
    label: '生活療癒型',
    emoji: '🌿',
    subtitle: '用手作妝點日常',
    color: '#C5D9B2',
    gradient: 'linear-gradient(135deg, #F0F8ED, #E0F0D8)',
    traits: ['植物', '居家', '儀式感', '拍照記錄'],
    description: '你用手作來妝點生活。種一盆多肉、插一束花、畫一張畫，每個小動作都是你的療癒儀式。你喜歡拍照記錄每個美好瞬間。',
  },
  gift: {
    type: 'gift',
    label: '療癒送禮型',
    emoji: '🎁',
    subtitle: '用心意連結關係',
    color: '#F0D4E8',
    gradient: 'linear-gradient(135deg, #FFF0F5, #F8E0F0)',
    traits: ['送禮', '情感連結', '陪伴', '節日'],
    description: '你最擅長用禮物表達心意。每到節日你就開始構想，什麼手作最能代表你的心。你相信，親手做的東西最有溫度。',
  },
};

// Personality-specific product recommendations
const PERSONALITY_RECOMMENDATIONS: Record<HealingPersonalityType, { category: string; items: { emoji: string; name: string; desc: string; price?: string; link: string }[] }[]> = {
  scent: [
    {
      category: '推薦商品',
      items: [
        { emoji: '🌙', name: '睡前安眠擴香組', desc: '薰衣草+雪松+岩蘭草', price: 'NT$680', link: 'https://xiabenhow.com' },
        { emoji: '🪵', name: '木質調隨身香氛', desc: '檀香+雪松+廣藿香', price: 'NT$520', link: 'https://xiabenhow.com' },
        { emoji: '🫧', name: '居家擴香石套組', desc: '含精油3瓶+擴香石2入', price: 'NT$880', link: 'https://xiabenhow.com' },
      ],
    },
    {
      category: '推薦課程',
      items: [
        { emoji: '⚗️', name: '客製芳療服務', desc: '專業芳療師為你調配專屬香氣', link: 'https://xiabenhow.com' },
        { emoji: '🕯️', name: '睡前蠟燭工作坊', desc: '調製屬於你的安眠蠟燭', link: 'https://xiabenhow.com' },
        { emoji: '🌸', name: '放鬆主題調香課', desc: '學習用香氣管理壓力', link: 'https://xiabenhow.com' },
      ],
    },
  ],
  crystal: [
    {
      category: '推薦商品',
      items: [
        { emoji: '📿', name: '客製水晶手鍊', desc: '依你的需求搭配專屬能量石', price: 'NT$1,280', link: 'https://xiabenhow.com' },
        { emoji: '💎', name: '高階晶礦精選', desc: '紫水晶簇/黑碧璽/拉長石', price: 'NT$1,680起', link: 'https://xiabenhow.com' },
        { emoji: '🔮', name: '消磁淨化套組', desc: '白水晶碎石+鼠尾草+月光碟', price: 'NT$580', link: 'https://xiabenhow.com' },
      ],
    },
    {
      category: '推薦課程',
      items: [
        { emoji: '💎', name: '水晶客製搭配', desc: '一對一諮詢打造專屬手鍊', link: 'https://xiabenhow.com' },
        { emoji: '🔮', name: '進階晶礦課', desc: '認識更多水晶的能量特性', link: 'https://xiabenhow.com' },
        { emoji: '✨', name: '消磁內容會員包', desc: '每月淨化音頻+能量小卡', link: 'https://xiabenhow.com' },
      ],
    },
  ],
  lifestyle: [
    {
      category: '推薦商品',
      items: [
        { emoji: '🪴', name: '療癒植栽組盆', desc: '含陶盆+多肉3入+介質', price: 'NT$580', link: 'https://xiabenhow.com' },
        { emoji: '🕯️', name: '居家擴香蠟燭', desc: '大豆蠟+天然精油', price: 'NT$480', link: 'https://xiabenhow.com' },
        { emoji: '🎨', name: '生活風格禮盒', desc: '擴香+乾燥花+手寫卡片', price: 'NT$980', link: 'https://xiabenhow.com' },
      ],
    },
    {
      category: '推薦課程',
      items: [
        { emoji: '🌱', name: '植栽照顧課', desc: '從組盆到日常照顧完整教學', link: 'https://xiabenhow.com' },
        { emoji: '💐', name: '花藝體驗課', desc: '季節花材+桌花設計', link: 'https://xiabenhow.com' },
        { emoji: '🎨', name: '療癒畫畫課', desc: '不需要基礎也能畫出美麗作品', link: 'https://xiabenhow.com' },
      ],
    },
  ],
  gift: [
    {
      category: '推薦商品',
      items: [
        { emoji: '🎁', name: '客製禮盒服務', desc: '依對象與場合打造專屬禮物', price: 'NT$1,280起', link: 'https://xiabenhow.com' },
        { emoji: '💝', name: '成對手作組', desc: '雙人蠟燭/手鍊/香氛組', price: 'NT$1,580', link: 'https://xiabenhow.com' },
        { emoji: '💌', name: '節日限定禮盒', desc: '情人節/母親節/生日特別款', price: 'NT$880起', link: 'https://xiabenhow.com' },
      ],
    },
    {
      category: '推薦課程',
      items: [
        { emoji: '👫', name: '雙人體驗課', desc: '和重要的人一起手作', link: 'https://xiabenhow.com' },
        { emoji: '🎨', name: '送禮型手作課', desc: '做一份最有溫度的禮物', link: 'https://xiabenhow.com' },
        { emoji: '✨', name: '客製香氛禮物', desc: '為對方調一瓶專屬香氣', link: 'https://xiabenhow.com' },
      ],
    },
  ],
};

// Quiz questions for initial personality assessment
const PERSONALITY_QUIZ = [
  {
    question: '最近有點累的時候，你最想替自己做什麼？',
    options: [
      { label: '點個香，先讓空間安靜下來', scores: { scent: 5, crystal: 1, lifestyle: 2, gift: 0 } },
      { label: '摸摸常戴的飾品，想讓心穩一點', scores: { scent: 1, crystal: 5, lifestyle: 1, gift: 0 } },
      { label: '整理房間、澆水，讓生活回到舒服的樣子', scores: { scent: 1, crystal: 0, lifestyle: 5, gift: 1 } },
      { label: '挑個小東西送人，也讓心裡暖一點', scores: { scent: 0, crystal: 1, lifestyle: 1, gift: 5 } },
    ],
  },
  {
    question: '你最容易在哪一區停下來多看幾眼？',
    options: [
      { label: '香氛、精油、擴香和蠟燭', scores: { scent: 5, crystal: 0, lifestyle: 1, gift: 1 } },
      { label: '手鍊、水晶、礦石小物', scores: { scent: 0, crystal: 5, lifestyle: 1, gift: 1 } },
      { label: '植物、花器、家裡的小佈置', scores: { scent: 1, crystal: 0, lifestyle: 5, gift: 1 } },
      { label: '卡片、禮盒、送禮靈感', scores: { scent: 1, crystal: 1, lifestyle: 1, gift: 5 } },
    ],
  },
  {
    question: '理想的週末午後，比較像哪一種？',
    options: [
      { label: '房間裡有香氣，安安靜靜待著', scores: { scent: 5, crystal: 1, lifestyle: 2, gift: 0 } },
      { label: '挑一條今天想戴的手鍊，讓心情有依靠', scores: { scent: 1, crystal: 5, lifestyle: 0, gift: 1 } },
      { label: '整理桌面、照顧植物，把日子過順一點', scores: { scent: 1, crystal: 0, lifestyle: 5, gift: 1 } },
      { label: '做點什麼送給重要的人', scores: { scent: 0, crystal: 1, lifestyle: 1, gift: 5 } },
    ],
  },
  {
    question: '你想把哪一種感覺，留在生活裡久一點？',
    options: [
      { label: '安靜、放鬆、慢慢呼吸', scores: { scent: 5, crystal: 1, lifestyle: 2, gift: 0 } },
      { label: '安定、被守護、心裡踏實', scores: { scent: 1, crystal: 5, lifestyle: 1, gift: 0 } },
      { label: '舒服、好看、有自己的節奏', scores: { scent: 1, crystal: 0, lifestyle: 5, gift: 1 } },
      { label: '溫暖、心意、有被放在心上', scores: { scent: 0, crystal: 1, lifestyle: 1, gift: 5 } },
    ],
  },
];

// Behavior-based scoring weights
const BEHAVIOR_WEIGHTS: Record<string, Partial<PersonalityScore>> = {
  // Course types
  'course:fragrance': { scent: 10, lifestyle: 2 },
  'course:candle': { scent: 8, lifestyle: 3 },
  'course:diffuser': { scent: 8, lifestyle: 3 },
  'course:crystal': { crystal: 10, gift: 2 },
  'course:plant': { lifestyle: 10, gift: 2 },
  'course:floral': { lifestyle: 8, gift: 4 },
  'course:painting': { lifestyle: 8 },
  'course:weaving': { lifestyle: 7, gift: 3 },
  'course:leather': { lifestyle: 6, gift: 4 },
  'course:soap': { lifestyle: 7, scent: 3 },
  'course:resin': { lifestyle: 6, gift: 4 },
  'course:indigo': { lifestyle: 8 },
  // Subscription topics
  'sub:fragrance': { scent: 3 },
  'sub:crystal': { crystal: 3 },
  'sub:plant': { lifestyle: 3 },
  'sub:floral': { lifestyle: 2, gift: 1 },
  'sub:candle': { scent: 2, lifestyle: 1 },
  // Tags used
  'tag:送給朋友': { gift: 5 },
  'tag:情人節': { gift: 5 },
  'tag:生日禮物': { gift: 5 },
  'tag:母親節禮物': { gift: 5 },
  'tag:閨蜜同樂': { gift: 3 },
  'tag:親子手作': { gift: 3, lifestyle: 2 },
  'tag:週末手作': { lifestyle: 3 },
  'tag:下班療癒': { scent: 2, lifestyle: 2 },
  'tag:居家佈置': { lifestyle: 4 },
  // Emotions
  'emotion:anxious': { scent: 3, crystal: 2 },
  'emotion:tired': { scent: 3 },
  'emotion:calm': { lifestyle: 2 },
  'emotion:low': { crystal: 2, scent: 2 },
  'emotion:warm': { gift: 2, lifestyle: 2 },
  'emotion:energized': { lifestyle: 2, gift: 1 },
};

function getPersonalityFromScores(scores: PersonalityScore): { primary: HealingPersonalityType; secondary: HealingPersonalityType } {
  const entries = Object.entries(scores) as [HealingPersonalityType, number][];
  entries.sort((a, b) => b[1] - a[1]);
  return { primary: entries[0][0], secondary: entries[1][0] };
}

function loadPersonalityProfile(): PersonalityProfile | null {
  try {
    const raw = localStorage.getItem('healing_personality');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function savePersonalityProfile(profile: PersonalityProfile) {
  localStorage.setItem('healing_personality', JSON.stringify(profile));
  try { const u = auth.currentUser; if (u) setDoc(doc(db, 'user_data', u.uid), { personalityProfile: JSON.parse(JSON.stringify(profile)) }, { merge: true }).catch(e => console.error('[Firestore] write:', e)); } catch {}
}

// ===================== PERSONALITY QUIZ COMPONENT =====================

function PersonalityQuiz({ onComplete }: { onComplete: (profile: PersonalityProfile) => void }) {
  const [step, setStep] = useState(0);
  const [scores, setScores] = useState<PersonalityScore>({ scent: 0, crystal: 0, lifestyle: 0, gift: 0 });
  const [showResult, setShowResult] = useState(false);
  const [resultProfile, setResultProfile] = useState<PersonalityProfile | null>(null);

  const handleAnswer = (optionScores: Partial<PersonalityScore>) => {
    const newScores = { ...scores };
    (Object.keys(optionScores) as HealingPersonalityType[]).forEach(k => {
      newScores[k] += optionScores[k] || 0;
    });
    setScores(newScores);

    if (step < PERSONALITY_QUIZ.length - 1) {
      setStep(step + 1);
    } else {
      // Done
      const { primary, secondary } = getPersonalityFromScores(newScores);
      const profile: PersonalityProfile = { scores: newScores, primary, secondary, quizDone: true, lastUpdated: new Date().toISOString() };
      savePersonalityProfile(profile);
      setResultProfile(profile);
      setShowResult(true);
    }
  };

  if (showResult && resultProfile) {
    const p = HEALING_PERSONALITIES[resultProfile.primary];
    const s = HEALING_PERSONALITIES[resultProfile.secondary];
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="space-y-5">
        <div className="rounded-3xl p-6 text-center shadow-sm" style={{ background: p.gradient }}>
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3, type: 'spring' }}>
            <span className="text-5xl">{p.emoji}</span>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <p className="text-xl font-bold mt-3" style={{ color: '#3D3530' }}>{p.label}</p>
            <p className="text-sm mt-1" style={{ color: '#5C534C' }}>{p.subtitle}</p>
          </motion.div>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="text-sm mt-3 leading-relaxed" style={{ color: '#5C534C' }}>
            {p.description}
          </motion.p>
          <div className="flex justify-center gap-2 mt-3">
            {p.traits.map(t => (
              <span key={t} className="text-xs px-2.5 py-1 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.6)', color: '#3D3530' }}>{t}</span>
            ))}
          </div>
        </div>

        <div className="rounded-2xl p-4" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-xs" style={{ color: '#8C7B72' }}>副人格</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-lg">{s.emoji}</span>
            <p className="text-sm font-medium" style={{ color: '#3D3530' }}>{s.label}</p>
            <p className="text-xs" style={{ color: '#8C7B72' }}>— {s.subtitle}</p>
          </div>
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onComplete(resultProfile)}
          className="w-full py-3.5 rounded-2xl text-white font-medium text-sm"
          style={{ backgroundColor: '#8FA886' }}
        >
          開始我的療癒旅程
        </motion.button>
      </motion.div>
    );
  }

  const q = PERSONALITY_QUIZ[step];
  return (
    <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
      <div className="text-center">
        <div className="flex justify-center gap-1.5 mb-4">
          {PERSONALITY_QUIZ.map((_, i) => (
            <div key={i} className="w-8 h-1 rounded-full" style={{ backgroundColor: i <= step ? '#8FA886' : '#E0DCD8' }} />
          ))}
        </div>
        <p className="text-xs mb-1" style={{ color: '#8C7B72' }}>問題 {step + 1} / {PERSONALITY_QUIZ.length}</p>
        <p className="text-lg font-bold" style={{ color: '#3D3530' }}>{q.question}</p>
      </div>

      <div className="space-y-3">
        {q.options.map((opt, i) => (
          <motion.button
            key={i}
            whileTap={{ scale: 0.97 }}
            onClick={() => handleAnswer(opt.scores)}
            className="w-full text-left p-4 rounded-2xl shadow-sm"
            style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <p className="text-sm font-medium" style={{ color: '#3D3530' }}>{opt.label}</p>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

// ===================== PERSONALITY BADGE COMPONENT =====================

function PersonalityBadge({ profile, size }: { profile: PersonalityProfile | null; size?: 'sm' | 'md' }) {
  if (!profile) return null;
  const p = HEALING_PERSONALITIES[profile.primary];
  const isSmall = size === 'sm';
  return (
    <div className={`inline-flex items-center gap-1 ${isSmall ? 'px-2 py-0.5' : 'px-2.5 py-1'} rounded-full`} style={{ backgroundColor: p.color + '40' }}>
      <span className={isSmall ? 'text-xs' : 'text-sm'}>{p.emoji}</span>
      <span className={`${isSmall ? 'text-[10px]' : 'text-xs'} font-medium`} style={{ color: '#3D3530' }}>{p.label}</span>
    </div>
  );
}

// ===================== PERSONALITY RECOMMENDATION BLOCK =====================

function PersonalityRecommendations({ profile }: { profile: PersonalityProfile }) {
  const p = HEALING_PERSONALITIES[profile.primary];
  const recs = PERSONALITY_RECOMMENDATIONS[profile.primary];
  const secondaryRecs = PERSONALITY_RECOMMENDATIONS[profile.secondary];

  return (
    <div className="space-y-4">
      {/* Primary personality recommendations */}
      {recs.map((cat, ci) => (
        <div key={ci} className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">{p.emoji}</span>
            <p className="text-sm font-bold" style={{ color: '#3D3530' }}>
              {cat.category}
              <span className="text-xs font-normal ml-1" style={{ color: '#8C7B72' }}>為{p.label}推薦</span>
            </p>
          </div>
          <div className="space-y-2">
            {cat.items.map((item, i) => (
              <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-2xl" style={{ backgroundColor: '#FAF8F5' }}>
                <span className="text-xl">{item.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: '#3D3530' }}>{item.name}</p>
                  <p className="text-xs" style={{ color: '#8C7B72' }}>{item.desc}</p>
                </div>
                {item.price && <span className="text-xs font-bold flex-shrink-0" style={{ color: '#C9A96E' }}>{item.price}</span>}
              </a>
            ))}
          </div>
        </div>
      ))}

      {/* Secondary hint */}
      {secondaryRecs.length > 0 && (
        <div className="rounded-2xl p-4" style={{ backgroundColor: '#FAF8F5' }}>
          <p className="text-xs mb-2" style={{ color: '#8C7B72' }}>你的副人格「{HEALING_PERSONALITIES[profile.secondary].emoji} {HEALING_PERSONALITIES[profile.secondary].label}」也推薦你</p>
          <div className="space-y-1.5">
            {secondaryRecs[0].items.slice(0, 2).map((item, i) => (
              <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm" style={{ color: '#3D3530' }}>
                <span>{item.emoji}</span>
                <span className="font-medium">{item.name}</span>
                {item.price && <span className="text-xs" style={{ color: '#C9A96E' }}>{item.price}</span>}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HealingLibraryPage({ userEmail, onNavigate }: { userEmail: string | null; onNavigate?: (p: PageType) => void }) {
  const [view, setView] = useState<LibraryView>('home');
  const [selectedOil, setSelectedOil] = useState<OilLibraryItem | null>(null);
  const [selectedCrystal, setSelectedCrystal] = useState<CrystalItem | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<LibraryArticle | null>(null);
  const [selectedPractice, setSelectedPractice] = useState<LibraryPractice | null>(null);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'oil' | 'crystal'>('all');

  // 課後照顧 State
  const [plants, setPlants] = useState<PlantRecord[]>(() => loadFromStorage(STORAGE_KEYS.plants, []));
  const [fragrances, setFragrances] = useState<FragranceRecord[]>(() => loadFromStorage(STORAGE_KEYS.fragrances, []));
  const [works, setWorks] = useState<MyWork[]>(() => loadFromStorage(STORAGE_KEYS.works, []));
  const [courseTypes, setCourseTypes] = useState<CourseType[]>(() => loadFromStorage(STORAGE_KEYS.courseTypes, []));
  const [courseRecords, setCourseRecords] = useState<Array<{ orderId: number; orderDate: string; productName: string; courseType: string | null }>>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [courseSynced, setCourseSynced] = useState(false);

  // 自動從 WooCommerce 訂單抓取課程紀錄
  useEffect(() => {
    if (!userEmail || courseSynced) return;

    const fetchCourseHistory = async () => {
      setLoadingCourses(true);
      try {
        const resp = await fetch(`${API_BASE}/api/wc/my-courses?email=${encodeURIComponent(userEmail)}`);
        if (!resp.ok) throw new Error('fetch failed');
        const data = await resp.json();

        if (data.courseTypes && data.courseTypes.length > 0) {
          // 合併已有的 courseTypes（保留手動標記的）
          setCourseTypes(prev => {
            const merged = new Set([...prev, ...data.courseTypes]);
            return Array.from(merged) as CourseType[];
          });
        }

        if (data.courseRecords && data.courseRecords.length > 0) {
          setCourseRecords(data.courseRecords);

          // 自動產生 works 紀錄（去重，避免重複新增）
          const existingWorkIds = new Set(works.map(w => w.id));
          const newWorks: MyWork[] = [];
          for (const rec of data.courseRecords) {
            const workId = `wc-order-${rec.orderId}-${rec.productId}`;
            if (!existingWorkIds.has(workId)) {
              const typeMap: Record<string, MyWork['type']> = {
                fragrance: 'fragrance', plant: 'plant', crystal: 'crystal',
                leather: 'leather', candle: 'candle',
              };
              const emojiMap: Record<string, string> = {
                fragrance: '🫧', plant: '🌱', crystal: '💎',
                leather: '👜', candle: '🕯️',
              };
              newWorks.push({
                id: workId,
                type: typeMap[rec.courseType] || 'other',
                name: rec.productName,
                date: rec.orderDate?.slice(0, 10) || new Date().toISOString().slice(0, 10),
                emoji: emojiMap[rec.courseType] || '✨',
                memo: `訂單 #${rec.orderId}`,
              });
            }
          }
          if (newWorks.length > 0) {
            setWorks(prev => [...prev, ...newWorks]);
          }
        }

        setCourseSynced(true);
      } catch (e) {
        console.error('Failed to fetch course history:', e);
      } finally {
        setLoadingCourses(false);
      }
    };

    fetchCourseHistory();
  }, [userEmail, courseSynced]);

  // 新增植物表單
  const [newPlantName, setNewPlantName] = useState('');
  const [newPlantDate, setNewPlantDate] = useState(new Date().toISOString().slice(0, 10));
  const [newPlantInterval, setNewPlantInterval] = useState(7);
  const [newPlantEmoji, setNewPlantEmoji] = useState('🪴');

  // 新增調香表單
  const [newFragName, setNewFragName] = useState('');
  const [newFragDate, setNewFragDate] = useState(new Date().toISOString().slice(0, 10));
  const [newFragTop, setNewFragTop] = useState('');
  const [newFragMiddle, setNewFragMiddle] = useState('');
  const [newFragBase, setNewFragBase] = useState('');
  const [newFragMemo, setNewFragMemo] = useState('');

  // 知識文章 detail
  const [selectedKnowledge, setSelectedKnowledge] = useState<{ emoji: string; title: string; content: string } | null>(null);

  // 選中的植物
  const [selectedPlant, setSelectedPlant] = useState<PlantRecord | null>(null);

  // 新增課程相關
  const [showAddCourseModal, setShowAddCourseModal] = useState(false);

  // ===== AI 個人化內容 =====
  const [aiContent, setAiContent] = useState<{
    weather_banner?: { text: string; weather: string; temperature_c: number };
    today_message?: string;
    care_tips?: Array<{ category: string; text: string }>;
    ritual?: { text: string; category: string; time_of_day: string };
    recommendations?: Array<{ type: string; title: string; reason: string }>;
    plant_recommendation?: { name: string; why: string; care: string; healing_quote: string } | null;
  } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // AI 個人化內容載入
  useEffect(() => {
    const fetchAiContent = async () => {
      setAiLoading(true);
      try {
        const hour = new Date().getHours();
        const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
        const interests: Record<string, number> = {};
        if (courseTypes.includes('plant') || plants.length > 0) interests.plant = 5;
        if (courseTypes.includes('fragrance')) interests.scent = 4;
        if (courseTypes.includes('crystal')) interests.crystal = 3;
        if (courseTypes.includes('candle')) interests.scent = Math.max(interests.scent || 0, 3);
        if (courseTypes.includes('leather')) interests.leather = 2;

        const body = {
          user: { nickname: '', location: '台灣', lastActiveDays: 0 },
          courses: courseRecords.map(r => ({
            source: 'order' as const,
            category: r.courseType || 'other',
            subCategory: r.courseType || '',
            courseName: r.productName,
            courseDate: r.orderDate?.slice(0, 10) || '',
          })),
          plants: plants.map(p => ({
            name: p.name,
            lastWatered: p.lastWatered,
            intervalDays: p.intervalDays,
          })),
          interests,
          context: {
            weather: '晴',
            today: new Date().toISOString().slice(0, 10),
            timeOfDay,
            temperatureC: 25,
          },
          history: {
            lastRecommendedPlants: [],
            lastRecommendedArticles: [],
            lastPushType: '',
          },
        };

        const resp = await fetch(`${API_BASE}/api/healing/companion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          if (errData.fallback) {
            setAiContent(errData.fallback.healing_home || null);
          }
          return;
        }

        const result = await resp.json();
        if (result.success && result.data) {
          setAiContent({
            ...result.data.healing_home,
            plant_recommendation: result.data.plant_recommendation,
          });
        }
      } catch (e) {
        console.error('AI content fetch failed:', e);
      } finally {
        setAiLoading(false);
      }
    };

    // 只在有課程或植物紀錄時才呼叫 AI
    if (courseTypes.length > 0 || plants.length > 0) {
      fetchAiContent();
    }
  }, [courseTypes.length, plants.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist to localStorage
  useEffect(() => { saveToStorage(STORAGE_KEYS.plants, plants); }, [plants]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.fragrances, fragrances); }, [fragrances]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.works, works); }, [works]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.courseTypes, courseTypes); }, [courseTypes]);

  // 今日提醒
  const dailyReminders = useMemo(() => generateDailyReminders(plants, fragrances), [plants, fragrances]);

  // 搜尋結果
  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const oils = OIL_LIBRARY.filter(o => o.name.includes(q) || o.en.toLowerCase().includes(q) || o.tags.some(t => t.includes(q)));
    const crystals = CRYSTAL_LIBRARY.filter(c => c.name.includes(q) || c.en.toLowerCase().includes(q) || c.tags.some(t => t.includes(q)));
    return { oils, crystals };
  }, [search]);

  // 動態排序：根據上過的課排序照顧入口
  const careEntries = useMemo(() => {
    const allEntries: { key: CourseType; emoji: string; title: string; subtitle: string; color: string; imageUrl: string }[] = [
      { key: 'fragrance', emoji: '🫧', title: '調香照顧', subtitle: '查看配方、補香提醒與香味日記', color: '#E8D5B7', imageUrl: 'https://xiabenhow.com/wp-content/uploads/2025/03/精油芳療滾珠瓶5.jpg' },
      { key: 'plant', emoji: '🌱', title: '植栽照顧', subtitle: '澆水提醒、照顧知識與植物狀態', color: '#C5D9B2', imageUrl: 'https://xiabenhow.com/wp-content/uploads/2023/01/798738.jpg' },
      { key: 'crystal', emoji: '💎', title: '水晶照顧', subtitle: '消磁音頻、能量功效與佩戴建議', color: '#D4C5E2', imageUrl: 'https://xiabenhow.com/wp-content/uploads/2026/03/1043595_0.jpg' },
      { key: 'leather', emoji: '👜', title: '皮革保養', subtitle: '使用提醒與日常保養方式', color: '#D9C5B2', imageUrl: 'https://xiabenhow.com/wp-content/uploads/2026/03/1033816_0.jpg' },
      { key: 'candle', emoji: '🕯️', title: '蠟燭 / 擴香照顧', subtitle: '燃燒須知、擴香石保養與使用建議', color: '#F0E0C8', imageUrl: 'https://xiabenhow.com/wp-content/uploads/2025/03/705960_0.jpg' },
    ];
    // 上過的課排前面
    const attended = allEntries.filter(e => courseTypes.includes(e.key));
    const notAttended = allEntries.filter(e => !courseTypes.includes(e.key));
    return [...attended, ...notAttended];
  }, [courseTypes]);

  // 我的作品快捷入口
  const quickAccessCards = useMemo(() => {
    const cards: { emoji: string; title: string; count: number; action: () => void }[] = [];
    if (fragrances.length > 0 || courseTypes.includes('fragrance')) {
      cards.push({ emoji: '🫧', title: '我的調香配方', count: fragrances.length, action: () => setView('care-fragrance') });
    }
    if (plants.length > 0 || courseTypes.includes('plant')) {
      cards.push({ emoji: '🌱', title: '我的植物提醒', count: plants.length, action: () => setView('care-plant') });
    }
    if (courseTypes.includes('crystal')) {
      cards.push({ emoji: '💎', title: '我的水晶手鍊', count: works.filter(w => w.type === 'crystal').length, action: () => setView('care-crystal') });
    }
    cards.push({ emoji: '📋', title: '我的作品總覽', count: works.length + fragrances.length + plants.length, action: () => setView('my-works') });
    return cards.slice(0, 4); // 最多4張
  }, [fragrances, plants, works, courseTypes]);

  // 返回
  const goBack = () => {
    if (view === 'oil-detail') {
      setView('care-fragrance');
    } else if (view === 'crystal-detail') {
      setView('care-crystal');
    } else if (view === 'article' || view === 'practice' || view === 'knowledge-detail') {
      setView('knowledge-articles-grid');
    } else if (view === 'add-plant') {
      setView('care-plant');
    } else if (view === 'add-fragrance') {
      setView('care-fragrance');
    } else if (view === 'plant-detail') {
      setView('care-plant');
    } else if (view === 'search') {
      setView('home');
      setSearch('');
    } else if (view === 'plant-photo-timeline') {
      setView('plant-photo-diary');
    } else if (view === 'plant-photo-diary' || view === 'ask-teacher' || view === 'teacher-dashboard') {
      setView('care-plant');
    } else if (view === 'knowledge-articles-grid' || view === 'topic-subscription') {
      setView('home');
    } else if (view === 'community-work-detail' || view === 'post-work' || view === 'work-comments') {
      setView('community-works-board');
    } else if (view === 'community-works-board') {
      setView('home');
    } else {
      setView('home');
    }
    setSelectedOil(null);
    setSelectedCrystal(null);
    setSelectedArticle(null);
    setSelectedPractice(null);
    setSelectedKnowledge(null);
    setSelectedPlant(null);
  };

  // 新增植物
  const addPlant = () => {
    if (!newPlantDate) return;
    const plant: PlantRecord = {
      id: Date.now().toString(),
      name: newPlantName || '我的多肉',
      lastWatered: newPlantDate,
      intervalDays: newPlantInterval,
      emoji: newPlantEmoji,
    };
    setPlants(prev => [...prev, plant]);
    if (!courseTypes.includes('plant')) setCourseTypes(prev => [...prev, 'plant']);
    setNewPlantName('');
    setNewPlantDate(new Date().toISOString().slice(0, 10));
    setNewPlantInterval(7);
    setView('care-plant');
  };

  // 標記澆水
  const waterPlant = (plantId: string) => {
    setPlants(prev => prev.map(p => p.id === plantId ? { ...p, lastWatered: new Date().toISOString().slice(0, 10) } : p));
  };

  // 刪除植物
  const removePlant = (plantId: string) => {
    setPlants(prev => prev.filter(p => p.id !== plantId));
  };

  // 新增調香配方
  const addFragrance = () => {
    if (!newFragName && !newFragTop && !newFragMiddle && !newFragBase) return;
    const frag: FragranceRecord = {
      id: Date.now().toString(),
      name: newFragName || '我的香氣',
      date: newFragDate,
      topNotes: newFragTop.split(/[,，、]/).map(s => s.trim()).filter(Boolean),
      middleNotes: newFragMiddle.split(/[,，、]/).map(s => s.trim()).filter(Boolean),
      baseNotes: newFragBase.split(/[,，、]/).map(s => s.trim()).filter(Boolean),
      memo: newFragMemo,
    };
    setFragrances(prev => [...prev, frag]);
    if (!courseTypes.includes('fragrance')) setCourseTypes(prev => [...prev, 'fragrance']);
    setNewFragName('');
    setNewFragTop('');
    setNewFragMiddle('');
    setNewFragBase('');
    setNewFragMemo('');
    setView('care-fragrance');
  };

  // 切換課程類型
  const toggleCourseType = (type: CourseType) => {
    setCourseTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  // 共用 card style
  const cardStyle = { backgroundColor: '#FFFEF9' };
  const subtleBg = { backgroundColor: '#FAF8F5' };

  // ========== 子頁面：新增植物 ==========
  if (view === 'add-plant') {
    return (
      <motion.div className="space-y-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
        <div>
          <motion.button whileTap={{ scale: 0.95 }} onClick={goBack}
            className="flex items-center gap-1 text-sm mb-3" style={{ color: '#C9A96E' }}>← 返回</motion.button>
          <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>🌱 新增植物</h2>
          <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>幫你的植物建立照顧提醒</p>
        </div>

        <div className="rounded-3xl p-5 shadow-sm space-y-4" style={cardStyle}>
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: '#8C7B72' }}>植物名稱（可選）</label>
            <input type="text" value={newPlantName} onChange={e => setNewPlantName(e.target.value)}
              placeholder="例如：小胖多肉、窗邊那盆"
              className="w-full rounded-2xl px-4 py-3 text-sm outline-none" style={{ backgroundColor: '#FAF8F5', color: '#3D3530' }} />
          </div>

          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: '#8C7B72' }}>選一個代表它的表情</label>
            <div className="flex gap-2 flex-wrap">
              {['🪴', '🌱', '🌵', '🌿', '🍀', '🪻'].map(e => (
                <button key={e} onClick={() => setNewPlantEmoji(e)}
                  className="w-11 h-11 rounded-2xl text-xl flex items-center justify-center transition-all"
                  style={newPlantEmoji === e ? { backgroundColor: '#8FA88630', boxShadow: '0 0 0 2px #8FA886' } : { backgroundColor: '#FAF8F5' }}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: '#8C7B72' }}>上次澆水日期</label>
            <input type="date" value={newPlantDate} onChange={e => setNewPlantDate(e.target.value)}
              className="w-full rounded-2xl px-4 py-3 text-sm outline-none" style={{ backgroundColor: '#FAF8F5', color: '#3D3530' }} />
          </div>

          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: '#8C7B72' }}>澆水間隔（天）</label>
            <div className="flex gap-2">
              {[5, 7, 10, 14].map(d => (
                <button key={d} onClick={() => setNewPlantInterval(d)}
                  className="flex-1 rounded-2xl py-2.5 text-sm font-medium transition-all"
                  style={newPlantInterval === d ? { backgroundColor: '#8FA886', color: '#fff' } : { backgroundColor: '#FAF8F5', color: '#8C7B72' }}>
                  {d} 天
                </button>
              ))}
            </div>
          </div>

          <motion.button whileTap={{ scale: 0.97 }} onClick={addPlant}
            className="w-full rounded-2xl py-3.5 text-sm font-bold text-white"
            style={{ backgroundColor: '#8FA886' }}>
            新增植物
          </motion.button>
        </div>
      </motion.div>
    );
  }

  // ========== 子頁面：新增調香配方 ==========
  if (view === 'add-fragrance') {
    return (
      <motion.div className="space-y-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
        <div>
          <motion.button whileTap={{ scale: 0.95 }} onClick={goBack}
            className="flex items-center gap-1 text-sm mb-3" style={{ color: '#C9A96E' }}>← 返回</motion.button>
          <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>🫧 記錄調香配方</h2>
          <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>讓你的香氣被好好保存</p>
        </div>

        <div className="rounded-3xl p-5 shadow-sm space-y-4" style={cardStyle}>
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: '#8C7B72' }}>香氣名稱</label>
            <input type="text" value={newFragName} onChange={e => setNewFragName(e.target.value)}
              placeholder="例如：夏日午後、我的第一瓶香水"
              className="w-full rounded-2xl px-4 py-3 text-sm outline-none" style={{ backgroundColor: '#FAF8F5', color: '#3D3530' }} />
          </div>

          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: '#8C7B72' }}>調香日期</label>
            <input type="date" value={newFragDate} onChange={e => setNewFragDate(e.target.value)}
              className="w-full rounded-2xl px-4 py-3 text-sm outline-none" style={{ backgroundColor: '#FAF8F5', color: '#3D3530' }} />
          </div>

          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: '#C9A96E' }}>前調 Top Notes</label>
            <input type="text" value={newFragTop} onChange={e => setNewFragTop(e.target.value)}
              placeholder="用逗號分隔，例如：佛手柑、檸檬"
              className="w-full rounded-2xl px-4 py-3 text-sm outline-none" style={{ backgroundColor: '#FAF8F5', color: '#3D3530' }} />
          </div>

          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: '#8FA886' }}>中調 Middle Notes</label>
            <input type="text" value={newFragMiddle} onChange={e => setNewFragMiddle(e.target.value)}
              placeholder="例如：薰衣草、玫瑰"
              className="w-full rounded-2xl px-4 py-3 text-sm outline-none" style={{ backgroundColor: '#FAF8F5', color: '#3D3530' }} />
          </div>

          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: '#8C7B72' }}>後調 Base Notes</label>
            <input type="text" value={newFragBase} onChange={e => setNewFragBase(e.target.value)}
              placeholder="例如：檀香、雪松"
              className="w-full rounded-2xl px-4 py-3 text-sm outline-none" style={{ backgroundColor: '#FAF8F5', color: '#3D3530' }} />
          </div>

          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: '#8C7B72' }}>備註</label>
            <textarea value={newFragMemo} onChange={e => setNewFragMemo(e.target.value)}
              placeholder="任何想記下的感受或筆記..."
              rows={3}
              className="w-full rounded-2xl px-4 py-3 text-sm outline-none resize-none" style={{ backgroundColor: '#FAF8F5', color: '#3D3530' }} />
          </div>

          <motion.button whileTap={{ scale: 0.97 }} onClick={addFragrance}
            className="w-full rounded-2xl py-3.5 text-sm font-bold text-white"
            style={{ backgroundColor: '#C9A96E' }}>
            儲存配方
          </motion.button>
        </div>
      </motion.div>
    );
  }

  // ========== 子頁面：植物詳情 ==========
  if (view === 'plant-detail' && selectedPlant) {
    const status = getWateringStatus(selectedPlant.lastWatered, selectedPlant.intervalDays);
    return (
      <motion.div className="space-y-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
        <div>
          <motion.button whileTap={{ scale: 0.95 }} onClick={goBack}
            className="flex items-center gap-1 text-sm mb-3" style={{ color: '#C9A96E' }}>← 返回</motion.button>
        </div>

        <div className="rounded-3xl p-6 shadow-sm text-center" style={{ backgroundColor: status.urgent ? '#8FA88618' : '#FFFEF9' }}>
          <span className="text-5xl">{selectedPlant.emoji}</span>
          <h3 className="text-lg font-bold mt-3" style={{ color: '#3D3530' }}>{selectedPlant.name}</h3>
          <p className="text-sm mt-2" style={{ color: status.urgent ? '#8FA886' : '#8C7B72' }}>{status.message}</p>

          <div className="flex items-center justify-center gap-6 mt-4">
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: '#8FA886' }}>{status.daysLeft}</p>
              <p className="text-xs" style={{ color: '#8C7B72' }}>天後澆水</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: '#C9A96E' }}>{selectedPlant.intervalDays}</p>
              <p className="text-xs" style={{ color: '#8C7B72' }}>天澆一次</p>
            </div>
          </div>

          <div className="flex gap-3 mt-5">
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => { waterPlant(selectedPlant.id); setSelectedPlant({ ...selectedPlant, lastWatered: new Date().toISOString().slice(0, 10) }); }}
              className="flex-1 rounded-2xl py-3 text-sm font-bold text-white"
              style={{ backgroundColor: '#8FA886' }}>
              💧 已澆水
            </motion.button>
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => { removePlant(selectedPlant.id); goBack(); }}
              className="rounded-2xl py-3 px-5 text-sm font-medium"
              style={{ backgroundColor: '#F0EDE8', color: '#8C7B72' }}>
              移除
            </motion.button>
          </div>
        </div>

        <div className="rounded-3xl p-5 shadow-sm" style={cardStyle}>
          <p className="text-sm font-bold mb-1" style={{ color: '#3D3530' }}>上次澆水</p>
          <p className="text-sm" style={{ color: '#8C7B72' }}>{new Date(selectedPlant.lastWatered).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </motion.div>
    );
  }

  // ========== 子頁面：調香照顧 ==========
  if (view === 'care-fragrance') {
    return (
      <motion.div className="space-y-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
        <div>
          <motion.button whileTap={{ scale: 0.95 }} onClick={goBack}
            className="flex items-center gap-1 text-sm mb-3" style={{ color: '#C9A96E' }}>← 返回</motion.button>
          <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>🫧 調香照顧</h2>
          <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>你的香氣，值得被好好記住</p>
        </div>

        {/* 我的配方 */}
        {fragrances.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-bold" style={{ color: '#3D3530' }}>我的配方</p>
            {fragrances.map(f => (
              <motion.div key={f.id} whileTap={{ scale: 0.98 }}
                className="rounded-2xl p-4 shadow-sm" style={cardStyle}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold" style={{ color: '#3D3530' }}>🫧 {f.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>{new Date(f.date).toLocaleDateString('zh-TW')}</p>
                  </div>
                  <button onClick={() => setFragrances(prev => prev.filter(x => x.id !== f.id))}
                    className="text-xs px-2 py-1 rounded-xl" style={{ color: '#B5AFA8' }}>移除</button>
                </div>
                {f.topNotes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="text-xs font-medium" style={{ color: '#C9A96E' }}>前調：</span>
                    {f.topNotes.map(n => <span key={n} className="text-xs px-2 py-0.5 rounded-xl" style={{ backgroundColor: '#C9A96E18', color: '#C9A96E' }}>{n}</span>)}
                  </div>
                )}
                {f.middleNotes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <span className="text-xs font-medium" style={{ color: '#8FA886' }}>中調：</span>
                    {f.middleNotes.map(n => <span key={n} className="text-xs px-2 py-0.5 rounded-xl" style={{ backgroundColor: '#8FA88618', color: '#8FA886' }}>{n}</span>)}
                  </div>
                )}
                {f.baseNotes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <span className="text-xs font-medium" style={{ color: '#8C7B72' }}>後調：</span>
                    {f.baseNotes.map(n => <span key={n} className="text-xs px-2 py-0.5 rounded-xl" style={{ backgroundColor: '#F0EDE8', color: '#8C7B72' }}>{n}</span>)}
                  </div>
                )}
                {f.memo && <p className="text-xs mt-2 leading-relaxed" style={{ color: '#B5AFA8' }}>{f.memo}</p>}
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl p-8 shadow-sm text-center" style={cardStyle}>
            <p className="text-3xl mb-2">🫧</p>
            <p className="text-sm" style={{ color: '#8C7B72' }}>還沒有配方紀錄</p>
            <p className="text-xs mt-1" style={{ color: '#B5AFA8' }}>上完調香課後，來這裡記錄你的香氣吧</p>
          </div>
        )}

        <motion.button whileTap={{ scale: 0.97 }} onClick={() => setView('add-fragrance')}
          className="w-full rounded-2xl py-3.5 text-sm font-bold text-white shadow-sm"
          style={{ backgroundColor: '#C9A96E' }}>
          + 新增調香配方
        </motion.button>

        {/* 調香知識 */}
        <div>
          <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>調香小知識</p>
          <div className="space-y-2">
            {AFTERCARE_KNOWLEDGE.fragrance.map(k => (
              <motion.button key={k.id} whileTap={{ scale: 0.97 }}
                onClick={() => { setSelectedKnowledge(k); setView('knowledge-detail'); }}
                className="w-full rounded-2xl p-3.5 shadow-sm text-left flex items-center gap-3" style={cardStyle}>
                <span className="text-xl">{k.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: '#3D3530' }}>{k.title}</p>
                  <p className="text-xs truncate" style={{ color: '#8C7B72' }}>{k.summary}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        {/* 精油百科入口 */}
        <div>
          <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>🌿 精油百科</p>
          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            {OIL_LIBRARY.slice(0, 8).map(oil => (
              <motion.button key={oil.name} whileTap={{ scale: 0.95 }}
                onClick={() => { setSelectedOil(oil); setView('oil-detail'); }}
                className="flex-shrink-0 w-24 rounded-2xl p-3 shadow-sm text-center" style={cardStyle}>
                <span className="text-2xl">{oil.emoji}</span>
                <p className="text-xs font-bold mt-1 truncate" style={{ color: '#3D3530' }}>{oil.name}</p>
                <p className="text-xs truncate" style={{ color: '#8C7B72' }}>{oil.en}</p>
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  // ========== 子頁面：植栽照顧 ==========
  if (view === 'care-plant') {
    return (
      <motion.div className="space-y-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
        <div>
          <motion.button whileTap={{ scale: 0.95 }} onClick={goBack}
            className="flex items-center gap-1 text-sm mb-3" style={{ color: '#C9A96E' }}>← 返回</motion.button>
          <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>🌱 植栽照顧</h2>
          <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>你的植物朋友，今天還好嗎？</p>
        </div>

        {/* 我的植物列表 */}
        {plants.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-bold" style={{ color: '#3D3530' }}>我的植物</p>
            {plants.map(p => {
              const status = getWateringStatus(p.lastWatered, p.intervalDays);
              return (
                <motion.button key={p.id} whileTap={{ scale: 0.98 }}
                  onClick={() => { setSelectedPlant(p); setView('plant-detail'); }}
                  className="w-full rounded-2xl p-4 shadow-sm text-left flex items-center gap-3"
                  style={{ backgroundColor: status.urgent ? '#8FA88612' : '#FFFEF9' }}>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                    style={{ backgroundColor: status.urgent ? '#8FA88620' : '#FAF8F5' }}>
                    {p.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: '#3D3530' }}>{p.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: status.urgent ? '#8FA886' : '#8C7B72' }}>
                      {status.urgent ? '💧 ' : ''}{status.message}
                    </p>
                  </div>
                  {status.urgent && (
                    <motion.button whileTap={{ scale: 0.9 }}
                      onClick={(e) => { e.stopPropagation(); waterPlant(p.id); }}
                      className="rounded-xl px-3 py-1.5 text-xs font-bold text-white"
                      style={{ backgroundColor: '#8FA886' }}>
                      澆水
                    </motion.button>
                  )}
                </motion.button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-3xl p-8 shadow-sm text-center" style={cardStyle}>
            <p className="text-3xl mb-2">🌱</p>
            <p className="text-sm" style={{ color: '#8C7B72' }}>還沒有植物紀錄</p>
            <p className="text-xs mt-1" style={{ color: '#B5AFA8' }}>上完植栽課，把你的小夥伴加進來吧</p>
          </div>
        )}

        <motion.button whileTap={{ scale: 0.97 }} onClick={() => setView('add-plant')}
          className="w-full rounded-2xl py-3.5 text-sm font-bold text-white shadow-sm"
          style={{ backgroundColor: '#8FA886' }}>
          + 新增植物
        </motion.button>

        {/* 照片日記 & 問老師 入口 */}
        <div className="grid grid-cols-2 gap-3">
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => setView('plant-photo-diary')}
            className="rounded-2xl p-4 shadow-sm text-left" style={{ backgroundColor: '#C5D9B218' }}>
            <span className="text-2xl">📸</span>
            <p className="text-sm font-bold mt-2" style={{ color: '#3D3530' }}>照片日記</p>
            <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>記錄植物成長</p>
          </motion.button>
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => setView('ask-teacher')}
            className="rounded-2xl p-4 shadow-sm text-left" style={{ backgroundColor: '#E8D5B718' }}>
            <span className="text-2xl">🙋</span>
            <p className="text-sm font-bold mt-2" style={{ color: '#3D3530' }}>問老師</p>
            <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>植物照顧疑難</p>
          </motion.button>
        </div>

        {/* 老師後台入口（僅管理員可見） */}
        {userEmail === ADMIN_EMAIL && (
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => setView('teacher-dashboard')}
            className="w-full rounded-2xl py-3 text-sm font-bold shadow-sm flex items-center justify-center gap-2"
            style={{ backgroundColor: '#C9A96E18', color: '#C9A96E' }}>
            📋 老師後台（問答管理）
          </motion.button>
        )}

        {/* 多肉知識 */}
        <div>
          <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>多肉小知識</p>
          <div className="space-y-2">
            {AFTERCARE_KNOWLEDGE.plant.map(k => (
              <motion.button key={k.id} whileTap={{ scale: 0.97 }}
                onClick={() => { setSelectedKnowledge(k); setView('knowledge-detail'); }}
                className="w-full rounded-2xl p-3.5 shadow-sm text-left flex items-center gap-3" style={cardStyle}>
                <span className="text-xl">{k.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: '#3D3530' }}>{k.title}</p>
                  <p className="text-xs truncate" style={{ color: '#8C7B72' }}>{k.summary}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  // ========== 子頁面：水晶照顧 ==========
  if (view === 'care-crystal') {
    return (
      <motion.div className="space-y-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
        <div>
          <motion.button whileTap={{ scale: 0.95 }} onClick={goBack}
            className="flex items-center gap-1 text-sm mb-3" style={{ color: '#C9A96E' }}>← 返回</motion.button>
          <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>💎 水晶照顧</h2>
          <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>你的水晶，也需要被溫柔對待</p>
        </div>

        {/* 水晶知識 */}
        <div>
          <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>水晶照顧知識</p>
          <div className="space-y-2">
            {AFTERCARE_KNOWLEDGE.crystal.map(k => (
              <motion.button key={k.id} whileTap={{ scale: 0.97 }}
                onClick={() => { setSelectedKnowledge(k); setView('knowledge-detail'); }}
                className="w-full rounded-2xl p-3.5 shadow-sm text-left flex items-center gap-3" style={cardStyle}>
                <span className="text-xl">{k.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: '#3D3530' }}>{k.title}</p>
                  <p className="text-xs truncate" style={{ color: '#8C7B72' }}>{k.summary}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        {/* 水晶百科 */}
        <div>
          <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>💎 水晶能量百科</p>
          <div className="grid grid-cols-2 gap-3">
            {CRYSTAL_LIBRARY.slice(0, 8).map(crystal => (
              <motion.button key={crystal.name} whileTap={{ scale: 0.95 }}
                onClick={() => { setSelectedCrystal(crystal); setView('crystal-detail'); }}
                className="rounded-2xl p-4 shadow-sm text-center" style={{ backgroundColor: crystal.color + '10' }}>
                <span className="text-2xl">{crystal.emoji}</span>
                <p className="text-sm font-bold mt-1" style={{ color: '#3D3530' }}>{crystal.name}</p>
                <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>{crystal.en}</p>
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  // ========== 子頁面：皮革保養 ==========
  if (view === 'care-leather') {
    return (
      <motion.div className="space-y-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
        <div>
          <motion.button whileTap={{ scale: 0.95 }} onClick={goBack}
            className="flex items-center gap-1 text-sm mb-3" style={{ color: '#C9A96E' }}>← 返回</motion.button>
          <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>👜 皮革保養</h2>
          <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>好好照顧，讓皮革陪你更久</p>
        </div>

        <div className="space-y-2">
          {AFTERCARE_KNOWLEDGE.leather.map(k => (
            <motion.button key={k.id} whileTap={{ scale: 0.97 }}
              onClick={() => { setSelectedKnowledge(k); setView('knowledge-detail'); }}
              className="w-full rounded-2xl p-4 shadow-sm text-left" style={cardStyle}>
              <div className="flex items-start gap-3">
                <span className="text-2xl">{k.emoji}</span>
                <div>
                  <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{k.title}</p>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: '#8C7B72' }}>{k.summary}</p>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </motion.div>
    );
  }

  // ========== 子頁面：蠟燭/擴香照顧 ==========
  if (view === 'care-candle') {
    return (
      <motion.div className="space-y-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
        <div>
          <motion.button whileTap={{ scale: 0.95 }} onClick={goBack}
            className="flex items-center gap-1 text-sm mb-3" style={{ color: '#C9A96E' }}>← 返回</motion.button>
          <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>🕯️ 蠟燭 / 擴香照顧</h2>
          <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>讓香氣持續陪伴你的日常</p>
        </div>

        <div className="rounded-3xl p-5 shadow-sm space-y-4" style={cardStyle}>
          <div className="rounded-2xl p-4" style={subtleBg}>
            <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>🕯️ 蠟燭使用須知</p>
            <div className="space-y-2">
              {['第一次點燃時，讓蠟面完全融化再熄滅，避免產生記憶環', '每次燃燒不超過 4 小時', '修剪燭芯至 0.5 公分再點燃', '遠離易燃物品，放在平穩處', '熄滅時用蓋子或工具，不要用嘴吹'].map((tip, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-xs mt-0.5" style={{ color: '#C9A96E' }}>●</span>
                  <p className="text-xs leading-relaxed" style={{ color: '#8C7B72' }}>{tip}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl p-4" style={subtleBg}>
            <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>🪨 擴香石保養</p>
            <div className="space-y-2">
              {['擴香石可重複滴加精油使用', '建議每次滴 3-5 滴即可', '放在通風處讓香氣自然擴散', '不同精油交替使用前，可先放置數日讓前一種味道消散'].map((tip, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-xs mt-0.5" style={{ color: '#C9A96E' }}>●</span>
                  <p className="text-xs leading-relaxed" style={{ color: '#8C7B72' }}>{tip}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // ========== 子頁面：我的作品總覽 ==========
  if (view === 'my-works') {
    const allWorks = [
      ...fragrances.map(f => ({ id: f.id, type: 'fragrance' as const, emoji: '🫧', name: f.name, date: f.date })),
      ...plants.map(p => ({ id: p.id, type: 'plant' as const, emoji: p.emoji, name: p.name, date: p.lastWatered })),
      ...works.map(w => ({ id: w.id, type: w.type, emoji: w.emoji, name: w.name, date: w.date })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
      <motion.div className="space-y-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
        <div>
          <motion.button whileTap={{ scale: 0.95 }} onClick={goBack}
            className="flex items-center gap-1 text-sm mb-3" style={{ color: '#C9A96E' }}>← 返回</motion.button>
          <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>📋 我的作品總覽</h2>
          <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>每一件作品，都是你的療癒痕跡</p>
        </div>

        {/* 上過的課程標籤 */}
        <div>
          <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>我上過的課程類型</p>
          <p className="text-xs mb-3" style={{ color: '#8C7B72' }}>點選標記你上過的課，首頁會依此調整顯示順序</p>
          <div className="flex flex-wrap gap-2">
            {([
              { key: 'fragrance' as CourseType, emoji: '🫧', label: '調香' },
              { key: 'plant' as CourseType, emoji: '🌱', label: '植栽' },
              { key: 'crystal' as CourseType, emoji: '💎', label: '水晶' },
              { key: 'leather' as CourseType, emoji: '👜', label: '皮革' },
              { key: 'candle' as CourseType, emoji: '🕯️', label: '蠟燭' },
            ]).map(ct => (
              <motion.button key={ct.key} whileTap={{ scale: 0.95 }}
                onClick={() => toggleCourseType(ct.key)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-sm font-medium transition-all"
                style={courseTypes.includes(ct.key)
                  ? { backgroundColor: '#8FA886', color: '#fff' }
                  : { backgroundColor: '#FAF8F5', color: '#8C7B72' }}>
                <span>{ct.emoji}</span> {ct.label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* 作品時間軸 */}
        {allWorks.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-bold" style={{ color: '#3D3530' }}>作品時間軸</p>
            {allWorks.map(w => (
              <div key={w.id + w.type} className="rounded-2xl p-4 shadow-sm flex items-center gap-3" style={cardStyle}>
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl" style={subtleBg}>
                  {w.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: '#3D3530' }}>{w.name}</p>
                  <p className="text-xs" style={{ color: '#8C7B72' }}>{new Date(w.date).toLocaleDateString('zh-TW')}</p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-xl font-medium"
                  style={{ backgroundColor: '#F0EDE8', color: '#8C7B72' }}>
                  {{ fragrance: '調香', plant: '植栽', crystal: '水晶', leather: '皮革', candle: '蠟燭', other: '其他' }[w.type]}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl p-8 shadow-sm text-center" style={cardStyle}>
            <p className="text-3xl mb-2">📋</p>
            <p className="text-sm" style={{ color: '#8C7B72' }}>還沒有作品紀錄</p>
            <p className="text-xs mt-1" style={{ color: '#B5AFA8' }}>上完課後，來記錄你做過的每一件作品吧</p>
          </div>
        )}
      </motion.div>
    );
  }

  // ========== 子頁面：知識文章 detail ==========
  if (view === 'knowledge-detail' && selectedKnowledge) {
    return (
      <motion.div className="space-y-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
        <div>
          <motion.button whileTap={{ scale: 0.95 }} onClick={goBack}
            className="flex items-center gap-1 text-sm mb-3" style={{ color: '#C9A96E' }}>← 返回</motion.button>
        </div>
        <div className="rounded-3xl p-6 shadow-sm" style={cardStyle}>
          <span className="text-3xl">{selectedKnowledge.emoji}</span>
          <h3 className="text-lg font-bold mt-3" style={{ color: '#3D3530' }}>{selectedKnowledge.title}</h3>
        </div>
        <div className="rounded-2xl p-5 shadow-sm" style={cardStyle}>
          <p className="text-sm whitespace-pre-line leading-relaxed" style={{ color: '#3D3530' }}>{selectedKnowledge.content}</p>
        </div>
      </motion.div>
    );
  }

  // ========== 搜尋結果 ==========
  if (view === 'search' && searchResults) {
    return (
      <motion.div className="space-y-5" {...fadeInUp}>
        <div>
          <motion.button whileTap={{ scale: 0.95 }} onClick={goBack}
            className="flex items-center gap-1 text-sm mb-3" style={{ color: '#C9A96E' }}>← 返回</motion.button>
        </div>
        <div className="flex items-center gap-2 rounded-2xl px-4 py-2.5 shadow-sm" style={cardStyle}>
          <span style={{ color: '#8C7B72' }}>🔍</span>
          <input type="text" placeholder="搜尋精油、水晶..."
            value={search}
            onChange={e => { setSearch(e.target.value); if (!e.target.value) setView('home'); }}
            className="flex-1 text-sm bg-transparent outline-none" style={{ color: '#3D3530' }} />
          {search && <button onClick={() => { setSearch(''); setView('home'); }} style={{ color: '#8C7B72' }}>✕</button>}
        </div>

        <div className="flex gap-2">
          {(['all', 'oil', 'crystal'] as const).map(tab => {
            const labels: Record<string, string> = { all: '全部', oil: '精油', crystal: '水晶' };
            const counts: Record<string, number> = {
              all: searchResults.oils.length + searchResults.crystals.length,
              oil: searchResults.oils.length, crystal: searchResults.crystals.length,
            };
            return (
              <button key={tab} onClick={() => setFilterTab(tab)}
                className="px-3 py-1.5 rounded-xl text-xs font-medium"
                style={filterTab === tab ? { backgroundColor: '#C9A96E', color: '#fff' } : { backgroundColor: '#FFFEF9', color: '#8C7B72' }}>
                {labels[tab]} ({counts[tab]})
              </button>
            );
          })}
        </div>

        {searchResults.oils.length > 0 && (filterTab === 'all' || filterTab === 'oil') && (
          <div>
            <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>🌿 精油</p>
            <div className="grid grid-cols-2 gap-3">
              {searchResults.oils.map(oil => (
                <motion.button key={oil.name} whileTap={{ scale: 0.96 }} onClick={() => { setSelectedOil(oil); setView('oil-detail'); }}
                  className="rounded-2xl p-4 text-left shadow-sm" style={cardStyle}>
                  <span className="text-2xl">{oil.emoji}</span>
                  <p className="text-sm font-bold mt-1" style={{ color: '#3D3530' }}>{oil.name}</p>
                  <p className="text-xs" style={{ color: '#8C7B72' }}>{oil.en}</p>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {searchResults.crystals.length > 0 && (filterTab === 'all' || filterTab === 'crystal') && (
          <div>
            <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>💎 水晶</p>
            <div className="grid grid-cols-2 gap-3">
              {searchResults.crystals.map(crystal => (
                <motion.button key={crystal.name} whileTap={{ scale: 0.96 }} onClick={() => { setSelectedCrystal(crystal); setView('crystal-detail'); }}
                  className="rounded-2xl p-4 text-left shadow-sm" style={cardStyle}>
                  <span className="text-2xl">{crystal.emoji}</span>
                  <p className="text-sm font-bold mt-1" style={{ color: '#3D3530' }}>{crystal.name}</p>
                  <p className="text-xs" style={{ color: '#8C7B72' }}>{crystal.en}</p>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {searchResults.oils.length + searchResults.crystals.length === 0 && (
          <div className="text-center py-8">
            <p className="text-3xl mb-2">🔍</p>
            <p className="text-sm" style={{ color: '#8C7B72' }}>找不到相關結果</p>
          </div>
        )}
      </motion.div>
    );
  }

  // ========== Layer 1: 課後照顧中心首頁 ==========
  if (view === 'home') {
    return (
      <motion.div className="space-y-6" {...fadeInUp}>
        {/* Header */}
        <div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs tracking-widest" style={{ color: '#C9A96E' }}>PERSONAL CONTENT</p>
              <h2 className="text-xl font-bold mt-1" style={{ color: '#3D3530' }}>課後照顧</h2>
            </div>
            {/* {userEmail && <PointsBadge userEmail={userEmail} />} — 社群點數暫時隱藏 */}
          </div>
          <p className="text-sm mt-1 leading-relaxed" style={{ color: '#8C7B72' }}>把作品帶回家後，陪伴才正要開始</p>
        </div>

        {/* 問老師入口 */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => setView('ask-teacher')}
          className="w-full rounded-2xl p-4 shadow-sm flex items-center gap-3"
          style={{ background: 'linear-gradient(135deg, #FAF8F5 0%, #F0EDE8 100%)' }}
        >
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl" style={{ backgroundColor: '#C9A96E20' }}>
            🙋
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-bold" style={{ color: '#3D3530' }}>問老師</p>
            <p className="text-xs" style={{ color: '#8C7B72' }}>作品有問題？拍張照片問老師</p>
          </div>
          <span style={{ color: '#C9A96E' }}>›</span>
        </motion.button>

        {/* 搜尋框 */}
        <div className="flex items-center gap-2 rounded-2xl px-4 py-2.5 shadow-sm" style={cardStyle}>
          <span style={{ color: '#8C7B72' }}>🔍</span>
          <input type="text" placeholder="搜尋精油、水晶百科..."
            value={search}
            onChange={e => { setSearch(e.target.value); if (e.target.value) setView('search'); }}
            className="flex-1 text-sm bg-transparent outline-none" style={{ color: '#3D3530' }} />
        </div>

        {/* 課程同步狀態 */}
        {loadingCourses && (
          <div className="flex items-center gap-2 rounded-2xl px-4 py-3" style={{ backgroundColor: '#8FA88612' }}>
            <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: '#8FA886', borderTopColor: 'transparent' }} />
            <p className="text-xs" style={{ color: '#8FA886' }}>正在同步你的課程紀錄...</p>
          </div>
        )}

        {!userEmail && !loadingCourses && (
          <div className="rounded-2xl px-4 py-3.5 flex items-center gap-3" style={{ backgroundColor: '#C9A96E12' }}>
            <span className="text-lg">💡</span>
            <p className="text-xs leading-relaxed" style={{ color: '#8C7B72' }}>登入後可自動同步你的訂單與課程紀錄，首頁會依你上過的課個人化顯示</p>
          </div>
        )}

        {courseSynced && courseRecords.length > 0 && (
          <div className="rounded-2xl px-4 py-3 flex items-center gap-2" style={{ backgroundColor: '#8FA88612' }}>
            <span className="text-sm">✅</span>
            <p className="text-xs" style={{ color: '#8FA886' }}>已同步 {courseRecords.length} 筆課程紀錄</p>
          </div>
        )}

        {/* Section 1: 專屬課程選擇 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold" style={{ color: '#3D3530' }}>課後照顧</p>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowAddCourseModal(true)}
              className="text-sm font-medium px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: '#8FA88620', color: '#8FA886' }}
            >
              ＋ 新增你做過的課程
            </motion.button>
          </div>

          {courseTypes.length === 0 ? (
            <div className="rounded-2xl p-6 text-center shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
              <p className="text-sm" style={{ color: '#8C7B72' }}>還沒選擇任何課程？點選上方按鈕新增你做過的課程</p>
            </div>
          ) : (
            <div className="space-y-3">
              {careEntries
                .filter(e => courseTypes.includes(e.key))
                .map((entry, i) => {
                  const viewMap: Record<CourseType, LibraryView> = {
                    fragrance: 'care-fragrance', plant: 'care-plant', crystal: 'care-crystal',
                    leather: 'care-leather', candle: 'care-candle',
                  };
                  return (
                    <motion.button
                      key={entry.key}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setView(viewMap[entry.key])}
                      className="w-full rounded-2xl shadow-sm text-left overflow-hidden flex items-center gap-3.5"
                      style={{ backgroundColor: '#FFFEF9' }}
                    >
                      <img src={entry.imageUrl} alt={entry.title} className="w-20 h-20 object-cover flex-shrink-0" loading="lazy" />
                      <div className="flex-1 min-w-0 py-3 pr-3">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{entry.emoji} {entry.title}</p>
                          <span className="text-xs px-1.5 py-0.5 rounded-lg font-medium" style={{ backgroundColor: '#8FA88620', color: '#8FA886' }}>已上課</span>
                        </div>
                        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#8C7B72' }}>{entry.subtitle}</p>
                      </div>
                      <span className="pr-3" style={{ color: '#C9A96E' }}>›</span>
                    </motion.button>
                  );
                })}
            </div>
          )}

          {/* Add Course Modal */}
          {showAddCourseModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-40 flex items-end z-50"
              onClick={() => setShowAddCourseModal(false)}
            >
              <motion.div
                initial={{ y: 300 }}
                animate={{ y: 0 }}
                exit={{ y: 300 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full rounded-t-3xl p-6 shadow-2xl"
                style={{ backgroundColor: '#FFFEF9' }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold" style={{ color: '#3D3530' }}>選擇你做過的課程</h3>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowAddCourseModal(false)}
                    className="text-2xl"
                    style={{ color: '#C9A96E' }}
                  >
                    ✕
                  </motion.button>
                </div>

                <div className="space-y-2">
                  {[
                    { key: 'fragrance' as CourseType, emoji: '🫧', name: '調香' },
                    { key: 'plant' as CourseType, emoji: '🌱', name: '植栽' },
                    { key: 'crystal' as CourseType, emoji: '💎', name: '水晶' },
                    { key: 'leather' as CourseType, emoji: '👜', name: '皮革' },
                    { key: 'candle' as CourseType, emoji: '🕯️', name: '蠟燭' },
                  ].map((item) => (
                    <motion.button
                      key={item.key}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        if (!courseTypes.includes(item.key)) {
                          setCourseTypes(prev => [...prev, item.key]);
                        }
                        setShowAddCourseModal(false);
                      }}
                      disabled={courseTypes.includes(item.key)}
                      className={`w-full rounded-xl p-4 text-left flex items-center gap-3 ${
                        courseTypes.includes(item.key) ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      style={{
                        backgroundColor: courseTypes.includes(item.key) ? '#F0EDE8' : '#FFFEF9',
                        border: courseTypes.includes(item.key) ? '2px solid #8FA886' : '1px solid #E8E0D7'
                      }}
                    >
                      <span className="text-2xl">{item.emoji}</span>
                      <div className="flex-1">
                        <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{item.name}</p>
                      </div>
                      {courseTypes.includes(item.key) && (
                        <span style={{ color: '#8FA886' }}>✓</span>
                      )}
                    </motion.button>
                  ))}
                </div>

                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setShowAddCourseModal(false)}
                  className="w-full mt-4 rounded-lg py-3 font-bold"
                  style={{ backgroundColor: '#8FA886', color: '#FFFEF9' }}
                >
                  完成
                </motion.button>
              </motion.div>
            </motion.div>
          )}
        </div>

        {/* Section 4: 課後知識區 */}
        <div>
          <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>課後小知識</p>
          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            {[
              ...AFTERCARE_KNOWLEDGE.plant.slice(0, 2),
              ...AFTERCARE_KNOWLEDGE.fragrance.slice(0, 1),
              ...AFTERCARE_KNOWLEDGE.crystal.slice(0, 1),
            ].map(k => (
              <motion.button key={k.id} whileTap={{ scale: 0.95 }}
                onClick={() => { setSelectedKnowledge(k); setView('knowledge-detail'); }}
                className="flex-shrink-0 w-44 rounded-2xl p-4 shadow-sm text-left" style={cardStyle}>
                <span className="text-xl">{k.emoji}</span>
                <p className="text-xs font-bold mt-2 leading-snug" style={{ color: '#3D3530' }}>{k.title}</p>
                <p className="text-xs mt-1 leading-relaxed line-clamp-2" style={{ color: '#8C7B72' }}>{k.summary}</p>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Section 4.3: 主題訂閱 */}
        {userEmail && (
          <div className="rounded-2xl p-4 shadow-sm relative overflow-hidden" style={{
            backgroundImage: 'url(/bg-subscription-topics.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}>
            <div className="absolute inset-0 rounded-2xl" style={{ backgroundColor: 'rgba(255,254,249,0.55)' }} />
            <div className="relative z-10">
              <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>🔔 訂閱感興趣的主題</p>
              <p className="text-xs mb-3" style={{ color: '#8C7B72' }}>勾選主題，系統會優先推送相關內容給你</p>
              <TopicSubscriptionBlock userEmail={userEmail} />
            </div>
          </div>
        )}

        {/* Section 4.4: 本週精選作品 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold" style={{ color: '#3D3530' }}>⭐ 本週精選作品</p>
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => onNavigate?.('community')}
              className="text-xs" style={{ color: '#C9A96E' }}>看更多 ›</motion.button>
          </div>
          <WeeklyFeaturedWorks />
        </div>

        {/* Section 4.5: 知識文章 & 社群作品入口 */}
        <div className="grid grid-cols-2 gap-3">
          <motion.button whileTap={{ scale: 0.96 }}
            onClick={() => setView('knowledge-articles-grid')}
            className="rounded-2xl p-4 shadow-sm text-left relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #FFF8E1 0%, #FFFEF9 100%)' }}>
            <span className="text-2xl">📚</span>
            <p className="text-sm font-bold mt-2" style={{ color: '#3D3530' }}>知識專欄</p>
            <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>療癒知識、照顧技巧</p>
            <div className="absolute -bottom-2 -right-2 text-5xl opacity-[0.06]">📚</div>
          </motion.button>
          <motion.button whileTap={{ scale: 0.96 }}
            onClick={() => onNavigate?.('community')}
            className="rounded-2xl p-4 shadow-sm text-left relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #E8F5E9 0%, #FFFEF9 100%)' }}>
            <span className="text-2xl">🎨</span>
            <p className="text-sm font-bold mt-2" style={{ color: '#3D3530' }}>社群</p>
            <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>看看大家的作品</p>
            <div className="absolute -bottom-2 -right-2 text-5xl opacity-[0.06]">🎨</div>
          </motion.button>
        </div>

        {/* Section 5: AI 今日儀式推薦 */}
        {aiContent?.ritual && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>💛 今日小儀式</p>
            <div className="rounded-2xl p-4 shadow-sm" style={{ background: 'linear-gradient(135deg, #FFFEF9 0%, #FFF8E1 100%)' }}>
              <p className="text-sm leading-relaxed" style={{ color: '#3D3530' }}>{aiContent.ritual.text}</p>
              <p className="text-xs mt-2" style={{ color: '#C9A96E' }}>只需要 2 分鐘</p>
            </div>
          </motion.div>
        )}

        {/* Section 6: AI 植物推薦 */}
        {aiContent?.plant_recommendation && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>🌿 也許你會喜歡</p>
            <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#C5D9B218' }}>
              <p className="text-base font-bold" style={{ color: '#3D3530' }}>{aiContent.plant_recommendation.name}</p>
              <p className="text-sm mt-1 leading-relaxed" style={{ color: '#8C7B72' }}>{aiContent.plant_recommendation.why}</p>
              <p className="text-sm mt-1 leading-relaxed" style={{ color: '#8C7B72' }}>照顧方式：{aiContent.plant_recommendation.care}</p>
              <p className="text-xs mt-2 italic" style={{ color: '#C9A96E' }}>「{aiContent.plant_recommendation.healing_quote}」</p>
            </div>
          </motion.div>
        )}

        {/* Section 7: 延伸推薦 */}
        <div>
          <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>你可能也會喜歡</p>
          <div className="space-y-2.5">
            {[
              { emoji: '🌿', text: '喜歡調香的你，也許會想體驗芳療客製服務', color: '#E8D5B7' },
              { emoji: '💎', text: '做過水晶手鍊的你，也適合看看高階晶礦手鍊', color: '#D4C5E2' },
              { emoji: '🌱', text: '喜歡植栽的你，也可以延伸體驗其他自然療癒課程', color: '#C5D9B2' },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 + i * 0.08 }}
                className="rounded-2xl px-4 py-3.5 flex items-center gap-3"
                style={{ backgroundColor: item.color + '18' }}
              >
                <span className="text-lg">{item.emoji}</span>
                <p className="text-xs leading-relaxed" style={{ color: '#8C7B72' }}>{item.text}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* 底部留白 */}
        <div className="h-4" />
      </motion.div>
    );
  }

  // ========== Layer 3: 精油詳情 ==========
  if (view === 'oil-detail' && selectedOil) {
    const matchedCrystals = CRYSTAL_LIBRARY.filter(c => c.pairedOils.includes(selectedOil.name));
    return (
      <motion.div className="space-y-4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
        <motion.button whileTap={{ scale: 0.95 }} onClick={goBack}
          className="flex items-center gap-1 text-sm" style={{ color: '#C9A96E' }}>
          ← 返回
        </motion.button>

        <div className="rounded-3xl p-6 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-4xl">{selectedOil.emoji}</span>
            <div>
              <h3 className="text-xl font-bold" style={{ color: '#3D3530' }}>{selectedOil.name}</h3>
              <p className="text-sm" style={{ color: '#8C7B72' }}>{selectedOil.en} · {selectedOil.family}</p>
              <p className="text-xs" style={{ color: '#8C7B72' }}>萃取部位：{selectedOil.part}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectedOil.tags.map(tag => (
              <span key={tag} className="px-2.5 py-1 rounded-xl text-xs font-medium"
                style={{ backgroundColor: '#F0EDE8', color: '#8C7B72' }}>{tag}</span>
            ))}
          </div>
        </div>

        {selectedOil.use && (
          <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
            <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>💊 臨床應用</p>
            <p className="text-sm whitespace-pre-line leading-relaxed" style={{ color: '#8C7B72' }}>{selectedOil.use}</p>
          </div>
        )}
        {selectedOil.physical && (
          <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
            <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>🫀 生理功效</p>
            <p className="text-sm whitespace-pre-line leading-relaxed" style={{ color: '#8C7B72' }}>{selectedOil.physical}</p>
          </div>
        )}
        {selectedOil.mental && (
          <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
            <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>🌿 心靈功效</p>
            <p className="text-sm whitespace-pre-line leading-relaxed" style={{ color: '#8C7B72' }}>{selectedOil.mental}</p>
          </div>
        )}

        {matchedCrystals.length > 0 && (
          <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#F0EDE8' }}>
            <p className="text-sm font-bold mb-2" style={{ color: '#9B7EC8' }}>💎 推薦搭配水晶</p>
            <div className="flex flex-wrap gap-2">
              {matchedCrystals.map(crystal => (
                <motion.button key={crystal.name} whileTap={{ scale: 0.95 }}
                  onClick={() => { setSelectedOil(null); setSelectedCrystal(crystal); setView('crystal-detail'); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
                  style={{ backgroundColor: crystal.color + '20', color: '#3D3530' }}>
                  <span>{crystal.emoji}</span>{crystal.name}
                </motion.button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    );
  }

  // ========== Layer 3: 水晶詳情 ==========
  if (view === 'crystal-detail' && selectedCrystal) {
    return (
      <motion.div className="space-y-4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
        <motion.button whileTap={{ scale: 0.95 }} onClick={goBack}
          className="flex items-center gap-1 text-sm" style={{ color: '#C9A96E' }}>
          ← 返回
        </motion.button>

        <div className="rounded-3xl p-6 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: selectedCrystal.color + '25' }}>
              <span className="text-3xl">{selectedCrystal.emoji}</span>
            </div>
            <div>
              <h3 className="text-xl font-bold" style={{ color: '#3D3530' }}>{selectedCrystal.name}</h3>
              <p className="text-sm" style={{ color: '#8C7B72' }}>{selectedCrystal.en} · {selectedCrystal.family}</p>
              <p className="text-xs" style={{ color: '#8C7B72' }}>{CHAKRA_EMOJI[selectedCrystal.chakra] || '⚪'} {selectedCrystal.chakra} · 硬度 {selectedCrystal.hardness}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectedCrystal.tags.map(tag => (
              <span key={tag} className="px-2.5 py-1 rounded-xl text-xs font-medium"
                style={{ backgroundColor: selectedCrystal.color + '15', color: '#8C7B72' }}>{tag}</span>
            ))}
          </div>
        </div>

        <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>✨ 水晶介紹</p>
          <p className="text-sm whitespace-pre-line leading-relaxed" style={{ color: '#8C7B72' }}>{selectedCrystal.effect}</p>
          <p className="text-xs mt-2" style={{ color: '#B8ADA6' }}>產地：{selectedCrystal.origin}</p>
        </div>
        <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>🫀 身體功效</p>
          <p className="text-sm whitespace-pre-line leading-relaxed" style={{ color: '#8C7B72' }}>{selectedCrystal.physical}</p>
        </div>
        <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>🌿 心靈功效</p>
          <p className="text-sm whitespace-pre-line leading-relaxed" style={{ color: '#8C7B72' }}>{selectedCrystal.mental}</p>
        </div>
        <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>🌊 淨化方式</p>
          <p className="text-sm leading-relaxed" style={{ color: '#8C7B72' }}>{selectedCrystal.cleansing}</p>
        </div>

        {selectedCrystal.pairedOils.length > 0 && (
          <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#F5F0E8' }}>
            <p className="text-sm font-bold mb-2" style={{ color: '#C9A96E' }}>🌿 搭配精油</p>
            <div className="flex flex-wrap gap-2">
              {selectedCrystal.pairedOils.map(oilName => {
                const oil = OIL_LIBRARY.find(o => o.name === oilName);
                return (
                  <motion.button key={oilName} whileTap={{ scale: 0.95 }}
                    onClick={() => { if (oil) { setSelectedCrystal(null); setSelectedOil(oil); setView('oil-detail'); } }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium"
                    style={{ backgroundColor: '#FFFEF9', color: '#8C7B72' }}>
                    <span>{oil?.emoji || '🌿'}</span>{oilName}
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}

        {selectedCrystal.emotions.length > 0 && (
          <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
            <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>💛 適合的情緒</p>
            <div className="flex flex-wrap gap-2">
              {selectedCrystal.emotions.map(emoKey => {
                const emo = getEmotionInfo(emoKey);
                return (
                  <span key={emoKey} className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs"
                    style={{ backgroundColor: emo.color + '20', color: '#8C7B72' }}>
                    {emo.emoji} {emo.label}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>
    );
  }

  // ========== Layer 3: 文章詳情 ==========
  if (view === 'article' && selectedArticle) {
    return (
      <motion.div className="space-y-4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
        <motion.button whileTap={{ scale: 0.95 }} onClick={goBack}
          className="flex items-center gap-1 text-sm" style={{ color: '#C9A96E' }}>
          ← 返回
        </motion.button>

        <div className="rounded-3xl p-6 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <span className="text-3xl">{selectedArticle.emoji}</span>
          <h3 className="text-lg font-bold mt-3" style={{ color: '#3D3530' }}>{selectedArticle.title}</h3>
          <p className="text-xs mt-1" style={{ color: '#B5AFA8' }}>閱讀時間 {selectedArticle.readTime}</p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {selectedArticle.tags.map(tag => (
              <span key={tag} className="px-2.5 py-1 rounded-xl text-xs font-medium"
                style={{ backgroundColor: '#F0EDE8', color: '#8C7B72' }}>{tag}</span>
            ))}
          </div>
        </div>

        <div className="rounded-2xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-sm whitespace-pre-line leading-relaxed" style={{ color: '#3D3530' }}>{selectedArticle.content}</p>
        </div>
      </motion.div>
    );
  }

  // ========== Layer 3: 練習詳情 ==========
  if (view === 'practice' && selectedPractice) {
    return (
      <motion.div className="space-y-4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
        <motion.button whileTap={{ scale: 0.95 }} onClick={goBack}
          className="flex items-center gap-1 text-sm" style={{ color: '#C9A96E' }}>
          ← 返回
        </motion.button>

        <div className="rounded-3xl p-6 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <span className="text-3xl">{selectedPractice.emoji}</span>
          <h3 className="text-lg font-bold mt-3" style={{ color: '#3D3530' }}>{selectedPractice.title}</h3>
          <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>{selectedPractice.description}</p>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs px-2.5 py-1 rounded-xl font-medium" style={{ backgroundColor: '#8FA88620', color: '#8FA886' }}>⏱ {selectedPractice.duration}</span>
            {selectedPractice.tags.map(tag => (
              <span key={tag} className="text-xs px-2.5 py-1 rounded-xl font-medium"
                style={{ backgroundColor: '#F0EDE8', color: '#8C7B72' }}>{tag}</span>
            ))}
          </div>
        </div>

        <div className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>📝 步驟</p>
          <div className="space-y-3">
            {selectedPractice.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ backgroundColor: '#C9A96E20', color: '#C9A96E' }}>{i + 1}</div>
                <p className="text-sm leading-relaxed" style={{ color: '#3D3530' }}>{step}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  // ========== Feature 1: 植物照片日記 ==========
  if (view === 'plant-photo-diary') {
    return <PlantPhotoDiaryView userEmail={userEmail} goBack={goBack} setView={setView} />;
  }

  if (view === 'plant-photo-timeline' && selectedPlant) {
    return <PlantPhotoTimelineView plant={selectedPlant} userEmail={userEmail} goBack={goBack} />;
  }

  // ========== Feature 1b: 問老師 Q&A ==========
  if (view === 'ask-teacher') {
    return <AskTeacherView userEmail={userEmail} plants={plants} goBack={goBack} />;
  }

  if (view === 'teacher-dashboard') {
    return <TeacherDashboardView userEmail={userEmail} goBack={goBack} />;
  }

  // ========== Feature 2: 知識文章小紅書風格 ==========
  if (view === 'knowledge-articles-grid') {
    return <KnowledgeArticlesGridView userEmail={userEmail} goBack={goBack} />;
  }

  // ========== Feature 3: 作品社群 ==========
  if (view === 'community-works-board') {
    return <CommunityWorksBoardView userEmail={userEmail} goBack={goBack} setView={setView} />;
  }

  if (view === 'post-work') {
    return <PostWorkView userEmail={userEmail} goBack={goBack} />;
  }

  // Fallback
  return null;
}

// ==================== 新功能子元件 ====================

// ---- 植物照片日記列表 ----
function PlantPhotoDiaryView({ userEmail, goBack, setView }: {
  userEmail: string | null;
  goBack: () => void;
  setView: (v: LibraryView) => void;
}) {
  const [diaries, setDiaries] = useState<PlantDiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('🪴');
  const [newSpecies, setNewSpecies] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!userEmail) { setLoading(false); return; }
    const q = query(collection(db, 'plant_diaries'), where('userId', '==', userEmail), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const items: PlantDiary[] = snap.docs.map(d => ({ id: d.id, ...d.data(), photos: [] } as unknown as PlantDiary));
      setDiaries(items);
      setLoading(false);
    });
    return unsub;
  }, [userEmail]);

  const handleAdd = async () => {
    if (!userEmail || !newName.trim()) return;
    setAdding(true);
    try {
      await addDoc(collection(db, 'plant_diaries'), {
        userId: userEmail,
        name: newName.trim(),
        emoji: newEmoji,
        species: newSpecies.trim(),
        createdAt: new Date().toISOString(),
        photoCount: 0,
      });
      setNewName(''); setNewSpecies(''); setShowAdd(false);
    } catch (e) { console.error(e); }
    setAdding(false);
  };

  const emojiOptions = ['🪴', '🌱', '🌵', '🌸', '🌻', '🌿', '🍀', '🌳', '🌺', '🪻'];

  if (!userEmail) {
    return (
      <motion.div className="space-y-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
        <motion.button whileTap={{ scale: 0.95 }} onClick={goBack} className="flex items-center gap-1 text-sm" style={{ color: '#C9A96E' }}>← 返回</motion.button>
        <div className="rounded-3xl p-8 text-center" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-3xl mb-2">📸</p>
          <p className="text-sm" style={{ color: '#8C7B72' }}>請先登入才能使用照片日記</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <div>
        <motion.button whileTap={{ scale: 0.95 }} onClick={goBack} className="flex items-center gap-1 text-sm mb-3" style={{ color: '#C9A96E' }}>← 返回</motion.button>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>📸 植物照片日記</h2>
        <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>用照片記錄每一盆植物的成長</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: '#8FA886', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <>
          {diaries.length === 0 && !showAdd && (
            <div className="rounded-3xl p-8 text-center shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
              <p className="text-3xl mb-2">🌱</p>
              <p className="text-sm" style={{ color: '#8C7B72' }}>還沒有植物日記</p>
              <p className="text-xs mt-1" style={{ color: '#B5AFA8' }}>建立一本，開始記錄你的植物成長吧</p>
            </div>
          )}

          <div className="space-y-3">
            {diaries.map(d => (
              <motion.button key={d.id} whileTap={{ scale: 0.98 }}
                onClick={() => {
                  // Navigate to timeline — we reuse selectedPlant state temporarily
                  const p: PlantRecord = { id: d.id, name: d.name, emoji: d.emoji, lastWatered: d.createdAt, intervalDays: 7 };
                  setView('plant-photo-timeline' as LibraryView);
                  // We need to pass diary id — store in a way timeline can read
                  sessionStorage.setItem('active_diary_id', d.id);
                }}
                className="w-full rounded-2xl p-4 shadow-sm text-left flex items-center gap-3"
                style={{ backgroundColor: '#FFFEF9' }}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ backgroundColor: '#C5D9B220' }}>
                  {d.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: '#3D3530' }}>{d.name}</p>
                  {d.species && <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>{d.species}</p>}
                  <p className="text-xs mt-0.5" style={{ color: '#B5AFA8' }}>建立於 {d.createdAt?.slice(0, 10)}</p>
                </div>
                <span style={{ color: '#C9A96E' }}>›</span>
              </motion.button>
            ))}
          </div>
        </>
      )}

      {showAdd ? (
        <div className="rounded-2xl p-4 shadow-sm space-y-3" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>新增植物日記</p>
          <div className="flex flex-wrap gap-2">
            {emojiOptions.map(e => (
              <button key={e} onClick={() => setNewEmoji(e)}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                style={{ backgroundColor: e === newEmoji ? '#8FA88630' : '#F5F0EB' }}>
                {e}
              </button>
            ))}
          </div>
          <input type="text" placeholder="植物名稱（如：我的多肉）" value={newName} onChange={e => setNewName(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm bg-transparent outline-none" style={{ backgroundColor: '#F5F0EB', color: '#3D3530' }} />
          <input type="text" placeholder="品種（選填）" value={newSpecies} onChange={e => setNewSpecies(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm bg-transparent outline-none" style={{ backgroundColor: '#F5F0EB', color: '#3D3530' }} />
          <div className="flex gap-2">
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => setShowAdd(false)}
              className="flex-1 rounded-xl py-2.5 text-sm" style={{ color: '#8C7B72' }}>取消</motion.button>
            <motion.button whileTap={{ scale: 0.95 }} onClick={handleAdd} disabled={adding || !newName.trim()}
              className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white" style={{ backgroundColor: adding ? '#B5AFA8' : '#8FA886' }}>
              {adding ? '建立中...' : '建立'}
            </motion.button>
          </div>
        </div>
      ) : (
        <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowAdd(true)}
          className="w-full rounded-2xl py-3.5 text-sm font-bold text-white shadow-sm" style={{ backgroundColor: '#8FA886' }}>
          + 新增植物日記
        </motion.button>
      )}
    </motion.div>
  );
}

// ---- 植物照片時間軸 ----
function PlantPhotoTimelineView({ plant, userEmail, goBack }: {
  plant: PlantRecord;
  userEmail: string | null;
  goBack: () => void;
}) {
  const diaryId = sessionStorage.getItem('active_diary_id') || plant.id;
  const [photos, setPhotos] = useState<PlantPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [newNote, setNewNote] = useState('');

  useEffect(() => {
    if (!userEmail) return;
    const q = query(collection(db, 'plant_diaries', diaryId, 'photos'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setPhotos(snap.docs.map(d => ({ id: d.id, ...d.data() } as PlantPhoto)));
      setLoading(false);
    });
    return unsub;
  }, [userEmail, diaryId]);

  const handleAddPhoto = async () => {
    if (!userEmail) return;
    const dataUrl = await takePhoto();
    if (!dataUrl) return;
    setUploading(true);
    try {
      const { url, thumbnailUrl } = await uploadImage(
        `plant_diaries/${userEmail}/${diaryId}/photo_${Date.now()}.jpg`,
        dataUrl
      );
      await addDoc(collection(db, 'plant_diaries', diaryId, 'photos'), {
        url,
        thumbnailUrl: thumbnailUrl || url,
        note: newNote.trim(),
        createdAt: new Date().toISOString(),
      });
      await updateDoc(doc(db, 'plant_diaries', diaryId), { photoCount: increment(1) });
      setNewNote('');
      hapticSuccess();

      // 積分：拍照記錄 +5
      // 社群活動點數 — 暫時隱藏
      // if (userEmail) {
      //   const pointsRef = doc(db, 'user_points', userEmail);
      //   await setDoc(pointsRef, { total: increment(5), lastAction: 'plant_photo', lastActionAt: new Date().toISOString() }, { merge: true });
      // }
    } catch (e) { console.error('Upload failed:', e); }
    setUploading(false);
  };

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <div>
        <motion.button whileTap={{ scale: 0.95 }} onClick={goBack} className="flex items-center gap-1 text-sm mb-3" style={{ color: '#C9A96E' }}>← 返回</motion.button>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>{plant.emoji} {plant.name} 的成長日記</h2>
        <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>每一次拍照都是一個小小的里程碑</p>
      </div>

      {/* 新增照片 */}
      <div className="rounded-2xl p-4 shadow-sm space-y-3" style={{ backgroundColor: '#FFFEF9' }}>
        <input type="text" placeholder="這次想記錄什麼？（選填）" value={newNote} onChange={e => setNewNote(e.target.value)}
          className="w-full rounded-xl px-3 py-2.5 text-sm bg-transparent outline-none" style={{ backgroundColor: '#F5F0EB', color: '#3D3530' }} />
        <motion.button whileTap={{ scale: 0.97 }} onClick={handleAddPhoto} disabled={uploading}
          className="w-full rounded-xl py-3 text-sm font-bold text-white flex items-center justify-center gap-2"
          style={{ backgroundColor: uploading ? '#B5AFA8' : '#8FA886' }}>
          {uploading ? (
            <><div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: '#fff', borderTopColor: 'transparent' }} /> 上傳中...</>
          ) : (
            <>📷 拍照記錄</>
          )}
        </motion.button>
      </div>

      {/* 時間軸 */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: '#8FA886', borderTopColor: 'transparent' }} />
        </div>
      ) : photos.length === 0 ? (
        <div className="rounded-3xl p-8 text-center shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-3xl mb-2">📷</p>
          <p className="text-sm" style={{ color: '#8C7B72' }}>還沒有照片</p>
          <p className="text-xs mt-1" style={{ color: '#B5AFA8' }}>拍下第一張照片，開始記錄吧！</p>
        </div>
      ) : (
        <div className="relative pl-6">
          {/* Timeline line */}
          <div className="absolute left-2.5 top-0 bottom-0 w-0.5" style={{ backgroundColor: '#C5D9B240' }} />
          <div className="space-y-4">
            {photos.map((photo, i) => (
              <motion.div key={photo.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="relative">
                {/* Timeline dot */}
                <div className="absolute -left-[18px] top-3 w-3 h-3 rounded-full" style={{ backgroundColor: '#8FA886' }} />
                <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
                  <img src={photo.thumbnailUrl || photo.url} alt="" className="w-full h-48 object-cover" loading="lazy" />
                  <div className="p-3">
                    {photo.note && <p className="text-sm mb-1" style={{ color: '#3D3530' }}>{photo.note}</p>}
                    <p className="text-xs" style={{ color: '#B5AFA8' }}>{photo.createdAt?.slice(0, 10)}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ---- 問老師 ----
function AskTeacherView({ userEmail, plants, goBack }: {
  userEmail: string | null;
  plants: PlantRecord[];
  goBack: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [selectedPlantId, setSelectedPlantId] = useState(plants[0]?.id || '');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [myQuestions, setMyQuestions] = useState<TeacherQuestion[]>([]);

  useEffect(() => {
    if (!userEmail) return;
    const q = query(collection(db, 'admin_questions'), where('userEmail', '==', userEmail), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setMyQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() } as TeacherQuestion)));
    });
    return unsub;
  }, [userEmail]);

  const handleSend = async () => {
    if (!userEmail || !question.trim()) return;
    setSending(true);
    try {
      const plant = plants.find(p => p.id === selectedPlantId);
      let photoUrl: string | undefined;
      if (photoDataUrl) {
        const { url } = await uploadImage(`teacher_questions/${userEmail}/photo_${Date.now()}.jpg`, photoDataUrl, false);
        photoUrl = url;
      }
      await addDoc(collection(db, 'admin_questions'), {
        userId: userEmail,
        userEmail,
        plantName: plant?.name || '未指定',
        plantEmoji: plant?.emoji || '🌱',
        photoUrl,
        question: question.trim(),
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      setQuestion(''); setPhotoDataUrl(null); setSent(true);
      hapticSuccess();
      setTimeout(() => setSent(false), 3000);
    } catch (e) { console.error(e); }
    setSending(false);
  };

  const askPhotoInputRef = useRef<HTMLInputElement>(null);
  const askCameraInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setPhotoDataUrl(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  if (!userEmail) {
    return (
      <motion.div className="space-y-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
        <motion.button whileTap={{ scale: 0.95 }} onClick={goBack} className="flex items-center gap-1 text-sm" style={{ color: '#C9A96E' }}>← 返回</motion.button>
        <div className="rounded-3xl p-8 text-center" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-3xl mb-2">🙋</p>
          <p className="text-sm" style={{ color: '#8C7B72' }}>請先登入才能發問</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      {/* Hidden file inputs */}
      <input ref={askPhotoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoFile} />
      <input ref={askCameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoFile} />

      <div>
        <motion.button whileTap={{ scale: 0.95 }} onClick={goBack} className="flex items-center gap-1 text-sm mb-3" style={{ color: '#C9A96E' }}>← 返回</motion.button>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>🙋 問老師</h2>
        <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>作品有問題？拍張照片問老師吧</p>
      </div>

      {/* 發問表單 */}
      <div className="rounded-2xl p-4 shadow-sm space-y-3" style={{ backgroundColor: '#FFFEF9' }}>
        {plants.length > 0 && (
          <div>
            <p className="text-xs mb-1.5" style={{ color: '#8C7B72' }}>關於哪盆植物？</p>
            <div className="flex flex-wrap gap-2">
              {plants.map(p => (
                <button key={p.id} onClick={() => setSelectedPlantId(p.id)}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium"
                  style={{ backgroundColor: p.id === selectedPlantId ? '#8FA88630' : '#F5F0EB', color: '#3D3530' }}>
                  {p.emoji} {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <textarea placeholder="描述你的問題...（例如：葉子下面有白白的點點是什麼？）"
          value={question} onChange={e => setQuestion(e.target.value)}
          rows={3}
          className="w-full rounded-xl px-3 py-2.5 text-sm bg-transparent outline-none resize-none"
          style={{ backgroundColor: '#F5F0EB', color: '#3D3530' }} />

        {photoDataUrl ? (
          <div className="relative">
            <img src={photoDataUrl} alt="" className="w-full h-40 object-cover rounded-xl" />
            <button onClick={() => setPhotoDataUrl(null)}
              className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs text-white"
              style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>✕</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => askPhotoInputRef.current?.click()}
              className="flex-1 rounded-xl py-2.5 text-sm flex items-center justify-center gap-2"
              style={{ backgroundColor: '#F5F0EB', color: '#8C7B72' }}>
              🖼️ 從相簿選擇
            </motion.button>
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => askCameraInputRef.current?.click()}
              className="flex-1 rounded-xl py-2.5 text-sm flex items-center justify-center gap-2"
              style={{ backgroundColor: '#F5F0EB', color: '#8C7B72' }}>
              📷 拍照
            </motion.button>
          </div>
        )}

        {sent && (
          <div className="rounded-xl px-3 py-2 text-center" style={{ backgroundColor: '#8FA88620' }}>
            <p className="text-sm" style={{ color: '#8FA886' }}>已送出！老師會盡快回覆你 ✨</p>
          </div>
        )}

        <motion.button whileTap={{ scale: 0.97 }} onClick={handleSend} disabled={sending || !question.trim()}
          className="w-full rounded-xl py-3 text-sm font-bold text-white"
          style={{ backgroundColor: sending ? '#B5AFA8' : '#C9A96E' }}>
          {sending ? '送出中...' : '送出提問'}
        </motion.button>
      </div>

      {/* 我的提問紀錄 */}
      {myQuestions.length > 0 && (
        <div>
          <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>我的提問</p>
          <div className="space-y-2.5">
            {myQuestions.map(q => (
              <div key={q.id} className="rounded-2xl p-3.5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span>{q.plantEmoji}</span>
                  <p className="text-xs font-medium" style={{ color: '#3D3530' }}>{q.plantName}</p>
                  <span className="px-1.5 py-0.5 rounded-lg text-xs"
                    style={{ backgroundColor: q.status === 'replied' ? '#8FA88620' : '#C9A96E20', color: q.status === 'replied' ? '#8FA886' : '#C9A96E' }}>
                    {q.status === 'replied' ? '已回覆' : '等待中'}
                  </span>
                </div>
                <p className="text-sm" style={{ color: '#3D3530' }}>{q.question}</p>
                {q.photoUrl && <img src={q.photoUrl} alt="" className="w-full h-32 object-cover rounded-xl mt-2" />}
                {q.reply && (
                  <div className="mt-2 rounded-xl px-3 py-2" style={{ backgroundColor: '#8FA88610' }}>
                    <p className="text-xs font-medium mb-1" style={{ color: '#8FA886' }}>老師回覆：</p>
                    <p className="text-sm leading-relaxed" style={{ color: '#3D3530' }}>{q.reply}</p>
                  </div>
                )}
                <p className="text-xs mt-2" style={{ color: '#B5AFA8' }}>{q.createdAt?.slice(0, 10)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ---- 老師後台 ----
function TeacherDashboardView({ userEmail, goBack }: {
  userEmail: string | null;
  goBack: () => void;
}) {
  const [questions, setQuestions] = useState<TeacherQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'replied'>('all');
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replying, setReplying] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'admin_questions'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() } as TeacherQuestion)));
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleReply = async (questionId: string) => {
    const text = replyText[questionId]?.trim();
    if (!text) return;
    setReplying(questionId);
    try {
      await updateDoc(doc(db, 'admin_questions', questionId), {
        reply: text,
        status: 'replied',
        repliedAt: new Date().toISOString(),
      });
      setReplyText(prev => ({ ...prev, [questionId]: '' }));
      hapticSuccess();
    } catch (e) { console.error(e); }
    setReplying(null);
  };

  const filtered = questions.filter(q => filterStatus === 'all' || q.status === filterStatus);
  const pendingCount = questions.filter(q => q.status === 'pending').length;

  if (userEmail !== ADMIN_EMAIL) {
    return (
      <motion.div className="space-y-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
        <motion.button whileTap={{ scale: 0.95 }} onClick={goBack} className="flex items-center gap-1 text-sm" style={{ color: '#C9A96E' }}>← 返回</motion.button>
        <div className="rounded-3xl p-8 text-center" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-sm" style={{ color: '#8C7B72' }}>無權限存取</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <div>
        <motion.button whileTap={{ scale: 0.95 }} onClick={goBack} className="flex items-center gap-1 text-sm mb-3" style={{ color: '#C9A96E' }}>← 返回</motion.button>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>📋 老師後台</h2>
        <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>
          共 {questions.length} 則提問{pendingCount > 0 && <span style={{ color: '#C9A96E' }}> · {pendingCount} 則待回覆</span>}
        </p>
      </div>

      {/* 篩選 */}
      <div className="flex gap-2">
        {[
          { key: 'all' as const, label: '全部' },
          { key: 'pending' as const, label: `待回覆 (${pendingCount})` },
          { key: 'replied' as const, label: '已回覆' },
        ].map(f => (
          <button key={f.key} onClick={() => setFilterStatus(f.key)}
            className="px-3 py-1.5 rounded-xl text-xs font-medium"
            style={{ backgroundColor: filterStatus === f.key ? '#C9A96E20' : '#F5F0EB', color: filterStatus === f.key ? '#C9A96E' : '#8C7B72' }}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: '#C9A96E', borderTopColor: 'transparent' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl p-8 text-center" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-sm" style={{ color: '#8C7B72' }}>沒有{filterStatus === 'pending' ? '待回覆的' : ''}提問</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(q => (
            <div key={q.id} className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: q.status === 'pending' ? '#C9A96E08' : '#FFFEF9' }}>
              {/* Header */}
              <div className="flex items-center gap-2 mb-2">
                <span>{q.plantEmoji}</span>
                <p className="text-xs font-bold" style={{ color: '#3D3530' }}>{q.plantName}</p>
                <span className="px-1.5 py-0.5 rounded-lg text-xs"
                  style={{ backgroundColor: q.status === 'replied' ? '#8FA88620' : '#C9A96E20', color: q.status === 'replied' ? '#8FA886' : '#C9A96E' }}>
                  {q.status === 'replied' ? '已回覆' : '待回覆'}
                </span>
                <p className="text-xs ml-auto" style={{ color: '#B5AFA8' }}>{q.createdAt?.slice(0, 10)}</p>
              </div>

              <p className="text-xs mb-1" style={{ color: '#8C7B72' }}>來自：{q.userEmail}</p>
              <p className="text-sm leading-relaxed" style={{ color: '#3D3530' }}>{q.question}</p>
              {q.photoUrl && <img src={q.photoUrl} alt="" className="w-full h-40 object-cover rounded-xl mt-2" />}

              {/* 已有回覆 */}
              {q.reply && (
                <div className="mt-2 rounded-xl px-3 py-2" style={{ backgroundColor: '#8FA88610' }}>
                  <p className="text-xs font-medium mb-1" style={{ color: '#8FA886' }}>你的回覆：</p>
                  <p className="text-sm leading-relaxed" style={{ color: '#3D3530' }}>{q.reply}</p>
                </div>
              )}

              {/* 回覆輸入框 */}
              {q.status === 'pending' && (
                <div className="mt-3 space-y-2">
                  <textarea placeholder="輸入回覆..."
                    value={replyText[q.id] || ''}
                    onChange={e => setReplyText(prev => ({ ...prev, [q.id]: e.target.value }))}
                    rows={2}
                    className="w-full rounded-xl px-3 py-2 text-sm bg-transparent outline-none resize-none"
                    style={{ backgroundColor: '#F5F0EB', color: '#3D3530' }} />
                  <motion.button whileTap={{ scale: 0.97 }}
                    onClick={() => handleReply(q.id)}
                    disabled={replying === q.id || !replyText[q.id]?.trim()}
                    className="rounded-xl px-4 py-2 text-xs font-bold text-white"
                    style={{ backgroundColor: replying === q.id ? '#B5AFA8' : '#8FA886' }}>
                    {replying === q.id ? '送出中...' : '送出回覆'}
                  </motion.button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ---- 知識文章小紅書風格 ----
function KnowledgeArticlesGridView({ userEmail, goBack }: {
  userEmail: string | null;
  goBack: () => void;
}) {
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null);
  const [subscribedTopics, setSubscribedTopics] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);

  // Load articles
  useEffect(() => {
    const q = query(collection(db, 'knowledge_articles'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setArticles(snap.docs.map(d => ({ id: d.id, ...d.data() } as KnowledgeArticle)));
      setLoading(false);
    });
    return unsub;
  }, []);

  // Load subscriptions & bookmarks
  useEffect(() => {
    if (!userEmail) return;
    const unsub = onSnapshot(doc(db, 'user_subscriptions', userEmail), (snap) => {
      if (snap.exists()) {
        setSubscribedTopics(snap.data().topics || []);
        setBookmarks(snap.data().bookmarks || []);
      }
    });
    return unsub;
  }, [userEmail]);

  const toggleSubscribe = async (topic: string) => {
    if (!userEmail) return;
    const newTopics = subscribedTopics.includes(topic)
      ? subscribedTopics.filter(t => t !== topic)
      : [...subscribedTopics, topic];
    setSubscribedTopics(newTopics);
    await setDoc(doc(db, 'user_subscriptions', userEmail), { topics: newTopics }, { merge: true });
  };

  const handleLike = async (articleId: string) => {
    if (!userEmail) return;
    await updateDoc(doc(db, 'knowledge_articles', articleId), { likeCount: increment(1) });
    try { await addDoc(collection(db, 'user_likes'), { userId: userEmail, itemId: articleId, itemType: 'article', likedAt: new Date().toISOString() }); } catch {}
    hapticLight();
  };

  const toggleBookmark = async (articleId: string) => {
    if (!userEmail) return;
    const newBookmarks = bookmarks.includes(articleId)
      ? bookmarks.filter(b => b !== articleId)
      : [...bookmarks, articleId];
    setBookmarks(newBookmarks);
    await setDoc(doc(db, 'user_subscriptions', userEmail), { bookmarks: newBookmarks }, { merge: true });
    hapticLight();
  };

  const filtered = selectedTopic === 'all' ? articles : articles.filter(a => a.topic === selectedTopic);

  // 內建範例文章（當 Firestore 無資料時顯示）
  const sampleArticles: KnowledgeArticle[] = [
    // 植栽
    { id: 'sa-1', title: '多肉換盆的最佳時機', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2023/01/798736.jpg', coverThumbUrl: 'https://xiabenhow.com/wp-content/uploads/2023/01/798736.jpg', topic: 'plant', summary: '春秋兩季是最適合換盆的時機，幫助根系恢復、讓多肉長得更健康', content: '你有沒有發現，你的多肉最近好像有點「委屈」？葉片沒以前飽滿、生長速度變慢、甚至根從盆底竄出來？那就是它在告訴你：該換新家了。\n\n最佳換盆時間是春季（3-5月）和秋季（9-11月），這兩個季節溫度穩定在15-25°C之間，多肉的根系活性最強，換盆後恢復速度最快。夏季高溫時根系容易受傷後腐爛，冬季低溫時植物進入休眠期代謝緩慢，都不適合動根。\n\n換盆的完整步驟：\n\n第一步，提前3-5天停止澆水，讓土壤充分乾燥。乾燥的土壤更容易脫落，也減少拔出時傷根的機率。\n\n第二步，輕輕倒扣花盆，用手指從底孔推出土球。如果卡住了，可以用竹籤沿盆壁鬆動。千萬不要硬拔，耐心是最好的園藝工具。\n\n第三步，抖掉老土，仔細觀察根系狀態。健康的根應該是白色或淺棕色的，如果發現黑色的腐根或乾枯的死根，用乾淨的剪刀修剪掉。\n\n第四步，這一步很關鍵——晾根。把修剪後的多肉放在陰涼通風處晾1-2天，讓傷口自然癒合形成保護層。這就像我們受傷後讓傷口結痂一樣。\n\n第五步，準備新盆新土。盆底放一層顆粒土（赤玉土或麥飯石）幫助排水，上面鋪混合土（泥炭土:珍珠岩:顆粒土 = 1:1:1），把植株放入後輕填土固定。\n\n第六步，放在散射光處3-5天後，再開始少量澆水。這段時間就是讓它安靜適應新環境的「療養期」。\n\n記住，每次換盆都是你和植物之間的一次對話。慢慢來，它能感受到你的用心。', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-03-20' },
    { id: 'sa-2', title: '葉插繁殖全攻略', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2023/01/798735.jpg', coverThumbUrl: 'https://xiabenhow.com/wp-content/uploads/2023/01/798735.jpg', topic: 'plant', summary: '用一片葉子就能種出一盆新多肉——這大概是園藝裡最有魔法的事', content: '想像一下，從一棵多肉上摘下一片葉子，三週後它就長出了自己的小根和小芽，變成一株全新的生命。這不是什麼神奇魔法，而是多肉植物最迷人的天賦——葉插繁殖。\n\n這個過程其實呼應了一個很美的概念：生命的韌性。即使只是一小片葉子，只要有適當的環境和耐心，它就能重新開始。\n\n選葉很重要。挑選靠近植株中段、飽滿健康的葉片。太嫩的頂端葉片養分不足，太老的底部葉片活力不夠。用手輕輕左右搖動摘下，確保蒂頭完整——蒂頭就是葉片連接莖的那個小小月牙形，新芽會從那裡萌出。\n\n晾葉是容易被忽略但很關鍵的步驟。摘下的葉片放在乾燥通風處晾1-2天，讓傷口形成一層薄膜（愈傷組織）。如果傷口還是濕潤的就放到土上，很容易感染黑腐。\n\n擺放方式有講究。把葉片平放在微濕的介質表面（赤玉土、珍珠岩都可以），蒂頭朝上不要插入土裡。放在明亮但沒有直射陽光的地方，直射光會曬傷還沒生根的葉片。\n\n接下來就是最考驗耐心的部分——等待。大約5-7天會開始冒出粉色的小根，2-3週會長出米粒大小的芽。在這段時間，每3-4天用噴霧輕噴介質表面，保持微濕即可，千萬不要澆透。\n\n有些品種的成功率可以到80%以上（像是朧月、姬朧月、黛比），有些則比較難（像是玉露、萬象）。所以多試幾片，總會有驚喜。\n\n當小苗長到硬幣大小時，就可以移到小盆裡正式養護了。那個時候母葉會慢慢乾枯——它把所有的養分都給了新生命。\n\n這不就是自然界最溫柔的傳承嗎？', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-03-08' },
    { id: 'sa-3', title: '微景觀組盆的配色美學', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2023/01/1009941_0.jpg', coverThumbUrl: 'https://xiabenhow.com/wp-content/uploads/2023/01/1009941_0.jpg', topic: 'plant', summary: '組盆不只是把多肉放在一起，學會配色原則讓你的作品立刻升級', content: '組盆是一門小小的藝術，它把園藝和美學結合在一起。很多人做出的組盆看起來「說不上哪裡不對」，其實問題往往出在配色和構圖上。\n\n色彩學在組盆中的應用：\n\n漸層法是最安全也最優雅的配色方式。選同色系但深淺不同的品種，像是從淺粉到深紫的系列——白牡丹（淺綠白）搭初戀（粉紫）再到紫珍珠（深紫），這樣的漸層讓視覺自然過渡，不會突兀。\n\n對比法適合想要作品更有視覺張力的人。在色輪上互補的顏色搭配起來最有衝擊力：紫色系（紫珍珠）配黃綠色系（黃金萬年草），或者紅色系（火祭）搭藍綠色系（薄雪萬年草）。\n\n點綴法是進階技巧。大面積使用柔和的同色系打底（比如各種綠色系），然後放一小株色彩鮮明的品種當視覺焦點——就像一幅畫中的「畫眼」。\n\n構圖原則同樣重要：\n\n高低層次——把高的直立型品種（像是虹之玉、乙女心）放後方，蓮座型的放中間，匍匐型的（佛甲草、薄雪萬年草）放在盆邊讓它自然垂下。\n\n黃金比例——主角不要放在正中央，稍微偏一側（約三分之一處），這樣構圖更生動。\n\n留白的藝術——千萬不要塞太滿！適當的土面留白或搭配小石子，讓每株多肉有「呼吸空間」，視覺上更舒服。\n\n最後一個小秘訣：在組好的盆面上鋪一層鋪面石（白色麥飯石或赤玉土），整體質感會瞬間提升好幾個檔次。就像化妝最後的定妝一樣重要。', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-03-05' },
    // 調香
    { id: 'sa-4', title: '居家擴香的五個小秘密', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2025/03/精油芳療滾珠瓶5.jpg', coverThumbUrl: 'https://xiabenhow.com/wp-content/uploads/2025/03/精油芳療滾珠瓶5.jpg', topic: 'fragrance', summary: '讓空間充滿療癒香氣，其實有一些你可能不知道的小細節', content: '氣味是直接連結大腦邊緣系統的感官——它不需要經過理性思考，就能影響你的情緒和記憶。這就是為什麼聞到某個香味會突然想起某個場景、某個人。善用擴香，你可以主動為家裡創造一個「情緒錨點」。\n\n秘密一：不同空間需要不同的香氣人格\n\n客廳是你和家人、朋友共處的空間，適合明亮、開放的香氣——甜橙、佛手柑、葡萄柚這些柑橘類精油能提振精神又不過於強烈。臥室是你放鬆入眠的聖地，薰衣草（真正薰衣草 Lavandula angustifolia）是公認最有效的助眠精油，搭配雪松或岩蘭草更有層次。書房適合迷迭香搭配薄荷，研究顯示迷迭香的香氣成分1,8-桉葉素能提升記憶力和專注力。\n\n秘密二：擴香石的正確使用方式\n\n很多人把精油滴上去就不管了。其實每次滴3-5滴就夠了（多滴不會更香，只會浪費），等第一次的香味完全消散後再滴第二次。擴香石放在進門處、床頭或冷氣出風口附近效果最好。\n\n秘密三：季節搭配法則\n\n夏天選擇清爽上揚的香氣——薄荷、尤加利、檸檬草，給人降溫的感覺。冬天選溫暖擁抱感的香氣——雪松、檀香、肉桂、乳香，讓冷冷的日子多一份暖意。換季時混搭，像是初秋可以用佛手柑（清新）加雪松（溫暖），過渡非常自然。\n\n秘密四：不要同時擴散超過三種香氣\n\n在同一個空間裡，最多混合2-3種精油就好。太多種類的香氣混在一起會變得混濁，反而失去療癒效果。\n\n秘密五：你的嗅覺會疲勞\n\n在同一個香氛環境待超過30分鐘，你可能覺得「好像不香了？」這不是精油失效，而是嗅覺適應（olfactory adaptation）——大腦自動降低了對持續刺激的敏感度。離開那個空間一會兒再回來，你就會重新聞到了。', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-03-18' },
    { id: 'sa-5', title: '認識前中後調：調香入門', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2025/03/精油芳療滾珠瓶4.jpg', coverThumbUrl: 'https://xiabenhow.com/wp-content/uploads/2025/03/精油芳療滾珠瓶4.jpg', topic: 'fragrance', summary: '前調清新、中調溫柔、後調深邃——三段式結構創造出完美的嗅覺旅程', content: '調香就像在寫一首音樂。前調是開場的旋律，中調是故事的主題，後調是餘韻和結尾。每一段都有自己的角色，三者搭配得宜，才能創造一個完整的嗅覺體驗。\n\n前調（Top Notes）——第一印象\n\n前調是你聞到香水的第一個印象，通常在15-30分鐘內會漸漸消散。這些是分子量小、揮發速度快的精油：柑橘類（佛手柑、甜橙、檸檬）、薄荷、尤加利。前調決定了別人靠近你的第一感覺——是清爽？是甜美？還是神秘？\n\n中調（Middle Notes / Heart Notes）——故事的心臟\n\n中調才是一支香水真正的「靈魂」。它在前調消散後浮現，持續2-4小時。花香系（玫瑰、茉莉、依蘭依蘭）、草本系（薰衣草、天竺葵、快樂鼠尾草）、辛香系（肉桂、丁香）都屬於中調。中調佔整體香水配方的40-60%。\n\n後調（Base Notes）——深沉的底蘊\n\n後調像是一首歌曲最後的和弦，在中調消散後緩慢浮現，能持續6小時甚至更久。木質調（雪松、檀香、花梨木）、樹脂調（乳香、沒藥、安息香）、動物調（麝香、龍涎香）都是典型的後調。後調的作用是讓整個香氣有「根」、有重量感。\n\n建議配方比例：前調15-25%、中調30-40%、後調30-40%\n\n新手入門配方推薦：\n- 清新型：佛手柑(前) + 薰衣草(中) + 雪松(後)\n- 甜美型：甜橙(前) + 依蘭依蘭(中) + 香草(後)\n- 沉穩型：佛手柑(前) + 天竺葵(中) + 檀香(後)\n\n調香的過程本身就是一種冥想。當你專注在不同的香氣之間尋找平衡時，外面的世界會暫時安靜下來。', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-03-01' },
    // 水晶
    { id: 'sa-6', title: '水晶手鍊斷了怎麼辦？', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2026/03/1043595_0.jpg', coverThumbUrl: 'https://xiabenhow.com/wp-content/uploads/2026/03/1043595_0.jpg', topic: 'crystal', summary: '手鍊斷裂不用驚慌——它可能正在告訴你一些事', content: '水晶手鍊突然斷了，很多人第一反應是「是不是有什麼不好的事？」其實從實用角度來說，彈力線使用久了自然會老化、氧化而失去彈性，加上日常摩擦和拉扯，斷裂只是材質壽命到了。\n\n但在水晶療癒的觀點中，也有一個溫柔的說法：手鍊斷裂可能代表它已經完成了在這個階段對你的陪伴。無論你相信哪一種，最實際的做法是——修好它，讓它繼續陪你。\n\n自己修復的步驟：\n\n準備工具：0.8mm 透明彈力線（水晶專用）、剪刀、打火機（或透明膠水）、一個淺盤子（防止珠子滾走）。\n\n第一步，把所有珠子按照原來的順序排好在盤子裡。如果你記不得順序，也沒關係——這是一個重新設計排列的好機會。\n\n第二步，量出手腕周長再加上10公分的線長，用剪刀剪下。\n\n第三步，在線的一端打一個臨時結（或用膠帶固定），開始穿珠子。穿的時候注意方向，有些珠子有天然紋路的正反面。\n\n第四步，全部穿好後，把兩端拉緊對齊，打2-3個外科結（就是普通結打兩圈再拉緊）。結要緊但不要太用力，否則線容易在結點斷裂。\n\n第五步，用打火機的火焰快速掃過結點（不要燒太久！），讓彈力線微微融化固定。然後把多餘的線頭剪短，塞進最近的珠子孔裡。\n\n保養小撇步：每3-6個月可以把手鍊拆下來重新穿線，就像定期保養一樣。洗澡、游泳、運動時記得摘下來，水和汗液都會加速彈力線老化。\n\n如果你不想自己動手，帶回隨手作工作室，我們幫你免費穿線。', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-03-15' },
    { id: 'sa-7', title: '生命靈數與水晶的搭配', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2026/03/1043594_0.jpg', coverThumbUrl: 'https://xiabenhow.com/wp-content/uploads/2026/03/1043594_0.jpg', topic: 'crystal', summary: '根據你的出生日期，找到與你頻率共振的水晶', content: '生命靈數是古老的數字命理學之一，把你的出生年月日所有數字相加，直到剩下一個個位數，就是你的生命靈數。比如1990年5月12日：1+9+9+0+5+1+2 = 27 → 2+7 = 9，靈數就是9。\n\n每個靈數都對應著特定的人格特質和能量需求，而不同的水晶剛好能補充或強化這些能量：\n\n1號人——領導者｜虎眼石\n你有強烈的獨立意識和領導力，但有時會過於固執。虎眼石的金棕色光澤象徵著大地的穩定力量，能幫你在堅持自我的同時保持靈活。戴在右手，增強行動力。\n\n2號人——和平者｜月光石\n你天生敏感、善解人意，是人群中的安撫者。月光石散發著溫柔的藍色光暈，能增進你的直覺力，同時保護你的敏感不被過度消耗。戴在左手，接收月亮的柔和能量。\n\n3號人——表達者｜黃水晶\n你充滿創造力和表達欲，是天生的藝術家。黃水晶（Citrine）是「太陽石」，它明亮的能量能激發你的靈感，同時帶來樂觀和自信。放在工作桌上，創作時特別有幫助。\n\n4號人——建構者｜黑曜石\n你踏實、有責任感，但容易承擔太多壓力。黑曜石是最強的保護石之一，能吸收負面能量、幫你建立健康的界限。隨身攜帶或放在枕頭下。\n\n5號人——自由者｜海藍寶\n你渴望自由、熱愛冒險。海藍寶的清澈藍色像大海一樣開闊，能增強你的溝通能力和勇氣，同時幫你在自由與責任之間找到平衡。\n\n6號人——照顧者｜粉晶\n你是天生的照顧者，但常常忘了照顧自己。粉晶是「愛的石頭」，它不只能吸引愛情，更重要的是提醒你：自愛是一切愛的起點。\n\n7號人——探索者｜紫水晶\n你有深度的思考能力和靈性傾向。紫水晶開啟第三眼（眉心輪），增強直覺和洞察力。冥想時握著紫水晶，會幫助你進入更深的寧靜。\n\n8號人——成就者｜綠幽靈\n你有強大的企圖心和實現目標的能力。綠幽靈水晶的綠色幻影代表著成長和豐盛的能量，是公認的「財富之石」。戴在左手接收豐盛能量。\n\n9號人——奉獻者｜白水晶\n你有博大的愛和服務他人的渴望。白水晶是「萬能水晶」，它純淨的能量能放大你的善意，同時幫你淨化環境中的混亂能量。', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-02-28' },
    // 蠟燭
    { id: 'sa-8', title: '蠟燭第一次點燃很重要', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2025/03/705960_0.jpg', coverThumbUrl: 'https://xiabenhow.com/wp-content/uploads/2025/03/705960_0.jpg', topic: 'candle', summary: '蠟燭也有「記憶」——第一次點燃的方式會決定它往後的表現', content: '你知道蠟燭有「記憶」嗎？這不是什麼玄學，而是蠟的物理特性。蠟燭在第一次燃燒時形成的蠟池範圍，會成為它之後每次燃燒的「記憶邊界」。這個現象叫做「蠟燭隧道效應」（Candle Tunneling）。\n\n如果你第一次點蠟燭時只燒了20分鐘就吹熄，蠟池只擴展到燭芯周圍一小圈，那之後無論你燒多久，蠟的融化範圍都不會超過那個圈。結果就是——蠟燭中間燒出一個深深的隧道，周圍留下大量沒有被利用的蠟。白白浪費了你親手做的作品。\n\n正確的第一次：\n\n第一次點燃時，確保有足夠的時間（通常1-2小時）讓蠟池完全擴展到容器邊緣。大豆蠟的融點較低（約46-52°C），擴展速度會比石蠟快一些。你可以偶爾看一下，當整個表面都變成均勻的液態蠟時，就可以熄滅了。\n\n日常使用的小知識：\n\n修剪燭芯——每次點燃前把燭芯修到0.5-0.8公分。太長的燭芯會產生黑煙和蘑菇頭（碳球），太短則可能被融化的蠟淹沒而熄滅。專業的燭芯剪是最好用的工具。\n\n控制燃燒時間——單次不要超過4小時。長時間燃燒會讓容器過熱，不僅危險也會影響精油的香氣品質（高溫會加速精油揮發，前調的清新感會消失）。\n\n熄滅的方式——不要直接吹！用滅燭器或蓋子蓋住（斷氧熄滅），或用金屬工具把燭芯按入蠟池再拉起。這樣可以避免產生黑煙和蠟液飛濺，下次點燃也更容易。\n\n存放注意——遠離陽光直射和高溫環境。大豆蠟的融點低，夏天擺在窗邊可能會自己軟化變形。不點的時候蓋上蓋子，防止灰塵沉積和香味提前散逸。\n\n蠟燭是最有儀式感的療癒工具之一。點亮的那一刻，你就在為自己創造一個安靜的結界。', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-03-12' },
    { id: 'sa-9', title: '大豆蠟 vs 蜂蠟 vs 石蠟', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2025/03/705959_0.jpg', coverThumbUrl: 'https://xiabenhow.com/wp-content/uploads/2025/03/705959_0.jpg', topic: 'candle', summary: '你的蠟燭是什麼材質做的？不同蠟材的優缺點一次看懂', content: '選擇蠟材就像選擇料理的食材——每一種都有自己的個性，適合不同的用途和需求。\n\n大豆蠟（Soy Wax）——環保派的首選\n大豆蠟萃取自天然大豆油，是100%可再生的植物性蠟材。它燃燒乾淨，幾乎不產生黑煙和有害物質，蠟漬也很容易用溫水清洗。大豆蠟的融點較低（46-52°C），釋放香氣的溫度也低，適合搭配精油使用。不過它凝固後表面可能出現不平整的「霜花」，這是天然特徵不是瑕疵。最適合做容器蠟燭。隨手作工作室使用的就是大豆蠟。\n\n蜂蠟（Beeswax）——大自然的禮物\n蜂蠟是蜜蜂築巢時分泌的天然蠟質，帶有淡淡的蜂蜜甜香。它的融點最高（62-65°C），燃燒時間也最長。更特別的是，蜂蠟燃燒時會釋放負離子，能中和空氣中的灰塵和過敏原。缺點是價格較高，且因為本身有香味，不太適合做加香蠟燭。最適合做柱狀蠟燭和蜂巢造型蠟燭。\n\n石蠟（Paraffin Wax）——商業蠟燭的主力\n石蠟是石油精煉的副產品，歷史最悠久也最便宜。它的優點是色彩鮮豔（吃色性好）、表面光滑、穩定性高。但燃燒時可能產生微量的苯和甲苯等有害物質。通風良好的環境下使用是安全的，但如果你或家人有呼吸敏感的問題，建議改用植物性蠟材。\n\n椰子蠟（Coconut Wax）——新寵兒\n椰子蠟質地柔軟如奶油，擴香效果是所有蠟材中最好的，燃燒非常均勻。缺點是融點極低（35-40°C），夏天容易軟化，通常需要和大豆蠟或蜂蠟混合使用。高級香氛品牌越來越多採用椰子蠟混合配方。\n\n選擇建議：如果你注重環保和健康，選大豆蠟；如果喜歡天然蜂蜜香氣和長燃時間，選蜂蠟；如果追求最佳擴香效果，選椰子蠟混合配方。', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-02-25' },
    // 皮革
    { id: 'sa-10', title: '皮革作品的日常保養指南', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2026/03/1033816_0.jpg', coverThumbUrl: 'https://xiabenhow.com/wp-content/uploads/2026/03/1033816_0.jpg', topic: 'leather', summary: '好好照顧你的皮革——它會用時間回報你一份獨一無二的光澤', content: '皮革是有生命力的材質。不同於塑膠或金屬製品會越用越舊，真皮在使用和保養的過程中會產生「養皮」效果——顏色會逐漸加深、光澤會越來越溫潤，手感也會變得更加柔軟。日本人把這種變化稱為「エイジング」（aging），中文叫「包漿」。那是時間和使用痕跡交織出的獨特美感。\n\n日常清潔\n每週用乾淨的柔軟棉布輕輕擦拭皮面，帶走灰塵和油脂。不要用面紙（會留下纖維），也不要用濕巾（含有化學成分可能損傷皮面）。如果有輕微髒污，用微濕的棉布以圓弧方式輕拭，然後立刻用乾布吸乾水分。\n\n防潮保護\n皮革最怕兩件事：過度潮濕和過度乾燥。台灣的梅雨季和夏天特別需要注意。不使用時放在通風良好的地方，可以放防潮袋但不要直接接觸皮面。如果不小心淋到雨，用乾布輕壓吸水（不要擦！），然後放在陰涼處自然風乾，千萬不要用吹風機或放在陽光下曬——高溫會讓皮革收縮變硬。\n\n上油保養\n每1-3個月用皮革專用保養油（推薦貂油或荷荷巴油基底的保養油）薄薄塗一層。重點是「薄塗」——取黃豆大小的油，先在棉布上均勻推開，再以圓弧方式塗抹在整個皮面上。塗完後靜置15-30分鐘讓皮革吸收，再用乾淨棉布輕輕拋光。\n\n絕對要避免的事\n長時間日曬（紫外線會讓皮革褪色龜裂）；接觸酒精、香水、化妝品（會溶解皮革表面的油脂保護層）；用力摩擦（會破壞皮紋結構）；放在密封塑膠袋裡（皮革需要呼吸）。\n\n你在隨手作做的皮革作品，承載著那個下午你專注打洞、穿線的記憶。好好養護它，每次看到上面的使用痕跡，都是你和它一起走過的日子。', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-03-10' },
    { id: 'sa-11', title: '手縫皮革的基本針法', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2026/03/1033815_0.jpg', coverThumbUrl: 'https://xiabenhow.com/wp-content/uploads/2026/03/1033815_0.jpg', topic: 'leather', summary: '鞍針縫法是手作皮革的靈魂——一針一線都是專注的練習', content: '手縫皮革使用的「鞍針縫法」（Saddle Stitch）已經有幾百年的歷史。它是目前所有皮革縫合方法中最堅固的一種，比機器車縫更耐用。原因很簡單：機縫是一條線在上下交叉形成鏈鎖式結構，一旦某一點斷了，整條縫線會像拉鏈一樣散開。而手縫是兩條線獨立穿過同一個孔，即使斷了一針，其他針腳依然牢固。\n\n工具準備\n菱斬（打洞工具，有2齒和4齒可選）、蠟線（麻線或尼龍線，先過蠟增加滑順度和防水性）、兩支圓頭皮革手縫針、木槌、橡膠墊。\n\n打洞是基礎\n用菱斬沿著你的縫合線打洞，保持垂直和等距。打洞時先用4齒菱斬打出參考線，最後一齒對準上一組最後一個洞繼續打，這樣孔距才會一致。轉角處改用2齒菱斬，更容易控制方向。\n\n穿線技巧\n量出縫合長度的3.5倍線長，兩端各穿一支針。穿針後把針穿過線的中間（不是打結），這樣針不會在縫的過程中脫落。\n\n縫合步驟\n1. 從第一個洞的正面穿入第一支針，拉到兩邊等長。\n2. 第二支針從同一個洞的背面穿入。這時候注意：始終讓同一支針（比如右手針）在另一支針的上方穿過。\n3. 兩邊均勻拉緊。拉線的力道要一致——太鬆縫線會鬆垮，太緊皮革會皺縮。\n4. 重複到最後一個洞，回縫2-3針固定。\n\n最重要的心法：不要急。手縫皮革的魅力就在於那個緩慢而有節奏的過程。針穿入、線拉緊、下一針。這個重複的動作會讓你的呼吸自然變慢、注意力自然集中，就像一種動態的冥想。\n\n每一個整齊均勻的針腳背後，都是你那天的專注和耐心。這就是手作比機器更有溫度的原因。', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-02-20' },
    // 手工皂
    { id: 'sa-12', title: '手工皂的熟成等待', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2023/08/e6898be4bd9cdiye69d90e.jpg', coverThumbUrl: 'https://xiabenhow.com/wp-content/uploads/2023/08/e6898be4bd9cdiye69d90e.jpg', topic: 'soap', summary: '為什麼手工皂要等4-6週？因為美好的事物值得等待', content: '剛從模具裡取出的手工皂看起來已經很完美了——光滑的表面、美麗的花紋。但如果你急著用，會發現它洗起來刺刺的，泡沫也不夠綿密。這是因為「皂化反應」還在進行中。\n\n什麼是皂化反應？\n手工皂的製作原理是：油脂 + 氫氧化鈉（鹼） → 皂 + 甘油。這個化學反應叫「皂化」。在脫模的時候，大約有80%的油鹼已經轉化成皂，但剩下的20%還需要時間慢慢完成。\n\n熟成期間發生了什麼？\n第1-2週：殘餘的氫氧化鈉繼續和油脂反應，pH值逐漸從12-13（強鹼）降低。皂體開始排出多餘水分，質地變硬。\n第3-4週：皂化反應接近完成，pH值降到9-10左右。皂的結晶結構更加穩定，泡沫開始變得細緻綿密。\n第5-6週：理想的使用時機。pH值穩定在8-9（接近皮膚可接受的範圍），洗感溫和、泡沫豐富，香氣也更加圓潤。\n\n正確的熟成方式\n放在通風、陰涼、避光的地方。底部墊一層烘焙紙或晾皂架，讓空氣能從底部流通。每週翻面一次，讓乾燥更均勻。如果是多塊一起晾，之間要保持至少2公分的間距。\n\n如何判斷熟成完畢？\n外觀——表面乾燥不黏手，切面顏色均勻（沒有透明的未皂化油斑）。\n觸感——用手指輕壓，質地堅實不軟爛。\n試紙——用pH試紙測試，數值在9以下。\n舌尖測試（傳統方法）——用舌尖輕觸皂的表面，如果感到麻麻的刺激，代表鹼性還太高。如果沒有刺激感，就可以安心使用了。\n\n等待是手工皂最有溫度的一部分。在那4-6週裡，你每次路過看到它們靜靜躺在架上慢慢變化，其實就是在見證一個「從混亂到穩定」的過程——某種程度上，也像是我們自己的療癒旅程。', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-03-06' },
    { id: 'sa-13', title: '手工皂添加物指南', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2022/02/LINE_ALBUM_1108-花圈皂_220706.jpg', coverThumbUrl: 'https://xiabenhow.com/wp-content/uploads/2022/02/LINE_ALBUM_1108-花圈皂_220706.jpg', topic: 'soap', summary: '花草、精油、色粉——讓你的手工皂更美更香更好用的秘密', content: '基礎的手工皂已經很好用了，但加入不同的添加物可以讓它變得更特別——不只是外觀上的美，也能增加功能性。\n\n花草入皂的浪漫與現實\n想像把漂亮的乾燥花瓣嵌入透明的皂裡，是不是很浪漫？現實是，大部分花材入皂後會因為鹼性環境而變色——紅玫瑰會變褐色，薰衣草會變灰綠色。所以花材建議只做表面裝飾，撒在皂的頂部，不要混入皂液裡。少數耐鹼的花材：金盞花（能保持黃色）、矢車菊（保持藍色但會褪）。\n\n精油選擇與用量\n精油的添加量通常是油脂總重的2-3%。但不是所有精油都適合入皂。\n新手推薦：薰衣草（溫和百搭、香氣穩定）、茶樹（天然抗菌、適合油性肌膚）、甜橙（心情愉悅，但香氣消散較快）。\n進階選擇：廣藿香（earthy深邃、定香效果好）、迷迭香（清新提神）、依蘭依蘭（花香甜美）。\n注意事項：柑橘類精油有光敏性，做成的皂建議在室內使用或晚間使用。\n\n天然色粉讓手工皂穿上美麗外衣\n可可粉——溫暖的巧克力棕色，帶有淡淡可可香。\n抹茶粉——清新的草綠色（但放久會褪色變土黃，加入維他命E可延緩）。\n紫草根粉——從淡紫到深紫，是最受歡迎的天然紫色來源。\n薑黃粉——明亮的黃色，薑黃素有抗發炎的保養功效。\n備長炭粉——深黑色，有很好的吸附力，適合做潔面皂。\n\n礦泥——功能性添加物\n法國綠泥：深層清潔控油，適合油性肌膚。\n粉紅泥：溫和去角質，適合敏感肌膚。\n白高嶺土：最溫和的黏土，增加皂的滑順感。\n\n一個小提醒：每次只嘗試一種新的添加物，這樣才能清楚知道效果如何。手工皂的美在於每一塊都是你的實驗和記錄。', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-02-22' },
    // 花藝
    { id: 'sa-14', title: '鮮花買回家怎麼養更久？', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2023/10/1052600.jpg', coverThumbUrl: 'https://xiabenhow.com/wp-content/uploads/2023/10/1052600.jpg', topic: 'floral', summary: '五個延長花期的實用技巧，讓一束花陪你更久', content: '花市買回來的鮮花，有些人養三天就凋了，有些人卻能養超過兩週。差別往往在那些小小的細節裡。\n\n技巧一：斜切花莖，製造最大吸水面\n回家後第一件事就是重新修剪花莖——在水中以45度角斜切。為什麼要在水中？因為花莖切口暴露在空氣中時會形成氣栓（air embolism），阻礙水分吸收。在水裡剪，氣泡進不去。每2-3天重新修剪一次，每次剪掉1-2公分。\n\n技巧二：換水是最重要的日常\n每天換水是延長花期最有效的方法，沒有之一。舊水裡的細菌會堵塞花莖的導管。換水時順便清洗花瓶內壁（用刷子刷掉那層滑滑的生物膜）。如果加了保鮮劑，可以2天換一次。\n\n自製保鮮劑：500ml的水 + 半茶匙糖（提供養分） + 幾滴白醋或漂白水（抑制細菌）。\n\n技巧三：去除水面以下所有葉片\n任何浸泡在水中的葉片都會迅速腐敗，成為細菌的培養皿。把水位以下的葉子全部摘掉，可能的話連水位以上5公分的也摘。這不是虐待花，而是幫助它把養分集中在花朵上。\n\n技巧四：位置比你想的更重要\n遠離水果。水果（尤其是蘋果和香蕉）會釋放乙烯（ethylene），這是一種「催熟荷爾蒙」，會加速花朵衰老。也要遠離陽光直射、暖氣出風口和電器散熱處。陰涼通風的桌面是最好的位置。\n\n技巧五：不同花材不同照顧\n玫瑰——喜歡溫水（25-30°C），溫水的分子運動快，更容易被吸收。但開放後改用冷水延緩盛放。\n百合——花苞打開後，記得用紙巾摘掉花蕊（雄蕊上的花粉囊），否則花粉掉在花瓣和桌面上會留下難以清洗的橘色痕跡。\n繡球——整株花朝下泡在水裡「急救」2小時可以救活已經垂頭的繡球。繡球的花瓣本身就能吸水。\n\n鮮花雖然終究會凋謝，但在它開放的每一天，都為你的空間帶來了一點不同的生命力。', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-03-14' },
    { id: 'sa-15', title: '乾燥花製作入門', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2023/10/1052599.jpg', coverThumbUrl: 'https://xiabenhow.com/wp-content/uploads/2023/10/1052599.jpg', topic: 'floral', summary: '把花的美凝結在時間裡——三種在家就能做的乾燥花方法', content: '鮮花的美是短暫的，但乾燥花把那份美停留在了某一刻。做乾燥花不需要特殊設備，在家就能完成，而且過程本身也是一種療癒。\n\n方法一：自然風乾法（最簡單、最推薦新手）\n\n把花束用麻繩或橡皮筋綁好（注意花莖乾燥後會縮小，用橡皮筋比較不會鬆脫），倒掛在通風良好、避免陽光直射的地方。廚房和浴室因為濕氣重，不適合。玄關的掛鉤、書房的層架都是好地方。\n\n等待1-2週，花材完全乾燥後就完成了。適合的花材：滿天星、尤加利葉、薰衣草、棉花、蠟菊。這些花材水分含量低，乾燥後形態變化小。\n\n方法二：矽膠乾燥法（保色效果最好）\n\n在密封容器底部鋪一層矽膠乾燥劑（藥局或網路都買得到），把花朵正面朝上放在上面，再小心地用湯匙把矽膠倒入花瓣之間的縫隙，直到完全覆蓋。密封後等3-7天。\n\n這個方法最大的優點是保色和保型。玫瑰乾燥後還能維持原有的紅色和立體形狀，幾乎像是時間停止了一樣。矽膠可以反覆使用，用烤箱低溫烘烤後就能再次吸濕。\n\n方法三：壓花法（最有文藝感）\n\n把花材和葉子放在兩張吸水紙之間，再放入厚重的書本裡壓平。每隔2-3天換一次吸水紙（排除多餘水分），大約2-3週就完成了。\n\n壓花適合用來做：手帳裝飾、手機殼、書籤、卡片、相框畫。小雛菊、三葉草、蕨類葉片壓出來特別好看。\n\n小秘訣：在花朵半開的時候就開始乾燥處理，效果比全開時好。全開的花瓣更脆弱，乾燥過程中容易掉落。\n\n把一束鮮花變成乾燥花，其實也是一種「轉化」的練習。不是所有美好都必須永恆，而是學會在不同的狀態下，找到不同的美。', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-02-15' },
    // 樹脂
    { id: 'sa-16', title: 'UV 樹脂 vs 環氧樹脂：怎麼選？', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2021/04/1010233_0.jpg', coverThumbUrl: 'https://xiabenhow.com/wp-content/uploads/2021/04/1010233_0.jpg', topic: 'resin', summary: '兩種樹脂各有優缺點，選對了才能做出理想的作品', content: '樹脂工藝可以把花瓣、亮粉、小配件封存在晶透的琥珀色中，做出像小宇宙一樣的飾品。但面對UV樹脂和環氧樹脂兩種選擇，新手常常一頭霧水。\n\nUV 樹脂——快速入門的好夥伴\n\nUV樹脂是單液型膠體，擠出來就能用，不需要混合。塗在作品上後用UV燈照射2-5分鐘就會硬化。整個過程從開始到完成可能不到30分鐘，非常適合性急的朋友和入門體驗。\n\n適合的作品：耳環、戒指、吊飾、手機殼裝飾等小型薄層作品。每層厚度不要超過3mm，太厚的話紫外線照不透，中間會留下未硬化的軟心。所以做厚實的作品需要分層操作——塗一層、照一次、再塗一層。\n\n缺點：價格較高（以克計價），長期曝曬陽光可能會泛黃，不適合做大件作品。\n\n環氧樹脂（AB膠）——專業級的選擇\n\n環氧樹脂需要把A劑（樹脂）和B劑（硬化劑）按照精確的比例混合（通常是1:1或2:1，看品牌），混合後緩慢硬化，完全固化需要24-48小時。\n\n最大的優點是可以一次灌注大面積、厚層的作品——像是海洋波浪畫、桌面塗層、大型標本封存。透明度也比UV樹脂更高，成品更加晶瑩剔透。\n\n缺點：操作時間長、需要精確計量（比例不對會不硬化或發黃）、固化期間不能移動。\n\n兩者通用的安全須知：\n一定要戴手套操作。樹脂未硬化前是化學物質，長期皮膚接觸可能引起過敏。保持環境通風。氣泡是大敵——混合後靜置幾分鐘讓大氣泡浮出，小氣泡可以用熱風槍或打火機快速掃過表面消除。\n\n新手建議從UV樹脂開始，等熟悉操作流程後再挑戰環氧樹脂。', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-03-03' },
    // 擴香石
    { id: 'sa-17', title: '擴香石的正確使用方式', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2023/12/611782-1.jpg', coverThumbUrl: 'https://xiabenhow.com/wp-content/uploads/2023/12/611782-1.jpg', topic: 'diffuser', summary: '你的擴香石可能沒有發揮全部的實力——幾個小技巧讓香氣更持久', content: '擴香石（又叫香氛石）是用石膏或水泥製成的多孔材質。它的表面佈滿肉眼看不見的微小毛細孔，能像海綿一樣吸收精油，然後透過自然蒸發緩慢釋放香氣。不用火、不用電，是最安全的居家擴香方式。\n\n使用方式的關鍵細節：\n\n每次滴3-5滴精油在石頭表面就足夠了。精油會在幾秒鐘內被吸收，然後在接下來2-3天裡慢慢釋放。如果你滴太多，石頭表面會形成一層油膜，反而影響揮發效率。\n\n放置位置很重要。最佳位置是人經常走動的地方（進出門處、走廊）或有氣流的地方（冷氣出風口附近、窗邊）。空氣的流動會幫助帶出香氣分子。但不要放在太熱或陽光直射的地方，高溫會讓精油快速揮發完。\n\n保養小知識：\n\n顏色變深是正常現象。長期吸收精油後，擴香石會從純白慢慢變成淡黃或淡棕色。這代表它的毛細孔已經充分被「養」過了，擴香效果會越來越好。\n\n想換香味時，不要急著滴新的精油。讓舊的香味自然揮發3-5天，等石頭恢復到幾乎沒有味道了再換。如果直接覆蓋新香味，兩種精油混在一起可能產生你不喜歡的味道。\n\n千萬不要用水沖洗。水會破壞石膏的多孔結構，讓毛細孔堵塞、失去吸附能力。如果表面有灰塵，用軟毛刷輕輕刷掉就好。\n\n建議搭配小盤子使用。精油偶爾會從底部滲出，小盤子可以保護你的桌面或書架。選一個自己喜歡的小碟子，也能增加擺設的美感。\n\n擴香石是「低調但持續存在的陪伴」——不張揚，卻在你需要的每一刻，安靜地釋放著療癒。', authorName: '下班隨手作', authorEmoji: '🪨', likeCount: 0, createdAt: '2026-02-18' },
    // 畫畫
    { id: 'sa-18', title: '流體畫的魔法：零基礎也能創作', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2022/02/6.jpeg', coverThumbUrl: 'https://xiabenhow.com/wp-content/uploads/2022/02/6.jpeg', topic: 'painting', summary: '不需要任何繪畫技巧——把控制權交給顏料，讓它自由流動出驚喜', content: '「我不會畫畫」——這是很多人面對畫布時的第一句話。但流體畫（Fluid Art）完全打破了這個限制。它不需要素描底子、不需要配色天賦，你唯一需要做的就是：調好顏料，然後讓它流動。\n\n流體畫的原理很簡單。把壓克力顏料加入助流劑（Pouring Medium），讓顏料變成像蜂蜜一樣的流動質地，然後倒在畫布上，讓重力和顏料之間的密度差自然形成圖案。每一次的結果都是獨一無二的——即使用相同的顏色和同樣的技法，也不會產生兩幅一樣的畫。\n\n三種最受歡迎的技法：\n\n髒倒法（Dirty Pour）：把3-4種不同顏色的顏料依序倒入同一個杯子裡（不要攪拌），然後一次倒在畫布上。顏料在流動的過程中自然混合出漸層和紋理。這是最簡單也最常用的方法。\n\n翻杯法（Flip Cup）：把調好的顏料倒入杯子，把畫布倒蓋在杯子上，然後快速翻轉。掀開杯子的瞬間，顏料像花朵一樣向外綻放。那個翻轉的瞬間是最令人期待的。\n\n吹畫法：先在畫布上倒少量顏料，然後用吹風機、吸管或嘴巴吹出方向性的紋路。可以做出像樹枝、閃電、或海浪的效果。\n\n配色建議：\n3-4個顏色就足夠了，太多顏色混在一起容易變灰暗。選擇同一色系（如藍+白+銀+金）或互補色（如深藍+銅金+白）。白色和金色/銀色是萬能搭配色。\n\n魔法密技——加入矽油\n在其中一種顏料裡滴入2-3滴矽油（dimethicone），會在顏料流動時產生美麗的「細胞」紋路。這些圓形的細胞效果是流體畫最迷人的特徵之一，看起來像是顯微鏡下的生物組織或外太空的星雲。\n\n流體畫的過程是一種「放手的練習」。你無法完全控制結果，但正是這種不確定性，創造出超越你想像的美。', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-03-09' },
    // 編織
    { id: 'sa-19', title: 'Macramé 編織：最療癒的手作之一', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2022/01/380726.jpg', coverThumbUrl: 'https://xiabenhow.com/wp-content/uploads/2022/01/380726.jpg', topic: 'weaving', summary: '重複的打結動作會讓你的大腦安靜下來——這是一種動態的冥想', content: 'Macramé（瑪克拉美繩結藝術）起源於13世紀的阿拉伯織工，後來傳入歐洲成為裝飾工藝。經過數百年的演變，它在現代重新成為最受歡迎的手作類型之一——不只因為成品好看，更因為它的製作過程本身就是一種深度放鬆。\n\n為什麼編織特別療癒？\n\n神經科學研究發現，重複性的手部動作（如打結、鉤針、揉麵團）能觸發「放鬆反應」（Relaxation Response）——降低心率、減少壓力荷爾蒙皮質醇的分泌、增加血清素的產生。這跟冥想時大腦的狀態非常相似。\n\n而且打結需要「剛剛好」的專注度——不需要太用力思考，但又不能完全放空。這種「心流」（Flow State）是最有效的壓力解藥。\n\n基本結法只有四種：\n\n平結（Square Knot）：最基本也最常用，左右交替打結形成扁平的繩帶。學會平結就能做杯墊、植物吊架、手環。\n\n螺旋結（Spiral Knot）：只用平結的前半段重複打，繩帶會自然旋轉成螺旋狀。做出來的效果很有設計感。\n\n半結（Half Hitch）：一條線繞著另一條線打結，可以做出斜線、曲線圖案。進階一點可以做出羽毛、樹葉的形狀。\n\n卷結（Gathering Knot）：用來收束和裝飾，通常用在作品的起始和結尾處。\n\n新手建議：\n從簡單的杯墊或鑰匙圈開始，棉繩選3-4mm粗的最好操作。純棉繩質地柔軟，適合初學者；尼龍繩光滑耐用，適合做飾品。選自己喜歡的顏色——當你對材料有好感時，你會更享受整個過程。\n\n準備好一杯茶、一首輕音樂，然後開始打你的第一個結。你會發現，當雙手忙碌的時候，腦袋裡那些吵雜的聲音就安靜了。', authorName: '下班隨手作', authorEmoji: '🧶', likeCount: 0, createdAt: '2026-02-12' },
    // 藍染
    { id: 'sa-20', title: '藍染的迷人之處：每件都是唯一', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2022/01/764868_0.jpg', coverThumbUrl: 'https://xiabenhow.com/wp-content/uploads/2022/01/764868_0.jpg', topic: 'indigo', summary: '天然藍染的魅力在於不可預測——你永遠不知道打開的那一刻會看到什麼', content: '藍染是台灣最古老的染色技藝之一。在化學染料出現之前的數百年裡，我們的祖先用大菁（馬藍）、木藍、蓼藍等植物提取天然藍色染料，為布料賦予從淺藍到深靛的各種藍色。\n\n藍染最神奇的一刻\n\n當你把纏繞綁紮好的布料從染缸中取出時，布是深綠色的——不是藍色！這是因為藍靛染料在缺氧環境（染缸裡）是溶解態的綠色。接觸空氣後，染料氧化，顏色會在你眼前慢慢從綠色轉變成藍色。這個「見色」的過程每次都讓人心跳加速。\n\n基本技法：\n\n綁染（Shibori）——最自由的表現\n用橡皮筋、棉線、夾子在布料上創造不同的綁法，被綁住的部分染料進不去，拆開後就會形成白色的圖案。每一種綁法產生的圖案都不同：\n- 蜘蛛紋：抓起布料的一點用繩子纏繞\n- 圈圈紋：用橡皮筋綁幾段\n- 雲朵紋：隨意揉成一團用繩綁緊\n\n板染——幾何之美\n把布料折疊後用木板或三角板夾住，染料只能滲入沒被夾住的部分。做出來的是整齊的幾何圖案——三角形、方格、菱形。摺法和夾法決定了最終的圖案。\n\n蠟染——精緻的藝術\n用蜂蠟或石蠟在布上繪製圖案，蠟覆蓋的部分拒絕染料進入。染色後去除蠟，就會留下精緻的白色圖案。這個技法需要比較多練習，但成品最有藝術性。\n\n深度的秘密在於「反覆」\n\n一次浸染只能得到很淺的藍色。要達到深藍或靛藍，需要反覆浸染-氧化-浸染，通常5-10次。每多一次浸染，藍色就深一層。最深的靛藍可能需要浸染超過20次。這個「一層一層加深」的過程，就像人的成長——深度不是一次就能達到的，需要反覆的沉澱。\n\n藍染最迷人的地方在於不可控。同一缸染液、同一塊布、同樣的綁法，每次做出來的都不一樣。你學會的不是控制結果，而是接納和欣賞每一次的獨特。', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-02-10' },
    // 生活療癒
    { id: 'sa-21', title: '手作療癒的心理學', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2023/12/611781-1.jpg', coverThumbUrl: 'https://xiabenhow.com/wp-content/uploads/2023/12/611781-1.jpg', topic: 'lifestyle', summary: '為什麼動手做東西會讓人感到放鬆？科學告訴我們答案', content: '下班後你會做什麼？很多人選擇滑手機、看影片「放鬆」，但常常發現滑了兩小時反而更累。而如果你曾經花一個下午做手作，會發現離開工作室時，整個人是真正放鬆的。\n\n這不是錯覺，而是有科學根據的。\n\n心流狀態（Flow State）\n匈牙利心理學家 Mihaly Csikszentmihalyi 提出的「心流」概念，描述的是一種完全沉浸在活動中、忘記時間流逝的狀態。手作是最容易進入心流的活動之一，因為它符合心流的三個條件：目標明確（完成一個作品）、即時回饋（你可以看到進度）、挑戰與技巧平衡（不太難也不太簡單）。\n\n在心流狀態中，大腦前額葉皮質的活動模式會改變——負責自我批評和擔憂的區域暫時「安靜」下來。這就是為什麼做手作時你不會一直想著工作壓力或人際煩惱。\n\n觸覺的療癒力量\n我們的手指尖有大量的觸覺受器。當你揉捏黏土、切削皮革、穿珠子時，這些觸覺刺激會傳遞到大腦的體感皮質，促進血清素（快樂荷爾蒙）的分泌。\n\n這也是為什麼「手感」在手作中這麼重要——紗線的柔軟、陶土的溫涼、木料的溫暖，每一種觸感都在和你的神經系統對話。\n\n從「消費」到「創造」的心理轉變\n現代生活讓我們大部分時間都在「消費」——消費資訊、消費娛樂、消費商品。這種模式久了會讓人感到空虛。手作把你從消費者變成創造者。當你親手做出一個成品，那種「我做到了」的成就感（心理學稱為 self-efficacy）是滑再多手機也給不了的。\n\n有趣的是，作品不需要「完美」就能帶來這種感覺。研究顯示，手作過程中的療癒效果跟成品品質沒有關係——做了一個歪歪的杯墊和做了一個完美的杯墊，帶來的心理益處是一樣的。因為重點不在結果，而在那段「全然專注在當下」的時光。\n\n所以下次當你覺得疲憊或焦慮時，試著用雙手做一件小事。哪怕只是折一朵紙花、打一個繩結。你的大腦會感謝你的。', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-03-10' },
    { id: 'sa-22', title: '打造你的居家療癒角落', coverUrl: 'https://xiabenhow.com/wp-content/uploads/2024/01/610543.jpg', coverThumbUrl: 'https://xiabenhow.com/wp-content/uploads/2024/01/610543.jpg', topic: 'lifestyle', summary: '不需要大空間——一個小角落就能成為你每天回到自己的地方', content: '在日本有一個詞叫「居場所」（いばしょ），意思是「讓你能安心待著的地方」。它不一定是一個房間，可能只是窗邊的一張小椅子、陽台的一個角落、書桌上的一小塊空間。重要的是，那是「屬於你」的地方。\n\n打造療癒角落的三感原則：\n\n視覺——讓眼睛休息\n一盆小植物是最好的起點。多肉植物不需要太多照顧，一盆綠色就能讓整個角落「活」起來。加一盞暖黃色的小燈（3000K色溫最舒服），避免使用白色的LED日光燈。如果有你喜歡的畫、照片或手作作品，掛在這個角落裡。\n\n研究顯示，望著綠色植物5分鐘就能降低心率和肌肉緊張度。而暖色光會促進褪黑激素的分泌，幫助身體進入放鬆模式。\n\n嗅覺——創造記憶錨點\n在你的療癒角落放一塊擴香石，滴上你最喜歡的精油。每天在這裡花幾分鐘靜坐或喝茶時，那個香氣就會和「放鬆」這個狀態連結。日子久了，你只要聞到那個氣味，身體就會自動開始放鬆——這就是嗅覺的「錨定效應」。\n\n如果你喜歡蠟燭，在這裡點一支自己做的香氛蠟燭也很棒。火焰的搖曳有天然的安撫效果。\n\n觸覺——被溫柔包圍\n一條柔軟的毛毯、一個舒服的靠墊。觸覺上的溫暖和包覆感會啟動副交感神經系統——就是讓你從「戰或逃」模式切換到「休息和消化」模式的系統。\n\n材質很重要：選天然棉、亞麻或羊毛製品。手作的織品（你在課堂上做的macramé或編織作品）放在這裡，會增添一份專屬於你的溫度。\n\n使用你的療癒角落：\n\n不需要做什麼特別的事。在這裡喝一杯茶、翻幾頁書、閉上眼睛深呼吸三次，或者什麼都不做就坐著。\n\n重要的是：告訴自己和家人——「我在這裡的時候，是我的充電時間。」\n\n把你在隨手作帶回家的每一個作品都擺在這個角落：親手做的擴香石、多肉組盆、水晶手鍊、蠟燭。每一件都是你某個下午好好照顧自己的證明。\n\n每個人都值得有一個這樣的角落。小小的，但完全是你的。', authorName: '下班隨手作', authorEmoji: '🌿', likeCount: 0, createdAt: '2026-02-08' },
  ];

  const displayArticles = articles.length > 0 ? filtered : (selectedTopic === 'all' ? sampleArticles : sampleArticles.filter(a => a.topic === selectedTopic));

  // 文章詳情
  if (selectedArticle) {
    return (
      <motion.div className="space-y-4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => setSelectedArticle(null)}
          className="flex items-center gap-1 text-sm" style={{ color: '#C9A96E' }}>← 返回列表</motion.button>
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          {selectedArticle.coverUrl && (
            <img src={selectedArticle.coverUrl} alt="" className="w-full h-48 object-cover" />
          )}
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span>{TOPICS.find(t => t.key === selectedArticle.topic)?.emoji}</span>
              <span className="px-2 py-0.5 rounded-lg text-xs" style={{ backgroundColor: (TOPICS.find(t => t.key === selectedArticle.topic)?.color || '#ddd') + '30', color: '#8C7B72' }}>
                {TOPICS.find(t => t.key === selectedArticle.topic)?.label}
              </span>
            </div>
            <h3 className="text-lg font-bold" style={{ color: '#3D3530' }}>{selectedArticle.title}</h3>
            <div className="flex items-center gap-2">
              <span className="text-sm">{selectedArticle.authorEmoji}</span>
              <p className="text-xs" style={{ color: '#8C7B72' }}>{selectedArticle.authorName} · {selectedArticle.createdAt?.slice(0, 10)}</p>
            </div>
            <div className="text-sm leading-relaxed whitespace-pre-line" style={{ color: '#3D3530' }}>{selectedArticle.content}</div>
            <div className="flex items-center gap-4 pt-2">
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => handleLike(selectedArticle.id)}
                className="flex items-center gap-1 text-sm" style={{ color: '#C9A96E' }}>
                ❤️ {selectedArticle.likeCount}
              </motion.button>
              {userEmail && (
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => toggleBookmark(selectedArticle.id)}
                  className="flex items-center gap-1 text-sm" style={{ color: bookmarks.includes(selectedArticle.id) ? '#C9A96E' : '#B5AFA8' }}>
                  {bookmarks.includes(selectedArticle.id) ? '🔖 已收藏' : '📑 收藏'}
                </motion.button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <div>
        <motion.button whileTap={{ scale: 0.95 }} onClick={goBack} className="flex items-center gap-1 text-sm mb-3" style={{ color: '#C9A96E' }}>← 返回</motion.button>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>📚 知識專欄</h2>
        <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>療癒知識，照顧技巧，生活靈感</p>
      </div>

      {/* Topic filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button onClick={() => setSelectedTopic('all')}
          className="px-3 py-1.5 rounded-xl text-xs font-medium flex-shrink-0"
          style={{ backgroundColor: selectedTopic === 'all' ? '#3D353020' : '#F5F0EB', color: selectedTopic === 'all' ? '#3D3530' : '#8C7B72' }}>
          全部
        </button>
        {TOPICS.map(t => (
          <button key={t.key} onClick={() => setSelectedTopic(t.key)}
            className="px-3 py-1.5 rounded-xl text-xs font-medium flex-shrink-0 flex items-center gap-1"
            style={{ backgroundColor: selectedTopic === t.key ? t.color + '30' : '#F5F0EB', color: selectedTopic === t.key ? '#3D3530' : '#8C7B72' }}>
            {t.emoji} {t.label}
            {subscribedTopics.includes(t.key) && <span style={{ color: '#C9A96E' }}>★</span>}
          </button>
        ))}
      </div>

      {/* 訂閱主題 - 橫向顯眼提示 */}
      {userEmail && (
        <div className="rounded-2xl p-4 shadow-sm" style={{ background: 'linear-gradient(135deg, #FFF8E1 0%, #FFFEF9 100%)', border: '1px solid #F0EDE8' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🔔</span>
            <div>
              <p className="text-sm font-bold" style={{ color: '#3D3530' }}>訂閱你感興趣的主題</p>
              <p className="text-xs" style={{ color: '#8C7B72' }}>新文章上架時通知你</p>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {TOPICS.map(t => (
              <motion.button key={t.key} whileTap={{ scale: 0.9 }} onClick={() => toggleSubscribe(t.key)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium flex-shrink-0"
                style={{
                  backgroundColor: subscribedTopics.includes(t.key) ? t.color + '35' : '#F5F0EB',
                  color: subscribedTopics.includes(t.key) ? '#3D3530' : '#8C7B72',
                  border: subscribedTopics.includes(t.key) ? `1px solid ${t.color}60` : '1px solid transparent'
                }}>
                {t.emoji} {t.label}
                {subscribedTopics.includes(t.key) && <span style={{ color: '#C9A96E' }}>✓</span>}
              </motion.button>
            ))}
          </div>
          {subscribedTopics.length > 0 && (
            <p className="text-[10px] mt-2" style={{ color: '#C9A96E' }}>已訂閱 {subscribedTopics.length} 個主題</p>
          )}
        </div>
      )}

      {/* 小紅書風格雙欄網格 */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: '#C9A96E', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {displayArticles.map((article, i) => {
            const topic = TOPICS.find(t => t.key === article.topic);
            return (
              <motion.button key={article.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setSelectedArticle(article)}
                className="rounded-2xl overflow-hidden shadow-sm text-left"
                style={{ backgroundColor: '#FFFEF9' }}>
                {/* Cover or gradient placeholder */}
                {article.coverUrl ? (
                  <img src={article.coverThumbUrl || article.coverUrl} alt="" className="w-full h-28 object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-28 flex items-center justify-center text-4xl"
                    style={{ background: `linear-gradient(135deg, ${topic?.color || '#E8D5B7'}30 0%, ${topic?.color || '#E8D5B7'}15 100%)` }}>
                    {topic?.emoji || '📝'}
                  </div>
                )}
                <div className="p-3">
                  <p className="text-xs font-bold leading-snug line-clamp-2" style={{ color: '#3D3530' }}>{article.title}</p>
                  <p className="text-xs mt-1 line-clamp-2 leading-relaxed" style={{ color: '#8C7B72' }}>{article.summary}</p>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1">
                      <span className="text-xs">{article.authorEmoji}</span>
                      <p className="text-xs" style={{ color: '#B5AFA8' }}>{article.authorName}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs" style={{ color: '#C9A96E' }}>❤️ {article.likeCount}</p>
                      {bookmarks.includes(article.id) && <span className="text-xs">🔖</span>}
                    </div>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* 管理員發文入口 */}
      {userEmail === ADMIN_EMAIL && (
        <div className="rounded-2xl p-3 text-center" style={{ backgroundColor: '#C9A96E10' }}>
          <p className="text-xs" style={{ color: '#C9A96E' }}>管理員功能：可透過 Firestore 後台新增文章</p>
        </div>
      )}
    </motion.div>
  );
}

// ---- 社群作品牆 ----
function CommunityWorksBoardView({ userEmail, goBack, setView }: {
  userEmail: string | null;
  goBack: () => void;
  setView: (v: LibraryView) => void;
}) {
  const [works, setWorks] = useState<CommunityWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const q = query(collection(db, 'community_works'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setWorks(snap.docs.map(d => ({ id: d.id, ...d.data() } as CommunityWork)));
      setLoading(false);
    });
    return unsub;
  }, []);

  // Load user's liked works
  useEffect(() => {
    if (!userEmail) return;
    const q = query(collection(db, 'user_likes'), where('userId', '==', userEmail), where('itemType', '==', 'community'));
    const unsub = onSnapshot(q, (snap) => {
      setLikedIds(new Set(snap.docs.map(d => d.data().itemId)));
    });
    return unsub;
  }, [userEmail]);

  const handleLike = async (workId: string) => {
    if (!userEmail) return;
    const alreadyLiked = likedIds.has(workId);
    if (alreadyLiked) {
      await updateDoc(doc(db, 'community_works', workId), { likeCount: increment(-1) });
      try {
        const likesQ = query(collection(db, 'user_likes'), where('userId', '==', userEmail), where('itemId', '==', workId));
        const likesSnap = await getDocs(likesQ);
        for (const likeDoc of likesSnap.docs) { await deleteDoc(likeDoc.ref); }
      } catch (e) { console.error('[Firestore] unlike:', e); }
      setLikedIds(prev => { const next = new Set(prev); next.delete(workId); return next; });
    } else {
      await updateDoc(doc(db, 'community_works', workId), { likeCount: increment(1) });
      const work = works.find(w => w.id === workId);
      try { await addDoc(collection(db, 'user_likes'), { userId: userEmail, itemId: workId, itemType: 'community', title: work?.caption || '', author: work?.userName || '', emoji: work?.userEmoji || '🎨', likedAt: new Date().toISOString() }); } catch (e) { console.error('[Firestore] like:', e); }
      setLikedIds(prev => new Set(prev).add(workId));
    }
    hapticLight();
  };

  const filtered = filterType === 'all' ? works : works.filter(w => w.workType === filterType);

  // 範例作品（無資料時）
  const sampleWorks: CommunityWork[] = [
    { id: 'sw-1', userId: 'xiabenhow@gmail.com', userName: '下班隨手作', userEmoji: '🌿', imageUrl: 'https://xiabenhow.com/wp-content/uploads/2023/01/798738.jpg', thumbUrl: 'https://xiabenhow.com/wp-content/uploads/2023/01/798738.jpg', caption: '今天做的多肉組盆，選了三種不同顏色的多肉搭配在一起，好療癒', workType: 'plant', tags: ['#第一次做', '#超滿意'], likeCount: 0, commentCount: 0, createdAt: '2026-03-25' },
    { id: 'sw-2', userId: 'xiabenhow@gmail.com', userName: '下班隨手作', userEmoji: '🌿', imageUrl: 'https://xiabenhow.com/wp-content/uploads/2025/03/精油芳療滾珠瓶5.jpg', thumbUrl: 'https://xiabenhow.com/wp-content/uploads/2025/03/精油芳療滾珠瓶5.jpg', caption: '自己調的晚安香氣，薰衣草+雪松+佛手柑，聞了好放鬆', workType: 'fragrance', tags: ['#下班療癒', '#香氣迷人'], likeCount: 0, commentCount: 0, createdAt: '2026-03-24' },
    { id: 'sw-3', userId: 'xiabenhow@gmail.com', userName: '下班隨手作', userEmoji: '🌿', imageUrl: 'https://xiabenhow.com/wp-content/uploads/2026/03/1043595_0.jpg', thumbUrl: 'https://xiabenhow.com/wp-content/uploads/2026/03/1043595_0.jpg', caption: '紫水晶+月光石的手鍊完成！好喜歡這個配色', workType: 'crystal', tags: ['#配色控', '#獨一無二'], likeCount: 0, commentCount: 0, featured: true, createdAt: '2026-03-23' },
    { id: 'sw-4', userId: 'xiabenhow@gmail.com', userName: '下班隨手作', userEmoji: '🌿', imageUrl: 'https://xiabenhow.com/wp-content/uploads/2025/03/705960_0.jpg', thumbUrl: 'https://xiabenhow.com/wp-content/uploads/2025/03/705960_0.jpg', caption: '第一次做大豆蠟蠟燭，選了最喜歡的粉色', workType: 'candle', tags: ['#第一次做', '#意外驚喜'], likeCount: 0, commentCount: 0, createdAt: '2026-03-22' },
    { id: 'sw-5', userId: 'xiabenhow@gmail.com', userName: '下班隨手作', userEmoji: '🌿', imageUrl: 'https://xiabenhow.com/wp-content/uploads/2023/08/e6898be4bd9cdiye69d90e.jpg', thumbUrl: 'https://xiabenhow.com/wp-content/uploads/2023/08/e6898be4bd9cdiye69d90e.jpg', caption: '母親節禮物準備好了！玫瑰天竺葵手工皂', workType: 'soap', tags: ['#母親節禮物', '#送給朋友'], likeCount: 0, commentCount: 0, featured: true, createdAt: '2026-03-21' },
    { id: 'sw-6', userId: 'xiabenhow@gmail.com', userName: '下班隨手作', userEmoji: '🌿', imageUrl: 'https://xiabenhow.com/wp-content/uploads/2023/10/1052600.jpg', thumbUrl: 'https://xiabenhow.com/wp-content/uploads/2023/10/1052600.jpg', caption: '韓式花束包裝學起來了！送給自己的生日花', workType: 'floral', tags: ['#生日禮物', '#超滿意'], likeCount: 0, commentCount: 0, createdAt: '2026-03-20' },
    { id: 'sw-7', userId: 'xiabenhow@gmail.com', userName: '下班隨手作', userEmoji: '🌿', imageUrl: 'https://xiabenhow.com/wp-content/uploads/2026/03/1033816_0.jpg', thumbUrl: 'https://xiabenhow.com/wp-content/uploads/2026/03/1033816_0.jpg', caption: '手縫皮革名片夾，第一次做縫線就很整齊！', workType: 'leather', tags: ['#第一次做', '#超滿意'], likeCount: 0, commentCount: 0, createdAt: '2026-03-19' },
    { id: 'sw-8', userId: 'xiabenhow@gmail.com', userName: '下班隨手作', userEmoji: '🌿', imageUrl: 'https://xiabenhow.com/wp-content/uploads/2022/01/764868_0.jpg', thumbUrl: 'https://xiabenhow.com/wp-content/uploads/2022/01/764868_0.jpg', caption: '藍染手帕，每個折法出來的圖案都不一樣', workType: 'indigo', tags: ['#獨一無二', '#週末手作'], likeCount: 0, commentCount: 0, createdAt: '2026-03-18' },
  ];

  const displayWorks = works.length > 0 ? filtered : (filterType === 'all' ? sampleWorks : sampleWorks.filter(w => w.workType === filterType));

  const typeFilters = [
    { key: 'all', label: '全部', emoji: '✨' },
    { key: 'plant', label: '植栽', emoji: '🌱' },
    { key: 'fragrance', label: '調香', emoji: '🫧' },
    { key: 'crystal', label: '水晶', emoji: '💎' },
    { key: 'candle', label: '蠟燭', emoji: '🕯️' },
    { key: 'leather', label: '皮革', emoji: '👜' },
    { key: 'soap', label: '手工皂', emoji: '🧼' },
    { key: 'floral', label: '花藝', emoji: '💐' },
    { key: 'resin', label: '樹脂', emoji: '✨' },
    { key: 'indigo', label: '藍染', emoji: '🫐' },
  ];

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <div>
        <motion.button whileTap={{ scale: 0.95 }} onClick={goBack} className="flex items-center gap-1 text-sm mb-3" style={{ color: '#C9A96E' }}>← 返回</motion.button>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>🎨 作品社群</h2>
        <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>看看大家帶回家的作品，分享你的療癒時光</p>
      </div>

      {/* 分類篩選 */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {typeFilters.map(f => (
          <button key={f.key} onClick={() => setFilterType(f.key)}
            className="px-3 py-1.5 rounded-xl text-xs font-medium flex-shrink-0 flex items-center gap-1"
            style={{ backgroundColor: filterType === f.key ? '#3D353015' : '#F5F0EB', color: filterType === f.key ? '#3D3530' : '#8C7B72' }}>
            {f.emoji} {f.label}
          </button>
        ))}
      </div>

      {/* 發表作品按鈕 */}
      {userEmail && (
        <motion.button whileTap={{ scale: 0.97 }} onClick={() => setView('post-work')}
          className="w-full rounded-2xl py-3 text-sm font-bold text-white shadow-sm flex items-center justify-center gap-2"
          style={{ backgroundColor: '#C9A96E' }}>
          📸 分享我的作品
        </motion.button>
      )}

      {/* 作品牆 - 小紅書風格雙欄 */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: '#C9A96E', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {displayWorks.map((work, i) => (
            <motion.div key={work.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="rounded-2xl overflow-hidden shadow-sm"
              style={{ backgroundColor: '#FFFEF9' }}>
              {/* Image or placeholder */}
              {work.imageUrl ? (
                <img src={work.thumbUrl || work.imageUrl} alt="" className="w-full h-36 object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-36 flex items-center justify-center text-5xl"
                  style={{ background: `linear-gradient(135deg, ${TOPICS.find(t => t.key === work.workType)?.color || '#E8D5B7'}25 0%, #FFFEF9 100%)` }}>
                  {TOPICS.find(t => t.key === work.workType)?.emoji || '✨'}
                </div>
              )}
              <div className="p-3">
                <p className="text-xs leading-snug line-clamp-3" style={{ color: '#3D3530' }}>{work.caption}</p>
                {work.tags && work.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {work.tags.map(tag => (
                      <span key={tag} className="text-xs px-1.5 py-0.5 rounded-lg" style={{ backgroundColor: '#C9A96E15', color: '#C9A96E' }}>{tag}</span>
                    ))}
                  </div>
                )}
                {work.featured && (
                  <span className="text-xs px-1.5 py-0.5 rounded-lg mt-1 inline-block" style={{ backgroundColor: '#C9A96E25', color: '#C9A96E' }}>⭐ 本週精選</span>
                )}
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1">
                    <span className="text-xs">{work.userEmoji}</span>
                    <p className="text-xs" style={{ color: '#B5AFA8' }}>{work.userName}</p>
                  </div>
                  <motion.button whileTap={{ scale: 0.9 }} onClick={() => handleLike(work.id)}
                    className="flex items-center gap-0.5 text-xs" style={{ color: likedIds.has(work.id) ? '#E74C3C' : '#8C7B72' }}>
                    {likedIds.has(work.id) ? '❤️' : '🤍'} {Math.max(0, work.likeCount || 0)}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {!userEmail && (
        <div className="rounded-2xl px-4 py-3.5 text-center" style={{ backgroundColor: '#C9A96E12' }}>
          <p className="text-xs" style={{ color: '#8C7B72' }}>登入後可以分享你的作品 ✨</p>
        </div>
      )}
    </motion.div>
  );
}

// ---- 發表作品 ----
function PostWorkView({ userEmail, goBack }: {
  userEmail: string | null;
  goBack: () => void;
}) {
  const [caption, setCaption] = useState('');
  const [workType, setWorkType] = useState('plant');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const handlePost = async () => {
    if (!userEmail || !caption.trim()) return;
    setPosting(true);
    try {
      let imageUrl = '';
      let thumbUrl = '';
      if (photoDataUrl) {
        const result = await uploadImage(`community_works/${userEmail}/work_${Date.now()}.jpg`, photoDataUrl);
        imageUrl = result.url;
        thumbUrl = result.thumbnailUrl || result.url;
      }
      await addDoc(collection(db, 'community_works'), {
        userId: userEmail,
        userName: userEmail.split('@')[0],
        userEmoji: TOPICS.find(t => t.key === workType)?.emoji || '✨',
        imageUrl,
        thumbUrl,
        caption: caption.trim(),
        workType,
        tags: selectedTags,
        likeCount: 0,
        commentCount: 0,
        createdAt: new Date().toISOString(),
      });
      setPosted(true);
      hapticSuccess();

      // 社群活動點數 — 暫時隱藏
      // if (userEmail) {
      //   const pointsRef = doc(db, 'user_points', userEmail);
      //   await setDoc(pointsRef, { total: increment(10), lastAction: 'post_work', lastActionAt: new Date().toISOString() }, { merge: true });
      // }

      setTimeout(() => goBack(), 1500);
    } catch (e) { console.error(e); }
    setPosting(false);
  };

  const postPhotoInputRef = useRef<HTMLInputElement>(null);
  const postCameraInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return; // Max 5MB
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setPhotoDataUrl(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  if (!userEmail) {
    return (
      <motion.div className="space-y-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
        <motion.button whileTap={{ scale: 0.95 }} onClick={goBack} className="flex items-center gap-1 text-sm" style={{ color: '#C9A96E' }}>← 返回</motion.button>
        <div className="rounded-3xl p-8 text-center" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-sm" style={{ color: '#8C7B72' }}>請先登入才能發表作品</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      {/* Hidden file inputs */}
      <input ref={postPhotoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoFile} />
      <input ref={postCameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoFile} />

      <div>
        <motion.button whileTap={{ scale: 0.95 }} onClick={goBack} className="flex items-center gap-1 text-sm mb-3" style={{ color: '#C9A96E' }}>← 返回</motion.button>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>📸 分享作品</h2>
        <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>分享你的療癒作品給大家看看</p>
      </div>

      <div className="rounded-2xl p-4 shadow-sm space-y-4" style={{ backgroundColor: '#FFFEF9' }}>
        {/* 作品類型 */}
        <div>
          <p className="text-xs mb-2" style={{ color: '#8C7B72' }}>作品類型</p>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map(t => (
              <button key={t.key} onClick={() => setWorkType(t.key)}
                className="px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1"
                style={{ backgroundColor: workType === t.key ? t.color + '30' : '#F5F0EB', color: '#3D3530' }}>
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 照片 */}
        {photoDataUrl ? (
          <div className="relative">
            <img src={photoDataUrl} alt="" className="w-full h-56 object-cover rounded-xl" />
            <button onClick={() => setPhotoDataUrl(null)}
              className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-xs text-white"
              style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>✕</button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => postPhotoInputRef.current?.click()}
                className="flex-1 h-32 rounded-xl flex flex-col items-center justify-center gap-2"
                style={{ backgroundColor: '#F5F0EB' }}>
                <span className="text-2xl">🖼️</span>
                <p className="text-xs" style={{ color: '#8C7B72' }}>從相簿選擇</p>
              </motion.button>
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => postCameraInputRef.current?.click()}
                className="flex-1 h-32 rounded-xl flex flex-col items-center justify-center gap-2"
                style={{ backgroundColor: '#F5F0EB' }}>
                <span className="text-2xl">📷</span>
                <p className="text-xs" style={{ color: '#8C7B72' }}>拍照</p>
              </motion.button>
            </div>
          </div>
        )}

        {/* 文字 */}
        <textarea placeholder="說說你的作品故事... ✨" value={caption} onChange={e => setCaption(e.target.value)}
          rows={3}
          className="w-full rounded-xl px-3 py-2.5 text-sm bg-transparent outline-none resize-none"
          style={{ backgroundColor: '#F5F0EB', color: '#3D3530' }} />

        {/* 標籤選擇 */}
        <div>
          <p className="text-xs mb-2" style={{ color: '#8C7B72' }}>加上標籤（選填）</p>
          <div className="flex flex-wrap gap-1.5">
            {WORK_TAGS.map(tag => (
              <button key={tag} onClick={() => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag].slice(0, 3))}
                className="px-2 py-1 rounded-lg text-xs"
                style={{ backgroundColor: selectedTags.includes(tag) ? '#C9A96E25' : '#F5F0EB', color: selectedTags.includes(tag) ? '#C9A96E' : '#8C7B72' }}>
                {tag}
              </button>
            ))}
          </div>
          {selectedTags.length > 0 && <p className="text-xs mt-1" style={{ color: '#B5AFA8' }}>已選 {selectedTags.length}/3</p>}
        </div>

        {posted ? (
          <div className="rounded-xl px-3 py-2.5 text-center" style={{ backgroundColor: '#8FA88620' }}>
            <p className="text-sm font-medium" style={{ color: '#8FA886' }}>發表成功！✨</p>
          </div>
        ) : (
          <motion.button whileTap={{ scale: 0.97 }} onClick={handlePost} disabled={posting || !caption.trim()}
            className="w-full rounded-xl py-3 text-sm font-bold text-white"
            style={{ backgroundColor: posting ? '#B5AFA8' : '#C9A96E' }}>
            {posting ? '發表中...' : '發表作品'}
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

// ---- 主題訂閱區塊 ----
function TopicSubscriptionBlock({ userEmail }: { userEmail: string }) {
  const [subscribed, setSubscribed] = useState<string[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'user_subscriptions', userEmail), (snap) => {
      if (snap.exists()) setSubscribed(snap.data().topics || []);
    });
    return unsub;
  }, [userEmail]);

  const toggle = async (key: string) => {
    const newTopics = subscribed.includes(key)
      ? subscribed.filter(t => t !== key)
      : [...subscribed, key];
    setSubscribed(newTopics);
    await setDoc(doc(db, 'user_subscriptions', userEmail), { topics: newTopics }, { merge: true });
    hapticLight();
  };

  return (
    <div className="flex flex-wrap gap-2">
      {TOPICS.map(t => (
        <motion.button key={t.key} whileTap={{ scale: 0.9 }} onClick={() => toggle(t.key)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium"
          style={{ backgroundColor: subscribed.includes(t.key) ? t.color + '35' : '#F5F0EB', color: subscribed.includes(t.key) ? '#3D3530' : '#8C7B72' }}>
          {t.emoji} {t.label}
          {subscribed.includes(t.key) && <span style={{ color: '#C9A96E' }}>✓</span>}
        </motion.button>
      ))}
    </div>
  );
}

// ---- 本週精選作品 ----
function WeeklyFeaturedWorks() {
  const [featuredWorks, setFeaturedWorks] = useState<CommunityWork[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'community_works'), orderBy('likeCount', 'desc'), fsLimit(4));
    const unsub = onSnapshot(q, (snap) => {
      setFeaturedWorks(snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as CommunityWork)));
    });
    return unsub;
  }, []);

  // Use sample data if Firestore is empty
  const sampleFeatured: CommunityWork[] = [
    { id: 'feat-1', userId: 'xiabenhow@gmail.com', userName: '下班隨手作', userEmoji: '🌿', imageUrl: 'https://xiabenhow.com/wp-content/uploads/2026/03/1043595_0.jpg', thumbUrl: 'https://xiabenhow.com/wp-content/uploads/2026/03/1043595_0.jpg', caption: '紫水晶+月光石手鍊，好喜歡這個配色', workType: 'crystal', tags: ['#配色控'], likeCount: 0, commentCount: 0, featured: true, createdAt: '2026-03-23' },
    { id: 'feat-2', userId: 'xiabenhow@gmail.com', userName: '下班隨手作', userEmoji: '🌿', imageUrl: 'https://xiabenhow.com/wp-content/uploads/2023/08/e6898be4bd9cdiye69d90e.jpg', thumbUrl: 'https://xiabenhow.com/wp-content/uploads/2023/08/e6898be4bd9cdiye69d90e.jpg', caption: '母親節禮物！玫瑰天竺葵手工皂', workType: 'soap', tags: ['#母親節禮物'], likeCount: 0, commentCount: 0, featured: true, createdAt: '2026-03-21' },
  ];

  const display = featuredWorks.length > 0 ? featuredWorks.slice(0, 2) : sampleFeatured;

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
      {display.map(work => (
        <div key={work.id} className="flex-shrink-0 w-52 rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          {work.imageUrl ? (
            <img src={work.thumbUrl || work.imageUrl} alt="" className="w-full h-28 object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-28 flex items-center justify-center text-4xl"
              style={{ background: `linear-gradient(135deg, ${TOPICS.find(t => t.key === work.workType)?.color || '#E8D5B7'}25 0%, #FFFEF9 100%)` }}>
              {TOPICS.find(t => t.key === work.workType)?.emoji || '✨'}
            </div>
          )}
          <div className="p-2.5">
            <p className="text-xs leading-snug line-clamp-2" style={{ color: '#3D3530' }}>{work.caption}</p>
            <div className="flex items-center justify-between mt-1.5">
              <div className="flex items-center gap-1">
                <span className="text-xs">{work.userEmoji}</span>
                <p className="text-xs" style={{ color: '#B5AFA8' }}>{work.userName}</p>
              </div>
              <span className="text-xs" style={{ color: '#C9A96E' }}>⭐ 精選</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- 積分徽章 ----
function PointsBadge({ userEmail }: { userEmail: string }) {
  const [points, setPoints] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'user_points', userEmail), (snap) => {
      if (snap.exists()) setPoints(snap.data().total || 0);
    });
    return unsub;
  }, [userEmail]);

  const level = points >= 200 ? '療癒大師' : points >= 100 ? '手作達人' : points >= 50 ? '療癒新手' : '初心者';
  const levelEmoji = points >= 200 ? '🏆' : points >= 100 ? '⭐' : points >= 50 ? '🌱' : '🌿';

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{ backgroundColor: '#C9A96E15' }}>
      <span className="text-sm">{levelEmoji}</span>
      <div>
        <p className="text-xs font-bold" style={{ color: '#C9A96E' }}>{points} 點</p>
        <p className="text-xs" style={{ color: '#8C7B72' }}>{level}</p>
      </div>
    </div>
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
    const timeout = setTimeout(() => setLoading(false), 2000);
    return () => { unsub(); clearTimeout(timeout); };
  }, []);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
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

// ===================== PAGE: 電子書 (Ebook Shelf + Reader) =====================

interface EbookItem {
  id: string;
  title: string;
  subtitle: string;
  coverUrl: string;
  totalPages: number;
  imagePrefix: string; // e.g. '/ebooks/2024-fragrance-calendar/page-'
  imageSuffix: string; // e.g. '.jpg'
  price: number;
  year: number;
  wcProductId: number; // WooCommerce product ID
}

const EBOOK_CATALOG: EbookItem[] = [
  {
    id: '2024-fragrance-calendar',
    title: '2024 曆刻聞香',
    subtitle: '用香氛啟動每日共感情緒',
    coverUrl: '/ebooks/2024-fragrance-calendar-cover.jpg',
    totalPages: 380,
    imagePrefix: '/ebooks/2024-fragrance-calendar/page-',
    imageSuffix: '.jpg',
    price: 799,
    year: 2024,
    wcProductId: 107817,
  },
  {
    id: '2023-fragrance-calendar',
    title: '2023 曆刻聞香',
    subtitle: '開啟調香日曆，走進叢林香氣',
    coverUrl: '/ebooks/2023-fragrance-calendar-cover.jpg',
    totalPages: 381,
    imagePrefix: '/ebooks/2023-fragrance-calendar/page-',
    imageSuffix: '.jpg',
    price: 799,
    year: 2023,
    wcProductId: 107820,
  },
];

function EbookReaderPage({ book, onBack }: { book: EbookItem; onBack: () => void }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const [imgLoading, setImgLoading] = useState(true);
  const [showUI, setShowUI] = useState(true);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const hideUITimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalPages = book.totalPages;

  // Build image URL for a given page number
  const getPageUrl = (pageNum: number) =>
    `${book.imagePrefix}${String(pageNum).padStart(4, '0')}${book.imageSuffix}`;

  // Preload adjacent pages
  useEffect(() => {
    const preload = [currentPage - 1, currentPage + 1, currentPage + 2];
    preload.forEach(p => {
      if (p >= 1 && p <= totalPages) {
        const img = new Image();
        img.src = getPageUrl(p);
      }
    });
  }, [currentPage, totalPages]);

  // Auto-hide UI after 3 seconds
  useEffect(() => {
    if (showUI) {
      hideUITimer.current = setTimeout(() => setShowUI(false), 4000);
    }
    return () => { if (hideUITimer.current) clearTimeout(hideUITimer.current); };
  }, [showUI, currentPage]);

  const goNext = () => {
    if (currentPage < totalPages) {
      setSlideDir('left');
      setImgLoading(true);
      setCurrentPage(p => p + 1);
    }
  };

  const goPrev = () => {
    if (currentPage > 1) {
      setSlideDir('right');
      setImgLoading(true);
      setCurrentPage(p => p - 1);
    }
  };

  // Touch swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = touchStartX.current - e.changedTouches[0].clientX;
    const dy = Math.abs(touchStartY.current - e.changedTouches[0].clientY);
    if (dy > Math.abs(dx)) return;
    if (dx > 60) goNext();
    else if (dx < -60) goPrev();
    else setShowUI(prev => !prev); // tap = toggle UI
  };

  // Click zones: left 25% = prev, right 25% = next, center = toggle UI
  const handleClick = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    if (ratio < 0.25) goPrev();
    else if (ratio > 0.75) goNext();
    else setShowUI(prev => !prev);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: '#1a1814' }}>
      {/* Top bar */}
      <AnimatePresence>
        {showUI && (
          <motion.div
            className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3"
            style={{ backgroundColor: 'rgba(42,37,32,0.95)', paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <button onClick={onBack} className="text-white text-sm flex items-center gap-1">
              ← 返回
            </button>
            <p className="text-xs text-white opacity-70 truncate max-w-[50%]">{book.title}</p>
            <p className="text-xs text-white opacity-50">{currentPage} / {totalPages}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image area */}
      <div
        className="flex-1 overflow-hidden flex items-center justify-center relative"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        style={{ cursor: 'pointer' }}
      >
        {/* Loading spinner */}
        {imgLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-5">
            <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: '#C9A96E', borderTopColor: 'transparent' }} />
          </div>
        )}

        <motion.div
          key={currentPage}
          initial={{ opacity: 0.5, x: slideDir === 'left' ? 60 : slideDir === 'right' ? -60 : 0 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="w-full h-full flex items-center justify-center"
        >
          <img
            src={getPageUrl(currentPage)}
            alt={`第 ${currentPage} 頁`}
            className="max-w-full max-h-full object-contain"
            onLoad={() => { setImgLoading(false); setSlideDir(null); }}
            draggable={false}
          />
        </motion.div>

        {/* Side navigation hints */}
        <AnimatePresence>
          {showUI && currentPage > 1 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.3 }} exit={{ opacity: 0 }}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white text-3xl pointer-events-none">‹</motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {showUI && currentPage < totalPages && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.3 }} exit={{ opacity: 0 }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white text-3xl pointer-events-none">›</motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom progress bar */}
      <AnimatePresence>
        {showUI && (
          <motion.div
            className="absolute bottom-0 left-0 right-0 z-10 px-4 py-3"
            style={{ backgroundColor: 'rgba(42,37,32,0.95)', paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {/* Progress bar */}
            <div className="w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: '#3a3530' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: '#C9A96E' }}
                animate={{ width: `${(currentPage / totalPages) * 100}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            {/* Page slider */}
            <input
              type="range"
              min={1}
              max={totalPages}
              value={currentPage}
              onChange={(e) => {
                setImgLoading(true);
                setCurrentPage(Number(e.target.value));
              }}
              className="w-full mt-2 accent-amber-600"
              style={{ height: 4 }}
            />
            <div className="flex justify-between mt-1">
              <button
                onClick={goPrev}
                disabled={currentPage <= 1}
                className="text-xs px-4 py-1.5 rounded-full"
                style={{ backgroundColor: currentPage > 1 ? '#3a3530' : 'transparent', color: currentPage > 1 ? '#fff' : '#555' }}
              >
                ← 上一頁
              </button>
              <p className="text-xs self-center" style={{ color: '#C9A96E' }}>{currentPage} / {totalPages}</p>
              <button
                onClick={goNext}
                disabled={currentPage >= totalPages}
                className="text-xs px-4 py-1.5 rounded-full"
                style={{ backgroundColor: currentPage < totalPages ? '#3a3530' : 'transparent', color: currentPage < totalPages ? '#fff' : '#555' }}
              >
                下一頁 →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EbookShelfPage({ userEmail, onNavigate, onPurchaseBook }: { userEmail: string | null; onNavigate: (p: PageType) => void; onPurchaseBook: (book: EbookItem) => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [authorizedBooks, setAuthorizedBooks] = useState<string[]>([]);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [selectedBook, setSelectedBook] = useState<EbookItem | null>(null);
  const [showPurchasePrompt, setShowPurchasePrompt] = useState<EbookItem | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u?.email) {
        try {
          const emailKey = u.email.replace(/\./g, '_');
          const snap = await getDoc(doc(db, 'ebook_authorized', emailKey));
          if (snap.exists() && snap.data()?.active === true) {
            setAuthorizedBooks(snap.data()?.books || []);
          }
        } catch (e) {
          console.error('ebook auth check error:', e);
        }
      }
      setCheckingAuth(false);
    });
    return unsub;
  }, []);

  const handleSignIn = async () => {
    setSigningIn(true);
    try { await signInWithPopup(auth, googleProvider); } catch (e) { console.error(e); }
    setSigningIn(false);
  };

  const hasAccess = (bookId: string) => authorizedBooks.includes(bookId);

  const handleBookClick = (book: EbookItem) => {
    if (!user) {
      setShowPurchasePrompt(book);
      return;
    }
    if (hasAccess(book.id)) {
      setSelectedBook(book);
    } else {
      setShowPurchasePrompt(book);
    }
  };

  // If reading a book, show the reader
  if (selectedBook) {
    return <EbookReaderPage book={selectedBook} onBack={() => setSelectedBook(null)} />;
  }

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>📖 電子書</h2>
        <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>用閱讀啟動每日療癒旅程</p>
      </div>

      {/* Book Grid */}
      <div className="grid grid-cols-2 gap-4">
        {EBOOK_CATALOG.map(book => {
          const unlocked = user && hasAccess(book.id);
          return (
            <motion.button
              key={book.id}
              whileTap={{ scale: 0.96 }}
              onClick={() => handleBookClick(book)}
              className="rounded-2xl overflow-hidden shadow-sm text-left relative"
              style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
            >
              {/* Cover Image */}
              <div className="aspect-[3/4] relative overflow-hidden" style={{ backgroundColor: '#F5F0EB' }}>
                <img
                  src={book.coverUrl}
                  alt={book.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                {/* Fallback if no cover image */}
                <div className="absolute inset-0 flex flex-col items-center justify-center p-3" style={{ background: 'linear-gradient(135deg, #F5EDE4 0%, #E8DDD3 100%)' }}>
                  <span className="text-4xl mb-2">📖</span>
                  <p className="text-xs font-bold text-center" style={{ color: '#3D3530' }}>{book.title}</p>
                  <p className="text-[10px] text-center mt-0.5" style={{ color: '#8C7B72' }}>{book.subtitle}</p>
                </div>

                {/* Lock overlay for non-authorized */}
                {!unlocked && (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
                    <div className="bg-white rounded-full p-2.5 shadow-lg">
                      <span className="text-lg">🔒</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Book Info */}
              <div className="p-3">
                <p className="text-sm font-bold truncate" style={{ color: '#3D3530' }}>{book.title}</p>
                <p className="text-[10px] mt-0.5 truncate" style={{ color: '#8C7B72' }}>{book.subtitle}</p>
                {!unlocked && (
                  <p className="text-xs font-bold mt-1.5" style={{ color: '#C9A96E' }}>NT$ {book.price}</p>
                )}
                {unlocked && (
                  <p className="text-xs mt-1.5" style={{ color: '#8FA886' }}>✓ 已解鎖・點擊閱讀</p>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* How it works */}
      <div className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
        <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>📚 如何閱讀電子書？</p>
        <div className="space-y-2">
          <p className="text-xs leading-relaxed" style={{ color: '#8C7B72' }}>
            1. 購買電子書後，我們會為你的帳號開通閱讀權限
          </p>
          <p className="text-xs leading-relaxed" style={{ color: '#8C7B72' }}>
            2. 使用購買時填寫的 Email 登入即可閱讀
          </p>
          <p className="text-xs leading-relaxed" style={{ color: '#8C7B72' }}>
            3. 左右滑動或點擊兩側翻頁，享受沉浸式閱讀
          </p>
        </div>
      </div>

      {/* Purchase Prompt Modal */}
      <AnimatePresence>
        {showPurchasePrompt && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute inset-0"
              style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
              onClick={() => setShowPurchasePrompt(null)}
            />
            <motion.div
              className="relative w-full max-w-md rounded-t-3xl p-6 space-y-4"
              style={{ backgroundColor: '#FFFEF9' }}
              initial={{ y: 300 }}
              animate={{ y: 0 }}
              exit={{ y: 300 }}
              transition={{ type: 'spring', damping: 25 }}
            >
              <div className="w-10 h-1 rounded-full mx-auto" style={{ backgroundColor: '#E0D9D1' }} />

              <div className="text-center">
                <span className="text-4xl">📖</span>
                <h3 className="text-lg font-bold mt-2" style={{ color: '#3D3530' }}>{showPurchasePrompt.title}</h3>
                <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>{showPurchasePrompt.subtitle}</p>
              </div>

              {!user ? (
                <div className="space-y-3">
                  <p className="text-sm text-center" style={{ color: '#8C7B72' }}>
                    請先登入以確認你的閱讀權限
                  </p>
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={handleSignIn}
                    disabled={signingIn}
                    className="w-full rounded-2xl py-3 font-medium text-sm flex items-center justify-center gap-2"
                    style={{ backgroundColor: '#4285F4', color: '#fff' }}
                  >
                    {signingIn ? '登入中...' : '🔑 使用 Google 帳號登入'}
                  </motion.button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-2xl p-4" style={{ backgroundColor: '#FFF8ED', border: '1px solid #F0E6D2' }}>
                    <p className="text-sm font-bold" style={{ color: '#3D3530' }}>🔒 此電子書需要購買</p>
                    <p className="text-xs mt-1" style={{ color: '#8C7B72' }}>
                      你目前登入的帳號 ({user.email}) 尚未開通此書的閱讀權限。
                    </p>
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={() => {
                      setShowPurchasePrompt(null);
                      onPurchaseBook(showPurchasePrompt);
                    }}
                    className="w-full rounded-2xl py-3.5 font-bold text-sm"
                    style={{ backgroundColor: '#C9A96E', color: '#fff' }}
                  >
                    🛒 購買電子書 — NT$ {showPurchasePrompt.price}
                  </motion.button>

                  <p className="text-[10px] text-center" style={{ color: '#B0A89E' }}>
                    付款成功後立即開通閱讀權限
                  </p>
                </div>
              )}

              <button
                onClick={() => setShowPurchasePrompt(null)}
                className="w-full text-center text-sm py-2"
                style={{ color: '#8C7B72' }}
              >
                稍後再說
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// (電子書購買已改為透過商城 cart/checkout 流程)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _UNUSED_EbookCheckoutPage_placeholder({ book, onBack, onSuccess }: { book: EbookItem; onBack: () => void; onSuccess: () => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'credit' | 'line'>('credit');
  const [processing, setProcessing] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        if (currentUser.displayName && !name) setName(currentUser.displayName);
        if (currentUser.email && !email) setEmail(currentUser.email);
      }
    });
    return unsub;
  }, []);

  const handleGoogleLogin = async () => {
    try { await signInWithPopup(auth, googleProvider); } catch (e) { console.error('Login failed:', e); }
  };

  const handleCheckout = async () => {
    if (!user) {
      alert('請先登入');
      return;
    }
    if (!name || !phone || !email) {
      alert('請填寫必填欄位');
      return;
    }
    setProcessing(true);
    try {
      // Step 1: Create WooCommerce order for ebook (virtual product)
      const orderData = {
        billing: { first_name: name, email, phone },
        line_items: [{ product_id: 0, quantity: 1, name: book.title, total: String(book.price) }],
        payment_method: paymentMethod === 'credit' ? 'credit_card' : 'line_pay',
        set_paid: false,
        meta_data: [
          { key: '_ebook_id', value: book.id },
          { key: '_ebook_email', value: email },
          { key: '_is_ebook_order', value: 'yes' },
        ],
      };

      const orderResponse = await fetch(`${API_BASE}/api/wc/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });

      if (!orderResponse.ok) throw new Error('建立訂單失敗');
      const order = await orderResponse.json();
      const orderId = order.id;

      // Step 2: Redirect to payment
      if (paymentMethod === 'credit') {
        await openPaymentUrl(`${API_BASE}/api/ecpay/create?order_id=${orderId}&payment=credit`);
      } else {
        const linePayResponse = await fetch(`${API_BASE}/api/linepay/request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: String(orderId),
            amount: book.price,
            products: [{ name: book.title, quantity: 1, price: book.price }],
          }),
        });
        if (!linePayResponse.ok) throw new Error('LINE Pay 請求失敗');
        const linePayData = await linePayResponse.json();
        const lpUrl = linePayData.paymentUrl || linePayData.info?.paymentUrl?.web;
        if (lpUrl) {
          await openPaymentUrl(lpUrl);
        } else {
          throw new Error('無法取得 LINE Pay 付款網址');
        }
      }

      // Step 3: After payment redirect back, grant access via Firestore
      // The backend webhook should handle this, but as a fallback we also try here
      try {
        const emailKey = email.replace(/\./g, '_');
        const docRef = doc(db, 'ebook_authorized', emailKey);
        const snap = await getDoc(docRef);
        const existingBooks: string[] = snap.exists() ? (snap.data()?.books || []) : [];
        if (!existingBooks.includes(book.id)) {
          existingBooks.push(book.id);
        }
        await setDoc(docRef, {
          active: true,
          books: existingBooks,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (e) {
        console.error('Firestore ebook auth write error (will be handled by webhook):', e);
      }

      setOrderComplete(true);
      alert(`訂單已建立！\n訂單編號: ${orderId}\n付款完成後即可閱讀「${book.title}」`);
    } catch (error) {
      console.error('Ebook checkout error:', error);
      alert('結帳失敗: ' + (error instanceof Error ? error.message : '未知錯誤'));
    } finally {
      setProcessing(false);
    }
  };

  if (orderComplete) {
    return (
      <motion.div className="space-y-6 text-center py-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <span className="text-6xl block">🎉</span>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>訂單已建立</h2>
        <p className="text-sm" style={{ color: '#8C7B72' }}>付款完成後，「{book.title}」將立即開通閱讀權限</p>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onSuccess}
          className="mx-auto px-8 py-3 rounded-2xl font-bold text-sm"
          style={{ backgroundColor: '#C9A96E', color: '#fff' }}
        >
          返回電子書書架
        </motion.button>
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <motion.button whileTap={{ scale: 0.9 }} onClick={onBack} className="text-xl">←</motion.button>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>💳 購買電子書</h2>
      </div>

      {/* Book Summary */}
      <div className="rounded-2xl overflow-hidden shadow-sm flex" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
        <div className="w-24 h-32 flex-shrink-0" style={{ backgroundColor: '#F5F0EB' }}>
          <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
        <div className="flex-1 p-4 flex flex-col justify-center">
          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{book.title}</p>
          <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>{book.subtitle}</p>
          <p className="text-lg font-bold mt-2" style={{ color: '#C9A96E' }}>NT$ {book.price}</p>
        </div>
      </div>

      {/* Login required */}
      {!user ? (
        <div className="rounded-2xl p-5 text-center space-y-3" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>請先登入</p>
          <p className="text-xs" style={{ color: '#8C7B72' }}>登入後即可購買並開通閱讀權限</p>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleGoogleLogin}
            className="w-full rounded-2xl py-3 font-medium text-sm flex items-center justify-center gap-2"
            style={{ backgroundColor: '#4285F4', color: '#fff' }}
          >
            🔑 使用 Google 帳號登入
          </motion.button>
        </div>
      ) : (
        <>
          {/* Customer Info */}
          <div className="rounded-2xl p-5 space-y-3" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
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
          </div>

          {/* Payment Method */}
          <div className="rounded-2xl p-5 space-y-3" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
            <p className="text-sm font-bold" style={{ color: '#3D3530' }}>💳 付款方式</p>
            <div className="space-y-2">
              {[
                { id: 'credit' as const, label: '信用卡付款', desc: 'Visa / Mastercard / JCB' },
                { id: 'line' as const, label: 'LINE Pay', desc: '使用 LINE Pay 付款' },
              ].map(method => (
                <label key={method.id} className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all" style={{ backgroundColor: paymentMethod === method.id ? '#E8F0E8' : '#FAF8F5', border: `1px solid ${paymentMethod === method.id ? '#8FA886' : '#F0EDE8'}` }}>
                  <input type="radio" name="payment" checked={paymentMethod === method.id} onChange={() => setPaymentMethod(method.id)} className="accent-amber-600" />
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#3D3530' }}>{method.label}</p>
                    <p className="text-[10px]" style={{ color: '#8C7B72' }}>{method.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Order Summary */}
          <div className="rounded-2xl p-5" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
            <div className="flex justify-between items-center">
              <p className="text-sm" style={{ color: '#8C7B72' }}>電子書</p>
              <p className="text-sm" style={{ color: '#3D3530' }}>{book.title}</p>
            </div>
            <div className="border-t mt-3 pt-3 flex justify-between items-center" style={{ borderColor: '#F0EDE8' }}>
              <p className="text-sm font-bold" style={{ color: '#3D3530' }}>合計</p>
              <p className="text-lg font-bold" style={{ color: '#C9A96E' }}>NT$ {book.price}</p>
            </div>
          </div>

          {/* Checkout Button */}
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleCheckout}
            disabled={processing}
            className="w-full rounded-2xl py-4 font-bold text-sm shadow-md"
            style={{ backgroundColor: processing ? '#B0A89E' : '#C9A96E', color: '#fff' }}
          >
            {processing ? '處理中...' : `確認付款 NT$ ${book.price}`}
          </motion.button>

          <p className="text-[10px] text-center pb-4" style={{ color: '#B0A89E' }}>
            付款成功後將立即開通「{book.title}」閱讀權限
          </p>
        </>
      )}
    </motion.div>
  );
}

// ===================== PAGE: 客製化精油 =====================

function CustomOilPage({ user, records }: { user: User | null; records: HealingRecord[] }) {
  const todayRecord = records.find(r => r.date === getToday());
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionKey | null>(
    todayRecord?.emotion || null
  );
  const [notes, setNotes] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [orders, setOrders] = useState<Array<{
    id?: string;
    emotion: EmotionKey;
    tags: string[];
    notes: string;
    oils: string[];
    description: string;
    timestamp: number;
    status: string;
  }>>([]);

  const MOOD_TAGS = [
    { key: '放鬆', emoji: '🧘' },
    { key: '提神', emoji: '⚡' },
    { key: '助眠', emoji: '🌙' },
    { key: '減壓', emoji: '🌿' },
    { key: '提升專注', emoji: '🎯' },
    { key: '情緒修復', emoji: '💕' },
    { key: '增加自信', emoji: '✨' },
    { key: '創意靈感', emoji: '🎨' },
  ];

  const recommendation = selectedEmotion ? getOilRecommendation(selectedEmotion) : null;
  const emoInfo = selectedEmotion ? getEmotionInfo(selectedEmotion) : null;

  // 載入過往訂單
  useEffect(() => {
    if (user) {
      const loadOrders = async () => {
        try {
          const colRef = collection(db, 'custom_oil_orders');
          const q = query(colRef, where('userId', '==', user.uid), orderBy('timestamp', 'desc'));
          const snapshot = await getDocs(q);
          setOrders(snapshot.docs.map(d => ({
            id: d.id,
            emotion: d.data().emotion,
            tags: d.data().tags || [],
            notes: d.data().notes || '',
            oils: d.data().oils || [],
            description: d.data().description || '',
            timestamp: d.data().timestamp,
            status: d.data().status || 'pending',
          })));
        } catch (e) {
          console.error('載入客製化訂單失敗:', e);
        }
      };
      loadOrders();
    }
  }, [user]);

  const handleSubmit = async () => {
    if (!selectedEmotion || !recommendation) return;

    const order = {
      emotion: selectedEmotion,
      tags: selectedTags,
      notes: notes.trim(),
      oils: recommendation.oils,
      description: recommendation.description,
      timestamp: Date.now(),
      status: 'pending',
    };

    if (user) {
      try {
        const colRef = collection(db, 'custom_oil_orders');
        const docRef = await addDoc(colRef, {
          userId: user.uid,
          ...order,
          createdAt: Timestamp.now(),
        });
        setOrders(prev => [{ id: docRef.id, ...order }, ...prev]);
      } catch (e) {
        console.error('提交客製化訂單失敗:', e);
      }
    } else {
      // 未登入存 localStorage
      const stored = JSON.parse(localStorage.getItem('custom_oil_orders') || '[]');
      stored.unshift(order);
      localStorage.setItem('custom_oil_orders', JSON.stringify(stored));
      setOrders(prev => [order, ...prev]);
    }

    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setNotes('');
      setSelectedTags([]);
    }, 3000);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  return (
    <motion.div
      className="space-y-5"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* Header */}
      <motion.div variants={staggerItem}>
        <p className="text-xs tracking-widest" style={{ color: '#C9A96E' }}>專屬於你的</p>
        <p className="text-xl font-bold" style={{ color: '#3D3530' }}>客製化香氛配方</p>
        <p className="text-xs mt-1" style={{ color: '#8C7B72' }}>
          根據你的情緒狀態，由調香師為你量身調配
        </p>
      </motion.div>

      {/* 情緒選擇 */}
      <motion.div variants={staggerItem} className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
        <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>選擇你目前的情緒狀態</p>
        <div className="grid grid-cols-3 gap-2">
          {MAIN_EMOTIONS.slice(0, 6).map((emo) => (
            <motion.button
              key={emo.key}
              whileTap={{ scale: 0.92 }}
              onClick={() => setSelectedEmotion(emo.key)}
              className="flex flex-col items-center gap-1 p-3 rounded-2xl transition-all"
              style={{
                backgroundColor: selectedEmotion === emo.key ? emo.color + '25' : '#FAF8F5',
                border: selectedEmotion === emo.key ? `2px solid ${emo.color}` : '2px solid transparent',
              }}
            >
              <span className="text-2xl">{emo.emoji}</span>
              <span className="text-xs font-medium" style={{
                color: selectedEmotion === emo.key ? emo.color : '#8C7B72'
              }}>{emo.label}</span>
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* 推薦配方 */}
      <AnimatePresence>
        {selectedEmotion && recommendation && (
          <motion.div
            variants={staggerItem}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-3xl p-5 shadow-sm"
            style={{ background: `linear-gradient(135deg, ${(emoInfo?.color || '#C9A96E')}15, #FFFEF9)` }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">{emoInfo?.emoji}</span>
              <p className="text-sm font-bold" style={{ color: '#3D3530' }}>
                為「{emoInfo?.label}」推薦的調理配方
              </p>
            </div>
            <div className="rounded-2xl p-4 mb-3" style={{ backgroundColor: 'white' }}>
              <p className="text-xs font-medium mb-2" style={{ color: '#C9A96E' }}>🌿 建議精油組合</p>
              <div className="flex flex-wrap gap-2 mb-2">
                {recommendation.oils.map((oil, i) => (
                  <span key={i} className="px-3 py-1 rounded-full text-xs font-medium"
                    style={{ backgroundColor: (emoInfo?.color || '#C9A96E') + '20', color: emoInfo?.color || '#C9A96E' }}>
                    {oil}
                  </span>
                ))}
              </div>
              <p className="text-xs leading-relaxed" style={{ color: '#8C7B72' }}>
                {recommendation.description}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 心情標籤 */}
      <motion.div variants={staggerItem} className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
        <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>想要達到的效果</p>
        <div className="flex flex-wrap gap-2">
          {MOOD_TAGS.map(({ key, emoji }) => (
            <motion.button
              key={key}
              whileTap={{ scale: 0.92 }}
              onClick={() => toggleTag(key)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                backgroundColor: selectedTags.includes(key) ? '#C9A96E20' : '#FAF8F5',
                color: selectedTags.includes(key) ? '#C9A96E' : '#8C7B72',
                border: selectedTags.includes(key) ? '1.5px solid #C9A96E' : '1.5px solid transparent',
              }}
            >
              <span>{emoji}</span>
              <span>{key}</span>
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* 備註欄位 */}
      <motion.div variants={staggerItem} className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
        <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>給調香師的備註</p>
        <p className="text-xs mb-3" style={{ color: '#8C7B72' }}>
          描述你的狀況、偏好的味道、或任何想讓調香師知道的事
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="例如：最近工作壓力大，晚上容易失眠，喜歡木質調的味道..."
          rows={4}
          className="w-full rounded-2xl p-3 text-sm resize-none outline-none"
          style={{
            backgroundColor: '#FAF8F5',
            color: '#3D3530',
            border: '1px solid #E8E3DC',
          }}
        />
      </motion.div>

      {/* 提交按鈕 */}
      <motion.div variants={staggerItem}>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={handleSubmit}
          disabled={!selectedEmotion || submitted}
          className="w-full rounded-3xl py-4 text-sm font-bold transition-all"
          style={{
            background: selectedEmotion && !submitted
              ? 'linear-gradient(135deg, #C9A96E, #D4B87A)'
              : submitted ? '#8FA886' : '#E8E3DC',
            color: selectedEmotion || submitted ? 'white' : '#B5AFA8',
          }}
        >
          {submitted ? '✓ 已提交，調香師將為你配方' : '提交客製化需求'}
        </motion.button>
        {!user && (
          <p className="text-xs text-center mt-2" style={{ color: '#B5AFA8' }}>
            登入後可保存訂單記錄
          </p>
        )}
      </motion.div>

      {/* 歷史訂單 */}
      {orders.length > 0 && (
        <motion.div variants={staggerItem} className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>我的客製化記錄</p>
          <div className="space-y-3">
            {orders.slice(0, 5).map((order, i) => {
              const orderEmo = getEmotionInfo(order.emotion);
              const time = new Date(order.timestamp);
              const dateStr = `${time.getMonth() + 1}/${time.getDate()}`;
              return (
                <div key={i} className="rounded-2xl p-3" style={{ backgroundColor: '#FAF8F5' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span>{orderEmo.emoji}</span>
                      <span className="text-xs font-medium" style={{ color: orderEmo.color }}>{orderEmo.label}</span>
                      <span className="text-xs" style={{ color: '#B5AFA8' }}>{dateStr}</span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{
                      backgroundColor: order.status === 'pending' ? '#FFF3E0' : '#E8F5E9',
                      color: order.status === 'pending' ? '#E8A87C' : '#8FA886',
                    }}>
                      {order.status === 'pending' ? '配方中' : '已完成'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {order.oils.map((oil, j) => (
                      <span key={j} className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: '#E8E3DC', color: '#8C7B72' }}>{oil}</span>
                    ))}
                  </div>
                  {order.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {order.tags.map((tag, j) => (
                        <span key={j} className="text-xs" style={{ color: '#C9A96E' }}>#{tag}</span>
                      ))}
                    </div>
                  )}
                  {order.notes && (
                    <p className="text-xs mt-1 truncate" style={{ color: '#8C7B72' }}>{order.notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ===================== PAGE: 服務大廳 =====================

function ServiceHallPage({ onNavigate }: { onNavigate: (p: PageType) => void }) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [expandedAnswer, setExpandedAnswer] = useState<string | null>(null); // "catId-index"

  return (
    <motion.div className="space-y-5" {...fadeInUp}>
      {/* Header */}
      <div className="text-center pt-2 pb-1">
        <p className="text-2xl mb-2">🤲</p>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>今天，你想從哪裡開始呢？</h2>
        <p className="text-sm mt-2" style={{ color: '#8C7B72' }}>
          不急，先看看你現在比較需要哪一種陪伴。
        </p>
        <p className="text-xs mt-1" style={{ color: '#B5AFA8' }}>
          如果你還不知道怎麼說，也沒關係。
        </p>
      </div>

      {/* Category Cards */}
      <div className="space-y-3">
        {SERVICE_CATEGORIES.map((cat) => (
          <motion.div
            key={cat.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
          >
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                if (cat.navigateTo) {
                  onNavigate(cat.navigateTo);
                  return;
                }
                setExpandedCategory(expandedCategory === cat.id ? null : cat.id);
                setExpandedAnswer(null);
              }}
              className="w-full p-4 text-left flex items-center gap-3"
            >
              <span className="text-2xl">{cat.emoji}</span>
              <div className="flex-1">
                <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{cat.title}</p>
                <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>{cat.sub}</p>
              </div>
              <span className="text-xs" style={{ color: '#B5AFA8' }}>
                {cat.navigateTo ? '→' : expandedCategory === cat.id ? '收起' : '→'}
              </span>
            </motion.button>

            <AnimatePresence>
              {expandedCategory === cat.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 pt-1 space-y-2">
                    <p className="text-xs mb-1" style={{ color: '#B5AFA8' }}>先選一個最接近的方向：</p>
                    {cat.quickItems.map((item, i) => {
                      // Direct navigation items (e.g. "挑選課程" → shop)
                      if (item.navigateTo) {
                        return (
                          <motion.button
                            key={i}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => onNavigate(item.navigateTo!)}
                            className="w-full text-left px-3 py-2.5 rounded-xl text-xs flex items-center justify-between font-medium"
                            style={{ backgroundColor: '#8FA886', color: 'white' }}
                          >
                            <span>{item.q}</span>
                            <span style={{ fontSize: 10 }}>→</span>
                          </motion.button>
                        );
                      }

                      const answerKey = `${cat.id}-${i}`;
                      const isOpen = expandedAnswer === answerKey;
                      return (
                        <div key={i}>
                          <motion.button
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setExpandedAnswer(isOpen ? null : answerKey)}
                            className="w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between"
                            style={{
                              backgroundColor: isOpen ? '#3D353008' : '#FAF8F5',
                              color: '#5C534C',
                              border: `1px solid ${isOpen ? '#C9A96E40' : '#E8E3DC'}`,
                            }}
                          >
                            <span>{item.q}</span>
                            <span style={{ color: '#B5AFA8', fontSize: 10 }}>{isOpen ? '▲' : '▼'}</span>
                          </motion.button>
                          <AnimatePresence>
                            {isOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div
                                  className="px-3 py-3 text-xs leading-relaxed rounded-b-xl -mt-0.5"
                                  style={{ color: '#5C534C', backgroundColor: '#FAF8F500' }}
                                >
                                  {item.a}
                                  <div className="mt-2 pt-2 flex gap-2 flex-wrap" style={{ borderTop: '1px solid #F0EDE8' }}>
                                    {item.shopCategory && (
                                      <motion.button
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => onNavigate('shop')}
                                        className="px-3 py-1 rounded-full text-[10px] font-medium"
                                        style={{ backgroundColor: '#8FA886', color: 'white' }}
                                      >
                                        去看看精油
                                      </motion.button>
                                    )}
                                    <motion.a
                                      whileTap={{ scale: 0.95 }}
                                      href="https://page.line.me/296yrpvh?openQrModal=true"
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-3 py-1 rounded-full text-[10px]"
                                      style={{ backgroundColor: '#00C300', color: 'white' }}
                                    >
                                      還是想聊聊
                                    </motion.a>
                                    <motion.a
                                      whileTap={{ scale: 0.95 }}
                                      href="tel:0223714171"
                                      className="px-3 py-1 rounded-full text-[10px]"
                                      style={{ backgroundColor: '#FAF8F5', color: '#8C7B72', border: '1px solid #E8E3DC' }}
                                    >
                                      打電話
                                    </motion.a>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>

      {/* Bottom CTAs */}
      <div className="space-y-2 pt-2">
        <motion.a
          whileTap={{ scale: 0.97 }}
          href="https://page.line.me/296yrpvh?openQrModal=true"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl text-sm font-bold"
          style={{ backgroundColor: '#00C300', color: 'white' }}
        >
          <span>💬</span>
          <span>找真人聊聊</span>
        </motion.a>
        <p className="text-center text-xs" style={{ color: '#B5AFA8' }}>
          電話：02-2371-4171（每天 10:00-22:00）
        </p>
      </div>
    </motion.div>
  );
}

// ===================== PAGE: 我的陪伴清單 (Wishlist) =====================

function WishlistPage({ onNavigate }: { onNavigate: (p: PageType) => void }) {
  const [items, setItems] = useState<WishlistItem[]>(() => loadWishlist());
  const [activeTag, setActiveTag] = useState<WishlistTag | '全部'>('全部');
  const [toast, setToast] = useState('');

  const filtered = activeTag === '全部' ? items : items.filter(w => w.tag === activeTag);

  const removeItem = (productId: number) => {
    const updated = items.filter(w => w.productId !== productId);
    setItems(updated);
    saveWishlist(updated);
    setToast('沒關係，隨時可以再回來看');
    setTimeout(() => setToast(''), 2000);
  };

  const changeTag = (productId: number, tag: WishlistTag) => {
    const updated = items.map(w => w.productId === productId ? { ...w, tag } : w);
    setItems(updated);
    saveWishlist(updated);
  };

  if (items.length === 0) {
    return (
      <motion.div className="space-y-5" {...fadeInUp}>
        <div>
          <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>我的陪伴清單</h2>
          <p className="text-sm mt-0.5" style={{ color: '#8C7B72' }}>留著慢慢看的東西，都在這裡</p>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-8 text-center space-y-4"
          style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
        >
          <p className="text-4xl">💭</p>
          <p className="text-sm" style={{ color: '#8C7B72' }}>
            還沒有留下什麼，<br/>去逛逛商城，看到喜歡的可以收進來。
          </p>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => onNavigate('shop')}
            className="px-6 py-2.5 rounded-xl text-sm font-medium"
            style={{ backgroundColor: '#8FA886', color: 'white' }}
          >
            去逛逛
          </motion.button>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-4" {...fadeInUp}>
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>我的陪伴清單</h2>
        <p className="text-sm mt-0.5" style={{ color: '#8C7B72' }}>
          你留了 {items.length} 個想看的
        </p>
      </div>

      {/* Tag Filter */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        <button
          onClick={() => setActiveTag('全部')}
          className="px-3 py-1.5 rounded-full text-xs whitespace-nowrap font-medium"
          style={{
            backgroundColor: activeTag === '全部' ? '#3D3530' : '#FAF8F5',
            color: activeTag === '全部' ? 'white' : '#8C7B72',
            border: '1px solid ' + (activeTag === '全部' ? '#3D3530' : '#E8E3DC'),
          }}
        >
          全部 ({items.length})
        </button>
        {WISHLIST_TAGS.map(t => {
          const count = items.filter(w => w.tag === t.key).length;
          if (count === 0) return null;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTag(t.key)}
              className="px-3 py-1.5 rounded-full text-xs whitespace-nowrap font-medium"
              style={{
                backgroundColor: activeTag === t.key ? '#3D3530' : '#FAF8F5',
                color: activeTag === t.key ? 'white' : '#8C7B72',
                border: '1px solid ' + (activeTag === t.key ? '#3D3530' : '#E8E3DC'),
              }}
            >
              {t.emoji} {t.key} ({count})
            </button>
          );
        })}
      </div>

      {/* Items */}
      <div className="space-y-3">
        {filtered.map((item) => (
          <motion.div
            key={item.productId}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="rounded-2xl p-3 flex gap-3"
            style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
          >
            {/* Image */}
            <div
              className="w-20 h-20 rounded-xl flex-shrink-0 flex items-center justify-center"
              style={{ backgroundColor: '#FAF8F5' }}
            >
              {item.image ? (
                <img src={item.image} alt={item.name} className="w-full h-full rounded-xl object-cover" />
              ) : (
                <span className="text-2xl">📦</span>
              )}
            </div>
            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: '#3D3530' }}>{item.name}</p>
              <p className="text-sm font-bold mt-0.5" style={{ color: '#8FA886' }}>NT${Number(item.price).toLocaleString()}</p>
              {/* Tag selector */}
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {WISHLIST_TAGS.map(t => (
                  <button
                    key={t.key}
                    onClick={() => changeTag(item.productId, t.key)}
                    className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: item.tag === t.key ? '#3D353015' : 'transparent',
                      color: item.tag === t.key ? '#3D3530' : '#B5AFA8',
                      border: `1px solid ${item.tag === t.key ? '#3D353030' : '#E8E3DC'}`,
                    }}
                  >
                    {t.emoji} {t.key}
                  </button>
                ))}
              </div>
            </div>
            {/* Remove */}
            <button onClick={() => removeItem(item.productId)} className="self-start p-1">
              <span className="text-xs" style={{ color: '#B5AFA8' }}>✕</span>
            </button>
          </motion.div>
        ))}
      </div>

      {/* CTA */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => onNavigate('shop')}
        className="w-full py-3 rounded-2xl text-sm font-medium"
        style={{ backgroundColor: '#FAF8F5', color: '#8C7B72', border: '1px solid #F0EDE8' }}
      >
        繼續逛逛
      </motion.button>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl text-xs font-medium shadow-lg"
            style={{ backgroundColor: '#3D3530', color: 'white' }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ===================== COMPONENT: 陪伴推薦模組 =====================

function CompanionRecommendation({ emotion, onNavigate }: { emotion?: EmotionKey; onNavigate: (p: PageType) => void }) {
  if (!emotion) return null;
  const suggestions = EMOTION_PRODUCT_SUGGESTIONS[emotion] || EMOTION_PRODUCT_SUGGESTIONS['tired'];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-3xl p-5 shadow-sm space-y-3"
      style={{ background: 'linear-gradient(135deg, #FAF8F520, #FFFEF9)' }}
    >
      <div>
        <p className="text-sm font-bold" style={{ color: '#3D3530' }}>也許可以試試看</p>
        <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>
          根據你今天的感受，這些可能適合你
        </p>
      </div>
      <div className="space-y-2">
        {suggestions.map((s, i) => (
          <motion.button
            key={i}
            whileTap={{ scale: 0.97 }}
            onClick={() => onNavigate('shop')}
            className="w-full flex items-center gap-3 p-3 rounded-2xl text-left"
            style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
          >
            <span className="text-2xl">{s.emoji}</span>
            <div>
              <p className="text-sm font-medium" style={{ color: '#3D3530' }}>{s.title}</p>
              <p className="text-xs" style={{ color: '#8C7B72' }}>{s.desc}</p>
            </div>
            <span className="ml-auto text-xs" style={{ color: '#B5AFA8' }}>→</span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

// ===================== COMPONENT: 動手做一點什麼 =====================

function HandsOnCard({ onNavigate }: { onNavigate: (p: PageType) => void }) {
  const [currentIndex] = useState(() => Math.floor(Math.random() * HANDS_ON_CARDS.length));
  const card = HANDS_ON_CARDS[currentIndex];
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => onNavigate('shop')}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="w-full rounded-3xl p-5 shadow-sm text-left"
      style={{ background: 'linear-gradient(135deg, #F5EDE4, #FFFEF9)', border: '1px solid #F0EDE8' }}
    >
      <div className="flex items-center gap-3">
        <span className="text-3xl">{card.emoji}</span>
        <div className="flex-1">
          <p className="text-xs font-medium mb-0.5" style={{ color: '#C9A96E' }}>動手做一點什麼</p>
          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{card.title}</p>
          <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>{card.desc}</p>
        </div>
        <span className="text-sm" style={{ color: '#C9A96E' }}>→</span>
      </div>
    </motion.button>
  );
}

// ===================== BOTTOM NAV =====================

// ===================== PAGE: 探索 (Explore - Cards + Psychological Tests) =====================

// ===== 療癒心理測驗 Data =====
interface HealingTestQuestion {
  question: string;
  options: { key: 'A' | 'B' | 'C' | 'D'; text: string }[];
}
interface HealingTestResult {
  key: 'A' | 'B' | 'C' | 'D';
  emoji: string;
  title: string;
  subtitle: string;
  description: string;
  recommendation: string;
  shareQuote: string;
}
interface HealingTest {
  id: number;
  emoji: string;
  title: string;
  subtitle: string;
  questions: HealingTestQuestion[];
  results: HealingTestResult[];
}

const HEALING_TESTS: HealingTest[] = [
  {
    id: 1, emoji: '🌙', title: '你最近是哪一種累？',
    subtitle: '不是所有疲憊都長一樣。有些是身體的，有些是心裡的。',
    questions: [
      { question: '最近最常出現的感覺是？', options: [
        { key: 'A', text: '一直在回訊息、回事情，腦袋停不下來' },
        { key: 'B', text: '人沒怎樣，心卻一直悶悶的' },
        { key: 'C', text: '明明事情很多，卻提不起勁開始' },
        { key: 'D', text: '想一個人待著，不太想被打擾' },
      ]},
      { question: '下班後你最常是？', options: [
        { key: 'A', text: '滑手機滑很久，像在發呆' },
        { key: 'B', text: '會想很多，心裡還沒收工' },
        { key: 'C', text: '只想躺著，什麼都不想做' },
        { key: 'D', text: '只想安靜，不太想說話' },
      ]},
      { question: '如果現在給你一個晚上，你最想要？', options: [
        { key: 'A', text: '腦袋安靜下來，不要再轉了' },
        { key: 'B', text: '有人懂你最近為什麼累' },
        { key: 'C', text: '好好睡一覺，醒來輕一點' },
        { key: 'D', text: '留一點時間，只和自己待著' },
      ]},
      { question: '你最需要被補回來的是？', options: [
        { key: 'A', text: '專注和清晰' },
        { key: 'B', text: '心裡的鬆動感' },
        { key: 'C', text: '體力和元氣' },
        { key: 'D', text: '空間和安靜' },
      ]},
    ],
    results: [
      { key: 'A', emoji: '🌀', title: '腦袋很滿型', subtitle: '你不是不累，是太多事一直沒有真正停下來',
        description: '最近最累的，是一直停不下來的腦袋。你需要的不是再撐一下，而是先把雜音放低。',
        recommendation: '精油調香體驗 / 森林系白噪音', shareQuote: '你不是沒用心，你只是太久沒有靜下來。' },
      { key: 'B', emoji: '☁️', title: '心裡悶住型', subtitle: '表面還好，心裡其實累了一陣子',
        description: '你不是做不到，只是心裡堆了太多感受。比起逼自己振作，你更需要一個慢慢鬆開的出口。',
        recommendation: '花藝手作 / 陪伴卡片', shareQuote: '有些累不是看得見的，但它一直都在。' },
      { key: 'C', emoji: '🔋', title: '電量見底型', subtitle: '最近的你，需要先補回元氣',
        description: '這種累很真實，連開始都要用力。先別急著恢復效率，先把自己慢慢顧回來。',
        recommendation: '在家材料包 / 睡前香氣', shareQuote: '現在的你，不需要衝，只需要慢慢回來。' },
      { key: 'D', emoji: '🌿', title: '想安靜一下型', subtitle: '你不是冷淡，只是最近太需要自己的空間',
        description: '你最近最需要的，不是熱鬧，而是一點不被打擾的時間，讓心慢慢回到自己身上。',
        recommendation: '植栽手作 / 安靜陪伴', shareQuote: '這幾天想安靜一點，把時間慢慢還給自己。' },
    ],
  },
  {
    id: 2, emoji: '💬', title: '你在關係裡最常卡住的是什麼？',
    subtitle: '有些不舒服，不一定是誰不好，可能只是你太常把自己放到後面。',
    questions: [
      { question: '關係裡最常讓你心裡卡一下的是？', options: [
        { key: 'A', text: '明明有話，最後還是沒說' },
        { key: 'B', text: '一直在配合，久了有點累' },
        { key: 'C', text: '很在意，但又不想表現得太明顯' },
        { key: 'D', text: '總覺得只有自己比較認真' },
      ]},
      { question: '你比較像哪一種人？', options: [
        { key: 'A', text: '會先吞下來，之後再自己消化' },
        { key: 'B', text: '常常先顧別人，再想到自己' },
        { key: 'C', text: '外表看起來還好，其實很在乎' },
        { key: 'D', text: '會默默觀察誰比較主動、誰比較冷淡' },
      ]},
      { question: '你最想被怎麼對待？', options: [
        { key: 'A', text: '不用猜，能把話說清楚' },
        { key: 'B', text: '有人也能顧到你的感受' },
        { key: 'C', text: '有人看得出你沒說出口的在意' },
        { key: 'D', text: '彼此都願意，不要只靠一邊撐' },
      ]},
      { question: '現在的你，比較需要的是？', options: [
        { key: 'A', text: '更坦白一點' },
        { key: 'B', text: '多照顧自己一點' },
        { key: 'C', text: '不要一直假裝沒事' },
        { key: 'D', text: '分清楚誰值得你放進心上' },
      ]},
    ],
    results: [
      { key: 'A', emoji: '🕊️', title: '把話留在心裡型', subtitle: '你不是沒感受，只是太習慣先收著',
        description: '很多話你不是沒有，只是一直放著。可感受放久了，心真的會累。你需要的，是慢慢說清楚。',
        recommendation: '日記頁 / 陪伴卡片', shareQuote: '有些話，說出來會比放著更輕。' },
      { key: 'B', emoji: '🤲', title: '總在照顧別人型', subtitle: '你很會體貼，卻很少先想到自己',
        description: '你不是不願意付出，只是太常把自己放到最後。久了會累，因為你也需要被照顧。',
        recommendation: '香氣放鬆 / 晚間回饋', shareQuote: '有時候先照顧自己，關係才會更長久。' },
      { key: 'C', emoji: '🌫️', title: '看起來沒事型', subtitle: '你很會撐住表面，但心裡其實很有感',
        description: '你習慣把在意藏得很好，久了連別人都以為你真的沒事。其實你不是沒感覺，只是不想把場面弄得太難。',
        recommendation: '調香體驗 / 情緒打卡', shareQuote: '有些在意，不說破，也還是在。' },
      { key: 'D', emoji: '⚖️', title: '想要對等型', subtitle: '你最在乎的，是彼此都有把這段關係放在心上',
        description: '你要的不是轟轟烈烈，而是有來有往。當只剩自己在撐，心就會先退一步。你需要更清楚的靠近。',
        recommendation: '關係小測驗 / 手作雙人體驗', shareQuote: '好的關係，不是靠一個人一直很努力。' },
    ],
  },
  {
    id: 3, emoji: '🌧️', title: '壓力大的時候，你會先變成哪一種人？',
    subtitle: '每個人面對壓力，都有最先出現的樣子。',
    questions: [
      { question: '當事情一下子很多時，你通常會？', options: [
        { key: 'A', text: '先開始想很多，停不下來' },
        { key: 'B', text: '表面正常，身體卻開始很緊' },
        { key: 'C', text: '先拖一下，什麼都不想碰' },
        { key: 'D', text: '變得很安靜，不太想解釋' },
      ]},
      { question: '最容易出現的是哪一種？', options: [
        { key: 'A', text: '一直反覆想，怕自己漏掉什麼' },
        { key: 'B', text: '肩膀硬、呼吸淺、睡不好' },
        { key: 'C', text: '只想躺平，先不要叫我' },
        { key: 'D', text: '不太想回訊息，也不想說話' },
      ]},
      { question: '這時候你最怕別人怎麼對你？', options: [
        { key: 'A', text: '一直催你、一直問你' },
        { key: 'B', text: '叫你不要想太多' },
        { key: 'C', text: '說你是不是太懶' },
        { key: 'D', text: '逼你立刻說清楚現在怎麼了' },
      ]},
      { question: '你此刻最需要的是？', options: [
        { key: 'A', text: '先把腦袋安靜下來' },
        { key: 'B', text: '讓身體鬆一點' },
        { key: 'C', text: '先休息，不要硬撐' },
        { key: 'D', text: '留一點空間給自己' },
      ]},
    ],
    results: [
      { key: 'A', emoji: '🌀', title: '腦內開會型', subtitle: '你的壓力，通常先出現在腦袋裡',
        description: '你很容易先把每件事想過一輪。可事情一多，腦袋會比身體先累。你需要先把速度降下來。',
        recommendation: '白噪音 / 呼吸任務', shareQuote: '先讓腦袋安靜一點，答案才會浮上來。' },
      { key: 'B', emoji: '🫁', title: '身體先緊型', subtitle: '你總說沒事，但身體早就知道了',
        description: '你可能還沒意識到壓力，肩膀、呼吸、睡眠就先有反應了。與其一直撐，不如先把身體放回來。',
        recommendation: '呼吸引導 / 睡前香氣', shareQuote: '先讓身體鬆開，心才會慢慢跟上。' },
      { key: 'C', emoji: '🛋️', title: '先停住型', subtitle: '你不是懶，只是壓力一來會先卡住',
        description: '事情一多一亂，你不是不想做，而是需要先停一下。適合你的，不是硬衝，而是先從最小的一步開始。',
        recommendation: '微任務 / 在家手作', shareQuote: '先動一點點，也算往前。' },
      { key: 'D', emoji: '🌙', title: '先安靜型', subtitle: '壓力大的時候，你會先把心收回來',
        description: '你不是故意疏遠，只是壓力一來，會先把自己藏好。你需要的不是被追問，而是一點能慢慢回來的空間。',
        recommendation: '安靜陪伴 / 晚間日記', shareQuote: '有些時候，不說話也是在保護自己。' },
    ],
  },
  {
    id: 4, emoji: '🏠', title: '你現在最需要哪一種生活感？',
    subtitle: '有時候不是情緒太多，只是日子失去了你喜歡的樣子。',
    questions: [
      { question: '最近最想把哪一種東西帶回生活裡？', options: [
        { key: 'A', text: '香氣，讓空間安靜下來' },
        { key: 'B', text: '秩序，讓日子不要這麼亂' },
        { key: 'C', text: '色彩和漂亮的小東西' },
        { key: 'D', text: '溫度，讓人一回家就鬆一點' },
      ]},
      { question: '如果今天突然空出兩小時，你想怎麼用？', options: [
        { key: 'A', text: '在房間待著，點香或聽聲音' },
        { key: 'B', text: '整理桌面、把空間收順' },
        { key: 'C', text: '做點手作，讓心有地方放' },
        { key: 'D', text: '泡杯茶，慢慢過完這段時間' },
      ]},
      { question: '你最想改善的，是生活裡哪一塊？', options: [
        { key: 'A', text: '一回家腦袋還停不下來' },
        { key: 'B', text: '最近生活有點散、有點亂' },
        { key: 'C', text: '日子有點平，想有一點新的感覺' },
        { key: 'D', text: '每天都在撐，想有一點被安放的感覺' },
      ]},
      { question: '你理想中的生活角落，比較像？', options: [
        { key: 'A', text: '安靜、有味道、有自己的節奏' },
        { key: 'B', text: '清爽、整齊、看了就舒服' },
        { key: 'C', text: '有作品、有顏色、有自己的痕跡' },
        { key: 'D', text: '溫暖、柔和、一坐下來就不想走' },
      ]},
    ],
    results: [
      { key: 'A', emoji: '🌿', title: '需要安靜感', subtitle: '你最近最需要的，是讓空間替你慢下來',
        description: '不是事情太多，而是你太久沒有待在一個讓心安靜的空間裡。你適合慢慢把生活調回來。',
        recommendation: '香氛 / 白噪音 / 睡前儀式', shareQuote: '先讓空間慢下來，心也會跟著慢下來。' },
      { key: 'B', emoji: '🪴', title: '需要秩序感', subtitle: '你不是控制狂，你只是需要日子重新變得清楚',
        description: '生活一亂，你就容易先失去力氣。你需要的不是更拚，而是找回一點秩序和呼吸感。',
        recommendation: '植栽 / 整理型手作 / 居家提案', shareQuote: '把日子理順一點，心就有地方落下來。' },
      { key: 'C', emoji: '🎨', title: '需要新鮮感', subtitle: '你最近缺的，不是努力，是一點新的感覺',
        description: '有時心悶，不一定是難過，只是太久沒有被新東西碰一下。你適合動手做點什麼，讓生活重新有火花。',
        recommendation: '畫畫 / 手作飾品 / 花藝', shareQuote: '生活有時只差一點新的光。' },
      { key: 'D', emoji: '🕯️', title: '需要被安放感', subtitle: '你最近最想要的，其實是一種終於可以放下來的感覺',
        description: '你撐了很多，也習慣自己消化。現在的你，需要的不只是放鬆，而是終於可以放下來的感覺。',
        recommendation: '蠟燭 / 晚間陪伴', shareQuote: '今天先到這裡，也很好。' },
    ],
  },
  {
    id: 5, emoji: '✨', title: '最近的你，比較像哪一種正在恢復的人？',
    subtitle: '恢復不一定很明顯，但你其實已經在路上了。',
    questions: [
      { question: '最近哪一種小變化，你最有感？', options: [
        { key: 'A', text: '沒有那麼容易緊張了' },
        { key: 'B', text: '比較願意把心打開一點' },
        { key: 'C', text: '開始知道自己要什麼了' },
        { key: 'D', text: '比較會替自己留時間了' },
      ]},
      { question: '你最近更常對自己說的是？', options: [
        { key: 'A', text: '先不要急' },
        { key: 'B', text: '慢慢來就好' },
        { key: 'C', text: '這次想照自己的感覺走' },
        { key: 'D', text: '今天先顧到自己' },
      ]},
      { question: '如果現在回頭看前陣子的自己，你最想說？', options: [
        { key: 'A', text: '你其實比想像中更穩' },
        { key: 'B', text: '你沒有白白難過' },
        { key: 'C', text: '你終於比較清楚了' },
        { key: 'D', text: '你真的辛苦了，現在可以慢一點' },
      ]},
      { question: '你現在最想帶著哪一種感覺往前？', options: [
        { key: 'A', text: '安定' },
        { key: 'B', text: '柔軟' },
        { key: 'C', text: '篤定' },
        { key: 'D', text: '鬆一點' },
      ]},
    ],
    results: [
      { key: 'A', emoji: '🌤️', title: '慢慢穩下來型', subtitle: '你不一定變得很快，但真的比以前更穩了',
        description: '你的恢復不是一下子變好，而是那些容易晃動的地方，現在慢慢站穩了。',
        recommendation: '穩定香氣 / 白噪音', shareQuote: '不是一下子變好，是慢慢站穩。' },
      { key: 'B', emoji: '💗', title: '心慢慢打開型', subtitle: '你開始願意再相信一點、再靠近一點',
        description: '你不是忘了那些難，而是開始願意重新感受。那是一種很溫柔的勇敢。',
        recommendation: '陪伴卡 / 柔和香氣', shareQuote: '心願意再打開一點，本身就是一種前進。' },
      { key: 'C', emoji: '🧭', title: '方向慢慢清楚型', subtitle: '你最近的改變，是開始知道什麼適合自己',
        description: '你不一定什麼都想清楚了，但開始分得出，什麼是你要的，什麼不是。這就是方向感。',
        recommendation: '情緒打卡 / 日記', shareQuote: '有些清楚，不是一下子想通，是慢慢分出來的。' },
      { key: 'D', emoji: '🍵', title: '終於比較會照顧自己型', subtitle: '你開始不再一直透支自己了',
        description: '這不只是休息，而是你終於開始把自己放進生活裡。能走到這一步，很不容易。',
        recommendation: '晚間回饋 / 微任務 / 居家陪伴', shareQuote: '先把自己放回來，很多事就不一樣了。' },
    ],
  },
  {
    id: 6, emoji: '🎁', title: '別人會想把哪一種溫度留在你身邊？',
    subtitle: '有些人一出現，就讓人覺得世界柔了一點。',
    questions: [
      { question: '朋友最常因為什麼想起你？', options: [
        { key: 'A', text: '你很會聽，也很會陪' },
        { key: 'B', text: '你有自己的品味和節奏' },
        { key: 'C', text: '你做事很穩，讓人放心' },
        { key: 'D', text: '你總會記得一些小細節' },
      ]},
      { question: '如果要用一種感覺形容你，比較像？', options: [
        { key: 'A', text: '安靜的溫柔' },
        { key: 'B', text: '好看的生活感' },
        { key: 'C', text: '穩穩的安心' },
        { key: 'D', text: '被放在心上的感覺' },
      ]},
      { question: '你最自然會做的是？', options: [
        { key: 'A', text: '陪對方把話說完' },
        { key: 'B', text: '把普通日子過得有一點美' },
        { key: 'C', text: '事情來了先穩住場面' },
        { key: 'D', text: '記得別人喜歡什麼、在意什麼' },
      ]},
      { question: '如果有人想送你一份禮物，最像會送？', options: [
        { key: 'A', text: '一張寫了很多話的卡片' },
        { key: 'B', text: '一個有質感的小物' },
        { key: 'C', text: '一個很實用、每天都能用的東西' },
        { key: 'D', text: '一份看得出有特別準備過的心意' },
      ]},
    ],
    results: [
      { key: 'A', emoji: '🤍', title: '安靜陪伴型', subtitle: '你給人的感覺，是不用多說也會安心',
        description: '你不是最熱鬧的那種人，但你在的時候，氣氛會慢慢安定下來。很多人喜歡你，因為你在旁邊就夠了。',
        recommendation: '陪伴卡 / 晚安語錄 / 柔和香氣', shareQuote: '有些人不用做很多，就已經很讓人安心。' },
      { key: 'B', emoji: '🌸', title: '生活感很美型', subtitle: '你會把普通的日子，過得有一點好看',
        description: '你給人的感覺不是浮誇，而是有自己的審美和節奏。你總能替生活放進一點剛剛好的美。',
        recommendation: '花藝 / 居家手作 / 風格選物', shareQuote: '把日子過得有一點美，本身就是一種能力。' },
      { key: 'C', emoji: '🪵', title: '穩穩讓人放心型', subtitle: '你身上有一種很難得的安定感',
        description: '你未必最搶眼，但別人遇到事情時，會想起你。你給人的感覺，是踏實，也是可靠。',
        recommendation: '木質調香氣 / 實用型手作', shareQuote: '穩穩地在，本身就是一種溫度。' },
      { key: 'D', emoji: '💌', title: '很有心型', subtitle: '你給人的感覺，是被放在心上的那種暖',
        description: '你會記得很多小事，也總能讓人感覺自己不是被隨便對待的。這份細膩，很珍貴。',
        recommendation: '小卡 / 客製手作', shareQuote: '真正的溫柔，常常藏在小地方。' },
    ],
  },
];

// ===================== PAGE: AI CUSTOMER SERVICE =====================

const CS_LINE_URL = 'https://page.line.me/296yrpvh?openQrModal=true';

interface CSCta {
  label: string;
  type: 'line' | 'shop' | 'shop-category' | 'product';
  categoryId?: number;
  productId?: number;
}

interface CSKnowledgeItem {
  id: string;
  category: string;
  keywords: string[];
  question: string;
  answer: string;
  priority: number;
  ctas?: CSCta[];
}

// 18. 智能客服知識庫 (CS_KNOWLEDGE_BASE)
const CS_KNOWLEDGE_BASE: CSKnowledgeItem[] = [
  { id: 'crystal-bracelet-intro', category: '水晶手鍊', keywords: ['水晶', '手鍊', '手鏈', '手環', '串珠', '礦石', '串水晶', '手串'], question: '水晶手鍊課程是什麼？', answer: '我們提供水晶手鍊 DIY 體驗！您可以在店內挑選喜歡的天然水晶礦石，我們有兩種模式，一種是看說明書製作，有分成一般899 和高階水晶1599，不過有問題現場老師都在唷，每天從下午1點到7點都有場次。另一種是老師教學，會依照老師的開課場次，可以進到商城選擇喔。全程約 1～1.5 小時，完成後可直接帶走還有包裝唷！', priority: 10, ctas: [{ label: '🔮 自己做一般水晶', type: 'product', productId: 48980 }, { label: '💎 自己做高階水晶', type: 'product', productId: 105051 }, { label: '👩‍🏫 老師教學', type: 'product', productId: 22659 }] },
  { id: 'crystal-booking', category: '水晶手鍊', keywords: ['預約', '怎麼預約', '如何預約', '要預約', '報名', '怎麼報名', '預訂', '怎麼訂'], question: '水晶手鍊怎麼預約？', answer: '您可以直接到我們的商城選擇「水晶手鍊自己做」進行線上預約，選擇日期與時間後完成付款即可。', priority: 10, ctas: [{ label: '🔮 自己做一般水晶', type: 'product', productId: 48980 }, { label: '💎 自己做高階水晶', type: 'product', productId: 105051 }] },
  { id: 'crystal-price', category: '水晶手鍊', keywords: ['多少錢', '價格', '費用', '價位', '收費', '水晶.*錢', '水晶.*費', '590', '899', '1599'], question: '水晶手鍊多少錢？', answer: '我們提供水晶手鍊 DIY 體驗！我們有兩種版本，一種是看說明書製作，有分成一般899 和高階水晶1599，不過有問題現場老師都在唷！每天從下午1點到7點都有場次。全程約 1～1.5 小時，完成後可直接帶走還有包裝唷！', priority: 9, ctas: [{ label: '🔮 自己做一般水晶', type: 'shop-category', categoryId: 200 }, { label: '💎 自己做高階水晶', type: 'shop-category', categoryId: 200 }] },
  { id: 'crystal-own-material', category: '水晶手鍊', keywords: ['自備', '自己帶', '自己的水晶', '加進去', '自帶'], question: '可以自備水晶嗎？', answer: '可以唷！如果您有自己的水晶想加進手鍊裡，歡迎帶來，在串製的時候直接加進去就好～', priority: 7 },
  { id: 'crystal-material', category: '水晶手鍊', keywords: ['材料', '有哪些', '什麼水晶', '選擇', '種類', '紅瑪瑙', '黃水晶', '青金石', '紫水晶'], question: '有什麼水晶材料可以選？', answer: '我們店內提供多種天然水晶礦石可以挑選，包含紫水晶、粉水晶、白水晶、黃水晶、紅瑪瑙、虎眼石、青金石等破百種。實際品項以現場庫存為準，歡迎到店挑選您喜歡的！', priority: 7 },
  { id: 'crystal-tablet-vs-teacher', category: '水晶手鍊', keywords: ['平板', '差異', '差別', '不同', '真人', '自己做', '老師教'], question: '平板教學跟真人老師教學有什麼不同？', answer: '平板教學是看平板上的說明自己操作完成，費用較低（590 元起）。真人老師教學會有專業講師手把手帶您製作，體驗更深入，適合團體包班或想深度學習的朋友。但即使是選擇平板教學也可以很輕鬆的完成喔，有不懂的也可以隨時問現場的工作人員。', priority: 8 },
  { id: 'booking-flow', category: '預約流程', keywords: ['預約', '怎麼預約', '如何預約', '預約流程', '步驟', '報名', '怎麼報名'], question: '要怎麼預約體驗課程？', answer: '預約方式有兩種：\n1️⃣ 線上預約：到頁面裡的療癒商城或是到官網 www.xiabenhow.com 選擇課程 → 選日期時間 → 填寫資料 → 完成付款\n2️⃣ 企業包班預約：直接在 LINE 官方帳號告訴我們想要的課程、日期、人數，小編會協助您安排！\n\n請問您要哪一種？', priority: 10, ctas: [{ label: '🛒 前往療癒商城', type: 'shop' }, { label: '💬 企業包班 LINE 諮詢', type: 'line' }] },
  { id: 'booking-need', category: '預約流程', keywords: ['需要預約', '要預約嗎', '可以直接去', '現場', 'walk in'], question: '需要預約嗎？可以直接去嗎？', answer: '建議先預約唷！這樣可以確保您到店時有座位和材料。如果想直接來，也可以先透過 LINE 確認當天是否還有空位～', priority: 8 },
  { id: 'booking-confirm', category: '預約流程', keywords: ['預約完成', '成功', '確認', '這樣就預約', '有預約到'], question: '怎麼確認預約成功？', answer: '完成線上預約並付款後，系統會發送確認通知到您的信箱。有不確定的話也可以 Line 詢問我們', priority: 7 },
  { id: 'price-general', category: '價格費用', keywords: ['多少錢', '價格', '費用', '價位', '收費', '優惠', '折扣', '便宜'], question: '課程費用大概多少？', answer: '不同課程費用不同，以下是參考：\n🔮 （平板自助）：590 元起\n🕯️ 蠟燭 / 擴香課程：依項目而定\n🌿 多肉植物 / 水晶手鍊 / 花藝：依項目而定\n\n可以進到商城看不同課程喔\n團體包班另有優惠方案，歡迎透過 LINE 詢問詳細報價！', priority: 9, ctas: [{ label: '🛒 前往商城看課程', type: 'shop' }] },
  { id: 'price-deposit', category: '價格費用', keywords: ['訂金', '定金', '先付', '預付'], question: '需要先付訂金嗎？', answer: '個人預約通常在線上預約時直接付全額。企業包班或團體預約需先支付 50% 訂金，尾款在活動當天支付即可。', priority: 7 },
  { id: 'culture-coin', category: '價格費用', keywords: ['文化幣', '文化', '青年文化'], question: '可以使用文化幣嗎？', answer: '可以使用文化幣唷，不過會需要您先預約付款完後，到時候到現場掃碼退現金喔。', priority: 8 },
  { id: 'payment-methods', category: '付款方式', keywords: ['付款', '怎麼付', '付費', '信用卡', 'line pay', '匯款', '轉帳', '帳號', '現金'], question: '有哪些付款方式？', answer: '我們接受以下付款方式：\n💳 線上刷卡（官網預約時付款）\n🏦 銀行轉帳 / 匯款 / 💚 LINE Pay / 🏪 超商條碼\n💵 現場現金付款\n\n企業包班如需匯款，預約確認後會提供匯款帳號資訊。匯款完成請提供帳號後五碼方便財務核對～', priority: 8 },
  { id: 'payment-invoice', category: '付款方式', keywords: ['發票', '統編', '抬頭', '公司發票', '三聯', '電子發票'], question: '可以開發票嗎？', answer: '可以的！我們提供電子發票，開立後會直接寄送到您提供的電子信箱。如果需要開立公司抬頭的發票，請在預約時提供公司名稱和統一編號唷～', priority: 7 },
  { id: 'business-hours', category: '時間地點', keywords: ['營業', '幾點', '開門', '幾點到幾點', '週幾', '星期', '休息', '時間'], question: '營業時間是？', answer: '我們每天早上10點到晚上9點，不過水晶手鍊會是下午1點開始喔，您可以先在商城裡預約完成，有任何問題也可以點擊 Line 跟我們說。', priority: 8, ctas: [{ label: '🛒 前往商城預約', type: 'shop' }, { label: '💬 LINE 詢問', type: 'line' }] },
  { id: 'location', category: '時間地點', keywords: ['地址', '在哪', '地點', '怎麼去', '位置', '門市'], question: '店在哪裡？', answer: '我們在台北台中高雄皆有據點，台北門市在萬華區漢口街2段121號喔，可以在 Google Map 搜尋「下班隨手做」', priority: 8 },
  { id: 'parking', category: '時間地點', keywords: ['停車', '車位', '停車場', '開車'], question: '附近好停車嗎？', answer: '台北門市旁邊有西門町洛陽停車場。', priority: 5 },
  { id: 'duration', category: '時間地點', keywords: ['多久', '多長', '幾個小時', '多少時間', '要多久', '時間長度'], question: '課程大約要多久？', answer: '各課程時長不同：\n🔮 水晶手鍊：約 1～1.5 小時\n🕯️ 蠟燭 / 擴香：約 1～2 小時\n🌿 多肉 / 花藝：約 1.5～2 小時\n\n企業包班可依需求調整，含講解與製作通常安排 1.5～2 小時為佳。', priority: 8 },
  { id: 'cancel-policy', category: '取消退款', keywords: ['取消', '退款', '退費', '不去', '不能去'], question: '預約後可以取消嗎？', answer: '可以取消，但依據取消時間有不同的退款比例。一般來說，提前通知可退 80% 的費用。建議盡早告知我們以便安排，不過課程當天沒辦法改期或取消喔，詳細退款政策請透過 LINE 與小編確認。', priority: 8 },
  { id: 'reschedule', category: '取消退款', keywords: ['改期', '更改', '換時間', '延期', '改日期', '改時間'], question: '可以改期嗎？', answer: '可以的！請提前透過 LINE 告知想更改的新日期與時間，小編會幫您確認是否還有名額並協助調整。不過當天課程沒辦法改期，建議您至少提前 1-2 天通知唷～', priority: 8 },
  { id: 'enterprise-intro', category: '企業活動', keywords: ['企業', '公司', '團體', 'team', '包場', '包班', '員工', 'team building', '團建', '公司活動'], question: '有提供企業包班嗎？', answer: '有的！我們提供企業手作活動與包班服務。可選擇水晶手鍊、蠟燭、擴香、多肉植物等多種手作項目。我們可以到貴公司場地授課，也可以在我們的教室進行。歡迎透過 LINE 告知您的需求，我們會提供專屬報價！', priority: 9 },
  { id: 'enterprise-onsite', category: '企業活動', keywords: ['到公司', '到場', '外派', '上門', '到府', '出差', '場地'], question: '老師可以到公司教學嗎？', answer: '可以的！我們提供到府教學服務，老師會帶齊所有材料到貴公司場地授課。外派教學會有車馬費（依距離而定），詳細費用會在報價單中說明。', priority: 8 },
  { id: 'enterprise-headcount', category: '企業活動', keywords: ['最少', '最多', '幾人', '人數', '幾個人', '最低', '起跳'], question: '企業包班最少要幾個人？', answer: '如果是在門市，6人以上可以包班，如果人數不足，也可以參考我們的個人預約體驗，如果到公司行號上課，會有最低預約人數，您可以透過 Line 跟我們聯繫', priority: 7, ctas: [{ label: '💬 LINE 聯繫包班', type: 'line' }] },
  { id: 'enterprise-quote', category: '企業活動', keywords: ['報價', '怎麼算', '費用怎麼算', '報價單', '估價'], question: '企業活動費用怎麼算？', answer: '企業活動費用會依據以下因素報價：\n📋 課程項目（水晶、蠟燭、擴香等）\n👥 參加人數\n📍 上課地點（店內或外派）\n⏰ 活動時長\n\n請透過 LINE 提供以上資訊，我們會盡快開立報價單給您！通常需先支付 50% 訂金確認檔期。', priority: 8, ctas: [{ label: '💬 LINE 索取報價單', type: 'line' }] },
  { id: 'course-types', category: '課程種類', keywords: ['有什麼課', '哪些課', '什麼可以做', '課程', '項目', '種類', '體驗', '可以做什麼', '手作'], question: '有哪些課程可以體驗？', answer: '我們提供多種療癒手作體驗：\n🔮 水晶手鍊 DIY\n🕯️ 香氛蠟燭製作\n🌸 擴香石 / 擴香花泥盤\n🌿 多肉植物組盆\n💐 乾燥花 / 永生花\n🎨 流體畫\n💎 水晶飾品\n🧴 香水調製 皮革 藍染\n\n各項目詳細內容與價格請到商城頁面或是官網 www.xiabenhow.com 查看！', priority: 9, ctas: [{ label: '🛒 前往商城看課程', type: 'shop' }] },
  { id: 'candle-course', category: '課程種類', keywords: ['蠟燭', '香氛蠟燭', '蠟燭課'], question: '蠟燭課程怎麼預約？', answer: '蠟燭課程可以到商城頁面或在官網 www.xiabenhow.com 上搜尋「蠟燭」找到相關課程並線上預約。也可以透過 LINE 告訴我們您想體驗的蠟燭類型（容器蠟燭、柱狀蠟燭等），小編會協助您預約唷！', priority: 7 },
  { id: 'succulent-course', category: '課程種類', keywords: ['多肉', '植物', '組盆', '盆栽'], question: '多肉植物課程有嗎？', answer: '有的！我們有多肉植物組盆體驗課程，可以挑選喜歡的多肉品種和花盆，在老師指導下完成屬於自己的小盆栽。適合個人或團體包班，歡迎到官網或 LINE 查詢預約～', priority: 7 },
  { id: 'diffuser-course', category: '課程種類', keywords: ['擴香', '擴香石', '泥盤', '花泥盤', '擴香座'], question: '擴香課程有什麼？', answer: '我們有擴香石、水泥六角擴香花泥盤等多種擴香手作課程。製作完成後可以搭配精油使用，讓您的空間充滿香氣！詳情請到官網查看或 LINE 詢問～', priority: 6 },
  { id: 'perfume-course', category: '課程種類', keywords: ['香水', '調香', '調製', '香味'], question: '有香水調製課程嗎？', answer: '有的！我們有提供香水 / 調香體驗課程，可以在專業指導下調製出屬於自己獨特氣味的香水。歡迎到官網查看「調香」相關課程或透過 LINE 詢問最新場次！', priority: 6 },
  { id: 'kids-age', category: '小孩年齡', keywords: ['小孩', '兒童', '幾歲', '年齡', '小朋友', '孩子', '親子', '小孩可以', '帶小孩'], question: '小孩可以參加嗎？幾歲可以做？', answer: '大部分課程適合 10 歲以上的小朋友參加。10 歲以下的小朋友建議由家長陪同一起製作。部分精細課程可能不太適合太小的孩子，可以透過 LINE 跟我們確認適合的年齡範圍唷！', priority: 8 },
  { id: 'customization', category: '客製化', keywords: ['客製', '訂製', '特別', '設計', 'logo', '文字', '刻字'], question: '可以客製化嗎？', answer: '部分產品支持客製化（如企業活動加 logo 等），但一般個人課程使用的是固定模具，文字或圖案的客製化比較有限。如果有特殊需求，歡迎透過 LINE 告訴我們，我們會評估是否能達成您的想法！', priority: 7 },
  { id: 'take-home', category: '其他', keywords: ['帶回', '帶走', '回家', '提袋', '袋子', '打包'], question: '作品可以帶回家嗎？', answer: '當然可以！手作完成後就是您的作品，可以直接帶走。部分需要等待乾燥的作品（如蠟燭），老師會教您如何安全攜帶。我們也會提供提袋方便您帶回～', priority: 6 },
  { id: 'not-finished', category: '其他', keywords: ['做不完', '來不及', '半成品', '沒做完'], question: '時間內做不完怎麼辦？', answer: '不用擔心！老師會依進度彈性調整，大部分的人都能在時間內完成。如果真的來不及，老師也會協助您喔', priority: 5 },
  { id: 'greeting', category: '問候', keywords: ['你好', '哈囉', '嗨', 'hi', 'hello', '安安', '午安', '早安', '晚安'], question: '你好', answer: '您好！歡迎來到下班隨手作 🌿 我是智能客服小助手，可以幫您解答課程、預約、價格等常見問題。請問有什麼我可以幫您的呢？', priority: 3 },
  { id: 'thanks', category: '問候', keywords: ['謝謝', '感謝', '感恩', '3q', 'thanks', 'thx'], question: '謝謝', answer: '不客氣～很高興能幫到您！如果還有其他問題，隨時都可以問我唷 😊', priority: 2 },
  { id: 'contact-human', category: '聯繫客服', keywords: ['真人', '客服', '小編', '打電話', '聯繫', '聯絡', '通話', '電話'], question: '想找真人客服', answer: '沒問題！如果需要更詳細的協助，歡迎透過以下方式聯繫我們的真人客服：\n📱 LINE 官方帳號：搜尋「下班隨手作」\n🌐 官網：www.xiabenhow.com\n\n小編會在上班時間盡快回覆您！', priority: 8, ctas: [{ label: '💬 LINE 聯繫真人客服', type: 'line' }] },
  { id: 'teacher-nationwide', category: '全台教學', keywords: ['全台', '老師', '哪裡有', '其他城市', '台中', '台南', '高雄', '新竹'], question: '其他縣市也有老師可以教學嗎？', answer: '有的！我們在全台各地都有合作老師可以提供教學服務。無論您在台北、台中、台南、高雄或其他地區，都歡迎透過 LINE 跟我們詢問您所在區域的老師檔期與課程安排！', priority: 7 },
  { id: 'buy-material-only', category: '其他', keywords: ['買材料', '只要材料', '材料包', '不上課', '回家做'], question: '可以只買材料不上課嗎？', answer: '可以的！我們有提供材料包販售。您可以在官網上選購材料包回家自己 DIY，也可以到店裡挑選材料。詳情可到療癒商城選購或官網 www.xiabenhow.com 查看商品區，或 LINE 詢問。', priority: 6, ctas: [{ label: '📦 前往 DIY 材料包', type: 'shop-category', categoryId: 75 }] },
];

const CS_QUICK_QUESTIONS = [
  { emoji: '🔮', label: '水晶手鍊', query: '水晶手鍊課程是什麼' },
  { emoji: '📅', label: '怎麼預約', query: '怎麼預約' },
  { emoji: '💰', label: '價格費用', query: '課程費用' },
  { emoji: '🏢', label: '企業包班', query: '企業包班' },
  { emoji: '📍', label: '地點時間', query: '營業時間在哪裡' },
  { emoji: '🔄', label: '取消改期', query: '取消改期' },
  { emoji: '💳', label: '付款方式', query: '付款方式' },
  { emoji: '👶', label: '小孩可以嗎', query: '小孩可以參加嗎' },
  { emoji: '⏱️', label: '要多久', query: '課程多久' },
  { emoji: '📋', label: '課程種類', query: '有哪些課程' },
];

function matchCSAnswer(input: string): CSKnowledgeItem[] {
  const q = input.toLowerCase().trim();
  if (!q) return [];
  const scored: { item: CSKnowledgeItem; score: number }[] = [];
  for (const item of CS_KNOWLEDGE_BASE) {
    let score = 0;
    for (const kw of item.keywords) {
      if (kw.includes('.*')) { try { if (new RegExp(kw, 'i').test(q)) score += 5; } catch { /* skip */ } }
      else if (q.includes(kw)) { score += 4 + kw.length; }
    }
    if (q.includes(item.category)) score += 3;
    const qChars = [...new Set(q.split(''))];
    const questionChars = [...new Set(item.question.split(''))];
    const overlap = qChars.filter(c => questionChars.includes(c) && c.trim()).length;
    if (overlap > 3) score += overlap * 0.3;
    score += item.priority * 0.2;
    if (score > 2) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map(s => s.item);
}

interface CSMessage { id: string; role: 'user' | 'bot'; text: string; time: string; ctas?: CSCta[]; }

function CustomerServicePage({ onNavigate, onOpenProduct }: { onNavigate: (page: PageType) => void; onOpenProduct?: (productId: number) => void }) {
  const [messages, setMessages] = useState<CSMessage[]>([{ id: 'welcome', role: 'bot', text: '您好！歡迎來到下班隨手作 🌿\n我是智能客服小助手，可以幫您解答課程、預約、價格等常見問題。\n\n請直接輸入您的問題，或點選下方常見問題快速查詢！', time: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) }]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, []);
  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const handleCtaClick = useCallback((cta: CSCta) => {
    if (cta.type === 'line') window.open(CS_LINE_URL, '_blank');
    else if (cta.type === 'product' && cta.productId && onOpenProduct) onOpenProduct(cta.productId);
    else onNavigate('shop');
  }, [onNavigate, onOpenProduct]);

  const handleSend = useCallback((text?: string) => {
    const msg = (text || inputText).trim();
    if (!msg) return;
    const now = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    setMessages(prev => [...prev, { id: `user-${Date.now()}`, role: 'user', text: msg, time: now }]);
    setInputText('');
    setIsTyping(true);
    setTimeout(() => {
      const matches = matchCSAnswer(msg);
      let botText: string; let botCtas: CSCta[] | undefined;
      if (matches.length > 0) {
        botText = matches[0].answer; botCtas = matches[0].ctas;
        if (matches.length > 1) botText += '\n\n💡 您可能也想知道：\n' + matches.slice(1).map(m => `• ${m.question}`).join('\n');
      } else {
        botText = '抱歉，我暫時無法回答這個問題 😅\n\n建議您透過 LINE 聯繫真人客服，小編會在上班時間盡快回覆您！';
        botCtas = [{ label: '💬 LINE 聯繫真人客服', type: 'line' }];
      }
      setMessages(prev => [...prev, { id: `bot-${Date.now()}`, role: 'bot', text: botText, time: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }), ctas: botCtas }]);
      setIsTyping(false);
    }, 600 + Math.random() * 400);
  }, [inputText]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen flex flex-col pt-10" style={{ backgroundColor: '#FFFEF9' }}>
      <div className="px-4 py-3 text-center" style={{ backgroundColor: '#F0EDE8' }}>
        <h1 className="text-lg font-bold" style={{ color: '#3D3530' }}>🤖 智能客服</h1>
        <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>下班隨手作 ｜ 常見問題即時回覆</p>
      </div>
      <div className="px-3 py-2 overflow-x-auto flex gap-2 flex-nowrap" style={{ backgroundColor: '#F8F5F0' }}>
        {CS_QUICK_QUESTIONS.map((q) => (
          <button key={q.label} onClick={() => handleSend(q.query)} className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all active:scale-95" style={{ backgroundColor: '#FFFEF9', color: '#3D3530', border: '1px solid #D2B4A1' }}>{q.emoji} {q.label}</button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3" style={{ minHeight: 0 }}>
        {messages.map((msg) => (
          <div key={msg.id}>
            <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'bot' && <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mr-2 mt-1" style={{ backgroundColor: '#D2B4A1' }}><span className="text-sm">🌿</span></div>}
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${msg.role === 'user' ? 'rounded-tr-sm' : 'rounded-tl-sm'}`} style={{ backgroundColor: msg.role === 'user' ? '#D2B4A1' : '#F0EDE8', color: msg.role === 'user' ? '#FFFEF9' : '#3D3530' }}>
                <p className="text-sm whitespace-pre-line leading-relaxed">{msg.text}</p>
                <p className="text-[10px] mt-1 text-right opacity-50">{msg.time}</p>
              </div>
            </div>
            {msg.ctas && msg.ctas.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2 ml-10">
                {msg.ctas.map((cta, idx) => (
                  <button key={idx} onClick={() => handleCtaClick(cta)} className="px-3.5 py-2 rounded-xl text-xs font-medium transition-all active:scale-95 shadow-sm" style={{ backgroundColor: cta.type === 'line' ? '#06C755' : '#D2B4A1', color: '#FFFFFF' }}>{cta.label}</button>
                ))}
              </div>
            )}
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mr-2 mt-1" style={{ backgroundColor: '#D2B4A1' }}><span className="text-sm">🌿</span></div>
            <div className="rounded-2xl rounded-tl-sm px-4 py-3" style={{ backgroundColor: '#F0EDE8' }}>
              <div className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: '#8C7B72', animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: '#8C7B72', animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: '#8C7B72', animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="px-3 py-3 border-t" style={{ borderColor: '#E8E4DF', backgroundColor: '#FFFEF9' }}>
        <div className="flex gap-2 items-center">
          <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSend(); }} placeholder="輸入您的問題..." className="flex-1 rounded-full px-4 py-2.5 text-sm outline-none" style={{ backgroundColor: '#F0EDE8', color: '#3D3530', border: '1px solid transparent' }} />
          <button onClick={() => handleSend()} disabled={!inputText.trim()} className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90" style={{ backgroundColor: inputText.trim() ? '#D2B4A1' : '#E8E4DF', color: '#FFFEF9' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>
        <div className="mt-2.5 flex justify-center">
          <a href={CS_LINE_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-5 py-2 rounded-full text-xs font-semibold transition-all active:scale-95 shadow-sm" style={{ backgroundColor: '#06C755', color: '#FFFFFF' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/></svg>
            找不到答案？LINE 聯繫真人客服
          </a>
        </div>
      </div>
    </motion.div>
  );
}

// ===================== MAIN COMPONENT =====================

export default function HealingApp() {
  const [page, _setPage] = useState<PageType>('home');
  const pageHistoryRef = useRef<PageType[]>(['home']);

  // Wrapped setPage that maintains history
  const setPage = useCallback((newPage: PageType) => {
    _setPage(prev => {
      // Don't push if same page
      if (prev !== newPage) {
        pageHistoryRef.current.push(newPage);
        // Push browser history state so back button works
        window.history.pushState({ page: newPage }, '', '');
      }
      // Reset shop initial view when leaving shop
      if (newPage !== 'shop') { setShopInitialView(undefined); setShopInitialProductId(undefined); }
      return newPage;
    });
  }, []);

  // Go back to previous page
  const goBack = useCallback(() => {
    const history = pageHistoryRef.current;
    if (history.length > 1) {
      history.pop(); // remove current
      const prevPage = history[history.length - 1];
      _setPage(prevPage);
    }
  }, []);
  // PWA 安裝提示
  const { canInstall, isIOS, isInstalled, isOffline, triggerInstall } = usePWA();
  const [showInstallBanner, setShowInstallBanner] = useState(true);

  const [user, setUser] = useState<User | null>(null);
  const [records, setRecords] = useState<HealingRecord[]>(() => {
    // 不再塞假資料，新用戶從空白開始
    return loadRecords();
  });

  // --- SHOP INITIAL VIEW STATE ---
  const [shopInitialView, setShopInitialView] = useState<'products' | 'cart' | 'checkout' | undefined>(undefined);
  const [shopInitialProductId, setShopInitialProductId] = useState<number | undefined>(undefined);

  const handleOpenProduct = useCallback((productId: number) => {
    setShopInitialProductId(productId);
    setShopInitialView(undefined);
    setPage('shop');
  }, []);

  // --- NEW STATE ---
  const [showMorningFlow, setShowMorningFlow] = useState(false);
  const [morningFlowEmotion, setMorningFlowEmotion] = useState<EmotionKey | null>(null);
  const [morningFlowLevel, setMorningFlowLevel] = useState<EmotionLevel>('L1');
  const [showMilestone, setShowMilestone] = useState<number | null>(null);
  const [isBedtimeFullscreen, setIsBedtimeFullscreen] = useState(false);

  // Initialize native app features (StatusBar, SplashScreen)
  useEffect(() => {
    initNativeApp();
  }, []);

  // Browser back button → navigate within app instead of leaving
  useEffect(() => {
    // Push initial state
    window.history.replaceState({ page: 'healer' }, '', '');

    const handlePopState = () => {
      const history = pageHistoryRef.current;
      if (history.length > 1) {
        history.pop();
        const prevPage = history[history.length - 1];
        _setPage(prevPage);
      } else {
        // At root — push state again to prevent leaving app
        window.history.pushState({ page: 'healer' }, '', '');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Listen for auth changes and load Firestore records if logged in
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        console.log('[Auth] User logged in:', currentUser.uid, currentUser.email);

        // ★ 重要：先把 localStorage 資料同步到 Firestore（防止之前寫入失敗的資料遺失）
        await syncAllLocalStorageToFirestore(currentUser.uid);

        // Load from Firestore if logged in
        const firestoreRecords = await loadRecordsFromFirestore(currentUser.uid);
        if (firestoreRecords.length > 0) {
          setRecords(firestoreRecords);
        }
        // Sync saved cards & wishlist from Firestore
        loadSavedCardsFromFirestore(currentUser.uid).catch(e => console.error('[Firestore] loadSavedCards:', e));
        loadWishlistFromFirestore(currentUser.uid).catch(e => console.error('[Firestore] loadWishlist:', e));
        // Load energy from Firestore
        loadEnergyFromFirestore(currentUser.uid).catch(e => console.error('[Firestore] loadEnergy:', e));
        // Load milestones from Firestore
        loadMilestonesFromFirestore(currentUser.uid).catch(e => console.error('[Firestore] loadMilestones:', e));
        // Load personality from Firestore
        loadPersonalityFromFirestore(currentUser.uid).catch(e => console.error('[Firestore] loadPersonality:', e));
        // Load test results from Firestore
        loadTestResultsFromFirestore(currentUser.uid).catch(e => console.error('[Firestore] loadTestResults:', e));
        // Load journal PIN from Firestore
        loadJournalPinFromFirestore(currentUser.uid).catch(e => console.error('[Firestore] loadJournalPin:', e));
        // Load aftercare from Firestore
        loadAftercareFromFirestore(currentUser.uid).catch(e => console.error('[Firestore] loadAftercare:', e));
        // Load app PIN from Firestore
        getDoc(doc(db, 'user_data', currentUser.uid)).then(snap => {
          if (snap.exists() && snap.data().appPin) localStorage.setItem('healing_app_pin', snap.data().appPin);
        }).catch(e => console.error('[Firestore] loadAppPin:', e));
      }
    });
    return unsubscribe;
  }, []);

  const completeTask = useCallback((_key: TaskKey) => {
    // 任務完成回調（保留以供其他頁面使用）
    // Task completion callback (kept for other pages)
  }, []);

  const handleCheckIn = useCallback((emotion: EmotionKey, level?: EmotionLevel, subEmotion?: string) => {
    const today = getToday();
    const lv = level || 'L1';
    const record: HealingRecord = { date: today, emotion, level: lv, subEmotion };
    setRecords(prev => {
      const filtered = prev.filter(r => r.date !== today);
      const updated = [...filtered, record];
      saveRecords(updated);
      if (user) {
        saveRecordToFirestore(user.uid, record);
      }
      return updated;
    });
    completeTask('checkin');
    // earnEnergy('checkin'); // 暫時隱藏
    setMorningFlowEmotion(emotion);
    setMorningFlowLevel(lv);
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

  const goToHealing = useCallback(() => setPage('healing'), []);
  const goToBedtime = useCallback(() => {
    setIsBedtimeFullscreen(true);
    setPage('bedtime');
  }, []);
  const goToSound = useCallback(() => setPage('sound'), []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAF8F5', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* 離線提示 */}
      {isOffline && (
        <div className="fixed top-0 left-0 right-0 z-50 text-center py-1 text-xs font-medium" style={{ backgroundColor: '#FFE0B2', color: '#E65100', paddingTop: 'calc(env(safe-area-inset-top) + 4px)' }}>
          目前離線中，部分功能可能受限
        </div>
      )}

      {/* PWA 安裝提示（僅在網頁瀏覽器中且未安裝時顯示） */}
      {!isNative() && !isInstalled && showInstallBanner && (canInstall || isIOS) && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed top-0 left-0 right-0 z-40"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="max-w-md mx-auto px-3 py-2">
            <div className="rounded-2xl px-4 py-3 shadow-lg" style={{ backgroundColor: '#FFFEF9', border: '1px solid #E8E0D8' }}>
              <div className="flex items-center gap-3">
                <span className="text-xl">📲</span>
                <div className="flex-1">
                  <p className="text-xs font-bold" style={{ color: '#3D3530' }}>
                    把「隨手作」加到主畫面
                  </p>
                  <p className="text-[10px]" style={{ color: '#8C7B72' }}>
                    {isIOS ? '像 App 一樣使用' : '像 App 一樣使用，隨時打開'}
                  </p>
                </div>
                {canInstall && (
                  <button
                    onClick={triggerInstall}
                    className="px-3 py-1.5 rounded-full text-xs font-bold"
                    style={{ backgroundColor: '#8FA886', color: 'white' }}
                  >
                    安裝
                  </button>
                )}
                <button
                  onClick={() => setShowInstallBanner(false)}
                  className="text-xs px-1"
                  style={{ color: '#8C7B72' }}
                >
                  ✕
                </button>
              </div>
              {/* iOS 專用安裝步驟引導 */}
              {isIOS && (
                <div className="mt-3 pt-3 space-y-2" style={{ borderTop: '1px solid #F0EDE8' }}>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: '#8FA88620', color: '#8FA886' }}>1</span>
                    <p className="text-[11px]" style={{ color: '#3D3530' }}>點 Safari 底部的 <span style={{ fontSize: '14px', verticalAlign: 'middle' }}>⬆</span> 分享按鈕</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: '#8FA88620', color: '#8FA886' }}>2</span>
                    <p className="text-[11px]" style={{ color: '#3D3530' }}>往下滑，找到「加入主畫面」</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: '#8FA88620', color: '#8FA886' }}>3</span>
                    <p className="text-[11px]" style={{ color: '#3D3530' }}>點「新增」就完成了！</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {!isBedtimeFullscreen && <BottomNav active={page} onChange={setPage} />}

      {/* Global Back Button — top left (hidden on main tab pages) */}
      {!isBedtimeFullscreen && pageHistoryRef.current.length > 1 && !NAV_ITEMS.some(item => item.key === page) && (
        <div className="fixed top-0 left-0 right-0 z-30 pointer-events-none" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="max-w-md mx-auto px-3 py-2">
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={() => window.history.back()}
              className="w-9 h-9 rounded-full flex items-center justify-center pointer-events-auto"
              style={{ backgroundColor: 'rgba(255,254,249,0.9)', backdropFilter: 'blur(8px)', border: '1px solid #F0EDE8', color: '#3D3530' }}
            >
              <span className="text-sm">←</span>
            </motion.button>
          </div>
        </div>
      )}

      <div className="max-w-md mx-auto px-4 pt-4 pb-32">
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
                onGoToHealing={goToHealing}
                onGoToBedtime={goToBedtime}
                onGoToDiary={() => setPage('diary')}
                onGoToCustom={() => setPage('custom')}
                onGoToSound={goToSound}
                onNavigate={(p) => setPage(p)}
                user={user}
              />
            )}
            {page === 'diary' && <DiaryPage records={records} onCheckIn={handleCheckIn} onUpdateRecord={(rec) => {
                  setRecords(prev => {
                    const filtered = prev.filter(r => r.date !== rec.date);
                    const updated = [...filtered, rec];
                    saveRecords(updated);
                    if (user) saveRecordToFirestore(user.uid, rec);
                    return updated;
                  });
                }} />}
            {page === 'sound' && <SoundPage recommendedEmotion={records.find(r => r.date === getToday())?.emotion} />}
            {page === 'healing' && (
              <HomePage
                records={records}
                onCheckIn={handleCheckIn}
                onGoToHealing={goToHealing}
                onGoToBedtime={goToBedtime}
                onGoToDiary={() => setPage('diary')}
                onGoToCustom={() => setPage('custom')}
                onNavigate={(p) => setPage(p)}
                user={user}
              />
            )}
            {page === 'bedtime' && <BedtimeRitualPage records={records} onClose={() => {
                  setIsBedtimeFullscreen(false);
                  setPage('home');
                }} />}
            {page === 'recipe' && (
              <RecipePage
                records={records}
                onCheckIn={handleCheckIn}
                onTaskComplete={completeTask}
                user={user}
                onNavigate={(p) => setPage(p)}
              />
            )}
            {page === 'card' && <CardPage onTaskComplete={completeTask} records={records} />}
            {page === 'healer' && <HealerPage records={records} userEmail={user?.email || null} onNavigate={(p) => setPage(p)} onTaskComplete={() => completeTask('checkin')} onCheckIn={(emotion) => handleCheckIn(emotion)} />}
            {page === 'journal' && <JournalPage user={user} />}
            {page === 'shop' && <ShopPage initialView={shopInitialView} initialProductId={shopInitialProductId} />}
            {page === 'library' && <HealingLibraryPage userEmail={user?.email || null} onNavigate={(p) => setPage(p)} />}
            {page === 'community' && <CommunityPage userEmail={user?.email || null} />}
            {page === 'explore' && <ExplorePage records={records} userEmail={user?.email || null} onNavigate={(p) => setPage(p)} />}
            {page === 'calendar' && <FragranceCalendarPage />}
            {page === 'ebook' && <EbookShelfPage userEmail={user?.email || null} onNavigate={(p) => setPage(p)} onPurchaseBook={(book) => {
              // Add ebook to cart (same localStorage as ShopPage) then navigate to shop cart
              const cartItem: CartItem = {
                id: `ebook-${book.id}`,
                productId: book.wcProductId,
                name: `📖 ${book.title}`,
                specs: '電子書',
                price: book.price,
                quantity: 1,
                isVirtual: true,
                image: book.coverUrl,
              };
              const currentCart = loadCartFromStorage();
              const exists = currentCart.find(c => c.id === cartItem.id);
              if (!exists) {
                currentCart.push(cartItem);
                saveCartToStorage(currentCart);
              }
              setShopInitialView('cart');
              setPage('shop');
            }} />}
            {page === 'member' && <MemberPage records={records} onNavigate={(p) => setPage(p)} />}
            {page === 'custom' && <CustomOilPage user={user} records={records} />}
            {page === 'service' && <ServiceHallPage onNavigate={(p) => setPage(p)} />}
            {page === 'wishlist' && <WishlistPage onNavigate={(p) => setPage(p)} />}
            {page === 'my-works' && <MyWorksWallPage userEmail={user?.email || null} onNavigate={(p) => setPage(p)} />}
            {page === 'collections' && <CollectionCenterPage userEmail={user?.email || null} onNavigate={(p) => setPage(p)} />}
            {page === 'course-journey' && <CourseJourneyPage userEmail={user?.email || null} />}
            {page === 'exclusive-content' && <ExclusiveContentPage userEmail={user?.email || null} />}
            {page === 'admin-dashboard' && <AdminDashboardPage onBack={() => setPage('member')} />}
            {page === 'xia-tasks' && <XiaTasksPage records={records} onNavigate={(p) => setPage(p)} />}
            {page === 'crystal-energy' && <CrystalEnergyPage />}
            {page === 'plant-care' && <PlantCarePage />}
            {page === 'oil-wiki' && <OilWikiPage />}
            {page === 'ai-cs' && <CustomerServicePage onNavigate={(p) => setPage(p)} onOpenProduct={handleOpenProduct} />}
          </motion.div>
        </AnimatePresence>
      </div>
      {/* TopNav 已移到頂部 */}

      {/* Morning Flow Modal */}
      <AnimatePresence>
        {showMorningFlow && morningFlowEmotion && (
          <MorningFlowModal
            emotion={morningFlowEmotion}
            level={morningFlowLevel}
            onDone={handleMorningFlowDone}
            onViewHealing={() => { handleMorningFlowDone(); setPage('healing'); }}
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


function PsychTestListView({ onSelectTest }: { onSelectTest: (test: HealingTest) => void }) {
  const completedTests = JSON.parse(localStorage.getItem('healing_test_results') || '{}');
  const completedCount = Object.keys(completedTests).length;

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <div className="rounded-2xl p-5 shadow-sm" style={{ background: 'linear-gradient(135deg, #E8E0F0 0%, #FFFEF9 100%)' }}>
        <div className="flex items-center gap-3">
          <span className="text-4xl">🔮</span>
          <div className="flex-1">
            <h3 className="text-lg font-bold" style={{ color: '#3D3530' }}>療癒心理測驗</h3>
            <p className="text-xs mt-1" style={{ color: '#8C7B72' }}>15 個精心設計的測驗，幫助你更了解自己</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold" style={{ color: '#C9A96E' }}>{completedCount}</p>
            <p className="text-[10px]" style={{ color: '#B5AFA8' }}>/ 15 完成</p>
          </div>
        </div>
        {completedCount > 0 && (
          <div className="mt-3 rounded-xl overflow-hidden" style={{ backgroundColor: '#F5F0EB', height: 6 }}>
            <motion.div
              className="h-full rounded-xl"
              style={{ backgroundColor: '#C9A96E', width: `${(completedCount / 15) * 100}%` }}
              initial={{ width: 0 }}
              animate={{ width: `${(completedCount / 15) * 100}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        )}
      </div>

      {/* Test list */}
      <div className="space-y-2.5">
        {HEALING_TESTS.map((test, i) => {
          const isCompleted = completedTests[test.id];
          const resultInfo = isCompleted ? test.results.find(r => r.key === isCompleted) : null;
          return (
            <motion.button key={test.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelectTest(test)}
              className="w-full rounded-2xl p-4 flex items-center gap-3 text-left"
              style={{ backgroundColor: isCompleted ? '#FFFEF9' : '#FAF8F5', border: isCompleted ? '1.5px solid #C9A96E30' : '1px solid #F0EDE8' }}>
              <span className="text-2xl">{test.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate" style={{ color: '#3D3530' }}>{test.title}</p>
                {isCompleted && resultInfo ? (
                  <p className="text-xs mt-0.5 truncate" style={{ color: '#C9A96E' }}>{resultInfo.emoji} {resultInfo.title}</p>
                ) : (
                  <p className="text-xs mt-0.5 truncate" style={{ color: '#8C7B72' }}>{test.questions.length} 題</p>
                )}
              </div>
              {isCompleted ? (
                <span className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0" style={{ backgroundColor: '#C9A96E15', color: '#C9A96E' }}>已完成</span>
              ) : (
                <span className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0" style={{ backgroundColor: '#F5F0EB', color: '#8C7B72' }}>開始</span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function PsychTestTakingView({ test, onComplete, onBack }: { test: HealingTest; onComplete: (resultKey: string) => void; onBack: () => void }) {
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const handleSelect = (key: string) => {
    setSelectedOption(key);
    setTimeout(() => {
      const newAnswers = [...answers, key];
      setAnswers(newAnswers);
      setSelectedOption(null);
      if (currentQ < test.questions.length - 1) {
        setCurrentQ(currentQ + 1);
      } else {
        // Calculate result
        const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
        newAnswers.forEach(a => { counts[a] = (counts[a] || 0) + 1; });
        const maxKey = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
        onComplete(maxKey);
      }
    }, 300);
  };

  const q = test.questions[currentQ];
  const progress = ((currentQ) / test.questions.length) * 100;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <motion.button whileTap={{ scale: 0.9 }} onClick={onBack}
          className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F5F0EB' }}>
          <span className="text-sm">←</span>
        </motion.button>
        <div className="flex-1">
          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{test.emoji} {test.title}</p>
          <p className="text-[10px]" style={{ color: '#B5AFA8' }}>第 {currentQ + 1} / {test.questions.length} 題</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#F5F0EB', height: 4 }}>
        <motion.div className="h-full rounded-xl" style={{ backgroundColor: '#C9A96E' }}
          animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
      </div>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div key={currentQ}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.25 }}
          className="space-y-4">
          <div className="rounded-2xl p-5" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
            <p className="text-base font-bold leading-relaxed" style={{ color: '#3D3530' }}>{q.question}</p>
          </div>

          <div className="space-y-2.5">
            {q.options.map((opt, i) => (
              <motion.button key={opt.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleSelect(opt.key)}
                className="w-full rounded-2xl p-4 text-left flex items-start gap-3"
                style={{
                  backgroundColor: selectedOption === opt.key ? '#C9A96E10' : '#FAF8F5',
                  border: selectedOption === opt.key ? '1.5px solid #C9A96E' : '1px solid #F0EDE8',
                  transition: 'all 0.2s',
                }}>
                <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5"
                  style={{
                    backgroundColor: selectedOption === opt.key ? '#C9A96E' : '#F0EDE8',
                    color: selectedOption === opt.key ? '#fff' : '#8C7B72',
                  }}>{opt.key}</span>
                <p className="text-sm leading-relaxed" style={{ color: '#3D3530' }}>{opt.text}</p>
              </motion.button>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function PsychTestResultView({ test, resultKey, onBack, onRetake }: { test: HealingTest; resultKey: string; onBack: () => void; onRetake: () => void }) {
  const result = test.results.find(r => r.key === resultKey)!;

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
      {/* Back button */}
      <div className="flex items-center gap-3">
        <motion.button whileTap={{ scale: 0.9 }} onClick={onBack}
          className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F5F0EB' }}>
          <span className="text-sm">←</span>
        </motion.button>
        <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{test.emoji} 測驗結果</p>
      </div>

      {/* Result card */}
      <motion.div className="rounded-2xl p-6 shadow-sm text-center"
        style={{ background: 'linear-gradient(135deg, #FFFEF9 0%, #F5F0EB 100%)' }}
        initial={{ y: 20 }} animate={{ y: 0 }}>
        <motion.span className="text-6xl block"
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }}>
          {result.emoji}
        </motion.span>
        <h3 className="text-xl font-bold mt-3" style={{ color: '#3D3530' }}>{result.title}</h3>
        <p className="text-sm mt-1" style={{ color: '#C9A96E' }}>{result.subtitle}</p>
      </motion.div>

      {/* Description */}
      <div className="rounded-2xl p-5" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
        <p className="text-sm leading-relaxed" style={{ color: '#5C534C' }}>{result.description}</p>
      </div>

      {/* Recommendation */}
      <div className="rounded-2xl p-4" style={{ backgroundColor: '#C9A96E10', border: '1px solid #C9A96E20' }}>
        <p className="text-xs font-bold mb-1" style={{ color: '#C9A96E' }}>推薦體驗</p>
        <p className="text-sm" style={{ color: '#3D3530' }}>{result.recommendation}</p>
      </div>

      {/* Share quote */}
      <div className="rounded-2xl p-4 text-center" style={{ backgroundColor: '#FAF8F5' }}>
        <p className="text-xs mb-2" style={{ color: '#B5AFA8' }}>分享語</p>
        <p className="text-sm italic leading-relaxed" style={{ color: '#8C7B72' }}>「{result.shareQuote}」</p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <motion.button whileTap={{ scale: 0.96 }} onClick={onRetake}
          className="flex-1 rounded-2xl p-3.5 text-sm font-bold"
          style={{ backgroundColor: '#F5F0EB', color: '#8C7B72' }}>
          重新測驗
        </motion.button>
        <motion.button whileTap={{ scale: 0.96 }} onClick={onBack}
          className="flex-1 rounded-2xl p-3.5 text-sm font-bold"
          style={{ backgroundColor: '#C9A96E', color: '#fff' }}>
          回到測驗列表
        </motion.button>
      </div>
    </motion.div>
  );
}

function PsychTestContainer() {
  const [view, setView] = useState<'list' | 'taking' | 'result'>('list');
  const [selectedTest, setSelectedTest] = useState<HealingTest | null>(null);
  const [resultKey, setResultKey] = useState<string | null>(null);

  const handleSelectTest = (test: HealingTest) => {
    // Check if already completed
    const completed = JSON.parse(localStorage.getItem('healing_test_results') || '{}');
    if (completed[test.id]) {
      setSelectedTest(test);
      setResultKey(completed[test.id]);
      setView('result');
    } else {
      setSelectedTest(test);
      setView('taking');
    }
  };

  const handleComplete = (key: string) => {
    if (!selectedTest) return;
    const completed = JSON.parse(localStorage.getItem('healing_test_results') || '{}');
    completed[selectedTest.id] = key;
    localStorage.setItem('healing_test_results', JSON.stringify(completed));
    try { const u = auth.currentUser; if (u) setDoc(doc(db, 'user_data', u.uid), { [`testResult_${selectedTest.id}`]: key }, { merge: true }).catch(e => console.error('[Firestore] write:', e)); } catch {}
    setResultKey(key);
    setView('result');
  };

  const handleRetake = () => {
    if (!selectedTest) return;
    const completed = JSON.parse(localStorage.getItem('healing_test_results') || '{}');
    delete completed[selectedTest.id];
    localStorage.setItem('healing_test_results', JSON.stringify(completed));
    try { const u = auth.currentUser; if (u) setDoc(doc(db, 'user_data', u.uid), { [`testResult_${selectedTest.id}`]: null }, { merge: true }).catch(e => console.error('[Firestore] write:', e)); } catch {}
    setView('taking');
  };

  return (
    <AnimatePresence mode="wait">
      {view === 'list' && (
        <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <PsychTestListView onSelectTest={handleSelectTest} />
        </motion.div>
      )}
      {view === 'taking' && selectedTest && (
        <motion.div key="taking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <PsychTestTakingView test={selectedTest} onComplete={handleComplete} onBack={() => setView('list')} />
        </motion.div>
      )}
      {view === 'result' && selectedTest && resultKey && (
        <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <PsychTestResultView test={selectedTest} resultKey={resultKey} onBack={() => setView('list')} onRetake={handleRetake} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}


function ExplorePage({ records, userEmail, onNavigate }: { records: HealingRecord[]; userEmail: string | null; onNavigate: (p: PageType) => void }) {
  const [activeTab, setActiveTab] = useState<'card' | 'tests' | 'personality'>('card');
  const personalityProfile = loadPersonalityProfile();
  const personalityInfo = personalityProfile ? HEALING_PERSONALITIES[personalityProfile.primary] : null;

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>🔮 探索</h2>
        <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>透過卡牌與測驗，更深入地認識自己</p>
      </div>

      {/* Tab 切換 */}
      <div className="flex gap-2">
        {[
          { key: 'card' as const, label: '✦ 療癒卡牌', desc: '每日一抽' },
          { key: 'tests' as const, label: '🌱 心理測驗', desc: '探索自己' },
          { key: 'personality' as const, label: '📋 測驗分析', desc: personalityInfo ? personalityInfo.label : '查看你的分析' },
        ].map(tab => (
          <motion.button key={tab.key} whileTap={{ scale: 0.96 }}
            onClick={() => setActiveTab(tab.key)}
            className="flex-1 rounded-2xl p-3 text-center"
            style={{
              backgroundColor: activeTab === tab.key ? '#FFFEF9' : '#FAF8F5',
              border: activeTab === tab.key ? '1.5px solid #C9A96E40' : '1px solid #F0EDE8',
            }}>
            <p className="text-sm font-bold" style={{ color: activeTab === tab.key ? '#3D3530' : '#8C7B72' }}>{tab.label}</p>
            <p className="text-[10px] mt-0.5" style={{ color: '#B5AFA8' }}>{tab.desc}</p>
          </motion.button>
        ))}
      </div>

      {/* 卡牌區 */}
      {activeTab === 'card' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <CardPage onTaskComplete={() => {}} records={records} />
        </motion.div>
      )}

      {/* 心理測驗區 */}
      {activeTab === 'tests' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <PsychTestContainer />
        </motion.div>
      )}

      {/* 療癒人格區 */}
      {activeTab === 'personality' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {personalityProfile ? (
            <>
              {/* 人格卡片 */}
              <div className="rounded-2xl p-5 shadow-sm" style={{ background: personalityInfo?.gradient || 'linear-gradient(135deg, #FFFEF9 0%, #FAF8F5 100%)' }}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-4xl">{personalityInfo?.emoji}</span>
                  <div>
                    <p className="text-lg font-bold" style={{ color: '#3D3530' }}>{personalityInfo?.label}</p>
                    <p className="text-xs" style={{ color: '#8C7B72' }}>{personalityInfo?.subtitle}</p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: '#5C534C' }}>{personalityInfo?.description}</p>
                {personalityInfo?.traits && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {personalityInfo.traits.map(trait => (
                      <span key={trait} className="text-xs px-2 py-1 rounded-lg" style={{ backgroundColor: '#FFFEF960', color: '#8C7B72' }}>{trait}</span>
                    ))}
                  </div>
                )}
              </div>
              {/* 分數條 */}
              <div className="rounded-2xl p-4 shadow-sm space-y-3" style={{ backgroundColor: '#FFFEF9' }}>
                <p className="text-sm font-bold" style={{ color: '#3D3530' }}>人格分佈</p>
                {(Object.keys(HEALING_PERSONALITIES) as HealingPersonalityType[]).map(type => {
                  const info = HEALING_PERSONALITIES[type];
                  const score = personalityProfile.scores[type] || 0;
                  const maxScore = Math.max(...Object.values(personalityProfile.scores));
                  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
                  return (
                    <div key={type}>
                      <div className="flex justify-between text-xs mb-1">
                        <span style={{ color: '#3D3530' }}>{info.emoji} {info.label}</span>
                        <span style={{ color: '#8C7B72' }}>{score}</span>
                      </div>
                      <div className="w-full h-2 rounded-full" style={{ backgroundColor: '#F0EDE8' }}>
                        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }}
                          className="h-full rounded-full" style={{ backgroundColor: info.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <PersonalityRecommendations profile={personalityProfile} />
            </>
          ) : (
            <PersonalityQuiz onComplete={() => window.location.reload()} />
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

// ===================== PAGE: 社群 (Community - Standalone) =====================
function CommunityPage({ userEmail }: { userEmail: string | null }) {
  const [communityView, setCommunityView] = useState<'board' | 'post'>('board');

  if (communityView === 'post') {
    return <PostWorkView userEmail={userEmail} goBack={() => setCommunityView('board')} />;
  }

  return <CommunityBoardStandalone userEmail={userEmail} onPost={() => setCommunityView('post')} />;
}

function CommunityBoardStandalone({ userEmail, onPost }: { userEmail: string | null; onPost: () => void }) {
  const [works, setWorks] = useState<CommunityWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedWork, setSelectedWork] = useState<CommunityWork | null>(null);
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState<{ id: string; userId: string; userName: string; text: string; createdAt: string }[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const q = query(collection(db, 'community_works'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setWorks(snap.docs.map(d => ({ id: d.id, ...d.data() } as CommunityWork)));
      setLoading(false);
    });
    return unsub;
  }, []);

  // Load user's liked works
  useEffect(() => {
    if (!userEmail) return;
    const q = query(collection(db, 'user_likes'), where('userId', '==', userEmail), where('itemType', '==', 'community'));
    const unsub = onSnapshot(q, (snap) => {
      setLikedIds(new Set(snap.docs.map(d => d.data().itemId)));
    });
    return unsub;
  }, [userEmail]);

  // Load comments when work is selected
  useEffect(() => {
    if (!selectedWork) return;
    const q = query(collection(db, 'community_works', selectedWork.id, 'comments'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });
    return unsub;
  }, [selectedWork?.id]);

  const handleLike = async (workId: string) => {
    if (!userEmail) return;
    const alreadyLiked = likedIds.has(workId);
    if (alreadyLiked) {
      // Unlike: decrement count and remove from user_likes
      await updateDoc(doc(db, 'community_works', workId), { likeCount: increment(-1) });
      try {
        const likesQ = query(collection(db, 'user_likes'), where('userId', '==', userEmail), where('itemId', '==', workId));
        const likesSnap = await getDocs(likesQ);
        for (const likeDoc of likesSnap.docs) { await deleteDoc(likeDoc.ref); }
      } catch (e) { console.error('[Firestore] unlike:', e); }
      setLikedIds(prev => { const next = new Set(prev); next.delete(workId); return next; });
    } else {
      // Like: increment count and add to user_likes
      await updateDoc(doc(db, 'community_works', workId), { likeCount: increment(1) });
      const work = displayWorks.find(w => w.id === workId);
      try { await addDoc(collection(db, 'user_likes'), { userId: userEmail, itemId: workId, itemType: 'community', title: work?.caption || '', author: work?.userName || '', emoji: work?.userEmoji || '🎨', likedAt: new Date().toISOString() }); } catch (e) { console.error('[Firestore] like:', e); }
      setLikedIds(prev => new Set(prev).add(workId));
    }
    hapticLight();
  };

  const handleComment = async () => {
    if (!userEmail || !selectedWork || !commentText.trim()) return;
    await addDoc(collection(db, 'community_works', selectedWork.id, 'comments'), {
      userId: userEmail,
      userName: userEmail.split('@')[0],
      text: commentText.trim(),
      createdAt: new Date().toISOString(),
    });
    await updateDoc(doc(db, 'community_works', selectedWork.id), { commentCount: increment(1) });
    setCommentText('');
    hapticLight();
  };

  const handleDelete = async (workId: string) => {
    if (!userEmail) return;
    await deleteDoc(doc(db, 'community_works', workId));
    setSelectedWork(null);
    hapticLight();
  };

  const filtered = filterType === 'all' ? works : works.filter(w => w.workType === filterType);

  const sampleWorks: CommunityWork[] = [
    { id: 'sw-1', userId: 'xiabenhow@gmail.com', userName: '下班隨手作', userEmoji: '🌿', imageUrl: 'https://xiabenhow.com/wp-content/uploads/2023/01/798738.jpg', thumbUrl: 'https://xiabenhow.com/wp-content/uploads/2023/01/798738.jpg', caption: '今天做的多肉組盆，選了三種不同顏色的多肉搭配在一起，好療癒', workType: 'plant', tags: ['#第一次做', '#超滿意'], likeCount: 0, commentCount: 0, createdAt: '2026-03-25' },
    { id: 'sw-2', userId: 'xiabenhow@gmail.com', userName: '下班隨手作', userEmoji: '🌿', imageUrl: 'https://xiabenhow.com/wp-content/uploads/2025/03/精油芳療滾珠瓶5.jpg', thumbUrl: 'https://xiabenhow.com/wp-content/uploads/2025/03/精油芳療滾珠瓶5.jpg', caption: '自己調的晚安香氣，薰衣草+雪松+佛手柑，聞了好放鬆', workType: 'fragrance', tags: ['#下班療癒', '#香氣迷人'], likeCount: 0, commentCount: 0, createdAt: '2026-03-24' },
    { id: 'sw-3', userId: 'xiabenhow@gmail.com', userName: '下班隨手作', userEmoji: '🌿', imageUrl: 'https://xiabenhow.com/wp-content/uploads/2026/03/1043595_0.jpg', thumbUrl: 'https://xiabenhow.com/wp-content/uploads/2026/03/1043595_0.jpg', caption: '紫水晶+月光石的手鍊完成！好喜歡這個配色', workType: 'crystal', tags: ['#配色控', '#獨一無二'], likeCount: 0, commentCount: 0, featured: true, createdAt: '2026-03-23' },
    { id: 'sw-4', userId: 'xiabenhow@gmail.com', userName: '下班隨手作', userEmoji: '🌿', imageUrl: 'https://xiabenhow.com/wp-content/uploads/2025/03/705960_0.jpg', thumbUrl: 'https://xiabenhow.com/wp-content/uploads/2025/03/705960_0.jpg', caption: '第一次做大豆蠟蠟燭，選了最喜歡的粉色', workType: 'candle', tags: ['#第一次做', '#意外驚喜'], likeCount: 0, commentCount: 0, createdAt: '2026-03-22' },
    { id: 'sw-5', userId: 'xiabenhow@gmail.com', userName: '下班隨手作', userEmoji: '🌿', imageUrl: 'https://xiabenhow.com/wp-content/uploads/2023/08/e6898be4bd9cdiye69d90e.jpg', thumbUrl: 'https://xiabenhow.com/wp-content/uploads/2023/08/e6898be4bd9cdiye69d90e.jpg', caption: '母親節禮物準備好了！玫瑰天竺葵手工皂', workType: 'soap', tags: ['#母親節禮物', '#送給朋友'], likeCount: 0, commentCount: 0, featured: true, createdAt: '2026-03-21' },
    { id: 'sw-6', userId: 'xiabenhow@gmail.com', userName: '下班隨手作', userEmoji: '🌿', imageUrl: 'https://xiabenhow.com/wp-content/uploads/2023/10/1052600.jpg', thumbUrl: 'https://xiabenhow.com/wp-content/uploads/2023/10/1052600.jpg', caption: '韓式花束包裝學起來了！送給自己的生日花', workType: 'floral', tags: ['#生日禮物', '#超滿意'], likeCount: 0, commentCount: 0, createdAt: '2026-03-20' },
    { id: 'sw-7', userId: 'xiabenhow@gmail.com', userName: '下班隨手作', userEmoji: '🌿', imageUrl: 'https://xiabenhow.com/wp-content/uploads/2026/03/1033816_0.jpg', thumbUrl: 'https://xiabenhow.com/wp-content/uploads/2026/03/1033816_0.jpg', caption: '手縫皮革名片夾，第一次做縫線就很整齊！', workType: 'leather', tags: ['#第一次做', '#超滿意'], likeCount: 0, commentCount: 0, createdAt: '2026-03-19' },
    { id: 'sw-8', userId: 'xiabenhow@gmail.com', userName: '下班隨手作', userEmoji: '🌿', imageUrl: 'https://xiabenhow.com/wp-content/uploads/2022/01/764868_0.jpg', thumbUrl: 'https://xiabenhow.com/wp-content/uploads/2022/01/764868_0.jpg', caption: '藍染手帕，每個折法出來的圖案都不一樣', workType: 'indigo', tags: ['#獨一無二', '#週末手作'], likeCount: 0, commentCount: 0, createdAt: '2026-03-18' },
  ];

  const displayWorks = works.length > 0 ? filtered : (filterType === 'all' ? sampleWorks : sampleWorks.filter(w => w.workType === filterType));

  const typeFilters = [
    { key: 'all', label: '全部', emoji: '✨' },
    { key: 'plant', label: '植栽', emoji: '🌱' },
    { key: 'fragrance', label: '調香', emoji: '🫧' },
    { key: 'crystal', label: '水晶', emoji: '💎' },
    { key: 'candle', label: '蠟燭', emoji: '🕯️' },
    { key: 'leather', label: '皮革', emoji: '👜' },
    { key: 'soap', label: '手工皂', emoji: '🧼' },
    { key: 'floral', label: '花藝', emoji: '💐' },
    { key: 'resin', label: '樹脂', emoji: '✨' },
    { key: 'indigo', label: '藍染', emoji: '🫐' },
  ];

  // Work detail modal
  if (selectedWork) {
    return (
      <motion.div className="space-y-4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => setSelectedWork(null)} className="flex items-center gap-1 text-sm" style={{ color: '#C9A96E' }}>← 返回社群</motion.button>
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          {selectedWork.imageUrl && <img src={selectedWork.imageUrl} alt="" className="w-full h-64 object-cover" />}
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">{selectedWork.userEmoji}</span>
              <span className="text-sm font-medium" style={{ color: '#3D3530' }}>{selectedWork.userName}</span>
              <span className="text-xs" style={{ color: '#B5AFA8' }}>{selectedWork.createdAt?.slice(0, 10)}</span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: '#3D3530' }}>{selectedWork.caption}</p>
            {selectedWork.tags && selectedWork.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedWork.tags.map(tag => (
                  <span key={tag} className="text-xs px-2 py-0.5 rounded-lg" style={{ backgroundColor: '#C9A96E15', color: '#C9A96E' }}>{tag}</span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-4 pt-2" style={{ borderTop: '1px solid #F0EDE8' }}>
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => handleLike(selectedWork.id)} className="flex items-center gap-1 text-sm" style={{ color: likedIds.has(selectedWork.id) ? '#E74C3C' : '#8C7B72' }}>
                {likedIds.has(selectedWork.id) ? '❤️' : '🤍'} {Math.max(0, selectedWork.likeCount || 0)}
              </motion.button>
              <span className="text-sm" style={{ color: '#8C7B72' }}>💬 {selectedWork.commentCount}</span>
              {userEmail && (selectedWork.userId === userEmail || userEmail === 'xiabenhow@gmail.com') && (
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => handleDelete(selectedWork.id)} className="ml-auto text-xs" style={{ color: '#C9A96E88' }}>🗑️ 刪除</motion.button>
              )}
            </div>
          </div>
        </div>

        {/* Comments */}
        <div className="space-y-2">
          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>💬 留言</p>
          {comments.length === 0 && <p className="text-xs" style={{ color: '#B5AFA8' }}>還沒有留言，來當第一個吧！</p>}
          {comments.map(c => (
            <div key={c.id} className="rounded-xl px-3 py-2" style={{ backgroundColor: '#F5F0EB' }}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: '#3D3530' }}>{c.userName}</span>
                <span className="text-[10px]" style={{ color: '#B5AFA8' }}>{c.createdAt?.slice(0, 10)}</span>
                {userEmail && (c.userId === userEmail || userEmail === 'xiabenhow@gmail.com') && (
                  <motion.button whileTap={{ scale: 0.9 }} onClick={async () => {
                    await deleteDoc(doc(db, 'community_works', selectedWork.id, 'comments', c.id));
                    await updateDoc(doc(db, 'community_works', selectedWork.id), { commentCount: increment(-1) });
                  }} className="ml-auto text-[10px]" style={{ color: '#C9A96E88' }}>刪除</motion.button>
                )}
              </div>
              <p className="text-xs mt-1" style={{ color: '#3D3530' }}>{c.text}</p>
            </div>
          ))}
          {userEmail && (
            <div className="flex gap-2">
              <input value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="說點什麼..."
                className="flex-1 rounded-xl px-3 py-2 text-xs outline-none" style={{ backgroundColor: '#F5F0EB', color: '#3D3530' }} />
              <motion.button whileTap={{ scale: 0.9 }} onClick={handleComment}
                className="px-3 py-2 rounded-xl text-xs font-bold text-white" style={{ backgroundColor: '#C9A96E' }}>送出</motion.button>
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>🎨 社群</h2>
        <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>看看大家帶回家的作品，分享你的療癒時光</p>
      </div>

      {/* 分類篩選 */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {typeFilters.map(f => (
          <button key={f.key} onClick={() => setFilterType(f.key)}
            className="px-3 py-1.5 rounded-xl text-xs font-medium flex-shrink-0 flex items-center gap-1"
            style={{ backgroundColor: filterType === f.key ? '#3D353015' : '#F5F0EB', color: filterType === f.key ? '#3D3530' : '#8C7B72' }}>
            {f.emoji} {f.label}
          </button>
        ))}
      </div>

      {/* 發表作品按鈕 */}
      {userEmail && (
        <motion.button whileTap={{ scale: 0.97 }} onClick={onPost}
          className="w-full rounded-2xl py-3 text-sm font-bold text-white shadow-sm flex items-center justify-center gap-2"
          style={{ backgroundColor: '#C9A96E' }}>
          📸 分享我的作品
        </motion.button>
      )}

      {/* 本週精選 */}
      {displayWorks.some(w => w.featured) && (
        <div>
          <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>⭐ 本週精選</p>
          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            {displayWorks.filter(w => w.featured).map(work => (
              <motion.div key={work.id} whileTap={{ scale: 0.97 }} onClick={() => setSelectedWork(work)}
                className="flex-shrink-0 w-44 rounded-2xl overflow-hidden shadow-sm cursor-pointer"
                style={{ backgroundColor: '#FFFEF9' }}>
                {work.imageUrl && <img src={work.thumbUrl || work.imageUrl} alt="" className="w-full h-28 object-cover" loading="lazy" />}
                <div className="p-2">
                  <p className="text-xs line-clamp-2" style={{ color: '#3D3530' }}>{work.caption}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs">{work.userEmoji}</span>
                    <span className="text-[10px]" style={{ color: '#B5AFA8' }}>{work.userName}</span>
                    <span className="ml-auto text-[10px]" style={{ color: '#C9A96E' }}>❤️ {work.likeCount}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* 作品牆 - 小紅書風格雙欄 */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: '#C9A96E', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {displayWorks.map((work, i) => (
            <motion.div key={work.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setSelectedWork(work)}
              className="rounded-2xl overflow-hidden shadow-sm cursor-pointer"
              style={{ backgroundColor: '#FFFEF9' }}>
              {work.imageUrl ? (
                <img src={work.thumbUrl || work.imageUrl} alt="" className="w-full h-36 object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-36 flex items-center justify-center text-5xl"
                  style={{ background: `linear-gradient(135deg, ${TOPICS.find(t => t.key === work.workType)?.color || '#E8D5B7'}25 0%, #FFFEF9 100%)` }}>
                  {TOPICS.find(t => t.key === work.workType)?.emoji || '✨'}
                </div>
              )}
              <div className="p-3">
                <p className="text-xs leading-snug line-clamp-3" style={{ color: '#3D3530' }}>{work.caption}</p>
                {work.tags && work.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {work.tags.map(tag => (
                      <span key={tag} className="text-xs px-1.5 py-0.5 rounded-lg" style={{ backgroundColor: '#C9A96E15', color: '#C9A96E' }}>{tag}</span>
                    ))}
                  </div>
                )}
                {work.featured && (
                  <span className="text-xs px-1.5 py-0.5 rounded-lg mt-1 inline-block" style={{ backgroundColor: '#C9A96E25', color: '#C9A96E' }}>⭐ 本週精選</span>
                )}
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1">
                    <span className="text-xs">{work.userEmoji}</span>
                    <p className="text-xs" style={{ color: '#B5AFA8' }}>{work.userName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <motion.button whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); handleLike(work.id); }}
                      className="flex items-center gap-0.5 text-xs" style={{ color: likedIds.has(work.id) ? '#E74C3C' : '#8C7B72' }}>
                      {likedIds.has(work.id) ? '❤️' : '🤍'} {Math.max(0, work.likeCount || 0)}
                    </motion.button>
                    <span className="text-xs" style={{ color: '#8C7B72' }}>💬 {work.commentCount}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {!userEmail && (
        <div className="rounded-2xl px-4 py-3.5 text-center" style={{ backgroundColor: '#C9A96E12' }}>
          <p className="text-xs" style={{ color: '#8C7B72' }}>登入後可以分享你的作品 ✨</p>
        </div>
      )}
    </motion.div>
  );
}

function BottomNav({ active, onChange }: { active: PageType; onChange: (p: PageType) => void }) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40"
      style={{
        backgroundColor: '#FFFEF9',
        borderTop: '1px solid #F0EDE8',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="max-w-md mx-auto" style={{ display: 'grid', gridTemplateColumns: `repeat(${NAV_ITEMS.length}, 1fr)`, height: 56 }}>
        {NAV_ITEMS.map(item => (
          <button
            key={item.label}
            onClick={() => item.url ? window.open(item.url, '_blank') : onChange(item.key)}
            className="flex flex-col items-center justify-center gap-0 relative"
            style={{ padding: '4px 0' }}
          >
            <span className="text-xl" style={{
              filter: active === item.key && !item.url ? 'none' : 'grayscale(100%) opacity(0.5)',
              transition: 'filter 0.2s',
            }}>{item.icon}</span>
            <span
              className="text-[10px] font-medium"
              style={{ color: active === item.key && !item.url ? '#D2B4A1' : '#8C7B72' }}
            >
              {item.label}
            </span>
            {active === item.key && (
              <motion.div
                layoutId="bottom-nav-indicator"
                className="absolute bottom-0.5 w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: '#D2B4A1' }}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ===================== PAGE: 管理後台 (Admin Dashboard) =====================

interface AdminUserRecord {
  uid: string;
  email?: string;
  displayName?: string;
  records?: HealingRecord[];
  energy?: EnergyState;
  lastActive?: string;
}

function AdminDashboardPage({ onBack }: { onBack: () => void }) {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<AdminUserRecord | null>(null);
  const [pushMessage, setPushMessage] = useState('');
  const [pushTarget, setPushTarget] = useState<'all' | 'user'>('all');
  const [pushSent, setPushSent] = useState(false);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | 'all'>('30d');
  const [adminView, setAdminView] = useState<'overview' | 'user-detail' | 'push'>('overview');

  // Load all user data from Firestore
  useEffect(() => {
    const loadUsers = async () => {
      setLoading(true);
      try {
        const usersSnap = await getDocs(collection(db, 'user_data'));
        const userList: AdminUserRecord[] = [];
        for (const userDoc of usersSnap.docs) {
          const data = userDoc.data();
          userList.push({
            uid: userDoc.id,
            email: data.email || data.userEmail || '',
            displayName: data.displayName || data.userName || '',
            records: data.records || [],
            energy: data.energy || { totalEnergy: 0, logs: [], coupons: [], streakDays: 0, lastCheckinDate: '' },
            lastActive: data.lastActive || data.energy?.lastCheckinDate || '',
          });
        }
        setUsers(userList);
      } catch (e) {
        console.error('[Admin] Failed to load users:', e);
      } finally {
        setLoading(false);
      }
    };
    loadUsers();
  }, []);

  // Compute emotion statistics
  const emotionStats = useMemo(() => {
    const stats: Record<string, number> = {};
    const now = new Date();
    const cutoff = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 9999;
    for (const u of users) {
      for (const r of (u.records || [])) {
        const daysAgo = Math.floor((now.getTime() - new Date(r.date).getTime()) / 86400000);
        if (daysAgo <= cutoff) {
          stats[r.emotion] = (stats[r.emotion] || 0) + 1;
        }
      }
    }
    return Object.entries(stats).sort((a, b) => b[1] - a[1]);
  }, [users, dateRange]);

  const totalRecords = users.reduce((sum, u) => sum + (u.records?.length || 0), 0);
  const activeUsers = users.filter(u => {
    const last = u.energy?.lastCheckinDate || u.lastActive;
    if (!last) return false;
    const daysAgo = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
    return daysAgo <= 7;
  }).length;

  const handleSendPush = async () => {
    if (!pushMessage.trim()) return;
    try {
      await addDoc(collection(db, 'admin_notifications'), {
        message: pushMessage,
        target: pushTarget === 'user' && selectedUser ? selectedUser.uid : 'all',
        targetEmail: pushTarget === 'user' && selectedUser ? selectedUser.email : 'all',
        createdAt: new Date().toISOString(),
        read: false,
      });
      setPushSent(true);
      setTimeout(() => setPushSent(false), 3000);
      setPushMessage('');
    } catch (e) {
      console.error('[Admin] Push failed:', e);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-8 h-8 border-2 rounded-full animate-spin mb-3" style={{ borderColor: '#C9A96E', borderTopColor: 'transparent' }} />
        <p className="text-sm" style={{ color: '#8C7B72' }}>載入用戶資料中...</p>
      </div>
    );
  }

  // User detail view
  if (adminView === 'user-detail' && selectedUser) {
    const userRecords = selectedUser.records || [];
    const recentRecords = userRecords.slice(-30);
    const userEmotionCounts: Record<string, number> = {};
    for (const r of recentRecords) {
      userEmotionCounts[r.emotion] = (userEmotionCounts[r.emotion] || 0) + 1;
    }
    const sortedEmotions = Object.entries(userEmotionCounts).sort((a, b) => b[1] - a[1]);

    return (
      <motion.div className="space-y-4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setAdminView('overview'); setSelectedUser(null); }} className="flex items-center gap-1 text-sm" style={{ color: '#C9A96E' }}>← 返回總覽</motion.button>
        <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-lg font-bold mb-1" style={{ color: '#3D3530' }}>{selectedUser.displayName || '未命名用戶'}</p>
          <p className="text-xs mb-3" style={{ color: '#8C7B72' }}>{selectedUser.email}</p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="rounded-xl p-2 text-center" style={{ backgroundColor: '#FAF8F5' }}>
              <p className="text-lg font-bold" style={{ color: '#8FA886' }}>{userRecords.length}</p>
              <p className="text-[10px]" style={{ color: '#8C7B72' }}>總記錄</p>
            </div>
            <div className="rounded-xl p-2 text-center" style={{ backgroundColor: '#FAF8F5' }}>
              <p className="text-lg font-bold" style={{ color: '#C9A96E' }}>{selectedUser.energy?.streakDays || 0}</p>
              <p className="text-[10px]" style={{ color: '#8C7B72' }}>連續天數</p>
            </div>
            <div className="rounded-xl p-2 text-center" style={{ backgroundColor: '#FAF8F5' }}>
              <p className="text-lg font-bold" style={{ color: '#C48B6C' }}>{selectedUser.energy?.totalEnergy || 0}</p>
              <p className="text-[10px]" style={{ color: '#8C7B72' }}>能量</p>
            </div>
          </div>
        </div>

        {/* Emotion distribution */}
        <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>近30天情緒分佈</p>
          {sortedEmotions.length > 0 ? sortedEmotions.map(([emo, count]) => {
            const info = getEmotionInfo(emo as EmotionKey);
            const pct = recentRecords.length > 0 ? (count / recentRecords.length) * 100 : 0;
            return (
              <div key={emo} className="mb-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span style={{ color: '#3D3530' }}>{info?.emoji || '🔮'} {info?.label || emo}</span>
                  <span style={{ color: '#8C7B72' }}>{count} 次 ({Math.round(pct)}%)</span>
                </div>
                <div className="w-full h-2 rounded-full" style={{ backgroundColor: '#F0EDE8' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: info?.color || '#C9A96E' }} />
                </div>
              </div>
            );
          }) : <p className="text-xs" style={{ color: '#B5AFA8' }}>尚無情緒記錄</p>}
        </div>

        {/* Recent records timeline */}
        <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>最近記錄</p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {recentRecords.reverse().slice(0, 20).map((r, i) => {
              const info = getEmotionInfo(r.emotion);
              return (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-xl" style={{ backgroundColor: '#FAF8F5' }}>
                  <span className="text-sm">{info?.emoji || '🔮'}</span>
                  <span className="text-xs" style={{ color: '#3D3530' }}>{info?.label || r.emotion}</span>
                  {r.subEmotion && <span className="text-[10px] px-1.5 py-0.5 rounded-lg" style={{ backgroundColor: '#C9A96E15', color: '#C9A96E' }}>{r.subEmotion}</span>}
                  <span className="ml-auto text-[10px]" style={{ color: '#B5AFA8' }}>{r.date}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Send personal message */}
        <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>💬 發送個人化訊息</p>
          <textarea
            value={pushMessage}
            onChange={e => setPushMessage(e.target.value)}
            placeholder="輸入給這位用戶的建議或關懷訊息..."
            className="w-full rounded-xl px-3 py-2 text-xs outline-none resize-none"
            style={{ backgroundColor: '#F5F0EB', color: '#3D3530', minHeight: 60 }}
          />
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => { setPushTarget('user'); handleSendPush(); }}
            className="w-full mt-2 py-2.5 rounded-xl text-xs font-bold text-white"
            style={{ backgroundColor: '#C9A96E' }}
          >
            {pushSent ? '✓ 已發送' : '📤 發送給此用戶'}
          </motion.button>
        </div>
      </motion.div>
    );
  }

  // Push notification view
  if (adminView === 'push') {
    return (
      <motion.div className="space-y-4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => setAdminView('overview')} className="flex items-center gap-1 text-sm" style={{ color: '#C9A96E' }}>← 返回總覽</motion.button>
        <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-lg font-bold mb-3" style={{ color: '#3D3530' }}>📤 推送訊息</p>
          <p className="text-xs mb-3" style={{ color: '#8C7B72' }}>發送給所有用戶的關懷或建議訊息</p>
          <textarea
            value={pushMessage}
            onChange={e => setPushMessage(e.target.value)}
            placeholder="今天要對所有用戶說什麼..."
            className="w-full rounded-xl px-3 py-2 text-xs outline-none resize-none"
            style={{ backgroundColor: '#F5F0EB', color: '#3D3530', minHeight: 80 }}
          />
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => { setPushTarget('all'); handleSendPush(); }}
            className="w-full mt-3 py-2.5 rounded-xl text-xs font-bold text-white"
            style={{ backgroundColor: '#8FA886' }}
          >
            {pushSent ? '✓ 已發送' : '📤 推送給所有用戶'}
          </motion.button>
        </div>
      </motion.div>
    );
  }

  // Overview
  return (
    <motion.div className="space-y-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div>
        <motion.button whileTap={{ scale: 0.95 }} onClick={onBack} className="flex items-center gap-1 text-sm mb-3" style={{ color: '#C9A96E' }}>← 返回</motion.button>
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>📊 管理後台</h2>
        <p className="text-sm mt-1" style={{ color: '#8C7B72' }}>用戶情緒統計 · 數據分析 · 推送訊息</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl p-3 text-center shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-xl font-bold" style={{ color: '#8FA886' }}>{users.length}</p>
          <p className="text-[10px]" style={{ color: '#8C7B72' }}>總用戶</p>
        </div>
        <div className="rounded-2xl p-3 text-center shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-xl font-bold" style={{ color: '#C9A96E' }}>{activeUsers}</p>
          <p className="text-[10px]" style={{ color: '#8C7B72' }}>7天活躍</p>
        </div>
        <div className="rounded-2xl p-3 text-center shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-xl font-bold" style={{ color: '#C48B6C' }}>{totalRecords}</p>
          <p className="text-[10px]" style={{ color: '#8C7B72' }}>情緒記錄</p>
        </div>
      </div>

      {/* Emotion overview */}
      <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>情緒分佈</p>
          <div className="flex gap-1">
            {(['7d', '30d', 'all'] as const).map(range => (
              <button key={range} onClick={() => setDateRange(range)}
                className="px-2 py-0.5 rounded-lg text-[10px]"
                style={{ backgroundColor: dateRange === range ? '#3D353015' : '#F5F0EB', color: dateRange === range ? '#3D3530' : '#8C7B72' }}>
                {range === '7d' ? '7天' : range === '30d' ? '30天' : '全部'}
              </button>
            ))}
          </div>
        </div>
        {emotionStats.length > 0 ? emotionStats.map(([emo, count]) => {
          const info = getEmotionInfo(emo as EmotionKey);
          const max = emotionStats[0][1];
          const pct = max > 0 ? (count / max) * 100 : 0;
          return (
            <div key={emo} className="mb-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span style={{ color: '#3D3530' }}>{info?.emoji || '🔮'} {info?.label || emo}</span>
                <span style={{ color: '#8C7B72' }}>{count} 次</span>
              </div>
              <div className="w-full h-2.5 rounded-full" style={{ backgroundColor: '#F0EDE8' }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }}
                  className="h-full rounded-full" style={{ backgroundColor: info?.color || '#C9A96E' }} />
              </div>
            </div>
          );
        }) : <p className="text-xs" style={{ color: '#B5AFA8' }}>尚無情緒記錄資料</p>}
      </div>

      {/* Push notification button */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => setAdminView('push')}
        className="w-full rounded-2xl py-3 text-sm font-bold shadow-sm flex items-center justify-center gap-2"
        style={{ backgroundColor: '#8FA886', color: '#fff' }}
      >
        📤 推送訊息給用戶
      </motion.button>

      {/* User list */}
      <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
        <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>用戶列表</p>
        <div className="space-y-2">
          {users.length > 0 ? users.map(u => {
            const recordCount = u.records?.length || 0;
            const lastEmotion = u.records && u.records.length > 0 ? u.records[u.records.length - 1] : null;
            const lastInfo = lastEmotion ? getEmotionInfo(lastEmotion.emotion) : null;
            return (
              <motion.button
                key={u.uid}
                whileTap={{ scale: 0.98 }}
                onClick={() => { setSelectedUser(u); setAdminView('user-detail'); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl text-left"
                style={{ backgroundColor: '#FAF8F5' }}
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm" style={{ backgroundColor: '#C9A96E20' }}>
                  {lastInfo?.emoji || '🔮'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: '#3D3530' }}>{u.displayName || u.email || u.uid.slice(0, 8)}</p>
                  <p className="text-[10px] truncate" style={{ color: '#8C7B72' }}>
                    {recordCount} 筆記錄 · 能量 {u.energy?.totalEnergy || 0} · 連續 {u.energy?.streakDays || 0} 天
                  </p>
                </div>
                <div className="text-right">
                  {lastEmotion && (
                    <p className="text-[10px]" style={{ color: '#B5AFA8' }}>{lastEmotion.date}</p>
                  )}
                  <span style={{ color: '#C9A96E' }}>›</span>
                </div>
              </motion.button>
            );
          }) : <p className="text-xs" style={{ color: '#B5AFA8' }}>尚無用戶資料</p>}
        </div>
      </div>
    </motion.div>
  );
}

// ===================== PAGE: XIA TASKS =====================

function XiaTasksPage({ records, onNavigate }: { records: HealingRecord[]; onNavigate: (p: PageType) => void }) {
  const tasks = [
    { key: 'checkin', label: '每日簽到', desc: '每天打開App簽到', reward: 1, icon: '✅', done: records.some(r => r.date === getToday()) },
    { key: 'card', label: '抽療癒卡', desc: '每日抽一張療癒卡', reward: 1, icon: '🃏', done: false },
    { key: 'note', label: '寫日記', desc: '記錄今天的心情', reward: 2, icon: '📝', done: false },
    { key: 'breathe', label: '聽音景5分鐘', desc: '讓自己放鬆一下', reward: 1, icon: '🎧', done: false },
    { key: 'share', label: '分享作品', desc: '上傳一張手作照片', reward: 3, icon: '📸', done: false },
  ];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-10 space-y-4">
      <div className="text-center py-4">
        <p className="text-3xl mb-2">🪙</p>
        <h1 className="text-lg font-bold" style={{ color: '#3D3530' }}>XIA 幣任務</h1>
        <p className="text-xs mt-1" style={{ color: '#8C7B72' }}>完成任務賺取 XIA 幣，兌換療癒好禮</p>
      </div>
      <div className="space-y-2.5 px-1">
        {tasks.map(t => (
          <motion.div key={t.key} whileTap={{ scale: 0.98 }}
            className="rounded-2xl p-4 flex items-center gap-3"
            style={{ backgroundColor: t.done ? '#F0EDE8' : '#FFFEF9', border: '1px solid #F0EDE8' }}>
            <span className="text-2xl">{t.icon}</span>
            <div className="flex-1">
              <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{t.label}</p>
              <p className="text-xs" style={{ color: '#8C7B72' }}>{t.desc}</p>
            </div>
            <div className="text-right">
              {t.done ? (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#8FA886', color: '#fff' }}>已完成</span>
              ) : (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#E8B735', color: '#fff' }}>+{t.reward} 🪙</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// ===================== PAGE: CRYSTAL ENERGY =====================

const CRYSTAL_DATA = [
  { id: 1, name: '白水晶', nameEn: 'Clear Quartz', color: '#E8E4DF', colorName: '透明/白', chakra: '頂輪', functions: ['淨化', '冥想', '增強能量'], desc: '水晶之王，能量放大器。能幫助集中注意力、增強記憶力，適合冥想時使用。可以淨化周圍負面能量，帶來清晰的思緒。', care: '月光淨化、流水沖洗' },
  { id: 2, name: '粉水晶', nameEn: 'Rose Quartz', color: '#F5C6D0', colorName: '粉紅', chakra: '心輪', functions: ['愛情', '人際', '自愛'], desc: '愛情之石，散發柔和的粉紅光芒。能開啟心輪、增進人緣，幫助療癒情感創傷，學會愛自己與接納他人。', care: '月光淨化、玫瑰花瓣' },
  { id: 3, name: '紫水晶', nameEn: 'Amethyst', color: '#C4A8D8', colorName: '紫', chakra: '眉心輪', functions: ['靈性', '安眠', '直覺'], desc: '智慧之石，與靈性能量連結。幫助提升直覺力、改善睡眠品質，特別適合放在枕頭旁，能帶來平靜安穩的夜晚。', care: '月光淨化、鼠尾草煙燻' },
  { id: 4, name: '黃水晶', nameEn: 'Citrine', color: '#F5D76E', colorName: '黃', chakra: '太陽輪', functions: ['財運', '自信', '創造力'], desc: '招財之石，金黃色的能量帶來豐盛與自信。能激發創造力和意志力，幫助在事業上做出明確決定。', care: '陽光短暫照射、水晶簇' },
  { id: 5, name: '虎眼石', nameEn: 'Tiger Eye', color: '#C4A055', colorName: '棕金', chakra: '太陽輪', functions: ['勇氣', '保護', '專注'], desc: '勇氣之石，如老虎般銳利的金棕色光芒。能增強自信心和勇氣，幫助做決定時更果斷，適合面對挑戰時佩戴。', care: '陽光淨化、海鹽' },
  { id: 6, name: '月光石', nameEn: 'Moonstone', color: '#D8E0F0', colorName: '乳白/藍光', chakra: '頂輪', functions: ['直覺', '女性能量', '情緒平衡'], desc: '月亮女神之石，散發神秘的藍色光暈。能增強直覺力、平衡情緒波動，特別適合女性佩戴，與月亮週期同步。', care: '月光淨化（滿月最佳）' },
  { id: 7, name: '黑曜石', nameEn: 'Obsidian', color: '#2D2D2D', colorName: '黑', chakra: '海底輪', functions: ['保護', '接地', '排負'], desc: '強力保護石，能吸收和轉化負面能量。幫助接地，讓人感到穩定安全。適合在感到不安或需要保護時佩戴。', care: '流水淨化、鼠尾草煙燻' },
  { id: 8, name: '拉長石', nameEn: 'Labradorite', color: '#6B8EA0', colorName: '灰藍/彩光', chakra: '喉輪', functions: ['轉化', '保護', '直覺'], desc: '轉變之石，表面閃爍著神奇的彩色光芒。能在人生轉變期提供力量，增強直覺與靈感，保護能量場不受外界干擾。', care: '月光淨化、水晶簇' },
  { id: 9, name: '紅瑪瑙', nameEn: 'Red Agate', color: '#C44D3E', colorName: '紅', chakra: '海底輪', functions: ['活力', '勇氣', '安全感'], desc: '生命力之石，溫暖的紅色帶來活力與熱情。能增強體力、提振精神，給予面對困難的勇氣和行動力。', care: '陽光短暫照射、流水' },
  { id: 10, name: '青金石', nameEn: 'Lapis Lazuli', color: '#26619C', colorName: '深藍', chakra: '眉心輪', functions: ['智慧', '溝通', '真理'], desc: '智慧之石，深邃的藍色中散布著金色星點。能提升智慧、增強表達能力，幫助說出內心真實的想法。', care: '月光淨化（避免水洗）' },
  { id: 11, name: '綠幽靈', nameEn: 'Green Phantom', color: '#7AB87A', colorName: '綠', chakra: '心輪', functions: ['財運', '事業', '成長'], desc: '事業之石，綠色的幻影象徵生機與成長。能招正財、助事業運，特別適合創業者和上班族佩戴。', care: '月光淨化、水晶簇' },
  { id: 12, name: '草莓晶', nameEn: 'Strawberry Quartz', color: '#E8899A', colorName: '草莓粉', chakra: '心輪', functions: ['愛情', '魅力', '人緣'], desc: '魅力之石，散發甜蜜的草莓粉色。能增加個人魅力和異性緣，幫助在社交場合中更自信迷人。', care: '月光淨化、玫瑰花瓣' },
  { id: 13, name: '螢石', nameEn: 'Fluorite', color: '#8EC5C5', colorName: '多色（綠紫藍）', chakra: '心輪/眉心輪', functions: ['專注', '學習', '思維清晰'], desc: '學習之石，擁有美麗的漸變色澤。能幫助集中注意力、增強記憶力和理解力，是學生和腦力工作者的好夥伴。', care: '月光淨化（避免陽光）' },
  { id: 14, name: '石榴石', nameEn: 'Garnet', color: '#8B2252', colorName: '深紅', chakra: '海底輪', functions: ['活力', '熱情', '再生'], desc: '重生之石，如石榴般深紅濃烈。能激發生命力和熱情，幫助從低潮中恢復，重新找回生活的動力。', care: '月光淨化、水晶簇' },
  { id: 15, name: '海藍寶', nameEn: 'Aquamarine', color: '#87CEEB', colorName: '淺藍', chakra: '喉輪', functions: ['溝通', '勇氣', '平靜'], desc: '勇氣之石，如大海般清澈透明。能增強溝通表達能力，幫助克服恐懼，帶來內心的平靜與勇氣。', care: '月光淨化、流水' },
  { id: 16, name: '黑碧璽', nameEn: 'Black Tourmaline', color: '#1C1C1C', colorName: '黑', chakra: '海底輪', functions: ['防護', '接地', '化煞'], desc: '最強防護石之一，能有效阻擋電磁波和負面能量。適合放在電腦旁或大門口，為空間建立保護屏障。', care: '流水淨化、海鹽、陽光' },
  { id: 17, name: '橄欖石', nameEn: 'Peridot', color: '#9DC183', colorName: '橄欖綠', chakra: '心輪', functions: ['療癒', '喜悅', '好運'], desc: '太陽之石，明亮的橄欖綠散發著正面能量。能帶來喜悅和好運，幫助釋放舊有的負面模式，迎接新生活。', care: '月光淨化、流水' },
  { id: 18, name: '茶水晶', nameEn: 'Smoky Quartz', color: '#8B7355', colorName: '茶褐', chakra: '海底輪', functions: ['接地', '穩定', '釋壓'], desc: '穩定之石，溫暖的茶褐色帶來安定感。能幫助接地和釋放壓力，讓焦慮的心情平穩下來。', care: '陽光短暫照射、流水' },
];

const LIFE_PATH_CRYSTALS: Record<number, { number: number; trait: string; color: string; colorHex: string; crystals: string[]; desc: string; strengths: string; challenges: string; advice: string }> = {
  1: { number: 1, trait: '領導者', color: '紅', colorHex: '#E8735A', crystals: ['紅瑪瑙', '石榴石', '虎眼石'], desc: '你是天生的領袖，充滿開創精神和行動力。', strengths: '獨立、果斷、創新、有魄力', challenges: '容易固執、孤獨感、不善傾聽', advice: '多傾聽他人意見，學習團隊合作。紅瑪瑙能給你行動的勇氣，虎眼石幫助做出明智決定。' },
  2: { number: 2, trait: '和平者', color: '橙', colorHex: '#E8A87C', crystals: ['月光石', '粉水晶', '海藍寶'], desc: '你天生善解人意，是最好的傾聽者和調解者。', strengths: '溫柔、體貼、直覺強、善於合作', challenges: '容易猶豫不決、過度敏感、缺乏自信', advice: '學會堅定自己的立場，月光石增強直覺，粉水晶療癒情感，海藍寶幫助表達。' },
  3: { number: 3, trait: '創作者', color: '黃', colorHex: '#E8C84A', crystals: ['黃水晶', '螢石', '橄欖石'], desc: '你擁有豐富的想像力和表達天賦，天生的藝術家。', strengths: '創意豐富、樂觀、善於表達、有魅力', challenges: '容易分心、情緒化、完美主義', advice: '把想法化為行動，黃水晶帶來自信，螢石幫助專注，橄欖石帶來喜悅。' },
  4: { number: 4, trait: '建造者', color: '綠', colorHex: '#6B8F5E', crystals: ['綠幽靈', '黑碧璽', '茶水晶'], desc: '你踏實可靠，善於建構穩固的基礎。', strengths: '務實、有條理、堅持、值得信賴', challenges: '過度保守、工作狂、不易變通', advice: '適時放鬆享受生活，綠幽靈助事業成長，黑碧璽提供保護，茶水晶幫助釋壓。' },
  5: { number: 5, trait: '自由者', color: '藍', colorHex: '#5EAAB8', crystals: ['海藍寶', '拉長石', '紫水晶'], desc: '你渴望自由與變化，是勇敢的冒險家。', strengths: '適應力強、勇於冒險、多才多藝、熱愛自由', challenges: '容易不安定、缺乏耐心、逃避責任', advice: '學會在自由中找到紀律，海藍寶給予勇氣，拉長石幫助轉變，紫水晶帶來靜心。' },
  6: { number: 6, trait: '療癒者', color: '靛', colorHex: '#9B7EC8', crystals: ['粉水晶', '紫水晶', '月光石'], desc: '你天生有療癒他人的能力，充滿愛與責任感。', strengths: '有愛心、負責任、藝術鑒賞力、療癒力', challenges: '過度犧牲、控制欲、完美主義', advice: '先療癒自己再療癒他人，粉水晶學會自愛，紫水晶提升靈性，月光石平衡情緒。' },
  7: { number: 7, trait: '探索者', color: '紫', colorHex: '#7B68AE', crystals: ['紫水晶', '青金石', '螢石'], desc: '你是深度思考者，追求真理與智慧。', strengths: '智慧深邃、分析力強、直覺敏銳、追求真理', challenges: '過度孤僻、多疑、不善交際', advice: '平衡理性與感性，紫水晶提升靈性直覺，青金石增強智慧，螢石幫助思維清晰。' },
  8: { number: 8, trait: '成就者', color: '金', colorHex: '#C9A96E', crystals: ['黃水晶', '虎眼石', '綠幽靈'], desc: '你有強大的實現力，注定在物質世界取得成就。', strengths: '企圖心強、組織力佳、實際、有商業頭腦', challenges: '工作至上、控制欲強、物質主義', advice: '記得財富不只是金錢，黃水晶招財，虎眼石給予決斷力，綠幽靈助事業運。' },
  9: { number: 9, trait: '博愛者', color: '白', colorHex: '#D2B4A1', crystals: ['白水晶', '橄欖石', '草莓晶'], desc: '你擁有大愛，是這個世界的光。', strengths: '慈悲、包容、理想主義、藝術天分', challenges: '過度理想化、難以放手、情緒敏感', advice: '學會接受不完美，白水晶淨化能量，橄欖石帶來喜悅，草莓晶增加魅力。' },
  11: { number: 11, trait: '啟發者', color: '銀', colorHex: '#A8A8B8', crystals: ['拉長石', '月光石', '紫水晶'], desc: '11是大師數字，你擁有強大的靈感和啟發他人的能力。', strengths: '靈感豐富、直覺超強、啟發他人、有遠見', challenges: '神經緊繃、自我懷疑、能量敏感', advice: '信任你的直覺，拉長石保護能量場，月光石增強直覺，紫水晶帶來平靜。' },
  22: { number: 22, trait: '建築師', color: '金白', colorHex: '#D4AF37', crystals: ['白水晶', '綠幽靈', '虎眼石'], desc: '22是大師數字，你能將夢想化為現實，是偉大的建造者。', strengths: '實現力超強、遠見卓識、領導力、務實的理想家', challenges: '壓力巨大、完美主義、期望過高', advice: '一步步實現偉大藍圖，白水晶放大能量，綠幽靈助事業，虎眼石堅定意志。' },
};

function CrystalEnergyPage() {
  const [tab, setTab] = useState<'guide' | 'life-path' | 'color'>('guide');
  const [selectedCrystal, setSelectedCrystal] = useState<typeof CRYSTAL_DATA[0] | null>(null);
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [lifePathResult, setLifePathResult] = useState<typeof LIFE_PATH_CRYSTALS[1] | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  const calcLifePath = () => {
    const full = `${birthYear}${birthMonth.padStart(2, '0')}${birthDay.padStart(2, '0')}`;
    let sum = full.split('').reduce((a, b) => a + parseInt(b), 0);
    while (sum > 9 && sum !== 11 && sum !== 22) {
      sum = sum.toString().split('').reduce((a, b) => a + parseInt(b), 0);
    }
    setLifePathResult(LIFE_PATH_CRYSTALS[sum] || LIFE_PATH_CRYSTALS[9]);
  };

  const colorGroups = useMemo(() => {
    const groups: Record<string, typeof CRYSTAL_DATA> = {};
    CRYSTAL_DATA.forEach(c => {
      const key = c.colorName.split('/')[0].split('（')[0].trim();
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return groups;
  }, []);

  const tabs = [
    { key: 'guide' as const, label: '水晶圖鑑' },
    { key: 'life-path' as const, label: '生命靈數' },
    { key: 'color' as const, label: '色系選晶' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-10 space-y-4">
      <div className="text-center py-3">
        <h1 className="text-lg font-bold" style={{ color: '#3D3530' }}>💎 水晶能量</h1>
      </div>
      <div className="flex gap-2 px-4 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all"
            style={{ backgroundColor: tab === t.key ? '#D2B4A1' : '#F0EDE8', color: tab === t.key ? '#fff' : '#3D3530' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'guide' && (
        <div className="grid grid-cols-2 gap-2.5 px-1">
          {CRYSTAL_DATA.map(c => (
            <motion.button key={c.id} whileTap={{ scale: 0.96 }} onClick={() => setSelectedCrystal(c)}
              className="rounded-2xl p-3 text-left" style={{ backgroundColor: '#F0EDE8' }}>
              <div className="w-8 h-8 rounded-full mb-2" style={{ backgroundColor: c.color }} />
              <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{c.name}</p>
              <p className="text-[10px]" style={{ color: '#8C7B72' }}>{c.nameEn}</p>
              <p className="text-[10px] mt-1" style={{ color: '#8C7B72' }}>{c.chakra} · {c.functions.join('・')}</p>
            </motion.button>
          ))}
        </div>
      )}

      {tab === 'life-path' && (
        <div className="px-4 space-y-4">
          <div className="rounded-2xl p-4" style={{ backgroundColor: '#F0EDE8' }}>
            <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>輸入你的生日</p>
            <div className="flex gap-2">
              <input type="number" placeholder="年" value={birthYear} onChange={e => setBirthYear(e.target.value)}
                className="flex-1 rounded-xl px-3 py-2 text-sm text-center outline-none" style={{ backgroundColor: '#FFFEF9', color: '#3D3530' }} />
              <input type="number" placeholder="月" value={birthMonth} onChange={e => setBirthMonth(e.target.value)}
                className="w-16 rounded-xl px-3 py-2 text-sm text-center outline-none" style={{ backgroundColor: '#FFFEF9', color: '#3D3530' }} />
              <input type="number" placeholder="日" value={birthDay} onChange={e => setBirthDay(e.target.value)}
                className="w-16 rounded-xl px-3 py-2 text-sm text-center outline-none" style={{ backgroundColor: '#FFFEF9', color: '#3D3530' }} />
            </div>
            <button onClick={calcLifePath} disabled={!birthYear || !birthMonth || !birthDay}
              className="w-full mt-3 py-2.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: '#D2B4A1' }}>
              計算生命靈數
            </button>
          </div>
          {lifePathResult && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl overflow-hidden" style={{ border: '1px solid #F0EDE8' }}>
              <div className="p-4 text-center text-white" style={{ background: `linear-gradient(135deg, ${lifePathResult.colorHex}, ${lifePathResult.colorHex}dd)` }}>
                <p className="text-3xl font-bold">{lifePathResult.number}</p>
                <p className="text-sm font-bold mt-1">{lifePathResult.trait}</p>
                <p className="text-xs mt-1 opacity-90">{lifePathResult.desc}</p>
              </div>
              <div className="p-4 space-y-3" style={{ backgroundColor: '#FFFEF9' }}>
                <div><p className="text-xs font-bold mb-1" style={{ color: '#8FA886' }}>✨ 優勢</p><p className="text-xs" style={{ color: '#3D3530' }}>{lifePathResult.strengths}</p></div>
                <div><p className="text-xs font-bold mb-1" style={{ color: '#E8735A' }}>⚡ 課題</p><p className="text-xs" style={{ color: '#3D3530' }}>{lifePathResult.challenges}</p></div>
                <div><p className="text-xs font-bold mb-1" style={{ color: '#5EAAB8' }}>💎 水晶建議</p><p className="text-xs" style={{ color: '#3D3530' }}>{lifePathResult.crystals.join('、')}</p><p className="text-xs mt-1" style={{ color: '#8C7B72' }}>{lifePathResult.advice}</p></div>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {tab === 'color' && (
        <div className="px-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {Object.keys(colorGroups).map(color => (
              <button key={color} onClick={() => setSelectedColor(selectedColor === color ? null : color)}
                className="px-3 py-1.5 rounded-full text-xs font-medium"
                style={{ backgroundColor: selectedColor === color ? '#D2B4A1' : '#F0EDE8', color: selectedColor === color ? '#fff' : '#3D3530' }}>
                {color}
              </button>
            ))}
          </div>
          {selectedColor && colorGroups[selectedColor]?.map(c => (
            <div key={c.id} className="rounded-2xl p-3.5 flex gap-3" style={{ backgroundColor: '#F0EDE8' }}>
              <div className="w-10 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
              <div>
                <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{c.name} <span className="font-normal text-xs" style={{ color: '#8C7B72' }}>{c.nameEn}</span></p>
                <p className="text-xs mt-1" style={{ color: '#8C7B72' }}>{c.desc}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Crystal detail modal */}
      <AnimatePresence>
        {selectedCrystal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
            onClick={() => setSelectedCrystal(null)}>
            <motion.div initial={{ y: 300 }} animate={{ y: 0 }} exit={{ y: 300 }}
              className="w-full max-w-md rounded-t-3xl p-5 space-y-3" style={{ backgroundColor: '#FFFEF9' }}
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full" style={{ backgroundColor: selectedCrystal.color }} />
                <div>
                  <p className="text-base font-bold" style={{ color: '#3D3530' }}>{selectedCrystal.name}</p>
                  <p className="text-xs" style={{ color: '#8C7B72' }}>{selectedCrystal.nameEn} · {selectedCrystal.chakra}</p>
                </div>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: '#3D3530' }}>{selectedCrystal.desc}</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedCrystal.functions.map(f => (
                  <span key={f} className="px-2.5 py-1 rounded-full text-xs" style={{ backgroundColor: '#F0EDE8', color: '#8C7B72' }}>{f}</span>
                ))}
              </div>
              <p className="text-xs" style={{ color: '#8C7B72' }}>🧹 淨化方式：{selectedCrystal.care}</p>
              <button onClick={() => setSelectedCrystal(null)} className="w-full py-2.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: '#D2B4A1' }}>關閉</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ===================== PAGE: PLANT CARE =====================

function PlantCarePage() {
  const [tab, setTab] = useState<'guide' | 'varieties' | 'mistakes'>('guide');

  const careGuide = [
    { title: '💧 澆水技巧', items: ['觀察土壤乾濕度，表土乾了再澆', '澆水要澆透，直到底部排水孔流出', '避免積水，多肉植物怕澇', '冬季減少澆水頻率', '清晨或傍晚澆水最佳', '使用室溫水，避免冰水刺激根部', '葉面盡量不要積水，防止曬傷'] },
    { title: '☀️ 光照需求', items: ['大多數多肉需要充足散射光', '避免夏季正午直射（容易曬傷）', '光照不足會徒長（拉長變形）', '新買回來的植物需要適應環境光照', '窗邊是最理想的擺放位置', '冬季日照減少時可考慮補光燈', '觀葉植物大多適合半日照環境', '仙人掌類需要最多日照'] },
    { title: '🌱 土壤與介質', items: [
      '發泡煉石：高溫燒製的輕質顆粒，透氣排水極佳，可鋪盆底或混合介質使用。重量輕、不易崩解，適合需要良好排水的植物。',
      '多肉專用土：由泥炭土、珍珠石、蛭石等混合而成，排水透氣性佳，pH值中性偏酸。適合大部分多肉和仙人掌，開袋即用。',
      '赤玉土：來自日本的火山土，顆粒結構穩定，保水又透氣。分為大中小顆粒，常用於多肉、盆栽，是進階玩家的首選介質。',
      '排水良好是所有植物的基本需求', '可混合珍珠石增加透氣性', '定期更換盆土（約1-2年一次）', '底部加碎石或發泡煉石幫助排水',
    ] },
    { title: '💨 通風環境', items: ['良好通風減少病蟲害', '避免密閉悶熱環境', '空調直吹也不好', '適當通風幫助土壤乾燥', '戶外養護風太大要避風', '浴室等潮濕環境需特別注意通風', '多肉植物特別需要通風'] },
    { title: '✂️ 繁殖方法', items: ['葉插：取健康葉片平放在土上等發根', '扦插：剪取莖段晾乾傷口後插入土中', '分株：將叢生植物分開各自種植', '播種：適合有耐心的進階玩家', '水培：部分植物可以水培生根後移土', '嫁接：仙人掌常用的繁殖技術', '走莖繁殖：如吊蘭自然長出小苗'] },
    { title: '🗓️ 四季照護重點', items: ['春：生長旺季，適合換盆施肥', '夏：注意遮陽通風，減少澆水', '秋：許多多肉上色最美的季節', '冬：減少澆水，室內保暖', '換季時注意溫差變化', '梅雨季節防止爛根'] },
    { title: '🐛 病蟲害防治', items: ['介殼蟲：用酒精棉花擦拭', '紅蜘蛛：增加濕度，嚴重用藥', '黑腐病：剪掉腐爛部分，晾乾', '白粉病：改善通風，減少澆水', '根粉介：換土換盆，藥劑浸泡', '蚜蟲：肥皂水噴灑，引入瓢蟲', '預防勝於治療，定期檢查'] },
    { title: '🏺 花盆選擇', items: ['素燒盆：透氣性最好，適合新手', '塑膠盆：保水好，適合喜濕植物', '陶瓷盆：美觀但要注意排水', '一定要有排水孔', '大小合適，不要太大的盆', '淺盆適合多肉，深盆適合仙人掌', '材質影響澆水頻率'] },
  ];

  const succulentData = [
    { id: 1, name: '吉娃娃', nameEn: 'Chihuahua', difficulty: '⭐⭐', water: '少', sun: '全日照', season: '春秋', desc: '葉尖帶有迷人的紅邊', tips: '夏季需要遮陽避暑' },
    { id: 2, name: '白牡丹', nameEn: 'Graptoveria', difficulty: '⭐', water: '少', sun: '全日照', season: '春秋', desc: '新手入門首選品種', tips: '非常好養，不容易死' },
    { id: 3, name: '黑王子', nameEn: 'Black Prince', difficulty: '⭐⭐', water: '少', sun: '全日照', season: '春秋', desc: '深紫黑色的貴族', tips: '光照越足顏色越深' },
    { id: 4, name: '桃蛋', nameEn: 'Moon Gad', difficulty: '⭐⭐⭐', water: '極少', sun: '全日照', season: '春秋冬', desc: '粉嫩圓潤超療癒', tips: '夏天要特別注意遮陽' },
    { id: 5, name: '熊童子', nameEn: 'Bear Paw', difficulty: '⭐⭐', water: '少', sun: '半日照', season: '春秋', desc: '毛茸茸的熊掌造型', tips: '不喜歡葉面沾水' },
    { id: 6, name: '仙人掌', nameEn: 'Cactus', difficulty: '⭐', water: '極少', sun: '全日照', season: '四季', desc: '沙漠之王，超耐旱', tips: '冬天幾乎不用澆水' },
    { id: 7, name: '玉露', nameEn: 'Haworthia', difficulty: '⭐⭐', water: '中', sun: '散射光', season: '春秋', desc: '晶瑩剔透的窗面', tips: '不能直曬強光' },
    { id: 8, name: '蒂亞', nameEn: 'Sedeveria', difficulty: '⭐', water: '少', sun: '全日照', season: '春秋冬', desc: '秋冬變紅超美', tips: '溫差越大越容易上色' },
    { id: 9, name: '虹之玉', nameEn: 'Jelly Bean', difficulty: '⭐', water: '少', sun: '全日照', season: '四季', desc: '像QQ軟糖的可愛多肉', tips: '曬太陽會變紅' },
    { id: 10, name: '銀杏木', nameEn: 'Portulacaria', difficulty: '⭐', water: '中', sun: '全日照', season: '四季', desc: '適合做小盆景', tips: '扦插繁殖很容易' },
  ];

  const beginnerMistakes = [
    { emoji: '💀', title: '澆水過多', desc: '新手最常犯的錯！多肉植物寧可乾也不要濕。表土完全乾燥後再澆水，冬季更要減少。積水會導致根部腐爛。' },
    { emoji: '🌑', title: '光照不足', desc: '放在完全無光的室內會徒長（莖拉長、葉片間距變大）。盡量放在窗邊有散射光的地方。' },
    { emoji: '🏺', title: '花盆無排水孔', desc: '沒有排水孔的花盆容易積水導致爛根。如果用無孔花盆，底部一定要鋪厚厚的排水層。' },
    { emoji: '🌡️', title: '忽略溫度', desc: '大部分多肉不耐寒（5°C以下會凍傷），也不耐高溫悶熱。夏天要通風遮陽，冬天要搬進室內。' },
    { emoji: '✂️', title: '不敢修剪', desc: '徒長的多肉要果斷砍頭！砍下的頂部可以重新扦插，母株會長出更多側芽，變得更漂亮。' },
    { emoji: '🧴', title: '過度施肥', desc: '多肉不需要太多肥料。生長季節每月施一次薄肥即可，冬夏休眠期不要施肥。' },
    { emoji: '🌧️', title: '淋雨不管', desc: '梅雨季節讓多肉淋雨是大忌。長期潮濕容易引發黑腐和介殼蟲，下雨天務必移到遮雨處。' },
    { emoji: '📦', title: '買回來直接曬', desc: '網購多肉到貨後需要「緩苗」，先放散射光處3-5天適應環境，再慢慢增加光照。' },
    { emoji: '🫗', title: '只澆表面', desc: '澆水要澆透！只澆表面會讓根系往上生長，變得脆弱。正確做法是澆到底部排水孔有水流出。' },
    { emoji: '👥', title: '種太密', desc: '組盆時植物間要留適當間距。太密會影響通風和光照，容易發生病蟲害，也不利於各自生長。' },
  ];

  const tabs2 = [
    { key: 'guide' as const, label: '照護指南' },
    { key: 'varieties' as const, label: '常見品種' },
    { key: 'mistakes' as const, label: '新手禁忌' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-10 space-y-4">
      <div className="text-center py-3">
        <h1 className="text-lg font-bold" style={{ color: '#3D3530' }}>🌱 植栽照顧</h1>
      </div>
      <div className="flex gap-2 px-4">
        {tabs2.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap"
            style={{ backgroundColor: tab === t.key ? '#6B8F5E' : '#F0EDE8', color: tab === t.key ? '#fff' : '#3D3530' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'guide' && (
        <div className="space-y-3 px-1">
          {careGuide.map((section, i) => (
            <div key={i} className="rounded-2xl p-4" style={{ backgroundColor: '#F0EDE8' }}>
              <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>{section.title}</p>
              <div className="space-y-1.5">
                {section.items.map((item, j) => (
                  <p key={j} className="text-xs leading-relaxed" style={{ color: '#8C7B72' }}>• {item}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'varieties' && (
        <div className="space-y-2.5 px-1">
          {succulentData.map(s => (
            <div key={s.id} className="rounded-2xl p-3.5" style={{ backgroundColor: '#F0EDE8' }}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{s.name} <span className="font-normal text-xs" style={{ color: '#8C7B72' }}>{s.nameEn}</span></p>
                  <p className="text-xs mt-1" style={{ color: '#8C7B72' }}>{s.desc}</p>
                </div>
                <span className="text-xs">{s.difficulty}</span>
              </div>
              <div className="flex gap-3 mt-2 text-[10px]" style={{ color: '#8C7B72' }}>
                <span>💧 {s.water}</span><span>☀️ {s.sun}</span><span>🗓️ {s.season}</span>
              </div>
              <p className="text-[10px] mt-1.5" style={{ color: '#6B8F5E' }}>💡 {s.tips}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'mistakes' && (
        <div className="space-y-2.5 px-1">
          {beginnerMistakes.map((m, i) => (
            <div key={i} className="rounded-2xl p-4 flex gap-3" style={{ backgroundColor: '#F0EDE8' }}>
              <span className="text-2xl">{m.emoji}</span>
              <div>
                <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{m.title}</p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: '#8C7B72' }}>{m.desc}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ===================== PAGE: OIL WIKI =====================

const OIL_WIKI_DATA = [
  { id: 1, name: '薰衣草', nameEn: 'Lavender', family: '唇形科', nature: '涼', mainEffect: '放鬆安眠、皮膚修護', psychEffect: '安撫焦慮、幫助入眠' },
  { id: 2, name: '茶樹', nameEn: 'Tea Tree', family: '桃金孃科', nature: '涼', mainEffect: '抗菌消炎、淨化', psychEffect: '提振精神、淨化思緒' },
  { id: 3, name: '甜橙', nameEn: 'Sweet Orange', family: '芸香科', nature: '溫', mainEffect: '助消化、愉悅心情', psychEffect: '帶來快樂、緩解憂鬱' },
  { id: 4, name: '檸檬', nameEn: 'Lemon', family: '芸香科', nature: '涼', mainEffect: '提神醒腦、淨化空氣', psychEffect: '清新思緒、提升專注' },
  { id: 5, name: '尤加利', nameEn: 'Eucalyptus', family: '桃金孃科', nature: '涼', mainEffect: '呼吸順暢、驅蟲', psychEffect: '清理思緒、恢復活力' },
  { id: 6, name: '胡椒薄荷', nameEn: 'Peppermint', family: '唇形科', nature: '涼', mainEffect: '提神醒腦、舒緩頭痛', psychEffect: '提振精神、增強記憶' },
  { id: 7, name: '迷迭香', nameEn: 'Rosemary', family: '唇形科', nature: '溫', mainEffect: '增強記憶、促進循環', psychEffect: '提升專注力、激發靈感' },
  { id: 8, name: '天竺葵', nameEn: 'Geranium', family: '牻牛兒苗科', nature: '平', mainEffect: '平衡荷爾蒙、護膚', psychEffect: '平衡情緒、溫暖心靈' },
  { id: 9, name: '依蘭依蘭', nameEn: 'Ylang Ylang', family: '番荔枝科', nature: '溫', mainEffect: '平衡油脂、催情', psychEffect: '釋放壓力、增添浪漫' },
  { id: 10, name: '乳香', nameEn: 'Frankincense', family: '橄欖科', nature: '溫', mainEffect: '抗老化、冥想', psychEffect: '深度放鬆、靈性提升' },
  { id: 11, name: '佛手柑', nameEn: 'Bergamot', family: '芸香科', nature: '涼', mainEffect: '消化、護膚', psychEffect: '振奮情緒、驅散陰鬱' },
  { id: 12, name: '雪松', nameEn: 'Cedarwood', family: '松科', nature: '溫', mainEffect: '收斂、安定', psychEffect: '穩定心神、增強自信' },
  { id: 13, name: '快樂鼠尾草', nameEn: 'Clary Sage', family: '唇形科', nature: '溫', mainEffect: '荷爾蒙平衡、放鬆', psychEffect: '帶來愉悅、釋放恐懼' },
  { id: 14, name: '檀香', nameEn: 'Sandalwood', family: '檀香科', nature: '溫', mainEffect: '護膚、冥想', psychEffect: '深層寧靜、靈性連結' },
  { id: 15, name: '羅馬洋甘菊', nameEn: 'Roman Chamomile', family: '菊科', nature: '涼', mainEffect: '安撫、抗過敏', psychEffect: '深度放鬆、安撫情緒' },
];

const OIL_RECIPES = [
  { name: '安眠配方', desc: '助眠放鬆', oils: '薰衣草3滴 + 甜橙2滴 + 雪松1滴', method: '擴香儀或枕頭噴霧' },
  { name: '提神醒腦', desc: '工作學習', oils: '胡椒薄荷2滴 + 迷迭香2滴 + 檸檬2滴', method: '擴香儀' },
  { name: '舒壓放鬆', desc: '下班療癒', oils: '薰衣草3滴 + 佛手柑2滴 + 依蘭依蘭1滴', method: '泡澡或按摩' },
  { name: '淨化空間', desc: '居家清新', oils: '茶樹3滴 + 檸檬2滴 + 尤加利1滴', method: '擴香儀或噴霧' },
  { name: '專注配方', desc: '考試工作', oils: '迷迭香3滴 + 檸檬2滴 + 胡椒薄荷1滴', method: '擴香儀' },
  { name: '情緒平衡', desc: '經期舒緩', oils: '天竺葵2滴 + 快樂鼠尾草2滴 + 薰衣草2滴', method: '腹部按摩（加基底油）' },
  { name: '肌膚修護', desc: '日常保養', oils: '薰衣草2滴 + 乳香2滴 + 天竺葵1滴', method: '加入荷荷巴油按摩' },
  { name: '浪漫氛圍', desc: '約會之夜', oils: '依蘭依蘭2滴 + 檀香2滴 + 甜橙1滴', method: '擴香儀' },
];

function OilWikiPage() {
  const [tab, setTab] = useState<'guide' | 'function' | 'recipe' | 'carrier' | 'ratio'>('guide');
  const [searchText, setSearchText] = useState('');

  const filteredOils = useMemo(() => {
    if (!searchText.trim()) return OIL_WIKI_DATA;
    const q = searchText.toLowerCase();
    return OIL_WIKI_DATA.filter(o =>
      o.name.includes(q) || o.nameEn.toLowerCase().includes(q) || o.mainEffect.includes(q) || o.psychEffect.includes(q)
    );
  }, [searchText]);

  const tabs3 = [
    { key: 'guide' as const, label: '精油圖鑑' },
    { key: 'function' as const, label: '找功效' },
    { key: 'recipe' as const, label: '配方參考' },
    { key: 'carrier' as const, label: '植物油' },
    { key: 'ratio' as const, label: '精油比例' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-10 space-y-4">
      <div className="text-center py-3">
        <h1 className="text-lg font-bold" style={{ color: '#3D3530' }}>🫧 精油百科</h1>
      </div>
      <div className="flex gap-2 px-4 overflow-x-auto">
        {tabs3.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap"
            style={{ backgroundColor: tab === t.key ? '#A8B876' : '#F0EDE8', color: tab === t.key ? '#fff' : '#3D3530' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'guide' && (
        <div className="space-y-2.5 px-1">
          <input type="text" placeholder="搜尋精油名稱或功效..." value={searchText} onChange={e => setSearchText(e.target.value)}
            className="w-full rounded-xl px-4 py-2.5 text-sm outline-none" style={{ backgroundColor: '#F0EDE8', color: '#3D3530' }} />
          {filteredOils.map(o => (
            <div key={o.id} className="rounded-2xl p-3.5" style={{ backgroundColor: '#F0EDE8' }}>
              <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{o.name} <span className="font-normal text-xs" style={{ color: '#8C7B72' }}>{o.nameEn}</span></p>
              <div className="flex gap-3 mt-1.5 text-[10px]" style={{ color: '#8C7B72' }}>
                <span>{o.family}</span><span>{o.nature}性</span>
              </div>
              <p className="text-xs mt-1.5" style={{ color: '#3D3530' }}>🌿 {o.mainEffect}</p>
              <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>🧠 {o.psychEffect}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'function' && (
        <div className="space-y-2.5 px-1">
          <input type="text" placeholder="輸入你想改善的問題..." value={searchText} onChange={e => setSearchText(e.target.value)}
            className="w-full rounded-xl px-4 py-2.5 text-sm outline-none" style={{ backgroundColor: '#F0EDE8', color: '#3D3530' }} />
          {OIL_WIKI_DATA.filter(o => {
            if (!searchText.trim()) return true;
            const q = searchText.toLowerCase();
            return o.mainEffect.includes(q) || o.psychEffect.includes(q) || o.name.includes(q);
          }).map(o => (
            <div key={o.id} className="rounded-2xl p-3.5" style={{ backgroundColor: '#F0EDE8' }}>
              <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{o.name}</p>
              <p className="text-xs mt-1" style={{ color: '#3D3530' }}>🌿 {o.mainEffect}</p>
              <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>🧠 {o.psychEffect}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'recipe' && (
        <div className="space-y-2.5 px-1">
          {OIL_RECIPES.map((r, i) => (
            <div key={i} className="rounded-2xl p-4" style={{ backgroundColor: '#F0EDE8' }}>
              <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{r.name}</p>
              <p className="text-[10px] mb-2" style={{ color: '#8C7B72' }}>{r.desc}</p>
              <p className="text-xs" style={{ color: '#3D3530' }}>🧴 {r.oils}</p>
              <p className="text-[10px] mt-1" style={{ color: '#8C7B72' }}>使用方式：{r.method}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'carrier' && (
        <div className="space-y-2.5 px-1">
          {[
            { name: '荷荷巴油', desc: '最接近人體皮脂，適合所有膚質，清爽不油膩' },
            { name: '甜杏仁油', desc: '質地輕柔好吸收，適合敏感肌和嬰幼兒' },
            { name: '椰子油', desc: '滋潤度高，適合乾性肌膚和護髮使用' },
            { name: '葡萄籽油', desc: '質地最清爽，適合油性和混合性肌膚' },
            { name: '玫瑰果油', desc: '富含維他命C，淡化疤痕和細紋，適合熟齡肌' },
            { name: '酪梨油', desc: '營養豐富，適合極乾燥和受損肌膚' },
          ].map((c, i) => (
            <div key={i} className="rounded-2xl p-3.5" style={{ backgroundColor: '#F0EDE8' }}>
              <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{c.name}</p>
              <p className="text-xs mt-1" style={{ color: '#8C7B72' }}>{c.desc}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'ratio' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 px-1">
          {/* 稀釋比例 */}
          <div className="rounded-2xl p-4" style={{ backgroundColor: '#F0EDE8' }}>
            <p className="text-sm font-semibold mb-2" style={{ color: '#3D3530' }}>一、稀釋比例參考</p>
            {['1% = 每 10ml 基底油加 2 滴精油（臉部保養、敏感肌）', '2% = 每 10ml 基底油加 4 滴精油（日常身體按摩）', '3% = 每 10ml 基底油加 6 滴精油（局部加強護理）', '5% = 每 10ml 基底油加 10 滴精油（急性處理，短期使用）'].map((t, i) => (
              <p key={i} className="text-xs leading-relaxed mb-1" style={{ color: '#8C7B72' }}>• {t}</p>
            ))}
          </div>
          {/* 各對象濃度 */}
          <div className="rounded-2xl p-4" style={{ backgroundColor: '#F0EDE8' }}>
            <p className="text-sm font-semibold mb-2" style={{ color: '#3D3530' }}>二、各對象適合濃度</p>
            {['嬰幼兒（2歲以下）：不建議使用，可用純露代替', '兒童（2-12歲）：0.5%-1%', '青少年/成人：2%-3%', '孕婦：1% 以下，且避免特定精油', '老年人：1%-2%'].map((t, i) => (
              <p key={i} className="text-xs leading-relaxed mb-1" style={{ color: '#8C7B72' }}>• {t}</p>
            ))}
          </div>
          {/* 調香黃金比例 */}
          <div className="rounded-2xl p-4" style={{ backgroundColor: '#F0EDE8' }}>
            <p className="text-sm font-semibold mb-2" style={{ color: '#3D3530' }}>三、調香黃金比例 3:2:1</p>
            {['前調（3份）：柑橘類、薄荷等（揮發快，第一印象）', '中調（2份）：花類、草本類（主體香氣）', '後調（1份）：木質、樹脂類（持久基底）', '範例：甜橙3滴 + 薰衣草2滴 + 雪松1滴'].map((t, i) => (
              <p key={i} className="text-xs leading-relaxed mb-1" style={{ color: '#8C7B72' }}>• {t}</p>
            ))}
          </div>
          {/* 注意事項 */}
          <div className="space-y-3">
            <p className="text-sm font-semibold" style={{ color: '#3D3530' }}>四、使用注意事項</p>
            {[
              '精油不可直接塗抹在皮膚上（茶樹和薰衣草例外，但仍建議稀釋）',
              '使用前先在手腕內側做皮膚測試，等待24小時確認無過敏反應',
              '柑橘類精油（甜橙、檸檬、佛手柑）有光敏性，使用後避免日曬',
              '孕婦避免使用：索馬利亞乳香、百里酚百里香、甜茴香、馬鞭草酮迷迭香',
              '蠶豆症患者及2歲以下嬰幼兒避免使用胡椒薄荷',
              '精油保存於深色玻璃瓶中，遠離陽光和火源',
              '開封後柑橘類精油建議6個月內用完，其他精油1-2年',
            ].map((note, idx) => (
              <div key={idx} className="flex gap-2 items-start px-3 py-2 rounded-lg" style={{ backgroundColor: '#F0EDE8' }}>
                <span className="text-xs flex-shrink-0" style={{ color: '#E8735A' }}>⚠️</span>
                <p className="text-xs" style={{ color: '#8C7B72' }}>{note}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}


