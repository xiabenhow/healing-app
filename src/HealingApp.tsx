import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs, query, orderBy, Timestamp, addDoc, where } from 'firebase/firestore';
import { auth, googleProvider, db } from './lib/firebase';
import { isNative, initNativeApp, openPaymentUrl, openUrl, hapticLight, hapticSuccess } from './capacitorHelpers';
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


// ===================== TYPES =====================

type PageType = 'home' | 'diary' | 'recipe' | 'card' | 'healer' | 'library' | 'calendar' | 'sound' | 'booking' | 'member' | 'shop' | 'healing' | 'bedtime' | 'custom' | 'service' | 'wishlist';
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
    id: 'custom', emoji: '✨', title: '客製服務',
    sub: '做一份只屬於你的、或送給重要的人',
    quickItems: [
      {
        q: '想做專屬香氛',
        a: '可以來上精油調香課，由調香師一對一帶你選精油、調配比例，做出一瓶只屬於你的味道。也可以在 App 的「調一瓶更像你的」功能留下你的情緒狀態和喜好，調香師會為你量身配方。',
      },
      {
        q: '想客製禮物',
        a: '我們有幾種方式：買課程體驗券送人（讓對方自己選喜歡的課）、訂製禮盒（蠟燭+擴香+手作小物的組合）、或直接帶對方來上課做一份手作禮物。如果有特殊需求，例如想在蠟燭上刻字、或指定特定花材，LINE 跟我們說就好。',
      },
      {
        q: '想辦一場私人活動',
        a: '我們的空間最多可以容納 65 人，很適合辦生日派對、閨蜜聚會、求婚驚喜等私人活動。可以搭配手作課程，讓大家一邊做一邊聊。費用和細節依人數和課程內容而定，請 LINE 或來電洽詢，我們會幫你規劃。',
      },
      {
        q: '想做企業贈禮',
        a: '可以客製蠟燭禮盒、擴香禮盒、水晶手鍊禮盒等，可以加上企業 LOGO 或專屬包裝。數量從 30 份起訂，詳細報價請 LINE 或 email（xiabenhow@gmail.com）告訴我們數量和需求。',
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
  { emoji: '🕯️', title: '點一盞光', desc: '做一支蠟燭，讓房間有你的味道', categoryId: 18 },
  { emoji: '🌿', title: '調一瓶香氣', desc: '選你今天最想靠近的氣味', categoryId: 173 },
  { emoji: '🌱', title: '種一棵小植物', desc: '照顧它的同時，也在照顧自己', categoryId: 22 },
  { emoji: '💍', title: '做一個小飾品', desc: '手上多了一個只屬於你的東西', categoryId: 21 },
  { emoji: '🎨', title: '畫點什麼', desc: '不需要很會畫，動筆就好', categoryId: 24 },
  { emoji: '💐', title: '插一束花', desc: '讓今天的空間有不一樣的呼吸', categoryId: 25 },
  { emoji: '📦', title: '在家做', desc: '材料包寄到家，慢慢來就好', categoryId: 75 },
];

// ===================== CONSTANTS =====================


const DAILY_QUOTES = [
  '你不需要解決所有事。今天，先照顧好自己就好。',
  '慢下來不是落後。是在聽自己說話。',
  '你今天也打開了這裡，這就很好了。',
  '今天的感受，不管是什麼，都是真的、都值得被看見。',
  '不完美的今天，也是你完整的一天。',
  '你很好。就算你現在不這麼覺得。',
  '先深呼吸一次。其他的，等等再說。',
  '你來了，我在。',
  '今天不用很厲害，好好的就好。',
];

const MICRO_TASKS = [
  '試著做三次深呼吸——吸氣 4 秒，屏息 4 秒，慢慢吐氣 6 秒。就這樣就好。',
  '現在把肩膀慢慢放下來，感受後背靠著椅子。讓身體先安定。',
  '去倒一杯溫水，慢慢喝完。這是今天送給自己的小儀式。',
  '閉上眼睛，想一個讓你覺得安心的地方。在那裡待一下。',
  '伸展一下手臂和脖子。身體記得的比你想得多。',
];

// --- NEW: Daily Task System ---
const TASK_LABELS: Record<TaskKey, string> = {
  checkin: '跟自己打個招呼',
  card: '抽一張今天的卡片',
  note: '寫點什麼給自己',
  breathe: '跟著呼吸一下',
  evening: '跟今天的自己說晚安',
  share: '把溫暖分享出去',
};

const TASK_KEYS: TaskKey[] = ['checkin', 'card', 'note', 'breathe', 'evening', 'share'];

// --- NEW: Evening Feedback Responses ---
const EVENING_RESPONSES: Record<string, string> = {
  better: '真好。你今天有照顧到自己了。帶著這份感覺，好好睡吧。',
  little: '一點點也很好。不用跟昨天比，今天的你已經夠努力了。',
  same: '沒關係的。有些日子就是這樣，你不需要好起來才值得被溫柔對待。',
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

  return (
    <motion.div
      className="space-y-5"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* 1. 時段問候 */}
      <motion.div variants={staggerItem} className="flex items-center justify-between">
        <p className="text-sm leading-relaxed" style={{ color: '#3D3530' }}>
          {getGreeting()}
        </p>
        <p className="text-xs" style={{ color: '#8C7B72' }}>{getDisplayDate()}</p>
      </motion.div>

      {/* 2. 情緒打卡 */}
      {!todayRecord ? (
        <motion.div variants={staggerItem}>
          <EmotionCheckInFlow onComplete={onCheckIn} />
        </motion.div>
      ) : (
        <motion.div variants={staggerItem} className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: (todayEmoInfo?.color || '#C9A96E') + '25' }}>
              <span className="text-xl">{todayEmoInfo?.emoji}</span>
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: '#3D3530' }}>
                {todayEmoInfo?.label}
              </p>
              <p className="text-xs" style={{ color: '#8C7B72' }}>
                {todayHealingData ? `${todayHealingData.levelLabel}` : todayRecord.level || 'L1'}
              </p>
            </div>
          </div>
          {todayHealingData && (
            <p className="text-xs leading-relaxed" style={{ color: '#5C534C' }}>
              {getRandomWarmMessage(todayRecord.emotion, todayRecord.level || 'L1')}
            </p>
          )}
        </motion.div>
      )}

      {/* 3. 今日一句話 */}
      {todayRecord && (
        <motion.div
          variants={staggerItem}
          className="rounded-3xl p-5 shadow-sm"
          style={{
            background: `linear-gradient(135deg, ${todayEmoInfo?.color || '#C9A96E'}33, ${todayEmoInfo?.color || '#C9A96E'}11)`,
          }}
        >
          <p className="text-sm leading-relaxed text-center italic" style={{ color: '#3D3530' }}>
            「{getRandomWarmMessage(todayRecord.emotion, todayRecord.level || 'L1')}」
          </p>
        </motion.div>
      )}

      {/* 4. 今日香氣 - only show after check-in */}
      {todayRecord && todayHealingData && (
        <motion.div variants={staggerItem} className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-xs font-medium mb-3" style={{ color: '#C9A96E' }}>🌿 今日香氣</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {todayHealingData.blend.oils.map((oil, i) => (
              <span
                key={i}
                className="px-3 py-1.5 rounded-full text-xs font-medium"
                style={{ backgroundColor: '#FAF8F5', color: '#3D3530' }}
              >
                {oil}
              </span>
            ))}
          </div>
          <p className="text-xs leading-relaxed" style={{ color: '#8C7B72' }}>
            {todayHealingData.blend.note}
          </p>
        </motion.div>
      )}

      {/* 5. 今日小儀式 - only after check-in */}
      {todayRecord && todayHealingData && (
        <motion.div variants={staggerItem} className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-xs font-medium mb-3" style={{ color: '#C9A96E' }}>✦ 今日小儀式</p>
          <p className="text-xs leading-relaxed mb-4" style={{ color: '#3D3530' }}>
            {todayHealingData.practicalTips[0]}
          </p>
          <div className="flex justify-center">
            <BreathingCircle />
          </div>
        </motion.div>
      )}

      {/* 6. 今日音景推薦 - only after check-in */}
      {todayRecord && (
        <motion.div variants={staggerItem} className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">{recommendedSound.emoji}</span>
            <div>
              <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{recommendedSound.label}</p>
              <p className="text-xs" style={{ color: '#8C7B72' }}>{recommendedSound.reason}</p>
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onGoToSound}
            className="w-full rounded-2xl py-2.5 text-white font-medium text-sm"
            style={{ backgroundColor: '#8FA886' }}
          >
            播放
          </motion.button>
        </motion.div>
      )}

      {/* 7. 睡前儀式入口 - after 20:00 */}
      {showBedtime && todayRecord && (
        <motion.div variants={staggerItem}>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onGoToBedtime}
            className="w-full rounded-3xl p-5 shadow-sm text-left"
            style={{ background: 'linear-gradient(135deg, #2D2438, #1A1A2E)' }}
          >
            <p className="text-sm font-bold text-white mb-1">今晚，慢慢來</p>
            <p className="text-xs" style={{ color: '#B8A8C8' }}>讓香氛陪你把今天放下</p>
          </motion.button>
        </motion.div>
      )}

      {/* 8. 柔和推薦 + 動手做入口 - after check-in */}
      {todayRecord && onNavigate && (
        <motion.div variants={staggerItem}>
          <CompanionRecommendation emotion={todayRecord.emotion} onNavigate={onNavigate} />
        </motion.div>
      )}
      {todayRecord && onNavigate && (
        <motion.div variants={staggerItem}>
          <HandsOnCard onNavigate={onNavigate} />
        </motion.div>
      )}
      {todayRecord && (
        <motion.div variants={staggerItem} className="space-y-3 rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onGoToCustom}
            className="w-full text-left"
          >
            <p className="text-xs font-medium mb-1" style={{ color: '#3D3530' }}>想把今天的香氣帶回家嗎？</p>
            <p className="text-xs" style={{ color: '#8C7B72' }}>讓香氛師幫你調一瓶更像你的</p>
          </motion.button>
        </motion.div>
      )}

      {/* 9. 最近紀錄摘要 */}
      <motion.div
        variants={staggerItem}
        onClick={onGoToDiary}
        className="rounded-3xl p-5 shadow-sm cursor-pointer"
        style={{ backgroundColor: '#FFFEF9' }}
      >
        <p className="text-xs font-medium mb-3" style={{ color: '#3D3530' }}>
          你已經連續陪伴自己 {streak} 天了 ✦
        </p>
        <div className="flex gap-1.5">
          {records.slice(-7).reverse().map((r, i) => (
            <div
              key={i}
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: r ? getEmotionInfo(r.emotion).color : '#E8E3DC' }}
            />
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
        <button onClick={() => setPrivacyMode(!privacyMode)}
          className="px-3 py-1.5 rounded-xl text-xs transition-all"
          style={{ backgroundColor: privacyMode ? '#3D3530' : '#FFFEF9', color: privacyMode ? '#fff' : '#8C7B72' }}>
          {privacyMode ? '🔒' : '🔓'}
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
    </motion.div>
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
    playMain, toggleAux, stopAll, setTimer, playForEmotion, toggleBowl, strikeBowl,
  } = useSoundscapeHook();

  const [showAux, setShowAux] = useState(false);
  const [showBowls, setShowBowls] = useState(false);
  const [showBreathing, setShowBreathing] = useState(false);
  // 分類各類預設
  const scapePresets = SCAPE_PRESETS_IMPORT.filter(p => p.isMain && p.category !== 'breathing');
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
      earnEnergy('sound');
    }
  }, [isPlaying]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
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

      {/* ===================== 呼吸同步區塊 ===================== */}
      <div>
        <button
          onClick={() => setShowBreathing(!showBreathing)}
          className="flex items-center gap-2 mb-2"
        >
          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>
            🫧 呼吸同步
          </p>
          <span className="text-xs" style={{ color: '#8C7B72' }}>
            {showBreathing ? '收起' : '跟著聲音呼吸 →'}
          </span>
          {wellnessRec?.breathing && (
            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#7BAFD420', color: '#7BAFD4' }}>
              推薦
            </span>
          )}
        </button>
        <AnimatePresence>
          {showBreathing && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-2 overflow-hidden"
            >
              <p className="text-xs" style={{ color: '#8C7B72' }}>
                不用看畫面，跟著聲音的起伏自然呼吸就好
              </p>
              {breathingPresets.map(preset => {
                const isActive = mainScape === preset.key;
                const isRecommended = wellnessRec?.breathing === preset.key;
                return (
                  <motion.button
                    key={preset.key}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => playMain(preset)}
                    className="w-full rounded-2xl p-4 text-left transition-all"
                    style={{
                      backgroundColor: isActive ? preset.color + '20' : isRecommended ? '#FFF8E7' : '#FFFEF9',
                      border: isActive ? `2px solid ${preset.color}` : isRecommended ? '1px solid #C9A96E40' : '1px solid #F0EDE8',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{preset.emoji}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium" style={{ color: '#3D3530' }}>{preset.label}</p>
                          {isRecommended && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#C9A96E20', color: '#C9A96E' }}>推薦</span>}
                        </div>
                        <p className="text-xs" style={{ color: '#8C7B72' }}>{preset.subtitle}</p>
                        {preset.breathingPattern && (
                          <p className="text-xs mt-0.5" style={{ color: preset.color }}>
                            吸 {preset.breathingPattern.inhale}s → 停 {preset.breathingPattern.hold}s → 吐 {preset.breathingPattern.exhale}s
                            {preset.breathingPattern.holdAfter ? ` → 停 ${preset.breathingPattern.holdAfter}s` : ''}
                          </p>
                        )}
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>


      {/* Gentle tip */}
      <div className="rounded-2xl p-4" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
        <p className="text-xs leading-relaxed italic text-center" style={{ color: '#8C7B72' }}>
          這些聲音會像呼吸一樣慢慢起伏，偶爾有一點小變化。<br/>
          呼吸同步會跟著你的節奏引導，冥想極簡到幾乎感受不到。<br/>
          水晶缽可以和任何音景疊加。
        </p>
      </div>
    </motion.div>
  );
}

// ===================== PAGE: SHOP (COMMERCE) =====================

function ShopPage() {
  const [view, setView] = useState<'products' | 'detail' | 'cart' | 'checkout'>('products');
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
      {view === 'products' && <ShopProductsView categoryId={selectedCategoryId} onSelectCategory={setSelectedCategoryId} onSelectProduct={handleSelectProduct} onNavigateCart={() => setView('cart')} cartCount={cart.length} />}
      {view === 'detail' && selectedProduct && <ProductDetailView product={selectedProduct} onBack={handleBackFromDetail} onAddToCart={addToCart} />}
      {view === 'cart' && <CartView cart={cart} onUpdateQuantity={updateCartQuantity} onRemove={removeFromCart} onCheckout={() => setView('checkout')} onBack={() => setView('products')} />}
      {view === 'checkout' && <CheckoutView cart={cart} onBack={() => setView('cart')} />}
    </motion.div>
  );
}


function ShopProductsView({
  categoryId,
  onSelectCategory,
  onSelectProduct,
  onNavigateCart,
  cartCount,
}: {
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
        const url = `${API_BASE}/api/wc/products?category=${categoryId}`;

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

      {/* 情境入口 - Emotion Scenario Buttons */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
        {[
          { emoji: '🧘', label: '想放鬆' },
          { emoji: '😴', label: '想好睡' },
          { emoji: '💆', label: '穩定情緒' },
          { emoji: '🕯️', label: '做儀式' },
          { emoji: '🎁', label: '送禮' },
        ].map(scenario => (
          <motion.button
            key={scenario.label}
            whileTap={{ scale: 0.96 }}
            className="flex-shrink-0 px-4 py-2 rounded-full text-xs font-medium"
            style={{ backgroundColor: '#FAF8F5', color: '#3D3530', whiteSpace: 'nowrap' }}
          >
            {scenario.emoji} {scenario.label}
          </motion.button>
        ))}
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
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {/* Wishlist Toast */}
      <AnimatePresence>
        {wishlistToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl text-xs font-medium shadow-lg"
            style={{ backgroundColor: '#3D3530', color: 'white' }}
          >
            {wishlistToast}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ProductDetailView({ product, onBack, onAddToCart }: { product: WCProduct; onBack: () => void; onAddToCart: (item: CartItem) => void }) {
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // 生成未來 14 天的日期選項
  const dateOptions = useMemo(() => {
    const dates: { value: string; label: string }[] = [];
    const today = new Date();
    for (let i = 1; i <= 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
      const label = `${d.getMonth() + 1}/${d.getDate()} (${weekdays[d.getDay()]})`;
      dates.push({ value, label });
    }
    return dates;
  }, []);

  // 預設時段（實際應從 WC 或 Phive Booking 取得）
  const defaultTimeSlots = ['10:00', '11:00', '13:00', '14:00', '15:00', '16:00'];

  // 當選擇日期時載入可用時段
  useEffect(() => {
    if (!bookingDate || !(product.virtual || product.type === 'virtual')) return;
    setSlotsLoading(true);
    setBookingTime('');
    // 嘗試從 WC 取得時段，失敗則用預設
    fetch(`${API_BASE}/api/wc/products/${product.id}/booking-slots?date=${bookingDate}`)
      .then(res => res.json())
      .then(data => {
        if (data.slots && data.slots.length > 0) {
          setAvailableSlots(data.slots);
        } else {
          setAvailableSlots(defaultTimeSlots);
        }
      })
      .catch(() => {
        setAvailableSlots(defaultTimeSlots);
      })
      .finally(() => setSlotsLoading(false));
  }, [bookingDate, product.id, product.virtual, product.type]);

  const cleanHtml = (html: string) => {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').trim();
  };

  const isVirtual = product.virtual || product.type === 'virtual';

  const handleAddToCart = () => {
    if (isVirtual && !bookingDate) {
      alert('請選擇預約日期');
      return;
    }
    if (isVirtual && !bookingTime) {
      alert('請選擇預約時段');
      return;
    }
    console.log(`加入購物車: ${product.name}`);
    const specsArr: string[] = [];
    if (isVirtual && bookingDate) specsArr.push(`日期: ${bookingDate}`);
    if (isVirtual && bookingTime) specsArr.push(`時段: ${bookingTime}`);
    specsArr.push(`數量: ${quantity}`);

    const item: CartItem = {
      id: `product-${product.id}-${bookingDate || 'na'}-${bookingTime || 'na'}`,
      productId: product.id,
      name: product.name,
      specs: specsArr.join(' / '),
      price: Math.round(parseFloat(product.price)),
      quantity,
      isVirtual,
      image: product.images && product.images.length > 0 ? product.images[0].src : undefined,
      bookingDate: bookingDate || undefined,
      bookingTime: bookingTime || undefined,
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
        <p className="text-2xl font-bold mb-2" style={{ color: '#8FA886' }}>
          NT${parseFloat(product.price).toLocaleString('zh-TW', { maximumFractionDigits: 0 })}
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
        {!product.manage_stock && product.stock_status === 'outofstock' && (
          <div className="mb-3 p-3 rounded-xl" style={{ backgroundColor: '#FAF8F5', border: '1px solid #F0EDE8' }}>
            <p className="text-xs font-bold" style={{ color: '#C9A96E' }}>目前無場次</p>
            <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>可與老師預約包班，LINE 或來電洽詢</p>
          </div>
        )}
        {product.manage_stock && product.stock_quantity !== null && product.stock_quantity <= 0 && (
          <div className="mb-3 p-3 rounded-xl" style={{ backgroundColor: '#FAF8F5', border: '1px solid #F0EDE8' }}>
            <p className="text-xs font-bold" style={{ color: '#C9A96E' }}>目前無場次</p>
            <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>可與老師預約包班，LINE 或來電洽詢</p>
          </div>
        )}
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

      {/* Booking Date/Time for Virtual Products */}
      {isVirtual && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-4 space-y-3"
          style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
        >
          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>📅 預約日期與時段</p>

          {/* Date Selection */}
          <div>
            <label className="text-xs" style={{ color: '#8C7B72' }}>選擇日期</label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {dateOptions.map(d => (
                <motion.button
                  key={d.value}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setBookingDate(d.value)}
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

          {/* Time Slot Selection */}
          {bookingDate && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <label className="text-xs" style={{ color: '#8C7B72' }}>選擇時段</label>
              {slotsLoading ? (
                <p className="text-xs mt-2" style={{ color: '#8C7B72' }}>載入時段中...</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {availableSlots.map(time => (
                    <motion.button
                      key={time}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setBookingTime(time)}
                      className="py-2 px-2 rounded-lg text-sm font-medium transition-all"
                      style={{
                        backgroundColor: bookingTime === time ? '#8FA886' : '#FAF8F5',
                        color: bookingTime === time ? '#fff' : '#3D3530',
                        border: `1px solid ${bookingTime === time ? '#8FA886' : '#F0EDE8'}`,
                      }}
                    >
                      {time}
                    </motion.button>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {bookingDate && bookingTime && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-2 rounded-lg text-xs" style={{ backgroundColor: '#E8F0E8', color: '#3D3530' }}>
              已選擇: {bookingDate} {bookingTime}
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Quantity Selection */}
      <motion.div className="rounded-2xl p-4" style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}>
        <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>{isVirtual ? '👥 人數' : '📦 數量'}</p>
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

function CheckoutView({ cart, onBack }: { cart: CartItem[]; onBack: () => void }) {
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

  // 陪伴能量票券
  const [availableCoupons] = useState<CompanionCoupon[]>(() => getAvailableCoupons());
  const [selectedCoupon, setSelectedCoupon] = useState<CompanionCoupon | null>(() => {
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return getBestCouponForAmount(total);
  });
  const [showCouponPicker, setShowCouponPicker] = useState(false);
  const [couponSkipped, setCouponSkipped] = useState(false);

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

      // Mark coupon as used if one was selected
      if (!couponSkipped && selectedCoupon) {
        useCoupon(selectedCoupon.id);
      }

      const finalAmount = (!couponSkipped && selectedCoupon) ? total - selectedCoupon.discount : total;
      alert(`訂單已建立\n訂單編號: ${orderId}\n金額: NT$${finalAmount.toLocaleString()}${selectedCoupon && !couponSkipped ? `\n已使用票券「${selectedCoupon.name}」折抵 NT$${selectedCoupon.discount}` : ''}`);
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

      {/* 陪伴能量票券 - 今天想送你一點溫柔 */}
      {availableCoupons.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-5 space-y-3"
          style={{ backgroundColor: '#FFF8E7', border: '1px solid #F0EDE8' }}
        >
          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>🌿 今天想送你一點溫柔</p>

          {!couponSkipped && selectedCoupon ? (
            <div>
              {/* Selected coupon display */}
              <motion.div
                className="p-3 rounded-xl flex items-center gap-3"
                style={{ backgroundColor: '#FFFEF9', border: '1px solid #C5D9BE' }}
              >
                <span className="text-2xl">{selectedCoupon.emoji}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: '#3D3530' }}>{selectedCoupon.name}</p>
                  <p className="text-xs" style={{ color: '#8C7B72' }}>{selectedCoupon.description}</p>
                  <p className="text-xs font-bold mt-1" style={{ color: '#8FA886' }}>折抵 NT${selectedCoupon.discount}</p>
                </div>
              </motion.div>
              <div className="flex gap-2 mt-2">
                {availableCoupons.length > 1 && (
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setShowCouponPicker(!showCouponPicker)}
                    className="flex-1 py-2 rounded-lg text-xs font-medium"
                    style={{ backgroundColor: '#FAF8F5', color: '#3D3530', border: '1px solid #F0EDE8' }}
                  >
                    {showCouponPicker ? '收起' : '換一張'}
                  </motion.button>
                )}
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => { setCouponSkipped(true); setSelectedCoupon(null); }}
                  className="flex-1 py-2 rounded-lg text-xs font-medium"
                  style={{ backgroundColor: '#FAF8F5', color: '#8C7B72', border: '1px solid #F0EDE8' }}
                >
                  這次先不用，留給下次
                </motion.button>
              </div>
            </div>
          ) : couponSkipped ? (
            <div>
              <p className="text-xs" style={{ color: '#8C7B72' }}>沒關係，票券會在這裡等你的 🌿</p>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  setCouponSkipped(false);
                  setSelectedCoupon(getBestCouponForAmount(total));
                }}
                className="mt-2 py-2 px-4 rounded-lg text-xs font-medium"
                style={{ backgroundColor: '#FAF8F5', color: '#3D3530', border: '1px solid #F0EDE8' }}
              >
                還是想用一張
              </motion.button>
            </div>
          ) : (
            <p className="text-xs" style={{ color: '#8C7B72' }}>目前沒有適合這筆訂單的票券</p>
          )}

          {/* Coupon picker */}
          <AnimatePresence>
            {showCouponPicker && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2"
              >
                {availableCoupons.map(coupon => {
                  const isOverAmount = coupon.discount > total;
                  return (
                    <motion.button
                      key={coupon.id}
                      whileTap={isOverAmount ? {} : { scale: 0.97 }}
                      onClick={() => {
                        if (!isOverAmount) {
                          setSelectedCoupon(coupon);
                          setCouponSkipped(false);
                          setShowCouponPicker(false);
                        }
                      }}
                      className="w-full p-3 rounded-xl flex items-center gap-3 text-left"
                      style={{
                        backgroundColor: selectedCoupon?.id === coupon.id ? '#E8F0E8' : isOverAmount ? '#F5F3F0' : '#FFFEF9',
                        opacity: isOverAmount ? 0.5 : 1,
                        border: selectedCoupon?.id === coupon.id ? '1px solid #8FA886' : '1px solid #F0EDE8',
                      }}
                    >
                      <span className="text-lg">{coupon.emoji}</span>
                      <div className="flex-1">
                        <p className="text-xs font-medium" style={{ color: '#3D3530' }}>{coupon.name}</p>
                        <p className="text-[10px]" style={{ color: '#8C7B72' }}>
                          {isOverAmount ? `面額超過訂單金額` : `折抵 NT$${coupon.discount} · ${coupon.applicableTo}`}
                        </p>
                      </div>
                    </motion.button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Order Summary */}
      <motion.div className="rounded-2xl p-5 text-center" style={{ backgroundColor: '#FAF8F5' }}>
        <p className="text-sm mb-2" style={{ color: '#8C7B72' }}>訂單金額</p>
        <p className="text-2xl font-bold" style={{ color: '#8FA886' }}>NT${total.toLocaleString()}</p>
        {!couponSkipped && selectedCoupon && (
          <div className="mt-2 space-y-1">
            <p className="text-xs" style={{ color: '#8C7B72' }}>
              {selectedCoupon.emoji} {selectedCoupon.name} -{' '}
              <span style={{ color: '#C48B6C', fontWeight: 600 }}>-NT${selectedCoupon.discount}</span>
            </p>
            <p className="text-lg font-bold" style={{ color: '#C9A96E' }}>
              實付 NT${(total - selectedCoupon.discount).toLocaleString()}
            </p>
          </div>
        )}
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
  const [energyState, setEnergyState] = useState<EnergyState>(() => loadEnergy());
  const [showEnergyDetail, setShowEnergyDetail] = useState(false);

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
        await signInWithPopup(auth, googleProvider);
      }
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
        <h2 className="text-xl font-bold" style={{ color: '#3D3530' }}>你的陪伴檔案</h2>
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
            <p className="font-bold text-sm" style={{ color: '#3D3530' }}>
              {user.displayName || '使用者'}
            </p>
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
      </motion.div>

      {/* BLOCK 1: 我的陪伴紀錄 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-3xl p-5 shadow-sm"
        style={{ backgroundColor: '#FFFEF9' }}
      >
        <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>我的陪伴紀錄</p>
        <div className="space-y-3">
          <div>
            <p className="text-3xl font-bold" style={{ color: '#8FA886' }}>{streak}</p>
            <p className="text-xs mt-1" style={{ color: '#8C7B72' }}>你已經連續陪伴自己 {streak} 天了</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-2xl" style={{ backgroundColor: '#FAF8F5' }}>
              <p className="text-xs" style={{ color: '#8C7B72' }}>本月打卡</p>
              <p className="text-lg font-bold" style={{ color: '#3D3530' }}>{monthCheckins}</p>
            </div>
            <div className="p-3 rounded-2xl" style={{ backgroundColor: '#FAF8F5' }}>
              <p className="text-xs" style={{ color: '#8C7B72' }}>常見情緒</p>
              <p className="text-lg font-bold" style={{ color: '#3D3530' }}>
                {mostFrequentInfo?.label || '-'}
              </p>
            </div>
          </div>
          {mostFrequentInfo && (
            <p className="text-xs leading-relaxed" style={{ color: '#5C534C' }}>
              你最近比較需要被陪伴的是：<span style={{ fontWeight: 600 }}>安定與理解</span>
            </p>
          )}
          <div className="flex gap-1.5">
            {records.slice(-7).reverse().map((r, i) => (
              <div
                key={i}
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: getEmotionInfo(r.emotion).color }}
              />
            ))}
          </div>
        </div>
      </motion.div>

      {/* BLOCK: 陪伴能量 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="rounded-3xl p-5 shadow-sm"
        style={{ backgroundColor: '#FFFEF9' }}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold" style={{ color: '#3D3530' }}>陪伴能量</p>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setShowEnergyDetail(!showEnergyDetail)}
            className="text-xs px-2.5 py-1 rounded-full"
            style={{ backgroundColor: '#FAF8F5', color: '#8C7B72' }}
          >
            {showEnergyDetail ? '收起' : '查看詳情'}
          </motion.button>
        </div>

        {/* Energy progress bar */}
        <div className="flex items-end gap-3 mb-3">
          <p className="text-3xl font-bold" style={{ color: '#8FA886' }}>{energyState.totalEnergy}</p>
          <p className="text-xs pb-1" style={{ color: '#8C7B72' }}>陪伴能量</p>
        </div>

        {/* Next tier progress */}
        {(() => {
          const nextTier = COUPON_TIERS.find(t => t.thresholdEnergy > energyState.totalEnergy);
          if (!nextTier) return (
            <p className="text-xs" style={{ color: '#C9A96E' }}>你已經解鎖了所有票券，謝謝你一直在 💛</p>
          );
          const prevThreshold = COUPON_TIERS.filter(t => t.thresholdEnergy <= energyState.totalEnergy).pop()?.thresholdEnergy || 0;
          const progress = ((energyState.totalEnergy - prevThreshold) / (nextTier.thresholdEnergy - prevThreshold)) * 100;
          return (
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span style={{ color: '#8C7B72' }}>距離「{nextTier.emoji} {nextTier.name}」</span>
                <span style={{ color: '#8FA886', fontWeight: 600 }}>還差 {nextTier.thresholdEnergy - energyState.totalEnergy} 能量</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#F0EDE8' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(progress, 100)}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: '#8FA886' }}
                />
              </div>
            </div>
          );
        })()}

        {/* Today's actions */}
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid #F0EDE8' }}>
          <p className="text-xs font-medium mb-2" style={{ color: '#3D3530' }}>今天的陪伴</p>
          <div className="flex gap-2">
            {(Object.keys(ENERGY_ACTIONS) as EnergyActionType[]).map(action => {
              const info = ENERGY_ACTIONS[action];
              const today = _energyToday();
              const done = energyState.logs.some(l => l.date === today && l.action === action);
              return (
                <div
                  key={action}
                  className="flex-1 text-center py-2 rounded-xl text-xs"
                  style={{
                    backgroundColor: done ? '#E8F0E8' : '#FAF8F5',
                    color: done ? '#5C8A4D' : '#8C7B72',
                    border: done ? '1px solid #C5D9BE' : '1px solid #F0EDE8',
                  }}
                >
                  <p className="text-base mb-0.5">{info.emoji}</p>
                  <p className="text-[10px]">{done ? '✓' : info.label}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Available coupons */}
        {energyState.coupons.length > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid #F0EDE8' }}>
            <p className="text-xs font-medium mb-2" style={{ color: '#3D3530' }}>你的票券</p>
            <div className="space-y-2">
              {energyState.coupons.map(coupon => (
                <div
                  key={coupon.id}
                  className="flex items-center gap-3 p-2.5 rounded-xl"
                  style={{
                    backgroundColor: coupon.usedAt > 0 ? '#F5F3F0' : '#FFF8E7',
                    opacity: coupon.usedAt > 0 ? 0.6 : 1,
                  }}
                >
                  <span className="text-lg">{coupon.emoji}</span>
                  <div className="flex-1">
                    <p className="text-xs font-medium" style={{ color: '#3D3530' }}>{coupon.name}</p>
                    <p className="text-[10px]" style={{ color: '#8C7B72' }}>
                      {coupon.usedAt > 0 ? '已使用' : `折抵 NT$${coupon.discount} · ${coupon.applicableTo}`}
                    </p>
                  </div>
                  {coupon.usedAt === 0 && (
                    <span className="text-xs font-bold" style={{ color: '#8FA886' }}>可用</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Detail: energy history */}
        <AnimatePresence>
          {showEnergyDetail && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 pt-3 space-y-1.5"
              style={{ borderTop: '1px solid #F0EDE8' }}
            >
              <p className="text-xs font-medium mb-2" style={{ color: '#3D3530' }}>能量紀錄</p>
              {energyState.logs.slice(-10).reverse().map((log, i) => (
                <div key={i} className="flex justify-between text-xs" style={{ color: '#8C7B72' }}>
                  <span>{log.date} · {log.label}</span>
                  <span style={{ color: '#8FA886', fontWeight: 600 }}>+{log.points}</span>
                </div>
              ))}
              {energyState.logs.length === 0 && (
                <p className="text-xs" style={{ color: '#8C7B72' }}>還沒有紀錄，今天開始累積陪伴能量吧</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* BLOCK 2: 我的收藏 (3x2 grid) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="grid grid-cols-3 gap-2.5"
      >
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => onNavigate('wishlist')}
          className="rounded-2xl p-3.5 text-center"
          style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
        >
          <p className="text-xl mb-1.5">💭</p>
          <p className="text-[10px] font-medium" style={{ color: '#3D3530' }}>陪伴清單</p>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => onNavigate('card')}
          className="rounded-2xl p-3.5 text-center"
          style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
        >
          <p className="text-xl mb-1.5">🃏</p>
          <p className="text-[10px] font-medium" style={{ color: '#3D3530' }}>陪伴卡</p>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => onNavigate('sound')}
          className="rounded-2xl p-3.5 text-center"
          style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
        >
          <p className="text-xl mb-1.5">♪</p>
          <p className="text-[10px] font-medium" style={{ color: '#3D3530' }}>音景</p>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => onNavigate('library')}
          className="rounded-2xl p-3.5 text-center"
          style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
        >
          <p className="text-xl mb-1.5">📚</p>
          <p className="text-[10px] font-medium" style={{ color: '#3D3530' }}>療癒知識</p>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => onNavigate('calendar')}
          className="rounded-2xl p-3.5 text-center"
          style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
        >
          <p className="text-xl mb-1.5">🗓️</p>
          <p className="text-[10px] font-medium" style={{ color: '#3D3530' }}>調香日曆</p>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => onNavigate('service')}
          className="rounded-2xl p-3.5 text-center"
          style={{ backgroundColor: '#FFFEF9', border: '1px solid #F0EDE8' }}
        >
          <p className="text-xl mb-1.5">🤲</p>
          <p className="text-[10px] font-medium" style={{ color: '#3D3530' }}>服務大廳</p>
        </motion.button>
      </motion.div>

      {/* BLOCK 3: 為你推薦 (soft commercial) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-3xl p-5 shadow-sm space-y-3"
        style={{ backgroundColor: '#FFFEF9' }}
      >
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onNavigate('shop')}
          className="w-full text-left p-3 rounded-2xl"
          style={{ backgroundColor: '#FAF8F5' }}
        >
          <p className="text-sm font-medium" style={{ color: '#3D3530' }}>找適合我的香氣</p>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onNavigate('custom')}
          className="w-full text-left p-3 rounded-2xl"
          style={{ backgroundColor: '#FAF8F5' }}
        >
          <p className="text-sm font-medium" style={{ color: '#3D3530' }}>調一瓶更像你的</p>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onNavigate('healer')}
          className="w-full text-left p-3 rounded-2xl"
          style={{ backgroundColor: '#FAF8F5' }}
        >
          <p className="text-sm font-medium" style={{ color: '#3D3530' }}>讓香氛師幫你</p>
        </motion.button>
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

        {/* Service hall + LINE + logout */}
        <div className="flex gap-2 pt-2">
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => onNavigate('service')}
            className="flex-1 py-2.5 rounded-xl text-xs font-medium"
            style={{ backgroundColor: '#FAF8F5', color: '#3D3530', border: '1px solid #F0EDE8' }}
          >
            🤲 服務大廳
          </motion.button>
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
    earnEnergy('note');
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
    earnEnergy('note');
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
              onClick={() => { earnEnergy('bedtime'); onClose?.(); }}
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

  const [drawnCard, setDrawnCard] = useState<HealingCard | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [savedCards, setSavedCards] = useState<string[]>(loadSavedCards);
  const [imgLoaded, setImgLoaded] = useState(false);

  const drawCard = () => {
    setImgLoaded(false);
    // If today has emotion check-in, auto-select that emotion's color
    let card: HealingCard;
    if (todayRecord && todayEmoInfo) {
      // Find a card matching the emotion's color
      const emotionColor: CardColor = (todayEmoInfo.color.toLowerCase() as CardColor) || 'neutral';
      card = drawCardByColor(emotionColor) || drawRandomCard();
    } else {
      card = drawRandomCard();
    }
    setDrawnCard(card);
    setIsFlipped(false);
    setShowDetail(false);
    setTimeout(() => {
      setIsFlipped(true);
      onTaskComplete('card');
    }, 400);
  };

  const redraw = () => {
    setIsFlipped(false);
    setShowDetail(false);
    setImgLoaded(false);
    setTimeout(() => {
      const card = drawRandomCard();
      setDrawnCard(card);
      setTimeout(() => setIsFlipped(true), 400);
    }, 500);
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
      }).catch(() => {});
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
      {!drawnCard && (
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
                  onClick={redraw}
                  className="flex-1 rounded-2xl py-3 font-medium text-sm"
                  style={{ backgroundColor: '#FFFEF9', color: '#3D3530' }}
                >
                  🔄 再抽一張
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={saveCard}
                  className="flex-1 rounded-2xl py-3 text-white font-medium text-sm"
                  style={{
                    backgroundColor: savedCards.includes(drawnCard.id) ? '#C9A96E' : (colorConfig?.hex || '#8FA886'),
                  }}
                >
                  {savedCards.includes(drawnCard.id) ? '已收藏 ✓' : '💾 收藏'}
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

      {/* 我的收藏 */}
      {savedCards.length > 0 && !drawnCard && (
        <div>
          <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>💾 我的收藏（{savedCards.length}）</p>
          <div className="grid grid-cols-3 gap-2">
            {savedCards.map(id => {
              const card = HEALING_CARDS.find(c => c.id === id);
              if (!card) return null;
              const cfg = CARD_COLOR_CONFIG[card.color];
              return (
                <motion.div
                  key={id}
                  className="rounded-2xl overflow-hidden shadow-sm"
                  style={{ backgroundColor: cfg.bgLight }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setDrawnCard(card);
                    setIsFlipped(true);
                    setImgLoaded(false);
                  }}
                >
                  <div className="w-full h-20 overflow-hidden relative">
                    <img
                      src={card.image}
                      alt={card.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <div className="absolute inset-0" style={{ background: cfg.gradient || `linear-gradient(135deg, ${cfg.hex}44, ${cfg.hex}11)` }} />
                  </div>
                  <div className="p-2 text-center">
                    <div
                      className="w-2.5 h-2.5 rounded-full mx-auto mb-1"
                      style={{ backgroundColor: cfg.hex }}
                    />
                    <p className="text-xs font-medium" style={{ color: '#3D3530' }}>{card.title}</p>
                  </div>
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

const NAV_ITEMS: { key: PageType; icon: string; label: string }[] = [
  { key: 'home', icon: '☽', label: '陪伴' },
  { key: 'sound', icon: '♪', label: '聆聽' },
  { key: 'card', icon: '✦', label: '卡牌' },
  { key: 'diary', icon: '◎', label: '紀錄' },
  { key: 'member', icon: '♡', label: '我的' },
];

// ===================== PAGE: 療癒圖書館 =====================

type LibraryView = 'home' | 'path' | 'oil-detail' | 'crystal-detail' | 'article' | 'practice' | 'search';

function HealingLibraryPage() {
  const [view, setView] = useState<LibraryView>('home');
  const [selectedPath, setSelectedPath] = useState<HealingPath | null>(null);
  const [selectedOil, setSelectedOil] = useState<OilLibraryItem | null>(null);
  const [selectedCrystal, setSelectedCrystal] = useState<CrystalItem | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<LibraryArticle | null>(null);
  const [selectedPractice, setSelectedPractice] = useState<LibraryPractice | null>(null);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'oil' | 'crystal' | 'sound' | 'article' | 'practice'>('all');

  // 搜尋結果
  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const oils = OIL_LIBRARY.filter(o => o.name.includes(q) || o.en.toLowerCase().includes(q) || o.tags.some(t => t.includes(q)));
    const crystals = CRYSTAL_LIBRARY.filter(c => c.name.includes(q) || c.en.toLowerCase().includes(q) || c.tags.some(t => t.includes(q)));
    const sounds = LIBRARY_SOUNDS.filter(s => s.title.includes(q) || s.tags.some(t => t.includes(q)));
    const articles = LIBRARY_ARTICLES.filter(a => a.title.includes(q) || a.tags.some(t => t.includes(q)));
    const practices = LIBRARY_PRACTICES.filter(p => p.title.includes(q) || p.tags.some(t => t.includes(q)));
    const paths = HEALING_PATHS.filter(p => p.title.includes(q) || p.tags.some(t => t.includes(q)));
    return { oils, crystals, sounds, articles, practices, paths };
  }, [search]);

  // 返回按鈕
  const goBack = () => {
    if (view === 'oil-detail' || view === 'crystal-detail' || view === 'article' || view === 'practice') {
      if (selectedPath) {
        setView('path');
      } else {
        setView('home');
      }
    } else if (view === 'path') {
      setView('home');
      setSelectedPath(null);
    } else if (view === 'search') {
      setView('home');
      setSearch('');
    } else {
      setView('home');
    }
    setSelectedOil(null);
    setSelectedCrystal(null);
    setSelectedArticle(null);
    setSelectedPractice(null);
  };

  const openPath = (path: HealingPath) => {
    setSelectedPath(path);
    setView('path');
  };

  const openOilByName = (name: string) => {
    const oil = OIL_LIBRARY.find(o => o.name === name);
    if (oil) { setSelectedOil(oil); setView('oil-detail'); }
  };

  const openCrystalByName = (name: string) => {
    const crystal = CRYSTAL_LIBRARY.find(c => c.name === name);
    if (crystal) { setSelectedCrystal(crystal); setView('crystal-detail'); }
  };

  // ========== Layer 1: 首頁 ==========
  if (view === 'home' || view === 'search') {
    return (
      <motion.div className="space-y-5" {...fadeInUp}>
        {/* Header */}
        <div>
          <p className="text-xs tracking-widest" style={{ color: '#C9A96E' }}>HEALING LIBRARY</p>
          <h2 className="text-xl font-bold mt-1" style={{ color: '#3D3530' }}>📚 療癒圖書館</h2>
          <p className="text-sm mt-0.5" style={{ color: '#8C7B72' }}>今天的你，想被什麼溫柔接住？</p>
        </div>

        {/* 搜尋框 */}
        <div className="flex items-center gap-2 rounded-2xl px-4 py-2.5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <span style={{ color: '#8C7B72' }}>🔍</span>
          <input
            type="text"
            placeholder="搜尋精油、水晶、文章..."
            value={search}
            onChange={e => { setSearch(e.target.value); if (e.target.value) setView('search'); else setView('home'); }}
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: '#3D3530' }}
          />
          {search && <button onClick={() => { setSearch(''); setView('home'); }} style={{ color: '#8C7B72' }}>✕</button>}
        </div>

        {/* 搜尋結果 */}
        {searchResults && view === 'search' ? (
          <div className="space-y-4">
            {/* 搜尋分類 tab */}
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {(['all', 'oil', 'crystal', 'sound', 'article', 'practice'] as const).map(tab => {
                const labels: Record<string, string> = { all: '全部', oil: '精油', crystal: '水晶', sound: '音景', article: '文章', practice: '練習' };
                const counts: Record<string, number> = {
                  all: (searchResults.oils.length + searchResults.crystals.length + searchResults.sounds.length + searchResults.articles.length + searchResults.practices.length),
                  oil: searchResults.oils.length, crystal: searchResults.crystals.length,
                  sound: searchResults.sounds.length, article: searchResults.articles.length, practice: searchResults.practices.length,
                };
                return (
                  <button key={tab} onClick={() => setFilterTab(tab)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium"
                    style={filterTab === tab ? { backgroundColor: '#C9A96E', color: '#fff' } : { backgroundColor: '#FFFEF9', color: '#8C7B72' }}>
                    {labels[tab]} ({counts[tab]})
                  </button>
                );
              })}
            </div>

            {/* 情緒路徑結果 */}
            {searchResults.paths.length > 0 && (filterTab === 'all') && (
              <div>
                <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>🎯 情緒入口</p>
                <div className="grid grid-cols-2 gap-3">
                  {searchResults.paths.map(path => (
                    <motion.button key={path.id} whileTap={{ scale: 0.96 }} onClick={() => openPath(path)}
                      className="rounded-2xl p-4 text-left shadow-sm" style={{ backgroundColor: path.color + '15' }}>
                      <span className="text-2xl">{path.emoji}</span>
                      <p className="text-sm font-bold mt-1" style={{ color: '#3D3530' }}>{path.title}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#8C7B72' }}>{path.shortDescription}</p>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* 精油結果 */}
            {searchResults.oils.length > 0 && (filterTab === 'all' || filterTab === 'oil') && (
              <div>
                <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>🌿 精油</p>
                <div className="grid grid-cols-2 gap-3">
                  {searchResults.oils.map((oil, i) => (
                    <motion.button key={oil.name} whileTap={{ scale: 0.96 }} onClick={() => { setSelectedOil(oil); setView('oil-detail'); }}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                      className="rounded-2xl p-4 text-left shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
                      <span className="text-2xl">{oil.emoji}</span>
                      <p className="text-sm font-bold mt-1" style={{ color: '#3D3530' }}>{oil.name}</p>
                      <p className="text-xs" style={{ color: '#8C7B72' }}>{oil.en}</p>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* 水晶結果 */}
            {searchResults.crystals.length > 0 && (filterTab === 'all' || filterTab === 'crystal') && (
              <div>
                <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>💎 水晶</p>
                <div className="grid grid-cols-2 gap-3">
                  {searchResults.crystals.map((crystal, i) => (
                    <motion.button key={crystal.name} whileTap={{ scale: 0.96 }} onClick={() => { setSelectedCrystal(crystal); setView('crystal-detail'); }}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                      className="rounded-2xl p-4 text-left shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
                      <span className="text-2xl">{crystal.emoji}</span>
                      <p className="text-sm font-bold mt-1" style={{ color: '#3D3530' }}>{crystal.name}</p>
                      <p className="text-xs" style={{ color: '#8C7B72' }}>{crystal.en}</p>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* 音景結果 */}
            {searchResults.sounds.length > 0 && (filterTab === 'all' || filterTab === 'sound') && (
              <div>
                <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>🎵 音景</p>
                {searchResults.sounds.map(s => (
                  <div key={s.id} className="rounded-2xl p-3 mb-2 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{s.emoji}</span>
                      <div>
                        <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{s.title}</p>
                        <p className="text-xs" style={{ color: '#8C7B72' }}>{s.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 文章結果 */}
            {searchResults.articles.length > 0 && (filterTab === 'all' || filterTab === 'article') && (
              <div>
                <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>📖 文章</p>
                {searchResults.articles.map(a => (
                  <motion.button key={a.id} whileTap={{ scale: 0.97 }} onClick={() => { setSelectedArticle(a); setView('article'); }}
                    className="w-full rounded-2xl p-3 mb-2 shadow-sm text-left" style={{ backgroundColor: '#FFFEF9' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{a.emoji}</span>
                      <div className="flex-1">
                        <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{a.title}</p>
                        <p className="text-xs" style={{ color: '#8C7B72' }}>{a.summary}</p>
                      </div>
                      <span className="text-xs" style={{ color: '#B5AFA8' }}>{a.readTime}</span>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}

            {/* 練習結果 */}
            {searchResults.practices.length > 0 && (filterTab === 'all' || filterTab === 'practice') && (
              <div>
                <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>🧘 練習</p>
                {searchResults.practices.map(p => (
                  <motion.button key={p.id} whileTap={{ scale: 0.97 }} onClick={() => { setSelectedPractice(p); setView('practice'); }}
                    className="w-full rounded-2xl p-3 mb-2 shadow-sm text-left" style={{ backgroundColor: '#FFFEF9' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{p.emoji}</span>
                      <div className="flex-1">
                        <p className="text-sm font-bold" style={{ color: '#3D3530' }}>{p.title}</p>
                        <p className="text-xs" style={{ color: '#8C7B72' }}>{p.description}</p>
                      </div>
                      <span className="text-xs" style={{ color: '#B5AFA8' }}>{p.duration}</span>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}

            {/* 無結果 */}
            {(searchResults.oils.length + searchResults.crystals.length + searchResults.sounds.length + searchResults.articles.length + searchResults.practices.length + searchResults.paths.length) === 0 && (
              <div className="text-center py-8">
                <p className="text-3xl mb-2">🔍</p>
                <p className="text-sm" style={{ color: '#8C7B72' }}>找不到相關結果</p>
                <p className="text-xs mt-1" style={{ color: '#B5AFA8' }}>試試其他關鍵字？</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* 情緒入口 Grid */}
            <div>
              <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>🎯 我現在怎麼了？</p>
              <div className="grid grid-cols-2 gap-3">
                {HEALING_PATHS.map((path, i) => (
                  <motion.button
                    key={path.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => openPath(path)}
                    className="rounded-2xl p-4 text-left shadow-sm relative overflow-hidden"
                    style={{ backgroundColor: path.color + '15' }}
                  >
                    <div className="absolute top-2 right-2 text-4xl opacity-10">{path.emoji}</div>
                    <span className="text-2xl">{path.emoji}</span>
                    <p className="text-sm font-bold mt-2" style={{ color: '#3D3530' }}>{path.title}</p>
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#8C7B72' }}>{path.shortDescription}</p>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* 快速瀏覽區 */}
            <div>
              <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>📖 療癒知識</p>
              <div className="space-y-2">
                {LIBRARY_ARTICLES.slice(0, 3).map(a => (
                  <motion.button key={a.id} whileTap={{ scale: 0.97 }}
                    onClick={() => { setSelectedArticle(a); setView('article'); }}
                    className="w-full rounded-2xl p-3 shadow-sm text-left flex items-center gap-3"
                    style={{ backgroundColor: '#FFFEF9' }}>
                    <span className="text-xl">{a.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: '#3D3530' }}>{a.title}</p>
                      <p className="text-xs truncate" style={{ color: '#8C7B72' }}>{a.summary}</p>
                    </div>
                    <span className="text-xs flex-shrink-0" style={{ color: '#B5AFA8' }}>{a.readTime}</span>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* 快速瀏覽：精油百科 */}
            <div>
              <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>🌿 精油百科 ({OIL_LIBRARY.length})</p>
              <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                {OIL_LIBRARY.slice(0, 8).map(oil => (
                  <motion.button key={oil.name} whileTap={{ scale: 0.95 }}
                    onClick={() => { setSelectedOil(oil); setView('oil-detail'); }}
                    className="flex-shrink-0 w-24 rounded-2xl p-3 shadow-sm text-center"
                    style={{ backgroundColor: '#FFFEF9' }}>
                    <span className="text-2xl">{oil.emoji}</span>
                    <p className="text-xs font-bold mt-1 truncate" style={{ color: '#3D3530' }}>{oil.name}</p>
                    <p className="text-xs truncate" style={{ color: '#8C7B72' }}>{oil.en}</p>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* 快速瀏覽：水晶百科 */}
            <div>
              <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>💎 水晶百科 ({CRYSTAL_LIBRARY.length})</p>
              <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                {CRYSTAL_LIBRARY.slice(0, 8).map(crystal => (
                  <motion.button key={crystal.name} whileTap={{ scale: 0.95 }}
                    onClick={() => { setSelectedCrystal(crystal); setView('crystal-detail'); }}
                    className="flex-shrink-0 w-24 rounded-2xl p-3 shadow-sm text-center"
                    style={{ backgroundColor: '#FFFEF9' }}>
                    <span className="text-2xl">{crystal.emoji}</span>
                    <p className="text-xs font-bold mt-1 truncate" style={{ color: '#3D3530' }}>{crystal.name}</p>
                    <p className="text-xs truncate" style={{ color: '#8C7B72' }}>{crystal.en}</p>
                  </motion.button>
                ))}
              </div>
            </div>
          </>
        )}
      </motion.div>
    );
  }

  // ========== Layer 2: 情緒路徑頁 ==========
  if (view === 'path' && selectedPath) {
    const pathOils = selectedPath.recommendedIds.oils.map(name => OIL_LIBRARY.find(o => o.name === name)).filter(Boolean) as OilLibraryItem[];
    const pathCrystals = selectedPath.recommendedIds.crystals.map(name => CRYSTAL_LIBRARY.find(c => c.name === name)).filter(Boolean) as CrystalItem[];
    const pathSounds = selectedPath.recommendedIds.sounds.map(id => LIBRARY_SOUNDS.find(s => s.id === id)).filter(Boolean) as LibrarySoundItem[];
    const pathPractices = selectedPath.recommendedIds.practices.map(id => LIBRARY_PRACTICES.find(p => p.id === id)).filter(Boolean) as LibraryPractice[];
    const pathArticles = selectedPath.recommendedIds.articles.map(id => LIBRARY_ARTICLES.find(a => a.id === id)).filter(Boolean) as LibraryArticle[];

    return (
      <motion.div className="space-y-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
        {/* 返回 + Header */}
        <div>
          <motion.button whileTap={{ scale: 0.95 }} onClick={goBack}
            className="flex items-center gap-1 text-sm mb-3" style={{ color: '#C9A96E' }}>
            ← 返回
          </motion.button>
          <div className="rounded-3xl p-6 shadow-sm" style={{ background: `linear-gradient(135deg, ${selectedPath.color}20, ${selectedPath.color}08)` }}>
            <span className="text-4xl">{selectedPath.emoji}</span>
            <h2 className="text-xl font-bold mt-3" style={{ color: '#3D3530' }}>{selectedPath.title}</h2>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: '#8C7B72' }}>{selectedPath.heroMessage}</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
          <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>⚡ 立即可以做的事</p>
          <div className="space-y-2">
            {selectedPath.quickActions.map((action, i) => (
              <div key={i} className="flex items-start gap-2 rounded-2xl p-3" style={{ backgroundColor: '#FAF8F5' }}>
                <span className="text-sm mt-0.5" style={{ color: selectedPath.color }}>●</span>
                <p className="text-sm leading-relaxed" style={{ color: '#3D3530' }}>{action}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 推薦精油 */}
        {pathOils.length > 0 && (
          <div className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
            <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>🌿 推薦精油</p>
            <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
              {pathOils.map(oil => (
                <motion.button key={oil.name} whileTap={{ scale: 0.95 }}
                  onClick={() => { setSelectedOil(oil); setView('oil-detail'); }}
                  className="flex-shrink-0 w-28 rounded-2xl p-3 shadow-sm text-center" style={{ backgroundColor: '#FAF8F5' }}>
                  <span className="text-2xl">{oil.emoji}</span>
                  <p className="text-xs font-bold mt-1" style={{ color: '#3D3530' }}>{oil.name}</p>
                  <p className="text-xs" style={{ color: '#8C7B72' }}>{oil.en}</p>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* 推薦水晶 */}
        {pathCrystals.length > 0 && (
          <div className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
            <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>💎 推薦水晶</p>
            <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
              {pathCrystals.map(crystal => (
                <motion.button key={crystal.name} whileTap={{ scale: 0.95 }}
                  onClick={() => { setSelectedCrystal(crystal); setView('crystal-detail'); }}
                  className="flex-shrink-0 w-28 rounded-2xl p-3 shadow-sm text-center" style={{ backgroundColor: crystal.color + '12' }}>
                  <span className="text-2xl">{crystal.emoji}</span>
                  <p className="text-xs font-bold mt-1" style={{ color: '#3D3530' }}>{crystal.name}</p>
                  <p className="text-xs" style={{ color: '#8C7B72' }}>{crystal.en}</p>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* 推薦音景 */}
        {pathSounds.length > 0 && (
          <div className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
            <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>🎵 推薦音景</p>
            <div className="space-y-2">
              {pathSounds.map(s => (
                <div key={s.id} className="flex items-center gap-3 rounded-2xl p-3" style={{ backgroundColor: '#FAF8F5' }}>
                  <span className="text-xl">{s.emoji}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: '#3D3530' }}>{s.title}</p>
                    <p className="text-xs" style={{ color: '#8C7B72' }}>{s.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 推薦練習 */}
        {pathPractices.length > 0 && (
          <div className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
            <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>🧘 推薦練習</p>
            <div className="space-y-2">
              {pathPractices.map(p => (
                <motion.button key={p.id} whileTap={{ scale: 0.97 }}
                  onClick={() => { setSelectedPractice(p); setView('practice'); }}
                  className="w-full flex items-center gap-3 rounded-2xl p-3 text-left" style={{ backgroundColor: '#FAF8F5' }}>
                  <span className="text-xl">{p.emoji}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: '#3D3530' }}>{p.title}</p>
                    <p className="text-xs" style={{ color: '#8C7B72' }}>{p.description}</p>
                  </div>
                  <span className="text-xs" style={{ color: '#B5AFA8' }}>{p.duration}</span>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* 延伸閱讀 */}
        {pathArticles.length > 0 && (
          <div className="rounded-3xl p-5 shadow-sm" style={{ backgroundColor: '#FFFEF9' }}>
            <p className="text-sm font-bold mb-3" style={{ color: '#3D3530' }}>📖 延伸閱讀</p>
            <div className="space-y-2">
              {pathArticles.map(a => (
                <motion.button key={a.id} whileTap={{ scale: 0.97 }}
                  onClick={() => { setSelectedArticle(a); setView('article'); }}
                  className="w-full flex items-center gap-3 rounded-2xl p-3 text-left" style={{ backgroundColor: '#FAF8F5' }}>
                  <span className="text-xl">{a.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: '#3D3530' }}>{a.title}</p>
                    <p className="text-xs truncate" style={{ color: '#8C7B72' }}>{a.summary}</p>
                  </div>
                  <span className="text-xs flex-shrink-0" style={{ color: '#B5AFA8' }}>{a.readTime}</span>
                </motion.button>
              ))}
            </div>
          </div>
        )}
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
            <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>🧠 心靈功效</p>
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
          <p className="text-sm font-bold mb-2" style={{ color: '#3D3530' }}>🧠 心靈功效</p>
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

  // Fallback
  return null;
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
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl text-xs font-medium shadow-lg"
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

function BottomNav({ active, onChange }: { active: PageType; onChange: (p: PageType) => void }) {
  const cellStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    position: 'relative',
    padding: '6px 0',
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40"
      style={{
        backgroundColor: '#FFFEF9',
        borderTop: '1px solid #F0EDE8',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="max-w-md mx-auto">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', height: 56 }}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              style={cellStyle}
            >
              <span className="text-lg">{item.icon}</span>
              <span
                className="text-[10px] font-medium"
                style={{ color: active === item.key ? '#8FA886' : '#8C7B72' }}
              >
                {item.label}
              </span>
              {active === item.key && (
                <motion.div
                  layoutId="bottom-nav-indicator"
                  className="absolute bottom-1.5 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: '#8FA886' }}
                />
              )}
            </button>
          ))}
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
  const [showMorningFlow, setShowMorningFlow] = useState(false);
  const [morningFlowEmotion, setMorningFlowEmotion] = useState<EmotionKey | null>(null);
  const [morningFlowLevel, setMorningFlowLevel] = useState<EmotionLevel>('L1');
  const [showMilestone, setShowMilestone] = useState<number | null>(null);
  const [isBedtimeFullscreen, setIsBedtimeFullscreen] = useState(false);

  // Initialize native app features (StatusBar, SplashScreen)
  useEffect(() => {
    initNativeApp();
  }, []);

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
    earnEnergy('checkin');
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
      {!isBedtimeFullscreen && <BottomNav active={page} onChange={setPage} />}
      <div className="max-w-md mx-auto px-4 pt-4 pb-24">
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
            {page === 'healer' && <HealerPage records={records} />}
            {page === 'shop' && <ShopPage />}
            {page === 'library' && <HealingLibraryPage />}
            {page === 'calendar' && <FragranceCalendarPage />}
            {page === 'member' && <MemberPage records={records} onNavigate={(p) => setPage(p)} />}
            {page === 'custom' && <CustomOilPage user={user} records={records} />}
            {page === 'service' && <ServiceHallPage onNavigate={(p) => setPage(p)} />}
            {page === 'wishlist' && <WishlistPage onNavigate={(p) => setPage(p)} />}
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
