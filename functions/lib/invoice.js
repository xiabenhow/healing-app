import * as admin from "firebase-admin";
import { Router } from "express";
import * as crypto from "crypto";
import axios from "axios";
const router = Router();
// ECPay 電子發票配置（使用相同的 Merchant ID）
const ECPAY_MERCHANT_ID = process.env.ECPAY_MERCHANT_ID || "";
const ECPAY_HASH_KEY = process.env.ECPAY_HASH_KEY || "";
const ECPAY_HASH_IV = process.env.ECPAY_HASH_IV || "";
const ECPAY_INVOICE_API_URL = "https://einvoice.ecpay.com.tw/Invoice/Issue";
// .NET URL Encode 特殊替換
function netUrlEncode(str) {
    let encoded = encodeURIComponent(str);
    encoded = encoded
        .replace(/%2D/g, "-")
        .replace(/%5F/g, "_")
        .replace(/%2E/g, ".")
        .replace(/%21/g, "!")
        .replace(/%2A/g, "*")
        .replace(/%28/g, "(")
        .replace(/%29/g, ")");
    return encoded;
}
// 計算 CheckMacValue（與支付相同邏輯）
function calculateCheckMacValue(params) {
    const sortedKeys = Object.keys(params).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    const queryString = sortedKeys
        .map((key) => `${key}=${params[key]}`)
        .join("&");
    let hashString = `HashKey=${ECPAY_HASH_KEY}&${queryString}&HashIV=${ECPAY_HASH_IV}`;
    hashString = netUrlEncode(hashString);
    hashString = hashString.toLowerCase();
    const hashed = crypto.createHash("sha256").update(hashString).digest("hex");
    return hashed.toUpperCase();
}
// POST /api/invoice/create - 開立電子發票
router.post("/create", async (req, res) => {
    try {
        const { orderId, buyerEmail, buyerName, buyerPhone, amount, description, carrierType, carrierNum, invoiceType, companyTaxId, items, } = req.body;
        if (!orderId || !buyerEmail || !amount) {
            res
                .status(400)
                .json({
                error: "orderId, buyerEmail, amount are required",
            });
            return;
        }
        // 金額轉為整數
        const totalAmount = Math.round(amount);
        // 驗證發票類型
        if (!["personal", "donate", "company"].includes(invoiceType)) {
            res.status(400).json({ error: "Invalid invoiceType" });
            return;
        }
        // 驗證載具類型
        if (!["cloud", "phone", "citizen"].includes(carrierType)) {
            res.status(400).json({ error: "Invalid carrierType" });
            return;
        }
        // 公司發票必須有統一編號
        if (invoiceType === "company" && !companyTaxId) {
            res
                .status(400)
                .json({
                error: "companyTaxId is required for company invoices",
            });
            return;
        }
        // 載具類型對應的參數名稱
        let carrierField = "";
        switch (carrierType) {
            case "cloud":
                carrierField = "CloudCode";
                break;
            case "phone":
                carrierField = "NPOBAN";
                break;
            case "citizen":
                carrierField = "Citizen";
                break;
        }
        // 發票號碼（簡化，實際應從 ECPay 取得）
        const invoiceNumber = `${orderId}-${Date.now()}`.substring(0, 10);
        const invoiceParams = {
            MerchantID: ECPAY_MERCHANT_ID,
            MerchantTradeNo: orderId,
            MerchantTradeDate: new Date().toLocaleString("zh-TW", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
            }),
            InvoiceNumber: invoiceNumber,
            IssueType: invoiceType === "donate" ? "Donation" : "Invoice",
            TotalAmount: totalAmount,
            InvoiceRemark: description || "Healing App Service",
        };
        // 買方資訊
        if (invoiceType === "company") {
            invoiceParams.CustomerIdentifier = companyTaxId;
            invoiceParams.CustomerName = buyerName || "Company";
        }
        else {
            invoiceParams.CustomerEmail = buyerEmail;
            invoiceParams.CustomerName = buyerName || "Consumer";
        }
        // 載具資訊
        if (carrierType !== "citizen") {
            invoiceParams[carrierField] = carrierNum || "";
        }
        // 商品列表
        if (items && items.length > 0) {
            const itemsString = items
                .map((item) => `${item.name}*${item.quantity}*${item.unitPrice}*0|`)
                .join("");
            invoiceParams.Items = itemsString;
        }
        else {
            invoiceParams.Items = `Healing Service*1*${totalAmount}*0|`;
        }
        // 計算 CheckMacValue
        const checkMacValue = calculateCheckMacValue(invoiceParams);
        invoiceParams.CheckMacValue = checkMacValue;
        // 發送請求到 ECPay 電子發票 API
        const response = await axios.post(ECPAY_INVOICE_API_URL, invoiceParams, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
        });
        // 記錄到 Firestore
        const db = admin.firestore();
        await db.collection("invoices").add({
            orderId: orderId,
            invoiceNumber: invoiceNumber,
            buyerEmail: buyerEmail,
            amount: totalAmount,
            invoiceType: invoiceType,
            carrierType: carrierType,
            status: "issued",
            responseData: response.data,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        res.json({
            success: true,
            invoiceNumber: invoiceNumber,
            message: "Invoice created successfully",
            response: response.data,
        });
    }
    catch (error) {
        const err = error;
        console.error("Invoice Creation Error:", err.message);
        res.status(err.response?.status || 500).json({
            error: "Failed to create invoice",
            details: err.response?.data || err.message,
        });
    }
});
export { router as invoiceRouter };
//# sourceMappingURL=invoice.js.map