/**
 * One-time repair: PG logos / gallery images uploaded before the fix were
 * saved on disk in uploads/id-proofs but referenced in the DB as
 * /uploads/photos/<file>. This moves those files into uploads/photos so the
 * existing links work again.   Run once:  npm run fix:pg-images
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("./db");

const UP = path.join(__dirname, "../../uploads");

const move = (url) => {
  if (!url || !url.startsWith("/uploads/photos/")) return;
  const name = path.basename(url);
  const wrong = path.join(UP, "id-proofs", name);
  const right = path.join(UP, "photos", name);
  if (!fs.existsSync(right) && fs.existsSync(wrong)) {
    fs.renameSync(wrong, right);
    console.log("moved", name);
  }
};

(async () => {
  try {
    const { rows } = await pool.query("SELECT logo_url, images FROM pgs");
    rows.forEach((r) => {
      move(r.logo_url);
      (Array.isArray(r.images) ? r.images : []).forEach(move);
    });
    console.log("✅ done");
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
})();
