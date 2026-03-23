// ============================================================
// 療癒卡系統 — 35 張情緒療癒卡完整資料
// 7 色 × 5 張，每張卡包含療癒訊息、儀式、精油/音景/水晶配對
// ============================================================

// ===================== TYPES =====================

export interface HealingCard {
  id: string;
  title: string;
  color: CardColor;
  image: string;
  message: string;
  extendedMessage: string;
  ritual: string;
  emotionTags: string[];
  pairing: {
    oil: string;
    sound: string;
    crystal: string;
  };
}

export type CardColor = 'indigo' | 'orange' | 'red' | 'purple' | 'yellow' | 'blue' | 'green';

// ===================== 顏色配置 =====================

export const CARD_COLOR_CONFIG: Record<CardColor, {
  label: string;
  emotion: string;
  hex: string;
  gradient: string;
  bgLight: string;
}> = {
  indigo: { label: '靛色', emotion: '迷惘 / 內在探索', hex: '#4B5FBF', gradient: 'from-indigo-200 to-indigo-100', bgLight: '#EEF0FF' },
  orange: { label: '橘色', emotion: '被接住 / 溫暖', hex: '#E8853D', gradient: 'from-orange-200 to-orange-100', bgLight: '#FFF4EB' },
  red:    { label: '紅色', emotion: '情緒釋放 / 壓力', hex: '#C74B4B', gradient: 'from-red-200 to-red-100', bgLight: '#FFF0F0' },
  purple: { label: '紫色', emotion: '安定 / 睡眠', hex: '#8B6FB0', gradient: 'from-purple-200 to-purple-100', bgLight: '#F5F0FF' },
  yellow: { label: '黃色', emotion: '能量 / 行動', hex: '#D4A72C', gradient: 'from-yellow-200 to-yellow-100', bgLight: '#FFFCEB' },
  blue:   { label: '藍色', emotion: '修復 / 低落', hex: '#5B8DB8', gradient: 'from-blue-200 to-blue-100', bgLight: '#EFF6FF' },
  green:  { label: '綠色', emotion: '成長 / 重生', hex: '#6B9B6B', gradient: 'from-green-200 to-green-100', bgLight: '#F0FFF0' },
};

// ===================== Google Drive 圖片對應表 =====================

export const cardImageMap: Record<CardColor, string[]> = {
  indigo: [
    'https://drive.google.com/uc?export=view&id=1fI_U73UFduaMWpQu_AGlSiL-lKDAJCdk',  // 靛-01
    'https://drive.google.com/uc?export=view&id=1r7foBOzA4QV_3EVrfAK5ajRMBLeQfC44',  // 靛-02
    'https://drive.google.com/uc?export=view&id=1q-pDA_PL3KHxRZxi6sQaADLOAj8Krorm',  // 靛-03
    'https://drive.google.com/uc?export=view&id=1u15TPjY8JWH13Ef1whJ4KwIi4MNn9C-8',  // 靛-05
    'https://drive.google.com/uc?export=view&id=1AQGxPQsW0mbk_EMyp9vMQOBzG5euYh3V',  // 靛-06
  ],
  orange: [
    'https://drive.google.com/uc?export=view&id=1KqYn8_-LWy4wJ7Ms1mjxJj0wGH5R076Y',  // 橘-01
    'https://drive.google.com/uc?export=view&id=1EPscT_ViH3ZYTwm6xkK6HQ5ohz8D4jBN',  // 橘-02
    'https://drive.google.com/uc?export=view&id=1Cy1xSGJVMizSBBRuFZlXN2ITAIPBfKL_',  // 橘-04
    'https://drive.google.com/uc?export=view&id=1-Kp_AtuVqP4aI7Z4JUu2wWGHHbIaWAMP',  // 橘-05
    'https://drive.google.com/uc?export=view&id=1E7qDbxip-eCrvvBR2W_RP5gS6vKUZCyT',  // 橘-06
  ],
  red: [
    'https://drive.google.com/uc?export=view&id=1gSoP4SFg7L6rZI_eLlZnXlYRDvKtc7Cx',  // 紅-01
    'https://drive.google.com/uc?export=view&id=1OYzuPUw1Qn2en7uocA0F4qvyPJ-Y_NQe',  // 紅-04
    'https://drive.google.com/uc?export=view&id=17tXbQ2w_-HLBlBr_810WnoOwZ31xrEBd',  // 紅-06
    'https://drive.google.com/uc?export=view&id=1q4pwj41Gm1AHca2ANtdzrm_NnGF0c9jR',  // 紅-07
    'https://drive.google.com/uc?export=view&id=1gSoP4SFg7L6rZI_eLlZnXlYRDvKtc7Cx',  // 紅-01（備用）
  ],
  purple: [
    'https://drive.google.com/uc?export=view&id=1oayxA3gAvO1aFIC2sExh9zrRceLCU-wr',  // 紫-01
    'https://drive.google.com/uc?export=view&id=1uYKA1X2BBr5yIcz2vTtgA-C6pwy38pwQ',  // 紫-02
    'https://drive.google.com/uc?export=view&id=1UMDX_izb_pVMLutcH0ClCU8-D2GSq2Ym',  // 紫-04
    'https://drive.google.com/uc?export=view&id=15NtuneIuW_V50om09oE9zZ82epnPUkrQ',  // 紫-05
    'https://drive.google.com/uc?export=view&id=1oayxA3gAvO1aFIC2sExh9zrRceLCU-wr',  // 紫-01（備用）
  ],
  yellow: [
    'https://drive.google.com/uc?export=view&id=1KIgcIcqiXnWDY_co4OfqyY5BcIAmqC0X',  // 黃-04
    'https://drive.google.com/uc?export=view&id=18ZhWfKSSnXKs2MlkpxHaxJh5-nxOdHS7',  // 黃-06
    'https://drive.google.com/uc?export=view&id=1KIgcIcqiXnWDY_co4OfqyY5BcIAmqC0X',  // 黃-04（備用）
    'https://drive.google.com/uc?export=view&id=18ZhWfKSSnXKs2MlkpxHaxJh5-nxOdHS7',  // 黃-06（備用）
    'https://drive.google.com/uc?export=view&id=1KIgcIcqiXnWDY_co4OfqyY5BcIAmqC0X',  // 黃-04（備用2）
  ],
  blue: [
    'https://drive.google.com/uc?export=view&id=186iil357-W7AOB6y0BbgKC5HUPAy-A-v',  // 藍-01
    'https://drive.google.com/uc?export=view&id=1VFau0bXRrgt-qqpTeUSNbRS1UB2iZyw9',  // 藍-03
    'https://drive.google.com/uc?export=view&id=15X_Y1kAfvvyrEwbpe5Zyn8qIfZ-D3im9',  // 藍-04
    'https://drive.google.com/uc?export=view&id=1suJ8wV9JeNci_5y5oVb1MzcLU2X-Fj24',  // 藍-05
    'https://drive.google.com/uc?export=view&id=11lwPJMGaqjUR-773ZS4OYXaSLAOoXiRk',  // 藍-06
  ],
  green: [
    'https://drive.google.com/uc?export=view&id=1RyWOS-tguqbo1U1M2M1cyj6-LgTdx-_2',  // 綠-01
    'https://drive.google.com/uc?export=view&id=18doOZrCGAmwtIml8wFoJSYzxhXL-SS1y',  // 綠-02
    'https://drive.google.com/uc?export=view&id=1OIHdwUUZ61Ir3KH5Av3Sn-G-wR6mB-a8',  // 綠-03
    'https://drive.google.com/uc?export=view&id=17SaqAeOa9CglnGqLfSAlx4WyY-hRdYd7',  // 綠-04
    'https://drive.google.com/uc?export=view&id=1kjRmYHjxzbfSW26ppqu9_GtyHkk8t_5b',  // 綠-05
  ],
};

// ===================== 隨機圖片選擇 =====================

/** 從指定顏色的圖片庫中隨機選取一張 */
export const getRandomCardImage = (color: CardColor): string => {
  const images = cardImageMap[color];
  return images[Math.floor(Math.random() * images.length)];
};

/** 為指定顏色取得第 N 張圖片（固定分配） */
export const getCardImage = (color: CardColor, index: number): string => {
  const images = cardImageMap[color];
  return images[index % images.length];
};

// ===================== 35 張療癒卡完整資料 =====================

export const HEALING_CARDS: HealingCard[] = [
  // ========== 靛色（迷惘 / 內在探索）==========
  {
    id: 'indigo-1',
    title: '先不用找到答案',
    color: 'indigo',
    image: getCardImage('indigo', 0),
    message: '你不需要現在就知道方向',
    extendedMessage: '有些迷惘，是在帶你靠近真正的自己',
    ritual: '閉上眼睛10秒',
    emotionTags: ['迷惘', '不確定', '方向感'],
    pairing: { oil: '乳香', sound: 'forest', crystal: '紫水晶' },
  },
  {
    id: 'indigo-2',
    title: '混亂也是過程',
    color: 'indigo',
    image: getCardImage('indigo', 1),
    message: '看不清，也沒關係',
    extendedMessage: '當一切模糊，其實正在重組',
    ritual: '深呼吸3次',
    emotionTags: ['混亂', '重組', '過渡期'],
    pairing: { oil: '絲柏', sound: 'rain', crystal: '月光石' },
  },
  {
    id: 'indigo-3',
    title: '停一下',
    color: 'indigo',
    image: getCardImage('indigo', 2),
    message: '先停下來也很好',
    extendedMessage: '有些答案，只會在安靜裡出現',
    ritual: '放鬆肩膀',
    emotionTags: ['暫停', '安靜', '等待'],
    pairing: { oil: '苦橙葉', sound: 'night', crystal: '青金石' },
  },
  {
    id: 'indigo-4',
    title: '你正在靠近',
    color: 'indigo',
    image: getCardImage('indigo', 3),
    message: '你沒有走錯路',
    extendedMessage: '只是還沒看見終點',
    ritual: '把手放在心口',
    emotionTags: ['信任', '過程', '耐心'],
    pairing: { oil: '花梨木', sound: 'ocean', crystal: '拉長石' },
  },
  {
    id: 'indigo-5',
    title: '慢慢理解自己',
    color: 'indigo',
    image: getCardImage('indigo', 4),
    message: '你已經在路上了',
    extendedMessage: '不需要急著變清楚',
    ritual: '寫下一個現在的感覺',
    emotionTags: ['自我探索', '接納', '慢慢來'],
    pairing: { oil: '橙花', sound: 'stream', crystal: '白水晶' },
  },

  // ========== 橘色（被接住 / 溫暖）==========
  {
    id: 'orange-1',
    title: '今天辛苦了',
    color: 'orange',
    image: getCardImage('orange', 0),
    message: '你真的已經很努力了',
    extendedMessage: '可以不用再撐了',
    ritual: '抱抱自己',
    emotionTags: ['辛苦', '疲憊', '被看見'],
    pairing: { oil: '甜橙', sound: 'fireplace', crystal: '粉晶' },
  },
  {
    id: 'orange-2',
    title: '你不是一個人',
    color: 'orange',
    image: getCardImage('orange', 1),
    message: '我在這裡',
    extendedMessage: '就算什麼都不說也可以',
    ritual: '閉眼呼吸',
    emotionTags: ['孤單', '陪伴', '溫暖'],
    pairing: { oil: '洋甘菊', sound: 'rain', crystal: '紅紋石' },
  },
  {
    id: 'orange-3',
    title: '放下吧',
    color: 'orange',
    image: getCardImage('orange', 2),
    message: '有些東西可以先放',
    extendedMessage: '不是放棄，是讓自己休息',
    ritual: '深呼吸',
    emotionTags: ['放下', '休息', '允許'],
    pairing: { oil: '佛手柑', sound: 'ocean', crystal: '月光石' },
  },
  {
    id: 'orange-4',
    title: '被好好對待',
    color: 'orange',
    image: getCardImage('orange', 3),
    message: '你值得溫柔',
    extendedMessage: '包括你對自己',
    ritual: '做一件舒服的事',
    emotionTags: ['溫柔', '自愛', '值得'],
    pairing: { oil: '玫瑰天竺葵', sound: 'birds', crystal: '粉晶' },
  },
  {
    id: 'orange-5',
    title: '先這樣就好',
    color: 'orange',
    image: getCardImage('orange', 4),
    message: '今天到這裡就好',
    extendedMessage: '剩下的明天再說',
    ritual: '喝一口水',
    emotionTags: ['夠了', '今天', '接納'],
    pairing: { oil: '克萊門橙', sound: 'night', crystal: '太陽石' },
  },

  // ========== 紅色（情緒釋放 / 壓力）==========
  {
    id: 'red-1',
    title: '你的情緒有原因',
    color: 'red',
    image: getCardImage('red', 0),
    message: '你不是無理取鬧',
    extendedMessage: '那只是你在保護自己',
    ritual: '深呼吸',
    emotionTags: ['情緒', '合理', '保護'],
    pairing: { oil: '真正薰衣草', sound: 'rain', crystal: '黑曜石' },
  },
  {
    id: 'red-2',
    title: '可以生氣',
    color: 'red',
    image: getCardImage('red', 1),
    message: '你有權利不舒服',
    extendedMessage: '那代表界線被踩到了',
    ritual: '握拳再放鬆',
    emotionTags: ['生氣', '界線', '權利'],
    pairing: { oil: '歐洲赤松', sound: 'ocean', crystal: '紅碧玉' },
  },
  {
    id: 'red-3',
    title: '讓它過去',
    color: 'red',
    image: getCardImage('red', 2),
    message: '情緒會流動',
    extendedMessage: '它不會停在這裡',
    ritual: '呼氣慢一點',
    emotionTags: ['流動', '放手', '暫時'],
    pairing: { oil: '快樂鼠尾草', sound: 'stream', crystal: '紅瑪瑙' },
  },
  {
    id: 'red-4',
    title: '不需要壓抑',
    color: 'red',
    image: getCardImage('red', 3),
    message: '你可以表達',
    extendedMessage: '哪怕只是對自己',
    ritual: '寫下一句話',
    emotionTags: ['表達', '壓抑', '釋放'],
    pairing: { oil: '依蘭依蘭', sound: 'forest', crystal: '石榴石' },
  },
  {
    id: 'red-5',
    title: '釋放一下',
    color: 'red',
    image: getCardImage('red', 4),
    message: '放掉一點點就好',
    extendedMessage: '不需要一次全部放下',
    ritual: '大口呼氣',
    emotionTags: ['釋放', '一點點', '慢慢來'],
    pairing: { oil: '迷迭香', sound: 'rain', crystal: '黑曜石' },
  },

  // ========== 紫色（安定 / 睡眠）==========
  {
    id: 'purple-1',
    title: '你是安全的',
    color: 'purple',
    image: getCardImage('purple', 0),
    message: '現在這一刻很安穩',
    extendedMessage: '不需要擔心未來',
    ritual: '深呼吸',
    emotionTags: ['安全', '安穩', '當下'],
    pairing: { oil: '真正薰衣草', sound: 'night', crystal: '紫水晶' },
  },
  {
    id: 'purple-2',
    title: '慢慢呼吸',
    color: 'purple',
    image: getCardImage('purple', 1),
    message: '回到身體',
    extendedMessage: '一吸一吐就好',
    ritual: '4-7-8 呼吸',
    emotionTags: ['呼吸', '身體', '放鬆'],
    pairing: { oil: '乳香', sound: 'ocean', crystal: '螢石' },
  },
  {
    id: 'purple-3',
    title: '放鬆一下',
    color: 'purple',
    image: getCardImage('purple', 2),
    message: '不需要緊繃',
    extendedMessage: '身體可以軟下來',
    ritual: '放鬆肩膀',
    emotionTags: ['緊繃', '放鬆', '柔軟'],
    pairing: { oil: '洋甘菊', sound: 'rain', crystal: '月光石' },
  },
  {
    id: 'purple-4',
    title: '世界沒有那麼急',
    color: 'purple',
    image: getCardImage('purple', 3),
    message: '你可以慢一點',
    extendedMessage: '一切都還來得及',
    ritual: '慢慢走幾步',
    emotionTags: ['慢', '不急', '從容'],
    pairing: { oil: '苦橙葉', sound: 'forest', crystal: '天青石' },
  },
  {
    id: 'purple-5',
    title: '今晚會好好睡',
    color: 'purple',
    image: getCardImage('purple', 4),
    message: '讓今天結束',
    extendedMessage: '你已經夠了',
    ritual: '關燈躺下',
    emotionTags: ['睡眠', '結束', '足夠'],
    pairing: { oil: '橙花', sound: 'night', crystal: '紫水晶' },
  },

  // ========== 黃色（能量 / 行動）==========
  {
    id: 'yellow-1',
    title: '開始吧',
    color: 'yellow',
    image: getCardImage('yellow', 0),
    message: '不用等準備好',
    extendedMessage: '行動會帶來答案',
    ritual: '做第一步',
    emotionTags: ['開始', '行動', '勇氣'],
    pairing: { oil: '迷迭香', sound: 'birds', crystal: '黃水晶' },
  },
  {
    id: 'yellow-2',
    title: '小步也很好',
    color: 'yellow',
    image: getCardImage('yellow', 1),
    message: '一點點就夠',
    extendedMessage: '前進就是前進',
    ritual: '完成一件小事',
    emotionTags: ['小步', '前進', '累積'],
    pairing: { oil: '甜橙', sound: 'forest', crystal: '虎眼石' },
  },
  {
    id: 'yellow-3',
    title: '為自己做一件事',
    color: 'yellow',
    image: getCardImage('yellow', 2),
    message: '今天屬於你',
    extendedMessage: '不需要理由',
    ritual: '做一件喜歡的事',
    emotionTags: ['自己', '自由', '享受'],
    pairing: { oil: '佛手柑', sound: 'stream', crystal: '太陽石' },
  },
  {
    id: 'yellow-4',
    title: '你可以做到',
    color: 'yellow',
    image: getCardImage('yellow', 3),
    message: '你其實有能力',
    extendedMessage: '只是需要開始',
    ritual: '深呼吸後開始',
    emotionTags: ['能力', '信心', '潛力'],
    pairing: { oil: '歐洲赤松', sound: 'ocean', crystal: '黃水晶' },
  },
  {
    id: 'yellow-5',
    title: '打開節奏',
    color: 'yellow',
    image: getCardImage('yellow', 4),
    message: '動起來就會改變',
    extendedMessage: '不需要完美',
    ritual: '起身動一下',
    emotionTags: ['節奏', '動起來', '改變'],
    pairing: { oil: '薄荷', sound: 'birds', crystal: '虎眼石' },
  },

  // ========== 藍色（修復 / 低落）==========
  {
    id: 'blue-1',
    title: '慢慢好起來',
    color: 'blue',
    image: getCardImage('blue', 0),
    message: '不需要立刻好',
    extendedMessage: '修復需要時間',
    ritual: '深呼吸',
    emotionTags: ['修復', '時間', '耐心'],
    pairing: { oil: '橙花', sound: 'rain', crystal: '海藍寶' },
  },
  {
    id: 'blue-2',
    title: '可以難過',
    color: 'blue',
    image: getCardImage('blue', 1),
    message: '這樣是正常的',
    extendedMessage: '不需要壓下去',
    ritual: '靜靜坐著',
    emotionTags: ['難過', '正常', '允許'],
    pairing: { oil: '真正薰衣草', sound: 'ocean', crystal: '粉晶' },
  },
  {
    id: 'blue-3',
    title: '先這樣也可以',
    color: 'blue',
    image: getCardImage('blue', 2),
    message: '不需要變正常',
    extendedMessage: '現在這樣就很好',
    ritual: '放鬆自己',
    emotionTags: ['接納', '現在', '足夠'],
    pairing: { oil: '花梨木', sound: 'forest', crystal: '藍紋瑪瑙' },
  },
  {
    id: 'blue-4',
    title: '悲傷會過去',
    color: 'blue',
    image: getCardImage('blue', 3),
    message: '它只是經過',
    extendedMessage: '不會留下來',
    ritual: '呼氣慢一點',
    emotionTags: ['悲傷', '流動', '暫時'],
    pairing: { oil: '佛手柑', sound: 'stream', crystal: '青金石' },
  },
  {
    id: 'blue-5',
    title: '陪著自己',
    color: 'blue',
    image: getCardImage('blue', 4),
    message: '你可以陪自己',
    extendedMessage: '不需要完美',
    ritual: '把手放在胸口',
    emotionTags: ['陪伴', '自己', '不完美'],
    pairing: { oil: '洋甘菊', sound: 'night', crystal: '月光石' },
  },

  // ========== 綠色（成長 / 重生）==========
  {
    id: 'green-1',
    title: '你正在改變',
    color: 'green',
    image: getCardImage('green', 0),
    message: '雖然慢，但是真的',
    extendedMessage: '成長正在發生',
    ritual: '深呼吸',
    emotionTags: ['改變', '成長', '真實'],
    pairing: { oil: '絲柏', sound: 'forest', crystal: '綠東陵' },
  },
  {
    id: 'green-2',
    title: '再試一次',
    color: 'green',
    image: getCardImage('green', 1),
    message: '重新開始也很好',
    extendedMessage: '每一天都是新的',
    ritual: '做一件新事',
    emotionTags: ['重新開始', '新的', '勇氣'],
    pairing: { oil: '檸檬', sound: 'birds', crystal: '綠幽靈' },
  },
  {
    id: 'green-3',
    title: '你更靠近自己了',
    color: 'green',
    image: getCardImage('green', 2),
    message: '比昨天更好',
    extendedMessage: '這就是進步',
    ritual: '寫下今天的一件好事',
    emotionTags: ['進步', '靠近', '自己'],
    pairing: { oil: '加拿大冷杉', sound: 'stream', crystal: '孔雀石' },
  },
  {
    id: 'green-4',
    title: '一切會長出來',
    color: 'green',
    image: getCardImage('green', 3),
    message: '就像種子一樣',
    extendedMessage: '需要時間',
    ritual: '想像自己成長',
    emotionTags: ['種子', '時間', '耐心'],
    pairing: { oil: '花梨木', sound: 'rain', crystal: '綠東陵' },
  },
  {
    id: 'green-5',
    title: '繼續走',
    color: 'green',
    image: getCardImage('green', 4),
    message: '你已經在路上',
    extendedMessage: '不需要回頭',
    ritual: '向前走一步',
    emotionTags: ['前進', '路上', '不回頭'],
    pairing: { oil: '雪松', sound: 'ocean', crystal: '綠幽靈' },
  },
];

// ===================== 工具函式 =====================

/** 隨機抽一張療癒卡 */
export const drawRandomCard = (): HealingCard => {
  return HEALING_CARDS[Math.floor(Math.random() * HEALING_CARDS.length)];
};

/** 從指定顏色中隨機抽一張 */
export const drawCardByColor = (color: CardColor): HealingCard => {
  const colorCards = HEALING_CARDS.filter(c => c.color === color);
  return colorCards[Math.floor(Math.random() * colorCards.length)];
};

/** 取得所有顏色分類 */
export const getAllColors = (): CardColor[] => {
  return ['indigo', 'orange', 'red', 'purple', 'yellow', 'blue', 'green'];
};

/** 根據情緒標籤搜尋卡片 */
export const searchCardsByTag = (tag: string): HealingCard[] => {
  return HEALING_CARDS.filter(c => c.emotionTags.some(t => t.includes(tag)));
};
