// src/routes/organizer.route.js
const express = require("express");
const router = express.Router();

const { organizerController } = require("../controllers");
const { requireUser } = require("../middlewares");

// User login dengan role staff/admin/superadmin boleh apply
router.post("/organizers/apply", requireUser, organizerController.applyOrganizer);

module.exports = router;
