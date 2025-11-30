const express = require("express");
const router = express.Router();

const { authController } = require("../controllers");
const { requireAuth } = require("../middlewares");

// auth basic
router.post("/register", authController.register);
router.post("/login", authController.login);
router.delete("/logout", requireAuth, authController.logout);

// current user
router.get("/users/admin", requireAuth, authController.getCurrentUserAdmin);

// set my role
router.patch("/me/role", requireAuth, authController.setMyRole);

module.exports = router;
