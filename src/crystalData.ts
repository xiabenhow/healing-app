// ============================================================
// 水晶知識系統 — Crystal Knowledge Database
// 「每一顆水晶都有它的頻率，找到屬於你的那一顆」
// ============================================================

import type { EmotionKey } from './emotionHealingData';

// ===================== TYPES =====================

export interface CrystalItem {
  name: string;
  en: string;
  /** 晶系/礦物家族 */
  family: string;
  /** 對應脈輪 */
  chakra: string;
  /** 對應頻率色彩 */
  color: string;
  /** 硬度 (莫氏) */
  hardness: string;
  /** 產地 */
  origin: string;
  /** 功效說明 */
  effect: string;
  /** 身體功效 */
  physical: string;
  /** 心靈功效 */
  mental: string;
  /** 淨化方式 */
  cleansing: string;
  /** 適合搭配的精油 */
  pairedOils: string[];
  /** 適合的情緒 */
  emotions: EmotionKey[];
  emoji: string;
  tags: string[];
}

// ===================== CRYSTAL DATABASE =====================

export const CRYSTAL_LIBRARY: CrystalItem[] = [
  {
    name: '白水晶',
    en: 'Clear Quartz',
    family: '石英族',
    chakra: '頂輪',
    color: '#E8E4DF',
    hardness: '7',
    origin: '巴西、馬達加斯加、美國',
    effect: '淨化能量場，放大意念\n被稱為「萬能水晶」，可強化其他水晶的能量',
    physical: '增強免疫力\n促進血液循環\n緩解頭痛\n平衡全身能量場',
    mental: '提升專注力與清晰度\n增強冥想品質\n淨化負面思維\n連結高我意識',
    cleansing: '月光浴、流水淨化、鼠尾草煙燻、水晶簇充電',
    pairedOils: ['乳香', '薰衣草', '茶樹'],
    emotions: ['confused', 'anxious', 'calm'],
    emoji: '💎',
    tags: ['淨化', '萬能', '冥想', '頂輪'],
  },
  {
    name: '紫水晶',
    en: 'Amethyst',
    family: '石英族',
    chakra: '眉心輪 / 頂輪',
    color: '#9B7EC8',
    hardness: '7',
    origin: '巴西、烏拉圭、南非',
    effect: '安定心神、增強直覺\n古希臘人相信它能防醉，象徵清醒與智慧',
    physical: '助眠\n緩解偏頭痛\n舒緩神經系統\n促進內分泌平衡',
    mental: '深層放鬆與安定\n增強靈性覺察\n化解焦慮與恐懼\n提升直覺力',
    cleansing: '月光浴（避免日曬退色）、鼠尾草煙燻、音叉淨化',
    pairedOils: ['薰衣草', '快樂鼠尾草', '苦橙葉'],
    emotions: ['anxious', 'insecure', 'escape'],
    emoji: '🔮',
    tags: ['助眠', '直覺', '安定', '眉心輪'],
  },
  {
    name: '粉晶',
    en: 'Rose Quartz',
    family: '石英族',
    chakra: '心輪',
    color: '#E8B5C0',
    hardness: '7',
    origin: '巴西、馬達加斯加、南非',
    effect: '打開心輪，療癒情感創傷\n被稱為「愛情石」，增強自我愛與對他人的慈悲',
    physical: '促進心臟健康\n改善膚質\n舒緩生殖系統',
    mental: '療癒情感創傷\n增強自我接納\n打開心扉接受愛\n化解怨恨與悲傷',
    cleansing: '月光浴、玫瑰花瓣浸泡、鼠尾草煙燻',
    pairedOils: ['大馬士革玫瑰', '依蘭', '波旁天竺葵'],
    emotions: ['lonely', 'low', 'wronged', 'warm'],
    emoji: '💗',
    tags: ['愛', '療癒', '心輪', '自我接納'],
  },
  {
    name: '黃水晶',
    en: 'Citrine',
    family: '石英族',
    chakra: '太陽神經叢',
    color: '#E8C87C',
    hardness: '7',
    origin: '巴西、剛果、西班牙',
    effect: '帶來豐盛與自信\n被稱為「商人之石」，吸引財富與好運',
    physical: '促進消化系統\n增強新陳代謝\n提升體力與活力',
    mental: '增強自信與個人力量\n吸引豐盛與機會\n化解自我懷疑\n帶來樂觀與喜悅',
    cleansing: '日光浴（短時間）、鼠尾草煙燻、水晶簇充電',
    pairedOils: ['甜橙', '檸檬', '佛手柑'],
    emotions: ['low', 'insecure', 'energized', 'restart'],
    emoji: '✨',
    tags: ['豐盛', '自信', '太陽輪', '活力'],
  },
  {
    name: '黑曜石',
    en: 'Obsidian',
    family: '火山玻璃',
    chakra: '海底輪',
    color: '#2D2D2D',
    hardness: '5-5.5',
    origin: '墨西哥、冰島、日本',
    effect: '強大的保護石，阻擋負能量\n幫助面對陰影面，深層自我覺察',
    physical: '減輕肌肉緊張\n促進血液循環\n幫助排毒',
    mental: '保護能量場\n面對深層恐懼與陰影\n接地與穩定\n切斷不健康的能量連結',
    cleansing: '流水淨化、鼠尾草煙燻、埋入土中一夜',
    pairedOils: ['岩蘭草', '歐洲赤松', '乳香'],
    emotions: ['insecure', 'escape', 'wronged'],
    emoji: '🖤',
    tags: ['保護', '接地', '海底輪', '陰影工作'],
  },
  {
    name: '月光石',
    en: 'Moonstone',
    family: '長石族',
    chakra: '眉心輪 / 頂輪',
    color: '#C8D5E0',
    hardness: '6-6.5',
    origin: '斯里蘭卡、印度、緬甸',
    effect: '連結月亮能量，增強女性特質\n促進情緒平衡與直覺力',
    physical: '平衡荷爾蒙\n緩解經期不適\n促進生育力',
    mental: '情緒平衡與穩定\n增強直覺與感受力\n支持新的開始\n滋養內在陰性能量',
    cleansing: '滿月月光浴、流水淨化、鼠尾草煙燻',
    pairedOils: ['羅馬洋甘菊', '快樂鼠尾草', '依蘭'],
    emotions: ['confused', 'tired', 'calm'],
    emoji: '🌙',
    tags: ['月亮', '直覺', '荷爾蒙', '新開始'],
  },
  {
    name: '虎眼石',
    en: 'Tiger\'s Eye',
    family: '石英族',
    chakra: '太陽神經叢 / 海底輪',
    color: '#B08040',
    hardness: '7',
    origin: '南非、澳洲、印度',
    effect: '增強勇氣與決斷力\n幫助做出正確判斷，平衡理性與感性',
    physical: '增強骨骼強度\n促進新陳代謝\n提升體力與耐力',
    mental: '增強勇氣與自信\n提升決策力\n化解自我限制\n帶來行動力與決心',
    cleansing: '日光浴、鼠尾草煙燻、水晶簇充電',
    pairedOils: ['歐洲赤松', '桉油醇迷迭香', '薑'],
    emotions: ['insecure', 'confused', 'restart', 'energized'],
    emoji: '🐯',
    tags: ['勇氣', '決斷', '太陽輪', '行動力'],
  },
  {
    name: '螢石',
    en: 'Fluorite',
    family: '鹵化物族',
    chakra: '眉心輪',
    color: '#7EC8B5',
    hardness: '4',
    origin: '中國、墨西哥、南非',
    effect: '清理混亂思維，增強專注力\n被稱為「天才之石」，幫助學習與吸收新知',
    physical: '緩解眼睛疲勞\n增強免疫力\n促進細胞修復',
    mental: '清理思緒混亂\n增強專注與學習力\n組織化思維\n促進理性決策',
    cleansing: '月光浴（避免浸水過久）、鼠尾草煙燻、水晶簇充電',
    pairedOils: ['胡椒薄荷', '桉油醇迷迭香', '檸檬'],
    emotions: ['confused', 'tired', 'anxious'],
    emoji: '💚',
    tags: ['專注', '思維', '眉心輪', '學習'],
  },
  {
    name: '拉長石',
    en: 'Labradorite',
    family: '長石族',
    chakra: '喉輪 / 眉心輪',
    color: '#4A7B8F',
    hardness: '6-6.5',
    origin: '加拿大、馬達加斯加、芬蘭',
    effect: '保護光環，增強靈性感知\n閃爍的光暈代表彩虹橋，連結多重維度',
    physical: '緩解呼吸道問題\n調節血壓\n增強體力',
    mental: '強化能量保護層\n促進靈性覺醒\n激發創造力\n防止能量被他人吸取',
    cleansing: '月光浴、鼠尾草煙燻、音叉淨化',
    pairedOils: ['乳香', '永久花', '岩玫瑰'],
    emotions: ['escape', 'lonely', 'calm'],
    emoji: '🦋',
    tags: ['保護', '靈性', '創造力', '喉輪'],
  },
  {
    name: '紅玉髓',
    en: 'Carnelian',
    family: '石英族',
    chakra: '臍輪 / 海底輪',
    color: '#D4704A',
    hardness: '6.5-7',
    origin: '印度、巴西、埃及',
    effect: '點燃創造力與熱情\n古埃及人稱為「夕陽之石」，帶來生命活力',
    physical: '促進血液循環\n增強生殖系統健康\n提升代謝',
    mental: '激發創造力與熱情\n增強勇氣與自信\n化解冷漠與無力\n帶來溫暖與生命力',
    cleansing: '日光浴、流水淨化、鼠尾草煙燻',
    pairedOils: ['甜橙', '薑', '檸檬香茅'],
    emotions: ['tired', 'low', 'restart', 'energized'],
    emoji: '🔥',
    tags: ['創造力', '活力', '臍輪', '熱情'],
  },
  {
    name: '綠幽靈',
    en: 'Green Phantom Quartz',
    family: '石英族',
    chakra: '心輪',
    color: '#7BA87B',
    hardness: '7',
    origin: '巴西、馬達加斯加',
    effect: '帶來事業運與正財運\n內含物像是水晶內的小花園，象徵生長與豐盛',
    physical: '促進心肺功能\n增強免疫力\n幫助身體排毒',
    mental: '吸引豐盛與成長\n增強事業運\n帶來安定與踏實感\n療癒心輪情感',
    cleansing: '月光浴、水晶簇充電、鼠尾草煙燻',
    pairedOils: ['佛手柑', '絲柏', '甜茴香'],
    emotions: ['low', 'insecure', 'restart'],
    emoji: '🌿',
    tags: ['豐盛', '事業', '心輪', '成長'],
  },
  {
    name: '青金石',
    en: 'Lapis Lazuli',
    family: '矽酸鹽',
    chakra: '喉輪 / 眉心輪',
    color: '#2A4B8F',
    hardness: '5-5.5',
    origin: '阿富汗、智利、俄羅斯',
    effect: '增強溝通與表達力\n古埃及法老的寶石，象徵智慧與真理',
    physical: '緩解喉嚨不適\n降低血壓\n緩解失眠',
    mental: '增強溝通與自我表達\n激發智慧與真理探索\n化解壓抑與委屈\n促進真誠對話',
    cleansing: '月光浴（避免浸水）、鼠尾草煙燻、音叉淨化',
    pairedOils: ['苦橙葉', '德國洋甘菊', '佛手柑'],
    emotions: ['wronged', 'lonely', 'confused'],
    emoji: '💙',
    tags: ['溝通', '智慧', '喉輪', '表達'],
  },
];

// ===================== EMOTION → CRYSTAL 推薦 =====================

export const EMOTION_CRYSTAL_MAP: Partial<Record<EmotionKey, string[]>> = {
  anxious: ['紫水晶', '白水晶', '螢石'],
  tired: ['紅玉髓', '月光石', '螢石'],
  low: ['粉晶', '黃水晶', '紅玉髓'],
  calm: ['白水晶', '月光石', '拉長石'],
  warm: ['粉晶', '黃水晶'],
  energized: ['黃水晶', '虎眼石', '紅玉髓'],
  lonely: ['粉晶', '拉長石', '青金石'],
  confused: ['螢石', '白水晶', '虎眼石', '月光石'],
  wronged: ['黑曜石', '青金石', '粉晶'],
  escape: ['黑曜石', '紫水晶', '拉長石'],
  insecure: ['黑曜石', '黃水晶', '虎眼石', '綠幽靈'],
  restart: ['黃水晶', '虎眼石', '紅玉髓', '綠幽靈'],
};

// ===================== CHAKRA EMOJI =====================

export const CHAKRA_EMOJI: Record<string, string> = {
  '海底輪': '🔴',
  '臍輪': '🟠',
  '臍輪 / 海底輪': '🟠',
  '太陽神經叢': '🟡',
  '太陽神經叢 / 海底輪': '🟡',
  '心輪': '💚',
  '喉輪': '🔵',
  '喉輪 / 眉心輪': '🔵',
  '眉心輪': '🟣',
  '眉心輪 / 頂輪': '🟣',
  '頂輪': '⚪',
};
