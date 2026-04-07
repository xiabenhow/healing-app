// ============================================================
// 療癒音景引擎 Soundscape Engine
// 「不吵、耐聽、有呼吸感」的自然音景系統
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';

// ===================== TYPES =====================

export type ScapeCategory = 'ocean' | 'forest' | 'rain' | 'night' | 'focus' | 'morning' | 'crystal' | 'breathing' | 'scene';

// ===================== SCENE MODE 情境模式 =====================

export interface SceneMode {
  key: string;
  label: string;
  subtitle: string;
  emoji: string;
  color: string;
  /** 這個情境包含的音景 preset keys（按順序自動播放） */
  presetKey: string;
  /** 適合的使用場景標籤 */
  tags: string[];
  /** 是否有番茄鐘功能 */
  hasPomodoro?: boolean;
  /** 番茄鐘分鐘數（預設 25） */
  pomodoroMinutes?: number;
  /** 番茄鐘休息分鐘數（預設 5） */
  pomodoroBreakMinutes?: number;
}

export const SCENE_MODES: SceneMode[] = [
  {
    key: 'scene-library',
    label: '圖書館',
    subtitle: '安靜沉浸，不被打擾的閱讀空間',
    emoji: '📚',
    color: '#8B7355',
    presetKey: 'scene-library',
    tags: ['閱讀', '專注', '安靜'],
  },
  {
    key: 'scene-cafe',
    label: '咖啡廳專注',
    subtitle: '有人陪伴但不被打擾，溫暖的背景音',
    emoji: '☕',
    color: '#B09070',
    presetKey: 'scene-cafe-focus',
    tags: ['工作', '專注', '陪伴'],
  },
  {
    key: 'scene-pomodoro',
    label: '番茄鐘專注',
    subtitle: '極簡深度專注，25 分鐘心無旁騖',
    emoji: '🍅',
    color: '#E07A5F',
    presetKey: 'scene-pomodoro',
    tags: ['專注', '計時', '極簡'],
    hasPomodoro: true,
    pomodoroMinutes: 25,
    pomodoroBreakMinutes: 5,
  },
  {
    key: 'scene-rainy-reading',
    label: '雨天閱讀',
    subtitle: '窗外下著雨，手邊一杯茶，放鬆又專注',
    emoji: '🌧️',
    color: '#7B8FA3',
    presetKey: 'scene-rainy-reading',
    tags: ['放鬆', '閱讀', '雨天'],
  },
  {
    key: 'scene-late-night',
    label: '深夜書房',
    subtitle: '夜深了，世界安靜下來，只剩你和思緒',
    emoji: '🌙',
    color: '#3D3560',
    presetKey: 'scene-late-night',
    tags: ['深夜', '安靜', '沉思'],
  },
  {
    key: 'scene-crafting',
    label: '手作時光',
    subtitle: '進入 flow 狀態，專注在手中的作品',
    emoji: '🎨',
    color: '#D4956B',
    presetKey: 'scene-crafting',
    tags: ['手作', '創作', 'flow'],
  },
];

// 呼吸模式介面 — 用於引導式呼吸音景
export interface BreathingPattern {
  inhale: number;     // 吸氣秒數
  hold: number;       // 停頓秒數
  exhale: number;     // 吐氣秒數
  holdAfter?: number; // 吐氣後停頓秒數
  label: string;      // 呼吸模式名稱
}

export interface ScapePreset {
  key: string;
  category: ScapeCategory;
  label: string;
  subtitle: string;
  emoji: string;
  color: string;
  /** 建議的整體 gain */
  defaultGain: number;
  /** 各層參數 */
  layers: LayerConfig[];
  /** low-pass cutoff */
  lpfCutoff: number;
  /** 呼吸調變週期（秒） */
  breathCycle: [number, number]; // [min, max]
  /** 呼吸深度 0~1 */
  breathDepth: number;
  /** 微事件間隔（秒）[min,max] */
  microInterval: [number, number];
  /** 能否當主音景 */
  isMain: boolean;
  /** 潮汐週期（秒）— 大週期 gain/filter ramp，模擬海潮漲退 */
  tidalCycle?: number;
  /** 潮汐深度 0~1 — gain 波動幅度 */
  tidalDepth?: number;
  /** 微事件類型：不同場景有不同的隨機音效 */
  microEventType?: 'wave-crash' | 'thunder-crack' | 'bird-call' | 'twig-snap' | 'rain-gust' | 'whoosh' | 'cafe-clink' | 'night-wave' | 'wind-howl';
  /** 呼吸同步模式 — 用於引導式呼吸 */
  breathingPattern?: BreathingPattern;
  /** 是否有節奏脈衝（能量類用） */
  hasPulse?: boolean;
  /** 極簡模式（冥想類用） */
  isMinimal?: boolean;
  /** 是否啟用呼吸引導音效 */
  guidedBreathing?: boolean;
}

export interface LayerConfig {
  type: 'brown' | 'pink' | 'white' | 'sine-wave' | 'custom';
  /** 相對音量 0~1 */
  gain: number;
  /** buffer 秒數（不同長度避免 loop 同步） */
  bufferSec: number;
  /** filter chain */
  filters: FilterSpec[];
  /** 用於 sine-wave 和 custom */
  params?: Record<string, number>;
  /** 自訂 buffer 填充函數名 */
  generator?: string;
  /** 立體聲寬度：0=單聲道，1=完全獨立左右 */
  stereoWidth?: number;
}

interface FilterSpec {
  type: BiquadFilterType;
  frequency: number;
  Q?: number;
  gain?: number;
}

// ===================== PRESETS =====================

export const SCAPE_PRESETS: ScapePreset[] = [
  // --- 海潮安放 —— 根本性重做，讓四種各有獨特聲音特徵 ---
  {
    key: 'ocean-far',
    category: 'ocean',
    label: '遠岸海潮',
    subtitle: '在海邊小屋裡，聽遠方的深海低鳴與浪聲',
    emoji: '🌊',
    color: '#7BAFD4',
    defaultGain: 0.35,
    lpfCutoff: 2200,
    breathCycle: [14, 20],
    breathDepth: 0.4,
    microInterval: [60, 120],
    isMain: true,
    microEventType: 'wave-crash',
    tidalCycle: 90,
    tidalDepth: 0.3,
    layers: [
      // 深海低鳴：極低頻的嗡嗡聲，像大海深處的共振
      { type: 'custom', gain: 0.35, bufferSec: 25, generator: 'deep-ocean-drone', filters: [{ type: 'lowpass', frequency: 150, Q: 0.7 }], stereoWidth: 0.8 },
      // 浪聲（中低頻）
      { type: 'brown', gain: 0.4, bufferSec: 20, filters: [{ type: 'lowpass', frequency: 400, Q: 0.7 }], stereoWidth: 0.7 },
      // 遠方海鷗
      { type: 'custom', gain: 0.06, bufferSec: 18, generator: 'seabird', filters: [{ type: 'bandpass', frequency: 2000, Q: 1.5 }], stereoWidth: 0.6 },
    ],
  },
  {
    key: 'ocean-night',
    category: 'ocean',
    label: '夜晚海潮',
    subtitle: '非常安靜，只有柔和浪聲與遠方船笛',
    emoji: '🌙',
    color: '#4A6FA5',
    defaultGain: 0.3,
    lpfCutoff: 1200,
    breathCycle: [16, 24],
    breathDepth: 0.3,
    microInterval: [90, 150],
    isMain: true,
    microEventType: 'night-wave',
    tidalCycle: 75,
    tidalDepth: 0.35,
    layers: [
      // 夜浪：超級柔和的浪聲，帶有遠方船笛
      { type: 'custom', gain: 0.45, bufferSec: 28, generator: 'night-surf', filters: [{ type: 'lowpass', frequency: 350, Q: 0.5 }], stereoWidth: 0.75 },
      // 極低頻墊底
      { type: 'brown', gain: 0.25, bufferSec: 22, filters: [{ type: 'lowpass', frequency: 200, Q: 0.4 }], stereoWidth: 0.7 },
      // 溫柔的風
      { type: 'custom', gain: 0.04, bufferSec: 16, generator: 'wind-gentle', filters: [{ type: 'lowpass', frequency: 800, Q: 0.3 }], stereoWidth: 0.6 },
    ],
  },
  {
    key: 'ocean-overcast',
    category: 'ocean',
    label: '陰天海潮',
    subtitle: '風很大、浪很急、有風嘯，像暴風雨前的寧靜',
    emoji: '🌫️',
    color: '#8B9DAF',
    defaultGain: 0.35,
    lpfCutoff: 2500,
    breathCycle: [10, 16],
    breathDepth: 0.35,
    microInterval: [40, 80],
    isMain: true,
    microEventType: 'wave-crash',
    tidalCycle: 50,
    tidalDepth: 0.4,
    layers: [
      // 海風呼嘯：比 wind-gentle 更有海邊感，帶有中頻突出
      { type: 'custom', gain: 0.35, bufferSec: 12, generator: 'sea-wind', filters: [{ type: 'bandpass', frequency: 1500, Q: 0.4 }], stereoWidth: 0.8 },
      // 急浪
      { type: 'brown', gain: 0.4, bufferSec: 10, filters: [{ type: 'bandpass', frequency: 600, Q: 0.6 }], stereoWidth: 0.75 },
      // 碎石浪：浪退時拉著小石頭的沙沙聲
      { type: 'custom', gain: 0.22, bufferSec: 16, generator: 'pebble-wash', filters: [{ type: 'bandpass', frequency: 2000, Q: 0.5 }], stereoWidth: 0.7 },
      // 浪花白噪音
      { type: 'pink', gain: 0.12, bufferSec: 8, filters: [{ type: 'highpass', frequency: 2500, Q: 0.4 }], stereoWidth: 0.6 },
    ],
  },
  {
    key: 'ocean-sunny',
    category: 'ocean',
    label: '晴日海潮',
    subtitle: '明亮歡快，有陽光折射水面的閃爍感',
    emoji: '☀️',
    color: '#E8B86D',
    defaultGain: 0.32,
    lpfCutoff: 3800,
    breathCycle: [8, 14],
    breathDepth: 0.2,
    microInterval: [30, 70],
    isMain: true,
    microEventType: 'wave-crash',
    tidalCycle: 45,
    tidalDepth: 0.25,
    layers: [
      // 浪
      { type: 'brown', gain: 0.3, bufferSec: 9, filters: [{ type: 'lowpass', frequency: 500, Q: 0.7 }], stereoWidth: 0.7 },
      // 陽光水面閃爍：高頻小亮點，像陽光折射
      { type: 'custom', gain: 0.25, bufferSec: 20, generator: 'sparkle-water', filters: [{ type: 'bandpass', frequency: 4500, Q: 0.8 }], stereoWidth: 0.8 },
      // 淺灘碎浪
      { type: 'custom', gain: 0.2, bufferSec: 14, generator: 'pebble-wash', filters: [{ type: 'bandpass', frequency: 2500, Q: 0.4 }], stereoWidth: 0.7 },
      // 海鷗
      { type: 'custom', gain: 0.08, bufferSec: 18, generator: 'seabird', filters: [{ type: 'bandpass', frequency: 3000, Q: 1.2 }], stereoWidth: 0.6 },
    ],
  },

  // --- 森林呼吸 —— 加入深處蟲鳴鳥叫 ---
  {
    key: 'forest-breath',
    category: 'forest',
    label: '森林呼吸',
    subtitle: '樹葉在耳邊輕輕說話，深處有蟲鳴鳥叫',
    emoji: '🌲',
    color: '#6B8F71',
    defaultGain: 0.3,
    lpfCutoff: 3000,
    breathCycle: [12, 18],
    breathDepth: 0.35,
    microInterval: [20, 60],
    isMain: true,
    microEventType: 'twig-snap',
    layers: [
      { type: 'custom', gain: 0.25, bufferSec: 12, generator: 'wind-gentle', filters: [{ type: 'bandpass', frequency: 600, Q: 0.3 }], stereoWidth: 0.7 },
      { type: 'custom', gain: 0.12, bufferSec: 8, generator: 'rustle', filters: [{ type: 'highpass', frequency: 400 }], stereoWidth: 0.6 },
      { type: 'custom', gain: 0.15, bufferSec: 20, generator: 'jungle-deep', filters: [{ type: 'bandpass', frequency: 1500, Q: 0.8 }], stereoWidth: 0.75 },
      { type: 'custom', gain: 0.08, bufferSec: 18, generator: 'birdsong', filters: [{ type: 'bandpass', frequency: 2500, Q: 1 }], stereoWidth: 0.65 },
    ],
  },

  // --- 雨夜包覆 —— 加入屋簷雨滴，增強室內聽雨感 ---
  {
    key: 'rain-night',
    category: 'rain',
    label: '雨夜包覆',
    subtitle: '被雨聲輕輕蓋住，屋簷滴答滴答，什麼都不用想',
    emoji: '🌧️',
    color: '#7B8FA3',
    defaultGain: 0.33,
    lpfCutoff: 3500,
    breathCycle: [15, 22],
    breathDepth: 0.35,
    microInterval: [40, 90],
    isMain: true,
    microEventType: 'rain-gust',
    layers: [
      { type: 'custom', gain: 0.35, bufferSec: 15, generator: 'rain-base', filters: [{ type: 'bandpass', frequency: 5000, Q: 0.3 }], stereoWidth: 0.7 },
      { type: 'brown', gain: 0.15, bufferSec: 10, filters: [{ type: 'lowpass', frequency: 500 }], stereoWidth: 0.6 },
      { type: 'custom', gain: 0.12, bufferSec: 14, generator: 'rain-droplet', filters: [{ type: 'highpass', frequency: 3000 }], stereoWidth: 0.65 },
      { type: 'custom', gain: 0.08, bufferSec: 12, generator: 'eave-drip', filters: [{ type: 'bandpass', frequency: 2000, Q: 0.6 }], stereoWidth: 0.7 },
    ],
  },

  // --- 深夜沉靜 —— 加入深海低頻版本作為底噪 ---
  {
    key: 'deep-night',
    category: 'night',
    label: '深夜沉靜',
    subtitle: '世界睡著了，極低頻嗡嗡聲像遠方的脈搏',
    emoji: '✨',
    color: '#5C5478',
    defaultGain: 0.22,
    lpfCutoff: 1500,
    breathCycle: [18, 28],
    breathDepth: 0.45,
    microInterval: [90, 180],
    isMain: true,
    microEventType: 'whoosh',
    layers: [
      { type: 'brown', gain: 0.4, bufferSec: 15, filters: [{ type: 'lowpass', frequency: 200, Q: 0.3 }], stereoWidth: 0.7 },
      { type: 'custom', gain: 0.15, bufferSec: 20, generator: 'deep-ocean-drone', filters: [{ type: 'lowpass', frequency: 120, Q: 0.5 }], stereoWidth: 0.8 },
      { type: 'custom', gain: 0.08, bufferSec: 20, generator: 'crickets', filters: [{ type: 'bandpass', frequency: 4000, Q: 2 }], stereoWidth: 0.6 },
    ],
  },

  // --- 專注陪伴 ---
  {
    key: 'focus',
    category: 'focus',
    label: '專注陪伴',
    subtitle: '不打擾你，只是安靜地在旁邊',
    emoji: '🤍',
    color: '#A8A0B0',
    defaultGain: 0.2,
    lpfCutoff: 2000,
    breathCycle: [20, 30],
    breathDepth: 0.1,
    microInterval: [120, 240],
    isMain: true,
    microEventType: 'whoosh',
    layers: [
      { type: 'pink', gain: 0.6, bufferSec: 8, filters: [{ type: 'lowpass', frequency: 1500, Q: 0.4 }], stereoWidth: 0.65 },
      { type: 'brown', gain: 0.3, bufferSec: 12, filters: [{ type: 'lowpass', frequency: 400 }], stereoWidth: 0.6 },
    ],
  },

  // --- 晨光清醒 ---
  {
    key: 'morning',
    category: 'morning',
    label: '晨光清醒',
    subtitle: '像被清晨的光慢慢叫醒',
    emoji: '🌅',
    color: '#E8C47C',
    defaultGain: 0.28,
    lpfCutoff: 4000,
    breathCycle: [8, 12],
    breathDepth: 0.15,
    microInterval: [15, 40],
    isMain: true,
    microEventType: 'bird-call',
    layers: [
      { type: 'custom', gain: 0.2, bufferSec: 7, generator: 'wind-gentle', filters: [{ type: 'bandpass', frequency: 800, Q: 0.3 }], stereoWidth: 0.7 },
      { type: 'custom', gain: 0.25, bufferSec: 14, generator: 'birdsong', filters: [{ type: 'bandpass', frequency: 3000, Q: 1.2 }], stereoWidth: 0.75 },
      { type: 'custom', gain: 0.12, bufferSec: 10, generator: 'stream', filters: [{ type: 'bandpass', frequency: 2000, Q: 0.5 }], stereoWidth: 0.7 },
    ],
  },

  // --- 輔助音景（isMain = false）---
  {
    key: 'aux-fire',
    category: 'night',
    label: '柴火溫度',
    subtitle: '劈哩啪啦的柴火聲，溫暖又真實',
    emoji: '🔥',
    color: '#D4956B',
    defaultGain: 0.28,
    lpfCutoff: 5000,
    breathCycle: [20, 30],
    breathDepth: 0.05,
    microInterval: [5, 15],
    isMain: false,
    microEventType: 'twig-snap',
    layers: [
      { type: 'custom', gain: 0.7, bufferSec: 10, generator: 'fireplace', filters: [{ type: 'lowpass', frequency: 5000 }], stereoWidth: 0.75 },
      { type: 'custom', gain: 0.4, bufferSec: 7, generator: 'fireplace', filters: [{ type: 'highpass', frequency: 800 }, { type: 'lowpass', frequency: 4000 }], stereoWidth: 0.85 },
    ],
  },
  {
    key: 'aux-stream',
    category: 'forest',
    label: '溪流低語',
    subtitle: '小溪嘩嘩流過石頭的水聲',
    emoji: '💧',
    color: '#7BB5B0',
    defaultGain: 0.30,
    lpfCutoff: 5000,
    breathCycle: [10, 16],
    breathDepth: 0.08,
    microInterval: [10, 25],
    isMain: false,
    microEventType: 'bird-call',
    layers: [
      { type: 'custom' as const, gain: 0.65, bufferSec: 14, generator: 'stream', filters: [{ type: 'bandpass' as BiquadFilterType, frequency: 2500, Q: 0.25 }], stereoWidth: 0.9 },
      { type: 'custom' as const, gain: 0.35, bufferSec: 9, generator: 'stream', filters: [{ type: 'highpass' as BiquadFilterType, frequency: 1200 }, { type: 'lowpass' as BiquadFilterType, frequency: 5000 }], stereoWidth: 0.8 },
      { type: 'pink' as const, gain: 0.12, bufferSec: 6, filters: [{ type: 'bandpass' as BiquadFilterType, frequency: 4000, Q: 0.35 }], stereoWidth: 0.7 },
    ],
  },
  {
    key: 'aux-raindrop',
    category: 'rain',
    label: '水滴雨聲',
    subtitle: '清脆密集的水滴落下，像窗外的小雨',
    emoji: '🫧',
    color: '#8AAED6',
    defaultGain: 0.25,
    lpfCutoff: 6000,
    breathCycle: [15, 22],
    breathDepth: 0.06,
    microInterval: [15, 35],
    isMain: false,
    microEventType: 'rain-gust',
    layers: [
      { type: 'custom' as const, gain: 0.7, bufferSec: 12, generator: 'raindrop-dense', filters: [{ type: 'highpass' as BiquadFilterType, frequency: 600 }, { type: 'lowpass' as BiquadFilterType, frequency: 6000 }], stereoWidth: 0.95 },
      { type: 'custom' as const, gain: 0.25, bufferSec: 8, generator: 'raindrop-dense', filters: [{ type: 'bandpass' as BiquadFilterType, frequency: 3500, Q: 0.3 }], stereoWidth: 0.8 },
    ],
  },
  {
    key: 'aux-wind',
    category: 'forest',
    label: '微風路過',
    subtitle: '帶走多餘的念頭',
    emoji: '🍃',
    color: '#A8C4A0',
    defaultGain: 0.12,
    lpfCutoff: 2500,
    breathCycle: [10, 16],
    breathDepth: 0.2,
    microInterval: [30, 60],
    isMain: false,
    microEventType: 'whoosh',
    layers: [
      { type: 'custom', gain: 0.5, bufferSec: 7, generator: 'wind-gentle', filters: [{ type: 'bandpass', frequency: 700, Q: 0.3 }], stereoWidth: 0.65 },
    ],
  },

  // ===================== NEW PRESETS (Phase 2) =====================

  // --- 雷雨沉浸 —— 加入屋簷雨滴層 ---
  {
    key: 'thunderstorm',
    category: 'rain',
    label: '雷雨沉浸',
    subtitle: '遠方的雷聲像大地的心跳，屋簷雨滴滴答，反而讓人放下',
    emoji: '⛈️',
    color: '#6B7B8F',
    defaultGain: 0.38,
    lpfCutoff: 4000,
    breathCycle: [10, 16],
    breathDepth: 0.45,
    microInterval: [12, 30],
    isMain: true,
    microEventType: 'thunder-crack',
    layers: [
      { type: 'custom', gain: 0.3, bufferSec: 8, generator: 'rain-base', filters: [{ type: 'bandpass', frequency: 4500, Q: 0.3 }], stereoWidth: 0.7 },
      { type: 'brown', gain: 0.25, bufferSec: 14, filters: [{ type: 'lowpass', frequency: 250, Q: 0.4 }], stereoWidth: 0.6 },
      { type: 'custom', gain: 0.15, bufferSec: 6, generator: 'rain-droplet', filters: [{ type: 'highpass', frequency: 2500 }], stereoWidth: 0.65 },
      { type: 'custom', gain: 0.1, bufferSec: 10, generator: 'eave-drip', filters: [{ type: 'bandpass', frequency: 2000, Q: 0.6 }], stereoWidth: 0.7 },
      { type: 'custom', gain: 0.12, bufferSec: 40, generator: 'thunder', filters: [{ type: 'lowpass', frequency: 300, Q: 0.3 }], stereoWidth: 0.8 },
    ],
  },

  // --- 溪畔冥想 —— 左右 panning 明顯，溪水在左，鳥在右 ---
  {
    key: 'stream-meditation',
    category: 'forest',
    label: '溪畔冥想',
    subtitle: '溪水在左邊流，鳥在右邊叫，立體聲空間感十足',
    emoji: '🏞️',
    color: '#7BB5B0',
    defaultGain: 0.3,
    lpfCutoff: 3500,
    breathCycle: [14, 20],
    breathDepth: 0.18,
    microInterval: [25, 55],
    isMain: true,
    microEventType: 'bird-call',
    layers: [
      { type: 'custom', gain: 0.28, bufferSec: 11, generator: 'stream', filters: [{ type: 'bandpass', frequency: 2200, Q: 0.4 }], stereoWidth: 0.9 },
      { type: 'custom', gain: 0.18, bufferSec: 16, generator: 'birdsong', filters: [{ type: 'bandpass', frequency: 2800, Q: 1.0 }], stereoWidth: 0.85 },
      { type: 'custom', gain: 0.15, bufferSec: 9, generator: 'wind-gentle', filters: [{ type: 'bandpass', frequency: 500, Q: 0.3 }], stereoWidth: 0.8 },
      { type: 'custom', gain: 0.1, bufferSec: 14, generator: 'rustle', filters: [{ type: 'highpass', frequency: 350 }], stereoWidth: 0.75 },
    ],
  },

  // --- 午後花園 ---
  {
    key: 'afternoon-garden',
    category: 'morning',
    label: '午後花園',
    subtitle: '有蟲鳴、有微風，慵懶的午後時光',
    emoji: '🌻',
    color: '#D4B896',
    defaultGain: 0.26,
    lpfCutoff: 4500,
    breathCycle: [10, 15],
    breathDepth: 0.15,
    microInterval: [15, 40],
    isMain: true,
    microEventType: 'bird-call',
    layers: [
      { type: 'custom', gain: 0.15, bufferSec: 18, generator: 'crickets', filters: [{ type: 'bandpass', frequency: 4200, Q: 1.5 }], stereoWidth: 0.7 },
      { type: 'custom', gain: 0.18, bufferSec: 8, generator: 'wind-gentle', filters: [{ type: 'bandpass', frequency: 600, Q: 0.3 }], stereoWidth: 0.65 },
      { type: 'custom', gain: 0.12, bufferSec: 14, generator: 'birdsong', filters: [{ type: 'bandpass', frequency: 3200, Q: 1.0 }], stereoWidth: 0.75 },
      { type: 'custom', gain: 0.08, bufferSec: 10, generator: 'rustle', filters: [{ type: 'highpass', frequency: 500 }], stereoWidth: 0.6 },
    ],
  },

  // --- 星空無邊 ---
  {
    key: 'starlit',
    category: 'night',
    label: '星空無邊',
    subtitle: '最安靜的夜，只有風和遠方的蟲聲',
    emoji: '🌌',
    color: '#3D3560',
    defaultGain: 0.2,
    lpfCutoff: 1800,
    breathCycle: [20, 30],
    breathDepth: 0.3,
    microInterval: [100, 200],
    isMain: true,
    microEventType: 'whoosh',
    layers: [
      { type: 'brown', gain: 0.4, bufferSec: 16, filters: [{ type: 'lowpass', frequency: 180, Q: 0.3 }], stereoWidth: 0.65 },
      { type: 'custom', gain: 0.06, bufferSec: 22, generator: 'crickets', filters: [{ type: 'bandpass', frequency: 4500, Q: 2 }], stereoWidth: 0.7 },
      { type: 'custom', gain: 0.08, bufferSec: 12, generator: 'wind-gentle', filters: [{ type: 'lowpass', frequency: 400, Q: 0.2 }], stereoWidth: 0.6 },
    ],
  },

  // --- 咖啡廳日常 —— 增加更多層次 ---
  {
    key: 'cafe',
    category: 'focus',
    label: '咖啡廳日常',
    subtitle: '杯碟聲、人聲嗡嗡、遠處磨豆，層次豐富的專注環境',
    emoji: '☕',
    color: '#B09070',
    defaultGain: 0.22,
    lpfCutoff: 3000,
    breathCycle: [15, 25],
    breathDepth: 0.1,
    microInterval: [8, 25],
    isMain: true,
    microEventType: 'cafe-clink',
    layers: [
      { type: 'pink', gain: 0.28, bufferSec: 10, filters: [{ type: 'bandpass', frequency: 800, Q: 0.3 }], stereoWidth: 0.7 },
      { type: 'brown', gain: 0.18, bufferSec: 14, filters: [{ type: 'lowpass', frequency: 300 }], stereoWidth: 0.6 },
      { type: 'custom', gain: 0.12, bufferSec: 7, generator: 'cafe-murmur', filters: [{ type: 'bandpass', frequency: 1200, Q: 0.5 }], stereoWidth: 0.75 },
      { type: 'white', gain: 0.08, bufferSec: 12, filters: [{ type: 'bandpass', frequency: 3500, Q: 0.4 }], stereoWidth: 0.65 },
    ],
  },

  // --- 瀑布淨化 ---
  {
    key: 'waterfall',
    category: 'forest',
    label: '瀑布淨化',
    subtitle: '強大但溫柔的白噪音，洗去所有雜念',
    emoji: '🏔️',
    color: '#5A8B7A',
    defaultGain: 0.3,
    lpfCutoff: 5000,
    breathCycle: [8, 14],
    breathDepth: 0.12,
    microInterval: [60, 120],
    isMain: true,
    microEventType: 'whoosh',
    layers: [
      { type: 'white', gain: 0.25, bufferSec: 6, filters: [{ type: 'bandpass', frequency: 3000, Q: 0.3 }], stereoWidth: 0.7 },
      { type: 'pink', gain: 0.3, bufferSec: 9, filters: [{ type: 'bandpass', frequency: 1500, Q: 0.4 }], stereoWidth: 0.65 },
      { type: 'brown', gain: 0.35, bufferSec: 12, filters: [{ type: 'lowpass', frequency: 600, Q: 0.5 }], stereoWidth: 0.6 },
    ],
  },

  // --- 輔助：遠方雷聲 ---
  {
    key: 'aux-thunder',
    category: 'rain' as ScapeCategory,
    label: '遠方雷聲',
    subtitle: '偶爾的雷鳴，讓雨夜更有包覆感',
    emoji: '⚡',
    color: '#7B7FA3',
    defaultGain: 0.15,
    lpfCutoff: 1200,
    breathCycle: [25, 40],
    breathDepth: 0.15,
    microInterval: [15, 45],
    isMain: false,
    microEventType: 'thunder-crack' as const,
    layers: [
      // 低頻持續隆隆聲（遠方滾雷）
      { type: 'brown' as const, gain: 0.35, bufferSec: 15, filters: [{ type: 'lowpass' as BiquadFilterType, frequency: 150, Q: 0.4 }], stereoWidth: 0.8 },
      // 雷聲 buffer（明顯的雷鳴）
      { type: 'custom' as const, gain: 0.4, bufferSec: 30, generator: 'thunder', filters: [{ type: 'lowpass' as BiquadFilterType, frequency: 500, Q: 0.3 }], stereoWidth: 0.9 },
    ],
  },

  // --- 輔助：蟲鳴陪伴 ---
  {
    key: 'aux-insects',
    category: 'night',
    label: '蟲鳴陪伴',
    subtitle: '夏夜裡最熟悉的聲音',
    emoji: '🦗',
    color: '#7BA87B',
    defaultGain: 0.1,
    lpfCutoff: 5000,
    breathCycle: [15, 25],
    breathDepth: 0.08,
    microInterval: [20, 50],
    isMain: false,
    microEventType: 'whoosh',
    layers: [
      { type: 'custom', gain: 0.5, bufferSec: 18, generator: 'crickets', filters: [{ type: 'bandpass', frequency: 4500, Q: 1.5 }], stereoWidth: 0.7 },
    ],
  },

  // --- 輔助：清晨鳥叫聲 ---
  {
    key: 'aux-birds',
    category: 'morning' as ScapeCategory,
    label: '清晨鳥叫',
    subtitle: '知更鳥、畫眉、布穀鳥的合唱',
    emoji: '🐦',
    color: '#E8C47C',
    defaultGain: 0.12,
    lpfCutoff: 6000,
    breathCycle: [12, 18],
    breathDepth: 0.08,
    microInterval: [10, 30],
    isMain: false,
    microEventType: 'bird-call' as const,
    layers: [
      { type: 'custom' as const, gain: 0.5, bufferSec: 20, generator: 'dawn-chorus', filters: [{ type: 'bandpass' as BiquadFilterType, frequency: 3000, Q: 0.5 }], stereoWidth: 0.95 },
    ],
  },

  // ===================== 情境模式 SCENE MODE PRESETS =====================

  // --- 圖書館：安靜沉浸，翻書聲、遠處腳步、超低白噪音 ---
  {
    key: 'scene-library',
    category: 'scene' as ScapeCategory,
    label: '圖書館',
    subtitle: '安靜沉浸，不被打擾的閱讀空間',
    emoji: '📚',
    color: '#8B7355',
    defaultGain: 0.15,
    lpfCutoff: 1800,
    breathCycle: [25, 35],
    breathDepth: 0.08,
    microInterval: [30, 80],
    isMain: true,
    microEventType: 'whoosh' as const,
    layers: [
      // Base Layer: 圖書館空氣 — 極輕的棕噪音，像空調低頻底噪
      { type: 'brown' as const, gain: 0.35, bufferSec: 22, filters: [{ type: 'lowpass' as BiquadFilterType, frequency: 200, Q: 0.3 }], stereoWidth: 0.5 },
      // Texture Layer: 偶爾翻書沙沙（用 rustle 模擬）
      { type: 'custom' as const, gain: 0.04, bufferSec: 30, generator: 'page-turn', filters: [{ type: 'bandpass' as BiquadFilterType, frequency: 3000, Q: 0.5 }], stereoWidth: 0.7 },
      // Texture Layer: 遠處腳步
      { type: 'custom' as const, gain: 0.03, bufferSec: 25, generator: 'distant-footsteps', filters: [{ type: 'bandpass' as BiquadFilterType, frequency: 400, Q: 0.4 }], stereoWidth: 0.8 },
      // Breath Layer: 超低白噪音底色
      { type: 'white' as const, gain: 0.03, bufferSec: 18, filters: [{ type: 'lowpass' as BiquadFilterType, frequency: 800, Q: 0.3 }], stereoWidth: 0.4 },
    ],
  },

  // --- 咖啡廳專注：人聲嗡嗡、杯碟/鍵盤、悶笑聲、暖低頻 ---
  {
    key: 'scene-cafe-focus',
    category: 'scene' as ScapeCategory,
    label: '咖啡廳專注',
    subtitle: '有人陪伴但不被打擾，溫暖的背景音',
    emoji: '☕',
    color: '#B09070',
    defaultGain: 0.2,
    lpfCutoff: 2800,
    breathCycle: [18, 28],
    breathDepth: 0.1,
    microInterval: [10, 30],
    isMain: true,
    microEventType: 'cafe-clink' as const,
    layers: [
      // Base Layer: 低沉人聲嗡嗡（murmur）
      { type: 'custom' as const, gain: 0.3, bufferSec: 14, generator: 'cafe-murmur', filters: [{ type: 'bandpass' as BiquadFilterType, frequency: 800, Q: 0.3 }], stereoWidth: 0.75 },
      // Texture Layer: 杯碟鍵盤聲
      { type: 'pink' as const, gain: 0.12, bufferSec: 10, filters: [{ type: 'bandpass' as BiquadFilterType, frequency: 3500, Q: 0.4 }], stereoWidth: 0.65 },
      // Micro Event Layer: 偶爾的悶笑
      { type: 'custom' as const, gain: 0.04, bufferSec: 20, generator: 'cafe-murmur', filters: [{ type: 'bandpass' as BiquadFilterType, frequency: 1500, Q: 0.6 }], stereoWidth: 0.85 },
      // Breath Layer: 暖低頻底色
      { type: 'brown' as const, gain: 0.2, bufferSec: 16, filters: [{ type: 'lowpass' as BiquadFilterType, frequency: 250, Q: 0.3 }], stereoWidth: 0.5 },
    ],
  },

  // --- 番茄鐘專注：極簡穩定空氣感，幾乎無質感層 ---
  {
    key: 'scene-pomodoro',
    category: 'scene' as ScapeCategory,
    label: '番茄鐘專注',
    subtitle: '極簡深度專注，25 分鐘心無旁騖',
    emoji: '🍅',
    color: '#E07A5F',
    defaultGain: 0.12,
    lpfCutoff: 1500,
    breathCycle: [30, 45],
    breathDepth: 0.05,
    microInterval: [300, 600], // 幾乎不觸發微事件
    isMain: true,
    isMinimal: true,
    microEventType: 'whoosh' as const,
    layers: [
      // Base Layer: 穩定空氣流 — 極低頻的棕噪音
      { type: 'brown' as const, gain: 0.4, bufferSec: 20, filters: [{ type: 'lowpass' as BiquadFilterType, frequency: 180, Q: 0.3 }], stereoWidth: 0.4 },
      // Breath Layer: pink/brown 混合的極低底色
      { type: 'pink' as const, gain: 0.15, bufferSec: 15, filters: [{ type: 'lowpass' as BiquadFilterType, frequency: 400, Q: 0.3 }], stereoWidth: 0.5 },
    ],
  },

  // --- 雨天閱讀：穩定雨聲、窗滴/微風、偶爾遠方雷聲、低頻空氣感 ---
  {
    key: 'scene-rainy-reading',
    category: 'scene' as ScapeCategory,
    label: '雨天閱讀',
    subtitle: '窗外下著雨，手邊一杯茶，放鬆又專注',
    emoji: '🌧️',
    color: '#7B8FA3',
    defaultGain: 0.28,
    lpfCutoff: 3200,
    breathCycle: [14, 22],
    breathDepth: 0.2,
    microInterval: [45, 100],
    isMain: true,
    microEventType: 'thunder-crack' as const,
    tidalCycle: 80,
    tidalDepth: 0.15,
    layers: [
      // Base Layer: 穩定雨聲
      { type: 'custom' as const, gain: 0.35, bufferSec: 18, generator: 'rain-base', filters: [{ type: 'bandpass' as BiquadFilterType, frequency: 4000, Q: 0.3 }], stereoWidth: 0.7 },
      // Texture Layer: 窗戶雨滴
      { type: 'custom' as const, gain: 0.12, bufferSec: 14, generator: 'eave-drip', filters: [{ type: 'bandpass' as BiquadFilterType, frequency: 2000, Q: 0.5 }], stereoWidth: 0.75 },
      // Texture Layer: 微風
      { type: 'custom' as const, gain: 0.06, bufferSec: 10, generator: 'wind-gentle', filters: [{ type: 'bandpass' as BiquadFilterType, frequency: 500, Q: 0.3 }], stereoWidth: 0.6 },
      // Breath Layer: 低頻空氣底色
      { type: 'brown' as const, gain: 0.18, bufferSec: 22, filters: [{ type: 'lowpass' as BiquadFilterType, frequency: 200, Q: 0.3 }], stereoWidth: 0.5 },
    ],
  },

  // --- 深夜書房：夜晚空氣、蟲鳴/木頭聲、偶爾遠方車聲、深沉低頻 ---
  {
    key: 'scene-late-night',
    category: 'scene' as ScapeCategory,
    label: '深夜書房',
    subtitle: '夜深了，世界安靜下來，只剩你和思緒',
    emoji: '🌙',
    color: '#3D3560',
    defaultGain: 0.18,
    lpfCutoff: 1600,
    breathCycle: [20, 30],
    breathDepth: 0.15,
    microInterval: [60, 150],
    isMain: true,
    microEventType: 'whoosh' as const,
    layers: [
      // Base Layer: 夜晚空氣 — 深沉安靜的低頻
      { type: 'brown' as const, gain: 0.35, bufferSec: 24, filters: [{ type: 'lowpass' as BiquadFilterType, frequency: 160, Q: 0.3 }], stereoWidth: 0.6 },
      // Texture Layer: 遠方蟲鳴
      { type: 'custom' as const, gain: 0.06, bufferSec: 22, generator: 'crickets', filters: [{ type: 'bandpass' as BiquadFilterType, frequency: 4200, Q: 1.8 }], stereoWidth: 0.7 },
      // Texture Layer: 木頭嘎吱（老書房的聲音）
      { type: 'custom' as const, gain: 0.02, bufferSec: 30, generator: 'wood-creak', filters: [{ type: 'bandpass' as BiquadFilterType, frequency: 300, Q: 0.5 }], stereoWidth: 0.65 },
      // Breath Layer: 深沉低頻底色
      { type: 'custom' as const, gain: 0.08, bufferSec: 26, generator: 'deep-ocean-drone', filters: [{ type: 'lowpass' as BiquadFilterType, frequency: 100, Q: 0.4 }], stereoWidth: 0.5 },
    ],
  },

  // --- 手作時光：flow 狀態，溫暖空間感、微風、偶爾材料聲 ---
  {
    key: 'scene-crafting',
    category: 'scene' as ScapeCategory,
    label: '手作時光',
    subtitle: '進入 flow 狀態，專注在手中的作品',
    emoji: '🎨',
    color: '#D4956B',
    defaultGain: 0.2,
    lpfCutoff: 2500,
    breathCycle: [15, 22],
    breathDepth: 0.12,
    microInterval: [20, 50],
    isMain: true,
    microEventType: 'twig-snap' as const,
    layers: [
      // Base Layer: 溫暖空間底噪
      { type: 'pink' as const, gain: 0.25, bufferSec: 14, filters: [{ type: 'lowpass' as BiquadFilterType, frequency: 1200, Q: 0.3 }], stereoWidth: 0.6 },
      // Texture Layer: 輕微的材料沙沙（像拿布料、翻頁）
      { type: 'custom' as const, gain: 0.06, bufferSec: 18, generator: 'rustle', filters: [{ type: 'highpass' as BiquadFilterType, frequency: 500 }], stereoWidth: 0.65 },
      // Texture Layer: 微風從窗口進來
      { type: 'custom' as const, gain: 0.08, bufferSec: 10, generator: 'wind-gentle', filters: [{ type: 'bandpass' as BiquadFilterType, frequency: 600, Q: 0.3 }], stereoWidth: 0.7 },
      // Breath Layer: 低頻溫暖感
      { type: 'brown' as const, gain: 0.2, bufferSec: 20, filters: [{ type: 'lowpass' as BiquadFilterType, frequency: 300, Q: 0.3 }], stereoWidth: 0.5 },
    ],
  },

  // ===================== 呼吸同步 5 個 =====================
  {
    key: 'breath-478',
    category: 'breathing' as ScapeCategory,
    label: '4-7-8 放鬆呼吸',
    subtitle: '跟著聲音慢慢放鬆',
    emoji: '🫧',
    color: '#7BAFD4',
    defaultGain: 0.25,
    lpfCutoff: 1500,
    breathCycle: [19, 19], // 4+7+8=19 秒固定
    breathDepth: 0.6,
    microInterval: [120, 240],
    isMain: true,
    microEventType: 'whoosh' as const,
    guidedBreathing: true,
    breathingPattern: { inhale: 4, hold: 7, exhale: 8, label: '4-7-8 放鬆呼吸' },
    layers: [
      { type: 'custom' as const, gain: 0.4, bufferSec: 19, generator: 'breath-tone', filters: [{ type: 'lowpass' as BiquadFilterType, frequency: 800, Q: 0.5 }], stereoWidth: 0.6 },
      { type: 'brown' as const, gain: 0.25, bufferSec: 15, filters: [{ type: 'lowpass' as BiquadFilterType, frequency: 200, Q: 0.3 }], stereoWidth: 0.8 },
      { type: 'custom' as const, gain: 0.08, bufferSec: 20, generator: 'meditation-drone', filters: [{ type: 'lowpass' as BiquadFilterType, frequency: 150 }], stereoWidth: 0.5 },
    ],
  },
  {
    key: 'breath-calm',
    category: 'breathing' as ScapeCategory,
    label: '安心呼吸',
    subtitle: '一吸一吐，回到自己',
    emoji: '🌬️',
    color: '#D2B4A1',
    defaultGain: 0.25,
    lpfCutoff: 1800,
    breathCycle: [10, 10], // 4+1+5=10 秒
    breathDepth: 0.5,
    microInterval: [90, 180],
    isMain: true,
    microEventType: 'whoosh' as const,
    guidedBreathing: true,
    breathingPattern: { inhale: 4, hold: 1, exhale: 5, label: '安心呼吸' },
    layers: [
      { type: 'custom' as const, gain: 0.35, bufferSec: 10, generator: 'breath-tone', filters: [{ type: 'lowpass' as BiquadFilterType, frequency: 900, Q: 0.4 }], stereoWidth: 0.6 },
      { type: 'custom' as const, gain: 0.15, bufferSec: 14, generator: 'wind-gentle', filters: [{ type: 'bandpass' as BiquadFilterType, frequency: 500, Q: 0.3 }], stereoWidth: 0.9 },
      { type: 'brown' as const, gain: 0.2, bufferSec: 18, filters: [{ type: 'lowpass' as BiquadFilterType, frequency: 250 }], stereoWidth: 0.7 },
    ],
  },
  {
    key: 'breath-release',
    category: 'breathing' as ScapeCategory,
    label: '壓力釋放呼吸',
    subtitle: '把緊繃慢慢吐掉',
    emoji: '💨',
    color: '#A8A0B0',
    defaultGain: 0.28,
    lpfCutoff: 2000,
    breathCycle: [14, 14], // 3+2+6+3=14 秒
    breathDepth: 0.55,
    microInterval: [60, 120],
    isMain: true,
    microEventType: 'whoosh' as const,
    guidedBreathing: true,
    breathingPattern: { inhale: 3, hold: 2, exhale: 6, holdAfter: 3, label: '壓力釋放呼吸' },
    layers: [
      { type: 'custom' as const, gain: 0.35, bufferSec: 14, generator: 'breath-tone', filters: [{ type: 'lowpass' as BiquadFilterType, frequency: 700, Q: 0.5 }], stereoWidth: 0.6 },
      { type: 'pink' as const, gain: 0.15, bufferSec: 10, filters: [{ type: 'lowpass' as BiquadFilterType, frequency: 600, Q: 0.3 }], stereoWidth: 0.8 },
      { type: 'custom' as const, gain: 0.1, bufferSec: 16, generator: 'stream', filters: [{ type: 'bandpass' as BiquadFilterType, frequency: 1800, Q: 0.4 }], stereoWidth: 0.9 },
    ],
  },
  {
    key: 'breath-sleep',
    category: 'breathing' as ScapeCategory,
    label: '睡前呼吸',
    subtitle: '身體準備休息',
    emoji: '🌙',
    color: '#5C5478',
    defaultGain: 0.2,
    lpfCutoff: 1200,
    breathCycle: [16, 16], // 4+4+8=16 秒
    breathDepth: 0.5,
    microInterval: [120, 240],
    isMain: true,
    microEventType: 'whoosh' as const,
    guidedBreathing: true,
    breathingPattern: { inhale: 4, hold: 4, exhale: 8, label: '睡前呼吸' },
    layers: [
      { type: 'custom' as const, gain: 0.3, bufferSec: 16, generator: 'breath-tone', filters: [{ type: 'lowpass' as BiquadFilterType, frequency: 600, Q: 0.4 }], stereoWidth: 0.5 },
      { type: 'brown' as const, gain: 0.3, bufferSec: 20, filters: [{ type: 'lowpass' as BiquadFilterType, frequency: 150, Q: 0.3 }], stereoWidth: 0.8 },
      { type: 'custom' as const, gain: 0.05, bufferSec: 22, generator: 'crickets', filters: [{ type: 'bandpass' as BiquadFilterType, frequency: 4000, Q: 2 }], stereoWidth: 0.9 },
    ],
  },
  {
    key: 'breath-heartbeat',
    category: 'breathing' as ScapeCategory,
    label: '穩定心跳呼吸',
    subtitle: '心慢慢安靜下來',
    emoji: '❤️‍🩹',
    color: '#D4956B',
    defaultGain: 0.25,
    lpfCutoff: 1600,
    breathCycle: [12, 12], // 4+2+6=12 秒
    breathDepth: 0.45,
    microInterval: [90, 150],
    isMain: true,
    microEventType: 'whoosh' as const,
    guidedBreathing: true,
    breathingPattern: { inhale: 4, hold: 2, exhale: 6, label: '穩定心跳呼吸' },
    layers: [
      { type: 'custom' as const, gain: 0.3, bufferSec: 12, generator: 'breath-tone', filters: [{ type: 'lowpass' as BiquadFilterType, frequency: 750, Q: 0.4 }], stereoWidth: 0.6 },
      { type: 'custom' as const, gain: 0.12, bufferSec: 8, generator: 'low-pulse', filters: [{ type: 'lowpass' as BiquadFilterType, frequency: 120, Q: 0.5 }], stereoWidth: 0.4 },
      { type: 'custom' as const, gain: 0.15, bufferSec: 16, generator: 'wind-gentle', filters: [{ type: 'bandpass' as BiquadFilterType, frequency: 400, Q: 0.3 }], stereoWidth: 0.8 },
    ],
  },
];

// ===================== 情緒→音景 推薦 =====================

export const EMOTION_SCAPE_MAP: Record<string, string[]> = {
  'anxious': ['ocean-night', 'aux-stream'],
  'tired': ['forest-breath', 'aux-wind'],
  'low': ['ocean-sunny', 'aux-stream'],
  'lonely': ['rain-night', 'aux-fire'],
  'confused': ['forest-breath', 'aux-stream'],
  'restart': ['morning', 'aux-wind'],
  'calm': ['ocean-far'],
  'warm': ['ocean-sunny', 'aux-fire'],
  'energized': ['morning', 'aux-wind'],
  'wronged': ['rain-night', 'aux-fire'],
  'escape': ['deep-night'],
  'insecure': ['ocean-night', 'aux-fire'],
};

// 情緒 → 呼吸/能量/冥想 推薦映射
// 情緒到呼吸模式推薦對應表 — 只保留呼吸類
export const EMOTION_WELLNESS_MAP: Record<string, { breathing?: string }> = {
  'anxious':   { breathing: 'breath-478' },
  'tired':     { breathing: 'breath-calm' },
  'low':       { breathing: 'breath-calm' },
  'lonely':    { breathing: 'breath-calm' },
  'confused':  { breathing: 'breath-release' },
  'restart':   { breathing: 'breath-heartbeat' },
  'calm':      { breathing: 'breath-calm' },
  'warm':      { breathing: 'breath-calm' },
  'energized': { breathing: 'breath-heartbeat' },
  'wronged':   { breathing: 'breath-release' },
  'escape':    { breathing: 'breath-sleep' },
  'insecure':  { breathing: 'breath-heartbeat' },
};

// ===================== BUFFER GENERATORS =====================

function fillBrown(data: Float32Array) {
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const w = Math.random() * 2 - 1;
    data[i] = (last + 0.02 * w) / 1.02;
    last = data[i];
    data[i] *= 3.5;
  }
}

function fillPink(data: Float32Array) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < data.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
}

function fillWhite(data: Float32Array) {
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

function fillWindGentle(data: Float32Array, sr: number) {
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const slow = Math.sin(t * Math.PI * 2 / 8.5) * 0.35 + 0.5;
    const med = Math.sin(t * Math.PI * 2 / 3.1 + 1.2) * 0.2 + 0.5;
    const ultra = Math.sin(t * Math.PI * 2 / 19 + 0.7) * 0.25 + 0.5; // 超慢大週期
    // 偶爾的小陣風
    const gust = Math.random() > 0.998 ? (1.5 + Math.random()) : 1.0;
    data[i] = (Math.random() * 2 - 1) * slow * med * ultra * gust * 0.18;
  }
}

function fillWindStrong(data: Float32Array, sr: number) {
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const gust = Math.sin(t * Math.PI * 2 / 4) * 0.4 + 0.6;
    const turb = Math.sin(t * Math.PI * 2 / 1.1 + 0.7) * 0.3 + 0.5;
    data[i] = (Math.random() * 2 - 1) * gust * turb * 0.25;
  }
}

function fillRustle(data: Float32Array, sr: number) {
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const sway = Math.sin(t * Math.PI * 2 / 3.5) * 0.3 + 0.5;
    data[i] = (Math.random() * 2 - 1) * sway * 0.06;
  }
}

function fillBirdsong(data: Float32Array, sr: number) {
  // sparse chirps embedded in silence
  for (let i = 0; i < data.length; i++) data[i] = 0;
  const totalSec = data.length / sr;
  const chirpCount = Math.floor(totalSec / 3);
  for (let c = 0; c < chirpCount; c++) {
    const startSec = 1 + Math.random() * (totalSec - 2);
    const startIdx = Math.floor(startSec * sr);
    const freq = 2500 + Math.random() * 3000;
    const dur = Math.floor((0.04 + Math.random() * 0.08) * sr);
    for (let j = 0; j < dur && (startIdx + j) < data.length; j++) {
      const env = Math.sin(Math.PI * j / dur);
      data[startIdx + j] += Math.sin(2 * Math.PI * freq * j / sr) * env * 0.12;
      // add a quick freq sweep for realism
      const sweep = Math.sin(2 * Math.PI * (freq * 1.5) * j / sr) * env * 0.04;
      data[startIdx + j] += sweep;
    }
  }
}

function fillSeabird(data: Float32Array, sr: number) {
  for (let i = 0; i < data.length; i++) data[i] = 0;
  const totalSec = data.length / sr;
  const callCount = Math.floor(totalSec / 6);
  for (let c = 0; c < callCount; c++) {
    const startSec = 2 + Math.random() * (totalSec - 3);
    const startIdx = Math.floor(startSec * sr);
    const baseFreq = 1800 + Math.random() * 800;
    const dur = Math.floor((0.15 + Math.random() * 0.2) * sr);
    for (let j = 0; j < dur && (startIdx + j) < data.length; j++) {
      const env = Math.sin(Math.PI * j / dur);
      const freqMod = baseFreq + Math.sin(j / sr * 40) * 300;
      data[startIdx + j] += Math.sin(2 * Math.PI * freqMod * j / sr) * env * 0.08;
    }
  }
}

function fillRainBase(data: Float32Array, sr: number) {
  // 雨聲有強弱起伏 — 模擬雨勢變化（大雨→小雨→又大雨）
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    // 多層慢速波動，讓雨勢有自然變化
    const wave1 = Math.sin(t * Math.PI * 2 / 12) * 0.3 + 0.5;     // 12秒大週期
    const wave2 = Math.sin(t * Math.PI * 2 / 5.3 + 1.7) * 0.15 + 0.5;  // 5.3秒小週期
    const wave3 = Math.sin(t * Math.PI * 2 / 23 + 0.5) * 0.2 + 0.5;   // 23秒超慢週期
    const intensity = wave1 * wave2 * wave3;
    // 偶爾的急驟雨（intensity spike）
    const burst = Math.random() > 0.999 ? 1.5 : 1.0;
    data[i] = (Math.random() * 2 - 1) * 0.35 * intensity * burst;
  }
}

function fillRainDroplet(data: Float32Array, sr: number) {
  // 雨滴有大有小，密度隨時間變化
  for (let i = 0; i < data.length; i++) data[i] = 0;
  const totalSec = data.length / sr;
  const dropCount = Math.floor(totalSec * 8);
  for (let d = 0; d < dropCount; d++) {
    const posSec = Math.random() * totalSec;
    const pos = Math.floor(posSec * sr);
    // 雨滴大小和頻率隨機
    const size = Math.random(); // 0=小滴 1=大滴
    const freq = size < 0.5
      ? (5000 + Math.random() * 5000)   // 小滴：高頻
      : (2000 + Math.random() * 3000);  // 大滴：中頻
    const durSec = size < 0.5 ? 0.008 : (0.02 + Math.random() * 0.02);
    const dur = Math.floor(durSec * sr);
    const amp = size < 0.5 ? 0.08 : 0.2;
    for (let j = 0; j < dur && (pos + j) < data.length; j++) {
      data[pos + j] += Math.sin(2 * Math.PI * freq * j / sr) * Math.exp(-j / (dur * 0.25)) * amp;
    }
    // 大滴有回彈聲
    if (size > 0.7) {
      const bouncePos = pos + dur + Math.floor(0.01 * sr);
      const bounceDur = Math.floor(0.005 * sr);
      for (let j = 0; j < bounceDur && (bouncePos + j) < data.length; j++) {
        data[bouncePos + j] += Math.sin(2 * Math.PI * freq * 1.5 * j / sr) * Math.exp(-j / (bounceDur * 0.2)) * amp * 0.3;
      }
    }
  }
}

function fillCrickets(data: Float32Array, sr: number) {
  // 多種蟲鳴交織：蟋蟀 + 蟬鳴 + 蛙鳴（遠）
  for (let i = 0; i < data.length; i++) data[i] = 0;
  const totalSec = data.length / sr;

  // 蟋蟀群（快速脈衝，多隻不同頻率）
  const cricketCount = Math.floor(totalSec / 1.5);
  for (let b = 0; b < cricketCount; b++) {
    const startSec = Math.random() * totalSec;
    const startIdx = Math.floor(startSec * sr);
    const freq = 4000 + Math.random() * 2000;
    const pulseRate = 60 + Math.random() * 40; // 每隻速度不同
    const dur = Math.floor((0.3 + Math.random() * 0.8) * sr);
    const vol = 0.02 + Math.random() * 0.03;
    for (let j = 0; j < dur && (startIdx + j) < data.length; j++) {
      const pulse = Math.sin(j / sr * pulseRate * Math.PI) > 0 ? 1 : 0;
      const env = Math.sin(Math.PI * j / dur); // 淡入淡出
      data[startIdx + j] += Math.sin(2 * Math.PI * freq * j / sr) * pulse * env * vol;
    }
  }

  // 遠方蟬鳴（持續高頻嗡嗡，帶顫抖）
  const cicadaCount = Math.floor(totalSec / 6);
  for (let c = 0; c < cicadaCount; c++) {
    const startSec = Math.random() * totalSec;
    const startIdx = Math.floor(startSec * sr);
    const freq = 5500 + Math.random() * 1500;
    const dur = Math.floor((1.5 + Math.random() * 3) * sr);
    for (let j = 0; j < dur && (startIdx + j) < data.length; j++) {
      const env = Math.sin(Math.PI * j / dur);
      const vibrato = Math.sin(j / sr * Math.PI * 2 * 12) * 0.3 + 0.7;
      data[startIdx + j] += Math.sin(2 * Math.PI * freq * j / sr) * env * vibrato * 0.015;
    }
  }
}

// 真實柴火：密集劈哩啪啦 + 木頭爆裂 + 低頻火焰呼吸 + 樹脂嘶嘶聲
function fillFireplace(data: Float32Array, sr: number) {
  const totalSec = data.length / sr;

  // 先填入持續的火焰基底
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;

    // 層 1：低頻火焰呼吸聲（很輕，只是底色）
    const baseBreath = (Math.random() * 2 - 1) * 0.04;
    const breathEnv = Math.sin(t * Math.PI * 2 / 4.2) * 0.25 + 0.75;

    // 層 2：密集的小噼啪（劈哩啪啦 — 每秒會出現很多次的小爆裂）
    const crackleChance = Math.random();
    let crackle = 0;
    if (crackleChance > 0.96) {
      // 高頻小爆裂，非常密集
      const intensity = 0.15 + Math.random() * 0.35;
      const decayLen = Math.floor(sr * (0.002 + Math.random() * 0.006));
      const phase = i % decayLen;
      crackle = (Math.random() - 0.5) * intensity * Math.exp(-phase / (decayLen * 0.25));
    }

    // 層 3：中等噼啪（稍大聲的劈啪，每秒幾次）
    const midCrackle = Math.random();
    let midSnap = 0;
    if (midCrackle > 0.985) {
      const snapAmp = 0.25 + Math.random() * 0.45;
      const snapDecay = Math.floor(sr * (0.004 + Math.random() * 0.012));
      const snapPhase = i % snapDecay;
      midSnap = (Math.random() - 0.5) * snapAmp * Math.exp(-snapPhase / (snapDecay * 0.2));
    }

    // 層 4：樹脂嘶嘶聲（高頻的持續嘶嘶）
    const hiss = (Math.random() * 2 - 1) * 0.02 * (Math.sin(t * Math.PI * 2 / 6.7) * 0.3 + 0.5);

    data[i] = baseBreath * breathEnv + crackle + midSnap + hiss;
  }

  // 疊加大聲爆裂（木頭爆開 pop — 非常有存在感的劈啪聲）
  const popCount = Math.floor(totalSec * 1.5); // 每秒 1~2 次大爆裂
  for (let p = 0; p < popCount; p++) {
    const startSec = Math.random() * totalSec;
    const startIdx = Math.floor(startSec * sr);
    const popDur = Math.floor((0.008 + Math.random() * 0.025) * sr);
    const popAmp = 0.4 + Math.random() * 0.5;
    const popFreq = 800 + Math.random() * 3000;
    for (let j = 0; j < popDur && (startIdx + j) < data.length; j++) {
      const env = Math.exp(-j / (popDur * 0.15));
      const noise = (Math.random() - 0.5) * popAmp;
      const tone = Math.sin(2 * Math.PI * popFreq * j / sr) * popAmp * 0.3;
      data[startIdx + j] += (noise + tone) * env;
    }
  }

  // 疊加木頭嘎吱裂開聲（中頻，像木頭在火中裂開）
  const creakCount = Math.floor(totalSec * 0.4);
  for (let c = 0; c < creakCount; c++) {
    const startSec = Math.random() * totalSec;
    const startIdx = Math.floor(startSec * sr);
    const dur = Math.floor((0.05 + Math.random() * 0.15) * sr);
    const freq = 150 + Math.random() * 250;
    const amp = 0.06 + Math.random() * 0.08;
    for (let j = 0; j < dur && (startIdx + j) < data.length; j++) {
      const env = Math.sin(Math.PI * j / dur);
      const vibrato = Math.sin(2 * Math.PI * (freq + Math.sin(j / sr * 30) * 40) * j / sr);
      data[startIdx + j] += vibrato * env * amp;
    }
  }
}

// 真實溪流：強烈的水流聲 + 石頭濺水 + 連續湍流 + 氣泡 + 小瀑布
function fillStream(data: Float32Array, sr: number) {
  const totalSec = data.length / sr;

  for (let i = 0; i < data.length; i++) {
    const t = i / sr;

    // 層 1：厚實的主水流（明顯的嘩嘩水聲，用帶通噪音模擬）
    const flowMod1 = Math.sin(t * Math.PI * 2 / 4.0) * 0.15 + 0.85;
    const flowMod2 = Math.sin(t * Math.PI * 2 / 9.5 + 1.7) * 0.12 + 0.88;
    const flowMod3 = Math.sin(t * Math.PI * 2 / 2.3 + 0.5) * 0.08 + 0.92; // 快速的水流起伏
    const mainFlow = (Math.random() * 2 - 1) * 0.22 * flowMod1 * flowMod2 * flowMod3;

    // 層 2：高頻湍流（水經過石頭的嘩啦啦聲 — 非常明顯）
    const turbMod = Math.sin(t * Math.PI * 2 / 1.8 + 3.1) * 0.25 + 0.75;
    const turbulence = (Math.random() * 2 - 1) * 0.12 * turbMod;

    // 層 3：中頻水流連續感（像河水穩定流過的聲音）
    const midFlow = (Math.random() * 2 - 1) * 0.08 * (Math.sin(t * Math.PI * 2 / 6.2) * 0.2 + 0.8);

    // 層 4：水打石頭的濺水聲（快速的高頻突發）
    const splashChance = Math.random();
    let splash = 0;
    if (splashChance > 0.975) {
      splash = (Math.random() - 0.5) * 0.18 * Math.exp(-((i % Math.floor(sr * 0.008)) / (sr * 0.002)));
    }

    // 層 5：低頻河底水壓聲（厚度）
    const deepRumble = (Math.random() * 2 - 1) * 0.04 * (Math.sin(t * Math.PI * 2 / 7.8) * 0.25 + 0.75);

    data[i] = mainFlow + turbulence + midFlow + splash + deepRumble;
  }

  // 疊加密集氣泡聲（水裡冒出的泡泡 — 增加數量）
  const bubbleCount = Math.floor(totalSec * 8);
  for (let b = 0; b < bubbleCount; b++) {
    const pos = Math.floor(Math.random() * data.length);
    const freq = 500 + Math.random() * 3000;
    const dur = Math.floor((0.008 + Math.random() * 0.025) * sr);
    const amp = 0.04 + Math.random() * 0.08;
    for (let j = 0; j < dur && (pos + j) < data.length; j++) {
      const fUp = freq + (j / dur) * freq * 0.6;
      data[pos + j] += Math.sin(2 * Math.PI * fUp * j / sr) * Math.exp(-j / (dur * 0.18)) * amp;
    }
  }

  // 疊加石頭濺水 burst（像水流過凸起的石頭噴濺）
  const splashBurst = Math.floor(totalSec * 2);
  for (let s = 0; s < splashBurst; s++) {
    const startSec = Math.random() * totalSec;
    const startIdx = Math.floor(startSec * sr);
    const dur = Math.floor((0.08 + Math.random() * 0.2) * sr);
    const amp = 0.08 + Math.random() * 0.12;
    for (let j = 0; j < dur && (startIdx + j) < data.length; j++) {
      const env = Math.exp(-j / (dur * 0.3));
      data[startIdx + j] += (Math.random() * 2 - 1) * env * amp;
    }
  }

  // 疊加小瀑布聲（持續的白噪音 burst，像水流過落差）
  const miniWaterfall = Math.floor(totalSec / 3);
  for (let w = 0; w < miniWaterfall; w++) {
    const startSec = 0.5 + Math.random() * (totalSec - 1.5);
    const startIdx = Math.floor(startSec * sr);
    const dur = Math.floor((0.4 + Math.random() * 0.8) * sr);
    for (let j = 0; j < dur && (startIdx + j) < data.length; j++) {
      const env = Math.sin(Math.PI * j / dur) * 0.1;
      data[startIdx + j] += (Math.random() * 2 - 1) * env;
    }
  }
}

function fillThunder(data: Float32Array, sr: number) {
  // 真實雷聲：劈啪 crack → 轟隆 rumble → 遠方迴盪 echo
  for (let i = 0; i < data.length; i++) data[i] = 0;
  const totalSec = data.length / sr;
  const thunderCount = Math.max(2, Math.floor(totalSec / 10));

  for (let t = 0; t < thunderCount; t++) {
    const startSec = 3 + Math.random() * (totalSec - 8);
    const startIdx = Math.floor(startSec * sr);

    // Phase 1: 劈啪 (sharp crack) — 0.05~0.1s 高頻白噪音爆發
    const crackDur = Math.floor((0.05 + Math.random() * 0.08) * sr);
    for (let j = 0; j < crackDur && (startIdx + j) < data.length; j++) {
      const env = Math.exp(-j / (crackDur * 0.15));
      data[startIdx + j] += (Math.random() * 2 - 1) * env * 0.4;
    }

    // Phase 2: 轟隆 (deep rumble) — 2~5s 低頻震動
    const rumbleStart = startIdx + crackDur;
    const rumbleDur = Math.floor((2 + Math.random() * 3) * sr);
    const rumbleFreq = 30 + Math.random() * 40;
    for (let j = 0; j < rumbleDur && (rumbleStart + j) < data.length; j++) {
      const env = Math.exp(-j / (rumbleDur * 0.4));
      const bass = Math.sin(2 * Math.PI * rumbleFreq * j / sr) * 0.25;
      const noise = (Math.random() * 2 - 1) * 0.15;
      // 低頻震顫感
      const tremor = Math.sin(j / sr * Math.PI * 2 * 8) * 0.1;
      data[rumbleStart + j] += (bass + noise + tremor) * env * 0.3;
    }

    // Phase 3: 遠方迴盪 (distant echo) — 3~6s 漸弱的低頻
    const echoStart = rumbleStart + Math.floor(rumbleDur * 0.6);
    const echoDur = Math.floor((3 + Math.random() * 3) * sr);
    const echoFreq = 20 + Math.random() * 30;
    for (let j = 0; j < echoDur && (echoStart + j) < data.length; j++) {
      const env = Math.exp(-j / (echoDur * 0.35));
      const wave = Math.sin(2 * Math.PI * echoFreq * j / sr) * 0.12;
      const rumbleNoise = (Math.random() * 2 - 1) * 0.05;
      data[echoStart + j] += (wave + rumbleNoise) * env * 0.15;
    }
  }
}

function fillCafeMurmur(data: Float32Array, sr: number) {
  // 咖啡廳低語：調變雜訊模擬遠方人聲對話
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const slow1 = Math.sin(t * Math.PI * 2 / 4.5) * 0.3 + 0.5;
    const slow2 = Math.sin(t * Math.PI * 2 / 7.2 + 2.1) * 0.2 + 0.5;
    const burst = Math.random() > 0.97 ? (0.5 + Math.random() * 0.5) : slow1 * slow2;
    data[i] = (Math.random() * 2 - 1) * burst * 0.08;
  }
}

function fillPebbleWash(data: Float32Array, sr: number) {
  // 碎石浪：浪退時拉著小石頭的沙沙聲
  // 週期性的「嘩——沙沙沙沙」聲，用高頻白噪音 + 低頻 envelope
  // 每 6-10 秒一個浪，attack 快 decay 慢（浪退拉石頭）
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    // 多重浪週期
    const wave1 = Math.max(0, Math.sin(t * Math.PI * 2 / 7.5) * 0.6 + 0.2);
    const wave2 = Math.max(0, Math.sin(t * Math.PI * 2 / 11.3 + 2.1) * 0.4 + 0.1);
    const combined = wave1 + wave2 * 0.5;
    // 高頻碎石沙沙
    const grain = (Math.random() * 2 - 1);
    data[i] = grain * combined * 0.15;
  }
}

function fillDeepOceanDrone(data: Float32Array, sr: number) {
  // 深海低鳴：極低頻的嗡嗡聲，像大海深處的共振
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    // 極低頻 30-50Hz 正弦波堆疊
    const drone1 = Math.sin(t * Math.PI * 2 * 35) * 0.12;
    const drone2 = Math.sin(t * Math.PI * 2 * 42 + 0.5) * 0.08;
    const drift = Math.sin(t * Math.PI * 2 / 20) * 0.3 + 0.7; // 20秒慢調變
    data[i] = (drone1 + drone2) * drift + (Math.random() * 2 - 1) * 0.02;
  }
}

function fillSeaWind(data: Float32Array, sr: number) {
  // 海風呼嘯：比 wind-gentle 更有海邊的感覺
  // 海風有更大的 gust，帶有鹹味（中頻突出）
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const gust = Math.sin(t * Math.PI * 2 / 5) * 0.4 + 0.5;
    const swell = Math.sin(t * Math.PI * 2 / 15 + 1.3) * 0.25 + 0.5;
    const howl = Math.sin(t * Math.PI * 2 / 1.8) * 0.15 + 0.5; // 風嘯聲
    const gustSpike = Math.random() > 0.995 ? (1.5 + Math.random()) : 1.0;
    data[i] = (Math.random() * 2 - 1) * gust * swell * howl * gustSpike * 0.2;
  }
}

// 清晨鳥叫合唱 — 多種鳥類交織，有遠有近
function fillDawnChorus(data: Float32Array, sr: number) {
  for (let i = 0; i < data.length; i++) data[i] = 0;
  const totalSec = data.length / sr;

  // 種類 1：知更鳥（短促上揚，2-3 音節）
  const robinCount = Math.floor(totalSec / 3);
  for (let c = 0; c < robinCount; c++) {
    const startSec = Math.random() * totalSec;
    const startIdx = Math.floor(startSec * sr);
    const baseFreq = 2800 + Math.random() * 600;
    const syllables = 2 + Math.floor(Math.random() * 2);
    for (let s = 0; s < syllables; s++) {
      const sStart = startIdx + Math.floor(s * 0.12 * sr);
      const sDur = Math.floor((0.06 + Math.random() * 0.06) * sr);
      const sweepUp = Math.random() > 0.5;
      for (let j = 0; j < sDur && (sStart + j) < data.length; j++) {
        const env = Math.sin(Math.PI * j / sDur);
        const fMod = sweepUp ? baseFreq + (j / sDur) * 400 : baseFreq + 400 - (j / sDur) * 400;
        data[sStart + j] += Math.sin(2 * Math.PI * fMod * j / sr) * env * 0.08;
      }
    }
  }

  // 種類 2：畫眉鳥（長音 trill，快速顫音）
  const thrushCount = Math.floor(totalSec / 6);
  for (let c = 0; c < thrushCount; c++) {
    const startSec = Math.random() * totalSec;
    const startIdx = Math.floor(startSec * sr);
    const baseFreq = 3500 + Math.random() * 1000;
    const dur = Math.floor((0.3 + Math.random() * 0.5) * sr);
    const trillRate = 25 + Math.random() * 15; // 顫音頻率
    for (let j = 0; j < dur && (startIdx + j) < data.length; j++) {
      const env = Math.sin(Math.PI * j / dur);
      const trill = Math.sin(j / sr * Math.PI * 2 * trillRate) * 0.5 + 0.5;
      data[startIdx + j] += Math.sin(2 * Math.PI * baseFreq * j / sr) * env * trill * 0.06;
    }
  }

  // 種類 3：遠方布穀鳥（低沉雙音 coo-coo）
  const cuckooCount = Math.floor(totalSec / 10);
  for (let c = 0; c < cuckooCount; c++) {
    const startSec = 3 + Math.random() * (totalSec - 5);
    const startIdx = Math.floor(startSec * sr);
    const hiFreq = 800 + Math.random() * 200;
    const loFreq = hiFreq * 0.75;
    // 高音
    const hiDur = Math.floor(0.25 * sr);
    for (let j = 0; j < hiDur && (startIdx + j) < data.length; j++) {
      const env = Math.sin(Math.PI * j / hiDur);
      data[startIdx + j] += Math.sin(2 * Math.PI * hiFreq * j / sr) * env * 0.05;
    }
    // 低音（間隔 0.15s）
    const loStart = startIdx + hiDur + Math.floor(0.15 * sr);
    const loDur = Math.floor(0.35 * sr);
    for (let j = 0; j < loDur && (loStart + j) < data.length; j++) {
      const env = Math.sin(Math.PI * j / loDur);
      data[loStart + j] += Math.sin(2 * Math.PI * loFreq * j / sr) * env * 0.05;
    }
  }

  // 種類 4：麻雀嘰嘰喳喳（快速高頻短音群）
  const sparrowCount = Math.floor(totalSec / 4);
  for (let c = 0; c < sparrowCount; c++) {
    const startSec = Math.random() * totalSec;
    const startIdx = Math.floor(startSec * sr);
    const chipCount = 3 + Math.floor(Math.random() * 5);
    for (let ch = 0; ch < chipCount; ch++) {
      const cStart = startIdx + Math.floor(ch * (0.05 + Math.random() * 0.08) * sr);
      const cDur = Math.floor((0.02 + Math.random() * 0.03) * sr);
      const cFreq = 4000 + Math.random() * 3000;
      for (let j = 0; j < cDur && (cStart + j) < data.length; j++) {
        const env = Math.exp(-j / (cDur * 0.3));
        data[cStart + j] += Math.sin(2 * Math.PI * cFreq * j / sr) * env * 0.04;
      }
    }
  }
}

function fillNightSurf(data: Float32Array, sr: number) {
  // 夜浪：更柔和的浪聲，帶有遠方船笛
  // 非常緩慢的浪
  const totalSec = data.length / sr;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const wave = Math.max(0, Math.sin(t * Math.PI * 2 / 12) * 0.5 + 0.3);
    const noise = (Math.random() * 2 - 1) * 0.12;
    data[i] = noise * wave;
  }
  // 偶爾的遠方聲響（低沉的嗚嗚聲——船笛）
  const hornCount = Math.max(1, Math.floor(totalSec / 25));
  for (let h = 0; h < hornCount; h++) {
    const startSec = 8 + Math.random() * (totalSec - 10);
    const startIdx = Math.floor(startSec * sr);
    const dur = Math.floor((2 + Math.random() * 2) * sr);
    const freq = 120 + Math.random() * 40;
    for (let j = 0; j < dur && (startIdx + j) < data.length; j++) {
      const env = Math.sin(Math.PI * j / dur) * 0.06;
      data[startIdx + j] += Math.sin(2 * Math.PI * freq * j / sr) * env;
    }
  }
}

function fillSparkleWater(data: Float32Array, sr: number) {
  // 陽光水面：閃爍的高頻，像陽光在水面跳動
  for (let i = 0; i < data.length; i++) data[i] = 0;
  const totalSec = data.length / sr;
  // 高頻小亮點，像陽光折射
  const sparkCount = Math.floor(totalSec * 15);
  for (let s = 0; s < sparkCount; s++) {
    const pos = Math.floor(Math.random() * data.length);
    const freq = 3000 + Math.random() * 5000;
    const dur = Math.floor((0.01 + Math.random() * 0.03) * sr);
    for (let j = 0; j < dur && (pos + j) < data.length; j++) {
      const env = Math.exp(-j / (dur * 0.3));
      data[pos + j] += Math.sin(2 * Math.PI * freq * j / sr) * env * 0.04;
    }
  }
}

function fillJungleDeep(data: Float32Array, sr: number) {
  // 叢林深處：遠方的啼叫聲、奇怪的嗡嗡蟲聲
  for (let i = 0; i < data.length; i++) data[i] = 0;
  const totalSec = data.length / sr;
  // 遠方奇異鳥叫（低頻長音）
  const callCount = Math.floor(totalSec / 8);
  for (let c = 0; c < callCount; c++) {
    const startSec = 2 + Math.random() * (totalSec - 3);
    const startIdx = Math.floor(startSec * sr);
    const freq = 600 + Math.random() * 800;
    const dur = Math.floor((0.5 + Math.random() * 1.5) * sr);
    for (let j = 0; j < dur && (startIdx + j) < data.length; j++) {
      const env = Math.sin(Math.PI * j / dur);
      const vibrato = Math.sin(j / sr * Math.PI * 2 * 6) * 0.15 + 0.85;
      data[startIdx + j] += Math.sin(2 * Math.PI * freq * j / sr) * env * vibrato * 0.06;
    }
  }
  // 低沉蜂鳴
  const buzzCount = Math.floor(totalSec / 6);
  for (let b = 0; b < buzzCount; b++) {
    const startSec = Math.random() * totalSec;
    const startIdx = Math.floor(startSec * sr);
    const freq = 150 + Math.random() * 200;
    const dur = Math.floor((0.3 + Math.random() * 0.8) * sr);
    for (let j = 0; j < dur && (startIdx + j) < data.length; j++) {
      const env = Math.sin(Math.PI * j / dur);
      data[startIdx + j] += Math.sin(2 * Math.PI * freq * j / sr) * env * 0.03;
    }
  }
}

function fillEaveDrip(data: Float32Array, sr: number) {
  // 屋簷雨滴：不同於一般雨，是雨水從屋簷滴下的節奏感
  for (let i = 0; i < data.length; i++) data[i] = 0;
  const totalSec = data.length / sr;
  // 有節奏的滴答，但不規則
  const dripCount = Math.floor(totalSec * 4);
  for (let d = 0; d < dripCount; d++) {
    const pos = Math.floor(Math.random() * data.length);
    const freq = 1200 + Math.random() * 1500;
    const dur = Math.floor((0.03 + Math.random() * 0.05) * sr);
    const amp = 0.08 + Math.random() * 0.12;
    for (let j = 0; j < dur && (pos + j) < data.length; j++) {
      data[pos + j] += Math.sin(2 * Math.PI * freq * j / sr) * Math.exp(-j / (dur * 0.15)) * amp;
    }
    // 水花濺開
    const splashPos = pos + dur;
    const splashDur = Math.floor(0.02 * sr);
    for (let j = 0; j < splashDur && (splashPos + j) < data.length; j++) {
      data[splashPos + j] += (Math.random() * 2 - 1) * Math.exp(-j / (splashDur * 0.2)) * amp * 0.3;
    }
  }
}

// ===================== 新增：呼吸、能量、冥想 Generators =====================

// 呼吸引導音 — 吸氣時升高頻率，吐氣時降低（8秒週期）
function fillBreathTone(data: Float32Array, sr: number) {
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    // 8秒一個呼吸週期的基底 tone
    const cycle = t % 8;
    const phase = cycle / 8; // 0-1
    // 吸氣（0-0.4）頻率上升，吐氣（0.4-1）頻率下降
    const freq = phase < 0.4
      ? 150 + (phase / 0.4) * 120  // 150→270Hz
      : 270 - ((phase - 0.4) / 0.6) * 120; // 270→150Hz
    const env = Math.sin(Math.PI * phase) * 0.7 + 0.3;
    data[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.06;
  }
}

// 低頻脈衝 — 輕柔的節奏感（能量類用）
function fillLowPulse(data: Float32Array, sr: number) {
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    // BPM 逐漸從 60 加速到 80
    const totalSec = data.length / sr;
    const progress = Math.min(t / totalSec, 1);
    const bpm = 60 + progress * 20;
    const beatPeriod = 60 / bpm;
    const beatPhase = (t % beatPeriod) / beatPeriod;
    // 柔和的低頻 kick
    const kick = beatPhase < 0.1 ? Math.sin(2 * Math.PI * 55 * t) * Math.exp(-beatPhase * 30) : 0;
    // 加一點 sub bass 持續感
    const sub = Math.sin(2 * Math.PI * 40 * t) * 0.02 * (Math.sin(t * Math.PI * 2 / 4) * 0.3 + 0.7);
    data[i] = (kick * 0.12 + sub);
  }
}

// 高頻微光 shimmer — 像陽光穿過水面的閃爍（能量類用）
function fillShimmer(data: Float32Array, sr: number) {
  for (let i = 0; i < data.length; i++) data[i] = 0;
  const totalSec = data.length / sr;
  // 隨機的高頻短音，像是閃爍光點
  const sparkCount = Math.floor(totalSec * 6);
  for (let s = 0; s < sparkCount; s++) {
    const pos = Math.floor(Math.random() * data.length);
    const freq = 2000 + Math.random() * 4000;
    const dur = Math.floor((0.02 + Math.random() * 0.06) * sr);
    const amp = 0.02 + Math.random() * 0.04;
    for (let j = 0; j < dur && (pos + j) < data.length; j++) {
      const env = Math.sin(Math.PI * j / dur);
      data[pos + j] += Math.sin(2 * Math.PI * freq * j / sr) * env * amp;
    }
  }
}

// 深沉 drone — 極低頻持續音（冥想類用）
function fillMeditationDrone(data: Float32Array, sr: number) {
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    // 極慢波動的多層低頻
    const d1 = Math.sin(t * Math.PI * 2 * 55) * 0.08;        // 55Hz 基音
    const d2 = Math.sin(t * Math.PI * 2 * 82.5) * 0.04;      // 82.5Hz 五度泛音
    const d3 = Math.sin(t * Math.PI * 2 * 110) * 0.02;       // 110Hz 八度泛音
    const drift = Math.sin(t * Math.PI * 2 / 30) * 0.3 + 0.7; // 30秒慢調變
    const warmth = (Math.random() * 2 - 1) * 0.008;           // 微量溫暖噪音
    data[i] = (d1 + d2 + d3) * drift + warmth;
  }
}

// 溫暖泛音 pad — 類似合成器 pad 的溫暖聲音
function fillWarmPad(data: Float32Array, sr: number) {
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    // 柔和的和弦音
    const note1 = Math.sin(t * Math.PI * 2 * 220) * 0.04;     // A3
    const note2 = Math.sin(t * Math.PI * 2 * 277.18) * 0.03;  // C#4
    const note3 = Math.sin(t * Math.PI * 2 * 329.63) * 0.025; // E4
    // 超慢淡入淡出
    const swell = Math.sin(t * Math.PI * 2 / 20) * 0.4 + 0.6;
    const drift2 = Math.sin(t * Math.PI * 2 / 45 + 1.2) * 0.2 + 0.8;
    data[i] = (note1 + note2 + note3) * swell * drift2;
  }
}

// 能量上升音 — 頻率緩慢上升的 sweep
function fillRisingSweep(data: Float32Array, sr: number) {
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    // 頻率從 80Hz 緩慢上升到 200Hz（循環）
    const cycleT = (t % 30) / 30; // 30 秒一個循環
    const freq = 80 + cycleT * 120;
    const env = Math.sin(Math.PI * cycleT) * 0.5 + 0.5;
    data[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.05 + (Math.random() * 2 - 1) * 0.01;
  }
}

// 寧靜鈴聲 — 偶爾的清脆高頻短音（冥想用，像風鈴）
function fillTingsha(data: Float32Array, sr: number) {
  for (let i = 0; i < data.length; i++) data[i] = 0;
  const totalSec = data.length / sr;
  const tingCount = Math.max(2, Math.floor(totalSec / 12));
  for (let t = 0; t < tingCount; t++) {
    const startSec = 3 + Math.random() * (totalSec - 5);
    const startIdx = Math.floor(startSec * sr);
    const freq = 2093 + Math.random() * 1000; // C7 附近
    const dur = Math.floor((1.5 + Math.random() * 2) * sr);
    for (let j = 0; j < dur && (startIdx + j) < data.length; j++) {
      const env = Math.exp(-j / (dur * 0.3));
      data[startIdx + j] += Math.sin(2 * Math.PI * freq * j / sr) * env * 0.06
        + Math.sin(2 * Math.PI * freq * 2.001 * j / sr) * env * 0.02; // 微微 detuned 泛音
    }
  }
}

// 水滴雨聲：密集清脆的小水滴，像窗外綿密的小雨
function fillRaindropDense(data: Float32Array, sr: number) {
  const totalSec = data.length / sr;

  // 極輕的背景雨聲底色（很安靜的白噪音）
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.015;
  }

  // 密集水滴（每秒 15~25 滴 — 小但清楚）
  const dropCount = Math.floor(totalSec * (15 + Math.random() * 10));
  for (let d = 0; d < dropCount; d++) {
    const pos = Math.floor(Math.random() * data.length);
    // 水滴音色：短促的高頻 ping + 快速衰減
    const baseFreq = 2000 + Math.random() * 4000; // 高頻清脆音
    const dur = Math.floor((0.005 + Math.random() * 0.02) * sr); // 5~25ms 極短
    const amp = 0.08 + Math.random() * 0.18;
    for (let j = 0; j < dur && (pos + j) < data.length; j++) {
      // 頻率微微下滑（水滴特有的 plink 感）
      const freq = baseFreq * (1 - (j / dur) * 0.15);
      const env = Math.exp(-j / (dur * 0.12)); // 極快衰減
      data[pos + j] += Math.sin(2 * Math.PI * freq * j / sr) * env * amp;
    }
  }

  // 中等大小水滴（每秒 5~8 滴 — 稍微大顆一點，音調較低）
  const medDropCount = Math.floor(totalSec * (5 + Math.random() * 3));
  for (let d = 0; d < medDropCount; d++) {
    const pos = Math.floor(Math.random() * data.length);
    const baseFreq = 800 + Math.random() * 1500;
    const dur = Math.floor((0.015 + Math.random() * 0.035) * sr);
    const amp = 0.1 + Math.random() * 0.15;
    for (let j = 0; j < dur && (pos + j) < data.length; j++) {
      const freq = baseFreq * (1 - (j / dur) * 0.2);
      const env = Math.exp(-j / (dur * 0.15));
      // 加一點泛音讓水滴更真實
      const fundamental = Math.sin(2 * Math.PI * freq * j / sr);
      const overtone = Math.sin(2 * Math.PI * freq * 2.3 * j / sr) * 0.3;
      data[pos + j] += (fundamental + overtone) * env * amp;
    }
  }

  // 偶爾的水滴落入水面（有漣漪感的 plop）
  const plopCount = Math.floor(totalSec * 1.5);
  for (let p = 0; p < plopCount; p++) {
    const pos = Math.floor(Math.random() * data.length);
    const baseFreq = 400 + Math.random() * 600;
    const dur = Math.floor((0.04 + Math.random() * 0.06) * sr);
    const amp = 0.08 + Math.random() * 0.1;
    for (let j = 0; j < dur && (pos + j) < data.length; j++) {
      // 頻率先升後降（水滴落入水面的 bloop 感）
      const phase = j / dur;
      const freq = baseFreq * (1 + Math.sin(phase * Math.PI) * 0.3);
      const env = Math.exp(-j / (dur * 0.25));
      data[pos + j] += Math.sin(2 * Math.PI * freq * j / sr) * env * amp;
    }
  }

  // 微量的水面漣漪持續聲
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const ripple = Math.sin(t * Math.PI * 2 * (100 + Math.sin(t * 2.5) * 30)) * 0.008;
    data[i] += ripple * (Math.sin(t * Math.PI * 2 / 3.5) * 0.3 + 0.7);
  }
}

// ===================== 情境模式專用 Generators =====================

// 翻書聲：稀疏的沙沙短音，像有人在圖書館翻書
function fillPageTurn(data: Float32Array, sr: number) {
  for (let i = 0; i < data.length; i++) data[i] = 0;
  const totalSec = data.length / sr;
  // 每 4-10 秒一次翻書
  const turnCount = Math.floor(totalSec / 6);
  for (let t = 0; t < turnCount; t++) {
    const startSec = 2 + Math.random() * (totalSec - 3);
    const startIdx = Math.floor(startSec * sr);
    const dur = Math.floor((0.15 + Math.random() * 0.25) * sr);
    const amp = 0.04 + Math.random() * 0.06;
    for (let j = 0; j < dur && (startIdx + j) < data.length; j++) {
      const env = Math.sin(Math.PI * j / dur);
      // 高頻沙沙
      data[startIdx + j] += (Math.random() * 2 - 1) * env * amp;
    }
  }
}

// 遠方腳步：偶爾的低沉步伐聲
function fillDistantFootsteps(data: Float32Array, sr: number) {
  for (let i = 0; i < data.length; i++) data[i] = 0;
  const totalSec = data.length / sr;
  // 每 8-15 秒一串腳步
  const walkCount = Math.floor(totalSec / 10);
  for (let w = 0; w < walkCount; w++) {
    const startSec = 3 + Math.random() * (totalSec - 5);
    const steps = 3 + Math.floor(Math.random() * 4);
    const stepInterval = 0.5 + Math.random() * 0.15;
    const distanceAmp = 0.02 + Math.random() * 0.03; // 很遠
    for (let s = 0; s < steps; s++) {
      const stepSec = startSec + s * stepInterval;
      const stepIdx = Math.floor(stepSec * sr);
      const dur = Math.floor((0.04 + Math.random() * 0.03) * sr);
      const freq = 120 + Math.random() * 80;
      for (let j = 0; j < dur && (stepIdx + j) < data.length; j++) {
        const env = Math.exp(-j / (dur * 0.2));
        data[stepIdx + j] += Math.sin(2 * Math.PI * freq * j / sr) * env * distanceAmp
          + (Math.random() * 2 - 1) * env * distanceAmp * 0.3;
      }
    }
  }
}

// 木頭嘎吱聲：老房子的木頭輕微作響
function fillWoodCreak(data: Float32Array, sr: number) {
  for (let i = 0; i < data.length; i++) data[i] = 0;
  const totalSec = data.length / sr;
  const creakCount = Math.floor(totalSec / 8);
  for (let c = 0; c < creakCount; c++) {
    const startSec = 2 + Math.random() * (totalSec - 3);
    const startIdx = Math.floor(startSec * sr);
    const dur = Math.floor((0.08 + Math.random() * 0.15) * sr);
    const freq = 100 + Math.random() * 200;
    const amp = 0.02 + Math.random() * 0.03;
    for (let j = 0; j < dur && (startIdx + j) < data.length; j++) {
      const env = Math.sin(Math.PI * j / dur);
      const vibrato = Math.sin(2 * Math.PI * (freq + Math.sin(j / sr * 25) * 30) * j / sr);
      data[startIdx + j] += vibrato * env * amp;
    }
  }
}

// 番茄鐘提示音：溫和的正弦波上升音（開始）或下降音（結束）
function fillPomodoroChime(data: Float32Array, sr: number) {
  for (let i = 0; i < data.length; i++) data[i] = 0;
  // 只在開頭放一個溫和的提示音
  const chimeDur = Math.floor(1.5 * sr);
  const baseFreq = 523.25; // C5
  for (let j = 0; j < chimeDur && j < data.length; j++) {
    const env = Math.sin(Math.PI * j / chimeDur);
    const tone = Math.sin(2 * Math.PI * baseFreq * j / sr) * 0.06;
    const harmonic = Math.sin(2 * Math.PI * baseFreq * 2 * j / sr) * 0.02;
    data[j] = (tone + harmonic) * env;
  }
}

const GENERATORS: Record<string, (data: Float32Array, sr: number) => void> = {
  // 原始 generators
  'wind-gentle': fillWindGentle,
  'wind-strong': fillWindStrong,
  'rustle': fillRustle,
  'birdsong': fillBirdsong,
  'seabird': fillSeabird,
  'rain-base': fillRainBase,
  'rain-droplet': fillRainDroplet,
  'crickets': fillCrickets,
  'fireplace': fillFireplace,
  'stream': fillStream,
  'raindrop-dense': fillRaindropDense,
  'thunder': fillThunder,
  'cafe-murmur': fillCafeMurmur,
  // 新增的高級 generators —— 立體感和特色音景
  'pebble-wash': fillPebbleWash,
  'deep-ocean-drone': fillDeepOceanDrone,
  'sea-wind': fillSeaWind,
  'night-surf': fillNightSurf,
  'sparkle-water': fillSparkleWater,
  'jungle-deep': fillJungleDeep,
  'eave-drip': fillEaveDrip,
  'dawn-chorus': fillDawnChorus,
  // 新增：呼吸、能量、冥想 generators
  'breath-tone': fillBreathTone,
  'low-pulse': fillLowPulse,
  'shimmer': fillShimmer,
  'meditation-drone': fillMeditationDrone,
  'warm-pad': fillWarmPad,
  'rising-sweep': fillRisingSweep,
  'tingsha': fillTingsha,
  // 情境模式專用 generators
  'page-turn': fillPageTurn,
  'distant-footsteps': fillDistantFootsteps,
  'wood-creak': fillWoodCreak,
  'pomodoro-chime': fillPomodoroChime,
};

// ===================== ENGINE CLASS =====================

interface ActiveLayer {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

interface ActiveScape {
  preset: ScapePreset;
  layers: ActiveLayer[];
  masterGain: GainNode;
  lpf: BiquadFilterNode;
  breathTimer: number | null;
  microTimer: number | null;
  tidalTimer: number | null;
}

// ===================== CRYSTAL BOWL TYPES =====================

export type CrystalBowlFreq = 432 | 528 | 136.1 | 4096;

export interface CrystalBowlConfig {
  key: string;
  freq: CrystalBowlFreq;
  label: string;
  subtitle: string;
  emoji: string;
  color: string;
  /** 泛音倍數 */
  harmonics: number[];
  /** 泛音相對音量 */
  harmonicGains: number[];
  /** 衰減時間（秒） */
  sustainSec: number;
}

export const CRYSTAL_BOWL_PRESETS: CrystalBowlConfig[] = [
  {
    key: 'bowl-432',
    freq: 432,
    label: '432 Hz 宇宙共振',
    subtitle: '自然頻率，回歸身體的和諧',
    emoji: '🔮',
    color: '#9B7EC8',
    harmonics: [1, 2, 3, 4, 5],
    harmonicGains: [1.0, 0.45, 0.25, 0.12, 0.06],
    sustainSec: 12,
  },
  {
    key: 'bowl-528',
    freq: 528,
    label: '528 Hz 愛的頻率',
    subtitle: 'DNA 修復頻率，深層療癒',
    emoji: '💎',
    color: '#7EC8A8',
    harmonics: [1, 2, 3, 4, 5],
    harmonicGains: [1.0, 0.4, 0.2, 0.1, 0.05],
    sustainSec: 14,
  },
  {
    key: 'bowl-136',
    freq: 136.1,
    label: '136.1 Hz 地球之音',
    subtitle: 'OM 頻率，連結大地與內在',
    emoji: '🌍',
    color: '#C8A87E',
    harmonics: [1, 2, 3, 4, 5, 6],
    harmonicGains: [1.0, 0.5, 0.3, 0.18, 0.1, 0.05],
    sustainSec: 16,
  },
  {
    key: 'bowl-4096',
    freq: 4096,
    label: '4096 Hz 天使之音',
    subtitle: '水晶淨化頻率，清除負能量，光芒四射',
    emoji: '👼',
    color: '#E8D4F0',
    harmonics: [1, 2, 3],
    harmonicGains: [1.0, 0.3, 0.1],
    sustainSec: 10,
  },
];

class SoundscapeEngine {
  private ctx: AudioContext | null = null;
  private actives: Map<string, ActiveScape> = new Map();
  private masterGain: GainNode | null = null;

  getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  private getMasterGain(): GainNode {
    this.getContext();
    return this.masterGain!;
  }

  private createBuffer(layerCfg: LayerConfig, sr: number): AudioBuffer {
    const ctx = this.getContext();
    const len = layerCfg.bufferSec * sr;
    const buffer = ctx.createBuffer(2, len, sr);
    const fillFn = this.getBufferFiller(layerCfg);

    // 左右聲道獨立填充，產生自然的立體感
    fillFn(buffer.getChannelData(0), sr);
    fillFn(buffer.getChannelData(1), sr);

    // 如果啟用立體聲寬度，右聲道加微延遲和增益差異，增強空間感
    const stereoWidth = layerCfg.stereoWidth ?? 0.0;
    if (stereoWidth > 0.01) {
      const rightData = buffer.getChannelData(1);
      // 1~9ms 的延遲，根據立體寬度縮放
      const delayOffset = Math.floor(sr * (0.001 + Math.random() * 0.008 * stereoWidth));
      // 0.92~1.08 的增益差，根據立體寬度縮放
      const gainDiff = 0.96 + Math.random() * 0.08 * stereoWidth;

      const temp = new Float32Array(rightData.length);
      for (let i = 0; i < rightData.length; i++) {
        const srcIdx = (i - delayOffset + rightData.length) % rightData.length;
        temp[i] = rightData[srcIdx] * gainDiff;
      }
      rightData.set(temp);
    }
    return buffer;
  }

  private getBufferFiller(cfg: LayerConfig): (data: Float32Array, sr: number) => void {
    if (cfg.type === 'brown') return fillBrown;
    if (cfg.type === 'pink') return fillPink;
    if (cfg.type === 'white') return fillWhite;
    if (cfg.type === 'custom' && cfg.generator && GENERATORS[cfg.generator]) {
      return GENERATORS[cfg.generator];
    }
    return fillPink; // fallback
  }

  play(preset: ScapePreset): void {
    if (this.actives.has(preset.key)) return;
    const ctx = this.getContext();
    const sr = ctx.sampleRate;

    // Master gain for this scape
    const scapeGain = ctx.createGain();
    scapeGain.gain.value = preset.defaultGain;

    // Global low-pass (anti-harsh)
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = preset.lpfCutoff;
    lpf.Q.value = 0.5;

    scapeGain.connect(lpf);
    lpf.connect(this.getMasterGain());

    // 建立 layers —— 每層都有立體聲 panning
    const activeLayers: ActiveLayer[] = [];
    const panPositions = [-0.3, 0.15, -0.1, 0.25, -0.2, 0.35, -0.25, 0.2]; // 多個層次的左右位置
    for (let layerIdx = 0; layerIdx < preset.layers.length; layerIdx++) {
      const layerCfg = preset.layers[layerIdx];
      const buffer = this.createBuffer(layerCfg, sr);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const layerGain = ctx.createGain();
      layerGain.gain.value = layerCfg.gain;

      // 立體聲 panning：根據 layer 索引分配左右位置
      const panner = ctx.createStereoPanner();
      panner.pan.value = panPositions[layerIdx % panPositions.length];

      // 建立 filter chain
      let lastNode: AudioNode = source;
      for (const fSpec of layerCfg.filters) {
        const f = ctx.createBiquadFilter();
        f.type = fSpec.type;
        f.frequency.value = fSpec.frequency;
        if (fSpec.Q !== undefined) f.Q.value = fSpec.Q;
        if (fSpec.gain !== undefined) f.gain.value = fSpec.gain;
        lastNode.connect(f);
        lastNode = f;
      }
      // chain: lastNode -> panner -> layerGain -> scapeGain
      lastNode.connect(panner);
      panner.connect(layerGain);
      layerGain.connect(scapeGain);

      source.start(0);
      activeLayers.push({ source, gain: layerGain });
    }

    // 呼吸調變 — 根據是否有引導式呼吸選擇適當的方法
    const breathTimer = preset.guidedBreathing && preset.breathingPattern
      ? this.startGuidedBreathing(ctx, scapeGain, preset)
      : this.startBreathing(ctx, scapeGain, preset);

    // Micro-events
    const microTimer = this.startMicroEvents(ctx, scapeGain, preset);

    // Tidal cycle (for ocean presets)
    const tidalTimer = preset.tidalCycle ? this.startTidalCycle(ctx, scapeGain, lpf, preset) : null;

    this.actives.set(preset.key, {
      preset,
      layers: activeLayers,
      masterGain: scapeGain,
      lpf,
      breathTimer,
      microTimer,
      tidalTimer,
    });

    this.normalizeVolume();
  }

  /** 引導式呼吸 — 根據 breathingPattern 精確控制 gain ramp */
  private startGuidedBreathing(ctx: AudioContext, gainNode: GainNode, preset: ScapePreset): number {
    const pattern = preset.breathingPattern!;
    const baseGain = preset.defaultGain;
    const cycleSec = pattern.inhale + pattern.hold + pattern.exhale + (pattern.holdAfter || 0);

    const breathCycle = () => {
      const now = ctx.currentTime;
      const low = baseGain * 0.4;
      const high = baseGain * 1.2;

      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(low, now);

      // 吸氣：gain 上升
      gainNode.gain.linearRampToValueAtTime(high, now + pattern.inhale);
      // 屏氣：維持高位
      gainNode.gain.setValueAtTime(high, now + pattern.inhale + pattern.hold);
      // 吐氣：gain 下降
      gainNode.gain.linearRampToValueAtTime(low, now + pattern.inhale + pattern.hold + pattern.exhale);
      // 吐後屏氣
      if (pattern.holdAfter) {
        gainNode.gain.setValueAtTime(low, now + cycleSec);
      }
    };

    breathCycle();
    return window.setInterval(breathCycle, cycleSec * 1000);
  }

  private startBreathing(ctx: AudioContext, gainNode: GainNode, preset: ScapePreset): number {
    const [minCycle, maxCycle] = preset.breathCycle;
    const depth = preset.breathDepth;
    const baseGain = preset.defaultGain;

    const breathe = () => {
      const cycle = minCycle + Math.random() * (maxCycle - minCycle);
      const halfCycle = cycle / 2;
      const now = ctx.currentTime;
      const targetLow = baseGain * (1 - depth);
      const targetHigh = baseGain * (1 + depth * 0.3);

      gainNode.gain.linearRampToValueAtTime(targetLow, now + halfCycle);
      gainNode.gain.linearRampToValueAtTime(targetHigh, now + cycle);
    };

    breathe();
    const avgCycle = (minCycle + maxCycle) / 2;
    return window.setInterval(breathe, avgCycle * 1000);
  }

  private startMicroEvents(ctx: AudioContext, _parentGain: GainNode, preset: ScapePreset): number {
    const [minInt, maxInt] = preset.microInterval;
    const eventType = preset.microEventType || 'whoosh';

    const createEventBuffer = (): { buffer: AudioBuffer; gain: number; filterFreq: number } => {
      const sr = ctx.sampleRate;

      switch (eventType) {
        case 'wave-crash': {
          // 浪花拍岸：白噪音快速上升→衰減 + 低頻撞擊
          const dur = 1.5 + Math.random() * 2;
          const buf = ctx.createBuffer(2, Math.floor(dur * sr), sr);
          for (let ch = 0; ch < 2; ch++) {
            const d = buf.getChannelData(ch);
            for (let i = 0; i < d.length; i++) {
              const t = i / d.length;
              const att = t < 0.15 ? t / 0.15 : 1;
              const dec = Math.exp(-(t - 0.15) * 3);
              const env = att * dec;
              d[i] = (Math.random() * 2 - 1) * env * 0.25
                + Math.sin(i / sr * Math.PI * 2 * 60) * env * 0.15 * (1 - t);
            }
          }
          return { buffer: buf, gain: 0.25, filterFreq: 2500 };
        }
        case 'thunder-crack': {
          // 雷鳴：劈啪→轟隆→迴盪
          const dur = 4 + Math.random() * 4;
          const buf = ctx.createBuffer(2, Math.floor(dur * sr), sr);
          const crackLen = Math.floor(0.08 * sr);
          const rFreq = 25 + Math.random() * 35;
          for (let ch = 0; ch < 2; ch++) {
            const d = buf.getChannelData(ch);
            for (let i = 0; i < crackLen; i++) {
              d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (crackLen * 0.1)) * 0.5;
            }
            for (let i = crackLen; i < d.length; i++) {
              const t = (i - crackLen) / (d.length - crackLen);
              const env = Math.exp(-t * 2.5);
              d[i] = (Math.sin(i / sr * Math.PI * 2 * rFreq) * 0.2
                + (Math.random() * 2 - 1) * 0.12
                + Math.sin(i / sr * Math.PI * 2 * 7) * 0.08) * env * 0.35;
            }
          }
          return { buffer: buf, gain: 0.3, filterFreq: 800 };
        }
        case 'bird-call': {
          // 鳥叫：頻率 sweep，2-3 音節
          const dur = 0.3 + Math.random() * 0.5;
          const buf = ctx.createBuffer(2, Math.floor(dur * sr), sr);
          const bFreq = 2000 + Math.random() * 3000;
          const sweepD = Math.random() > 0.5 ? 1 : -1;
          const syllables = 1 + Math.floor(Math.random() * 3);
          for (let ch = 0; ch < 2; ch++) {
            const d = buf.getChannelData(ch);
            const sLen = Math.floor(d.length / syllables);
            for (let s = 0; s < syllables; s++) {
              const sS = s * sLen;
              for (let i = 0; i < sLen && (sS + i) < d.length; i++) {
                const env = Math.sin(Math.PI * i / sLen);
                d[sS + i] = Math.sin(2 * Math.PI * (bFreq + sweepD * (i / sLen) * 800) * i / sr) * env * 0.12;
              }
            }
          }
          return { buffer: buf, gain: 0.15, filterFreq: 5000 };
        }
        case 'twig-snap': {
          // 樹枝咔嚓 + 落葉沙沙
          const dur = 0.3 + Math.random() * 0.4;
          const buf = ctx.createBuffer(2, Math.floor(dur * sr), sr);
          const snapLen = Math.floor(0.02 * sr);
          for (let ch = 0; ch < 2; ch++) {
            const d = buf.getChannelData(ch);
            for (let i = 0; i < snapLen; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (snapLen * 0.1)) * 0.3;
            for (let i = snapLen; i < d.length; i++) {
              d[i] = (Math.random() * 2 - 1) * Math.exp(-((i - snapLen) / (d.length - snapLen)) * 4) * 0.06;
            }
          }
          return { buffer: buf, gain: 0.12, filterFreq: 4000 };
        }
        case 'rain-gust': {
          // 一陣急雨
          const dur = 2 + Math.random() * 3;
          const buf = ctx.createBuffer(2, Math.floor(dur * sr), sr);
          for (let ch = 0; ch < 2; ch++) {
            const d = buf.getChannelData(ch);
            for (let i = 0; i < d.length; i++) {
              const t = i / d.length;
              const env = t < 0.2 ? (t / 0.2) : Math.exp(-(t - 0.2) * 2);
              d[i] = (Math.random() * 2 - 1) * env * 0.2;
            }
          }
          return { buffer: buf, gain: 0.2, filterFreq: 3500 };
        }
        case 'cafe-clink': {
          // 杯碟碰撞
          const dur = 0.15 + Math.random() * 0.2;
          const buf = ctx.createBuffer(2, Math.floor(dur * sr), sr);
          const f = 3000 + Math.random() * 4000;
          for (let ch = 0; ch < 2; ch++) {
            const d = buf.getChannelData(ch);
            for (let i = 0; i < d.length; i++) {
              const env = Math.exp(-(i / d.length) * 15);
              d[i] = Math.sin(2 * Math.PI * f * i / sr) * env * 0.15 + (Math.random() * 2 - 1) * env * 0.05;
            }
          }
          return { buffer: buf, gain: 0.08, filterFreq: 6000 };
        }
        case 'night-wave': {
          // 夜浪：非常柔和的浪花聲（短、弱、低頻為主）
          const dur = 0.8 + Math.random() * 1.2;
          const buf = ctx.createBuffer(2, Math.floor(dur * sr), sr);
          for (let ch = 0; ch < 2; ch++) {
            const d = buf.getChannelData(ch);
            for (let i = 0; i < d.length; i++) {
              const t = i / d.length;
              const env = t < 0.3 ? t / 0.3 : Math.exp(-(t - 0.3) * 2);
              // 低頻為主，加一點高頻閃爍
              const bass = (Math.random() * 2 - 1) * 0.18 * env;
              const sparkle = Math.sin(2 * Math.PI * (2500 + Math.random() * 1500) * i / sr) * env * 0.04;
              d[i] = bass + sparkle;
            }
          }
          return { buffer: buf, gain: 0.12, filterFreq: 1800 };
        }
        case 'wind-howl': {
          // 風嘯聲：中頻 sine 波上升→下降 sweep
          const dur = 0.6 + Math.random() * 0.8;
          const buf = ctx.createBuffer(2, Math.floor(dur * sr), sr);
          const startFreq = 800 + Math.random() * 500;
          const endFreq = 1500 + Math.random() * 800;
          for (let ch = 0; ch < 2; ch++) {
            const d = buf.getChannelData(ch);
            for (let i = 0; i < d.length; i++) {
              const t = i / d.length;
              const env = Math.sin(Math.PI * t);
              // 頻率由 startFreq sweep 到 endFreq 再回來
              const sweepFreq = t < 0.5
                ? startFreq + (endFreq - startFreq) * (t / 0.5)
                : endFreq - (endFreq - startFreq) * ((t - 0.5) / 0.5);
              d[i] = Math.sin(2 * Math.PI * sweepFreq * i / sr) * env * 0.16 + (Math.random() * 2 - 1) * env * 0.06;
            }
          }
          return { buffer: buf, gain: 0.14, filterFreq: 2500 };
        }
        default: {
          const dur = 0.8 + Math.random() * 1.5;
          const buf = ctx.createBuffer(2, Math.floor(dur * sr), sr);
          for (let ch = 0; ch < 2; ch++) {
            const d = buf.getChannelData(ch);
            for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / d.length) * 0.08;
          }
          return { buffer: buf, gain: 0.12, filterFreq: 2000 };
        }
      }
    };

    const triggerEvent = () => {
      const { buffer, gain, filterFreq } = createEventBuffer();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const eventGain = ctx.createGain();
      eventGain.gain.value = gain;
      const lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = filterFreq;
      source.connect(lpf);
      lpf.connect(eventGain);
      eventGain.connect(this.getMasterGain());
      source.start(0);
    };

    const scheduleNext = () => {
      const delay = (minInt + Math.random() * (maxInt - minInt)) * 1000;
      return window.setTimeout(() => {
        triggerEvent();
        const scape = [...this.actives.values()].find(a => a.preset.key === preset.key);
        if (scape) {
          scape.microTimer = scheduleNext();
        }
      }, delay);
    };

    return scheduleNext();
  }

  /** 潮汐週期 — 60s 大波浪 gain/filter ramp，模擬海潮漲退 */
  private startTidalCycle(ctx: AudioContext, gainNode: GainNode, lpf: BiquadFilterNode, preset: ScapePreset): number {
    const cycleSec = preset.tidalCycle || 60;
    const depth = preset.tidalDepth || 0.3;
    const baseGain = preset.defaultGain;
    const baseLpf = preset.lpfCutoff;

    const rampTide = () => {
      const now = ctx.currentTime;
      const half = cycleSec / 2;
      // Wave rises: gain up, filter opens
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(baseGain * (1 + depth), now + half * 0.4);
      gainNode.gain.linearRampToValueAtTime(baseGain * (1 + depth * 0.8), now + half);
      // Wave falls: gain down, filter closes
      gainNode.gain.linearRampToValueAtTime(baseGain * (1 - depth * 0.5), now + half + half * 0.6);
      gainNode.gain.linearRampToValueAtTime(baseGain, now + cycleSec);

      // LPF modulation — opens at peak, closes at trough
      lpf.frequency.cancelScheduledValues(now);
      lpf.frequency.setValueAtTime(lpf.frequency.value, now);
      lpf.frequency.linearRampToValueAtTime(baseLpf * 1.4, now + half * 0.4);
      lpf.frequency.linearRampToValueAtTime(baseLpf * 1.2, now + half);
      lpf.frequency.linearRampToValueAtTime(baseLpf * 0.7, now + half + half * 0.6);
      lpf.frequency.linearRampToValueAtTime(baseLpf, now + cycleSec);
    };

    rampTide();
    return window.setInterval(rampTide, cycleSec * 1000);
  }

  // ===================== CRYSTAL BOWL SYNTHESIS =====================

  private bowlRepeatTimers: Map<string, number> = new Map();

  /** 敲一次水晶缽 — 產生基頻 + 泛音，自然衰減 */
  strikeOnce(bowl: CrystalBowlConfig, volume: number = 0.3): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(volume, now);
    masterGain.connect(this.getMasterGain());

    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];

    for (let i = 0; i < bowl.harmonics.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(bowl.freq * bowl.harmonics[i], now);
      // Add slight detuning for richness
      osc.detune.setValueAtTime((Math.random() - 0.5) * 4, now);

      const g = ctx.createGain();
      const hGain = bowl.harmonicGains[i] * volume;
      // Attack: quick rise
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(hGain, now + 0.05);
      // Sustain/decay: exponential decay
      g.gain.exponentialRampToValueAtTime(Math.max(hGain * 0.01, 0.0001), now + bowl.sustainSec);

      osc.connect(g);
      g.connect(masterGain);
      osc.start(now);
      osc.stop(now + bowl.sustainSec + 0.1);

      oscs.push(osc);
      gains.push(g);
    }

    // Cleanup after decay
    setTimeout(() => {
      try { masterGain.disconnect(); } catch {}
    }, (bowl.sustainSec + 0.5) * 1000);
  }

  /** 持續播放水晶缽 — 每隔一段時間自動敲擊 */
  startBowl(bowl: CrystalBowlConfig, volume: number = 0.25, intervalSec: number = 0): void {
    if (this.bowlRepeatTimers.has(bowl.key)) return;

    // First strike immediately
    this.strikeOnce(bowl, volume);

    if (intervalSec > 0) {
      // Repeat striking at interval
      const timer = window.setInterval(() => {
        this.strikeOnce(bowl, volume);
      }, intervalSec * 1000);
      this.bowlRepeatTimers.set(bowl.key, timer);
    } else {
      // Default: auto-repeat based on sustain time (slight overlap)
      const autoInterval = bowl.sustainSec * 0.85;
      const timer = window.setInterval(() => {
        this.strikeOnce(bowl, volume);
      }, autoInterval * 1000);
      this.bowlRepeatTimers.set(bowl.key, timer);
    }
  }

  /** 停止水晶缽 */
  stopBowl(bowlKey: string): void {
    const timer = this.bowlRepeatTimers.get(bowlKey);
    if (timer) {
      clearInterval(timer);
      this.bowlRepeatTimers.delete(bowlKey);
    }
  }

  isBowlPlaying(bowlKey: string): boolean {
    return this.bowlRepeatTimers.has(bowlKey);
  }

  getActiveBowlKeys(): string[] {
    return [...this.bowlRepeatTimers.keys()];
  }

  stopAllBowls(): void {
    for (const [key] of this.bowlRepeatTimers) {
      this.stopBowl(key);
    }
  }

  stop(key: string): void {
    const active = this.actives.get(key);
    if (!active) return;

    // Fade out gracefully
    const ctx = this.getContext();
    const now = ctx.currentTime;
    active.masterGain.gain.linearRampToValueAtTime(0, now + 0.5);

    setTimeout(() => {
      for (const layer of active.layers) {
        try { layer.source.stop(); } catch {}
        try { layer.gain.disconnect(); } catch {}
      }
      try { active.masterGain.disconnect(); } catch {}
      try { active.lpf.disconnect(); } catch {}
      if (active.breathTimer) clearInterval(active.breathTimer);
      if (active.microTimer) clearTimeout(active.microTimer);
      if (active.tidalTimer) clearInterval(active.tidalTimer);
      this.actives.delete(key);
      this.normalizeVolume();
    }, 600);
  }

  stopAll(): void {
    const keys = [...this.actives.keys()];
    keys.forEach(k => this.stop(k));
    this.stopAllBowls();
  }

  setVolume(key: string, vol: number): void {
    const active = this.actives.get(key);
    if (active) {
      active.masterGain.gain.setValueAtTime(vol, this.getContext().currentTime);
    }
  }

  /** Auto-normalize total volume when multiple scapes play */
  private normalizeVolume(): void {
    const count = this.actives.size;
    if (count <= 1) {
      if (this.masterGain) this.masterGain.gain.value = 1;
      return;
    }
    // Scale down so total doesn't clip
    const scale = 1 / Math.sqrt(count);
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(scale, this.getContext().currentTime);
    }
  }

  isPlaying(key: string): boolean {
    return this.actives.has(key);
  }

  getActiveKeys(): string[] {
    return [...this.actives.keys()];
  }
}

// Singleton
const engine = new SoundscapeEngine();

// ===================== useSoundscape HOOK =====================

export interface PomodoroState {
  isActive: boolean;
  isBreak: boolean;
  minutesTotal: number;
  breakMinutes: number;
  secondsLeft: number;
  sessionsCompleted: number;
}

export interface SoundscapeState {
  mainScape: string | null;
  auxScapes: string[];
  activeBowls: string[];
  isPlaying: boolean;
  timer: number; // minutes, 0 = unlimited
  timerLeft: number; // seconds
  activeScene: string | null;
  pomodoro: PomodoroState;
}

export function useSoundscape() {
  const [mainScape, setMainScape] = useState<string | null>(null);
  const [auxScapes, setAuxScapes] = useState<string[]>([]);
  const [activeBowls, setActiveBowls] = useState<string[]>([]);
  const [timer, setTimerVal] = useState(0);
  const [timerLeft, setTimerLeft] = useState(0);
  const [activeScene, setActiveScene] = useState<string | null>(null);
  const [pomodoro, setPomodoro] = useState<PomodoroState>({
    isActive: false,
    isBreak: false,
    minutesTotal: 25,
    breakMinutes: 5,
    secondsLeft: 0,
    sessionsCompleted: 0,
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pomodoroRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer logic
  useEffect(() => {
    if (timer > 0) {
      setTimerLeft(timer * 60);
      timerRef.current = setInterval(() => {
        setTimerLeft(prev => {
          if (prev <= 1) {
            engine.stopAll();
            setMainScape(null);
            setAuxScapes([]);
            setActiveBowls([]);
            setTimerVal(0);
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimerLeft(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { engine.stopAll(); };
  }, []);

  const playMain = useCallback((preset: ScapePreset) => {
    // Stop current main
    if (mainScape) engine.stop(mainScape);
    engine.play(preset);
    setMainScape(preset.key);
  }, [mainScape]);

  const toggleAux = useCallback((preset: ScapePreset) => {
    if (engine.isPlaying(preset.key)) {
      engine.stop(preset.key);
      setAuxScapes(prev => prev.filter(k => k !== preset.key));
    } else {
      // Max 2 aux
      if (auxScapes.length >= 2) {
        // Remove oldest aux
        const oldest = auxScapes[0];
        engine.stop(oldest);
        setAuxScapes(prev => [...prev.slice(1), preset.key]);
      } else {
        setAuxScapes(prev => [...prev, preset.key]);
      }
      engine.play(preset);
    }
  }, [auxScapes]);

  const stopAll = useCallback(() => {
    engine.stopAll();
    setMainScape(null);
    setAuxScapes([]);
    setActiveBowls([]);
    setTimerVal(0);
  }, []);

  const setTimer = useCallback((minutes: number) => {
    setTimerVal(minutes);
  }, []);

  /** 開啟/關閉水晶缽 */
  const toggleBowl = useCallback((bowl: CrystalBowlConfig) => {
    if (engine.isBowlPlaying(bowl.key)) {
      engine.stopBowl(bowl.key);
      setActiveBowls(prev => prev.filter(k => k !== bowl.key));
    } else {
      engine.startBowl(bowl, 0.25);
      setActiveBowls(prev => [...prev, bowl.key]);
    }
  }, []);

  /** 單擊水晶缽（一次性） */
  const strikeBowl = useCallback((bowl: CrystalBowlConfig) => {
    engine.strikeOnce(bowl, 0.35);
  }, []);

  /** Play emotion-recommended soundscape */
  const playForEmotion = useCallback((emotionKey: string) => {
    engine.stopAll();
    setActiveBowls([]);
    setActiveScene(null);
    stopPomodoro();
    const recommended = EMOTION_SCAPE_MAP[emotionKey] || ['ocean-far'];
    const mainPreset = SCAPE_PRESETS.find(p => p.key === recommended[0]);
    if (mainPreset) {
      engine.play(mainPreset);
      setMainScape(mainPreset.key);
    }
    const newAux: string[] = [];
    for (let i = 1; i < recommended.length; i++) {
      const auxPreset = SCAPE_PRESETS.find(p => p.key === recommended[i]);
      if (auxPreset) {
        engine.play(auxPreset);
        newAux.push(auxPreset.key);
      }
    }
    setAuxScapes(newAux);
  }, []);

  /** 播放情境模式 */
  const playScene = useCallback((sceneMode: SceneMode) => {
    // Stop everything first
    engine.stopAll();
    setAuxScapes([]);
    setActiveBowls([]);

    // Find and play the scene preset
    const preset = SCAPE_PRESETS.find(p => p.key === sceneMode.presetKey);
    if (preset) {
      engine.play(preset);
      setMainScape(preset.key);
    }
    setActiveScene(sceneMode.key);

    // If scene has pomodoro, start it
    if (sceneMode.hasPomodoro) {
      startPomodoro(sceneMode.pomodoroMinutes || 25, sceneMode.pomodoroBreakMinutes || 5);
    }
  }, []);

  /** 停止情境模式 */
  const stopScene = useCallback(() => {
    engine.stopAll();
    setMainScape(null);
    setAuxScapes([]);
    setActiveBowls([]);
    setActiveScene(null);
    stopPomodoro();
  }, []);

  /** 番茄鐘：開始 */
  const startPomodoro = useCallback((minutes: number = 25, breakMinutes: number = 5) => {
    if (pomodoroRef.current) clearInterval(pomodoroRef.current);

    setPomodoro(prev => ({
      ...prev,
      isActive: true,
      isBreak: false,
      minutesTotal: minutes,
      breakMinutes: breakMinutes,
      secondsLeft: minutes * 60,
    }));

    pomodoroRef.current = setInterval(() => {
      setPomodoro(prev => {
        if (prev.secondsLeft <= 1) {
          // 時間到
          if (!prev.isBreak) {
            // 專注結束 → 進入休息
            // 播放溫柔提示音
            const chimePreset = SCAPE_PRESETS.find(p => p.key === 'scene-pomodoro');
            if (chimePreset) {
              // 短暫提高音量作為提示
              engine.setVolume(chimePreset.key, chimePreset.defaultGain * 1.5);
              setTimeout(() => {
                engine.setVolume(chimePreset.key, chimePreset.defaultGain);
              }, 2000);
            }
            return {
              ...prev,
              isBreak: true,
              secondsLeft: prev.breakMinutes * 60,
              sessionsCompleted: prev.sessionsCompleted + 1,
            };
          } else {
            // 休息結束 → 重新開始專注
            return {
              ...prev,
              isBreak: false,
              secondsLeft: prev.minutesTotal * 60,
            };
          }
        }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);
  }, []);

  /** 番茄鐘：停止 */
  const stopPomodoro = useCallback(() => {
    if (pomodoroRef.current) {
      clearInterval(pomodoroRef.current);
      pomodoroRef.current = null;
    }
    setPomodoro(prev => ({
      ...prev,
      isActive: false,
      isBreak: false,
      secondsLeft: 0,
    }));
  }, []);

  // Cleanup pomodoro on unmount
  useEffect(() => {
    return () => {
      if (pomodoroRef.current) clearInterval(pomodoroRef.current);
    };
  }, []);

  return {
    mainScape,
    auxScapes,
    activeBowls,
    isPlaying: mainScape !== null || auxScapes.length > 0 || activeBowls.length > 0,
    timer,
    timerLeft,
    activeScene,
    pomodoro,
    playMain,
    toggleAux,
    stopAll,
    setTimer,
    playForEmotion,
    toggleBowl,
    strikeBowl,
    playScene,
    stopScene,
    startPomodoro,
    stopPomodoro,
  };
}
