// firebase-functions imported in index.ts
import * as admin from "firebase-admin";
import axios, { AxiosError } from "axios";
import { Router } from "express";

const router = Router();

// WooCommerce API 配置
const WC_URL = process.env.WC_URL || "https://www.xiabenhow.com";
const WC_CONSUMER_KEY = process.env.WC_CONSUMER_KEY || "";
const WC_CONSUMER_SECRET = process.env.WC_CONSUMER_SECRET || "";

// 建立 WooCommerce API 客戶端
const wcApi = axios.create({
  baseURL: `${WC_URL}/wp-json/wc/v3`,
  auth: {
    username: WC_CONSUMER_KEY,
    password: WC_CONSUMER_SECRET,
  },
});

// 錯誤處理
interface WCErrorResponse {
  code?: string;
  message?: string;
  data?: {
    status: number;
  };
}

// GET /api/categories - 列出商品類別
router.get("/categories", async (req, res) => {
  try {
    const params: Record<string, unknown> = {
      per_page: 100,
      orderby: "count",
      order: "desc",
    };
    if (req.query.parent) {
      params.parent = req.query.parent;
    }
    const response = await wcApi.get("/products/categories", { params });
    res.json(response.data);
  } catch (error) {
    const err = error as AxiosError<WCErrorResponse>;
    console.error("WC Categories Error:", err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data?.message || "Failed to fetch categories",
    });
  }
});

// GET /api/products - 列出商品（支援 category filter）
router.get("/products", async (req, res) => {
  try {
    const params: Record<string, unknown> = {
      per_page: 100,
      status: "publish",
    };

    if (req.query.category) {
      params.category = req.query.category;
    }
    if (req.query.search) {
      params.search = req.query.search;
    }

    const response = await wcApi.get("/products", { params });
    res.json(response.data);
  } catch (error) {
    const err = error as AxiosError<WCErrorResponse>;
    console.error("WC Products Error:", err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data?.message || "Failed to fetch products",
    });
  }
});

// GET /api/products/:id - 單一商品詳細（含 variations）
router.get("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const response = await wcApi.get(`/products/${id}`);
    res.json(response.data);
  } catch (error) {
    const err = error as AxiosError<WCErrorResponse>;
    console.error("WC Product Detail Error:", err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data?.message || "Failed to fetch product",
    });
  }
});

// GET /api/products/:id/variations - 商品變體
router.get("/products/:id/variations", async (req, res) => {
  try {
    const { id } = req.params;
    const params = {
      per_page: 100,
    };

    const response = await wcApi.get(`/products/${id}/variations`, { params });
    res.json(response.data);
  } catch (error) {
    const err = error as AxiosError<WCErrorResponse>;
    console.error("WC Variations Error:", err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data?.message || "Failed to fetch variations",
    });
  }
});

// GET /api/products/:id/booking-slots - Phive Booking 可用時段
router.get("/products/:id/booking-slots", async (req, res) => {
  try {
    const { id } = req.params;

    const productResponse = await wcApi.get(`/products/${id}`);
    const product = productResponse.data;
    const meta = product.meta_data || [];

    const getMeta = (key: string): string =>
      meta.find((m: Record<string, unknown>) => m.key === key)?.value || "";
    const getMetaArr = (key: string): Record<string, string>[] =>
      meta.find((m: Record<string, unknown>) => m.key === key)?.value || [];

    // Parse booking configuration from Phive Booking meta
    const workStart = getMeta("_phive_book_working_hour_start") || "10:00";
    const workEnd = getMeta("_phive_book_working_hour_end") || "19:00";
    const intervalStr = getMeta("_phive_book_interval") || "1";
    const intervalPeriod = getMeta("_phive_book_interval_period") || "hour";
    const allowedPerSlot = parseInt(getMeta("_phive_book_allowed_per_slot") || "4", 10);
    const maxParticipants = parseInt(getMeta("_phive_booking_maximum_number_of_allowed_participant") || "8", 10);
    const minParticipants = parseInt(getMeta("_phive_booking_minimum_number_of_required_participant") || "1", 10);
    const fixedFrom = getMeta("_phive_fixed_availability_from");
    const personEnable = getMeta("_phive_booking_person_enable") === "yes";
    const personsMultiply = getMeta("_phive_booking_persons_multuply_all_cost") === "yes";
    const basePrice = parseFloat(getMeta("_phive_booking_pricing_base_cost") || product.price || "0");

    // Parse blocked date/time rules
    const availabilityRules = getMetaArr("_phive_booking_availability_rules");
    interface BlockedRange { from: Date; to: Date }
    const blockedRanges: BlockedRange[] = availabilityRules
      .filter((r) => r.is_bokable === "no" && r.from_date && r.to_date)
      .map((r) => ({
        from: new Date(r.from_date.replace(" ", "T")),
        to: new Date(r.to_date.replace(" ", "T")),
      }));

    // Generate time slots for each day (next 14 days)
    const intervalMinutes = intervalPeriod === "hour"
      ? parseInt(intervalStr, 10) * 60
      : parseInt(intervalStr, 10);

    const startH = parseInt(workStart.split(":")[0], 10);
    const startM = parseInt(workStart.split(":")[1] || "0", 10);
    const endH = parseInt(workEnd.split(":")[0], 10);
    const endM = parseInt(workEnd.split(":")[1] || "0", 10);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = fixedFrom ? new Date(fixedFrom) : today;
    if (startDate < today) startDate.setTime(today.getTime());

    // Fetch existing orders to calculate real remaining capacity
    const bookingCounts: Record<string, number> = {}; // key: "YYYY-MM-DD|HH:MM"
    try {
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 60);
      const afterStr = today.toISOString();
      const beforeStr = endDate.toISOString();

      // Fetch orders containing this product (processing, completed, on-hold)
      const orderStatuses = ["processing", "completed", "on-hold"];
      let allOrders: any[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const ordersResponse = await wcApi.get("/orders", {
          params: {
            product: id,
            per_page: 100,
            page,
            after: afterStr,
            before: beforeStr,
            status: orderStatuses.join(","),
          },
        });
        const batch = ordersResponse.data as any[];
        allOrders = allOrders.concat(batch);
        hasMore = batch.length === 100;
        page++;
        if (page > 5) break; // Safety limit: max 500 orders
      }

      const orders = allOrders;
      for (const order of orders) {
        for (const li of (order.line_items || [])) {
          if (String(li.product_id) !== String(id)) continue;
          const liMeta = li.meta_data || [];
          const bookingDate = liMeta.find((m: any) => m.key === "_phive_booking_date")?.value || "";
          const bookingTime = liMeta.find((m: any) => m.key === "_phive_booking_time")?.value || "";
          const persons = parseInt(liMeta.find((m: any) => m.key === "_phive_booking_persons")?.value || li.quantity || "1", 10);
          if (bookingDate && bookingTime) {
            const slotKey = `${bookingDate}|${bookingTime}`;
            bookingCounts[slotKey] = (bookingCounts[slotKey] || 0) + persons;
          }
        }
      }
    } catch (orderErr) {
      // If order query fails, continue with default capacity (graceful degradation)
      console.warn("Failed to fetch orders for capacity calculation:", orderErr);
    }

    interface SlotInfo {
      date: string;
      time: string;
      endTime: string;
      available: boolean;
      remainingCapacity: number;
    }

    const slots: SlotInfo[] = [];

    for (let dayOffset = 0; dayOffset <= 14; dayOffset++) {
      const day = new Date(startDate);
      day.setDate(day.getDate() + dayOffset);
      const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;

      let currentMin = startH * 60 + startM;
      const endMin = endH * 60 + endM;

      while (currentMin < endMin) {
        const slotH = Math.floor(currentMin / 60);
        const slotM = currentMin % 60;
        const slotTime = `${String(slotH).padStart(2, "0")}:${String(slotM).padStart(2, "0")}`;
        const nextMin = currentMin + intervalMinutes;
        const nextH = Math.floor(nextMin / 60);
        const nextM = nextMin % 60;
        const endTime = `${String(nextH).padStart(2, "0")}:${String(nextM).padStart(2, "0")}`;

        // Check if this slot is blocked
        const slotStart = new Date(`${dateStr}T${slotTime}:00`);
        const isBlocked = blockedRanges.some(
          (b) => slotStart >= b.from && slotStart < b.to
        );

        // Skip past slots for today
        const isPast = day.toDateString() === new Date().toDateString() &&
          slotStart.getTime() < Date.now();

        // Calculate remaining capacity from real order data
        const slotKey = `${dateStr}|${slotTime}`;
        const booked = bookingCounts[slotKey] || 0;
        const remaining = Math.max(0, allowedPerSlot - booked);

        slots.push({
          date: dateStr,
          time: slotTime,
          endTime,
          available: !isBlocked && !isPast && remaining > 0,
          remainingCapacity: isBlocked || isPast ? 0 : remaining,
        });

        currentMin = nextMin;
      }
    }

    res.json({
      productId: id,
      slots,
      config: {
        workStart,
        workEnd,
        intervalMinutes,
        allowedPerSlot,
        maxParticipants,
        minParticipants,
        personEnable,
        personsMultiply,
        basePrice,
      },
    });
  } catch (error) {
    const err = error as AxiosError<WCErrorResponse>;
    console.error("WC Booking Slots Error:", err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data?.message || "Failed to fetch booking slots",
    });
  }
});

// POST /api/orders - 建立 WooCommerce 訂單
router.post("/orders", async (req, res) => {
  try {
    const {
      customer_email,
      billing,
      shipping,
      line_items,
      payment_method,
      customer_note,
    } = req.body;

    if (!line_items || line_items.length === 0) {
      res.status(400).json({ error: "line_items is required" });
      return;
    }

    const orderData = {
      customer_email,
      billing: billing || {},
      shipping: shipping || {},
      line_items,
      payment_method: payment_method || "other",
      customer_note: customer_note || "",
      status: "pending",
      set_paid: false,
    };

    const response = await wcApi.post("/orders", orderData);
    res.json(response.data);
  } catch (error) {
    const err = error as AxiosError<WCErrorResponse>;
    console.error("WC Order Creation Error:", err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data?.message || "Failed to create order",
      details: err.response?.data,
    });
  }
});

// GET /api/orders - 查詢訂單（by email）
router.get("/orders", async (req, res) => {
  try {
    const { email } = req.query;

    const params: Record<string, unknown> = {
      per_page: 50,
      orderby: "date",
      order: "desc",
    };

    if (email) {
      // WC REST API 的 search 參數可以用 email 搜尋
      params.search = email as string;
    }

    const response = await wcApi.get("/orders", { params });

    // 過濾確保只回傳該 email 的訂單
    const filtered = email
      ? (response.data as any[]).filter((o: any) =>
          o.billing?.email?.toLowerCase() === (email as string).toLowerCase()
        )
      : response.data;

    // 簡化回傳資料
    const simplified = (filtered as any[]).map((o: any) => ({
      id: o.id,
      date: o.date_created,
      status: o.status,
      total: parseFloat(o.total) || 0,
      items: (o.line_items || []).map((li: any) => li.name).join(', '),
    }));

    res.json(simplified);
  } catch (error) {
    const err = error as AxiosError<WCErrorResponse>;
    console.error("WC Orders Query Error:", err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data?.message || "Failed to query orders",
    });
  }
});

// GET /api/customers - 查詢會員資訊
router.get("/customers", async (req, res) => {
  try {
    const { email } = req.query;

    const params: Record<string, unknown> = {
      per_page: 100,
    };

    if (email) {
      params.search = email;
    }

    const response = await wcApi.get("/customers", { params });
    res.json(response.data);
  } catch (error) {
    const err = error as AxiosError<WCErrorResponse>;
    console.error("WC Customers Query Error:", err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data?.message || "Failed to query customers",
    });
  }
});

// ===================== 課後照顧：根據已完成訂單抓取課程類型 =====================

// WC 分類 ID → 課程類型對照
const CATEGORY_TO_COURSE_TYPE: Record<number, string> = {
  // 調香 / 精油
  173: 'fragrance', // 精油調香
  18: 'candle',     // 香氛蠟燭
  // 植栽
  22: 'plant',      // 多肉植栽
  // 水晶 / 飾品
  21: 'crystal',    // 手作飾品
  200: 'crystal',   // 下班隨手飾
  // 皮革
  211: 'leather',   // 皮革
  212: 'leather',   // 皮革子分類
  // 其他課程類型（歸為最接近的類型）
  149: 'candle',    // 環氧樹脂 → candle（手作香氛類）
  25: 'plant',      // 花藝 → plant
  150: 'leather',   // 梭織 → leather（手作質感類）
  151: 'plant',     // 藍染 → plant（自然類）
  24: 'crystal',    // 畫畫 → crystal（創作類）
};

// 所有課程分類 ID（用來判斷是否為課程商品）
const ALL_COURSE_CAT_IDS = [17, 18, 19, 21, 22, 24, 25, 32, 61, 128, 133, 149, 150, 151, 173, 200, 211, 212];

// GET /api/wc/my-courses?email=xxx - 查詢會員已完成訂單中的課程類型
router.get("/my-courses", async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      res.status(400).json({ error: "email is required" });
      return;
    }

    // 查詢已完成（completed）和處理中（processing）的訂單 — 這些都是已付款的
    const params: Record<string, unknown> = {
      per_page: 100,
      orderby: "date",
      order: "desc",
      search: email as string,
      status: "completed,processing",
    };

    const orderResponse = await wcApi.get("/orders", { params });

    // 過濾確保只取該 email 的訂單
    const orders = (orderResponse.data as any[]).filter((o: any) =>
      o.billing?.email?.toLowerCase() === (email as string).toLowerCase()
    );

    if (orders.length === 0) {
      res.json({
        courseTypes: [],
        courseRecords: [],
        totalOrders: 0,
      });
      return;
    }

    // 收集所有 line_items 的 product_id
    const productIds = new Set<number>();
    const orderItems: Array<{
      orderId: number;
      orderDate: string;
      productId: number;
      productName: string;
      quantity: number;
    }> = [];

    for (const order of orders) {
      for (const item of (order.line_items || [])) {
        const pid = item.product_id as number;
        productIds.add(pid);
        orderItems.push({
          orderId: order.id,
          orderDate: order.date_created,
          productId: pid,
          productName: item.name,
          quantity: item.quantity || 1,
        });
      }
    }

    // 批次查詢商品，取得分類（每次最多100個）
    const pidArray = Array.from(productIds);
    const productCategories: Record<number, number[]> = {};

    // WC API 支持 include 參數批次查詢
    for (let i = 0; i < pidArray.length; i += 100) {
      const batch = pidArray.slice(i, i + 100);
      try {
        const prodResp = await wcApi.get("/products", {
          params: {
            include: batch.join(","),
            per_page: 100,
          },
        });
        for (const prod of (prodResp.data as any[])) {
          productCategories[prod.id] = (prod.categories || []).map((c: any) => c.id);
        }
      } catch (e) {
        console.error("Failed to fetch product batch:", e);
      }
    }

    // 判斷課程類型
    const detectedCourseTypes = new Set<string>();
    const courseRecords: Array<{
      orderId: number;
      orderDate: string;
      productId: number;
      productName: string;
      courseType: string | null;
      categories: number[];
    }> = [];

    for (const item of orderItems) {
      const cats = productCategories[item.productId] || [];
      // 判斷是否為課程商品
      const isCourse = cats.some((cid: number) => ALL_COURSE_CAT_IDS.includes(cid));

      if (isCourse) {
        let courseType: string | null = null;
        for (const cid of cats) {
          if (CATEGORY_TO_COURSE_TYPE[cid]) {
            courseType = CATEGORY_TO_COURSE_TYPE[cid];
            detectedCourseTypes.add(courseType);
            break;
          }
        }

        courseRecords.push({
          orderId: item.orderId,
          orderDate: item.orderDate,
          productId: item.productId,
          productName: item.productName,
          courseType,
          categories: cats,
        });
      }
    }

    res.json({
      courseTypes: Array.from(detectedCourseTypes),
      courseRecords,
      totalOrders: orders.length,
    });
  } catch (error) {
    const err = error as AxiosError<WCErrorResponse>;
    console.error("WC My Courses Error:", err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data?.message || "Failed to fetch course history",
    });
  }
});

export { router as wcProxyRouter };
