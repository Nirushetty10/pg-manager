// Run with:  npm test      (uses Node's built-in test runner, no extra deps)
process.env.JWT_SECRET = "test_secret_test_secret_test_secret_123";
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const jwt = require("jsonwebtoken");

// ── Mock the DB pool BEFORE loading the middleware ───────────────────────────
let handler = async () => ({ rows: [] });
const dbPath = require.resolve("../src/config/db");
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: (...a) => handler(...a) } };
const { auth, requirePermission, requirePGAccess } = require("../src/middleware/auth");

const mkRes = () => {
  const r = { code: 200, body: null };
  r.status = (c) => ((r.code = c), r);
  r.json = (b) => ((r.body = b), r);
  return r;
};
const run = async (mw, req) => {
  const res = mkRes();
  let nexted = false;
  await mw(req, res, () => (nexted = true));
  return { res, nexted };
};
const token = (p) => jwt.sign(p, process.env.JWT_SECRET, { expiresIn: "1h" });

test("auth: rejects missing / bad / expired token", async () => {
  assert.equal((await run(auth, { headers: {} })).res.code, 401);
  assert.equal((await run(auth, { headers: { authorization: "Bearer junk" } })).res.code, 401);
  const expired = jwt.sign({ id: 1, role: "owner" }, process.env.JWT_SECRET, { expiresIn: -10 });
  assert.equal((await run(auth, { headers: { authorization: `Bearer ${expired}` } })).res.code, 401);
});

test("auth: deactivated staff is locked out immediately", async () => {
  handler = async () => ({ rows: [{ is_active: false, pg_id: "pg1" }] });
  const t = token({ id: "s1", role: "staff", pgId: "pg1" });
  const { res, nexted } = await run(auth, { headers: { authorization: `Bearer ${t}` } });
  assert.equal(res.code, 401);
  assert.equal(nexted, false);
});

test("auth: deactivated owner is locked out", async () => {
  handler = async () => ({ rows: [{ is_active: false }] });
  const t = token({ id: "o1", role: "owner" });
  assert.equal((await run(auth, { headers: { authorization: `Bearer ${t}` } })).res.code, 401);
});

test("auth: active staff passes and pgId comes from DB, not token", async () => {
  handler = async () => ({ rows: [{ is_active: true, pg_id: "REAL_PG" }] });
  const t = token({ id: "s1", role: "staff", pgId: "FORGED_PG" });
  const req = { headers: { authorization: `Bearer ${t}` } };
  const { nexted } = await run(auth, req);
  assert.equal(nexted, true);
  assert.equal(req.actor.pgId, "REAL_PG");
});

test("permission: view-only staff can GET but cannot POST/PUT/DELETE (can_create enforced)", async () => {
  handler = async () => ({ rows: [{ can_view: true, can_create: false }] });
  const actor = { role: "staff", pgId: "pg1" };
  assert.equal((await run(requirePermission("manage_tenants"), { method: "GET", actor })).nexted, true);
  for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
    const { res, nexted } = await run(requirePermission("manage_tenants"), { method: m, actor });
    assert.equal(nexted, false, `${m} must be blocked`);
    assert.equal(res.code, 403);
  }
});

test("permission: create allowed when can_view && can_create", async () => {
  handler = async () => ({ rows: [{ can_view: true, can_create: true }] });
  const { nexted } = await run(requirePermission("record_payments"), { method: "POST", actor: { role: "manager", pgId: "pg1" } });
  assert.equal(nexted, true);
});

test("permission: no view -> denied even for GET; missing row -> denied", async () => {
  handler = async () => ({ rows: [{ can_view: false, can_create: true }] });
  assert.equal((await run(requirePermission("x"), { method: "GET", actor: { role: "staff", pgId: "p" } })).res.code, 403);
  handler = async () => ({ rows: [] });
  assert.equal((await run(requirePermission("x"), { method: "GET", actor: { role: "staff", pgId: "p" } })).res.code, 403);
});

test("permission: owner and master_admin bypass", async () => {
  for (const role of ["owner", "master_admin"])
    assert.equal((await run(requirePermission("x"), { method: "DELETE", actor: { role } })).nexted, true);
});

test("permission: DB error returns 500, not a hang", async () => {
  handler = async () => { throw new Error("db down"); };
  assert.equal((await run(requirePermission("x"), { method: "GET", actor: { role: "staff", pgId: "p" } })).res.code, 500);
});

test("pgAccess: malformed pgId returns 400 instead of hanging/crashing", async () => {
  handler = async () => { const e = new Error("bad uuid"); e.code = "22P02"; throw e; };
  const { res } = await run(requirePGAccess, { actor: { role: "owner", id: "o1" }, params: { pgId: "not-a-uuid" }, body: {}, query: {} });
  assert.equal(res.code, 400);
});

test("pgAccess: owner of another PG is blocked; staff of another PG is blocked", async () => {
  handler = async () => ({ rows: [] });
  assert.equal((await run(requirePGAccess, { actor: { role: "owner", id: "o1" }, params: { pgId: "p2" }, body: {}, query: {} })).res.code, 403);
  assert.equal((await run(requirePGAccess, { actor: { role: "staff", pgId: "p1" }, params: { pgId: "p2" }, body: {}, query: {} })).res.code, 403);
});

test("pgAccess: staff of same PG passes", async () => {
  assert.equal((await run(requirePGAccess, { actor: { role: "manager", pgId: "p1" }, params: { pgId: "p1" }, body: {}, query: {} })).nexted, true);
});
