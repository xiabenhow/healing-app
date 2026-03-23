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
Object.defineProperty(exports, "__esModule", { value: true });
exports.memberRouter = void 0;
// firebase-functions imported in index.ts
const admin = __importStar(require("firebase-admin"));
const express_1 = require("express");
const router = (0, express_1.Router)();
exports.memberRouter = router;
// 點數規則：消費金額 2%，每 1 點 = NT$1
const POINTS_RATE = 0.02;
const POINTS_VALUE = 1; // 1 點 = NT$1
// GET /api/member/points?email=xxx - 查詢點數
router.get("/points", async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) {
            res.status(400).json({ error: "email is required" });
            return;
        }
        const db = admin.firestore();
        // 查詢會員積分記錄
        const memberDoc = await db.collection("members").doc(email).get();
        if (!memberDoc.exists) {
            // 新會員，初始化
            const initialData = {
                email: email,
                points: 0,
                totalSpent: 0,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            await memberDoc.ref.set(initialData);
            const response = {
                email: email,
                points: 0,
                totalSpent: 0,
                lastUpdated: new Date().toISOString(),
            };
            res.json(response);
            return;
        }
        const data = memberDoc.data();
        const response = {
            email: email,
            points: data?.points || 0,
            totalSpent: data?.totalSpent || 0,
            lastUpdated: data?.updatedAt?.toDate?.().toISOString() || new Date().toISOString(),
        };
        res.json(response);
    }
    catch (error) {
        console.error("Query Points Error:", error);
        res.status(500).json({ error: "Failed to query points" });
    }
});
// POST /api/member/points/earn - 累積點數 (訂單完成時呼叫)
router.post("/points/earn", async (req, res) => {
    try {
        const { email, amount, orderId, description } = req.body;
        if (!email || !amount || amount <= 0 || !orderId) {
            res.status(400).json({
                error: "email, amount, orderId are required and amount must be > 0",
            });
            return;
        }
        const db = admin.firestore();
        // 計算應獲得的點數（消費金額的 2%）
        const pointsToEarn = Math.floor(amount * POINTS_RATE);
        // 更新或建立會員記錄
        const memberRef = db.collection("members").doc(email);
        await db.runTransaction(async (transaction) => {
            const memberDoc = await transaction.get(memberRef);
            let currentPoints = 0;
            let totalSpent = 0;
            if (memberDoc.exists) {
                currentPoints = memberDoc.data()?.points || 0;
                totalSpent = memberDoc.data()?.totalSpent || 0;
            }
            const newPoints = currentPoints + pointsToEarn;
            const newTotalSpent = totalSpent + amount;
            transaction.set(memberRef, {
                email: email,
                points: newPoints,
                totalSpent: newTotalSpent,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            // 記錄點數歷史
            await transaction.set(db.collection("points_history").doc(), {
                email: email,
                orderId: orderId,
                type: "earn",
                pointsEarned: pointsToEarn,
                amount: amount,
                description: description || "Order completion",
                balanceBefore: currentPoints,
                balanceAfter: newPoints,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
        res.json({
            success: true,
            email: email,
            pointsEarned: pointsToEarn,
            message: `Earned ${pointsToEarn} points from order ${orderId}`,
        });
    }
    catch (error) {
        console.error("Earn Points Error:", error);
        res.status(500).json({ error: "Failed to earn points" });
    }
});
// POST /api/member/points/redeem - 折抵點數
router.post("/points/redeem", async (req, res) => {
    try {
        const { email, points, orderId, description } = req.body;
        if (!email || !points || points <= 0 || !orderId) {
            res.status(400).json({
                error: "email, points, orderId are required and points must be > 0",
            });
            return;
        }
        const db = admin.firestore();
        const memberRef = db.collection("members").doc(email);
        let redeemSuccess = false;
        let discountAmount = 0;
        await db.runTransaction(async (transaction) => {
            const memberDoc = await transaction.get(memberRef);
            if (!memberDoc.exists) {
                throw new Error("Member not found");
            }
            const currentPoints = memberDoc.data()?.points || 0;
            if (currentPoints < points) {
                throw new Error("Insufficient points");
            }
            const newPoints = currentPoints - points;
            discountAmount = points * POINTS_VALUE; // 1 點 = NT$1
            transaction.update(memberRef, {
                points: newPoints,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            // 記錄點數歷史
            await transaction.set(db.collection("points_history").doc(), {
                email: email,
                orderId: orderId,
                type: "redeem",
                pointsRedeemed: points,
                discountAmount: discountAmount,
                description: description || "Points redemption",
                balanceBefore: currentPoints,
                balanceAfter: newPoints,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
            redeemSuccess = true;
        });
        res.json({
            success: redeemSuccess,
            email: email,
            pointsRedeemed: points,
            discountAmount: discountAmount,
            message: `Redeemed ${points} points for NT$${discountAmount} discount`,
        });
    }
    catch (error) {
        const err = error;
        console.error("Redeem Points Error:", err.message);
        res.status(500).json({
            error: err.message || "Failed to redeem points",
        });
    }
});
//# sourceMappingURL=member.js.map