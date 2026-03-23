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
exports.linePayRouter = void 0;
// firebase-functions imported in index.ts
const admin = __importStar(require("firebase-admin"));
const express_1 = require("express");
const crypto = __importStar(require("crypto"));
const axios_1 = __importDefault(require("axios"));
const router = (0, express_1.Router)();
exports.linePayRouter = router;
// LINE Pay 配置
const LINE_PAY_CHANNEL_ID = process.env.LINE_PAY_CHANNEL_ID || "";
const LINE_PAY_CHANNEL_SECRET = process.env.LINE_PAY_CHANNEL_SECRET || "";
const LINE_PAY_API_BASE = "https://api-pay.line.me/v3/payments";
// LINE Pay API 客戶端
const linePayApi = axios_1.default.create({
    baseURL: LINE_PAY_API_BASE,
    timeout: 10000,
});
// 生成 LINE Pay 簽名
function generateLinePaySignature(nonce, timestamp, body) {
    const message = `${LINE_PAY_CHANNEL_SECRET}${nonce}${timestamp}${body}`;
    return crypto.createHmac("sha256", LINE_PAY_CHANNEL_SECRET)
        .update(message)
        .digest("base64");
}
// 生成 UUID（用於 nonce）
function generateNonce() {
    return crypto.randomBytes(16).toString("hex");
}
// POST /api/linepay/request - 發起 LINE Pay 付款請求
router.post("/request", async (req, res) => {
    try {
        const { amount, orderId, products, redirectUrls, } = req.body;
        if (!amount || !orderId) {
            res.status(400).json({ error: "amount and orderId are required" });
            return;
        }
        // 金額轉為整數
        const totalAmount = Math.round(amount);
        const nonce = generateNonce();
        const timestamp = Date.now().toString();
        const requestBody = {
            amount: totalAmount,
            currency: "TWD",
            orderId: orderId,
            packages: [
                {
                    id: orderId,
                    amount: totalAmount,
                    products: products || [
                        {
                            name: "Healing Service",
                            quantity: 1,
                            price: totalAmount,
                        },
                    ],
                },
            ],
            redirectUrls: {
                confirmUrl: redirectUrls?.confirmUrl ||
                    "https://healing-6b425.web.app/payment/linepay/confirm",
                cancelUrl: redirectUrls?.cancelUrl ||
                    "https://healing-6b425.web.app/payment/linepay/cancel",
            },
        };
        const bodyString = JSON.stringify(requestBody);
        const signature = generateLinePaySignature(nonce, timestamp, bodyString);
        const headers = {
            "Content-Type": "application/json",
            "X-LINE-ChannelId": LINE_PAY_CHANNEL_ID,
            "X-LINE-Authorization-Nonce": nonce,
            "X-LINE-Authorization": signature,
        };
        const response = await linePayApi.post("/request", requestBody, {
            headers,
        });
        // 取得 LINE Pay 網址
        const paymentUrl = response.data?.info?.paymentUrl?.web;
        if (!paymentUrl) {
            throw new Error("No payment URL returned from LINE Pay");
        }
        // 記錄到 Firestore
        const db = admin.firestore();
        await db.collection("linepay_requests").add({
            orderId: orderId,
            amount: totalAmount,
            transactionId: response.data?.info?.transactionId,
            paymentUrl: paymentUrl,
            status: "pending",
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        res.json({
            success: true,
            paymentUrl: paymentUrl,
            transactionId: response.data?.info?.transactionId,
        });
    }
    catch (error) {
        const err = error;
        console.error("LINE Pay Request Error:", err.message);
        res.status(err.response?.status || 500).json({
            error: "Failed to create LINE Pay request",
            details: err.response?.data,
        });
    }
});
// GET /api/linepay/confirm - LINE Pay 確認付款
router.get("/confirm", async (req, res) => {
    try {
        const { transactionId, orderId } = req.query;
        if (!transactionId) {
            res.status(400).json({ error: "transactionId is required" });
            return;
        }
        const nonce = generateNonce();
        const timestamp = Date.now().toString();
        const bodyString = ""; // GET 請求通常沒有 body
        const signature = generateLinePaySignature(nonce, timestamp, bodyString);
        const headers = {
            "X-LINE-ChannelId": LINE_PAY_CHANNEL_ID,
            "X-LINE-Authorization-Nonce": nonce,
            "X-LINE-Authorization": signature,
        };
        const response = await linePayApi.post(`/${transactionId}/confirm`, {}, {
            headers,
            params: {
                orderId: orderId,
            },
        });
        // 記錄確認結果
        const db = admin.firestore();
        await db.collection("linepay_confirmations").add({
            transactionId: transactionId,
            orderId: orderId,
            status: response.data?.body?.status,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        res.json({
            success: true,
            status: response.data?.body?.status,
            transactionId: transactionId,
        });
    }
    catch (error) {
        const err = error;
        console.error("LINE Pay Confirm Error:", err.message);
        res.status(err.response?.status || 500).json({
            error: "Failed to confirm LINE Pay payment",
            details: err.response?.data,
        });
    }
});
// GET /api/linepay/cancel - LINE Pay 取消
router.get("/cancel", async (req, res) => {
    try {
        const { transactionId, orderId } = req.query;
        if (!transactionId) {
            res.status(400).json({ error: "transactionId is required" });
            return;
        }
        // 更新 Firestore 記錄
        const db = admin.firestore();
        const snapshot = await db
            .collection("linepay_requests")
            .where("transactionId", "==", transactionId)
            .limit(1)
            .get();
        if (!snapshot.empty) {
            await snapshot.docs[0].ref.update({
                status: "cancelled",
                cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        res.json({
            success: true,
            message: "Payment cancelled",
            transactionId: transactionId,
        });
    }
    catch (error) {
        const err = error;
        console.error("LINE Pay Cancel Error:", err.message);
        res.status(err.response?.status || 500).json({
            error: "Failed to cancel LINE Pay payment",
        });
    }
});
//# sourceMappingURL=linepay.js.map