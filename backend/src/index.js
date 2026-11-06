require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const path = require("path");

// ── Fail fast on unsafe configuration ─────────────────────────────────────────
const isProd = process.env.NODE_ENV === "production";
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  const msg = "JWT_SECRET must be set and at least 32 characters long";
  if (isProd) {
    console.error("❌ " + msg);
    process.exit(1);
  } else {
    console.warn("⚠️  " + msg + " (allowed in development only)");
  }
}

const routes = require("./routes");

const app = express();
const PORT = process.env.PORT || 5000;

// Behind Nginx — needed so rate limiting sees the real client IP
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  helmet({
    // Uploaded images are loaded by the frontend from the same domain
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// Allow one or more comma-separated origins in FRONTEND_URL
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, cb) => {
      // no Origin header = same-origin / curl / server-to-server
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(morgan(isProd ? "combined" : "dev"));

// Public uploads: ONLY non-sensitive images (tenant photos, PG logo/gallery).
// /uploads/id-proofs is deliberately NOT exposed here — it is served through
// the authenticated route GET /api/files/id-proofs/:filename.
const UPLOADS = path.join(__dirname, "../uploads");
app.use(
  "/uploads/photos",
  express.static(path.join(UPLOADS, "photos"), {
    index: false,
    dotfiles: "deny",
    setHeaders: (res) => res.set("X-Content-Type-Options", "nosniff"),
  }),
);
app.use("/uploads/id-proofs", (req, res) =>
  res.status(403).json({ message: "Access denied" }),
);

app.get("/health", (_, res) =>
  res.json({ status: "ok", ts: new Date().toISOString() }),
);
app.use("/api", routes);

app.use((req, res) =>
  res.status(404).json({ message: `${req.method} ${req.originalUrl.split("?")[0]} not found` }),
);
app.use((err, req, res, next) => {
  if (err && err.message === "Not allowed by CORS")
    return res.status(403).json({ message: "Origin not allowed" });
  if (err && err.type === "entity.parse.failed")
    return res.status(400).json({ message: "Invalid JSON body" });
  if (err && err.type === "entity.too.large")
    return res.status(413).json({ message: "Request body too large" });
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

process.on("unhandledRejection", (reason) =>
  console.error("Unhandled promise rejection:", reason),
);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Mode: ${process.env.NODE_ENV || "development"}`);
});
