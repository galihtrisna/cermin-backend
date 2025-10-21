const eventRoutes = require("./event.route");
const participantRoutes = require("./participant.route");
const paymentRoutes = require("./payment.route");

module.exports = (app) => {
  app.use("/api/events", eventRoutes);
  app.use("/api/participants", participantRoutes);
  app.use("/api/payments", paymentRoutes);
};

