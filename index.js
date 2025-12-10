require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const routes = require("./src/routes");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: ["http://localhost:3000", "http://10.190.141.34:3000"],
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

// ✅ semua route API lewat /api
app.use("/api", routes);

app.get("/", (req, res) => {
  res.json({ message: "Cermin API running" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
