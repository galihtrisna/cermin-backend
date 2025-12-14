// src/routes/event.route.js
const express = require("express");
const router = express.Router();
const { eventController, certificateController } = require("../controllers");
const { requireUser, requireAdmin } = require("../middlewares");

// ⚠️ URUTAN PENTING: route yang spesifik dulu, baru yang pakai :id

// GET /api/events/mine  → event yang dimiliki user login
router.get("/mine", requireUser, eventController.getMyEvents);

// GET /api/events       → semua event (public / admin, terserah use-case)
router.get("/", eventController.getAllEvent);
router.get("/certificates/:id/public", certificateController.getCertificatePublic);

// GET /api/events/:id   → detail event by id
router.get("/:id", eventController.getEventById);

// POST /api/events      → buat event baru (admin/organizer)
// Note: Jika organizer boleh buat event, ubah requireAdmin jadi requireUser di sini juga jika perlu.
router.post("/", requireAdmin, eventController.createEvent);

// DELETE /api/events/:id → hapus event
router.delete("/:id", requireUser, eventController.deleteEvent);

// Staff Management (Admin Only/Owner)
router.post("/:id/staff", requireUser, eventController.addEventStaff);
router.get("/:id/staff", requireUser, eventController.getEventStaffList);
router.delete("/:id/staff/:staffId", requireUser, eventController.removeEventStaff);

// Staff View (Events assigned to me)
router.get("/staff/assigned", requireUser, eventController.getStaffAssignedEvents);

// Certificate Issuance
router.post("/:eventId/certificates/issue", requireUser, certificateController.issueCertificates);

// [FIX] Update Event: Ubah requireAdmin menjadi requireUser
// Controller sudah menangani validasi kepemilikan (owner_id)
router.put("/:id", requireUser, eventController.updateEvent);

module.exports = router;