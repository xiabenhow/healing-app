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

        slots.push({
          date: dateStr,
          time: slotTime,
          endTime,
          available: !isBlocked && !isPast,
          remainingCapacity: isBlocked || isPast ? 0 : allowedPerSlot,
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

export { router as wcProxyRouter };
