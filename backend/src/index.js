require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const routes = require("./routes");

const app = express();
const PORT = process.env.PORT || 5000;

app.use("/uploads", express.static("uploads"));
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(morgan("dev"));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.get("/health", (_, res) =>
  res.json({ status: "ok", ts: new Date().toISOString() }),
);
app.use("/api", routes);

app.use((req, res) =>
  res.status(404).json({ message: `${req.method} ${req.url} not found` }),
);
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Mode: ${process.env.NODE_ENV || "development"}`);
});
