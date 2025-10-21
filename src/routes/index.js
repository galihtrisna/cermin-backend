const eventRoutes = require("./event.route");

module.exports = (app) => {
  app.use("/api/events", eventRoutes);
};
