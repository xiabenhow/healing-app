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
  ritualDetail: string;
  emotionTags: string[];
  pairing: {
    oil: string;
    oilDesc: string;
    sound: string;
    soundDesc: string;
    crystal: string;
    crystalDesc: string;
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
// 使用 lh3.googleusercontent.com/d/{ID} 格式，瀏覽器可直接嵌入

const driveImg = (id: string) => `https://lh3.googleusercontent.com/d/${id}=w800`;

export const cardImageMap: Record<CardColor, string[]> = {
  indigo: [
    driveImg('1fI_U73UFduaMWpQu_AGlSiL-lKDAJCdk'),  // 靛-01
    driveImg('1r7foBOzA4QV_3EVrfAK5ajRMBLeQfC44'),  // 靛-02
    driveImg('1q-pDA_PL3KHxRZxi6sQaADLOAj8Krorm'),  // 靛-03
    driveImg('1u15TPjY8JWH13Ef1whJ4KwIi4MNn9C-8'),  // 靛-05
    driveImg('1AQGxPQsW0mbk_EMyp9vMQOBzG5euYh3V'),  // 靛-06
  ],
  orange: [
    driveImg('1KqYn8_-LWy4wJ7Ms1mjxJj0wGH5R076Y'),  // 橘-01
    driveImg('1EPscT_ViH3ZYTwm6xkK6HQ5ohz8D4jBN'),  // 橘-02
    driveImg('1Cy1xSGJVMizSBBRuFZlXN2ITAIPBfKL_'),  // 橘-04
    driveImg('1-Kp_AtuVqP4aI7Z4JUu2wWGHHbIaWAMP'),  // 橘-05
    driveImg('1E7qDbxip-eCrvvBR2W_RP5gS6vKUZCyT'),  // 橘-06
  ],
  red: [
    driveImg('1gSoP4SFg7L6rZI_eLlZnXlYRDvKtc7Cx'),  // 紅-01
    driveImg('1OYzuPUw1Qn2en7uocA0F4qvyPJ-Y_NQe'),  // 紅-04
    driveImg('17tXbQ2w_-HLBlBr_810WnoOwZ31xrEBd'),  // 紅-06
    driveImg('1q4pwj41Gm1AHca2ANtdzrm_NnGF0c9jR'),  // 紅-07
    driveImg('1gSoP4SFg7L6rZI_eLlZnXlYRDvKtc7Cx'),  // 紅-01（備用）
  ],
  purple: [
    driveImg('1oayxA3gAvO1aFIC2sExh9zrRceLCU-wr'),  // 紫-01
    driveImg('1uYKA1X2BBr5yIcz2vTtgA-C6pwy38pwQ'),  // 紫-02
    driveImg('1UMDX_izb_pVMLutcH0ClCU8-D2GSq2Ym'),  // 紫-04
    driveImg('15NtuneIuW_V50om09oE9zZ82epnPUkrQ'),  // 紫-05
    driveImg('1oayxA3gAvO1aFIC2sExh9zrRceLCU-wr'),  // 紫-01（備用）
  ],
  yellow: [
    driveImg('1KIgcIcqiXnWDY_co4OfqyY5BcIAmqC0X'),  // 黃-04
    driveImg('18ZhWfKSSnXKs2MlkpxHaxJh5-nxOdHS7'),  // 黃-06
    driveImg('1KIgcIcqiXnWDY_co4OfqyY5BcIAmqC0X'),  // 黃-04（備用）
    driveImg('18ZhWfKSSnXKs2MlkpxHaxJh5-nxOdHS7'),  // 黃-06（備用）
    driveImg('1KIgcIcqiXnWDY_co4OfqyY5BcIAmqC0X'),  // 黃-04（備用2）
  ],
  blue: [
    driveImg('186iil357-W7AOB6y0BbgKC5HUPAy-A-v'),  // 藍-01
    driveImg('1VFau0bXRrgt-qqpTeUSNbRS1UB2iZyw9'),  // 藍-03
    driveImg('15X_Y1kAfvvyrEwbpe5Zyn8qIfZ-D3im9'),  // 藍-04
    driveImg('1suJ8wV9JeNci_5y5oVb1MzcLU2X-Fj24'),  // 藍-05
    driveImg('11lwPJMGaqjUR-773ZS4OYXaSLAOoXiRk'),  // 藍-06
  ],
  green: [
    driveImg('1RyWOS-tguqbo1U1M2M1cyj6-LgTdx-_2'),  // 綠-01
    driveImg('18doOZrCGAmwtIml8wFoJSYzxhXL-SS1y'),  // 綠-02
    driveImg('1OIHdwUUZ61Ir3KH5Av3Sn-G-wR6mB-a8'),  // 綠-03
    driveImg('17SaqAeOa9CglnGqLfSAlx4WyY-hRdYd7'),  // 綠-04
    driveImg('1kjRmYHjxzbfSW26ppqu9_GtyHkk8t_5b'),  // 綠-05
  ],
};

// ===================== 隨機圖片選擇 =====================

export const getRandomCardImage = (color: CardColor): string => {
  const images = cardImageMap[color];
  return images[Math.floor(Math.random() * images.length)];
};

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
    ritualDetail: '找一個安靜的角落，輕輕閉上眼睛。不需要刻意清空思緒，只是讓外在世界暫時退後一步。數到10，每一秒都告訴自己：「我不需要現在就知道。」睜開眼時，也許什麼都沒變，但你已經給了自己一小段喘息。',
    emotionTags: ['迷惘', '不確定', '方向感'],
    pairing: {
      oil: '乳香',
      oilDesc: '古老的靈性之油，幫助你在混沌中找到內在的安靜錨點。滴2滴在手心搓熱，輕輕覆蓋口鼻深呼吸。',
      sound: 'forest',
      soundDesc: '森林音景——樹葉的沙沙聲像是大自然在對你說：「慢慢來，不急。」',
      crystal: '紫水晶',
      crystalDesc: '開啟直覺與第三眼，讓你在迷霧中看見微光。握在手中冥想，感受它冰涼的溫度慢慢傳遞安定。',
    },
  },
  {
    id: 'indigo-2',
    title: '混亂也是過程',
    color: 'indigo',
    image: getCardImage('indigo', 1),
    message: '看不清，也沒關係',
    extendedMessage: '當一切模糊，其實正在重組',
    ritual: '深呼吸3次',
    ritualDetail: '用鼻子慢慢吸氣4秒，感受空氣從鼻腔流入胸腔、腹腔。閉氣2秒，然後用嘴巴慢慢吐氣6秒，想像所有的混亂隨著氣息慢慢離開。重複三次，讓身體帶領思緒回到當下。',
    emotionTags: ['混亂', '重組', '過渡期'],
    pairing: {
      oil: '絲柏',
      oilDesc: '沉穩的木質調，像一棵大樹的根深深扎入土壤。幫助你在變動中保持穩定，找回自己的軸心。',
      sound: 'rain',
      soundDesc: '雨聲——每一滴雨都在洗滌混亂，讓一切慢慢沉澱、歸位。',
      crystal: '月光石',
      crystalDesc: '月亮的能量石，陪伴你度過情緒的陰晴圓缺。放在枕邊，讓它在夜裡替你守護那些還沒理清的感受。',
    },
  },
  {
    id: 'indigo-3',
    title: '停一下',
    color: 'indigo',
    image: getCardImage('indigo', 2),
    message: '先停下來也很好',
    extendedMessage: '有些答案，只會在安靜裡出現',
    ritual: '放鬆肩膀',
    ritualDetail: '你現在的肩膀是不是不自覺地聳起來了？慢慢地把肩膀往耳朵方向用力聳高，維持5秒——然後一口氣放下。感受那個「鬆開」的瞬間。重複三次，你會發現原來身體一直在替你扛著什麼。',
    emotionTags: ['暫停', '安靜', '等待'],
    pairing: {
      oil: '苦橙葉',
      oilDesc: '輕柔的草本甜香，像是被溫暖的手輕輕撫過額頭。它讓焦躁的神經慢下來，讓你願意等一等。',
      sound: 'night',
      soundDesc: '夜晚蟲鳴——世界在夜裡也沒有停止運轉，只是換了一種更安靜的方式。',
      crystal: '青金石',
      crystalDesc: '智慧之石，深邃的藍色像夜空。它幫助你安靜下來傾聽內心的聲音，而不是急著向外尋找答案。',
    },
  },
  {
    id: 'indigo-4',
    title: '你正在靠近',
    color: 'indigo',
    image: getCardImage('indigo', 3),
    message: '你沒有走錯路',
    extendedMessage: '只是還沒看見終點',
    ritual: '把手放在心口',
    ritualDetail: '把右手輕輕放在胸口中央，感受你的心跳。每一下跳動都在告訴你：你還在這裡，你還在前進。閉上眼睛，在心裡對自己說三次：「我信任這個過程。」讓心跳成為你最溫暖的陪伴。',
    emotionTags: ['信任', '過程', '耐心'],
    pairing: {
      oil: '花梨木',
      oilDesc: '溫柔的木質花香，像被一個很懂你的人擁抱。它修復內在的不安全感，讓你重新相信自己的選擇。',
      sound: 'ocean',
      soundDesc: '海浪聲——潮起潮落，每一次浪來都比上一次更近。你也是。',
      crystal: '拉長石',
      crystalDesc: '轉動時會閃現神秘藍光的魔法石。它提醒你：表面看不見的東西，不代表不存在。你的改變正在深處發生。',
    },
  },
  {
    id: 'indigo-5',
    title: '慢慢理解自己',
    color: 'indigo',
    image: getCardImage('indigo', 4),
    message: '你已經在路上了',
    extendedMessage: '不需要急著變清楚',
    ritual: '寫下一個現在的感覺',
    ritualDetail: '拿起手機或紙筆，只寫一句話——現在你心裡最真實的感覺是什麼？不用修飾、不用完整、不用有邏輯。可能只是「好累」、「不知道」、「有點想哭」。寫下來這件事本身，就是在理解自己。',
    emotionTags: ['自我探索', '接納', '慢慢來'],
    pairing: {
      oil: '橙花',
      oilDesc: '花中女王的香氣，溫柔卻有力量。它幫助你接受現在的自己——包括那些還看不清楚的部分。',
      sound: 'stream',
      soundDesc: '溪流聲——水從不糾結方向，它只是流。讓這個聲音提醒你，答案會自己來到。',
      crystal: '白水晶',
      crystalDesc: '最純淨的能量放大器。它不替你決定方向，而是幫你清理雜訊，讓真正重要的聲音被聽見。',
    },
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
    ritualDetail: '把雙手交叉環抱住自己的肩膀，像小時候被人擁抱那樣。輕輕拍拍自己的上臂，左右交替，每一下都對自己說：「辛苦了。」這個擁抱不需要別人給你，你可以先給自己。',
    emotionTags: ['辛苦', '疲憊', '被看見'],
    pairing: {
      oil: '甜橙',
      oilDesc: '明亮溫暖的果香，像冬天裡的一杯熱可可。它融化你身上那些硬撐的盔甲，讓你願意柔軟一下。',
      sound: 'fireplace',
      soundDesc: '壁爐柴火聲——噼啪作響的溫暖，像有人為你點了一盞不會熄滅的燈。',
      crystal: '粉晶',
      crystalDesc: '無條件的愛之石。粉嫩的顏色提醒你：你值得被溫柔對待，尤其是被你自己。',
    },
  },
  {
    id: 'orange-2',
    title: '你不是一個人',
    color: 'orange',
    image: getCardImage('orange', 1),
    message: '我在這裡',
    extendedMessage: '就算什麼都不說也可以',
    ritual: '閉眼呼吸',
    ritualDetail: '找一個讓你感覺安全的位置坐下。閉上眼睛，把注意力放在呼吸上。不需要改變呼吸的節奏，只是觀察——空氣進來，空氣出去。想像每一次吸氣，都有一份溫暖陪伴流進你的身體裡。',
    emotionTags: ['孤單', '陪伴', '溫暖'],
    pairing: {
      oil: '洋甘菊',
      oilDesc: '像蘋果般甜美的草本香，是情緒世界的溫柔母親。它安撫你內在那個覺得孤單的小孩，告訴他：有人在。',
      sound: 'rain',
      soundDesc: '細雨聲——雨打在窗上的聲音，讓你知道外面的世界還在，而你在裡面是安全的。',
      crystal: '紅紋石',
      crystalDesc: '心輪療癒石，粉紅色的紋路像心臟的血脈。它打開你封閉的心，讓愛重新流動進來。',
    },
  },
  {
    id: 'orange-3',
    title: '放下吧',
    color: 'orange',
    image: getCardImage('orange', 2),
    message: '有些東西可以先放',
    extendedMessage: '不是放棄，是讓自己休息',
    ritual: '深呼吸',
    ritualDetail: '做一個最長的深呼吸——吸到不能再吸，然後慢慢慢慢地吐出來，吐到肺裡什麼都不剩。在吐氣的過程中，想像你把今天背著的那些事情，一件一件放到地上。你可以明天再撿起來，但現在，先放著。',
    emotionTags: ['放下', '休息', '允許'],
    pairing: {
      oil: '佛手柑',
      oilDesc: '帶有花香的清新果味，像是烏雲縫隙裡灑下的陽光。它溫柔地告訴你的神經系統：可以鬆開了。',
      sound: 'ocean',
      soundDesc: '海浪聲——潮水帶來也帶走，學學大海的智慧：不是所有東西都需要抓在手裡。',
      crystal: '月光石',
      crystalDesc: '帶著柔和光暈的療癒石。它幫助你放下執念，相信宇宙的安排，讓該來的來、該走的走。',
    },
  },
  {
    id: 'orange-4',
    title: '被好好對待',
    color: 'orange',
    image: getCardImage('orange', 3),
    message: '你值得溫柔',
    extendedMessage: '包括你對自己',
    ritual: '做一件舒服的事',
    ritualDetail: '現在就為自己做一件小小的舒服的事：泡一杯喜歡的茶、點一根香氛蠟燭、換上柔軟的衣服、打開窗讓風吹進來。不需要理由、不需要「做完正事才可以」——你的舒服，本身就是正事。',
    emotionTags: ['溫柔', '自愛', '值得'],
    pairing: {
      oil: '玫瑰天竺葵',
      oilDesc: '玫瑰般的甜美花香，平衡身心的全能精油。它提醒你：愛別人之前，先把這份柔軟留給自己。',
      sound: 'birds',
      soundDesc: '清晨鳥鳴——小鳥不會因為天還沒亮就不唱歌。你也值得在任何時候感受美好。',
      crystal: '粉晶',
      crystalDesc: '自愛與心輪療癒的代表石。把它放在胸口，讓粉色的能量提醒你：你值得世界上所有溫柔的事。',
    },
  },
  {
    id: 'orange-5',
    title: '先這樣就好',
    color: 'orange',
    image: getCardImage('orange', 4),
    message: '今天到這裡就好',
    extendedMessage: '剩下的明天再說',
    ritual: '喝一口水',
    ritualDetail: '去倒一杯溫水。不是冰的、不是燙的，是剛剛好的溫度。小口小口地喝，感受水滑過喉嚨、流進胃裡的溫暖。這杯水是你今天送給自己的最後一份禮物。喝完，今天就結束了。',
    emotionTags: ['夠了', '今天', '接納'],
    pairing: {
      oil: '克萊門橙',
      oilDesc: '比甜橙更柔和的果香，像傍晚的夕陽——溫暖但不灼熱。它幫助你接受「這樣就好」的智慧。',
      sound: 'night',
      soundDesc: '夜晚環境音——蟲鳴與微風，世界正在安靜下來，你也可以。',
      crystal: '太陽石',
      crystalDesc: '帶著金色光芒的能量石。即使在夜裡，它也提醒你：明天太陽會再升起，一切都還有機會。',
    },
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
    ritualDetail: '當情緒湧上來的時候，先不要壓下去。把手放在腹部，用力地吸一口氣讓肚子鼓起來，然後慢慢吐出去讓肚子扁下去。做五次。讓身體知道：你的情緒被允許了，它有地方可以去。',
    emotionTags: ['情緒', '合理', '保護'],
    pairing: {
      oil: '真正薰衣草',
      oilDesc: '芳療界的萬用精油，溫柔卻有力。它不是讓你壓抑情緒，而是幫你在風暴中找到一個安全的眼。',
      sound: 'rain',
      soundDesc: '大雨聲——有時候你需要一場大雨，才能把積壓的情緒沖刷乾淨。讓雨聲替你宣洩。',
      crystal: '黑曜石',
      crystalDesc: '強大的保護石，吸收負面能量。它像一面盾牌，幫你擋住外在的侵擾，讓你有空間好好感受。',
    },
  },
  {
    id: 'red-2',
    title: '可以生氣',
    color: 'red',
    image: getCardImage('red', 1),
    message: '你有權利不舒服',
    extendedMessage: '那代表界線被踩到了',
    ritual: '握拳再放鬆',
    ritualDetail: '用力握緊雙拳，感受手指頭壓進掌心的力道——把你的憤怒、委屈都握進去。維持10秒，感受那股張力。然後慢慢張開手掌，讓手指完全攤開。感受「釋放」的感覺。重複三次，你會發現生氣也可以好好結束。',
    emotionTags: ['生氣', '界線', '權利'],
    pairing: {
      oil: '歐洲赤松',
      oilDesc: '強勁的森林氣息，像是站在山頂大口呼吸。它給你力量去承認：你有權利生氣，這不是你的錯。',
      sound: 'ocean',
      soundDesc: '海浪拍打岩石——海從不壓抑自己的力量。你也可以讓情緒像浪一樣來了又去。',
      crystal: '紅碧玉',
      crystalDesc: '穩定情緒的力量之石。它不是讓你不生氣，而是幫你把憤怒轉化為守護自己的力量。',
    },
  },
  {
    id: 'red-3',
    title: '讓它過去',
    color: 'red',
    image: getCardImage('red', 2),
    message: '情緒會流動',
    extendedMessage: '它不會停在這裡',
    ritual: '呼氣慢一點',
    ritualDetail: '吸氣3秒，吐氣6秒——讓吐氣的時間是吸氣的兩倍。每一次吐氣都想像你在吹走桌上的灰塵，輕輕的、慢慢的。做八個循環，你會發現情緒真的像風一樣，來了就會走。',
    emotionTags: ['流動', '放手', '暫時'],
    pairing: {
      oil: '快樂鼠尾草',
      oilDesc: '帶著微甜的草本香，它是情緒的疏通管道。幫助堵塞的感受開始流動，讓你不再卡在同一個地方。',
      sound: 'stream',
      soundDesc: '溪水聲——水永遠在流動，從不停留在同一個地方。你的情緒也是。',
      crystal: '紅瑪瑙',
      crystalDesc: '溫暖的橘紅色能量，穩定又流動。它幫助你的情緒像河流一樣順暢流過，不會在某處形成堰塞。',
    },
  },
  {
    id: 'red-4',
    title: '不需要壓抑',
    color: 'red',
    image: getCardImage('red', 3),
    message: '你可以表達',
    extendedMessage: '哪怕只是對自己',
    ritual: '寫下一句話',
    ritualDetail: '拿一張紙或打開手機備忘錄，寫下你現在最想說但不敢說的一句話。可以是對某個人的、對這個世界的、或是對你自己的。不用給任何人看，寫完之後可以把紙揉掉、把備忘錄刪掉——重點是你說出來了。',
    emotionTags: ['表達', '壓抑', '釋放'],
    pairing: {
      oil: '依蘭依蘭',
      oilDesc: '濃郁的熱帶花香，打開你封閉的情感閘門。它讓你允許自己感受，不再害怕那些「不應該有」的情緒。',
      sound: 'forest',
      soundDesc: '深林環境音——在森林裡沒有人會評判你的聲音。在這裡，你可以自由表達。',
      crystal: '石榴石',
      crystalDesc: '深紅色的生命力之石。它點燃你內在的勇氣，讓你敢於面對和表達自己真實的感受。',
    },
  },
  {
    id: 'red-5',
    title: '釋放一下',
    color: 'red',
    image: getCardImage('red', 4),
    message: '放掉一點點就好',
    extendedMessage: '不需要一次全部放下',
    ritual: '大口呼氣',
    ritualDetail: '站起來，雙腳與肩同寬。深吸一口氣到最飽，然後張大嘴巴用力呼出來——可以發出「哈」的聲音。越大聲越好。做三次。這不是優雅的事，但它有效。讓你的身體記住「釋放」是什麼感覺。',
    emotionTags: ['釋放', '一點點', '慢慢來'],
    pairing: {
      oil: '迷迭香',
      oilDesc: '清新提神的草本香，像一陣清風吹過悶熱的房間。它幫助你的大腦清醒過來，從情緒的漩渦中抬起頭。',
      sound: 'rain',
      soundDesc: '雷雨聲——雷聲是天空的釋放。在這個安全的空間裡，讓大自然的力量陪你一起放手。',
      crystal: '黑曜石',
      crystalDesc: '火山岩形成的保護石，擅長吸收你不再需要的能量。把它握在手裡，想像那些壓力正在被它吸走。',
    },
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
    ritualDetail: '把雙腳平放在地上，感受腳底與地面的接觸。你是被大地支撐著的。吸氣時想像從腳底吸入大地的穩定，吐氣時想像不安從頭頂飄散出去。五個呼吸之後，你會感覺自己像一棵紮了根的樹。',
    emotionTags: ['安全', '安穩', '當下'],
    pairing: {
      oil: '真正薰衣草',
      oilDesc: '經典安撫精油，啟動副交感神經。滴在枕頭上或擴香，讓它用最溫柔的方式告訴你的身體：你很安全。',
      sound: 'night',
      soundDesc: '靜謐夜晚——蟲鳴與遠方的微風，像大自然為你編織了一張安全網。',
      crystal: '紫水晶',
      crystalDesc: '最經典的靈性安定石。它連結你的頂輪，帶來深層的平靜。放在床頭，讓它守護你的每一個夜晚。',
    },
  },
  {
    id: 'purple-2',
    title: '慢慢呼吸',
    color: 'purple',
    image: getCardImage('purple', 1),
    message: '回到身體',
    extendedMessage: '一吸一吐就好',
    ritual: '4-7-8 呼吸',
    ritualDetail: '這是安德魯·韋爾博士的經典放鬆呼吸法：用鼻子吸氣4秒→閉氣7秒→用嘴巴慢慢吐氣8秒。做四個循環就好。這個方法直接啟動你的副交感神經，像是按下身體的「安靜模式」按鈕。',
    emotionTags: ['呼吸', '身體', '放鬆'],
    pairing: {
      oil: '乳香',
      oilDesc: '神聖的樹脂香氣，幾千年來被用於冥想與祈禱。它幫助你的呼吸自然變深變慢，進入深層放鬆狀態。',
      sound: 'ocean',
      soundDesc: '海浪聲——潮起潮落的節奏天然符合呼吸的韻律。讓海浪成為你的呼吸節拍器。',
      crystal: '螢石',
      crystalDesc: '夢幻的紫綠漸層，是心智清理專家。它幫你關閉大腦裡那些停不下來的念頭，回到身體的安靜中。',
    },
  },
  {
    id: 'purple-3',
    title: '放鬆一下',
    color: 'purple',
    image: getCardImage('purple', 2),
    message: '不需要緊繃',
    extendedMessage: '身體可以軟下來',
    ritual: '放鬆肩膀',
    ritualDetail: '從頭頂開始往下掃描你的身體：額頭緊嗎？放鬆。下巴咬著嗎？鬆開。肩膀聳著嗎？放下來。手指握著嗎？打開。肚子收著嗎？讓它軟下來。一個部位一個部位，像是在幫自己解開看不見的繩結。',
    emotionTags: ['緊繃', '放鬆', '柔軟'],
    pairing: {
      oil: '洋甘菊',
      oilDesc: '大自然的安定劑，甜甜的蘋果香氣。它溫柔地鬆開你身體裡每一處不自覺的緊繃，讓你整個人軟下來。',
      sound: 'rain',
      soundDesc: '細雨聲——不急不徐的雨滴像是在幫你的神經做spa，一滴一滴洗去疲倦。',
      crystal: '月光石',
      crystalDesc: '帶著柔和光暈的女性能量石。它教你用柔軟取代強撐，用接受取代抵抗。握著它入睡，夢境也會變溫柔。',
    },
  },
  {
    id: 'purple-4',
    title: '世界沒有那麼急',
    color: 'purple',
    image: getCardImage('purple', 3),
    message: '你可以慢一點',
    extendedMessage: '一切都還來得及',
    ritual: '慢慢走幾步',
    ritualDetail: '站起來，用比平常慢三倍的速度走路。一步一步，感受腳跟先著地，然後腳掌，然後腳趾。像是在走一條很珍貴的路。走十步就好——你會發現，當身體慢下來，心也會跟著慢下來。',
    emotionTags: ['慢', '不急', '從容'],
    pairing: {
      oil: '苦橙葉',
      oilDesc: '清新帶甜的草本香，是過度焦慮的解藥。它輕輕按住你腦海裡那個一直喊「快一點」的聲音。',
      sound: 'forest',
      soundDesc: '森林環境音——樹木花了幾十年才長成今天的樣子。沒有什麼值得的事情是急出來的。',
      crystal: '天青石',
      crystalDesc: '淡藍色的寧靜之石，連結喉輪帶來平靜。它幫助你放慢內在的節奏，從匆忙中回到自己的步調。',
    },
  },
  {
    id: 'purple-5',
    title: '今晚會好好睡',
    color: 'purple',
    image: getCardImage('purple', 4),
    message: '讓今天結束',
    extendedMessage: '你已經夠了',
    ritual: '關燈躺下',
    ritualDetail: '把手機放到伸手搆不到的地方。關掉所有的燈。躺下來，把被子拉到下巴。做三個深呼吸，每一次吐氣都在心裡說：「今天結束了，我做得夠好了。」讓黑暗擁抱你，讓身體慢慢沉進床裡。今晚，會好好的。',
    emotionTags: ['睡眠', '結束', '足夠'],
    pairing: {
      oil: '橙花',
      oilDesc: '頂級的安眠精油，花中的安定力量。一滴在枕頭上，它會像一隻溫暖的手，輕輕撫著你的額頭直到你睡著。',
      sound: 'night',
      soundDesc: '深夜環境音——遠方隱約的蟲鳴、微風拂過樹葉。世界在替你守夜，你可以安心入睡了。',
      crystal: '紫水晶',
      crystalDesc: '助眠的經典水晶。放在枕頭下方，它的能量會在你睡著後繼續工作，帶來安穩深沉的睡眠。',
    },
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
    ritualDetail: '想想那件你一直拖著沒做的事——現在只做它的第一步就好。要寫報告？先打開檔案。要運動？先穿上運動鞋。要打電話？先把號碼點開。不用做完，只要開始。你會發現，最難的永遠是第一步。',
    emotionTags: ['開始', '行動', '勇氣'],
    pairing: {
      oil: '迷迭香',
      oilDesc: '頭腦的清醒劑，聞一下就像按了大腦的啟動鍵。它清理拖延的迷霧，讓你找回「想做」的衝勁。',
      sound: 'birds',
      soundDesc: '清晨鳥鳴——新的一天開始了，鳥兒已經在唱歌了。讓牠們的活力感染你。',
      crystal: '黃水晶',
      crystalDesc: '太陽神經叢的能量石，閃耀著金色光芒。它啟動你的意志力和行動力，讓「想做」變成「正在做」。',
    },
  },
  {
    id: 'yellow-2',
    title: '小步也很好',
    color: 'yellow',
    image: getCardImage('yellow', 1),
    message: '一點點就夠',
    extendedMessage: '前進就是前進',
    ritual: '完成一件小事',
    ritualDetail: '現在就完成一件兩分鐘內可以做完的小事：回一則訊息、喝一杯水、把桌上的杯子放回去、把一封郵件歸檔。完成之後，你會得到一份小小的成就感——而這份感覺會推動你去做下一件事。',
    emotionTags: ['小步', '前進', '累積'],
    pairing: {
      oil: '甜橙',
      oilDesc: '快樂的果香精油，像在灰色日子裡打開一扇窗。它讓「做事」變成一件愉快的事，而不是壓力。',
      sound: 'forest',
      soundDesc: '森林晨光——樹木每天只長一點點，但最後都成了參天大樹。你的小步也是。',
      crystal: '虎眼石',
      crystalDesc: '金棕色的力量石，閃爍著貓眼般的光芒。它給你專注和堅持的能量，讓每一個小步都走得穩穩的。',
    },
  },
  {
    id: 'yellow-3',
    title: '為自己做一件事',
    color: 'yellow',
    image: getCardImage('yellow', 2),
    message: '今天屬於你',
    extendedMessage: '不需要理由',
    ritual: '做一件喜歡的事',
    ritualDetail: '今天為自己安排一件純粹讓你快樂的事——不是為了工作、不是為了別人、不是為了「應該」。可以是買一束花、聽一首歌、走一段平常不走的路、吃一個一直想吃的東西。你的快樂不需要生產力來證明。',
    emotionTags: ['自己', '自由', '享受'],
    pairing: {
      oil: '佛手柑',
      oilDesc: '義大利陽光的味道，同時提振又放鬆。它打開你心裡那扇「允許自己享受」的門，讓愉悅自然流進來。',
      sound: 'stream',
      soundDesc: '溪流聲——水流過石頭時會發出快樂的聲音。讓這個聲音提醒你：流動本身就是一種享受。',
      crystal: '太陽石',
      crystalDesc: '帶著金色閃光的快樂石。它激發你內在的喜悅和創造力，讓你記起「我也值得被好好對待」。',
    },
  },
  {
    id: 'yellow-4',
    title: '你可以做到',
    color: 'yellow',
    image: getCardImage('yellow', 3),
    message: '你其實有能力',
    extendedMessage: '只是需要開始',
    ritual: '深呼吸後開始',
    ritualDetail: '做三次有力的呼吸：快速用鼻子吸氣，用力用嘴巴吐氣。像是在點燃身體裡的引擎。第三次吐氣完畢後，馬上開始做那件事——不要給大腦反悔的時間。你的身體比你的恐懼更有力量。',
    emotionTags: ['能力', '信心', '潛力'],
    pairing: {
      oil: '歐洲赤松',
      oilDesc: '森林裡最強壯的氣味，注入原始的生命力。它喚醒你骨子裡的力量——那個你以為不見了的自信。',
      sound: 'ocean',
      soundDesc: '海浪聲——每一道浪都毫不猶豫地向前。借用大海的果斷，給自己一點推力。',
      crystal: '黃水晶',
      crystalDesc: '自信與豐盛的象徵。它連結你的太陽神經叢——你的力量中心，讓「我做不到」變成「我試試看」。',
    },
  },
  {
    id: 'yellow-5',
    title: '打開節奏',
    color: 'yellow',
    image: getCardImage('yellow', 4),
    message: '動起來就會改變',
    extendedMessage: '不需要完美',
    ritual: '起身動一下',
    ritualDetail: '站起來，做五個最簡單的動作：甩甩手、轉轉脖子、扭扭腰、踮踮腳、拍拍大腿。不用標準、不用好看，只是讓沉默的身體重新開機。當血液開始流動，你的心情也會跟著動起來。',
    emotionTags: ['節奏', '動起來', '改變'],
    pairing: {
      oil: '薄荷',
      oilDesc: '瞬間清涼醒腦，像往臉上潑了一捧冷泉水。它踢走遲鈍和倦怠，讓你的身體和大腦同時甦醒。',
      sound: 'birds',
      soundDesc: '鳥群晨間合唱——活力滿滿的旋律。讓大自然的節奏帶動你的身體，找回內在的律動感。',
      crystal: '虎眼石',
      crystalDesc: '行動力與勇氣的催化劑。它的金棕色波紋像流動的能量，推動你從「想」到「做」的最後一步。',
    },
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
    ritualDetail: '現在不需要做任何事來「變好」。只要呼吸就好。每一次呼吸，你的身體都在自動修復——細胞在更新、傷口在癒合、疲勞在消退。你看不見，但它正在發生。相信你的身體，它知道怎麼做。',
    emotionTags: ['修復', '時間', '耐心'],
    pairing: {
      oil: '橙花',
      oilDesc: '修復受傷心靈的頂級花精油。它的香氣直接觸碰你內在最柔軟的地方，讓那些裂縫慢慢長回來。',
      sound: 'rain',
      soundDesc: '綿綿細雨——雨是大地的修復儀式。乾裂的土地需要雨，你的心也是。',
      crystal: '海藍寶',
      crystalDesc: '像大海一樣溫柔的療癒石。它帶來平靜與勇氣，讓你在低谷中也能看見水面上的光。',
    },
  },
  {
    id: 'blue-2',
    title: '可以難過',
    color: 'blue',
    image: getCardImage('blue', 1),
    message: '這樣是正常的',
    extendedMessage: '不需要壓下去',
    ritual: '靜靜坐著',
    ritualDetail: '找一個角落坐下來，什麼都不做。不滑手機、不跟人說話、不想著待會要做什麼。就只是坐著，感受現在的自己。如果眼眶濕了，讓它濕。如果想嘆氣，嘆出來。此刻唯一的任務就是：允許自己難過。',
    emotionTags: ['難過', '正常', '允許'],
    pairing: {
      oil: '真正薰衣草',
      oilDesc: '像一條柔軟的毯子裹住你的心。薰衣草不會叫你不要難過，它只是安靜地陪著你，直到你好一些。',
      sound: 'ocean',
      soundDesc: '遠方海浪——大海承載著世界上所有的眼淚。在海邊，你的悲傷不會顯得太大。',
      crystal: '粉晶',
      crystalDesc: '無條件的愛與自我慈悲。握著它的時候，想像有人對你說：「難過就難過吧，我不會走。」',
    },
  },
  {
    id: 'blue-3',
    title: '先這樣也可以',
    color: 'blue',
    image: getCardImage('blue', 2),
    message: '不需要變正常',
    extendedMessage: '現在這樣就很好',
    ritual: '放鬆自己',
    ritualDetail: '今天不需要假裝開心、不需要應付誰、不需要打起精神。讓自己保持現在這個樣子——可以懶懶的、可以不想說話、可以什麼都不做。「不正常」的你，也是完整的你。',
    emotionTags: ['接納', '現在', '足夠'],
    pairing: {
      oil: '花梨木',
      oilDesc: '溫暖包容的木質花香，像一個不會評判你的朋友。它接住你現在的模樣，不急著把你變成別的。',
      sound: 'forest',
      soundDesc: '午後森林——有時候陰天的森林比晴天更美。不需要總是陽光燦爛，陰天有陰天的溫柔。',
      crystal: '藍紋瑪瑙',
      crystalDesc: '淡藍色帶著白色紋路，溫柔得像雲。它降低你對自己的要求，讓你允許自己只是「在」就好。',
    },
  },
  {
    id: 'blue-4',
    title: '悲傷會過去',
    color: 'blue',
    image: getCardImage('blue', 3),
    message: '它只是經過',
    extendedMessage: '不會留下來',
    ritual: '呼氣慢一點',
    ritualDetail: '悲傷像一片很厚的雲經過你的天空。你不需要推開它，只需要知道：雲會走的。現在用很慢的速度呼氣——想像你在吹一片羽毛，輕到不能再輕。在這個慢到不能再慢的呼氣裡，讓悲傷自己決定什麼時候離開。',
    emotionTags: ['悲傷', '流動', '暫時'],
    pairing: {
      oil: '佛手柑',
      oilDesc: '被稱為「液態陽光」的精油。它不會強迫你開心，但會在你的悲傷裡放入一點點亮光，讓黑暗不那麼濃。',
      sound: 'stream',
      soundDesc: '小溪潺潺——溪水流過石頭上的苔蘚，帶走所經過的一切。你的悲傷也在被輕輕帶走。',
      crystal: '青金石',
      crystalDesc: '深邃夜空般的藍色，鑲嵌金色星點。它提醒你：即使在最深的悲傷裡，也藏著回來的力量。',
    },
  },
  {
    id: 'blue-5',
    title: '陪著自己',
    color: 'blue',
    image: getCardImage('blue', 4),
    message: '你可以陪自己',
    extendedMessage: '不需要完美',
    ritual: '把手放在胸口',
    ritualDetail: '把手放在胸口正中央，感受那裡的溫度。你的手是溫暖的，你的心跳是穩定的。在心裡對自己說：「我在這裡陪你。不管發生什麼，我不會離開你。」這是你能給自己最珍貴的承諾。',
    emotionTags: ['陪伴', '自己', '不完美'],
    pairing: {
      oil: '洋甘菊',
      oilDesc: '像被最溫柔的擁抱包圍。洋甘菊安撫你內在那個受傷的孩子，溫聲說：「你不需要完美，你只需要被愛。」',
      sound: 'night',
      soundDesc: '安靜的夜——在夜裡，你不需要演給任何人看。只有你和你自己，這就夠了。',
      crystal: '月光石',
      crystalDesc: '守護者之石，帶著月亮的溫柔光輝。它增強你對自己的慈悲心，讓自我照顧變得自然而然。',
    },
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
    ritualDetail: '閉上眼睛，回想三個月前的自己。你那時候在擔心什麼？害怕什麼？現在還是一樣嗎？你會發現，有些事已經不一樣了。深呼吸一次，為這個「不一樣」給自己一個微笑。成長不一定是變強，有時候是變柔軟了。',
    emotionTags: ['改變', '成長', '真實'],
    pairing: {
      oil: '絲柏',
      oilDesc: '扎根與轉變的精油，像常青樹一樣經得起四季更迭。它支持你在改變中保持穩定，一圈一圈長出年輪。',
      sound: 'forest',
      soundDesc: '春天的森林——嫩芽正在破土而出。你聽不見生長的聲音，但它無時無刻都在發生。',
      crystal: '綠東陵',
      crystalDesc: '新開始的幸運石，帶著春天的綠色能量。它鼓勵你的心輪打開，迎接生命中正在發生的美好變化。',
    },
  },
  {
    id: 'green-2',
    title: '再試一次',
    color: 'green',
    image: getCardImage('green', 1),
    message: '重新開始也很好',
    extendedMessage: '每一天都是新的',
    ritual: '做一件新事',
    ritualDetail: '今天做一件你從來沒做過的小事：走一條不同的路回家、試一種沒吃過的食物、用左手刷牙、聽一首從來沒聽過的歌。新的經驗會在大腦裡開闢新的路徑。每一個「第一次」都是重新開始的練習。',
    emotionTags: ['重新開始', '新的', '勇氣'],
    pairing: {
      oil: '檸檬',
      oilDesc: '最清新明亮的開場白。檸檬的香氣像是在說「新的一天開始了」，幫你清除過去的殘留，輕裝上路。',
      sound: 'birds',
      soundDesc: '清晨鳥鳴——鳥兒每天早上都唱同一首歌，但每一天對牠們來說都是全新的。',
      crystal: '綠幽靈',
      crystalDesc: '成長與豐盛的象徵，內含物像是被封印的森林。它提醒你：即使在看似停滯的時候，生命力也在內部積蓄。',
    },
  },
  {
    id: 'green-3',
    title: '你更靠近自己了',
    color: 'green',
    image: getCardImage('green', 2),
    message: '比昨天更好',
    extendedMessage: '這就是進步',
    ritual: '寫下今天的一件好事',
    ritualDetail: '拿起紙筆或打開手機，寫下今天發生的一件好事。不需要很大——也許是一杯好喝的咖啡、一個善意的微笑、一段安靜的午休。把這些微小的美好記錄下來，日子久了你會發現：你的人生比你以為的還要豐富。',
    emotionTags: ['進步', '靠近', '自己'],
    pairing: {
      oil: '加拿大冷杉',
      oilDesc: '清新的針葉香氣，像是走進一片沒有人到過的原始森林。它幫助你回歸最本真的自己，不加修飾。',
      sound: 'stream',
      soundDesc: '山間溪流——水流過每一顆石頭都在進步，雖然看不出來，但終究會匯入大海。',
      crystal: '孔雀石',
      crystalDesc: '層層疊疊的綠色紋路記錄著成長的軌跡。它是轉變的守護石，幫你看見自己走過的路有多遠。',
    },
  },
  {
    id: 'green-4',
    title: '一切會長出來',
    color: 'green',
    image: getCardImage('green', 3),
    message: '就像種子一樣',
    extendedMessage: '需要時間',
    ritual: '想像自己成長',
    ritualDetail: '閉上眼睛，想像自己是一顆種子——埋在溫暖的土壤裡。黑暗不是困住你，是保護你。水分和養分正在慢慢滲進來。你的根開始向下延伸，你的芽即將破土。不急，種子從不會急。它只是安靜地、持續地長。',
    emotionTags: ['種子', '時間', '耐心'],
    pairing: {
      oil: '花梨木',
      oilDesc: '溫暖而有韌性的木質香，像一棵成熟的大樹。它陪伴你度過成長的等待期，提醒你：扎根的時間不是浪費。',
      sound: 'rain',
      soundDesc: '春雨——種子需要雨水才能發芽。每一滴雨都是滋養你成長的養分。',
      crystal: '綠東陵',
      crystalDesc: '心輪的成長石，帶著植物般的生命力。它幫助你信任自然的節奏：該開花的時候，就會開花。',
    },
  },
  {
    id: 'green-5',
    title: '繼續走',
    color: 'green',
    image: getCardImage('green', 4),
    message: '你已經在路上',
    extendedMessage: '不需要回頭',
    ritual: '向前走一步',
    ritualDetail: '站起來，面向前方。深吸一口氣，然後踏出一步——一個真實的、物理上的步伐。讓這一步代表你的決心：不管前面是什麼，我選擇繼續。你不需要看見終點才能走路。你只需要看見下一步，然後踏出去。',
    emotionTags: ['前進', '路上', '不回頭'],
    pairing: {
      oil: '雪松',
      oilDesc: '古老巨木的沉穩力量，給你像大地一樣堅定的勇氣。它說：你的根已經夠深了，現在可以向上生長了。',
      sound: 'ocean',
      soundDesc: '海浪聲——海永遠在向前推進，一波接著一波，從不回頭。帶著這份力量，繼續你的路。',
      crystal: '綠幽靈',
      crystalDesc: '內在豐盛與突破的象徵。它像是一面綠色的旗幟，在你的路上迎風飄揚，替你喊著：「繼續走，你可以的。」',
    },
  },
];

// ===================== 工具函式 =====================

export const drawRandomCard = (): HealingCard => {
  return HEALING_CARDS[Math.floor(Math.random() * HEALING_CARDS.length)];
};

export const drawCardByColor = (color: CardColor): HealingCard => {
  const colorCards = HEALING_CARDS.filter(c => c.color === color);
  return colorCards[Math.floor(Math.random() * colorCards.length)];
};

export const getAllColors = (): CardColor[] => {
  return ['indigo', 'orange', 'red', 'purple', 'yellow', 'blue', 'green'];
};

export const searchCardsByTag = (tag: string): HealingCard[] => {
  return HEALING_CARDS.filter(c => c.emotionTags.some(t => t.includes(tag)));
};
