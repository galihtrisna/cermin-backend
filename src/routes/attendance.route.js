const express = require("express");
const router = express.Router();

const { attendanceController } = require("../controllers");
const { requireUser } = require("../middlewares");

// hanya user dengan role staff/admin/superadmin (setelah setMyRole)
router.post("/scan", requireUser, attendanceController.scanQrCode);
router.get("/:eventId", requireUser, attendanceController.getEventAttendance);

module.exports = router;
