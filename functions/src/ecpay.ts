// firebase-functions imported in index.ts
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

// .NET HttpUtility.UrlEncode 相容的 URL 編碼
// 關鍵差異：.NET 用 + 編碼空格（非 %20），且 hex 用小寫
function dotNetUrlEncode(str: string): string {
  let encoded = encodeURIComponent(str);
  // 1. 空格: encodeURIComponent 產生 %20，.NET 用 +
  encoded = encoded.replace(/%20/g, "+");
  // 2. 這些字元 .NET 不編碼但 encodeURIComponent 也不編碼（安全起見保留）
  //    - _ . ! * ( ) 都是 encodeURIComponent 的 unreserved chars
  // 3. 這些字元 encodeURIComponent 不編碼但 .NET 會編碼
  encoded = encoded.replace(/~/g, "%7e");
  // 4. 將 %XX 的 hex 轉小寫（.NET 輸出小寫 hex）
  encoded = encoded.replace(/%([0-9A-F]{2})/gi, (_, hex) => `%${hex.toLowerCase()}`);
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

  // 4. URL encode（.NET HttpUtility.UrlEncode 規則）
  hashString = dotNetUrlEncode(hashString);

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

// GET /api/ecpay/create - 建立 ECPay 交易（透過 window.open 呼叫）
router.get("/create", async (req, res) => {
  try {
    const orderId = (req.query.order_id || req.query.orderId) as string;
    const paymentMethod = (req.query.payment || "ALL") as string;

    if (!orderId) {
      res.status(400).send("order_id is required");
      return;
    }

    // 從 WooCommerce 取得訂單資訊
    const WC_URL = process.env.WC_URL || "https://www.xiabenhow.com";
    const WC_CONSUMER_KEY = process.env.WC_CONSUMER_KEY || "";
    const WC_CONSUMER_SECRET = process.env.WC_CONSUMER_SECRET || "";

    const wcResponse = await axios.get(`${WC_URL}/wp-json/wc/v3/orders/${orderId}`, {
      auth: { username: WC_CONSUMER_KEY, password: WC_CONSUMER_SECRET },
    });

    const order = wcResponse.data;
    const totalAmount = Math.round(parseFloat(order.total));
    const itemName = (order.line_items || []).map((li: any) => li.name).join("#").substring(0, 200) || "Healing App Service";
    const description = "Healing App Order";
    const returnUrl = "https://healing-6b425.web.app/payment/return";
    const clientBackUrl = "https://healing-6b425.web.app/payment/client-back";

    if (totalAmount <= 0) {
      res.status(400).send("Order amount must be > 0");
      return;
    }

    // ECPay MerchantTradeNo: 最多20碼英數字
    const tradeNo = `HL${orderId}T${Date.now().toString().slice(-8)}`.substring(0, 20);

    // 格式: yyyy/MM/dd HH:mm:ss（台灣時間 UTC+8）
    const now = new Date();
    const twTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const pad = (n: number) => n.toString().padStart(2, "0");
    const tradeDate = `${twTime.getUTCFullYear()}/${pad(twTime.getUTCMonth() + 1)}/${pad(twTime.getUTCDate())} ${pad(twTime.getUTCHours())}:${pad(twTime.getUTCMinutes())}:${pad(twTime.getUTCSeconds())}`;

    // 付款方式映射
    const paymentMap: Record<string, string> = {
      credit: "Credit",
      bank: "ATM",
      convenience: "CVS",
      ALL: "ALL",
    };

    const ecpayParams: Record<string, unknown> = {
      MerchantID: ECPAY_MERCHANT_ID,
      MerchantTradeNo: tradeNo,
      MerchantTradeDate: tradeDate,
      PaymentType: "aio",
      TotalAmount: totalAmount,
      TradeDesc: description,
      ItemName: itemName,
      ReturnURL: returnUrl,
      ClientBackURL: clientBackUrl,
      ChoosePayment: paymentMap[paymentMethod] || "ALL",
      EncryptType: 1,
    };

    // 計算 CheckMacValue
    const checkMacValue = calculateCheckMacValue(ecpayParams);
    ecpayParams.CheckMacValue = checkMacValue;

    // Debug log
    console.log("ECPay Params:", JSON.stringify(ecpayParams, null, 2));

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

    // 記錄到 Firestore（對應 tradeNo 和 WC orderId）
    const db = admin.firestore();
    await db.collection("ecpay_requests").add({
      tradeNo: tradeNo,
      wcOrderId: orderId,
      amount: totalAmount,
      paymentMethod: paymentMap[paymentMethod] || "ALL",
      status: "pending",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.set("Content-Type", "text/html");
    res.send(formHtml);
  } catch (error: any) {
    console.error("ECPay Create Error:", error?.message || error);
    const statusCode = error?.response?.status || 500;
    res.status(statusCode).send(`
      <html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h2>付款頁面載入失敗</h2>
        <p>請返回重試或聯繫客服</p>
        <a href="https://healing-6b425.web.app">返回首頁</a>
      </body></html>
    `);
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

// ===================== ECPay 物流 =====================

// GET /api/ecpay/logistics/map - 產生超商門市選擇地圖 HTML
router.get("/logistics/map", async (req, res) => {
  try {
    const subType = (req.query.subtype || "UNIMARTC2C") as string; // C2C: UNIMARTC2C, FAMIC2C, HILIFEC2C
    const isCollection = (req.query.collection || "N") as string;
    const serverReplyURL = `https://us-central1-fragrance-calendar-2027.cloudfunctions.net/api/api/ecpay/logistics/map-reply`;

    const LOGISTICS_URL = "https://logistics.ecpay.com.tw/Express/map";

    // 產生 HTML 表單自動 POST 到綠界門市地圖
    const formHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"><title>選擇取貨門市</title></head>
      <body onload="document.mapForm.submit();">
        <form name="mapForm" method="post" action="${LOGISTICS_URL}">
          <input type="hidden" name="MerchantID" value="${ECPAY_MERCHANT_ID}">
          <input type="hidden" name="MerchantTradeNo" value="${`ML${Date.now().toString().slice(-14)}`.substring(0, 20)}">
          <input type="hidden" name="LogisticsType" value="CVS">
          <input type="hidden" name="LogisticsSubType" value="${subType}">
          <input type="hidden" name="IsCollection" value="${isCollection}">
          <input type="hidden" name="ServerReplyURL" value="${serverReplyURL}">
          <input type="hidden" name="Device" value="1">
        </form>
        <p style="text-align:center;font-family:sans-serif;padding:20px">正在載入門市地圖...</p>
      </body>
      </html>
    `;
    res.set("Content-Type", "text/html");
    res.send(formHtml);
  } catch (error: any) {
    console.error("Logistics Map Error:", error?.message || error);
    res.status(500).send("無法載入門市地圖");
  }
});

// POST /api/ecpay/logistics/map-reply - 門市地圖選擇結果回調
router.post("/logistics/map-reply", async (req, res) => {
  try {
    const {
      MerchantID,
      MerchantTradeNo,
      LogisticsSubType,
      CVSStoreID,
      CVSStoreName,
      CVSAddress,
      CVSTelephone,
      CVSOutSide,
    } = req.body;

    console.log("Store selected:", { CVSStoreID, CVSStoreName, CVSAddress });

    // 回傳 JS 通知父視窗已選擇門市
    const responseHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"><title>已選擇門市</title></head>
      <body>
        <script>
          const storeData = {
            storeId: "${CVSStoreID || ""}",
            storeName: "${(CVSStoreName || "").replace(/"/g, '\\"')}",
            storeAddress: "${(CVSAddress || "").replace(/"/g, '\\"')}",
            storeTelephone: "${CVSTelephone || ""}",
            subType: "${LogisticsSubType || ""}",
            outsideIsland: "${CVSOutSide || "0"}"
          };
          if (window.opener) {
            window.opener.postMessage({ type: 'ECPAY_STORE_SELECTED', data: storeData }, '*');
            window.close();
          } else {
            document.body.innerHTML = '<div style="text-align:center;font-family:sans-serif;padding:40px"><h2>已選擇門市</h2><p>' + storeData.storeName + '</p><p>' + storeData.storeAddress + '</p><p>請關閉此視窗返回結帳頁面</p></div>';
          }
        </script>
      </body>
      </html>
    `;
    res.set("Content-Type", "text/html");
    res.send(responseHtml);
  } catch (error: any) {
    console.error("Logistics Map Reply Error:", error?.message || error);
    res.status(500).send("處理門市選擇結果失敗");
  }
});

export { router as ecpayRouter };
