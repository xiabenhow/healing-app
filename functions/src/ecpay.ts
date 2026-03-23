import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Router } from "express";
import * as crypto from "crypto";
import axios from "axios";
import querystring from "querystring";

const router = Router();

// ECPay 配置
const ECPAY_MERCHANT_ID = process.env.ECPAY_MERCHANT_ID || "";
const ECPAY_HASH_KEY = process.env.ECPAY_HASH_KEY || "";
const ECPAY_HASH_IV = process.env.ECPAY_HASH_IV || "";
const ECPAY_API_URL = "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5";

// .NET URL Encode 特殊替換
function netUrlEncode(str: string): string {
  let encoded = encodeURIComponent(str);
  // .NET URL encoding 特殊規則
  encoded = encoded
    .replace(/%2D/g, "-") // %2d → -
    .replace(/%5F/g, "_") // %5f → _
    .replace(/%2E/g, ".") // %2e → .
    .replace(/%21/g, "!") // %21 → !
    .replace(/%2A/g, "*") // %2a → *
    .replace(/%28/g, "(") // %28 → (
    .replace(/%29/g, ")"); // %29 → )
  return encoded;
}

// 計算 CheckMacValue
function calculateCheckMacValue(params: Record<string, unknown>): string {
  // 1. 按 key 排序（不分大小寫）
  const sortedKeys = Object.keys(params).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );

  // 2. 串成 key=value& 格式
  const queryString = sortedKeys
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  // 3. 前面加 HashKey=xxx&，後面加 &HashIV=xxx
  let hashString = `HashKey=${ECPAY_HASH_KEY}&${queryString}&HashIV=${ECPAY_HASH_IV}`;

  // 4. URL encode（.NET 規則）
  hashString = netUrlEncode(hashString);

  // 5. 轉小寫
  hashString = hashString.toLowerCase();

  // 6. SHA256 hash
  const hashed = crypto.createHash("sha256").update(hashString).digest("hex");

  // 7. 轉大寫
  return hashed.toUpperCase();
}

interface ECPayCreateRequest {
  orderId: string;
  amount: number;
  description: string;
  paymentMethod?: string;
  returnUrl?: string;
  clientBackUrl?: string;
  itemName?: string;
}

// POST /api/ecpay/create - 建立 ECPay 交易
router.post("/create", async (req, res) => {
  try {
    const {
      orderId,
      amount,
      description,
      paymentMethod = "ALL",
      returnUrl = "https://healing-6b425.web.app/payment/return",
      clientBackUrl = "https://healing-6b425.web.app/payment/client-back",
      itemName = "Healing App Service",
    } = req.body as ECPayCreateRequest;

    if (!orderId || !amount || amount <= 0) {
      res.status(400).json({
        error: "orderId, amount are required and amount must be > 0",
      });
      return;
    }

    // 金額轉為整數（避免浮點數問題）
    const totalAmount = Math.round(amount);

    const ecpayParams: Record<string, unknown> = {
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
      PaymentType: "aio",
      TotalAmount: totalAmount,
      TradeDesc: description,
      ItemName: itemName,
      ReturnURL: returnUrl,
      ClientBackURL: clientBackUrl,
      ChoosePayment: paymentMethod,
      EncryptType: 1,
    };

    // 計算 CheckMacValue
    const checkMacValue = calculateCheckMacValue(ecpayParams);
    ecpayParams.CheckMacValue = checkMacValue;

    // 建立 HTML form，用於自動 POST 到 ECPay
    const formHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Redirecting to ECPay...</title>
      </head>
      <body onload="document.ecpayForm.submit();">
        <form name="ecpayForm" method="post" action="${ECPAY_API_URL}">
          ${Object.entries(ecpayParams)
            .map(([key, value]) => `<input type="hidden" name="${key}" value="${value}">`)
            .join("\n")}
        </form>
        <p>Redirecting to payment page...</p>
      </body>
      </html>
    `;

    res.set("Content-Type", "text/html");
    res.send(formHtml);
  } catch (error) {
    console.error("ECPay Create Error:", error);
    res.status(500).json({ error: "Failed to create ECPay payment" });
  }
});

interface ECPayCallbackRequest {
  [key: string]: string | string[] | undefined;
}

// POST /api/ecpay/callback - ECPay 付款結果回調
router.post("/callback", async (req, res) => {
  try {
    const callbackData = req.body as ECPayCallbackRequest;
    const receivedCheckMacValue = callbackData.CheckMacValue as string | undefined;

    if (!receivedCheckMacValue) {
      res.status(400).json({ error: "Missing CheckMacValue" });
      return;
    }

    // 移除 CheckMacValue 以計算驗證
    const paramsForValidation: Record<string, unknown> = {};
    Object.entries(callbackData).forEach(([key, value]) => {
      if (key !== "CheckMacValue") {
        paramsForValidation[key] = value;
      }
    });

    // 驗證 CheckMacValue
    const calculatedCheckMacValue = calculateCheckMacValue(paramsForValidation);

    if (calculatedCheckMacValue !== receivedCheckMacValue) {
      console.error("CheckMacValue mismatch", {
        received: receivedCheckMacValue,
        calculated: calculatedCheckMacValue,
      });
      res.status(400).send("1|Fail");
      return;
    }

    // 驗證成功，處理訂單
    const tradeNo = callbackData.MerchantTradeNo as string;
    const tradeStatus = callbackData.TradeStatus as string;

    // 記錄到 Firestore
    const db = admin.firestore();
    await db.collection("ecpay_callbacks").add({
      merchantTradeNo: tradeNo,
      tradeStatus: tradeStatus,
      fullData: callbackData,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 如果付款成功（TradeStatus = 1）
    if (tradeStatus === "1") {
      // 更新 WooCommerce 訂單狀態
      // 這裡應該呼叫 WooCommerce API 更新訂單為 "processing" 或 "completed"
      console.log(`Payment successful for order ${tradeNo}`);
    }

    res.send("1|OK");
  } catch (error) {
    console.error("ECPay Callback Error:", error);
    res.status(500).send("1|Fail");
  }
});

interface ECPayReturnRequest {
  MerchantTradeNo?: string;
  TradeStatus?: string;
  [key: string]: unknown;
}

// POST /api/ecpay/return - 付款完成導回頁面
router.post("/return", async (req, res) => {
  try {
    const returnData = req.body as ECPayReturnRequest;
    const orderId = returnData.MerchantTradeNo as string | undefined;

    if (!orderId) {
      res.status(400).json({ error: "Missing MerchantTradeNo" });
      return;
    }

    // 導回前端頁面，並帶上訂單 ID
    const frontendUrl = `https://healing-6b425.web.app/payment/result?orderId=${orderId}&status=${returnData.TradeStatus || "unknown"}`;

    res.redirect(frontendUrl);
  } catch (error) {
    console.error("ECPay Return Error:", error);
    res.redirect("https://healing-6b425.web.app?error=payment_failed");
  }
});

export { router as ecpayRouter };
