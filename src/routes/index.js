// src/routes/index.js
const express = require("express");
const router = express.Router();

const eventRoutes = require("./event.route");
const participantRoutes = require("./participant.route");
const paymentRoutes = require("./payment.route");
const organizerRoutes = require("./organizer.route");
const authRoutes = require("./auth.route");

// semua ini akan otomatis berada di bawah prefix /api
// karena index.js utama pakai: app.use("/api", router)

router.use("/events", eventRoutes);
router.use("/participants", participantRoutes);
router.use("/payments", paymentRoutes);
router.use("/", authRoutes);
router.use("/", organizerRoutes);

module.exports = router;
