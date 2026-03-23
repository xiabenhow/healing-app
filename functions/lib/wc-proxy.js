import axios from "axios";
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
// GET /api/products - 列出商品（支援 category filter）
router.get("/products", async (req, res) => {
    try {
        const params = {
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
    }
    catch (error) {
        const err = error;
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
    }
    catch (error) {
        const err = error;
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
    }
    catch (error) {
        const err = error;
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
        // 從 WooCommerce 獲取商品詳細資訊（包含 meta 中的 booking 資訊）
        const productResponse = await wcApi.get(`/products/${id}`);
        const product = productResponse.data;
        // 預期商品的 meta_data 中會有 booking_slots 或相關信息
        // 這裡先返回空陣列，實際應該整合 Phive Booking API
        const slots = product.meta_data?.find((m) => m.key === "booking_slots")?.value || [];
        res.json({
            productId: id,
            slots: slots,
            message: "Phive Booking integration should be implemented",
        });
    }
    catch (error) {
        const err = error;
        console.error("WC Booking Slots Error:", err.message);
        res.status(err.response?.status || 500).json({
            error: err.response?.data?.message || "Failed to fetch booking slots",
        });
    }
});
// POST /api/orders - 建立 WooCommerce 訂單
router.post("/orders", async (req, res) => {
    try {
        const { customer_email, billing, shipping, line_items, payment_method, customer_note, } = req.body;
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
    }
    catch (error) {
        const err = error;
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
        const params = {
            per_page: 100,
        };
        if (email) {
            params.customer = email;
        }
        const response = await wcApi.get("/orders", { params });
        res.json(response.data);
    }
    catch (error) {
        const err = error;
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
        const params = {
            per_page: 100,
        };
        if (email) {
            params.search = email;
        }
        const response = await wcApi.get("/customers", { params });
        res.json(response.data);
    }
    catch (error) {
        const err = error;
        console.error("WC Customers Query Error:", err.message);
        res.status(err.response?.status || 500).json({
            error: err.response?.data?.message || "Failed to query customers",
        });
    }
});
export { router as wcProxyRouter };
//# sourceMappingURL=wc-proxy.js.map