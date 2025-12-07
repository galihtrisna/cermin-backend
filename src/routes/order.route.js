const express = require("express");
const router = express.Router();
const { orderController } = require("../controllers");
const { requireAuth, requireUser, requireAdmin } = require("../middlewares");

/**
 * GET /api/orders
 * Mengambil semua order (bisa difilter via query params).
 * Diakses oleh: Staff, Admin, Superadmin.
 */
router.get("/", requireUser, orderController.getAllOrders);

/**
 * GET /api/orders/:id
 * Mengambil detail order berdasarkan ID.
 * Diakses oleh: User yang login (untuk melihat ordernya sendiri) atau Staff+.
 */
router.get("/:id", requireAuth, orderController.getOrderById);

/**
 * POST /api/orders
 * Membuat order baru.
 * Diakses oleh: User yang login.
 */
router.post("/", requireAuth, orderController.createOrder);

/**
 * PUT /api/orders/:id
 * Mengupdate order (misal: status, amount).
 * Diakses oleh: Admin/Superadmin (untuk override/manual update).
 */
router.put("/:id", requireAdmin, orderController.updateOrder);

/**
 * DELETE /api/orders/:id
 * Menghapus order.
 * Diakses oleh: Admin/Superadmin.
 */
router.delete("/:id", requireAdmin, orderController.deleteOrder);

/**
 * GET /api/orders/:id/payments
 * Mengambil histori pembayaran dari order tertentu.
 */
router.get("/:id/payments", requireAuth, orderController.getOrderPayments);

/**
 * GET /api/orders/:id/ticket
 * Mengambil tiket yang terbit dari order tertentu.
 */
router.get("/:id/ticket", requireAuth, orderController.getOrderTicket);

module.exports = router;