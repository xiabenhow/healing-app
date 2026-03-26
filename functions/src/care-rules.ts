/**
 * 照護規則引擎 (Care Rules Engine)
 * 根據課程類別自動產生照護規則，並計算到期狀態
 */

// ===== 課程類別 → 照護規則對照表 =====
export interface CareRule {
  key: string;           // watering, sunlight, use_reminder, cleanse, etc.
  label: string;         // 澆水, 日照, 使用提醒, etc.
  frequencyDays: number;
  weatherSensitive: boolean;
  enabled: boolean;
}

export interface CourseRecord {
  source: 'order' | 'custom';
  category: string;       // plant, fragrance, candle, crystal, leather
  subCategory: string;    // 多肉, 觀葉, 精油調香, etc.
  courseName: string;
  courseDate: string;      // ISO date
  careRules: CareRule[];
}

export interface CareStatus {
  actionType: string;
  label: string;
  status: 'due' | 'upcoming' | 'done';
  dueInDays: number;
  message: string;
}

// WC 分類 ID → 課程類型
export const CATEGORY_TO_COURSE_TYPE: Record<number, string> = {
  173: 'fragrance',   // 精油調香
  18: 'candle',       // 香氛蠟燭
  22: 'plant',        // 多肉植栽
  21: 'crystal',      // 手作飾品
  200: 'crystal',     // 下班隨手飾
  211: 'leather',     // 皮革
  212: 'leather',     // 皮革子分類
  149: 'candle',      // 環氧樹脂
  25: 'plant',        // 花藝
  150: 'leather',     // 梭織
  151: 'plant',       // 藍染
  24: 'crystal',      // 畫畫
};

// 各課程類別的預設照護規則
const DEFAULT_CARE_RULES: Record<string, CareRule[]> = {
  plant: [
    { key: 'watering', label: '澆水', frequencyDays: 7, weatherSensitive: true, enabled: true },
    { key: 'sunlight', label: '日照', frequencyDays: 1, weatherSensitive: true, enabled: true },
  ],
  fragrance: [
    { key: 'use_reminder', label: '使用精油', frequencyDays: 3, weatherSensitive: false, enabled: true },
  ],
  candle: [
    { key: 'use_reminder', label: '點蠟燭', frequencyDays: 7, weatherSensitive: false, enabled: true },
  ],
  crystal: [
    { key: 'cleanse', label: '淨化水晶', frequencyDays: 14, weatherSensitive: false, enabled: true },
  ],
  leather: [
    { key: 'maintenance', label: '皮革保養', frequencyDays: 30, weatherSensitive: false, enabled: true },
  ],
};

// 多肉的子類別有更細緻的規則
const SUB_CATEGORY_OVERRIDES: Record<string, Partial<CareRule>[]> = {
  '觀葉': [
    { key: 'watering', frequencyDays: 3 },
    { key: 'leaf_care', label: '擦葉', frequencyDays: 14, weatherSensitive: false, enabled: true },
  ],
  '香草': [
    { key: 'watering', frequencyDays: 2 },
    { key: 'pruning', label: '修剪', frequencyDays: 14, weatherSensitive: false, enabled: true },
  ],
};

/**
 * 根據課程類別產生照護規則
 */
export function getCareRulesForCategory(category: string, subCategory?: string): CareRule[] {
  const baseRules = DEFAULT_CARE_RULES[category] || [];
  const rules = baseRules.map(r => ({ ...r })); // deep copy

  if (subCategory && SUB_CATEGORY_OVERRIDES[subCategory]) {
    for (const override of SUB_CATEGORY_OVERRIDES[subCategory]) {
      const existing = rules.find(r => r.key === override.key);
      if (existing) {
        Object.assign(existing, override);
      } else if (override.label) {
        rules.push({
          key: override.key || '',
          label: override.label,
          frequencyDays: override.frequencyDays || 7,
          weatherSensitive: override.weatherSensitive || false,
          enabled: override.enabled !== undefined ? override.enabled : true,
        });
      }
    }
  }

  return rules;
}

/**
 * 計算某個照護動作的到期狀態
 */
export function calculateCareStatus(
  rule: CareRule,
  lastDone: string,  // ISO date
  today: string,     // ISO date
  weather?: string
): CareStatus {
  const lastDate = new Date(lastDone);
  const todayDate = new Date(today);
  const diffMs = todayDate.getTime() - lastDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const dueInDays = rule.frequencyDays - diffDays;

  // 天氣敏感項目的特殊處理
  if (rule.weatherSensitive && weather) {
    if (rule.key === 'watering' && weather === '雨') {
      return {
        actionType: rule.key,
        label: rule.label,
        status: 'done',
        dueInDays: Math.max(dueInDays, 1), // 雨天等於自然澆了
        message: '外面在下雨，大自然幫你澆了，不用擔心',
      };
    }
    if (rule.key === 'sunlight' && weather === '雨') {
      return {
        actionType: rule.key,
        label: rule.label,
        status: 'upcoming',
        dueInDays: 1,
        message: '今天下雨，植物在室內待著就好',
      };
    }
  }

  if (dueInDays <= 0) {
    return {
      actionType: rule.key,
      label: rule.label,
      status: 'due',
      dueInDays,
      message: generateDueMessage(rule),
    };
  } else if (dueInDays <= 2) {
    return {
      actionType: rule.key,
      label: rule.label,
      status: 'upcoming',
      dueInDays,
      message: `還有 ${dueInDays} 天${rule.label}，不急`,
    };
  } else {
    return {
      actionType: rule.key,
      label: rule.label,
      status: 'done',
      dueInDays,
      message: '這週照顧得很好，繼續保持',
    };
  }
}

function generateDueMessage(rule: CareRule): string {
  const messages: Record<string, string[]> = {
    watering: [
      '你的植物大概渴了，今天可以給它喝點水',
      '該幫植物補水了，記得少量慢慢澆',
      '植物在等你幫它澆水呢',
    ],
    sunlight: [
      '今天天氣不錯，可以讓植物出去曬曬太陽',
      '植物需要陽光，找個有光的角落放放',
    ],
    use_reminder: [
      '好久沒用了，今天給自己一點香氣吧',
      '精油放著也寂寞，今晚滴一滴陪陪自己',
    ],
    cleanse: [
      '你的水晶需要淨化一下了，幫它洗個澡吧',
      '該幫水晶充充電了',
    ],
    maintenance: [
      '皮革作品需要保養了，擦點保養油讓它亮起來',
    ],
    leaf_care: [
      '葉子上可能積了灰塵，輕輕擦一下讓它呼吸',
    ],
    pruning: [
      '香草長得差不多了，可以修剪一下促進新芽',
    ],
  };

  const pool = messages[rule.key] || [`該${rule.label}了`];
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 天氣影響判斷
 */
export function getWeatherImpact(
  weather: string,
  temperatureC: number,
  courses: CourseRecord[]
): { hasImpact: boolean; impacts: string[] } {
  const impacts: string[] = [];
  const hasPlant = courses.some(c => c.category === 'plant');

  if (hasPlant) {
    if (weather === '雨') {
      impacts.push('雨天不適合澆水，戶外植物需要收進來');
    }
    if (weather === '晴' && temperatureC > 33) {
      impacts.push('高溫警告：避免正午曝曬植物');
    }
    if (weather === '晴' && temperatureC <= 33) {
      impacts.push('適合讓植物曬曬太陽');
    }
  }

  return { hasImpact: impacts.length > 0, impacts };
}
