import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Search, Eye, Edit3, CalendarDays, StickyNote, Filter, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './lib/firebase';
type RelationType = 'opening' | 'scent' | 'family' | 'love' | 'friend' | 'work' | 'art';
type StatusType = 'draft' | 'reviewing' | 'final';
type CommentItem = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
};
type RecipeItem = {
  name: string;
  drops?: number;
  note?: string;
};
type CalendarEntry = {
  id: string;
  date: string;
  weekday: string;
  relationType: RelationType;
  monthNumber: number;
  weekNumber: number;
  monthTheme: string;
  weekTheme: string;
  text: string;
  essentialOilText: string;
  recipeName?: string;
  recipeItems?: RecipeItem[];
  note?: string;
  comments?: CommentItem[];
  status: StatusType;
  updatedBy?: string;
  updatedAt?: string;
  tags?: string[];
};
type WeekBlock = {
  weekNumber: number;
  dateRange: string;
  weekTheme: string;
  monthNumber: number;
  monthName: string;
  monthTheme: string;
  intro: string;
};
type MonthBlock = {
  monthNumber: number;
  monthName: string;
  monthTheme: string;
  intro: string;
  weekNumbers: number[];
};
const relationLabel: Record<RelationType, string> = {
  opening: '開局',
  scent: '香氣',
  family: '親情',
  love: '愛情',
  friend: '友情',
  work: '薪情',
  art: '畫畫',
};
const relationBadge: Record<RelationType, string> = {
  opening: 'bg-slate-100 text-slate-700',
  scent: 'bg-amber-100 text-amber-700',
  family: 'bg-rose-100 text-rose-700',
  love: 'bg-pink-100 text-pink-700',
  friend: 'bg-sky-100 text-sky-700',
  work: 'bg-violet-100 text-violet-700',
  art: 'bg-emerald-100 text-emerald-700',
};
const statusBadge: Record<StatusType, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  reviewing: 'bg-amber-100 text-amber-700 border-amber-200',
  final: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};
const monthAccent: Record<number, string> = {
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
const weekMeta: WeekBlock[] = [
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
const monthMeta: MonthBlock[] = [
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
function createEntry(
  date: string,
  weekday: string,
  relationType: RelationType,
  monthNumber: number,
  weekNumber: number,
  text: string,
  essentialOilText = '',
  status: StatusType = 'draft'
): CalendarEntry {
  const week = weekMeta.find((w) => w.weekNumber === weekNumber)!;
  return {
    id: `${date}-${relationType}`,
    date,
    weekday,
    relationType,
    monthNumber,
    weekNumber,
    monthTheme: week.monthTheme,
    weekTheme: week.weekTheme,
    text,
    essentialOilText,
    note: '',
    comments: [],
    status,
    updatedBy: 'system',
    updatedAt: new Date().toISOString(),
    tags: [],
  };
}
const initialEntries: CalendarEntry[] = [
  createEntry('2027-01-01', 'Friday', 'opening', 1, 1, '有些事情不用立刻做好，先把自己放回生活的位置。', '', 'final'),
  createEntry('2027-01-02', 'Saturday', 'art', 1, 1, '畫畫'),
  createEntry('2027-01-03', 'Sunday', 'art', 1, 1, '畫畫'),
  createEntry('2027-01-04', 'Monday', 'scent', 1, 2, '洋甘菊'),
  createEntry('2027-01-05', 'Tuesday', 'family', 1, 2, '我不是不在乎，只是還在調整怎麼靠近你們。', '洋甘菊5 + 克萊門橙5'),
  createEntry('2027-01-06', 'Wednesday', 'love', 1, 2, '我需要一點時間，讓感覺慢慢回到位。', '洋甘菊5 + 花梨木5 + 雪松2'),
  createEntry('2027-01-07', 'Thursday', 'friend', 1, 2, '現在的我比較安靜，但不是疏遠你。', '洋甘菊4 + 花梨木4 + 雪松1 + 克萊門橙4'),
  createEntry('2027-01-08', 'Friday', 'work', 1, 2, '我還在熟悉節奏，先把事情站穩做好。', '洋甘菊3 + 花梨木3 + 雪松1 + 克萊門橙2 + 鼠尾草1'),
  createEntry('2027-01-09', 'Saturday', 'art', 1, 2, '畫畫'),
  createEntry('2027-01-10', 'Sunday', 'art', 1, 2, '畫畫'),
  createEntry('2027-01-11', 'Monday', 'scent', 1, 3, '洋甘菊'),
  createEntry('2027-01-12', 'Tuesday', 'family', 1, 3, '我知道你們關心，只是我想慢慢來。'),
  createEntry('2027-01-13', 'Wednesday', 'love', 1, 3, '不是退縮，只是想走得更確定一點。'),
  createEntry('2027-01-14', 'Thursday', 'friend', 1, 3, '有時候沉默，是因為我還在整理自己。'),
  createEntry('2027-01-15', 'Friday', 'work', 1, 3, '我選擇穩一點走，而不是急著證明。'),
  createEntry('2027-01-16', 'Saturday', 'art', 1, 3, '畫畫'),
  createEntry('2027-01-17', 'Sunday', 'art', 1, 3, '畫畫'),
  createEntry('2027-01-18', 'Monday', 'scent', 1, 4, '洋甘菊'),
  createEntry('2027-01-19', 'Tuesday', 'family', 1, 4, '慢慢找到和你們相處舒服的距離。'),
  createEntry('2027-01-20', 'Wednesday', 'love', 1, 4, '我開始知道，怎樣的靠近最剛好。'),
  createEntry('2027-01-21', 'Thursday', 'friend', 1, 4, '有些關係不用每天聯絡，也依然存在。'),
  createEntry('2027-01-22', 'Friday', 'work', 1, 4, '事情開始順起來，我也比較有把握。'),
  createEntry('2027-01-23', 'Saturday', 'art', 1, 4, '畫畫'),
  createEntry('2027-01-24', 'Sunday', 'art', 1, 4, '畫畫'),
  createEntry('2027-01-25', 'Monday', 'scent', 1, 5, '洋甘菊'),
  createEntry('2027-01-26', 'Tuesday', 'family', 1, 5, '我走的方向，也希望你們慢慢理解。'),
  createEntry('2027-01-27', 'Wednesday', 'love', 1, 5, '我知道這段關係，我想怎麼走下去。'),
  createEntry('2027-01-28', 'Thursday', 'friend', 1, 5, '留下來的，是彼此理解的人。'),
  createEntry('2027-01-29', 'Friday', 'work', 1, 5, '不一定很快，但我知道自己在前進。'),
  createEntry('2027-01-30', 'Saturday', 'art', 1, 5, '畫畫'),
  createEntry('2027-01-31', 'Sunday', 'art', 1, 5, '畫畫'),
  createEntry('2027-02-01', 'Monday', 'scent', 2, 6, '香氣介紹'),
  createEntry('2027-02-02', 'Tuesday', 'family', 2, 6, '我其實一直很在意，只是不太會說出口。'),
  createEntry('2027-02-03', 'Wednesday', 'love', 2, 6, '有些沉默，不是冷淡，是在意太多。'),
  createEntry('2027-02-04', 'Thursday', 'friend', 2, 6, '我沒有忽略你，只是有時候需要安靜一下。'),
  createEntry('2027-02-05', 'Friday', 'work', 2, 6, '我有在努力，只是成果還需要時間。'),
  createEntry('2027-02-06', 'Saturday', 'art', 2, 6, '畫畫'),
  createEntry('2027-02-07', 'Sunday', 'art', 2, 6, '畫畫'),
  createEntry('2027-02-08', 'Monday', 'scent', 2, 7, '香氣介紹'),
  createEntry('2027-02-09', 'Tuesday', 'family', 2, 7, '你們的一句話，我其實會想很久。'),
  createEntry('2027-02-10', 'Wednesday', 'love', 2, 7, '你的反應，比我想像中更影響我。'),
  createEntry('2027-02-11', 'Thursday', 'friend', 2, 7, '有些事我沒有說，但我都記得。'),
  createEntry('2027-02-12', 'Friday', 'work', 2, 7, '這份工作，我比表面看起來更在乎。'),
  createEntry('2027-02-13', 'Saturday', 'art', 2, 7, '畫畫'),
  createEntry('2027-02-14', 'Sunday', 'art', 2, 7, '畫畫'),
  createEntry('2027-02-15', 'Monday', 'scent', 2, 8, '香氣介紹'),
  createEntry('2027-02-16', 'Tuesday', 'family', 2, 8, '我會難過，是因為你們對我重要。'),
  createEntry('2027-02-17', 'Wednesday', 'love', 2, 8, '有些話會痛，是因為我真的投入。'),
  createEntry('2027-02-18', 'Thursday', 'friend', 2, 8, '我不是太敏感，只是我在乎。'),
  createEntry('2027-02-19', 'Friday', 'work', 2, 8, '被影響，不代表我承受力差。'),
  createEntry('2027-02-20', 'Saturday', 'art', 2, 8, '畫畫'),
  createEntry('2027-02-21', 'Sunday', 'art', 2, 8, '畫畫'),
  createEntry('2027-02-22', 'Monday', 'scent', 2, 9, '香氣介紹'),
  createEntry('2027-02-23', 'Tuesday', 'family', 2, 9, '我願意體諒，但也希望被尊重。'),
  createEntry('2027-02-24', 'Wednesday', 'love', 2, 9, '有些事，我希望你能認真看待。'),
  createEntry('2027-02-25', 'Thursday', 'friend', 2, 9, '關係能長久，是因為彼此有分寸。'),
  createEntry('2027-02-26', 'Friday', 'work', 2, 9, '我知道哪些事情不能再退。'),
  createEntry('2027-02-27', 'Saturday', 'art', 2, 9, '畫畫'),
  createEntry('2027-02-28', 'Sunday', 'art', 2, 9, '畫畫'),
  createEntry('2027-03-01', 'Monday', 'scent', 3, 10, '香氣介紹'),
  createEntry('2027-03-02', 'Tuesday', 'family', 3, 10, '我不再把感受都藏起來。'),
  createEntry('2027-03-03', 'Wednesday', 'love', 3, 10, '你的靠近，真的會影響我的心情。'),
  createEntry('2027-03-04', 'Thursday', 'friend', 3, 10, '我開始說出真正的感受。'),
  createEntry('2027-03-05', 'Friday', 'work', 3, 10, '我意識到自己想改變一些事。'),
  createEntry('2027-03-06', 'Saturday', 'art', 3, 10, '畫畫'),
  createEntry('2027-03-07', 'Sunday', 'art', 3, 10, '畫畫'),
  createEntry('2027-03-08', 'Monday', 'scent', 3, 11, '香氣介紹'),
  createEntry('2027-03-09', 'Tuesday', 'family', 3, 11, '這不只是小事，是真的碰到我了。'),
  createEntry('2027-03-10', 'Wednesday', 'love', 3, 11, '有些情緒，是因為我真的有放進心裡。'),
  createEntry('2027-03-11', 'Thursday', 'friend', 3, 11, '這次互動，我需要一點時間消化。'),
  createEntry('2027-03-12', 'Friday', 'work', 3, 11, '我知道這件事不能再略過。'),
  createEntry('2027-03-13', 'Saturday', 'art', 3, 11, '畫畫'),
  createEntry('2027-03-14', 'Sunday', 'art', 3, 11, '畫畫'),
  createEntry('2027-03-15', 'Monday', 'scent', 3, 12, '香氣介紹'),
  createEntry('2027-03-16', 'Tuesday', 'family', 3, 12, '我想誠實一點，不再一直說沒關係。'),
  createEntry('2027-03-17', 'Wednesday', 'love', 3, 12, '我不想再把真正的在意藏起來。'),
  createEntry('2027-03-18', 'Thursday', 'friend', 3, 12, '假裝沒事，其實比說出來更累。'),
  createEntry('2027-03-19', 'Friday', 'work', 3, 12, '問題不會自己消失，我知道。'),
  createEntry('2027-03-20', 'Saturday', 'art', 3, 12, '畫畫'),
  createEntry('2027-03-21', 'Sunday', 'art', 3, 12, '畫畫'),
  createEntry('2027-03-22', 'Monday', 'scent', 3, 13, '香氣介紹'),
  createEntry('2027-03-23', 'Tuesday', 'family', 3, 13, '面對彼此的情緒，比躲開更有力量。'),
  createEntry('2027-03-24', 'Wednesday', 'love', 3, 13, '我願意把真正的想法說清楚。'),
  createEntry('2027-03-25', 'Thursday', 'friend', 3, 13, '我想好好談一次，而不是一直閃避。'),
  createEntry('2027-03-26', 'Friday', 'work', 3, 13, '我選擇正面處理，而不是拖著。'),
  createEntry('2027-03-27', 'Saturday', 'art', 3, 13, '畫畫'),
  createEntry('2027-03-28', 'Sunday', 'art', 3, 13, '畫畫'),
  createEntry('2027-03-29', 'Monday', 'scent', 4, 14, '香氣介紹'),
  createEntry('2027-03-30', 'Tuesday', 'family', 4, 14, '我不想再配合所有期待。'),
  createEntry('2027-03-31', 'Wednesday', 'love', 4, 14, '我不想委屈自己去維持關係。'),
  createEntry('2027-04-01', 'Thursday', 'friend', 4, 14, '不是每次都要當那個最會體諒的人。'),
  createEntry('2027-04-02', 'Friday', 'work', 4, 14, '我開始拒絕不合理的要求。'),
  createEntry('2027-04-03', 'Saturday', 'art', 4, 14, '畫畫'),
  createEntry('2027-04-04', 'Sunday', 'art', 4, 14, '畫畫'),
  createEntry('2027-04-05', 'Monday', 'scent', 4, 15, '香氣介紹'),
  createEntry('2027-04-06', 'Tuesday', 'family', 4, 15, '我的想法，也值得被好好聽見。'),
  createEntry('2027-04-07', 'Wednesday', 'love', 4, 15, '感受不同，不代表我錯。'),
  createEntry('2027-04-08', 'Thursday', 'friend', 4, 15, '我允許自己有立場。'),
  createEntry('2027-04-09', 'Friday', 'work', 4, 15, '我的判斷，是有根據的。'),
  createEntry('2027-04-10', 'Saturday', 'art', 4, 15, '畫畫'),
  createEntry('2027-04-11', 'Sunday', 'art', 4, 15, '畫畫'),
  createEntry('2027-04-12', 'Monday', 'scent', 4, 16, '香氣介紹'),
  createEntry('2027-04-13', 'Tuesday', 'family', 4, 16, '忍耐不是唯一選項。'),
  createEntry('2027-04-14', 'Wednesday', 'love', 4, 16, '有些事，需要被說出來。'),
  createEntry('2027-04-15', 'Thursday', 'friend', 4, 16, '一直忍，只會把關係磨薄。'),
  createEntry('2027-04-16', 'Friday', 'work', 4, 16, '合理表達，比沉默更成熟。'),
  createEntry('2027-04-17', 'Saturday', 'art', 4, 16, '畫畫'),
  createEntry('2027-04-18', 'Sunday', 'art', 4, 16, '畫畫'),
  createEntry('2027-04-19', 'Monday', 'scent', 4, 17, '香氣介紹'),
  createEntry('2027-04-20', 'Tuesday', 'family', 4, 17, '我尊重你們，也想尊重自己。'),
  createEntry('2027-04-21', 'Wednesday', 'love', 4, 17, '這段關係，我想用自己的方式走。'),
  createEntry('2027-04-22', 'Thursday', 'friend', 4, 17, '留下來的，是值得珍惜的連結。'),
  createEntry('2027-04-23', 'Friday', 'work', 4, 17, '這條路，是我清楚後的選擇。'),
  createEntry('2027-04-24', 'Saturday', 'art', 4, 17, '畫畫'),
  createEntry('2027-04-25', 'Sunday', 'art', 4, 17, '畫畫'),
  createEntry('2027-04-26', 'Monday', 'scent', 5, 18, '香氣介紹'),
  createEntry('2027-04-27', 'Tuesday', 'family', 5, 18, '有些底線，我想好好守住。'),
  createEntry('2027-04-28', 'Wednesday', 'love', 5, 18, '我不能再忽略自己的需要。'),
  createEntry('2027-04-29', 'Thursday', 'friend', 5, 18, '不是疏遠，是我需要保護自己。'),
  createEntry('2027-04-30', 'Friday', 'work', 5, 18, '我不再默默扛下所有事。'),
  createEntry('2027-05-01', 'Saturday', 'art', 5, 18, '畫畫'),
  createEntry('2027-05-02', 'Sunday', 'art', 5, 18, '畫畫'),
  createEntry('2027-05-03', 'Monday', 'scent', 5, 19, '香氣介紹'),
  createEntry('2027-05-04', 'Tuesday', 'family', 5, 19, '我需要空間，才能更好靠近你們。'),
  createEntry('2027-05-05', 'Wednesday', 'love', 5, 19, '先穩住自己，關係才不會失衡。'),
  createEntry('2027-05-06', 'Thursday', 'friend', 5, 19, '我不想勉強自己維持熱鬧。'),
  createEntry('2027-05-07', 'Friday', 'work', 5, 19, '先照顧好自己，效率才會回來。'),
  createEntry('2027-05-08', 'Saturday', 'art', 5, 19, '畫畫'),
  createEntry('2027-05-09', 'Sunday', 'art', 5, 19, '畫畫'),
  createEntry('2027-05-10', 'Monday', 'scent', 5, 20, '香氣介紹'),
  createEntry('2027-05-11', 'Tuesday', 'family', 5, 20, '我說不，是希望關係能更長久。'),
  createEntry('2027-05-12', 'Wednesday', 'love', 5, 20, '拒絕，有時候也是誠實。'),
  createEntry('2027-05-13', 'Thursday', 'friend', 5, 20, '清楚的界線，反而讓人輕鬆。'),
  createEntry('2027-05-14', 'Friday', 'work', 5, 20, '我拒絕，是對結果負責。'),
  createEntry('2027-05-15', 'Saturday', 'art', 5, 20, '畫畫'),
  createEntry('2027-05-16', 'Sunday', 'art', 5, 20, '畫畫'),
  createEntry('2027-05-17', 'Monday', 'scent', 5, 21, '香氣介紹'),
  createEntry('2027-05-18', 'Tuesday', 'family', 5, 21, '這已經是我目前最真實的狀態。'),
  createEntry('2027-05-19', 'Wednesday', 'love', 5, 21, '我想給真的，而不是勉強的完整。'),
  createEntry('2027-05-20', 'Thursday', 'friend', 5, 21, '關係不一定要很用力才算在乎。'),
  createEntry('2027-05-21', 'Friday', 'work', 5, 21, '我清楚自己的負荷範圍。'),
  createEntry('2027-05-22', 'Saturday', 'art', 5, 21, '畫畫'),
  createEntry('2027-05-23', 'Sunday', 'art', 5, 21, '畫畫'),
  createEntry('2027-05-24', 'Monday', 'scent', 5, 22, '香氣介紹'),
  createEntry('2027-05-25', 'Tuesday', 'family', 5, 22, '我想保留一點自己的空間。'),
  createEntry('2027-05-26', 'Wednesday', 'love', 5, 22, '越在乎，越需要分寸。'),
  createEntry('2027-05-27', 'Thursday', 'friend', 5, 22, '界線不是距離，是讓彼此舒服。'),
  createEntry('2027-05-28', 'Friday', 'work', 5, 22, '我開始分清楚什麼該做、什麼不該接。'),
  createEntry('2027-05-29', 'Saturday', 'art', 5, 22, '畫畫'),
  createEntry('2027-05-30', 'Sunday', 'art', 5, 22, '畫畫'),
  createEntry('2027-05-31', 'Monday', 'scent', 6, 23, '香氣介紹'),
  createEntry('2027-06-01', 'Tuesday', 'family', 6, 23, '有些情況不容易，但我能慢慢處理。'),
  createEntry('2027-06-02', 'Wednesday', 'love', 6, 23, '我不再只靠情緒反應。'),
  createEntry('2027-06-03', 'Thursday', 'friend', 6, 23, '這次我想成熟地面對。'),
  createEntry('2027-06-04', 'Friday', 'work', 6, 23, '事情不輕鬆，但我接得住。'),
  createEntry('2027-06-05', 'Saturday', 'art', 6, 23, '畫畫'),
  createEntry('2027-06-06', 'Sunday', 'art', 6, 23, '畫畫'),
  createEntry('2027-06-07', 'Monday', 'scent', 6, 24, '香氣介紹'),
  createEntry('2027-06-08', 'Tuesday', 'family', 6, 24, '我開始知道怎麼把話說得剛好。'),
  createEntry('2027-06-09', 'Wednesday', 'love', 6, 24, '回應，不一定要激烈才算真心。'),
  createEntry('2027-06-10', 'Thursday', 'friend', 6, 24, '我懂得用比較舒服的方式表達。'),
  createEntry('2027-06-11', 'Friday', 'work', 6, 24, '我有我的處理方式。'),
  createEntry('2027-06-12', 'Saturday', 'art', 6, 24, '畫畫'),
  createEntry('2027-06-13', 'Sunday', 'art', 6, 24, '畫畫'),
  createEntry('2027-06-14', 'Monday', 'scent', 6, 25, '香氣介紹'),
  createEntry('2027-06-15', 'Tuesday', 'family', 6, 25, '不是每一句話，我都需要接住。'),
  createEntry('2027-06-16', 'Wednesday', 'love', 6, 25, '有些情緒，不是我要全部承擔。'),
  createEntry('2027-06-17', 'Thursday', 'friend', 6, 25, '不是每次都要當最會收拾的人。'),
  createEntry('2027-06-18', 'Friday', 'work', 6, 25, '成熟，是知道哪些事不必接。'),
  createEntry('2027-06-19', 'Saturday', 'art', 6, 25, '畫畫'),
  createEntry('2027-06-20', 'Sunday', 'art', 6, 25, '畫畫'),
  createEntry('2027-06-21', 'Monday', 'scent', 6, 26, '香氣介紹'),
  createEntry('2027-06-22', 'Tuesday', 'family', 6, 26, '我不是被推著走，是自己選的。'),
  createEntry('2027-06-23', 'Wednesday', 'love', 6, 26, '我想用更穩的方式愛人。'),
  createEntry('2027-06-24', 'Thursday', 'friend', 6, 26, '我願意用舒服的步調維持關係。'),
  createEntry('2027-06-25', 'Friday', 'work', 6, 26, '這是我衡量後最適合的做法。'),
  createEntry('2027-06-26', 'Saturday', 'art', 6, 26, '畫畫'),
  createEntry('2027-06-27', 'Sunday', 'art', 6, 26, '畫畫'),
  createEntry('2027-06-28', 'Monday', 'scent', 7, 27, '香氣介紹'),
  createEntry('2027-06-29', 'Tuesday', 'family', 7, 27, '不是不理，是我需要保留一點力氣。'),
  createEntry('2027-06-30', 'Wednesday', 'love', 7, 27, '我想先把自己顧穩。'),
  createEntry('2027-07-01', 'Thursday', 'friend', 7, 27, '有些時候，不熱絡也是一種誠實。'),
  createEntry('2027-07-02', 'Friday', 'work', 7, 27, '我想把力氣留給真正重要的事。'),
  createEntry('2027-07-03', 'Saturday', 'art', 7, 27, '畫畫'),
  createEntry('2027-07-04', 'Sunday', 'art', 7, 27, '畫畫'),
  createEntry('2027-07-05', 'Monday', 'scent', 7, 28, '香氣介紹'),
  createEntry('2027-07-06', 'Tuesday', 'family', 7, 28, '我先停一下，不代表我不在乎。'),
  createEntry('2027-07-07', 'Wednesday', 'love', 7, 28, '慢一點，不代表我們在後退。'),
  createEntry('2027-07-08', 'Thursday', 'friend', 7, 28, '有些連結，不需要一直用力維持。'),
  createEntry('2027-07-09', 'Friday', 'work', 7, 28, '暫停一下，是為了走得更久。'),
  createEntry('2027-07-10', 'Saturday', 'art', 7, 28, '畫畫'),
  createEntry('2027-07-11', 'Sunday', 'art', 7, 28, '畫畫'),
  createEntry('2027-07-12', 'Monday', 'scent', 7, 29, '香氣介紹'),
  createEntry('2027-07-13', 'Tuesday', 'family', 7, 29, '我還在調整，但已經比之前穩一點。'),
  createEntry('2027-07-14', 'Wednesday', 'love', 7, 29, '心慢慢回來了。'),
  createEntry('2027-07-15', 'Thursday', 'friend', 7, 29, '我開始有力氣回應你們了。'),
  createEntry('2027-07-16', 'Friday', 'work', 7, 29, '不是沒效率，是我在恢復節奏。'),
  createEntry('2027-07-17', 'Saturday', 'art', 7, 29, '畫畫'),
  createEntry('2027-07-18', 'Sunday', 'art', 7, 29, '畫畫'),
  createEntry('2027-07-19', 'Monday', 'scent', 7, 30, '香氣介紹'),
  createEntry('2027-07-20', 'Tuesday', 'family', 7, 30, '我開始知道怎樣照顧自己的心。'),
  createEntry('2027-07-21', 'Wednesday', 'love', 7, 30, '先照顧好自己，才能更好愛人。'),
  createEntry('2027-07-22', 'Thursday', 'friend', 7, 30, '我想用舒服的狀態陪伴彼此。'),
  createEntry('2027-07-23', 'Friday', 'work', 7, 30, '我不再一直透支自己。'),
  createEntry('2027-07-24', 'Saturday', 'art', 7, 30, '畫畫'),
  createEntry('2027-07-25', 'Sunday', 'art', 7, 30, '畫畫'),
  createEntry('2027-07-26', 'Monday', 'scent', 8, 31, '香氣介紹'),
  createEntry('2027-07-27', 'Tuesday', 'family', 8, 31, '我不一定要符合所有期待。'),
  createEntry('2027-07-28', 'Wednesday', 'love', 8, 31, '我這樣的節奏，也值得被理解。'),
  createEntry('2027-07-29', 'Thursday', 'friend', 8, 31, '我不必跟誰一樣，才算好相處。'),
  createEntry('2027-07-30', 'Friday', 'work', 8, 31, '我的方式，也可以把事情做好。'),
  createEntry('2027-07-31', 'Saturday', 'art', 8, 31, '畫畫'),
  createEntry('2027-08-01', 'Sunday', 'art', 8, 31, '畫畫'),
  createEntry('2027-08-02', 'Monday', 'scent', 8, 32, '香氣介紹'),
  createEntry('2027-08-03', 'Tuesday', 'family', 8, 32, '我想用自己舒服的樣子生活。'),
  createEntry('2027-08-04', 'Wednesday', 'love', 8, 32, '我開始喜歡真實的自己。'),
  createEntry('2027-08-05', 'Thursday', 'friend', 8, 32, '不用裝得很會，也能被喜歡。'),
  createEntry('2027-08-06', 'Friday', 'work', 8, 32, '我喜歡現在做事的方式。'),
  createEntry('2027-08-07', 'Saturday', 'art', 8, 32, '畫畫'),
  createEntry('2027-08-08', 'Sunday', 'art', 8, 32, '畫畫'),
  createEntry('2027-08-09', 'Monday', 'scent', 8, 33, '香氣介紹'),
  createEntry('2027-08-10', 'Tuesday', 'family', 8, 33, '我開始更相信自己的感受。'),
  createEntry('2027-08-11', 'Wednesday', 'love', 8, 33, '有些答案，我心裡其實很清楚。'),
  createEntry('2027-08-12', 'Thursday', 'friend', 8, 33, '我知道誰值得靠近。'),
  createEntry('2027-08-13', 'Friday', 'work', 8, 33, '我相信自己的決定有道理。'),
  createEntry('2027-08-14', 'Saturday', 'art', 8, 33, '畫畫'),
  createEntry('2027-08-15', 'Sunday', 'art', 8, 33, '畫畫'),
  createEntry('2027-08-16', 'Monday', 'scent', 8, 34, '香氣介紹'),
  createEntry('2027-08-17', 'Tuesday', 'family', 8, 34, '這次我想先理解自己。'),
  createEntry('2027-08-18', 'Wednesday', 'love', 8, 34, '我不想再先否定自己。'),
  createEntry('2027-08-19', 'Thursday', 'friend', 8, 34, '我可以溫柔，但不必委屈。'),
  createEntry('2027-08-20', 'Friday', 'work', 8, 34, '我願意相信自己的價值。'),
  createEntry('2027-08-21', 'Saturday', 'art', 8, 34, '畫畫'),
  createEntry('2027-08-22', 'Sunday', 'art', 8, 34, '畫畫'),
  createEntry('2027-08-23', 'Monday', 'scent', 8, 35, '香氣介紹'),
  createEntry('2027-08-24', 'Tuesday', 'family', 8, 35, '我不再只看自己不夠好的地方。'),
  createEntry('2027-08-25', 'Wednesday', 'love', 8, 35, '我開始欣賞自己真實的模樣。'),
  createEntry('2027-08-26', 'Thursday', 'friend', 8, 35, '跟你們相處時，我更自在了。'),
  createEntry('2027-08-27', 'Friday', 'work', 8, 35, '我知道自己有在變好。'),
  createEntry('2027-08-28', 'Saturday', 'art', 8, 35, '畫畫'),
  createEntry('2027-08-29', 'Sunday', 'art', 8, 35, '畫畫'),
  createEntry('2027-08-30', 'Monday', 'scent', 9, 36, '香氣介紹'),
  createEntry('2027-08-31', 'Tuesday', 'family', 9, 36, '我願意再多靠近一步。'),
  createEntry('2027-09-01', 'Wednesday', 'love', 9, 36, '我想試著把心打開一點。'),
  createEntry('2027-09-02', 'Thursday', 'friend', 9, 36, '我開始有力氣重新連結。'),
  createEntry('2027-09-03', 'Friday', 'work', 9, 36, '我願意重新進入團隊與合作。'),
  createEntry('2027-09-04', 'Saturday', 'art', 9, 36, '畫畫'),
  createEntry('2027-09-05', 'Sunday', 'art', 9, 36, '畫畫'),
  createEntry('2027-09-06', 'Monday', 'scent', 9, 37, '香氣介紹'),
  createEntry('2027-09-07', 'Tuesday', 'family', 9, 37, '原來有些情緒，不是只有我有。'),
  createEntry('2027-09-08', 'Wednesday', 'love', 9, 37, '我不是一個人在想這段關係。'),
  createEntry('2027-09-09', 'Thursday', 'friend', 9, 37, '有人懂的感覺，真的很不一樣。'),
  createEntry('2027-09-10', 'Friday', 'work', 9, 37, '原來職場裡也有人跟我站同邊。'),
  createEntry('2027-09-11', 'Saturday', 'art', 9, 37, '畫畫'),
  createEntry('2027-09-12', 'Sunday', 'art', 9, 37, '畫畫'),
  createEntry('2027-09-13', 'Monday', 'scent', 9, 38, '香氣介紹'),
  createEntry('2027-09-14', 'Tuesday', 'family', 9, 38, '被理解的時候，心會鬆一下。'),
  createEntry('2027-09-15', 'Wednesday', 'love', 9, 38, '你聽懂我，比什麼都重要。'),
  createEntry('2027-09-16', 'Thursday', 'friend', 9, 38, '有些朋友，不用多說也懂。'),
  createEntry('2027-09-17', 'Friday', 'work', 9, 38, '被看見努力的感覺，很踏實。'),
  createEntry('2027-09-18', 'Saturday', 'art', 9, 38, '畫畫'),
  createEntry('2027-09-19', 'Sunday', 'art', 9, 38, '畫畫'),
  createEntry('2027-09-20', 'Monday', 'scent', 9, 39, '香氣介紹'),
  createEntry('2027-09-21', 'Tuesday', 'family', 9, 39, '我想和你們站在理解彼此的那一邊。'),
  createEntry('2027-09-22', 'Wednesday', 'love', 9, 39, '不是輸贏，我想跟你一起往前。'),
  createEntry('2027-09-23', 'Thursday', 'friend', 9, 39, '舒服的關係，是彼此都在同一邊。'),
  createEntry('2027-09-24', 'Friday', 'work', 9, 39, '合作最好的狀態，是一起解決問題。'),
  createEntry('2027-09-25', 'Saturday', 'art', 9, 39, '畫畫'),
  createEntry('2027-09-26', 'Sunday', 'art', 9, 39, '畫畫'),
  createEntry('2027-09-27', 'Monday', 'scent', 10, 40, '香氣介紹'),
  createEntry('2027-09-28', 'Tuesday', 'family', 10, 40, '有些話，說清楚會比悶著更好。'),
  createEntry('2027-09-29', 'Wednesday', 'love', 10, 40, '我想坦白自己真正的感受。'),
  createEntry('2027-09-30', 'Thursday', 'friend', 10, 40, '我願意把想法說完整。'),
  createEntry('2027-10-01', 'Friday', 'work', 10, 40, '我想用清楚取代猜測。'),
  createEntry('2027-10-02', 'Saturday', 'art', 10, 40, '畫畫'),
  createEntry('2027-10-03', 'Sunday', 'art', 10, 40, '畫畫'),
  createEntry('2027-10-04', 'Monday', 'scent', 10, 41, '香氣介紹'),
  createEntry('2027-10-05', 'Tuesday', 'family', 10, 41, '這次我想讓你們知道我真正怎麼想。'),
  createEntry('2027-10-06', 'Wednesday', 'love', 10, 41, '真實不一定完美，但我不想再藏。'),
  createEntry('2027-10-07', 'Thursday', 'friend', 10, 41, '我想把自己的想法放到桌面上。'),
  createEntry('2027-10-08', 'Friday', 'work', 10, 41, '這就是我對事情的真實看法。'),
  createEntry('2027-10-09', 'Saturday', 'art', 10, 41, '畫畫'),
  createEntry('2027-10-10', 'Sunday', 'art', 10, 41, '畫畫'),
  createEntry('2027-10-11', 'Monday', 'scent', 10, 42, '香氣介紹'),
  createEntry('2027-10-12', 'Tuesday', 'family', 10, 42, '我不想再用退讓掩蓋自己。'),
  createEntry('2027-10-13', 'Wednesday', 'love', 10, 42, '我開始把感受說得更清楚。'),
  createEntry('2027-10-14', 'Thursday', 'friend', 10, 42, '我不再用模糊維持和平。'),
  createEntry('2027-10-15', 'Friday', 'work', 10, 42, '立場清楚，事情反而比較好做。'),
  createEntry('2027-10-16', 'Saturday', 'art', 10, 42, '畫畫'),
  createEntry('2027-10-17', 'Sunday', 'art', 10, 42, '畫畫'),
  createEntry('2027-10-18', 'Monday', 'scent', 10, 43, '香氣介紹'),
  createEntry('2027-10-19', 'Tuesday', 'family', 10, 43, '這次我想替自己說一句話。'),
  createEntry('2027-10-20', 'Wednesday', 'love', 10, 43, '我願意讓你看見我的真心。'),
  createEntry('2027-10-21', 'Thursday', 'friend', 10, 43, '我的感受，也值得被聽見。'),
  createEntry('2027-10-22', 'Friday', 'work', 10, 43, '我會替自己的想法負責，也會說出來。'),
  createEntry('2027-10-23', 'Saturday', 'art', 10, 43, '畫畫'),
  createEntry('2027-10-24', 'Sunday', 'art', 10, 43, '畫畫'),
  createEntry('2027-10-25', 'Monday', 'scent', 10, 44, '香氣介紹'),
  createEntry('2027-10-26', 'Tuesday', 'family', 10, 44, '我想讓你們知道我的界線與選擇。'),
  createEntry('2027-10-27', 'Wednesday', 'love', 10, 44, '我不再只等你猜。'),
  createEntry('2027-10-28', 'Thursday', 'friend', 10, 44, '關係裡，我也有自己的位置。'),
  createEntry('2027-10-29', 'Friday', 'work', 10, 44, '表態不是衝突，是清楚。'),
  createEntry('2027-10-30', 'Saturday', 'art', 10, 44, '畫畫'),
  createEntry('2027-10-31', 'Sunday', 'art', 10, 44, '畫畫'),
  createEntry('2027-11-01', 'Monday', 'scent', 11, 45, '香氣介紹'),
  createEntry('2027-11-02', 'Tuesday', 'family', 11, 45, '有些靠近，是我一直在努力。'),
  createEntry('2027-11-03', 'Wednesday', 'love', 11, 45, '我投入過的，不會沒有意義。'),
  createEntry('2027-11-04', 'Thursday', 'friend', 11, 45, '我認真維護過的關係，都算數。'),
  createEntry('2027-11-05', 'Friday', 'work', 11, 45, '每一份累積，都不是白費。'),
  createEntry('2027-11-06', 'Saturday', 'art', 11, 45, '畫畫'),
  createEntry('2027-11-07', 'Sunday', 'art', 11, 45, '畫畫'),
  createEntry('2027-11-08', 'Monday', 'scent', 11, 46, '香氣介紹'),
  createEntry('2027-11-09', 'Tuesday', 'family', 11, 46, '我也許慢，但我是真的在調整。'),
  createEntry('2027-11-10', 'Wednesday', 'love', 11, 46, '不快，不代表不認真。'),
  createEntry('2027-11-11', 'Thursday', 'friend', 11, 46, '關係不一定熱鬧，真就夠了。'),
  createEntry('2027-11-12', 'Friday', 'work', 11, 46, '我走得慢一點，但每一步都是真的。'),
  createEntry('2027-11-13', 'Saturday', 'art', 11, 46, '畫畫'),
  createEntry('2027-11-14', 'Sunday', 'art', 11, 46, '畫畫'),
  createEntry('2027-11-15', 'Monday', 'scent', 11, 47, '香氣介紹'),
  createEntry('2027-11-16', 'Tuesday', 'family', 11, 47, '我知道自己正在學什麼。'),
  createEntry('2027-11-17', 'Wednesday', 'love', 11, 47, '我清楚這段關係對我的意義。'),
  createEntry('2027-11-18', 'Thursday', 'friend', 11, 47, '我知道哪些人值得留下。'),
  createEntry('2027-11-19', 'Friday', 'work', 11, 47, '我不是硬撐，我有方向。'),
  createEntry('2027-11-20', 'Saturday', 'art', 11, 47, '畫畫'),
  createEntry('2027-11-21', 'Sunday', 'art', 11, 47, '畫畫'),
  createEntry('2027-11-22', 'Monday', 'scent', 11, 48, '香氣介紹'),
  createEntry('2027-11-23', 'Tuesday', 'family', 11, 48, '我有自己的節奏，也有自己的道理。'),
  createEntry('2027-11-24', 'Wednesday', 'love', 11, 48, '這樣愛，也很合理。'),
  createEntry('2027-11-25', 'Thursday', 'friend', 11, 48, '舒服的距離，才走得長久。'),
  createEntry('2027-11-26', 'Friday', 'work', 11, 48, '這條路，也許不快，但適合我。'),
  createEntry('2027-11-27', 'Saturday', 'art', 11, 48, '畫畫'),
  createEntry('2027-11-28', 'Sunday', 'art', 11, 48, '畫畫'),
  createEntry('2027-11-29', 'Monday', 'scent', 12, 49, '香氣介紹'),
  createEntry('2027-11-30', 'Tuesday', 'family', 12, 49, '回頭看，我其實走過了不少。'),
  createEntry('2027-12-01', 'Wednesday', 'love', 12, 49, '那些起伏，讓我更懂自己。'),
  createEntry('2027-12-02', 'Thursday', 'friend', 12, 49, '有些人留下來，就是答案。'),
  createEntry('2027-12-03', 'Friday', 'work', 12, 49, '我比年初的自己更穩了。'),
  createEntry('2027-12-04', 'Saturday', 'art', 12, 49, '畫畫'),
  createEntry('2027-12-05', 'Sunday', 'art', 12, 49, '畫畫'),
  createEntry('2027-12-06', 'Monday', 'scent', 12, 50, '香氣介紹'),
  createEntry('2027-12-07', 'Tuesday', 'family', 12, 50, '每一次磨合，都有意義。'),
  createEntry('2027-12-08', 'Wednesday', 'love', 12, 50, '每一次在意，都讓我更明白自己。'),
  createEntry('2027-12-09', 'Thursday', 'friend', 12, 50, '一起經歷過的，都會留下痕跡。'),
  createEntry('2027-12-10', 'Friday', 'work', 12, 50, '走過的每一步，都是累積。'),
  createEntry('2027-12-11', 'Saturday', 'art', 12, 50, '畫畫'),
  createEntry('2027-12-12', 'Sunday', 'art', 12, 50, '畫畫'),
  createEntry('2027-12-13', 'Monday', 'scent', 12, 51, '香氣介紹'),
  createEntry('2027-12-14', 'Tuesday', 'family', 12, 51, '我開始知道怎樣相處比較舒服。'),
  createEntry('2027-12-15', 'Wednesday', 'love', 12, 51, '我更懂自己想要怎樣的關係。'),
  createEntry('2027-12-16', 'Thursday', 'friend', 12, 51, '我知道什麼樣的陪伴最適合我。'),
  createEntry('2027-12-17', 'Friday', 'work', 12, 51, '我更清楚自己要往哪裡走。'),
  createEntry('2027-12-18', 'Saturday', 'art', 12, 51, '畫畫'),
  createEntry('2027-12-19', 'Sunday', 'art', 12, 51, '畫畫'),
  createEntry('2027-12-20', 'Monday', 'scent', 12, 52, '香氣介紹'),
  createEntry('2027-12-21', 'Tuesday', 'family', 12, 52, '我想帶著理解，走進下一年。'),
  createEntry('2027-12-22', 'Wednesday', 'love', 12, 52, '下一步不一定很大，但我準備好了。'),
  createEntry('2027-12-23', 'Thursday', 'friend', 12, 52, '我想把好的關係，好好帶下去。'),
  createEntry('2027-12-24', 'Friday', 'work', 12, 52, '新的方向，我會穩穩接住。'),
  createEntry('2027-12-25', 'Saturday', 'art', 12, 52, '畫畫'),
  createEntry('2027-12-26', 'Sunday', 'art', 12, 52, '畫畫'),
  createEntry('2027-12-27', 'Monday', 'scent', 12, 53, '香氣介紹'),
  createEntry('2027-12-28', 'Tuesday', 'family', 12, 53, '新的開始，不一定要急著變成誰。'),
  createEntry('2027-12-29', 'Wednesday', 'love', 12, 53, '帶著理解自己，再重新出發。'),
  createEntry('2027-12-30', 'Thursday', 'friend', 12, 53, '好的連結，會陪你走進下一年。'),
  createEntry('2027-12-31', 'Friday', 'work', 12, 53, '不用立刻更好，先站穩就很好。'),
];
function classNames(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(' ');
}
function downloadFile(filename: string, content: string, type = 'application/json;charset=utf-8;') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function toCSV(entries: CalendarEntry[]) {
  const header = ['date', 'weekday', 'relationType', 'monthNumber', 'weekNumber', 'monthTheme', 'weekTheme', 'text', 'essentialOilText', 'note', 'status'];
  const rows = entries.map((entry) =>
    [
      entry.date,
      entry.weekday,
      entry.relationType,
      entry.monthNumber,
      entry.weekNumber,
      entry.monthTheme,
      entry.weekTheme,
      entry.text,
      entry.essentialOilText,
      entry.note || '',
      entry.status,
    ]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(',')
  );
  return [header.join(','), ...rows].join('\n');
}
function toMarkdown(entries: CalendarEntry[]) {
  const grouped = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  return grouped
    .map(
      (entry) =>
        `## ${entry.date}｜${relationLabel[entry.relationType]}\n- 週次：W${entry.weekNumber}\n- 月主題：${entry.monthTheme}\n- 週主題：${entry.weekTheme}\n- 文字：${entry.text}\n- 配方：${entry.essentialOilText || '—'}\n- 備註：${entry.note || '—'}\n- 狀態：${entry.status}`
    )
    .join('\n\n');
}
export default function FragranceCalendarEditor2027() {
  const [entries, setEntries] = useState<CalendarEntry[]>(initialEntries);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<number>(1);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | StatusType>('all');
  const [relationFilter, setRelationFilter] = useState<'all' | RelationType>('all');
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [showOils, setShowOils] = useState(false);
  const [, setSaveState] = useState<'saved' | 'dirty'>('saved');
  const [, setLastSavedAt] = useState<string>('');
  const isInitialLoad = useRef(true);

  // Load from Firestore on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const snap = await getDoc(doc(db, 'calendars', '2027'));
        if (snap.exists()) {
          setEntries(snap.data().entries as CalendarEntry[]);
        }
      } catch (e) {
        console.error('Failed to load from Firestore:', e);
      } finally {
        setLoading(false);
        isInitialLoad.current = false;
      }
    };
    loadData();
  }, []);

  // Save to Firestore on entries change (debounced)
  const saveToFirestore = useCallback(async (data: CalendarEntry[]) => {
    try {
      await setDoc(doc(db, 'calendars', '2027'), { entries: data, updatedAt: new Date().toISOString() });
      setSaveState('saved');
      setLastSavedAt(new Date().toLocaleString('zh-TW'));
    } catch (e) {
      console.error('Failed to save to Firestore:', e);
    }
  }, []);

  useEffect(() => {
    if (isInitialLoad.current) return;
    const timer = setTimeout(() => saveToFirestore(entries), 800);
    return () => clearTimeout(timer);
  }, [entries, saveToFirestore]);
  const selectedMonthMeta = monthMeta.find((m) => m.monthNumber === selectedMonth)!;
  const monthWeeks = weekMeta.filter((w) => selectedMonthMeta.weekNumbers.includes(w.weekNumber));
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (entry.monthNumber !== selectedMonth) return false;
      if (selectedWeek && entry.weekNumber !== selectedWeek) return false;
      if (statusFilter !== 'all' && entry.status !== statusFilter) return false;
      if (relationFilter !== 'all' && entry.relationType !== relationFilter) return false;
      const haystack = [entry.text, entry.essentialOilText, entry.note || '', entry.weekTheme, entry.monthTheme].join(' ').toLowerCase();
      if (search && !haystack.includes(search.toLowerCase())) return false;
      return true;
    });
  }, [entries, selectedMonth, selectedWeek, statusFilter, relationFilter, search]);
  const groupedByWeek = useMemo(() => {
    const map = new Map<number, CalendarEntry[]>();
    filteredEntries
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((entry) => {
        if (!map.has(entry.weekNumber)) map.set(entry.weekNumber, []);
        map.get(entry.weekNumber)!.push(entry);
      });
    return map;
  }, [filteredEntries]);
  const selectedEntry = entries.find((e) => e.id === selectedEntryId) || null;
  const updateEntry = (id: string, patch: Partial<CalendarEntry>) => {
    setSaveState('dirty');
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              ...patch,
              updatedAt: new Date().toISOString(),
              updatedBy: 'team-editor',
            }
          : entry
      )
    );
  };
  const addComment = () => {
    if (!selectedEntry) return;
    const nextComments = [
      ...(selectedEntry.comments || []),
      {
        id: `c-${Date.now()}`,
        author: '團隊',
        text: '新的備註',
        createdAt: new Date().toLocaleString('zh-TW'),
      },
    ];
    updateEntry(selectedEntry.id, { comments: nextComments });
  };
  const updateComment = (commentId: string, text: string) => {
    if (!selectedEntry) return;
    const next = (selectedEntry.comments || []).map((comment) =>
      comment.id === commentId ? { ...comment, text } : comment
    );
    updateEntry(selectedEntry.id, { comments: next });
  };
  const removeComment = (commentId: string) => {
    if (!selectedEntry) return;
    const next = (selectedEntry.comments || []).filter((comment) => comment.id !== commentId);
    updateEntry(selectedEntry.id, { comments: next });
  };
  const exportJSON = () => downloadFile('fragrance-calendar-2027.json', JSON.stringify(entries, null, 2));
  const exportCSV = () => downloadFile('fragrance-calendar-2027.csv', toCSV(entries), 'text/csv;charset=utf-8;');
  const exportMD = () => downloadFile('fragrance-calendar-2027.md', toMarkdown(entries), 'text/markdown;charset=utf-8;');
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-stone-50 via-white to-amber-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-amber-200 border-t-amber-600" />
          <p className="text-lg text-slate-500">載入中...</p>
        </div>
      </div>
    );
  }

  const oilGroups = [
    { label: '🌸 花香調', color: 'bg-rose-50 text-rose-600 border-rose-200', oils: ['橙花','薰衣草','茉莉','玫瑰','洋甘菊','雞蛋花','伊蘭'] },
    { label: '🍊 果香調', color: 'bg-orange-50 text-orange-600 border-orange-200', oils: ['克萊門橙','紅桔','葡萄柚','檸檬'] },
    { label: '🌲 木質調', color: 'bg-amber-50 text-amber-700 border-amber-200', oils: ['西印度檀香','香杉木','大西洋雪松','花梨木','杜松漿果'] },
    { label: '🌿 草本調', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', oils: ['玫瑰草','迷迭香','茶樹','月桂葉'] },
    { label: '🌶 辛香調', color: 'bg-red-50 text-red-600 border-red-200', oils: ['馬告'] },
    { label: '❄️ 薄荷調', color: 'bg-cyan-50 text-cyan-600 border-cyan-200', oils: ['薄荷'] },
    { label: '🪨 樹脂調', color: 'bg-stone-100 text-stone-600 border-stone-300', oils: ['沒藥'] },
    { label: '🌱 泥土調', color: 'bg-yellow-50 text-yellow-700 border-yellow-200', oils: ['岩蘭草'] },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-white to-amber-50 text-slate-800">

      <div className="mx-auto grid min-h-screen max-w-[1600px] grid-cols-12 gap-6 p-4 md:p-6">
        {/* Left Sidebar */}
        <aside className="col-span-12 rounded-[28px] border border-white/80 bg-white/80 p-4 shadow-sm backdrop-blur md:col-span-3 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">2027</div>
              <h1 className="text-xl font-semibold">調香日曆編輯台</h1>
            </div>
            <CalendarDays className="h-5 w-5 text-slate-400" />
          </div>
          <div className="mb-4 rounded-3xl border border-stone-200 bg-stone-50 p-4">
            <div className="text-sm text-slate-500">年度核心句</div>
            <div className="mt-2 text-sm leading-6 text-slate-700">有些事情不用立刻做好，先把自己放回生活的位置。</div>
          </div>
          <div className="space-y-2">
            {monthMeta.map((month) => (
              <button
                key={month.monthNumber}
                onClick={() => {
                  setSelectedMonth(month.monthNumber);
                  setSelectedWeek(null);
                }}
                className={classNames(
                  'w-full rounded-2xl border px-4 py-3 text-left transition',
                  selectedMonth === month.monthNumber
                    ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                    : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50'
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{month.monthName}</div>
                    <div className={classNames('mt-1 text-xs', selectedMonth === month.monthNumber ? 'text-slate-300' : 'text-slate-500')}>
                      {month.monthTheme}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4" />
                </div>
              </button>
            ))}
          </div>
        </aside>
        {/* Main Workspace */}
        <main className="col-span-12 md:col-span-9 xl:col-span-7 pb-10">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={classNames(
              'rounded-[32px] border border-white/80 bg-gradient-to-br p-6 shadow-sm',
              monthAccent[selectedMonth]
            )}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-sm text-slate-500">{selectedMonthMeta.monthName}</div>
                <h2 className="mt-1 text-3xl font-semibold tracking-tight">{selectedMonthMeta.monthTheme}</h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">{selectedMonthMeta.intro}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setViewMode('edit')}
                  className={classNames('inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm', viewMode === 'edit' ? 'bg-slate-900 text-white' : 'bg-white/80 text-slate-700')}
                >
                  <Edit3 className="h-4 w-4" /> 編輯模式
                </button>
                <button
                  onClick={() => setViewMode('preview')}
                  className={classNames('inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm', viewMode === 'preview' ? 'bg-slate-900 text-white' : 'bg-white/80 text-slate-700')}
                >
                  <Eye className="h-4 w-4" /> 預覽模式
                </button>
                <button onClick={exportJSON} className="rounded-2xl bg-white/80 px-4 py-2 text-sm text-slate-700">匯出 JSON</button>
                <button onClick={exportCSV} className="rounded-2xl bg-white/80 px-4 py-2 text-sm text-slate-700">匯出 CSV</button>
                <button onClick={exportMD} className="rounded-2xl bg-white/80 px-4 py-2 text-sm text-slate-700">匯出 MD</button>
              </div>
            </div>
          </motion.div>
          <div className="mt-5 grid gap-4 rounded-[28px] border border-white/80 bg-white/80 p-4 shadow-sm backdrop-blur lg:grid-cols-[1.2fr_1fr_1fr_auto]">
            <label className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜尋文案、配方、備註"
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm">
              <Filter className="h-4 w-4 text-slate-400" />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="w-full bg-transparent outline-none">
                <option value="all">全部狀態</option>
                <option value="draft">草稿</option>
                <option value="reviewing">待確認</option>
                <option value="final">完成</option>
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                value={relationFilter}
                onChange={(e) => setRelationFilter(e.target.value as any)}
                className="w-full bg-transparent outline-none"
              >
                <option value="all">全部關係</option>
                <option value="opening">開局</option>
                <option value="scent">香氣</option>
                <option value="family">親情</option>
                <option value="love">愛情</option>
                <option value="friend">友情</option>
                <option value="work">薪情</option>
                <option value="art">畫畫</option>
              </select>
            </label>
            <button
              onClick={() => setShowOils(!showOils)}
              className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors whitespace-nowrap"
            >
              🌿 配方精油
              <span className="text-xs text-amber-500">{showOils ? '▲' : '▼'}</span>
            </button>
          </div>
          {/* 精油清單展開區 */}
          {showOils && (
            <div className="mt-2 rounded-[28px] border border-amber-100 bg-amber-50/60 p-4 backdrop-blur">
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                {oilGroups.map((group) => (
                  <div key={group.label} className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-500">{group.label}</span>
                    {group.oils.map((oil) => (
                      <span key={oil} className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${group.color}`}>{oil}</span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Week Tabs Navigation */}
          <div className="mt-6 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <button
              onClick={() => setSelectedWeek(null)}
              className={classNames(
                'shrink-0 rounded-full px-5 py-2 text-sm font-medium transition',
                selectedWeek === null ? 'bg-slate-900 text-white' : 'bg-white border border-stone-200 text-slate-600 hover:bg-stone-50'
              )}
            >
              全月總覽
            </button>
            {monthWeeks.map((week) => (
              <button
                key={week.weekNumber}
                onClick={() => setSelectedWeek(week.weekNumber)}
                className={classNames(
                  'shrink-0 rounded-full px-5 py-2 text-sm font-medium transition',
                  selectedWeek === week.weekNumber ? 'bg-slate-900 text-white' : 'bg-white border border-stone-200 text-slate-600 hover:bg-stone-50'
                )}
              >
                W{week.weekNumber} | {week.weekTheme}
              </button>
            ))}
          </div>
          {/* Content Feed */}
          <div className="mt-6 space-y-8">
            {Array.from(groupedByWeek.entries()).map(([weekNum, entries]) => {
              const weekInfo = monthWeeks.find((w) => w.weekNumber === weekNum);
              return (
                <div key={weekNum} className="overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-sm">
                  <div className="border-b border-stone-100 bg-stone-50/50 px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                          W{weekNum}
                        </span>
                        <span className="text-sm font-medium text-slate-500">{weekInfo?.dateRange}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-medium text-slate-800">{weekInfo?.weekTheme}</span>
                      </div>
                    </div>
                  </div>
                  <div className="divide-y divide-stone-100">
                    {entries.map((entry) => (
                      <div
                        key={entry.id}
                        onClick={() => viewMode === 'edit' && setSelectedEntryId(entry.id)}
                        className={classNames(
                          'group flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-start transition-colors',
                          viewMode === 'edit' ? 'cursor-pointer hover:bg-stone-50' : ''
                        )}
                      >
                        <div className="flex w-full shrink-0 flex-row items-center gap-4 sm:w-32 sm:flex-col sm:items-start sm:gap-1">
                          <div className="text-sm font-bold text-slate-700">{entry.date.slice(5)}</div>
                          <div className="text-xs text-slate-400">{entry.weekday.slice(0, 3)}</div>
                          <div className={classNames('mt-1 inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium', relationBadge[entry.relationType])}>
                            {relationLabel[entry.relationType]}
                          </div>
                        </div>
                        <div className="flex-1 space-y-3">
                          {viewMode === 'edit' ? (
                            <div className="space-y-2">
                              <div className="text-base text-slate-800 font-medium leading-relaxed">
                                {entry.text || <span className="text-slate-300 italic">未填寫文案...</span>}
                              </div>
                              {entry.essentialOilText && (
                                <div className="text-sm text-amber-700 flex items-center gap-1.5 bg-amber-50 inline-flex px-2 py-1 rounded">
                                  💧 {entry.essentialOilText}
                                </div>
                              )}
                              {entry.note && (
                                <div className="text-sm text-slate-500 flex items-center gap-1.5 bg-stone-100 inline-flex px-2 py-1 rounded">
                                  <StickyNote className="h-3 w-3" /> {entry.note}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-3 pt-1">
                              <p className="text-lg leading-relaxed text-slate-800">{entry.text}</p>
                              {entry.essentialOilText && (
                                <p className="text-sm text-amber-600">調香：{entry.essentialOilText}</p>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3 sm:flex-col sm:items-end pt-1">
                          <div className={classNames('rounded-full border px-2.5 py-1 text-[10px] font-medium tracking-wide w-fit', statusBadge[entry.status])}>
                            {entry.status === 'draft' ? '草稿' : entry.status === 'reviewing' ? '待確認' : '完成'}
                          </div>
                          {viewMode === 'edit' && (
                            <Edit3 className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {filteredEntries.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Search className="h-8 w-8 mb-4 opacity-50" />
                <p>沒有找到符合條件的內容</p>
              </div>
            )}
          </div>
        </main>
      </div>
      {/* Slide-out Edit Drawer */}
      {selectedEntryId && selectedEntry && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/20 backdrop-blur-sm">
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="flex w-full max-w-md flex-col border-l border-stone-200 bg-white shadow-2xl h-full overflow-y-auto"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-100 bg-white/80 px-6 py-4 backdrop-blur-md">
              <div>
                <h3 className="text-lg font-bold text-slate-800">{selectedEntry.date}</h3>
                <p className="text-xs text-slate-500">{relationLabel[selectedEntry.relationType]} ｜ W{selectedEntry.weekNumber}</p>
              </div>
              <button
                onClick={() => setSelectedEntryId(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-slate-500 hover:bg-stone-200 transition"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 space-y-6 p-6">
              <div className="space-y-2">
                <label className="text-xs font-bold tracking-wider text-slate-400 uppercase">狀態 Status</label>
                <select
                  value={selectedEntry.status}
                  onChange={(e) => updateEntry(selectedEntry.id, { status: e.target.value as StatusType })}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-slate-400 focus:bg-white transition"
                >
                  <option value="draft">📝 草稿 Draft</option>
                  <option value="reviewing">👀 待確認 Reviewing</option>
                  <option value="final">✅ 完成 Final</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold tracking-wider text-slate-400 uppercase">日曆文案 Copywriting</label>
                <textarea
                  value={selectedEntry.text}
                  onChange={(e) => updateEntry(selectedEntry.id, { text: e.target.value })}
                  className="min-h-[140px] w-full resize-none rounded-xl border border-stone-200 bg-white px-4 py-3 text-base leading-relaxed text-slate-800 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-50 transition"
                  placeholder="輸入情緒文案..."
                />
              </div>
              {['scent', 'family', 'love', 'friend', 'work'].includes(selectedEntry.relationType) && (
                <div className="space-y-2">
                  <label className="text-xs font-bold tracking-wider text-slate-400 uppercase">精油配方 Essential Oils</label>
                  <input
                    type="text"
                    value={selectedEntry.essentialOilText}
                    onChange={(e) => updateEntry(selectedEntry.id, { essentialOilText: e.target.value })}
                    className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-50 transition"
                    placeholder="例如：洋甘菊 5滴 + 薰衣草 2滴"
                  />
                </div>
              )}
              <div className="space-y-2">
                <label className="text-xs font-bold tracking-wider text-slate-400 uppercase flex items-center gap-2">
                  <StickyNote className="h-4 w-4" /> 團隊備註 Notes
                </label>
                <textarea
                  value={selectedEntry.note || ''}
                  onChange={(e) => updateEntry(selectedEntry.id, { note: e.target.value })}
                  className="min-h-[100px] w-full resize-none rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 text-sm leading-relaxed text-slate-700 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-50 transition"
                  placeholder="設計提醒、插畫需求、配方討論..."
                />
              </div>
              <div className="space-y-4 pt-6 border-t border-stone-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold tracking-wider text-slate-400 uppercase flex items-center gap-2">
                    💬 留言討論
                  </label>
                  <button onClick={addComment} className="text-xs text-sky-600 hover:text-sky-700 font-medium flex items-center gap-1">
                    <Plus className="h-3 w-3" /> 新增留言
                  </button>
                </div>
                <div className="space-y-3">
                  {(selectedEntry.comments || []).map((comment) => (
                    <div key={comment.id} className="rounded-xl border border-stone-200 bg-stone-50 p-3 relative group">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded shadow-sm border border-stone-100">{comment.author}</span>
                        <span className="text-[10px] text-slate-400">{comment.createdAt}</span>
                      </div>
                      <textarea
                        value={comment.text}
                        onChange={(e) => updateComment(comment.id, e.target.value)}
                        className="w-full bg-transparent text-sm text-slate-700 outline-none resize-none"
                        rows={2}
                        placeholder="輸入留言內容..."
                      />
                      <button
                        onClick={() => removeComment(comment.id)}
                        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-rose-400 hover:text-rose-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {(!selectedEntry.comments || selectedEntry.comments.length === 0) && (
                    <div className="text-center text-xs text-slate-400 py-6 border border-dashed border-stone-200 rounded-xl bg-stone-50/50">
                      目前沒有留言
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 border-t border-stone-100 bg-stone-50 p-4">
              <div className="flex items-center justify-between mb-4 px-2">
                <span className="text-xs text-slate-400">最後更新：{selectedEntry.updatedAt ? new Date(selectedEntry.updatedAt).toLocaleTimeString('zh-TW', {hour: '2-digit', minute:'2-digit'}) : '未更新'}</span>
                <span className="text-xs text-slate-400">編輯者：{selectedEntry.updatedBy}</span>
              </div>
              <button
                onClick={() => setSelectedEntryId(null)}
                className="w-full rounded-xl bg-slate-900 py-3 text-sm font-medium text-white hover:bg-slate-800 transition shadow-md shadow-slate-900/10"
              >
                完成並關閉
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}