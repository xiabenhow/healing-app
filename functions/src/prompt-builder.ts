/**
 * AI Prompt Builder (v3)
 * 根據使用者資料組裝 Healing Companion system prompt 與 user message
 */

export interface HealingInput {
  user: {
    nickname: string;
    location: string;
    lastActiveDays: number;
  };
  courses: Array<{
    source: 'order' | 'custom';
    category: string;
    subCategory: string;
    courseName: string;
    courseDate: string;
  }>;
  plants: Array<{
    name: string;
    lastWatered: string;
    intervalDays: number;
  }>;
  interests: Record<string, number>;
  context: {
    weather: string;
    today: string;
    timeOfDay: 'morning' | 'afternoon' | 'evening';
    temperatureC: number;
  };
  history: {
    lastRecommendedPlants: string[];
    lastRecommendedArticles: string[];
    lastPushType: string;
  };
}

export interface HealingOutput {
  healing_home: {
    weather_banner: {
      text: string;
      weather: string;
      temperature_c: number;
    };
    today_message: string;
    care_tips: Array<{
      category: string;
      text: string;
    }>;
    ritual: {
      text: string;
      category: string;
      time_of_day: string;
    };
    recommendations: Array<{
      type: string;
      title: string;
      reason: string;
    }>;
  };
  plant_recommendation: {
    name: string;
    why: string;
    care: string;
    healing_quote: string;
  } | null;
  push_strategy: {
    triggered_types: string[];
    selected_types: string[];
    reason: string;
  };
  push_notifications: Array<{
    type: string;
    text: string;
  }>;
}

const SYSTEM_PROMPT = `你是「療癒型生活助理（Healing Companion）」，屬於「下班隨手作」品牌。
你的角色不是資訊提供者，而是「照顧一個人的生活」的陪伴者。

語氣原則：
- 像熟悉的朋友，不像系統通知
- 有畫面感，讓人腦中浮現場景
- 不說教、不命令、不商業推銷
- 溫柔但不黏膩，簡潔但有溫度
- 不像 AI，像一個懂植物、懂生活的朋友
- 使用繁體中文

你必須嚴格按照指定的 JSON 格式輸出，不要包含任何 JSON 以外的文字。`;

export function buildUserMessage(input: HealingInput): string {
  const { user, courses, plants, interests, context, history } = input;

  // 計算植物澆水狀態
  const plantStatuses = plants.map(p => {
    const lastDate = new Date(p.lastWatered);
    const today = new Date(context.today);
    const diffDays = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    const dueInDays = p.intervalDays - diffDays;
    return { ...p, diffDays, dueInDays, isDue: dueInDays <= 0 };
  });

  const hasPlant = courses.some(c => c.category === 'plant') || (interests.plant || 0) >= 3;
  const hasScent = courses.some(c => ['fragrance', 'candle'].includes(c.category)) || (interests.scent || 0) >= 3;
  const hasCrystal = courses.some(c => c.category === 'crystal') || (interests.crystal || 0) >= 3;

  // 推播觸發判斷
  const triggers: string[] = [];
  if (plantStatuses.some(p => p.isDue)) triggers.push('任務');
  if (user.lastActiveDays > 3) triggers.push('情緒');
  if (hasPlant && ['雨', '晴'].includes(context.weather)) triggers.push('天氣');
  if (Object.values(interests).some(v => v >= 3)) triggers.push('推薦');

  return `請根據以下使用者資料，生成個人化療癒內容。

【使用者】
暱稱：${user.nickname || '你'}
地區：${user.location}
距離上次活躍：${user.lastActiveDays} 天

【課程紀錄】
${courses.length > 0 ? courses.map(c => `- ${c.courseName}（${c.category}/${c.subCategory}）上課日：${c.courseDate}，來源：${c.source === 'order' ? '訂單' : '自訂'}`).join('\n') : '尚無課程紀錄'}

【植物照護狀態】
${plantStatuses.length > 0 ? plantStatuses.map(p => `- ${p.name}：上次澆水 ${p.lastWatered}，間隔 ${p.intervalDays} 天，${p.isDue ? '⚠️ 已到期（過期 ' + Math.abs(p.dueInDays) + ' 天）' : '還有 ' + p.dueInDays + ' 天'}`).join('\n') : '尚無植物紀錄'}

【興趣權重 0-5】
${Object.entries(interests).map(([k, v]) => `${k}: ${v}`).join(', ')}

【環境】
天氣：${context.weather}，氣溫：${context.temperatureC}°C
日期：${context.today}，時段：${context.timeOfDay === 'morning' ? '早上' : context.timeOfDay === 'afternoon' ? '下午' : '晚上'}

【歷史（避免重複）】
已推薦植物：${history.lastRecommendedPlants.join(', ') || '無'}
已推薦文章：${history.lastRecommendedArticles.join(', ') || '無'}
上次推播類型：${history.lastPushType || '無'}

【推播觸發判斷】
觸發的類型：${triggers.join(', ') || '無'}
規則：最多選 2 種，若與上次推播類型相同則降優先。若都沒觸發則保底選「情緒型」。

請輸出以下 JSON（不要包含 markdown 標記或其他文字）：
{
  "healing_home": {
    "weather_banner": {
      "text": "（≤35字，${hasPlant ? '融入植物照護場景' : '一般生活建議'}，不像氣象報告）",
      "weather": "${context.weather}",
      "temperature_c": ${context.temperatureC}
    },
    "today_message": "（≤30字，一句溫暖的陪伴語，讓人有被理解的感覺）",
    "care_tips": [
      { "category": "plant|fragrance|crystal|leather|candle", "text": "（照護小知識，每次不同）" }
    ],
    "ritual": {
      "text": "（2分鐘內能完成的小儀式，根據時段和興趣）",
      "category": "plant|scent|breath|crystal",
      "time_of_day": "${context.timeOfDay}"
    },
    "recommendations": [
      { "type": "article|course|plant|product", "title": "名稱", "reason": "一句話推薦理由" }
    ]
  },
  "plant_recommendation": ${hasPlant ? `{
    "name": "（台灣常見好照顧的植物，排除：${history.lastRecommendedPlants.join(', ') || '無'}）",
    "why": "（為什麼適合這位使用者，1句話）",
    "care": "（最簡單的照顧方式，1句話）",
    "healing_quote": "（療癒句，1句話）"
  }` : 'null'},
  "push_strategy": {
    "triggered_types": ${JSON.stringify(triggers)},
    "selected_types": ["（從觸發中選最多2種）"],
    "reason": "（選擇理由）"
  },
  "push_notifications": [
    { "type": "任務|天氣|情緒|推薦", "text": "（15-30字，像朋友提醒，不用命令句）" }
  ]
}`;
}

export function getSystemPrompt(): string {
  return SYSTEM_PROMPT;
}
