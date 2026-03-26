import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import express, { Express } from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import { wcProxyRouter } from "./wc-proxy";
import { ecpayRouter } from "./ecpay";
import { linePayRouter } from "./linepay";
import { invoiceRouter } from "./invoice";
import { memberRouter } from "./member";
import { healingAiRouter } from "./healing-ai";

// 載入環境變數
dotenv.config();

// 初始化 Firebase Admin SDK
admin.initializeApp();

// 建立 Express app
const app: Express = express();

// 中介軟體
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// CORS 設定
const corsOptions = {
  origin: [
    "https://healing-6b425.web.app",
    "https://healing-6b425.firebaseapp.com",
    "http://localhost:3000",
    "http://localhost:5173",
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

// 路由
app.use("/api/wc", wcProxyRouter);
app.use("/api/ecpay", ecpayRouter);
app.use("/api/linepay", linePayRouter);
app.use("/api/invoice", invoiceRouter);
app.use("/api/member", memberRouter);
app.use("/api/healing", healingAiRouter);

// 健康檢查
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 首頁
app.get("/", (req, res) => {
  res.json({
    message: "Healing App Cloud Functions",
    version: "1.0.0",
    endpoints: {
      wc: "/api/wc",
      ecpay: "/api/ecpay",
      linepay: "/api/linepay",
      invoice: "/api/invoice",
      member: "/api/member",
      healing: "/api/healing",
      health: "/health",
    },
  });
});

// 錯誤處理
app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const error = err as Error;
  console.error("Error:", error.message);
  res.status(500).json({
    error: "Internal Server Error",
    message: error.message,
  });
});

// 404 處理
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.path} not found`,
  });
});

// 匯出 Cloud Function (v1 1st gen)
export const api = functions.https.onRequest(app);

// 定時清理過期的 ecpay 回調記錄
export const cleanupOldCallbacks = functions.https.onRequest(
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const db = admin.firestore();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const snapshot = await db
        .collection("ecpay_callbacks")
        .where("timestamp", "<", thirtyDaysAgo)
        .get();

      let deletedCount = 0;
      for (const doc of snapshot.docs) {
        await doc.ref.delete();
        deletedCount++;
      }

      console.log(`Cleaned up ${deletedCount} old callbacks`);
      res.json({ success: true, deletedCount });
    } catch (error) {
      console.error("Cleanup Error:", error);
      res.status(500).json({ error: "Cleanup failed" });
    }
  }
);
