// src/routes/superadmin.route.js
const express = require("express");
const router = express.Router();
const controller = require("../controllers/superadmin.controller");
const { requireAuth, requireSuperAdmin } = require("../middlewares/auth");

// Semua route di bawah ini butuh login & role superadmin
router.use(requireAuth, requireSuperAdmin);

router.get("/users", controller.getAllUsers);
router.patch("/users/:id", controller.updateUser);
router.delete("/users/:id", controller.deleteUser);

router.get("/organizers", controller.getAllOrganizers);
router.patch("/organizers/:id/status", controller.updateOrganizerStatus);

module.exports = router;