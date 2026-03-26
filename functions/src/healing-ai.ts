/**
 * Healing AI Cloud Function
 * POST /api/healing/companion — 生成個人化療癒內容
 * POST /api/healing/plant-diagnosis — 植物照片 AI 診斷（Phase 2）
 */

import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { buildUserMessage, getSystemPrompt, HealingInput, HealingOutput } from "./prompt-builder";

const router = Router();

// Claude API 客戶端（延遲初始化，避免 cold start 時因缺 key 而報錯）
let claudeClient: Anthropic | null = null;

function getClaudeClient(): Anthropic {
  if (!claudeClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }
    claudeClient = new Anthropic({ apiKey });
  }
  return claudeClient;
}

// ========================
// POST /api/healing/companion
// 主要端點：生成「懂你」頁面的個人化內容
// ========================
router.post("/companion", async (req, res) => {
  try {
    const input: HealingInput = req.body;

    // 基本驗證
    if (!input.context || !input.context.today) {
      res.status(400).json({ error: "Missing required field: context.today" });
      return;
    }

    // 補齊預設值
    if (!input.user) {
      input.user = { nickname: '', location: '台北', lastActiveDays: 0 };
    }
    if (!input.courses) input.courses = [];
    if (!input.plants) input.plants = [];
    if (!input.interests) input.interests = {};
    if (!input.history) {
      input.history = { lastRecommendedPlants: [], lastRecommendedArticles: [], lastPushType: '' };
    }
    if (!input.context.timeOfDay) {
      const hour = new Date().getHours();
      input.context.timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    }

    const systemPrompt = getSystemPrompt();
    const userMessage = buildUserMessage(input);

    const client = getClaudeClient();
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: systemPrompt,
      messages: [
        { role: "user", content: userMessage },
      ],
    });

    // 解析 Claude 回應
    const textBlock = response.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from Claude");
    }

    let output: HealingOutput;
    try {
      // 移除可能的 markdown 標記
      let jsonStr = textBlock.text.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
      }
      output = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse Claude response:", textBlock.text);
      throw new Error("Invalid JSON response from AI");
    }

    res.json({
      success: true,
      data: output,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    });
  } catch (error) {
    const err = error as Error;
    console.error("Healing AI Error:", err.message);

    // 回傳 fallback 內容，確保前端不會空白
    if (err.message.includes("ANTHROPIC_API_KEY")) {
      res.status(503).json({
        error: "AI service not configured",
        fallback: generateFallbackContent(req.body),
      });
      return;
    }

    res.status(500).json({
      error: err.message || "AI generation failed",
      fallback: generateFallbackContent(req.body),
    });
  }
});

// ========================
// POST /api/healing/plant-diagnosis
// Phase 2：植物照片 AI 診斷
// ========================
router.post("/plant-diagnosis", async (req, res) => {
  try {
    const { imageBase64, imageMediaType, plantName } = req.body;

    if (!imageBase64) {
      res.status(400).json({ error: "Missing required field: imageBase64" });
      return;
    }

    const client = getClaudeClient();
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: `你是一位友善的植物照護顧問。使用者會上傳植物照片，請你：
1. 辨識植物種類（如果能辨識的話）
2. 觀察健康狀況（葉片顏色、形態、是否有病蟲害跡象）
3. 給出照護建議（澆水、日照、施肥、病蟲害處理）

語氣要溫柔友善，像朋友在聊天。使用繁體中文。
回覆限制在 200 字以內，不要用條列式。`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: imageMediaType || "image/jpeg",
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: plantName
                ? `這是我的「${plantName}」，幫我看看它的狀況如何？有什麼需要注意的嗎？`
                : "幫我看看這株植物的狀況如何？它是什麼品種？有什麼照護建議嗎？",
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from Claude");
    }

    res.json({
      success: true,
      diagnosis: textBlock.text,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    });
  } catch (error) {
    const err = error as Error;
    console.error("Plant Diagnosis Error:", err.message);
    res.status(500).json({
      error: err.message || "Plant diagnosis failed",
    });
  }
});

// ========================
// Fallback：AI 不可用時的靜態內容
// ========================
function generateFallbackContent(input?: Partial<HealingInput>): HealingOutput {
  const today = new Date();
  const hour = today.getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

  const weatherMessages: Record<string, string> = {
    '晴': '今天天氣不錯，出門走走也好',
    '雨': '下雨天適合待在家裡，泡杯茶放鬆',
    '陰': '天空有些灰灰的，但也有它安靜的美',
    '多雲': '雲朵在散步，你也可以慢慢來',
  };

  const rituals: Record<string, string> = {
    morning: '早上幫自己倒杯溫水，慢慢喝完再開始今天',
    afternoon: '下午了，站起來伸個懶腰，看看窗外',
    evening: '今天辛苦了，閉上眼睛做三次深呼吸',
  };

  const weather = input?.context?.weather || '晴';
  const temp = input?.context?.temperatureC || 25;

  return {
    healing_home: {
      weather_banner: {
        text: weatherMessages[weather] || weatherMessages['晴'],
        weather,
        temperature_c: temp,
      },
      today_message: '今天也有好好照顧自己嗎？',
      care_tips: [
        { category: 'general', text: '每一件作品都值得被好好對待' },
      ],
      ritual: {
        text: rituals[timeOfDay] || rituals.morning,
        category: 'breath',
        time_of_day: timeOfDay,
      },
      recommendations: [],
    },
    plant_recommendation: null,
    push_strategy: {
      triggered_types: [],
      selected_types: ['情緒'],
      reason: 'AI 暫時無法使用，使用保底情緒推播',
    },
    push_notifications: [
      { type: '情緒', text: '嘿，你最近好嗎？偶爾也想想自己' },
    ],
  };
}

export { router as healingAiRouter };
