require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
// const helmet = require("helmet");
// const compression = require("compression");

const app = express();

const corsOPTIONS = {
  origin: [
    "http://localhost:3000",
    "https://midtrans.com",
    "https://sandbox.midtrans.com",
    "https://api.midtrans.com",
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

app.use(cors(corsOPTIONS));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

require("./src/routes/index.js")(app);

app.get("/", (req, res) => {
  res.send("Cermin API");
});

app.listen(5000)
module.exports = app;