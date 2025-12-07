const express = require("express");
const router = express.Router();
const { eventController } = require("../controllers");
const { requireUser, requireAdmin } = require("../middlewares");

// ⚠️ URUTAN PENTING: route yang spesifik dulu, baru yang pakai :id

// GET /api/events/mine  → event yang dimiliki user login
router.get("/mine", requireUser, eventController.getMyEvents);

// GET /api/events       → semua event (public / admin, terserah use-case)
router.get("/", eventController.getAllEvent);

// GET /api/events/:id   → detail event by id
router.get("/:id", eventController.getEventById);

// POST /api/events      → buat event baru (admin/organizer)
router.post("/", requireAdmin, eventController.createEvent);

// PUT /api/events/:id   → update event
router.put("/:id", requireUser, eventController.updateEvent);

// DELETE /api/events/:id → hapus event
router.delete("/:id", requireUser, eventController.deleteEvent);

module.exports = router;
