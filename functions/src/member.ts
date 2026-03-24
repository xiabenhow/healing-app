// firebase-functions imported in index.ts
import axios from "axios";
import { Router } from "express";

const router = Router();

// WooCommerce 網站 URL
const WC_SITE = process.env.WC_URL || "https://www.xiabenhow.com";

interface WCPointsResponse {
  email: string;
  user_id: number;
  display_name: string;
  points: number;
  points_collected: number;
  points_to_redeem: number;
  points_used: number;
  total_spent: number;
  history: Array<{
    date: string;
    description: string;
    points: number;
  }>;
}

// GET /api/member/points?email=xxx - 從 WooCommerce YITH 查詢真實紅利點數
router.get("/points", async (req, res) => {
  try {
    const { email } = req.query as { email?: string };

    if (!email) {
      res.status(400).json({ error: "email is required" });
      return;
    }

    // 呼叫 WordPress REST API 取得 YITH 紅利點數
    const response = await axios.get<WCPointsResponse>(
      `${WC_SITE}/wp-json/healing/v1/points`,
      {
        params: { email },
        timeout: 10000,
      }
    );

    const data = response.data;

    res.json({
      email: data.email,
      points: data.points,                     // 目前可用點數
      pointsCollected: data.points_collected,   // 累計獲得點數
      pointsToRedeem: data.points_to_redeem,    // 可兌換點數
      pointsUsed: data.points_used,             // 已使用點數
      totalSpent: data.total_spent,             // 消費總額
      displayName: data.display_name,
      history: data.history,
    });
  } catch (error) {
    console.error("Query Points Error:", error);
    res.status(500).json({ error: "無法取得紅利點數" });
  }
});

// POST /api/member/points/sync - 接收 WooCommerce 訂單完成通知
router.post("/points/sync", async (req, res) => {
  try {
    const { email, order_id, total, event } = req.body;

    console.log(`[Points Sync] 收到事件: ${event}, 訂單: #${order_id}, Email: ${email}, 金額: ${total}`);

    // 這裡可以做額外處理，例如：
    // - 發送推播通知給 App 使用者
    // - 更新本地快取
    // - 記錄 analytics

    res.json({
      success: true,
      message: `已收到訂單 #${order_id} 完成通知`,
      event: event,
    });
  } catch (error) {
    console.error("Points Sync Error:", error);
    res.status(500).json({ error: "Sync failed" });
  }
});

// POST /api/member/order-complete - 從 App 觸發訂單完成（寄出 WooCommerce 完成信件）
router.post("/order-complete", async (req, res) => {
  try {
    const { order_id } = req.body;

    if (!order_id) {
      res.status(400).json({ error: "order_id is required" });
      return;
    }

    // 呼叫 WordPress REST API 觸發訂單完成 + 寄信
    const response = await axios.post(
      `${WC_SITE}/wp-json/healing/v1/order-completed`,
      { order_id },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 15000,
      }
    );

    res.json({
      success: true,
      order_id: order_id,
      email_sent: response.data?.email_sent || false,
      message: `訂單 #${order_id} 已標記完成，通知信已觸發`,
    });
  } catch (error) {
    console.error("Order Complete Error:", error);
    res.status(500).json({ error: "無法完成訂單" });
  }
});

export { router as memberRouter };
