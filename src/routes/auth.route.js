// src/routes/auth.route.js
const express = require("express");
const router = express.Router();

const { authController } = require("../controllers");
const { requireAuth, requireUser, requireAdmin } = require("../middlewares");

// Auth basic
router.post("/register", authController.register);
router.post("/login", authController.login);
router.delete("/logout", requireAuth, authController.logout);

// List user → minimal admin
router.get("/users", requireAdmin, authController.getAllUsers);

// Info current user (staff/admin/superadmin) → pakai requireUser
router.get("/users/admin", requireUser, authController.getCurrentUserAdmin);

// Update & delete user → admin ke atas
router.patch("/users/:id", requireAdmin, authController.updateUser);
router.delete("/users/:id", requireAdmin, authController.deleteUser);
router.patch("/me/role", requireAuth, authController.setMyRole);

module.exports = router;
