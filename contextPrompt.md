# PG Manager v2 — Project Context Prompt

## What this project is
A full-stack **Paying Guest (PG) accommodation management platform** built for property owners in India. Multi-owner, multi-PG SaaS. Currently in active development.

---

## Tech Stack
| Layer | Tech |
|-------|------|
| Frontend | React 18, Vite, MUI v5, Recharts, React Router v6 |
| Backend | Node.js, Express.js |
| Database | PostgreSQL (hosted on Ubuntu 22.04 VPS) |
| Auth | JWT (7d expiry), stored in localStorage as `pg_token` |
| File uploads | Multer → local disk (`backend/uploads/photos/`, `backend/uploads/id-proofs/`) |
| Deployment | Nginx + PM2 on Ubuntu 22.04 VPS |

---

## User Roles
| Role | Access |
|------|--------|
| `master_admin` | Platform-wide — manages owners, all PGs |
| `owner` | Full access to their PG(s) |
| `manager` | Granular permissions per PG (can_view / can_create) |
| `staff` | Granular permissions per PG (can_view / can_create) |

**No tenant login.** Tenants use invite links / QR codes to self-register only.

---

## Database Tables (PostgreSQL)
```
master_admins        — platform admins
owners               — PG owners (invite-based registration)
pgs                  — PG properties (one owner can have many)
pg_staff             — manager/staff per PG
role_permissions     — can_view + can_create per permission per PG per role
rooms                — rooms per PG
beds                 — beds per room (labels A/B/C/D)
tenant_profiles      — global tenant identity (shared across PGs)
pg_tenants           — per-PG tenant snapshot (status, rent, room assignment)
payments             — rent payments (supports partial tracking)
expenses             — PG expenses by category
invites              — token-based invites for owners and tenants
activity_logs        — audit log per PG
```

### Key column notes
- `pg_tenants.status` → `pending | active | vacated`
- `pg_tenants.payment_status` → `paid | partial | due`
- `payments.is_partial`, `payments.paid_amount`, `payments.balance_due` — partial payment tracking
- `role_permissions.can_view` + `can_create` — granular permissions (NOT just `allowed`)
- `pgs.images` → JSONB array of image URLs (slider display)
- `pgs.lat`, `pgs.lng`, `pgs.pg_type`, `pgs.amenities_list`, `pgs.rules`, `pgs.nearby` — listing fields
- **Removed fields**: `blood_group`, `notes`, `notice_period_days` — do NOT add these back

### Migrations
```bash
npm run migrate        # fresh install — creates all tables + seeds
npm run migrate:v2     # existing install — adds all v2+v3 columns
```
Seed credentials:
- Master Admin: `admin@pgplatform.com` / `admin123`
- Owner: `ravi@grandpg.com` / `owner123`

---

## File Structure
```
pg-manager/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js
│   │   │   ├── migrate.js          ← fresh install
│   │   │   ├── migrate_v2.js       ← adds all new columns (run on existing DB)
│   │   │   └── schema.sql
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── financeController.js
│   │   │   ├── masterController.js
│   │   │   ├── pgController.js
│   │   │   ├── roomController.js
│   │   │   └── tenantController.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   └── upload.js           ← Multer, 5MB limit, photos + id-proofs
│   │   ├── routes/
│   │   │   └── index.js
│   │   └── index.js                ← Express entry, serves /uploads static
│   ├── uploads/
│   │   ├── photos/
│   │   └── id-proofs/
│   └── package.json
│
├── frontend/
│   └── src/
│       ├── App.jsx                 ← all routes defined here
│       ├── theme.js                ← MUI theme, Inter + Sora fonts
│       ├── services/
│       │   └── api.js              ← Axios client + all API call functions
│       ├── context/
│       │   └── AuthContext.jsx
│       ├── hooks/
│       │   └── usePermissions.jsx  ← PermissionsProvider + usePermissions()
│       ├── components/common/
│       │   ├── index.jsx           ← StatCard, PageHeader, EmptyState
│       │   └── StatusChip.jsx
│       └── pages/
│           ├── admin/              ← master_admin portal
│           │   ├── MasterLayout.jsx
│           │   ├── MasterDashboard.jsx
│           │   ├── MasterOwners.jsx
│           │   └── OwnerDetail.jsx
│           ├── auth/
│           │   ├── LoginPage.jsx
│           │   ├── InviteRegisterPage.jsx  ← owner registration from invite
│           │   ├── TenantInvitePage.jsx    ← PUBLIC tenant self-registration
│           │   └── PGSelectPage.jsx
│           └── owner/
│               ├── OwnerLayout.jsx         ← sidebar, PG switcher, permission-aware nav
│               ├── DashboardPage.jsx
│               ├── TenantsPage.jsx
│               ├── RoomsPage.jsx
│               ├── PaymentsPage.jsx
│               ├── ExpensesPage.jsx
│               └── AdminPage.jsx           ← Staff, Permissions, PG Settings, Reports, Activity
```

---

## API Routes (all under `/api`)
```
POST   /auth/login
GET    /auth/me
POST   /auth/invite/owner          (master_admin only)
GET    /auth/invite/:token
POST   /auth/register/owner

GET    /tenant-invite/:token       (public)
POST   /tenant-invite/submit       (public, multipart/form-data)

GET    /master/dashboard
GET    /master/owners
GET    /master/owners/:id
PATCH  /master/owners/:id/toggle
GET    /master/pgs/:pgId

GET    /owner/pgs
POST   /owner/pgs

GET    /pg/:pgId
PUT    /pg/:pgId                   (multipart — logo + pg_images)
DELETE /pg/:pgId/images
GET    /pg/:pgId/dashboard
GET    /pg/:pgId/reports
GET    /pg/:pgId/logs
GET    /pg/:pgId/staff
POST   /pg/:pgId/staff
PUT    /pg/:pgId/staff/:staffId
PUT    /pg/:pgId/staff/:staffId/reset-password
GET    /pg/:pgId/permissions
PUT    /pg/:pgId/permissions

GET    /pg/:pgId/tenants
GET    /pg/:pgId/tenants/:tenantId
POST   /pg/:pgId/tenants           (multipart — profile_photo + id_proof)
PUT    /pg/:pgId/tenants/:tenantId (multipart)
PATCH  /pg/:pgId/tenants/:tenantId/assign
PATCH  /pg/:pgId/tenants/:tenantId/rent
PATCH  /pg/:pgId/tenants/:tenantId/vacate
DELETE /pg/:pgId/tenants/:tenantId
POST   /pg/:pgId/tenants/invite
GET    /pg/:pgId/tenants/qr-code

GET    /pg/:pgId/rooms
GET    /pg/:pgId/rooms/:roomId
POST   /pg/:pgId/rooms
PUT    /pg/:pgId/rooms/:roomId
DELETE /pg/:pgId/rooms/:roomId
POST   /pg/:pgId/rooms/assign-bed
POST   /pg/:pgId/rooms/unassign-bed

GET    /pg/:pgId/payments
POST   /pg/:pgId/payments
PUT    /pg/:pgId/payments/:paymentId
GET    /pg/:pgId/payments/export-csv

GET    /pg/:pgId/expenses
POST   /pg/:pgId/expenses
PUT    /pg/:pgId/expenses/:expenseId
DELETE /pg/:pgId/expenses/:expenseId
```

---

## Frontend Routing
```
/login
/invite/owner?token=...         ← owner registration
/invite/tenant?token=...        ← PUBLIC tenant self-registration (no login)
/select-pg                      ← PG selector for multi-PG owners
/admin                          ← master_admin portal
/admin/owners
/admin/owners/:id
/pg/:pgId                       ← owner/staff dashboard
/pg/:pgId/tenants
/pg/:pgId/rooms
/pg/:pgId/payments
/pg/:pgId/expenses
/pg/:pgId/admin                 ← owner only
```

---

## Key Design Decisions

### Tenant model
- `tenant_profiles` = global identity (phone unique globally)
- `pg_tenants` = per-PG snapshot (status, rent, room — unique per pg_id+phone)
- Tenant status flow: `pending → active → vacated`

### Invite flow
**Owner invite**: master_admin invites → token in `owners.invite_token` AND `invites` table → owner registers at `/invite/owner?token=X`

**Tenant invite**: owner sends invite → token in `invites` table → tenant fills form at `/invite/tenant?token=X` (no login required) → submitted as `pending` in `pg_tenants`

### Permissions system
- `role_permissions` table has `can_view` + `can_create` per (pg_id, role, permission)
- Checking "create" auto-checks "view"; unchecking "view" auto-unchecks "create"
- Nav items hidden if `can_view = false`; create actions hidden if `can_create = false`
- Owners and master_admin bypass all permission checks

### Payments
- Partial payment: if `amount < monthly_rent` → `is_partial=TRUE`, `balance_due` stored
- `payment_status` on `pg_tenants` updated to `paid | partial | due` after each payment
- Previous month dues highlighted in red when recording new payment

### PG Settings
- Logo = single image upload
- Gallery = multiple images (up to 10) stored as JSONB array, displayed as slider
- No financial config in settings (rent is per-tenant)
- Listing fields: lat, lng, description, pg_type, amenities_list, rules, nearby

---

## Permissions Matrix (defaults)
| Permission | Manager View | Manager Create | Staff View | Staff Create |
|-----------|:---:|:---:|:---:|:---:|
| view_dashboard | ✅ | ✅ | ✅ | ❌ |
| manage_tenants | ✅ | ✅ | ✅ | ❌ |
| manage_rooms | ✅ | ✅ | ✅ | ❌ |
| record_payments | ✅ | ✅ | ✅ | ✅ |
| manage_expenses | ✅ | ✅ | ❌ | ❌ |
| view_reports | ✅ | ❌ | ❌ | ❌ |
| manage_staff | ❌ | ❌ | ❌ | ❌ |
| system_settings | ❌ | ❌ | ❌ | ❌ |

---

## Coding Conventions
- Backend: CommonJS (`require`/`module.exports`), async/await with try/catch, transactions for multi-step DB ops
- Frontend: ES modules, functional components, hooks only — no class components
- API calls: all in `src/services/api.js` via `pgAPI(pgId).methodName()` factory pattern
- Permissions check in UI: `const { can } = usePermissions(); const canCreate = can('manage_tenants', 'create');`
- File uploads: always `FormData` via `buildFD(form)` helper — never JSON for tenant create/update
- Dialogs: always `keepMounted={false}` + `TransitionProps={{ onExited: resetFn }}`
- Equal height cards: Grid items use `sx={{ display:'flex' }}` + Card uses `sx={{ width:'100%', display:'flex', flexDirection:'column' }}`
- All money: `₹` prefix, `Number(n).toLocaleString('en-IN')` formatting

## What NOT to add back
- `blood_group` field — removed from tenant forms and DB queries
- `notes` field — removed from tenant
- `notice_period_days` — removed from tenant
- Maintenance requests — removed entirely (no table, no UI, no routes)

---

## Currently Working / Completed
- ✅ Full auth (master_admin, owner, manager, staff login)
- ✅ Owner invite → registration flow (robust dual-source token validation)
- ✅ Tenant invite → public self-registration form → appears as pending
- ✅ QR code generation for PG self-registration
- ✅ Dashboard (vacancy + payment focus, floor-wise occupancy, due tenants list)
- ✅ Tenants page (add, edit personal info, row-click detail modal, assign room, edit rent separately, vacate, delete, payment history in modal, payment status chip)
- ✅ Rooms page (equal-height cards, Vacant Beds tab, field-level validation, assign bed, remove from bed, stat cards with pending tenants + revenue lost)
- ✅ Payments page (summary cards, partial payment tracking, prev month due highlight, edit on row click, export CSV working)
- ✅ Expenses page (6-month trend chart with current month highlighted, edit on row click, distribution bar)
- ✅ Admin panel — Staff tab, Permissions matrix (view+create per module), PG Settings (logo + image slider, lat/lng, listing fields), Reports tab, Activity log
- ✅ Permission enforcement (nav hidden, create buttons hidden per role)
- ✅ Multer file uploads (profile photo + ID proof, 5MB limit)

## Known Pending / Future Items
- AWS S3 integration (currently Multer local disk storage)
- WhatsApp/Email actual sending (currently generates links only)
- Tenant login portal (explicitly out of scope)
- Payment reminders / automation
- PG listing/marketplace page (lat/lng fields are ready)