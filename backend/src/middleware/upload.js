const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure upload dirs exist
const UPLOAD_DIR = path.join(__dirname, "../../uploads");
["photos", "id-proofs"].forEach((d) => {
  const dir = path.join(UPLOAD_DIR, d);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = file.fieldname === "profile_photo" ? "photos" : "id-proofs";
    cb(null, path.join(UPLOAD_DIR, folder));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, unique);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else
    cb(
      new Error(`Invalid file type: ${ext}. Allowed: ${allowed.join(", ")}`),
      false,
    );
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Express error handler for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE")
      return res.status(400).json({ message: "File too large (max 5MB)" });
    return res.status(400).json({ message: err.message });
  }
  if (err) return res.status(400).json({ message: err.message });
  next();
};

// Public URL from saved file
const getFileUrl = (req, file) => {
  if (!file) return null;
  const folder = file.fieldname === "profile_photo" ? "photos" : "id-proofs";
  return `/uploads/${folder}/${file.filename}`;
};

module.exports = { upload, handleMulterError, getFileUrl };
