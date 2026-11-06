const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const UPLOAD_DIR = path.join(__dirname, "../../uploads");
const FOLDERS = ["photos", "id-proofs"];
FOLDERS.forEach((d) => {
  const dir = path.join(UPLOAD_DIR, d);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Only the tenant ID proof is sensitive. Everything else (tenant photo,
// PG logo, PG gallery) is stored in /photos.
// BUG FIX: previously logo + pg_images went to /id-proofs on disk while the
// DB stored /uploads/photos/... URLs, so PG images 404'd.
const folderFor = (fieldname) => (fieldname === "id_proof" ? "id-proofs" : "photos");

const ALLOWED = {
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".webp": ["image/webp"],
  ".pdf": ["application/pdf"],
};

const storage = multer.diskStorage({
  destination: (req, file, cb) =>
    cb(null, path.join(UPLOAD_DIR, folderFor(file.fieldname))),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // Unguessable name so a leaked/guessed URL can't be enumerated
    cb(null, `${Date.now()}-${crypto.randomBytes(12).toString("hex")}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimes = ALLOWED[ext];
  if (!mimes)
    return cb(
      new Error(`Invalid file type: ${ext || "unknown"}. Allowed: ${Object.keys(ALLOWED).join(", ")}`),
      false,
    );
  if (!mimes.includes(file.mimetype))
    return cb(new Error("File content type does not match its extension"), false);
  // Photos / logos must be images, not PDFs
  if (file.fieldname !== "id_proof" && ext === ".pdf")
    return cb(new Error("Photos must be JPG, PNG or WEBP images"), false);
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 12 }, // 5MB each
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

// Stored URL from saved file
const getFileUrl = (req, file) => {
  if (!file) return null;
  return `/uploads/${folderFor(file.fieldname)}/${file.filename}`;
};

module.exports = { upload, handleMulterError, getFileUrl, UPLOAD_DIR };
