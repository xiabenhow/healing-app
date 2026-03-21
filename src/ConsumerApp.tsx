import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Droplets, Heart, Leaf, AlertTriangle, Sparkles } from 'lucide-react';
import {
  weekMeta,
  monthMeta,
  monthAccent,
  monthOilProfiles,
  weekOilData,
  type WeekBlock,
  type MonthOilProfile,
} from './calendarData';

type Screen = 'hero' | 'calendar' | 'detail';

const monthSoftColor: Record<number, string> = {
  1: 'bg-amber-50/60',
  2: 'bg-rose-50/60',
  3: 'bg-emerald-50/60',
  4: 'bg-orange-50/60',
  5: 'bg-yellow-50/60',
  6: 'bg-teal-50/60',
  7: 'bg-stone-50/60',
  8: 'bg-pink-50/60',
  9: 'bg-fuchsia-50/60',
  10: 'bg-orange-50/60',
  11: 'bg-amber-50/60',
  12: 'bg-rose-50/60',
};

export default function ConsumerApp() {
  const [screen, setScreen] = useState<Screen>('hero');
  const [selectedMonth, setSelectedMonth] = useState(1);
  const [detailWeek, setDetailWeek] = useState<number | null>(null);

  const currentMonthData = useMemo(
    () => monthMeta.find((m) => m.monthNumber === selectedMonth)!,
    [selectedMonth],
  );

  const currentWeeks = useMemo(
    () => weekMeta.filter((w) => w.monthNumber === selectedMonth),
    [selectedMonth],
  );

  const oilProfile = useMemo(
    () => monthOilProfiles[selectedMonth],
    [selectedMonth],
  );

  const detailWeekData = useMemo(
    () => (detailWeek ? weekMeta.find((w) => w.weekNumber === detailWeek) : null),
    [detailWeek],
  );

  const goToCalendar = (month?: number) => {
    if (month) setSelectedMonth(month);
    setScreen('calendar');
    setDetailWeek(null);
  };

  const goToDetail = (weekNum: number) => {
    setDetailWeek(weekNum);
    setScreen('detail');
  };

  const goBack = () => {
    if (screen === 'detail') {
      setScreen('calendar');
      setDetailWeek(null);
    } else if (screen === 'calendar') {
      setScreen('hero');
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-800" style={{ fontFamily: "'Noto Serif TC', 'Inter', serif" }}>
      <AnimatePresence mode="wait">
        {screen === 'hero' && (
          <HeroScreen
            key="hero"
            firstWeek={weekMeta[0]}
            onEnter={() => goToCalendar(1)}
          />
        )}
        {screen === 'calendar' && (
          <CalendarScreen
            key="calendar"
            selectedMonth={selectedMonth}
            monthData={currentMonthData}
            weeks={currentWeeks}
            oilProfile={oilProfile}
            onSelectMonth={setSelectedMonth}
            onViewRecipe={goToDetail}
            onBack={goBack}
          />
        )}
        {screen === 'detail' && detailWeekData && (
          <DetailScreen
            key="detail"
            week={detailWeekData}
            oilProfile={oilProfile}
            onBack={goBack}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Hero Screen ─── */
function HeroScreen({ firstWeek, onEnter }: { firstWeek: WeekBlock; onEnter: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      className="min-h-screen flex flex-col items-center justify-center px-6 py-16"
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.8 }}
        className="text-center max-w-lg"
      >
        <p className="text-stone-400 text-sm tracking-[0.3em] uppercase mb-6">下班隨手作</p>
        <h1 className="text-3xl md:text-4xl font-bold text-stone-800 leading-snug mb-4">
          2027 即時共鳴<br />香氛日曆
        </h1>
        <p className="text-stone-500 text-lg mb-12">
          52週，用香氣陪你走過每一個情緒
        </p>

        {/* Current week preview card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 mb-10 shadow-[0_2px_20px_rgba(0,0,0,0.04)]"
        >
          <p className="text-stone-400 text-xs tracking-widest mb-2">第 {firstWeek.weekNumber} 週 — {firstWeek.monthName}</p>
          <p className="text-2xl font-semibold text-stone-700 mb-2">「{firstWeek.weekTheme}」</p>
          <p className="text-stone-500 text-sm">{firstWeek.dateRange}</p>
          <p className="text-stone-400 text-sm mt-3 italic">{firstWeek.intro}</p>
        </motion.div>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
          onClick={onEnter}
          className="group inline-flex items-center gap-2 px-8 py-3.5 bg-stone-800 text-white rounded-full text-sm tracking-wide hover:bg-stone-700 transition-colors cursor-pointer"
        >
          進入今週
          <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
        </motion.button>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 0.5 }}
        className="mt-16 text-stone-300 text-xs tracking-widest"
      >
        FRAGRANCE CALENDAR 2027
      </motion.p>
    </motion.div>
  );
}

/* ─── Calendar Screen ─── */
function CalendarScreen({
  selectedMonth,
  monthData,
  weeks,
  oilProfile,
  onSelectMonth,
  onViewRecipe,
  onBack,
}: {
  selectedMonth: number;
  monthData: (typeof monthMeta)[0];
  weeks: WeekBlock[];
  oilProfile: MonthOilProfile;
  onSelectMonth: (m: number) => void;
  onViewRecipe: (w: number) => void;
  onBack: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen"
    >
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#FAF8F5]/90 backdrop-blur-md border-b border-stone-100">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-1 text-stone-400 hover:text-stone-600 text-sm transition-colors cursor-pointer">
            <ChevronLeft size={16} />
            首頁
          </button>
          <p className="text-xs tracking-[0.2em] text-stone-400">2027 香氛日曆</p>
          <div className="w-16" />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col md:flex-row gap-6">
        {/* Month nav sidebar */}
        <aside className="md:w-48 shrink-0">
          <div className="md:sticky md:top-20">
            <p className="text-xs text-stone-400 tracking-widest mb-3 px-1">月份</p>
            {/* Mobile: horizontal scroll, Desktop: vertical list */}
            <div className="flex md:flex-col gap-1.5 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
              {monthMeta.map((m) => (
                <button
                  key={m.monthNumber}
                  onClick={() => onSelectMonth(m.monthNumber)}
                  className={`shrink-0 text-left px-3 py-2 rounded-xl text-sm transition-all cursor-pointer ${
                    selectedMonth === m.monthNumber
                      ? 'bg-stone-800 text-white shadow-sm'
                      : 'text-stone-500 hover:bg-stone-100'
                  }`}
                >
                  <span className="font-medium">{m.monthName}</span>
                  <span className={`ml-2 text-xs ${selectedMonth === m.monthNumber ? 'text-stone-300' : 'text-stone-400'}`}>
                    {m.monthTheme}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedMonth}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              {/* Month header */}
              <div className={`rounded-2xl bg-gradient-to-br ${monthAccent[selectedMonth]} p-6 md:p-8 mb-6`}>
                <p className="text-stone-400 text-xs tracking-widest mb-1">{monthData.monthName} — 月主題</p>
                <h2 className="text-2xl md:text-3xl font-bold text-stone-800 mb-2">{monthData.monthTheme}</h2>
                <p className="text-stone-500 italic">{monthData.intro}</p>
                <div className="mt-4 flex items-center gap-2">
                  <Leaf size={14} className="text-stone-400" />
                  <span className="text-sm text-stone-500">
                    本月精油：
                    <span className="font-semibold text-stone-700">{oilProfile.oilName}</span>
                    <span className="text-stone-400 ml-1">{oilProfile.oilNameEn}</span>
                  </span>
                  {!oilProfile.available && (
                    <span className="text-xs bg-stone-200/60 text-stone-500 px-2 py-0.5 rounded-full">規劃中</span>
                  )}
                </div>
              </div>

              {/* Week cards */}
              <div className="space-y-4">
                {weeks.map((week, i) => {
                  const oil = weekOilData[week.weekNumber];
                  const hasRecipe = oil && oil.recipe;
                  return (
                    <motion.div
                      key={week.weekNumber}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06, duration: 0.4 }}
                      className={`group bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-[0_1px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_24px_rgba(0,0,0,0.07)] transition-all duration-300 hover:-translate-y-0.5 ${monthSoftColor[selectedMonth]}`}
                    >
                      <div className="flex flex-col md:flex-row md:items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-xs text-stone-400 tracking-wider">W{week.weekNumber}</span>
                            <span className="text-xs text-stone-300">{week.dateRange}</span>
                          </div>
                          <h3 className="text-xl font-semibold text-stone-800 mb-1">「{week.weekTheme}」</h3>

                          {oil ? (
                            <>
                              <p className="text-lg text-stone-600 font-medium mt-3">
                                <Droplets size={14} className="inline mr-1 text-stone-400" />
                                {oil.oilName}
                                {oil.recipe && (
                                  <span className="text-sm text-stone-400 font-normal ml-2">
                                    {oil.recipe.map((r) => `${r.name} ${r.drops}滴`).join(' + ')}
                                  </span>
                                )}
                              </p>
                              {oil.recipeNote && (
                                <p className="text-sm text-stone-400 italic mt-1">{oil.recipeNote}</p>
                              )}
                              {oil.weekCopy && (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
                                  {oil.weekCopy.family && (
                                    <CopyTag label="親情" text={oil.weekCopy.family} />
                                  )}
                                  {oil.weekCopy.love && (
                                    <CopyTag label="愛情" text={oil.weekCopy.love} />
                                  )}
                                  {oil.weekCopy.friend && (
                                    <CopyTag label="友情" text={oil.weekCopy.friend} />
                                  )}
                                  {oil.weekCopy.work && (
                                    <CopyTag label="薪情" text={oil.weekCopy.work} />
                                  )}
                                </div>
                              )}
                            </>
                          ) : !oilProfile.available ? (
                            <p className="text-sm text-stone-400 mt-3 italic">精油配方規劃中</p>
                          ) : null}
                        </div>

                        {(hasRecipe || oilProfile.available) && (
                          <button
                            onClick={() => goToDetailIfAvailable(week.weekNumber, oilProfile, onViewRecipe)}
                            className="shrink-0 self-start md:self-center px-4 py-2 text-sm text-stone-500 border border-stone-200 rounded-full hover:bg-stone-800 hover:text-white hover:border-stone-800 transition-all duration-300 cursor-pointer"
                          >
                            查看配方
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </motion.div>
  );
}

function goToDetailIfAvailable(weekNum: number, profile: MonthOilProfile, onView: (w: number) => void) {
  if (profile.available) {
    onView(weekNum);
  }
}

function CopyTag({ label, text }: { label: string; text: string }) {
  return (
    <div className="bg-white/60 rounded-lg p-2.5">
      <p className="text-[10px] text-stone-400 tracking-wider mb-0.5">{label}</p>
      <p className="text-xs text-stone-600 leading-relaxed">{text}</p>
    </div>
  );
}

/* ─── Detail Screen ─── */
function DetailScreen({
  week,
  oilProfile,
  onBack,
}: {
  week: WeekBlock;
  oilProfile: MonthOilProfile;
  onBack: () => void;
}) {
  const oil = weekOilData[week.weekNumber];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen"
    >
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#FAF8F5]/90 backdrop-blur-md border-b border-stone-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-1 text-stone-400 hover:text-stone-600 text-sm transition-colors cursor-pointer">
            <ChevronLeft size={16} />
            返回週曆
          </button>
          <p className="text-xs tracking-[0.2em] text-stone-400">W{week.weekNumber}</p>
          <div className="w-16" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
        {/* Week header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="mb-8"
        >
          <p className="text-stone-400 text-xs tracking-widest mb-2">
            第 {week.weekNumber} 週 — {week.monthName} — {week.dateRange}
          </p>
          <h2 className="text-2xl font-bold text-stone-800 mb-1">「{week.weekTheme}」</h2>
          <p className="text-stone-500 italic">{week.intro}</p>
        </motion.div>

        {/* Oil name */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className={`rounded-2xl bg-gradient-to-br ${monthAccent[week.monthNumber]} p-8 mb-6`}
        >
          <p className="text-stone-400 text-xs tracking-widest mb-2">本月精油</p>
          <h1 className="text-3xl md:text-4xl font-bold text-stone-800">{oilProfile.oilName}</h1>
          <p className="text-stone-500 text-lg mt-1">{oilProfile.oilNameEn}</p>
          {oilProfile.scent && (
            <p className="text-stone-500 mt-3 text-sm flex items-center gap-2">
              <Sparkles size={14} className="text-amber-400" />
              {oilProfile.scent}
            </p>
          )}
        </motion.div>

        {!oilProfile.available ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="bg-white/80 rounded-2xl p-8 text-center shadow-[0_1px_12px_rgba(0,0,0,0.03)]"
          >
            <Leaf size={32} className="mx-auto text-stone-300 mb-4" />
            <p className="text-stone-500 text-lg">精油配方規劃中</p>
            <p className="text-stone-400 text-sm mt-2">敬請期待完整配方與功效介紹</p>
          </motion.div>
        ) : (
          <div className="space-y-5">
            {/* Psychological effects */}
            <DetailCard
              delay={0.3}
              icon={<span className="text-lg">🧠</span>}
              title="心理功效"
            >
              <div className="flex flex-wrap gap-2">
                {oilProfile.psychological.map((p) => (
                  <span key={p} className="bg-amber-50 text-stone-600 text-sm px-3 py-1.5 rounded-full">
                    {p}
                  </span>
                ))}
              </div>
            </DetailCard>

            {/* Physiological effects */}
            <DetailCard
              delay={0.4}
              icon={<span className="text-lg">🫀</span>}
              title="生理功效"
            >
              <div className="flex flex-wrap gap-2">
                {oilProfile.physiological.map((p) => (
                  <span key={p} className="bg-rose-50 text-stone-600 text-sm px-3 py-1.5 rounded-full">
                    {p}
                  </span>
                ))}
              </div>
            </DetailCard>

            {/* This week's recipe */}
            <DetailCard
              delay={0.5}
              icon={<span className="text-lg">💧</span>}
              title="本週配方"
            >
              {oil?.recipe ? (
                <div className="space-y-2">
                  {oil.recipe.map((r) => (
                    <div key={r.name} className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0">
                      <span className="text-stone-700 font-medium">{r.name}</span>
                      <span className="text-stone-500">{r.drops} 滴</span>
                    </div>
                  ))}
                  <p className="text-xs text-stone-400 mt-3">
                    總計 {oil.recipe.reduce((sum, r) => sum + r.drops, 0)} 滴，建議以 10ml 基底油稀釋
                  </p>
                </div>
              ) : (
                <p className="text-stone-400 italic">
                  {oil?.recipeNote || '本週無特定配方'}
                </p>
              )}
            </DetailCard>

            {/* Pairings */}
            <DetailCard
              delay={0.6}
              icon={<span className="text-lg">🌿</span>}
              title="搭配建議"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {oilProfile.pairings.map((p) => (
                  <div key={p.name} className="flex items-center gap-3 bg-emerald-50/50 rounded-xl p-3">
                    <Leaf size={14} className="text-emerald-400 shrink-0" />
                    <div>
                      <p className="text-stone-700 text-sm font-medium">{p.name}</p>
                      <p className="text-stone-400 text-xs">{p.effect}</p>
                    </div>
                  </div>
                ))}
              </div>
            </DetailCard>

            {/* Week copy */}
            {oil?.weekCopy && (
              <DetailCard
                delay={0.65}
                icon={<Heart size={18} className="text-rose-400" />}
                title="本週文案"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {oil.weekCopy.family && (
                    <QuoteCard label="親情" text={oil.weekCopy.family} />
                  )}
                  {oil.weekCopy.love && (
                    <QuoteCard label="愛情" text={oil.weekCopy.love} />
                  )}
                  {oil.weekCopy.friend && (
                    <QuoteCard label="友情" text={oil.weekCopy.friend} />
                  )}
                  {oil.weekCopy.work && (
                    <QuoteCard label="薪情" text={oil.weekCopy.work} />
                  )}
                </div>
              </DetailCard>
            )}

            {/* Caution */}
            {oilProfile.caution && (
              <DetailCard
                delay={0.7}
                icon={<AlertTriangle size={18} className="text-amber-500" />}
                title="使用注意事項"
              >
                <p className="text-stone-500 text-sm">{oilProfile.caution}</p>
              </DetailCard>
            )}
          </div>
        )}

        {/* Back to calendar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="mt-12 text-center"
        >
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-stone-400 hover:text-stone-600 text-sm transition-colors cursor-pointer"
          >
            <ChevronLeft size={14} />
            返回週曆
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}

function DetailCard({
  delay,
  icon,
  title,
  children,
}: {
  delay: number;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-[0_1px_12px_rgba(0,0,0,0.03)]"
    >
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h3 className="text-stone-700 font-semibold">{title}</h3>
      </div>
      {children}
    </motion.div>
  );
}

function QuoteCard({ label, text }: { label: string; text: string }) {
  return (
    <div className="bg-stone-50/80 rounded-xl p-3.5">
      <p className="text-[10px] text-stone-400 tracking-wider mb-1">{label}</p>
      <p className="text-sm text-stone-600 leading-relaxed">{text}</p>
    </div>
  );
}
