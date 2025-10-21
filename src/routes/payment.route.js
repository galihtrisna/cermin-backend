const express = require("express");
const router = express.Router();
const { paymentController } = require("../controllers");
const { requireUser, requireAdmin } = require("../middlewares");

router.get("/", paymentController.getPayments);
router.get("/:id", paymentController.getPaymentById);
router.post("/", paymentController.createPayment); // auto hitung admin fee (return di response)
router.put("/:id", paymentController.updatePayment);
router.delete("/:id", paymentController.deletePayment);

module.exports = router;
    