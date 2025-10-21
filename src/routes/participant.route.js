const express = require("express");
const router = express.Router();
const { participantController } = require("../controllers");
const { requireUser, requireAdmin } = require("../middlewares");

router.get("/", participantController.getAllParticipants);
router.get("/:id", participantController.getParticipantById);
router.post("/", participantController.createParticipant);
router.put("/:id", participantController.updateParticipant);
router.delete("/:id", participantController.deleteParticipant);

// nested: orders milik participant
router.get("/:id/orders", participantController.getParticipantOrders);

module.exports = router;
