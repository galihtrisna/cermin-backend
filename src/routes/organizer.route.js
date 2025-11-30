const express = require("express");
const router = express.Router();

const { organizerController } = require("../controllers");
const { requireUser } = require("../middlewares");

// hanya user dengan role staff/admin/superadmin (setelah setMyRole)
router.post("/organizers/apply", requireUser, organizerController.applyOrganizer);

module.exports = router;
