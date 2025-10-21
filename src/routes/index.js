const eventRoutes = require("./event.route");
const participantRoutes = require("./participant.route");

module.exports = (app) => {
  app.use("/api/events", eventRoutes);
  app.use("/api/participants", participantRoutes);
};
