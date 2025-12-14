const express = require("express");
const router = express.Router();
const { eventController, certificateController } = require("../controllers");
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
// router.put("/:id", requireUser, eventController.updateEvent);

// DELETE /api/events/:id → hapus event
router.delete("/:id", requireUser, eventController.deleteEvent);

// ...
// Staff Management (Admin Only)
router.post("/:id/staff", requireUser, eventController.addEventStaff);
router.get("/:id/staff", requireUser, eventController.getEventStaffList);
router.delete("/:id/staff/:staffId", requireUser, eventController.removeEventStaff);

// Staff View (Events assigned to me)
router.get("/staff/assigned", requireUser, eventController.getStaffAssignedEvents);
router.post("/:eventId/certificates/issue", requireUser, certificateController.issueCertificates);
router.get("/certificates/:id/public", certificateController.getCertificatePublic);
router.put("/:id", requireAdmin, eventController.updateEvent);
// ...

module.exports = router;
