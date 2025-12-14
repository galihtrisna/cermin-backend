const router = require("express").Router();
const multer = require("multer");
const uploadController = require("../controllers/upload.controller");
const { requireAdmin, requireUser } = require("../middlewares");

// Konfigurasi Multer (Simpan di memory sementara sebelum ke Supabase)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Batas max 5MB
});

// Endpoint: POST /api/upload/image
// 'file' adalah nama field form-data dari frontend
router.post(
  "/image",
  upload.single("file"),
  uploadController.uploadImage
);

module.exports = router;
