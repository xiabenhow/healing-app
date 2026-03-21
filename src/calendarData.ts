export type WeekBlock = {
  weekNumber: number;
  dateRange: string;
  weekTheme: string;
  monthNumber: number;
  monthName: string;
  monthTheme: string;
  intro: string;
};

export type MonthBlock = {
  monthNumber: number;
  monthName: string;
  monthTheme: string;
  intro: string;
  weekNumbers: number[];
};

export const monthAccent: Record<number, string> = {
  1: 'from-stone-100 to-amber-50',
  2: 'from-rose-50 to-orange-50',
  3: 'from-lime-50 to-emerald-50',
  4: 'from-amber-50 to-orange-50',
  5: 'from-yellow-50 to-stone-50',
  6: 'from-teal-50 to-cyan-50',
  7: 'from-stone-100 to-zinc-50',
  8: 'from-orange-50 to-pink-50',
  9: 'from-fuchsia-50 to-rose-50',
  10: 'from-orange-100 to-stone-50',
  11: 'from-amber-100 to-yellow-50',
  12: 'from-stone-100 to-rose-50',
};

export const weekMeta: WeekBlock[] = [
  { weekNumber: 1, dateRange: '2027-01-01 ~ 2027-01-03', weekTheme: '開局', monthNumber: 1, monthName: '一月', monthTheme: '重新對齊', intro: '不是歸零，是重新站好位置。' },
  { weekNumber: 2, dateRange: '2027-01-04 ~ 2027-01-10', weekTheme: '我還在適應', monthNumber: 1, monthName: '一月', monthTheme: '重新對齊', intro: '不是歸零，是重新站好位置。' },
  { weekNumber: 3, dateRange: '2027-01-11 ~ 2027-01-17', weekTheme: '慢一點也沒關係', monthNumber: 1, monthName: '一月', monthTheme: '重新對齊', intro: '不是歸零，是重新站好位置。' },
  { weekNumber: 4, dateRange: '2027-01-18 ~ 2027-01-24', weekTheme: '開始找回節奏', monthNumber: 1, monthName: '一月', monthTheme: '重新對齊', intro: '不是歸零，是重新站好位置。' },
  { weekNumber: 5, dateRange: '2027-01-25 ~ 2027-01-31', weekTheme: '我知道我在往哪', monthNumber: 1, monthName: '一月', monthTheme: '重新對齊', intro: '不是歸零，是重新站好位置。' },
  { weekNumber: 6, dateRange: '2027-02-01 ~ 2027-02-07', weekTheme: '我不是沒用心', monthNumber: 2, monthName: '二月', monthTheme: '承認感受', intro: '有些情緒不是錯，只是被壓太久。' },
  { weekNumber: 7, dateRange: '2027-02-08 ~ 2027-02-14', weekTheme: '我其實很在意', monthNumber: 2, monthName: '二月', monthTheme: '承認感受', intro: '有些情緒不是錯，只是被壓太久。' },
  { weekNumber: 8, dateRange: '2027-02-15 ~ 2027-02-21', weekTheme: '這不是玻璃心', monthNumber: 2, monthName: '二月', monthTheme: '承認感受', intro: '有些情緒不是錯，只是被壓太久。' },
  { weekNumber: 9, dateRange: '2027-02-22 ~ 2027-02-28', weekTheme: '這是我的底線', monthNumber: 2, monthName: '二月', monthTheme: '承認感受', intro: '有些情緒不是錯，只是被壓太久。' },
  { weekNumber: 10, dateRange: '2027-03-01 ~ 2027-03-07', weekTheme: '我開始有反應', monthNumber: 3, monthName: '三月', monthTheme: '情緒甦醒', intro: '有些感覺回來，是提醒自己還活著。' },
  { weekNumber: 11, dateRange: '2027-03-08 ~ 2027-03-14', weekTheme: '這件事碰到我了', monthNumber: 3, monthName: '三月', monthTheme: '情緒甦醒', intro: '有些感覺回來，是提醒自己還活著。' },
  { weekNumber: 12, dateRange: '2027-03-15 ~ 2027-03-21', weekTheme: '我不想再假裝沒事', monthNumber: 3, monthName: '三月', monthTheme: '情緒甦醒', intro: '有些感覺回來，是提醒自己還活著。' },
  { weekNumber: 13, dateRange: '2027-03-22 ~ 2027-03-28', weekTheme: '我願意正視它', monthNumber: 3, monthName: '三月', monthTheme: '情緒甦醒', intro: '有些感覺回來，是提醒自己還活著。' },
  { weekNumber: 14, dateRange: '2027-03-29 ~ 2027-04-04', weekTheme: '我不再勉強', monthNumber: 4, monthName: '四月', monthTheme: '開始表態', intro: '不是情緒化，是開始誠實。' },
  { weekNumber: 15, dateRange: '2027-04-05 ~ 2027-04-11', weekTheme: '我有權利這樣想', monthNumber: 4, monthName: '四月', monthTheme: '開始表態', intro: '不是情緒化，是開始誠實。' },
  { weekNumber: 16, dateRange: '2027-04-12 ~ 2027-04-18', weekTheme: '不是所有事都要忍', monthNumber: 4, monthName: '四月', monthTheme: '開始表態', intro: '不是情緒化，是開始誠實。' },
  { weekNumber: 17, dateRange: '2027-04-19 ~ 2027-04-25', weekTheme: '這是我選的方向', monthNumber: 4, monthName: '四月', monthTheme: '開始表態', intro: '不是情緒化，是開始誠實。' },
  { weekNumber: 18, dateRange: '2027-04-26 ~ 2027-05-02', weekTheme: '這裡我不退', monthNumber: 5, monthName: '五月', monthTheme: '畫出界線', intro: '關係健康的開始，是界線。' },
  { weekNumber: 19, dateRange: '2027-05-03 ~ 2027-05-09', weekTheme: '我先顧好自己', monthNumber: 5, monthName: '五月', monthTheme: '畫出界線', intro: '關係健康的開始，是界線。' },
  { weekNumber: 20, dateRange: '2027-05-10 ~ 2027-05-16', weekTheme: '拒絕不代表冷漠', monthNumber: 5, monthName: '五月', monthTheme: '畫出界線', intro: '關係健康的開始，是界線。' },
  { weekNumber: 21, dateRange: '2027-05-17 ~ 2027-05-23', weekTheme: '這是我能給的程度', monthNumber: 5, monthName: '五月', monthTheme: '畫出界線', intro: '關係健康的開始，是界線。' },
  { weekNumber: 22, dateRange: '2027-05-24 ~ 2027-05-30', weekTheme: '我開始畫界線', monthNumber: 5, monthName: '五月', monthTheme: '畫出界線', intro: '關係健康的開始，是界線。' },
  { weekNumber: 23, dateRange: '2027-05-31 ~ 2027-06-06', weekTheme: '我接得住這件事', monthNumber: 6, monthName: '六月', monthTheme: '學會回應', intro: '成熟不是什麼都扛，而是知道怎麼回。' },
  { weekNumber: 24, dateRange: '2027-06-07 ~ 2027-06-13', weekTheme: '我知道怎麼回', monthNumber: 6, monthName: '六月', monthTheme: '學會回應', intro: '成熟不是什麼都扛，而是知道怎麼回。' },
  { weekNumber: 25, dateRange: '2027-06-14 ~ 2027-06-20', weekTheme: '不是每個球都要接', monthNumber: 6, monthName: '六月', monthTheme: '學會回應', intro: '成熟不是什麼都扛，而是知道怎麼回。' },
  { weekNumber: 26, dateRange: '2027-06-21 ~ 2027-06-27', weekTheme: '我選擇這樣做', monthNumber: 6, monthName: '六月', monthTheme: '學會回應', intro: '成熟不是什麼都扛，而是知道怎麼回。' },
  { weekNumber: 27, dateRange: '2027-06-28 ~ 2027-07-04', weekTheme: '我需要保存能量', monthNumber: 7, monthName: '七月', monthTheme: '保存能量', intro: '有時候，撐住就是一種能力。' },
  { weekNumber: 28, dateRange: '2027-07-05 ~ 2027-07-11', weekTheme: '休息不是退步', monthNumber: 7, monthName: '七月', monthTheme: '保存能量', intro: '有時候，撐住就是一種能力。' },
  { weekNumber: 29, dateRange: '2027-07-12 ~ 2027-07-18', weekTheme: '我正在恢復', monthNumber: 7, monthName: '七月', monthTheme: '保存能量', intro: '有時候，撐住就是一種能力。' },
  { weekNumber: 30, dateRange: '2027-07-19 ~ 2027-07-25', weekTheme: '我有在顧自己', monthNumber: 7, monthName: '七月', monthTheme: '保存能量', intro: '有時候，撐住就是一種能力。' },
  { weekNumber: 31, dateRange: '2027-07-26 ~ 2027-08-01', weekTheme: '我這樣也可以', monthNumber: 8, monthName: '八月', monthTheme: '重新相信自己', intro: '不是突然自信，是慢慢相信自己。' },
  { weekNumber: 32, dateRange: '2027-08-02 ~ 2027-08-08', weekTheme: '這是我喜歡的樣子', monthNumber: 8, monthName: '八月', monthTheme: '重新相信自己', intro: '不是突然自信，是慢慢相信自己。' },
  { weekNumber: 33, dateRange: '2027-08-09 ~ 2027-08-15', weekTheme: '我信任我的判斷', monthNumber: 8, monthName: '八月', monthTheme: '重新相信自己', intro: '不是突然自信，是慢慢相信自己。' },
  { weekNumber: 34, dateRange: '2027-08-16 ~ 2027-08-22', weekTheme: '我願意站在自己這邊', monthNumber: 8, monthName: '八月', monthTheme: '重新相信自己', intro: '不是突然自信，是慢慢相信自己。' },
  { weekNumber: 35, dateRange: '2027-08-23 ~ 2027-08-29', weekTheme: '我開始喜歡自己', monthNumber: 8, monthName: '八月', monthTheme: '重新相信自己', intro: '不是突然自信，是慢慢相信自己。' },
  { weekNumber: 36, dateRange: '2027-08-30 ~ 2027-09-05', weekTheme: '我願意靠近', monthNumber: 9, monthName: '九月', monthTheme: '再次連結', intro: '當自己穩了，關係也會回來。' },
  { weekNumber: 37, dateRange: '2027-09-06 ~ 2027-09-12', weekTheme: '我不是孤單一個', monthNumber: 9, monthName: '九月', monthTheme: '再次連結', intro: '當自己穩了，關係也會回來。' },
  { weekNumber: 38, dateRange: '2027-09-13 ~ 2027-09-19', weekTheme: '有人懂我', monthNumber: 9, monthName: '九月', monthTheme: '再次連結', intro: '當自己穩了，關係也會回來。' },
  { weekNumber: 39, dateRange: '2027-09-20 ~ 2027-09-26', weekTheme: '我們在同一邊', monthNumber: 9, monthName: '九月', monthTheme: '再次連結', intro: '當自己穩了，關係也會回來。' },
  { weekNumber: 40, dateRange: '2027-09-27 ~ 2027-10-03', weekTheme: '我願意說清楚', monthNumber: 10, monthName: '十月', monthTheme: '真實表達', intro: '真正的靠近，是能說出真話。' },
  { weekNumber: 41, dateRange: '2027-10-04 ~ 2027-10-10', weekTheme: '這是我真實的想法', monthNumber: 10, monthName: '十月', monthTheme: '真實表達', intro: '真正的靠近，是能說出真話。' },
  { weekNumber: 42, dateRange: '2027-10-11 ~ 2027-10-17', weekTheme: '我不再模糊自己', monthNumber: 10, monthName: '十月', monthTheme: '真實表達', intro: '真正的靠近，是能說出真話。' },
  { weekNumber: 43, dateRange: '2027-10-18 ~ 2027-10-24', weekTheme: '我為自己發聲', monthNumber: 10, monthName: '十月', monthTheme: '真實表達', intro: '真正的靠近，是能說出真話。' },
  { weekNumber: 44, dateRange: '2027-10-25 ~ 2027-10-31', weekTheme: '我開始表達立場', monthNumber: 10, monthName: '十月', monthTheme: '真實表達', intro: '真正的靠近，是能說出真話。' },
  { weekNumber: 45, dateRange: '2027-11-01 ~ 2027-11-07', weekTheme: '我不是白努力', monthNumber: 11, monthName: '十一月', monthTheme: '確認價值', intro: '有些路慢，但是真的。' },
  { weekNumber: 46, dateRange: '2027-11-08 ~ 2027-11-14', weekTheme: '我走得不快，但是真的', monthNumber: 11, monthName: '十一月', monthTheme: '確認價值', intro: '有些路慢，但是真的。' },
  { weekNumber: 47, dateRange: '2027-11-15 ~ 2027-11-21', weekTheme: '我知道我在幹嘛', monthNumber: 11, monthName: '十一月', monthTheme: '確認價值', intro: '有些路慢，但是真的。' },
  { weekNumber: 48, dateRange: '2027-11-22 ~ 2027-11-28', weekTheme: '這條路對我合理', monthNumber: 11, monthName: '十一月', monthTheme: '確認價值', intro: '有些路慢，但是真的。' },
  { weekNumber: 49, dateRange: '2027-11-29 ~ 2027-12-05', weekTheme: '我走過來了', monthNumber: 12, monthName: '十二月', monthTheme: '收好自己', intro: '一年走完，不一定完美，但值得。' },
  { weekNumber: 50, dateRange: '2027-12-06 ~ 2027-12-12', weekTheme: '這些經驗沒有白費', monthNumber: 12, monthName: '十二月', monthTheme: '收好自己', intro: '一年走完，不一定完美，但值得。' },
  { weekNumber: 51, dateRange: '2027-12-13 ~ 2027-12-19', weekTheme: '我比以前更懂自己', monthNumber: 12, monthName: '十二月', monthTheme: '收好自己', intro: '一年走完，不一定完美，但值得。' },
  { weekNumber: 52, dateRange: '2027-12-20 ~ 2027-12-26', weekTheme: '我準備好下一步', monthNumber: 12, monthName: '十二月', monthTheme: '收好自己', intro: '一年走完，不一定完美，但值得。' },
  { weekNumber: 53, dateRange: '2027-12-27 ~ 2028-01-02', weekTheme: '新的開始，不急著證明', monthNumber: 12, monthName: '十二月', monthTheme: '收好自己', intro: '一年走完，不一定完美，但值得。' },
];

export const monthMeta: MonthBlock[] = [
  { monthNumber: 1, monthName: '一月', monthTheme: '重新對齊', intro: '不是歸零，是重新站好位置。', weekNumbers: [1, 2, 3, 4, 5] },
  { monthNumber: 2, monthName: '二月', monthTheme: '承認感受', intro: '有些情緒不是錯，只是被壓太久。', weekNumbers: [6, 7, 8, 9] },
  { monthNumber: 3, monthName: '三月', monthTheme: '情緒甦醒', intro: '有些感覺回來，是提醒自己還活著。', weekNumbers: [10, 11, 12, 13] },
  { monthNumber: 4, monthName: '四月', monthTheme: '開始表態', intro: '不是情緒化，是開始誠實。', weekNumbers: [14, 15, 16, 17] },
  { monthNumber: 5, monthName: '五月', monthTheme: '畫出界線', intro: '關係健康的開始，是界線。', weekNumbers: [18, 19, 20, 21, 22] },
  { monthNumber: 6, monthName: '六月', monthTheme: '學會回應', intro: '成熟不是什麼都扛，而是知道怎麼回。', weekNumbers: [23, 24, 25, 26] },
  { monthNumber: 7, monthName: '七月', monthTheme: '保存能量', intro: '有時候，撐住就是一種能力。', weekNumbers: [27, 28, 29, 30] },
  { monthNumber: 8, monthName: '八月', monthTheme: '重新相信自己', intro: '不是突然自信，是慢慢相信自己。', weekNumbers: [31, 32, 33, 34, 35] },
  { monthNumber: 9, monthName: '九月', monthTheme: '再次連結', intro: '當自己穩了，關係也會回來。', weekNumbers: [36, 37, 38, 39] },
  { monthNumber: 10, monthName: '十月', monthTheme: '真實表達', intro: '真正的靠近，是能說出真話。', weekNumbers: [40, 41, 42, 43, 44] },
  { monthNumber: 11, monthName: '十一月', monthTheme: '確認價值', intro: '有些路慢，但是真的。', weekNumbers: [45, 46, 47, 48] },
  { monthNumber: 12, monthName: '十二月', monthTheme: '收好自己', intro: '一年走完，不一定完美，但值得。', weekNumbers: [49, 50, 51, 52, 53] },
];

// Monthly essential oil assignments
export type OilRecipeItem = {
  name: string;
  drops: number;
};

export type WeekOilData = {
  oilName: string;
  oilNameEn: string;
  recipe: OilRecipeItem[] | null;
  recipeNote?: string;
  weekCopy?: {
    family?: string;
    love?: string;
    friend?: string;
    work?: string;
  };
};

export type MonthOilProfile = {
  oilName: string;
  oilNameEn: string;
  scent: string;
  psychological: string[];
  physiological: string[];
  pairings: { name: string; effect: string }[];
  caution: string;
  available: boolean;
};

export const monthOilProfiles: Record<number, MonthOilProfile> = {
  1: {
    oilName: '洋甘菊',
    oilNameEn: 'Roman Chamomile',
    scent: '清甜的蘋果花香，略帶草本氣息',
    psychological: ['安撫焦慮情緒', '幫助放鬆', '緩解憤怒與急躁', '促進安全感', '改善失眠'],
    physiological: ['緩解痙攣性疼痛（月經痛、腸痙攣）', '消炎抗敏', '修復敏感性皮膚', '促進傷口癒合'],
    pairings: [
      { name: '克萊門橙', effect: '提振情緒' },
      { name: '花梨木', effect: '溫柔包覆' },
      { name: '雪松', effect: '接地穩定' },
      { name: '薰衣草', effect: '加強安眠' },
    ],
    caution: '孕初期避免，嬰兒請稀釋後使用',
    available: true,
  },
  2: { oilName: '佛手柑', oilNameEn: 'Bergamot', scent: '', psychological: [], physiological: [], pairings: [], caution: '', available: false },
  3: { oilName: '迷迭香', oilNameEn: 'Rosemary', scent: '', psychological: [], physiological: [], pairings: [], caution: '', available: false },
  4: { oilName: '天竺葵', oilNameEn: 'Geranium', scent: '', psychological: [], physiological: [], pairings: [], caution: '', available: false },
  5: { oilName: '茶樹', oilNameEn: 'Tea Tree', scent: '', psychological: [], physiological: [], pairings: [], caution: '', available: false },
  6: { oilName: '薰衣草', oilNameEn: 'Lavender', scent: '', psychological: [], physiological: [], pairings: [], caution: '', available: false },
  7: { oilName: '尤加利', oilNameEn: 'Eucalyptus', scent: '', psychological: [], physiological: [], pairings: [], caution: '', available: false },
  8: { oilName: '乳香', oilNameEn: 'Frankincense', scent: '', psychological: [], physiological: [], pairings: [], caution: '', available: false },
  9: { oilName: '依蘭依蘭', oilNameEn: 'Ylang Ylang', scent: '', psychological: [], physiological: [], pairings: [], caution: '', available: false },
  10: { oilName: '檸檬草', oilNameEn: 'Lemongrass', scent: '', psychological: [], physiological: [], pairings: [], caution: '', available: false },
  11: { oilName: '岩蘭草', oilNameEn: 'Vetiver', scent: '', psychological: [], physiological: [], pairings: [], caution: '', available: false },
  12: { oilName: '檀香', oilNameEn: 'Sandalwood', scent: '', psychological: [], physiological: [], pairings: [], caution: '', available: false },
};

export const weekOilData: Record<number, WeekOilData> = {
  1: {
    oilName: '洋甘菊',
    oilNameEn: 'Roman Chamomile',
    recipe: null,
    recipeNote: '元旦開場，讓我們先安靜下來。',
    weekCopy: {
      family: '回家的路上，你不必準備好任何表情。',
      love: '新年快樂——但你不必假裝快樂。',
      friend: '我們不趕，這一年慢慢來。',
      work: '還沒進入狀態？沒關係，先呼吸。',
    },
  },
  2: {
    oilName: '洋甘菊',
    oilNameEn: 'Roman Chamomile',
    recipe: [
      { name: '洋甘菊', drops: 5 },
      { name: '克萊門橙', drops: 5 },
    ],
    weekCopy: {
      family: '適應需要時間，家人也是。',
      love: '你可以慢慢靠近，不急。',
      friend: '還在適應的日子，有人陪就好。',
      work: '剛開始找感覺，允許自己還在暖機。',
    },
  },
  3: {
    oilName: '洋甘菊',
    oilNameEn: 'Roman Chamomile',
    recipe: [{ name: '洋甘菊', drops: 10 }],
    recipeNote: '本週為洋甘菊單方介紹週，感受它最純粹的香氣。',
    weekCopy: {
      family: '慢，不代表不在乎。',
      love: '你的節奏就是最好的節奏。',
      friend: '不用趕上誰，你自己的速度就好。',
      work: '慢一點，反而走得更遠。',
    },
  },
  4: {
    oilName: '洋甘菊',
    oilNameEn: 'Roman Chamomile',
    recipe: [
      { name: '洋甘菊', drops: 5 },
      { name: '花梨木', drops: 5 },
      { name: '雪松', drops: 2 },
    ],
    weekCopy: {
      family: '找到節奏的你，也找到了回家的路。',
      love: '穩下來之後，才能好好看見對方。',
      friend: '我們各自找到步調，然後一起走。',
      work: '有節奏感的工作，才走得久。',
    },
  },
  5: {
    oilName: '洋甘菊',
    oilNameEn: 'Roman Chamomile',
    recipe: [
      { name: '洋甘菊', drops: 4 },
      { name: '花梨木', drops: 4 },
      { name: '雪松', drops: 1 },
      { name: '克萊門橙', drops: 4 },
    ],
    weekCopy: {
      family: '知道方向的你，也能帶著家人前進。',
      love: '我知道我在往哪，也知道你在身邊。',
      friend: '方向不同沒關係，我們都在路上。',
      work: '一月收尾，帶著清晰感往前走。',
    },
  },
};
