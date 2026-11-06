/**
 * Migration verification. Creates throw-away databases, runs the real
 * `src/config/migrate.js` against them and checks the guarantees:
 *   empty DB initialises | re-runs are no-ops | failure rolls back everything |
 *   concurrent runs are safe | an existing DB is only extended, never altered.
 *
 *   npm run test:migration      (needs a DB user allowed to CREATE DATABASE)
 */
require("dotenv").config();
const { Client } = require("pg");
const { spawnSync, spawn } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const base = {
  host: process.env.DB_HOST || "localhost", port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || "postgres", password: process.env.DB_PASSWORD,
};
let pass = 0, fail = 0;
const ok = (n, c, d = "") => { c ? (pass++, console.log("  ✓", n)) : (fail++, console.log("  ✗", n, d)); };
const TABLES = ["master_admins","owners","pgs","pg_staff","role_permissions","rooms","beds","tenant_profiles","pg_tenants","payments","expenses","invites","activity_logs"];

const admin = () => new Client({ ...base, database: "postgres" });
const connect = async (db) => { const c = new Client({ ...base, database: db }); await c.connect(); return c; };
const recreate = async (db) => {
  const a = admin(); await a.connect();
  await a.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`); await a.query(`CREATE DATABASE ${db}`); await a.end();
};
const drop = async (db) => { const a = admin(); await a.connect(); await a.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`); await a.end(); };
const env = (db, extra = {}) => ({ ...process.env, DB_NAME: db, NODE_ENV: "development", ...extra });
const migrate = (db, extra) => spawnSync("node", ["src/config/migrate.js"], { cwd: ROOT, env: env(db, extra), encoding: "utf8" });
const counts = async (c) => { const o = {}; for (const t of TABLES) o[t] = +(await c.query(`SELECT COUNT(*) FROM ${t}`)).rows[0].count; return JSON.stringify(o); };
const tableList = async (c) => (await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1")).rows.map(r => r.table_name);

(async () => {
  const D = "pgm_mig_test";

  console.log("\n── 1. Completely empty database");
  await recreate(D);
  let r = migrate(D);
  ok("migrate exits 0", r.status === 0, r.stdout + r.stderr);
  let c = await connect(D);
  const tl = await tableList(c);
  ok("all 13 tables created", TABLES.every(t => tl.includes(t)), tl.join(","));
  ok("indexes created (>= 12 base + extras)", +(await c.query("SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public'")).rows[0].count >= 40);
  ok("8 updated_at triggers", +(await c.query("SELECT COUNT(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'trg_%_upd'")).rows[0].count === 8);
  ok("update_updated_at() exists", +(await c.query("SELECT COUNT(*) FROM pg_proc WHERE proname='update_updated_at'")).rows[0].count === 1);
  const rn = (await c.query("SELECT next_receipt_number() a, next_receipt_number() b")).rows[0];
  ok("next_receipt_number() works & increments", /^#REC-\d+$/.test(rn.a) && rn.a !== rn.b, JSON.stringify(rn));
  ok("foreign keys defined", +(await c.query("SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_type='FOREIGN KEY' AND table_schema='public'")).rows[0].count >= 14);
  ok("demo data present", +(await c.query("SELECT COUNT(*) FROM pg_tenants")).rows[0].count === 5 && +(await c.query("SELECT COUNT(*) FROM payments")).rows[0].count > 0);
  ok("demo bcrypt hashes stored (no plain text)", (await c.query("SELECT password FROM owners WHERE email='ravi@grandpg.com'")).rows[0].password.startsWith("$2"));
  const before = await counts(c);

  console.log("\n── 2. Re-running is safe (idempotent)");
  for (const i of [2, 3, 4]) { r = migrate(D); ok(`run ${i} exits 0`, r.status === 0, r.stdout + r.stderr); }
  ok("row counts identical after 3 more runs", before === await counts(c), before + " vs " + await counts(c));
  ok("no gaps in receipt numbers caused by migrations", (await c.query("SELECT MAX(regexp_replace(receipt_number,'\\D','','g')::int) - MIN(regexp_replace(receipt_number,'\\D','','g')::int) + 1 = COUNT(*) AS ok FROM payments")).rows[0].ok === true);
  await c.end();

  console.log("\n── 3. Application data is never modified");
  c = await connect(D);
  await c.query("UPDATE owners SET name='Changed By Owner' WHERE email='ravi@grandpg.com'");
  await c.query("UPDATE rooms SET monthly_rent=1234 WHERE room_number='A-101'");
  await c.query("UPDATE payments SET notes='keep me' WHERE receipt_number='#REC-1001'");
  await c.query("INSERT INTO expenses (pg_id, description, category, amount, expense_date) SELECT id,'Real expense','misc',77,CURRENT_DATE FROM pgs LIMIT 1");
  const snap = JSON.stringify([
    (await c.query("SELECT name FROM owners WHERE email='ravi@grandpg.com'")).rows,
    (await c.query("SELECT monthly_rent FROM rooms WHERE room_number='A-101'")).rows,
    (await c.query("SELECT notes FROM payments WHERE receipt_number='#REC-1001'")).rows,
    (await c.query("SELECT COUNT(*) FROM expenses")).rows,
  ]);
  await c.end();
  r = migrate(D); ok("migrate after manual edits exits 0", r.status === 0, r.stdout + r.stderr);
  c = await connect(D);
  const snap2 = JSON.stringify([
    (await c.query("SELECT name FROM owners WHERE email='ravi@grandpg.com'")).rows,
    (await c.query("SELECT monthly_rent FROM rooms WHERE room_number='A-101'")).rows,
    (await c.query("SELECT notes FROM payments WHERE receipt_number='#REC-1001'")).rows,
    (await c.query("SELECT COUNT(*) FROM expenses")).rows,
  ]);
  ok("owner name, room rent, payment notes and expenses untouched", snap === snap2, snap + " vs " + snap2);
  await c.end();

  console.log("\n── 4. Production mode");
  await recreate(D);
  r = migrate(D, { NODE_ENV: "production" });
  ok("fails without MASTER_ADMIN_* env", r.status !== 0 && /MASTER_ADMIN/.test(r.stdout + r.stderr));
  c = await connect(D);
  ok("...and rolled back: database still empty", (await tableList(c)).length === 0, (await tableList(c)).join(","));
  await c.end();
  r = migrate(D, { NODE_ENV: "production", MASTER_ADMIN_EMAIL: "boss@example.com", MASTER_ADMIN_PASSWORD: "A-long-secret-1" });
  ok("succeeds with env credentials", r.status === 0, r.stdout + r.stderr);
  c = await connect(D);
  ok("only master admin seeded (no demo data)",
    +(await c.query("SELECT COUNT(*) FROM master_admins")).rows[0].count === 1 &&
    +(await c.query("SELECT COUNT(*) FROM owners")).rows[0].count === 0 &&
    +(await c.query("SELECT COUNT(*) FROM pgs")).rows[0].count === 0);
  ok("demo logins do not exist", +(await c.query("SELECT COUNT(*) FROM master_admins WHERE email='admin@pgplatform.com'")).rows[0].count === 0);
  await c.end();

  console.log("\n── 5. Atomic: a failure rolls back EVERYTHING");
  await recreate(D);
  c = await connect(D);
  // a pre-existing, incompatible 'pgs' table makes the schema fail half-way through
  await c.query("CREATE TABLE pgs (id int)");
  await c.end();
  r = migrate(D);
  ok("migration fails loudly (exit != 0)", r.status !== 0, r.stdout);
  c = await connect(D);
  const left = await tableList(c);
  ok("no partial schema left behind (only the pre-existing table)", left.length === 1 && left[0] === "pgs", left.join(","));
  await c.end();

  console.log("\n── 6. Concurrent migrations");
  await recreate(D);
  const run = () => new Promise(res => { const p = spawn("node", ["src/config/migrate.js"], { cwd: ROOT, env: env(D) }); let o = ""; p.stdout.on("data", d => o += d); p.stderr.on("data", d => o += d); p.on("close", code => res({ code, o })); });
  const [a, b, d3] = await Promise.all([run(), run(), run()]);
  ok("3 simultaneous runs all succeed", a.code === 0 && b.code === 0 && d3.code === 0, a.o + b.o + d3.o);
  c = await connect(D);
  ok("no duplicated demo rows", +(await c.query("SELECT COUNT(*) FROM pgs")).rows[0].count === 1 && +(await c.query("SELECT COUNT(*) FROM payments")).rows[0].count === 23 && +(await c.query("SELECT COUNT(*) FROM expenses")).rows[0].count === 5);
  await c.end();

  console.log("\n── 7. Upgrading an OLDER existing database (production-like)");
  await recreate(D);
  migrate(D);                                    // build a current DB first...
  c = await connect(D);
  await c.query("DROP TRIGGER trg_payments_upd ON payments");
  // ...then make it look like an old install: remove later-added columns & the function
  await c.query(`ALTER TABLE pgs DROP COLUMN lat, DROP COLUMN lng, DROP COLUMN images, DROP COLUMN rules, DROP COLUMN nearby, DROP COLUMN amenities_list, DROP COLUMN description, DROP COLUMN pg_type`);
  await c.query(`ALTER TABLE role_permissions DROP COLUMN can_view, DROP COLUMN can_create`);
  await c.query(`ALTER TABLE payments DROP COLUMN due_month, DROP COLUMN updated_at`);
  await c.query(`ALTER TABLE pg_tenants DROP COLUMN blood_group`);
  await c.query(`DROP FUNCTION next_receipt_number()`); await c.query(`DROP SEQUENCE receipt_number_seq`);
  await c.query(`UPDATE payments SET receipt_number = '#REC-' || (5000 + row_number) FROM (SELECT id, row_number() OVER (ORDER BY created_at) row_number FROM payments) x WHERE payments.id = x.id`);
  const dataBefore = JSON.stringify([
    (await c.query("SELECT id, name, monthly_rent, status FROM pg_tenants ORDER BY id")).rows,
    (await c.query("SELECT id, receipt_number, amount, month FROM payments ORDER BY id")).rows,
    (await c.query("SELECT id, name, email FROM owners ORDER BY id")).rows,
  ]);
  const maxRec = +(await c.query("SELECT MAX(regexp_replace(receipt_number,'\\D','','g')::int) m FROM payments")).rows[0].m;
  await c.end();
  r = migrate(D, { NODE_ENV: "production", MASTER_ADMIN_EMAIL: "boss@example.com", MASTER_ADMIN_PASSWORD: "A-long-secret-1" });
  ok("upgrade run exits 0", r.status === 0, r.stdout + r.stderr);
  c = await connect(D);
  const cols = (await c.query("SELECT table_name||'.'||column_name n FROM information_schema.columns WHERE table_schema='public'")).rows.map(x => x.n);
  ok("missing columns re-added", ["pgs.lat","pgs.images","role_permissions.can_view","payments.due_month","payments.updated_at","pg_tenants.blood_group"].every(x => cols.includes(x)));
  const dataAfter = JSON.stringify([
    (await c.query("SELECT id, name, monthly_rent, status FROM pg_tenants ORDER BY id")).rows,
    (await c.query("SELECT id, receipt_number, amount, month FROM payments ORDER BY id")).rows,
    (await c.query("SELECT id, name, email FROM owners ORDER BY id")).rows,
  ]);
  ok("existing tenants / payments / owners byte-for-byte unchanged", dataBefore === dataAfter);
  const nx = (await c.query("SELECT next_receipt_number() n")).rows[0].n;
  ok(`receipt numbering continues after highest existing (${maxRec}) -> ${nx}`, +nx.replace(/\D/g, "") === maxRec + 1, nx);
  ok("payments trigger restored", +(await c.query("SELECT COUNT(*) FROM pg_trigger WHERE tgname='trg_payments_upd'")).rows[0].count === 1);
  await c.end();

  console.log("\n── 8. Existing production function is never replaced");
  c = await connect(D);
  await c.query(`CREATE OR REPLACE FUNCTION next_receipt_number() RETURNS TEXT AS $$ SELECT 'CUSTOM-1'::text $$ LANGUAGE sql`);
  await c.end();
  r = migrate(D, { NODE_ENV: "production", MASTER_ADMIN_EMAIL: "boss@example.com", MASTER_ADMIN_PASSWORD: "A-long-secret-1" });
  c = await connect(D);
  ok("custom next_receipt_number() survives a migration", r.status === 0 && (await c.query("SELECT next_receipt_number() n")).rows[0].n === "CUSTOM-1");
  await c.end();

  await drop(D);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error("CRASHED:", e); try { await drop("pgm_mig_test"); } catch {} process.exit(2); });
