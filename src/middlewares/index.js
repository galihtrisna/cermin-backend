// src/middlewares/index.js
const {
  requireAuth,
  requireRoles,
  requireUser,
  requireAdmin,
} = require("./auth");

module.exports = {
  requireAuth,
  requireRoles,
  requireUser,
  requireAdmin,
};
