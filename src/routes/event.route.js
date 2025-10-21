const express = require("express");
const router = express.Router();
const { eventController } = require("../controllers");
const { requireUser, requireAdmin } = require("../middlewares");

// GET /api/events
router.get("/",eventController.getAllEvent);

// GET /api/events/:id
router.get("/:id", requireUser, eventController.getEventById);

// POST /api/events
router.post("/", requireAdmin, eventController.createEvent);

// PUT /api/events/:id
router.put("/:id", requireAdmin, eventController.updateEvent);

// DELETE /api/events/:id
router.delete("/:id", requireAdmin, eventController.deleteEvent);

module.exports = router;
