# Healing App Cloud Functions

Firebase Cloud Functions 後端，提供支付、會員積分和 WooCommerce 代理等服務。

## 目錄結構

```
functions/
  src/
    index.ts          - 主入口，匯出所有 Cloud Functions
    wc-proxy.ts       - WooCommerce API 代理（產品、訂單、客戶查詢）
    ecpay.ts          - ECPay 金流（支付、回調、導回）
    linepay.ts        - LINE Pay 金流（請求、確認、取消）
    invoice.ts        - ECPay 電子發票（發票開立）
    member.ts         - 會員積分系統（查詢、累積、折抵）
  lib/                - 編譯後的 JavaScript（自動生成）
  package.json        - 依賴配置
  tsconfig.json       - TypeScript 編譯設定
  .env.example        - 環境變數範本
```

## 設定環境變數

### 本地開發

1. 複製 `.env.example` 建立 `.env` 檔案
2. 填入實際的 API 金鑰

或使用 Firebase CLI 設定遠端環境變數：

```bash
firebase functions:config:set ecpay.merchant_id="3180783" \
  ecpay.hash_key="fUM6YrkOCOy97L1R" \
  ecpay.hash_iv="nGn83NCaxb7RdTVk" \
  linepay.channel_id="1655324703" \
  linepay.channel_secret="cb9b109d9d067544ebf504d77c22b5d9" \
  wc.url="https://www.xiabenhow.com" \
  wc.consumer_key="ck_868a79ee46004ddaf74b27fa160d825fa2b912df" \
  wc.consumer_secret="cs_0dfd32201445c7146da9ec5b15d69625749a679d"
```

## API 端點

### WooCommerce 代理
- `GET /api/wc/products` - 列出商品
- `GET /api/wc/products/:id` - 商品詳細
- `GET /api/wc/products/:id/variations` - 商品變體
- `GET /api/wc/products/:id/booking-slots` - 預約時段
- `POST /api/wc/orders` - 建立訂單
- `GET /api/wc/orders?email=xxx` - 查詢訂單
- `GET /api/wc/customers?email=xxx` - 查詢客戶

### ECPay 金流
- `POST /api/ecpay/create` - 建立交易
- `POST /api/ecpay/callback` - 付款結果回調
- `POST /api/ecpay/return` - 付款完成導回

### LINE Pay
- `POST /api/linepay/request` - 發起付款請求
- `GET /api/linepay/confirm` - 確認付款
- `GET /api/linepay/cancel` - 取消付款

### 電子發票
- `POST /api/invoice/create` - 開立電子發票

### 會員積分
- `GET /api/member/points?email=xxx` - 查詢點數
- `POST /api/member/points/earn` - 累積點數
- `POST /api/member/points/redeem` - 折抵點數

### 系統
- `GET /health` - 健康檢查
- `GET /` - API 資訊

## 開發

### 安裝依賴
```bash
npm install
```

### 編譯
```bash
npm run build
```

### 監視模式
```bash
npm run dev
```

## 技術棧

- **Runtime**: Node.js 18+
- **Framework**: Firebase Cloud Functions
- **API Framework**: Express.js
- **資料庫**: Firestore
- **支付**: ECPay、LINE Pay
- **電商**: WooCommerce REST API
- **語言**: TypeScript

## 重要說明

### ECPay CheckMacValue 計算

CheckMacValue 使用 .NET URL encoding 規則和 SHA256 hash：
1. 按 key 排序（不分大小寫）
2. 串成 key=value& 格式
3. 前面加 HashKey=xxx&，後面加 &HashIV=xxx
4. .NET URL encode（特殊字元替換）
5. 轉小寫
6. SHA256 hash
7. 轉大寫

### 點數規則

消費金額的 2% 作為點數：
- 1 點 = NT$1
- 點數可用於折抵

### 金額計算

所有金額都轉為整數避免浮點數問題：
```javascript
const totalAmount = Math.round(amount);
```

## 部署

部署前確保已設定所有環境變數：

```bash
firebase deploy --only functions
```

## 資料庫結構

### Firestore Collections

- `members` - 會員資料
  - `email` (doc ID)
  - `points` - 累積點數
  - `totalSpent` - 總消費金額
  - `createdAt` - 建立時間
  - `updatedAt` - 更新時間

- `points_history` - 點數交易歷史
  - `email`
  - `orderId`
  - `type` - "earn" 或 "redeem"
  - `pointsEarned` / `pointsRedeemed`
  - `amount`
  - `timestamp`

- `ecpay_callbacks` - ECPay 回調記錄
  - `merchantTradeNo`
  - `tradeStatus`
  - `fullData`
  - `timestamp`

- `linepay_requests` - LINE Pay 請求記錄
  - `orderId`
  - `amount`
  - `transactionId`
  - `paymentUrl`
  - `status`
  - `timestamp`

- `invoices` - 電子發票記錄
  - `orderId`
  - `invoiceNumber`
  - `buyerEmail`
  - `amount`
  - `invoiceType`
  - `carrierType`
  - `status`
  - `timestamp`

## CORS 設定

允許的來源：
- https://healing-6b425.web.app
- http://localhost:3000
- http://localhost:5173

## 額外功能

### cleanupOldCallbacks

定期清理 30 天以上的 ECPay 回調記錄。使用 Cloud Scheduler 每日 02:00 執行：

```bash
gcloud scheduler jobs create http cleanup \
  --schedule="0 2 * * *" \
  --uri="https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/cleanupOldCallbacks" \
  --http-method=POST
```
