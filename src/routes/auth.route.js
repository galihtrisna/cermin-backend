// src/routes/auth.route.js
const express = require("express");
const router = express.Router();

const { authController } = require("../controllers");
// Tambahkan requireAuth
const { requireAuth, requireUser, requireAdmin } = require("../middlewares");

// Auth basic
router.post("/register", authController.register);
router.post("/login", authController.login);
router.delete("/logout", requireAuth, authController.logout);

// List user → minimal admin
router.get("/users", requireAdmin, authController.getAllUsers);

// FIX: Ganti middleware jadi requireAuth agar user tanpa role (null) bisa akses ini untuk setup role
router.get("/users/admin", requireAuth, authController.getCurrentUserAdmin);

// Update & delete user → admin ke atas
router.patch("/users/:id", requireAdmin, authController.updateUser);
router.delete("/users/:id", requireAdmin, authController.deleteUser);

// Setup role sendiri
router.patch("/me/role", requireAuth, authController.setMyRole);

module.exports = router;
