"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupOldCallbacks = exports.api = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv = __importStar(require("dotenv"));
const wc_proxy_1 = require("./wc-proxy");
const ecpay_1 = require("./ecpay");
const linepay_1 = require("./linepay");
const invoice_1 = require("./invoice");
const member_1 = require("./member");
// 載入環境變數
dotenv.config();
// 初始化 Firebase Admin SDK
admin.initializeApp();
// 建立 Express app
const app = (0, express_1.default)();
// 中介軟體
app.use(express_1.default.json({ limit: "10mb" }));
app.use(express_1.default.urlencoded({ limit: "10mb", extended: true }));
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
app.use((0, cors_1.default)(corsOptions));
// 路由
app.use("/api/wc", wc_proxy_1.wcProxyRouter);
app.use("/api/ecpay", ecpay_1.ecpayRouter);
app.use("/api/linepay", linepay_1.linePayRouter);
app.use("/api/invoice", invoice_1.invoiceRouter);
app.use("/api/member", member_1.memberRouter);
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
            health: "/health",
        },
    });
});
// 錯誤處理
app.use((err, req, res, next) => {
    const error = err;
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
exports.api = functions.https.onRequest(app);
// 定時清理過期的 ecpay 回調記錄
exports.cleanupOldCallbacks = functions.https.onRequest(async (req, res) => {
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
    }
    catch (error) {
        console.error("Cleanup Error:", error);
        res.status(500).json({ error: "Cleanup failed" });
    }
});
//# sourceMappingURL=index.js.map