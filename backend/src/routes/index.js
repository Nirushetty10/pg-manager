const express = require("express");
const router = express.Router();
const {
  auth,
  requireMasterAdmin,
  requireOwner,
  requirePGAccess,
  requirePermission,
} = require("../middleware/auth");
const { upload, handleMulterError } = require("../middleware/upload");

const authCtrl = require("../controllers/authController");
const masterCtrl = require("../controllers/masterController");
const pgCtrl = require("../controllers/pgController");
const tenantCtrl = require("../controllers/tenantController");
const roomCtrl = require("../controllers/roomController");
const finCtrl = require("../controllers/financeController");

// ── AUTH ──────────────────────────────────────────────────────
router.post("/auth/login", authCtrl.login);
router.get("/auth/me", auth, authCtrl.getMe);
router.post(
  "/auth/invite/owner",
  auth,
  requireMasterAdmin,
  authCtrl.inviteOwner,
);
router.get("/auth/invite/:token", authCtrl.validateInvite);
router.post("/auth/register/owner", authCtrl.registerOwner);

// ── TENANT INVITE (public - no login) ──────────────────────────
// Validate a tenant invite token (public)
router.get("/tenant-invite/:token", authCtrl.validateInvite);
// Submit tenant self-registration from invite link (public)
router.post(
  "/tenant-invite/submit",
  upload.fields([
    { name: "profile_photo", maxCount: 1 },
    { name: "id_proof", maxCount: 1 },
  ]),
  handleMulterError,
  tenantCtrl.submitTenantInvite,
);

// ── MASTER ADMIN ──────────────────────────────────────────────
router.get(
  "/master/dashboard",
  auth,
  requireMasterAdmin,
  masterCtrl.getMasterDashboard,
);
router.get("/master/owners", auth, requireMasterAdmin, masterCtrl.getOwners);
router.get(
  "/master/owners/:id",
  auth,
  requireMasterAdmin,
  masterCtrl.getOwnerById,
);
router.patch(
  "/master/owners/:id/toggle",
  auth,
  requireMasterAdmin,
  masterCtrl.toggleOwnerStatus,
);
router.get(
  "/master/pgs/:pgId",
  auth,
  requireMasterAdmin,
  masterCtrl.getPGDetails,
);

// ── OWNER ─────────────────────────────────────────────────────
router.get("/owner/pgs", auth, requireOwner, pgCtrl.getOwnerPGs);
router.post("/owner/pgs", auth, requireOwner, pgCtrl.createPG);

// ── PG-SCOPED ROUTES ──────────────────────────────────────────
const pg = express.Router({ mergeParams: true });

const pgUpload = upload.fields([
  { name: "logo", maxCount: 1 },
  { name: "pg_images", maxCount: 10 },
]);

pg.get("/", auth, requirePGAccess, pgCtrl.getPG);
pg.put(
  "/",
  auth,
  requirePGAccess,
  requirePermission("system_settings"),
  pgUpload,
  handleMulterError,
  pgCtrl.updatePG,
);
pg.delete(
  "/images",
  auth,
  requirePGAccess,
  requirePermission("system_settings"),
  pgCtrl.removePGImage,
);
pg.get("/dashboard", auth, requirePGAccess, pgCtrl.getPGDashboard);
pg.get(
  "/reports",
  auth,
  requirePGAccess,
  requirePermission("view_reports"),
  pgCtrl.getReports,
);
pg.get("/logs", auth, requirePGAccess, pgCtrl.getLogs);

// Staff
pg.get(
  "/staff",
  auth,
  requirePGAccess,
  requirePermission("manage_staff"),
  pgCtrl.getStaff,
);
pg.post(
  "/staff",
  auth,
  requirePGAccess,
  requirePermission("manage_staff"),
  pgCtrl.createStaff,
);
pg.put(
  "/staff/:staffId",
  auth,
  requirePGAccess,
  requirePermission("manage_staff"),
  pgCtrl.updateStaff,
);
pg.put(
  "/staff/:staffId/reset-password",
  auth,
  requirePGAccess,
  requirePermission("manage_staff"),
  pgCtrl.resetStaffPassword,
);

// Permissions
pg.get("/permissions", auth, requirePGAccess, pgCtrl.getPermissions);
pg.put(
  "/permissions",
  auth,
  requirePGAccess,
  requirePermission("system_settings"),
  pgCtrl.updatePermissions,
);

// Tenants
const tenantUpload = upload.fields([
  { name: "profile_photo", maxCount: 1 },
  { name: "id_proof", maxCount: 1 },
]);
pg.get(
  "/tenants",
  auth,
  requirePGAccess,
  requirePermission("manage_tenants"),
  tenantCtrl.getTenants,
);
pg.get(
  "/tenants/:tenantId",
  auth,
  requirePGAccess,
  requirePermission("manage_tenants"),
  tenantCtrl.getTenantById,
);
pg.post(
  "/tenants",
  auth,
  requirePGAccess,
  requirePermission("manage_tenants"),
  tenantUpload,
  handleMulterError,
  tenantCtrl.createTenant,
);
pg.put(
  "/tenants/:tenantId",
  auth,
  requirePGAccess,
  requirePermission("manage_tenants"),
  tenantUpload,
  handleMulterError,
  tenantCtrl.updateTenant,
);
pg.patch(
  "/tenants/:tenantId/assign",
  auth,
  requirePGAccess,
  requirePermission("manage_tenants"),
  tenantCtrl.assignRoom,
);
pg.patch(
  "/tenants/:tenantId/rent",
  auth,
  requirePGAccess,
  requirePermission("manage_tenants"),
  tenantCtrl.updateRentDetails,
);
pg.patch(
  "/tenants/:tenantId/vacate",
  auth,
  requirePGAccess,
  requirePermission("manage_tenants"),
  tenantCtrl.markVacated,
);
pg.delete(
  "/tenants/:tenantId",
  auth,
  requirePGAccess,
  requirePermission("manage_tenants"),
  tenantCtrl.deleteTenant,
);
pg.post(
  "/tenants/invite",
  auth,
  requirePGAccess,
  requirePermission("manage_tenants"),
  tenantCtrl.inviteTenant,
);
pg.get(
  "/tenants/qr-code",
  auth,
  requirePGAccess,
  requirePermission("manage_tenants"),
  tenantCtrl.getQRCode,
);

// Rooms (no maintenance)
pg.get(
  "/rooms",
  auth,
  requirePGAccess,
  requirePermission("manage_rooms"),
  roomCtrl.getRooms,
);
pg.get(
  "/rooms/:roomId",
  auth,
  requirePGAccess,
  requirePermission("manage_rooms"),
  roomCtrl.getRoomById,
);
pg.post(
  "/rooms",
  auth,
  requirePGAccess,
  requirePermission("manage_rooms"),
  roomCtrl.createRoom,
);
pg.put(
  "/rooms/:roomId",
  auth,
  requirePGAccess,
  requirePermission("manage_rooms"),
  roomCtrl.updateRoom,
);
pg.delete(
  "/rooms/:roomId",
  auth,
  requirePGAccess,
  requirePermission("manage_rooms"),
  roomCtrl.deleteRoom,
);
pg.post(
  "/rooms/assign-bed",
  auth,
  requirePGAccess,
  requirePermission("manage_rooms"),
  roomCtrl.assignBed,
);
pg.post(
  "/rooms/unassign-bed",
  auth,
  requirePGAccess,
  requirePermission("manage_rooms"),
  roomCtrl.unassignBed,
);

// Payments
pg.get(
  "/payments",
  auth,
  requirePGAccess,
  requirePermission("record_payments"),
  finCtrl.getPayments,
);
pg.get(
  "/payments/ledger",
  auth,
  requirePGAccess,
  requirePermission("record_payments"),
  finCtrl.getPgLedger,
);
pg.get(
  "/payments/export-csv",
  auth,
  requirePGAccess,
  requirePermission("record_payments"),
  finCtrl.exportPaymentsCSV,
);
pg.post(
  "/payments",
  auth,
  requirePGAccess,
  requirePermission("record_payments"),
  finCtrl.createPayment,
);
pg.put(
  "/payments/:paymentId",
  auth,
  requirePGAccess,
  requirePermission("record_payments"),
  finCtrl.updatePayment,
);
pg.delete(
  "/payments/:paymentId",
  auth,
  requirePGAccess,
  requirePermission("record_payments"),
  finCtrl.deletePayment,
);
pg.get(
  "/tenants/:tenantId/ledger",
  auth,
  requirePGAccess,
  requirePermission("manage_tenants"),
  finCtrl.getTenantLedger,
);

// Expenses
pg.get(
  "/expenses",
  auth,
  requirePGAccess,
  requirePermission("manage_expenses"),
  finCtrl.getExpenses,
);
pg.post(
  "/expenses",
  auth,
  requirePGAccess,
  requirePermission("manage_expenses"),
  finCtrl.createExpense,
);
pg.put(
  "/expenses/:expenseId",
  auth,
  requirePGAccess,
  requirePermission("manage_expenses"),
  finCtrl.updateExpense,
);
pg.delete(
  "/expenses/:expenseId",
  auth,
  requirePGAccess,
  requirePermission("manage_expenses"),
  finCtrl.deleteExpense,
);

router.use("/pg/:pgId", pg);

module.exports = router;
