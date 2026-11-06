/**
 * End-to-end smoke test: drives the REAL API against a REAL (freshly migrated)
 * PostgreSQL database, so every SQL statement in the controllers is executed
 * against schema.sql.
 *
 *   1. NODE_ENV=development npm run migrate
 *   2. npm start            (in another terminal, same .env)
 *   3. BASE=http://localhost:5000 npm run test:integration
 */
require("dotenv").config();
const { Client } = require("pg");
const BASE = process.env.BASE || `http://localhost:${process.env.PORT || 5000}`;

let pass = 0, fail = 0;
const failures = [];
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; failures.push(`${name} ${detail}`); console.log("  ✗", name, detail); }
};
const api = async (method, path, { token, body, form } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const r = await fetch(BASE + path, { method, headers, body: payload });
  let data = null; const text = await r.text();
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, headers: r.headers };
};
const login = async (email, password) => (await api("POST", "/api/auth/login", { body: { email, password } }));
const section = (t) => console.log(`\n── ${t}`);
const today = new Date().toISOString().slice(0, 10);
const firstOfMonth = today.slice(0, 8) + "01";

(async () => {
  const db = new Client({
    host: process.env.DB_HOST, port: process.env.DB_PORT, database: process.env.DB_NAME,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  });
  await db.connect();

  section("Health & public");
  ok("health", (await api("GET", "/health")).status === 200);
  const l = await api("GET", "/api/listings");
  ok("listings list", l.status === 200 && JSON.stringify(l.data).includes("The Grand PG"), JSON.stringify(l.data).slice(0, 120));

  section("Auth");
  const m = await login("admin@pgplatform.com", "admin123");
  ok("master login", m.status === 200 && m.data.token);
  const o = await login("ravi@grandpg.com", "owner123");
  ok("owner login (email)", o.status === 200 && o.data.token, JSON.stringify(o.data).slice(0, 100));
  const oPhone = await api("POST", "/api/auth/login", { body: { phone: "9876543210", password: "owner123" } });
  ok("owner login (phone)", oPhone.status === 200, JSON.stringify(oPhone.data).slice(0, 100));
  const mg = await login("manager@grandpg.com", "manager123");
  const st = await login("staff@grandpg.com", "staff12345");
  ok("manager login", mg.status === 200); ok("staff login", st.status === 200);
  ok("wrong password rejected", (await login("ravi@grandpg.com", "nope")).status === 400);
  const MT = m.data.token, OT = o.data.token, GT = mg.data.token, ST = st.data.token;
  const pgId = o.data.defaultPgId || o.data.pgs[0].id;
  ok("owner has the demo PG", !!pgId);
  for (const [n, t] of [["master", MT], ["owner", OT], ["manager", GT], ["staff", ST]])
    ok(`/auth/me (${n})`, (await api("GET", "/api/auth/me", { token: t })).status === 200);

  section("Master admin");
  ok("dashboard", (await api("GET", "/api/master/dashboard", { token: MT })).status === 200);
  const owners = await api("GET", "/api/master/owners?search=ravi&status=active", { token: MT });
  ok("owners list + filters", owners.status === 200, JSON.stringify(owners.data).slice(0, 100));
  const ownerId = (owners.data.owners || owners.data.data || [])[0]?.id;
  ok("owner detail", ownerId && (await api("GET", `/api/master/owners/${ownerId}`, { token: MT })).status === 200);
  ok("master PG detail", (await api("GET", `/api/master/pgs/${pgId}`, { token: MT })).status === 200);
  ok("toggle owner off", (await api("PATCH", `/api/master/owners/${ownerId}/toggle`, { token: MT })).status === 200);
  ok("deactivated owner locked out", (await api("GET", "/api/owner/pgs", { token: OT })).status === 401);
  ok("toggle owner on", (await api("PATCH", `/api/master/owners/${ownerId}/toggle`, { token: MT })).status === 200);
  ok("owner works again", (await api("GET", "/api/owner/pgs", { token: OT })).status === 200);

  section("Owner invite + registration");
  const inv = await api("POST", "/api/auth/invite/owner", { token: MT, body: { name: "Test Owner", email: "newowner@test.com", phone: "9000000001" } });
  ok("invite owner", inv.status < 300, JSON.stringify(inv.data).slice(0, 120));
  const tok = (await db.query("SELECT invite_token FROM owners WHERE email='newowner@test.com'")).rows[0]?.invite_token;
  ok("invite token stored", !!tok);
  ok("validate invite", (await api("GET", `/api/auth/invite/${tok}`)).status === 200);
  ok("register: short password rejected", (await api("POST", "/api/auth/register/owner", { body: { token: tok, password: "abc" } })).status === 400);
  ok("register owner", (await api("POST", "/api/auth/register/owner", { body: { token: tok, password: "StrongPass1" } })).status < 300);
  const no = await login("newowner@test.com", "StrongPass1");
  ok("new owner login", no.status === 200);
  const NOT = no.data.token;

  section("PG (create / settings / permissions)");
  const mypgs = await api("GET", "/api/owner/pgs", { token: OT });
  ok("owner PG list", mypgs.status === 200);
  const cpg = await api("POST", "/api/owner/pgs", { token: NOT, body: { name: "Second PG", city: "Pune", address: "1 Test Rd", phone: "9000000002" } });
  ok("create PG", cpg.status < 300, JSON.stringify(cpg.data).slice(0, 120));
  const pg2 = cpg.data.pg?.id || cpg.data.id;
  const permCount = (await db.query("SELECT COUNT(*)::int c FROM role_permissions WHERE pg_id=$1", [pg2])).rows[0].c;
  ok("default permissions created for new PG (16)", permCount === 16, String(permCount));
  ok("owner A cannot open owner B's PG", (await api("GET", `/api/pg/${pg2}`, { token: OT })).status === 403);
  ok("malformed pg id -> 400", (await api("GET", `/api/pg/not-a-uuid`, { token: OT })).status === 400);
  ok("get PG", (await api("GET", `/api/pg/${pgId}`, { token: OT })).status === 200);
  const up = await api("PUT", `/api/pg/${pgId}`, { token: OT, body: { name: "The Grand PG", city: "Bangalore", address: "123 MG Road", phone: "9876543210", email: "ravi@grandpg.com", description: "desc", pg_type: "mixed", amenities_list: ["WIFI"], rules: "No smoking", nearby: "Metro", lat: 12.97, lng: 77.59 } });
  ok("update PG settings", up.status === 200, JSON.stringify(up.data).slice(0, 120));
  ok("dashboard", (await api("GET", `/api/pg/${pgId}/dashboard`, { token: OT })).status === 200);
  ok("reports", (await api("GET", `/api/pg/${pgId}/reports?year=${today.slice(0, 4)}`, { token: OT })).status === 200);
  ok("logs (owner)", (await api("GET", `/api/pg/${pgId}/logs`, { token: OT })).status === 200);
  ok("logs denied to manager", (await api("GET", `/api/pg/${pgId}/logs`, { token: GT })).status === 403);
  const perms = await api("GET", `/api/pg/${pgId}/permissions`, { token: OT });
  ok("permissions list", perms.status === 200);

  section("Staff");
  const cs = await api("POST", `/api/pg/${pgId}/staff`, { token: OT, body: { name: "Temp Staff", email: "temp@grandpg.com", password: "temp12345", role: "staff" } });
  ok("create staff", cs.status < 300, JSON.stringify(cs.data).slice(0, 100));
  const staffId = (await db.query("SELECT id FROM pg_staff WHERE email='temp@grandpg.com'")).rows[0]?.id;
  ok("short password rejected", (await api("POST", `/api/pg/${pgId}/staff`, { token: OT, body: { name: "x", email: "x@y.com", password: "123", role: "staff" } })).status === 400);
  ok("invalid role rejected", (await api("POST", `/api/pg/${pgId}/staff`, { token: OT, body: { name: "x", email: "x2@y.com", password: "12345678", role: "owner" } })).status === 400);
  ok("duplicate email", (await api("POST", `/api/pg/${pgId}/staff`, { token: OT, body: { name: "x", email: "temp@grandpg.com", password: "12345678", role: "staff" } })).status === 400);
  const sl = await api("GET", `/api/pg/${pgId}/staff`, { token: OT });
  ok("list staff (no password field leaked)", sl.status === 200 && !JSON.stringify(sl.data).includes("password"));
  ok("update staff", (await api("PUT", `/api/pg/${pgId}/staff/${staffId}`, { token: OT, body: { name: "Temp 2", role: "manager", is_active: true } })).status === 200);
  ok("reset password", (await api("PUT", `/api/pg/${pgId}/staff/${staffId}/reset-password`, { token: OT, body: { new_password: "newpass1234" } })).status === 200);
  ok("staff login after reset", (await login("temp@grandpg.com", "newpass1234")).status === 200);
  ok("deactivate staff", (await api("PUT", `/api/pg/${pgId}/staff/${staffId}`, { token: OT, body: { name: "Temp 2", role: "manager", is_active: false } })).status === 200);
  ok("deactivated staff cannot login", (await login("temp@grandpg.com", "newpass1234")).status === 400);
  const pu = await api("PUT", `/api/pg/${pgId}/permissions`, { token: OT, body: { permissions: [{ role: "staff", permission: "manage_expenses", can_view: true, can_create: false }] } });
  ok("update permissions", pu.status === 200, JSON.stringify(pu.data));
  ok("staff now views expenses", (await api("GET", `/api/pg/${pgId}/expenses`, { token: ST })).status === 200);
  ok("staff (view-only) cannot create expense", (await api("POST", `/api/pg/${pgId}/expenses`, { token: ST, body: { description: "x", category: "water", amount: 10, expense_date: today } })).status === 403);

  section("Rooms & beds");
  const rooms = await api("GET", `/api/pg/${pgId}/rooms`, { token: OT });
  ok("rooms list", rooms.status === 200);
  const cr = await api("POST", `/api/pg/${pgId}/rooms`, { token: OT, body: { room_number: "Z-900", floor: 0, room_type: "double", amenities: ["AC", "WIFI"], monthly_rent: 10000, total_beds: 2 } });
  ok("create room (amenities array)", cr.status < 300, JSON.stringify(cr.data).slice(0, 150));
  const roomId = (await db.query("SELECT id FROM rooms WHERE room_number='Z-900'")).rows[0]?.id;
  ok("2 beds created", (await db.query("SELECT COUNT(*)::int c FROM beds WHERE room_id=$1", [roomId])).rows[0].c === 2);
  ok("duplicate room number", (await api("POST", `/api/pg/${pgId}/rooms`, { token: OT, body: { room_number: "Z-900", monthly_rent: 1000, total_beds: 1 } })).status === 400);
  ok("5 beds rejected", (await api("POST", `/api/pg/${pgId}/rooms`, { token: OT, body: { room_number: "Z-901", monthly_rent: 1000, total_beds: 5 } })).status === 400);
  ok("get room", (await api("GET", `/api/pg/${pgId}/rooms/${roomId}`, { token: OT })).status === 200);
  ok("update room", (await api("PUT", `/api/pg/${pgId}/rooms/${roomId}`, { token: OT, body: { room_number: "Z-900", floor: 0, room_type: "double", amenities: ["AC"], monthly_rent: 11000, status: "available", notes: "n" } })).status === 200);

  section("Tenants");
  const ct = await api("POST", `/api/pg/${pgId}/tenants`, { token: OT, body: { name: "Test Tenant", phone: "9222222221", email: "t@t.com", gender: "male", father_name: "F", parent_phone: "9222222222", occupation: "Eng", date_of_birth: "2000-01-01", permanent_address: "addr", id_type: "aadhaar" } });
  ok("create tenant (pending)", ct.status < 300, JSON.stringify(ct.data).slice(0, 150));
  const tId = (await db.query("SELECT id FROM pg_tenants WHERE phone='9222222221' AND pg_id=$1", [pgId])).rows[0]?.id;
  ok("bad phone rejected", (await api("POST", `/api/pg/${pgId}/tenants`, { token: OT, body: { name: "Bad", phone: "123" } })).status === 400);
  ok("duplicate phone", (await api("POST", `/api/pg/${pgId}/tenants`, { token: OT, body: { name: "Dup", phone: "9222222221" } })).status === 400);
  const tl = await api("GET", `/api/pg/${pgId}/tenants?status=active&search=jordan&page=1`, { token: OT });
  ok("tenants list + filters", tl.status === 200 && JSON.stringify(tl.data).includes("Jordan"), JSON.stringify(tl.data).slice(0, 120));
  ok("get tenant", (await api("GET", `/api/pg/${pgId}/tenants/${tId}`, { token: OT })).status === 200);
  ok("update tenant", (await api("PUT", `/api/pg/${pgId}/tenants/${tId}`, { token: OT, body: { name: "Test Tenant", phone: "9222222221", email: "t2@t.com", gender: "male", father_name: "F", parent_phone: "9222222222", occupation: "Doctor", date_of_birth: "2000-01-01", permanent_address: "addr", id_type: "aadhaar" } })).status === 200);
  ok("update tenant without phone -> 400", (await api("PUT", `/api/pg/${pgId}/tenants/${tId}`, { token: OT, body: { name: "X" } })).status === 400);
  const bedId = (await db.query("SELECT id FROM beds WHERE room_id=$1 AND bed_label='A'", [roomId])).rows[0].id;
  const as = await api("PATCH", `/api/pg/${pgId}/tenants/${tId}/assign`, { token: OT, body: { room_id: roomId, bed_id: bedId, joining_date: firstOfMonth, monthly_rent: 10000, deposit: 5000, rent_due_day: 5 } });
  ok("assign room/bed", as.status === 200, JSON.stringify(as.data).slice(0, 120));
  ok("bed occupied", (await db.query("SELECT status FROM beds WHERE id=$1", [bedId])).rows[0].status === "occupied");
  const other = await api("POST", `/api/pg/${pgId}/tenants`, { token: OT, body: { name: "Other", phone: "9777777771" } });
  const otherId = (await db.query("SELECT id FROM pg_tenants WHERE phone='9777777771' AND pg_id=$1", [pgId])).rows[0].id;
  const bad = await api("PATCH", `/api/pg/${pgId}/tenants/${otherId}/assign`, { token: OT, body: { room_id: roomId, bed_id: bedId, monthly_rent: 1 } });
  ok("assign to occupied bed rejected (400)", bad.status === 400, JSON.stringify(bad.data));
  ok("rejected assign changed nothing", (await db.query("SELECT bed_id FROM pg_tenants WHERE id=$1", [otherId])).rows[0].bed_id === null);
  ok("cross-PG assign (tenant of another PG) -> 404", (await api("PATCH", `/api/pg/${pg2}/tenants/${tId}/assign`, { token: NOT, body: { monthly_rent: 1 } })).status === 404);
  await api("DELETE", `/api/pg/${pgId}/tenants/${otherId}`, { token: OT });
  ok("connections still healthy after rejected assign", (await api("GET", `/api/pg/${pgId}/tenants`, { token: OT })).status === 200);
  ok("change rent", (await api("PATCH", `/api/pg/${pgId}/tenants/${tId}/rent`, { token: OT, body: { monthly_rent: 10500, deposit: 5000, rent_due_day: 5 } })).status === 200);
  ok("staff (no create) cannot create tenant", (await api("POST", `/api/pg/${pgId}/tenants`, { token: ST, body: { name: "x", phone: "9333333333" } })).status === 403);
  ok("QR code", (await api("GET", `/api/pg/${pgId}/tenants/qr-code`, { token: OT })).status === 200);
  const inv2 = await api("POST", `/api/pg/${pgId}/tenants/invite`, { token: OT, body: { name: "Invitee", phone: "9444444444", email: "i@i.com" } });
  ok("invite tenant", inv2.status < 300, JSON.stringify(inv2.data).slice(0, 120));

  section("Payments");
  const pay = (body, token = OT) => api("POST", `/api/pg/${pgId}/payments`, { token, body });
  const p1 = await pay({ pg_tenant_id: tId, amount: 4000, payment_date: today, month: firstOfMonth, payment_mode: "cash" });
  ok("partial payment", p1.status < 300, JSON.stringify(p1.data).slice(0, 200));
  const p2 = await pay({ pg_tenant_id: tId, amount: 6500, payment_date: today, month: firstOfMonth, payment_mode: "upi", transaction_ref: "TXN1" });
  ok("second payment completes month", p2.status < 300, JSON.stringify(p2.data).slice(0, 200));
  const rec = (await db.query("SELECT receipt_number, is_partial, balance_due FROM payments WHERE pg_tenant_id=$1 ORDER BY created_at", [tId])).rows;
  ok("receipts generated & distinct", rec.length === 2 && rec[0].receipt_number !== rec[1].receipt_number && /^#REC-\d+$/.test(rec[0].receipt_number), JSON.stringify(rec));
  ok("partial flag/balance correct", rec[0].is_partial === true && Number(rec[1].balance_due) === 0, JSON.stringify(rec));
  ok("tenant payment_status paid", (await db.query("SELECT payment_status FROM pg_tenants WHERE id=$1", [tId])).rows[0].payment_status === "paid");
  ok("payment list", (await api("GET", `/api/pg/${pgId}/payments?month=${firstOfMonth}`, { token: OT })).status === 200);
  const led = await api("GET", `/api/pg/${pgId}/payments/ledger`, { token: OT });
  ok("PG ledger", led.status === 200, JSON.stringify(led.data).slice(0, 120));
  const tled = await api("GET", `/api/pg/${pgId}/tenants/${tId}/ledger`, { token: OT });
  ok("tenant ledger", tled.status === 200, JSON.stringify(tled.data).slice(0, 120));
  const csv = await api("GET", `/api/pg/${pgId}/payments/export-csv`, { token: OT });
  ok("CSV export", csv.status === 200 && String(csv.data).includes("#REC-"));
  ok("staff can record payment (create perm)", (await pay({ pg_tenant_id: tId, amount: 100, payment_date: today, month: firstOfMonth }, ST)).status < 300);
  const payId = (await db.query("SELECT id FROM payments WHERE pg_tenant_id=$1 ORDER BY created_at LIMIT 1", [tId])).rows[0].id;
  ok("edit payment", (await api("PUT", `/api/pg/${pgId}/payments/${payId}`, { token: OT, body: { amount: 3900, payment_date: today, month: firstOfMonth, payment_mode: "cash" } })).status === 200);
  ok("amount 0 rejected", (await pay({ pg_tenant_id: tId, amount: 0, payment_date: today, month: firstOfMonth })).status === 400);
  ok("delete payment", (await api("DELETE", `/api/pg/${pgId}/payments/${payId}`, { token: OT })).status === 200);
  ok("tenant of another PG rejected", (await api("POST", `/api/pg/${pg2}/payments`, { token: NOT, body: { pg_tenant_id: tId, amount: 10, payment_date: today, month: firstOfMonth } })).status === 404);

  section("Expenses");
  const ce = await api("POST", `/api/pg/${pgId}/expenses`, { token: OT, body: { description: "Test expense", category: "repairs", amount: 999.5, expense_date: today, vendor: "V", invoice_number: "INV-1", status: "paid" } });
  ok("create expense", ce.status < 300, JSON.stringify(ce.data).slice(0, 120));
  ok("invalid expense rejected", (await api("POST", `/api/pg/${pgId}/expenses`, { token: OT, body: { description: "", category: "x", amount: -5, expense_date: today } })).status === 400);
  const el = await api("GET", `/api/pg/${pgId}/expenses?category=repairs&status=paid`, { token: OT });
  ok("expense list + filters", el.status === 200, JSON.stringify(el.data).slice(0, 120));
  const eId = (await db.query("SELECT id FROM expenses WHERE description='Test expense'")).rows[0].id;
  ok("update expense", (await api("PUT", `/api/pg/${pgId}/expenses/${eId}`, { token: OT, body: { description: "Test expense 2", category: "repairs", amount: 1000, expense_date: today, status: "pending" } })).status === 200);
  ok("delete expense", (await api("DELETE", `/api/pg/${pgId}/expenses/${eId}`, { token: OT })).status === 200);

  section("Tenant self-registration (QR) + ID proofs");
  const qr = await api("GET", `/api/pg/${pgId}/tenants/qr-code`, { token: OT });
  const qrTok = (await db.query("SELECT token FROM invites WHERE pg_id=$1 AND name='QR Invite' ORDER BY created_at DESC LIMIT 1", [pgId])).rows[0]?.token;
  ok("QR token stored", !!qrTok);
  ok("QR reused on second request", (await api("GET", `/api/pg/${pgId}/tenants/qr-code`, { token: OT })).status === 200 && (await db.query("SELECT COUNT(*)::int c FROM invites WHERE pg_id=$1 AND name='QR Invite'", [pgId])).rows[0].c === 1);
  ok("validate tenant invite", (await api("GET", `/api/tenant-invite/${qrTok}`)).status === 200);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const submit = async (phone) => {
    const f = new FormData();
    f.append("token", qrTok); f.append("name", "QR Tenant " + phone); f.append("phone", phone);
    f.append("id_proof", new Blob([png], { type: "image/png" }), "id.png");
    f.append("profile_photo", new Blob([png], { type: "image/png" }), "me.png");
    return api("POST", "/api/tenant-invite/submit", { form: f });
  };
  const s1 = await submit("9555555551");
  ok("QR registration #1", s1.status < 300, JSON.stringify(s1.data).slice(0, 150));
  const s2 = await submit("9555555552");
  ok("QR registration #2 (same QR still valid)", s2.status < 300, JSON.stringify(s2.data).slice(0, 150));
  // make tenant #1 ACTIVE with a bed, then try to hijack the record via the public form
  const t1 = (await db.query("SELECT id FROM pg_tenants WHERE phone='9555555551' AND pg_id=$1", [pgId])).rows[0].id;
  const freeBed = (await db.query("SELECT id, room_id FROM beds WHERE pg_id=$1 AND status='available' LIMIT 1", [pgId])).rows[0];
  await api("PATCH", `/api/pg/${pgId}/tenants/${t1}/assign`, { token: OT, body: { room_id: freeBed.room_id, bed_id: freeBed.id, joining_date: today, monthly_rent: 5000 } });
  ok("tenant #1 is active", (await db.query("SELECT status FROM pg_tenants WHERE id=$1", [t1])).rows[0].status === "active");
  const again = await submit("9555555551");
  ok("same phone re-submitted -> 400 'already registered'", again.status === 400 && /already registered/i.test(JSON.stringify(again.data)), JSON.stringify(again.data));
  const still = (await db.query("SELECT status, name, bed_id FROM pg_tenants WHERE id=$1", [t1])).rows[0];
  ok("active tenant NOT overwritten / reset to pending", still.status === "active" && still.name === "QR Tenant 9555555551" && still.bed_id === freeBed.id, JSON.stringify(still));
  await api("PATCH", `/api/pg/${pgId}/tenants/${t1}/vacate`, { token: OT, body: { vacated_date: today } });
  ok("vacated tenant may register again", (await submit("9555555551")).status < 300);
  ok("invalid phone rejected", (await submit("123")).status === 400);
  const idp = (await db.query("SELECT id_proof, profile_photo FROM pg_tenants WHERE phone='9555555551' AND pg_id=$1", [pgId])).rows[0];
  ok("id proof saved in /id-proofs, photo in /photos", idp?.id_proof?.startsWith("/uploads/id-proofs/") && idp?.profile_photo?.startsWith("/uploads/photos/"), JSON.stringify(idp));
  const fname = idp.id_proof.split("/").pop();
  ok("ID proof NOT public (static)", (await api("GET", idp.id_proof)).status === 403);
  ok("ID proof needs login", (await api("GET", `/api/files/id-proofs/${fname}`)).status === 401);
  ok("ID proof served to owner", (await api("GET", `/api/files/id-proofs/${fname}`, { token: OT })).status === 200);
  ok("ID proof denied to other owner", (await api("GET", `/api/files/id-proofs/${fname}`, { token: NOT })).status === 404);
  ok("profile photo is public", (await api("GET", idp.profile_photo)).status === 200);

  section("Tenant lifecycle (vacate / delete / isolation)");
  ok("cross-PG vacate blocked", (await api("PATCH", `/api/pg/${pg2}/tenants/${tId}/vacate`, { token: NOT, body: { vacated_date: today } })).status === 404);
  ok("bed untouched by blocked vacate", (await db.query("SELECT status FROM beds WHERE id=$1", [bedId])).rows[0].status === "occupied");
  ok("delete tenant with payments -> 400", (await api("DELETE", `/api/pg/${pgId}/tenants/${tId}`, { token: OT })).status === 400);
  ok("vacate tenant", (await api("PATCH", `/api/pg/${pgId}/tenants/${tId}/vacate`, { token: OT, body: { vacated_date: today } })).status === 200);
  ok("bed freed", (await db.query("SELECT status FROM beds WHERE id=$1", [bedId])).rows[0].status === "available");
  ok("room freed", (await db.query("SELECT status FROM rooms WHERE id=$1", [roomId])).rows[0].status === "available");
  const t2 = (await db.query("SELECT id FROM pg_tenants WHERE phone='9555555552' AND pg_id=$1", [pgId])).rows[0].id;
  ok("delete tenant without payments", (await api("DELETE", `/api/pg/${pgId}/tenants/${t2}`, { token: OT })).status === 200);
  ok("delete non-existent tenant -> 404", (await api("DELETE", `/api/pg/${pgId}/tenants/00000000-0000-0000-0000-000000000000`, { token: OT })).status === 404);
  ok("no idle-in-transaction connections", (await db.query("SELECT COUNT(*)::int c FROM pg_stat_activity WHERE datname=current_database() AND state LIKE 'idle in transaction%'")).rows[0].c === 0);
  const bedId2 = (await db.query("SELECT id FROM beds WHERE pg_id=$1 AND status='available' LIMIT 1", [pgId])).rows[0].id;
  const t3 = await api("POST", `/api/pg/${pgId}/tenants`, { token: OT, body: { name: "Bed Tenant", phone: "9666666661" } });
  const t3Id = (await db.query("SELECT id FROM pg_tenants WHERE phone='9666666661'")).rows[0].id;
  ok("assign-bed", (await api("POST", `/api/pg/${pgId}/rooms/assign-bed`, { token: OT, body: { bed_id: bedId2, tenant_id: t3Id } })).status === 200);
  ok("assign-bed marks bed occupied", (await db.query("SELECT status FROM beds WHERE id=$1", [bedId2])).rows[0].status === "occupied");
  ok("unassign-bed", (await api("POST", `/api/pg/${pgId}/rooms/unassign-bed`, { token: OT, body: { tenant_id: t3Id } })).status === 200);
  ok("unassign-bed frees the bed", (await db.query("SELECT status FROM beds WHERE id=$1", [bedId2])).rows[0].status === "available");
  ok("delete tenant 3", (await api("DELETE", `/api/pg/${pgId}/tenants/${t3Id}`, { token: OT })).status === 200);
  ok("delete empty room", (await api("DELETE", `/api/pg/${pgId}/rooms/${roomId}`, { token: OT })).status === 200);

  section("Public listings against real data");
  const lst = await api("GET", "/api/listings");
  const grand = (lst.data.listings || lst.data.pgs || lst.data.data || []).find((x) => x.name === "The Grand PG");
  ok("listing vacant beds correct (not multiplied)", grand && Number(grand.total_beds) === 12 && Number(grand.vacant_beds) >= 5 && Number(grand.vacant_beds) <= 12, JSON.stringify(grand));
  ok("listing detail", (await api("GET", `/api/listings/${pgId}`)).status === 200);
  ok("recommended", (await api("GET", `/api/listings/${pgId}/recommended`)).status === 200);
  ok("listing filters", (await api("GET", "/api/listings?city=Bangalore&pg_type=mixed&min_price=1000&max_price=99999&sort=price_asc")).status === 200);

  await db.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log("\nFAILURES:\n - " + failures.join("\n - ")); process.exit(1); }
})().catch((e) => { console.error("TEST CRASHED:", e); process.exit(2); });
