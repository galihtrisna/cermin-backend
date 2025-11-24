const eventController = require("./event.controller");
const participantController = require("./participant.controller");
const paymentController = require("./payment.controller");
const orderController = require("./order.controller")
const authController = require("./auth.controller")
const organizerController = require("./organizer.controller")

module.exports = {
    eventController,
    participantController,
    paymentController,
    orderController,
    authController,
    organizerController,
};