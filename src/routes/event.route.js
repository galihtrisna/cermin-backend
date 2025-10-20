const { eventController } = require("../controllers");

module.exports = (app) => {
  app.use((req, res, next) => {
    next();
  });
  app.get("/api/event", eventController.getAllEvent);
};