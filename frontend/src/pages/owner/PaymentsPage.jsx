import { useState, useEffect, useCallback, useMemo, useContext } from "react";
import { useParams } from "react-router-dom";
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Avatar,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TablePagination,
  InputAdornment,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Chip,
  LinearProgress,
  Tooltip,
  Divider,
  Collapse,
  Tabs,
  Tab,
} from "@mui/material";
import {
  Search,
  Add,
  Download,
  Close,
  Warning,
  ExpandMore,
  ExpandLess,
  AccountBalanceWallet,
  CheckCircle,
  HourglassEmpty,
  ErrorOutline,
  TrendingUp,
  DeleteOutline,
  History,
  CalendarMonth,
  ArrowDownward,
  Receipt,
  KeyboardArrowDown,
  KeyboardArrowRight,
} from "@mui/icons-material";
import { pgAPI } from "../../services/api";
import StatusChip from "../../components/common/StatusChip";
import { usePermissions } from "../../hooks/usePermissions";
import { AuthContext } from "../../context/AuthContext";

/* ─── helpers ─────────────────────────────────────────────────────────────── */
const fm = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
const safeNum = (v) => parseFloat(v) || 0;
const TODAY = new Date().toISOString().split("T")[0];

const METHODS = ["cash", "upi", "bank_transfer", "cheque", "online"];
const METHOD_LABELS = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank Transfer",
  cheque: "Cheque",
  online: "Online",
};
const METHOD_ICONS = {
  cash: "💵",
  upi: "📱",
  bank_transfer: "🏦",
  cheque: "📃",
  online: "💻",
};

const currentMonthDate = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
})();

const MONTH_OPTIONS = (() => {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const label =
      d.toLocaleString("en-IN", { month: "short" }) + "-" + d.getFullYear();
    opts.push({ value, label });
  }
  return opts;
})();

const EMPTY_FORM = {
  pg_tenant_id: "",
  amount: "",
  payment_date: TODAY,
  payment_mode: "cash",
  transaction_ref: "",
  month: MONTH_OPTIONS[0].value,
  notes: "",
};
const EMPTY_ERRORS = {
  pg_tenant_id: "",
  amount: "",
  payment_date: "",
  payment_mode: "",
  month: "",
};

/* ─── Outstanding dues table ──────────────────────────────────────────────── */
function OutstandingTable({ ledger, onRecord, canCreate }) {
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("amount");

  const filtered = useMemo(() => {
    let rows = ledger.filter(
      (r) => safeNum(r.balance_due) > 0 || safeNum(r.prev_balance) > 0,
    );
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.tenant_name?.toLowerCase().includes(q) ||
          r.room_number?.toLowerCase().includes(q),
      );
    }
    if (sortBy === "amount") {
      rows = [...rows].sort(
        (a, b) =>
          safeNum(b.balance_due) +
          safeNum(b.prev_balance) -
          (safeNum(a.balance_due) + safeNum(a.prev_balance)),
      );
    }
    return rows;
  }, [ledger, search, sortBy]);

  if (filtered.length === 0 && !search) return null;

  const totalOutstanding = filtered.reduce(
    (s, r) => s + safeNum(r.balance_due) + safeNum(r.prev_balance),
    0,
  );

  return (
    <Card sx={{ mb: 2.5, border: "1px solid #FCA5A5" }}>
      <CardContent sx={{ p: 0 }}>
        <Box
          onClick={() => setOpen((o) => !o)}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 2,
            py: 1.5,
            cursor: "pointer",
            bgcolor: "#FFF5F5",
            borderRadius: open ? "12px 12px 0 0" : 2,
          }}
        >
          <ErrorOutline sx={{ color: "#DC2626", fontSize: 18 }} />
          <Typography
            sx={{
              fontWeight: 700,
              fontSize: "0.85rem",
              color: "#991B1B",
              flex: 1,
            }}
          >
            Outstanding Dues — {filtered.length} tenant
            {filtered.length !== 1 ? "s" : ""}
          </Typography>
          <Chip
            label={`${fm(totalOutstanding)} total`}
            size="small"
            sx={{
              bgcolor: "#FEE2E2",
              color: "#991B1B",
              fontWeight: 700,
              fontSize: "0.7rem",
            }}
          />
          {open ? (
            <ExpandLess sx={{ color: "#991B1B", fontSize: 18 }} />
          ) : (
            <ExpandMore sx={{ color: "#991B1B", fontSize: 18 }} />
          )}
        </Box>

        <Collapse in={open}>
          <Box
            sx={{
              px: 2,
              py: 1.2,
              display: "flex",
              gap: 1.5,
              alignItems: "center",
              borderBottom: "1px solid #FEE2E2",
              bgcolor: "#FFF9F9",
            }}
          >
            <TextField
              size="small"
              placeholder="Search by name or room…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ width: 200 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search sx={{ fontSize: 15, color: "#9CA3AF" }} />
                  </InputAdornment>
                ),
              }}
            />
            <Box
              sx={{
                display: "flex",
                gap: 0.5,
                ml: "auto",
                alignItems: "center",
              }}
            >
              <Typography
                sx={{ fontSize: "0.72rem", color: "#6B7280", mr: 0.5 }}
              >
                Sort:
              </Typography>
              <Chip
                label="High dues"
                size="small"
                clickable
                onClick={() => setSortBy("amount")}
                icon={<ArrowDownward sx={{ fontSize: "12px !important" }} />}
                sx={{
                  fontSize: "0.7rem",
                  bgcolor: sortBy === "amount" ? "#FEE2E2" : undefined,
                  color: sortBy === "amount" ? "#991B1B" : undefined,
                  fontWeight: sortBy === "amount" ? 700 : 400,
                }}
              />
            </Box>
          </Box>

          {filtered.length === 0 ? (
            <Box sx={{ py: 3, textAlign: "center" }}>
              <Typography sx={{ fontSize: "0.82rem", color: "#9CA3AF" }}>
                No tenants match "{search}"
              </Typography>
            </Box>
          ) : (
            <Box sx={{ overflowX: "auto", maxHeight: 320, overflowY: "auto" }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {[
                      "Tenant",
                      "Room",
                      "Current Month Due",
                      "Previous Due",
                      "Total Owed",
                      "Type",
                      canCreate && "Action",
                    ]
                      .filter(Boolean)
                      .map((h) => (
                        <TableCell
                          key={h}
                          sx={{
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            color: "#6B7280",
                            py: 1,
                            bgcolor: "#FFF5F5",
                          }}
                        >
                          {h}
                        </TableCell>
                      ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map((r) => {
                    const totalOwed =
                      safeNum(r.balance_due) + safeNum(r.prev_balance);
                    const isPrevOnly =
                      safeNum(r.balance_due) === 0 &&
                      safeNum(r.prev_balance) > 0;
                    return (
                      <TableRow
                        key={r.tenant_id}
                        sx={{ "&:hover": { bgcolor: "#FFF5F5" } }}
                      >
                        <TableCell>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                            }}
                          >
                            <Avatar
                              sx={{
                                width: 26,
                                height: 26,
                                fontSize: "0.68rem",
                                bgcolor: "#FCA5A5",
                                color: "#991B1B",
                              }}
                            >
                              {r.tenant_name?.substring(0, 2).toUpperCase()}
                            </Avatar>
                            <Typography
                              sx={{ fontSize: "0.82rem", fontWeight: 600 }}
                            >
                              {r.tenant_name}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography
                            sx={{ fontSize: "0.78rem", color: "#6B7280" }}
                          >
                            {r.room_number}
                            {r.bed_label ? ` · ${r.bed_label}` : ""}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {safeNum(r.balance_due) > 0 ? (
                            <Box>
                              <Typography
                                sx={{
                                  fontSize: "0.82rem",
                                  fontWeight: 600,
                                  color: "#D97706",
                                }}
                              >
                                {fm(r.balance_due)}
                              </Typography>
                              <Typography
                                sx={{ fontSize: "0.68rem", color: "#9CA3AF" }}
                              >
                                of {fm(r.rent_amount)}
                              </Typography>
                            </Box>
                          ) : (
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.5,
                              }}
                            >
                              <CheckCircle
                                sx={{ fontSize: 14, color: "#059669" }}
                              />
                              <Typography
                                sx={{
                                  fontSize: "0.75rem",
                                  color: "#059669",
                                  fontWeight: 600,
                                }}
                              >
                                This month paid
                              </Typography>
                            </Box>
                          )}
                        </TableCell>
                        <TableCell>
                          {safeNum(r.prev_balance) > 0 ? (
                            <Chip
                              label={fm(r.prev_balance)}
                              size="small"
                              sx={{
                                bgcolor: "#FEF3C7",
                                color: "#92400E",
                                fontWeight: 700,
                                fontSize: "0.68rem",
                              }}
                            />
                          ) : (
                            <Typography
                              sx={{ fontSize: "0.75rem", color: "#9CA3AF" }}
                            >
                              —
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography
                            sx={{
                              fontSize: "0.85rem",
                              fontWeight: 800,
                              color: "#DC2626",
                            }}
                          >
                            {fm(totalOwed)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={
                              isPrevOnly
                                ? "PREV DUE"
                                : r.effective_status === "partial"
                                  ? "PARTIAL"
                                  : "DUE"
                            }
                            size="small"
                            sx={{
                              bgcolor: isPrevOnly ? "#FEF3C7" : "#FEE2E2",
                              color: isPrevOnly ? "#92400E" : "#991B1B",
                              fontWeight: 700,
                              fontSize: "0.65rem",
                            }}
                          />
                        </TableCell>
                        {canCreate && (
                          <TableCell>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() =>
                                onRecord({ tenant_id: r.tenant_id, ...r })
                              }
                              sx={{
                                fontSize: "0.72rem",
                                py: 0.3,
                                px: 1,
                                borderRadius: 1.5,
                                borderColor: "#DC2626",
                                color: "#DC2626",
                                "&:hover": {
                                  bgcolor: "#FEE2E2",
                                  borderColor: "#DC2626",
                                },
                              }}
                            >
                              Record
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          )}
        </Collapse>
      </CardContent>
    </Card>
  );
}

/* ─── Tenant Ledger Dialog ───────────────────────────────────────────────── */
function TenantLedgerDialog({ open, tenantId, pgId, onClose }) {
  const [ledger, setLedger] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !tenantId) return;
    setLoading(true);
    pgAPI(pgId)
      .getTenantLedger(tenantId)
      .then((r) => {
        setLedger(r.data.ledger || []);
        setSummary(r.data.summary || {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, tenantId, pgId]);

  const statusColor = (s) =>
    ({
      paid: { bg: "#D1FAE5", color: "#059669" },
      partial: { bg: "#FEF3C7", color: "#D97706" },
      due: { bg: "#FEE2E2", color: "#DC2626" },
      overpaid: { bg: "#EDE9FE", color: "#7C3AED" },
    })[s] || { bg: "#F3F4F6", color: "#6B7280" };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          pb: 1,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Receipt sx={{ color: "#1B3A6B", fontSize: 20 }} />
          <Typography sx={{ fontWeight: 700, fontSize: "1rem" }}>
            Rent Ledger — {summary.tenant_name}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Grid container spacing={1.5} sx={{ mb: 2 }}>
              {[
                {
                  label: "Total Rent",
                  value: fm(summary.total_rent),
                  color: "#1B3A6B",
                },
                {
                  label: "Total Paid",
                  value: fm(summary.total_paid),
                  color: "#059669",
                },
                {
                  label: "Total Outstanding",
                  value: fm(summary.total_outstanding),
                  color: "#DC2626",
                },
              ].map((s) => (
                <Grid item xs={4} key={s.label}>
                  <Box
                    sx={{
                      bgcolor: "#F9FAFB",
                      borderRadius: 2,
                      p: 1.5,
                      textAlign: "center",
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: "0.68rem",
                        color: "#6B7280",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {s.label}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "1.1rem",
                        fontWeight: 800,
                        color: s.color,
                        mt: 0.3,
                      }}
                    >
                      {s.value}
                    </Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "#F9FAFB" }}>
                    {["Month", "Rent", "Paid", "Due", "Status", "Payments"].map(
                      (h) => (
                        <TableCell
                          key={h}
                          sx={{
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            color: "#6B7280",
                            py: 1,
                          }}
                        >
                          {h}
                        </TableCell>
                      ),
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ledger.map((row, i) => {
                    const sc = statusColor(row.status);
                    return (
                      <TableRow
                        key={i}
                        sx={{ "&:hover": { bgcolor: "#F9FAFB" } }}
                      >
                        <TableCell>
                          <Typography
                            sx={{ fontSize: "0.82rem", fontWeight: 600 }}
                          >
                            {new Date(row.month).toLocaleString("en-IN", {
                              month: "short",
                              year: "numeric",
                            })}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontSize: "0.82rem" }}>
                            {fm(row.rent_amount)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            sx={{
                              fontSize: "0.82rem",
                              color: "#059669",
                              fontWeight: 600,
                            }}
                          >
                            {fm(row.paid_amount)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {safeNum(row.balance_due) > 0 ? (
                            <Typography
                              sx={{
                                fontSize: "0.82rem",
                                color: "#DC2626",
                                fontWeight: 600,
                              }}
                            >
                              {fm(row.balance_due)}
                            </Typography>
                          ) : (
                            <Typography
                              sx={{ fontSize: "0.78rem", color: "#9CA3AF" }}
                            >
                              —
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={row.status?.toUpperCase()}
                            size="small"
                            sx={{
                              bgcolor: sc.bg,
                              color: sc.color,
                              fontWeight: 700,
                              fontSize: "0.65rem",
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography
                            sx={{ fontSize: "0.75rem", color: "#6B7280" }}
                          >
                            {Array.isArray(row.payments) &&
                            row.payments.length > 0
                              ? row.payments
                                  .map(
                                    (p) =>
                                      `${p.receipt_number} (${fm(p.paid_amount)})`,
                                  )
                                  .join(", ")
                              : "—"}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {ledger.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        sx={{ textAlign: "center", py: 4, color: "#9CA3AF" }}
                      >
                        No ledger records
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} variant="outlined" sx={{ borderRadius: 2 }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ─── Grouped Payment Row ────────────────────────────────────────────────── */
function GroupedPaymentRow({
  group,
  canCreate,
  isOwner,
  onEdit,
  onDelete,
  onLedger,
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMultiple = group.receipts.length > 1;
  const partial = group.is_partial || safeNum(group.balance_due) > 0;

  const pct = (() => {
    const rent = safeNum(group.tenant_rent || group.monthly_rent);
    const paid = safeNum(group.total_paid);
    return rent > 0 ? Math.min(100, Math.round((paid / rent) * 100)) : 100;
  })();

  return (
    <>
      <TableRow
        hover
        onClick={() => {
          if (hasMultiple) {
            setExpanded((e) => !e);
          } else if (canCreate) {
            onEdit(group.receipts[0]);
          }
        }}
        sx={{
          cursor: hasMultiple ? "pointer" : canCreate ? "pointer" : "default",
          bgcolor: partial ? "#FFFBF5" : undefined,
          "&:hover": { bgcolor: partial ? "#FEF9ED" : "#F5F7FF" },
        }}
      >
        {/* Expand / receipt indicator */}
        <TableCell sx={{ width: 40, pr: 0 }}>
          {hasMultiple ? (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((e) => !e);
              }}
            >
              {expanded ? (
                <KeyboardArrowDown sx={{ fontSize: 16, color: "#6B7280" }} />
              ) : (
                <KeyboardArrowRight sx={{ fontSize: 16, color: "#6B7280" }} />
              )}
            </IconButton>
          ) : (
            <Typography
              sx={{
                fontSize: "0.8rem",
                color: "#1B3A6B",
                fontWeight: 600,
                pl: 1,
              }}
            >
              {group.receipts[0].receipt_number}
            </Typography>
          )}
        </TableCell>

        {/* Receipt(s) label when multiple */}
        {hasMultiple && (
          <TableCell>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Typography
                sx={{ fontSize: "0.8rem", color: "#1B3A6B", fontWeight: 600 }}
              >
                {group.receipts.length} receipts
              </Typography>
              <Chip
                label={group.receipts.length}
                size="small"
                sx={{
                  bgcolor: "#EEF2FF",
                  color: "#1B3A6B",
                  fontWeight: 700,
                  fontSize: "0.65rem",
                  height: 18,
                }}
              />
            </Box>
          </TableCell>
        )}

        {/* Tenant */}
        <TableCell colSpan={hasMultiple ? 1 : 1}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Avatar
              sx={{
                width: 28,
                height: 28,
                fontSize: "0.7rem",
                bgcolor: "#1B3A6B",
              }}
            >
              {group.tenant_name?.substring(0, 2).toUpperCase()}
            </Avatar>
            <Box>
              <Typography sx={{ fontSize: "0.82rem", fontWeight: 600 }}>
                {group.tenant_name}
              </Typography>
              <Typography sx={{ fontSize: "0.7rem", color: "#6B7280" }}>
                {group.room_number}
              </Typography>
            </Box>
          </Box>
        </TableCell>

        {/* Month */}
        <TableCell>
          <Typography sx={{ fontSize: "0.78rem", color: "#6B7280" }}>
            {group.month
              ? new Date(group.month).toLocaleString("en-IN", {
                  month: "short",
                  year: "numeric",
                })
              : "—"}
          </Typography>
        </TableCell>

        {/* Date — latest payment date */}
        <TableCell>
          <Typography sx={{ fontSize: "0.78rem" }}>
            {fmtDate(group.receipts[group.receipts.length - 1]?.payment_date)}
          </Typography>
        </TableCell>

        {/* Total Paid */}
        <TableCell>
          <Typography sx={{ fontWeight: 700, fontSize: "0.85rem" }}>
            {fm(group.total_paid)}
          </Typography>
          {partial && (
            <Tooltip title={`${pct}% of rent paid`}>
              <LinearProgress
                variant="determinate"
                value={pct}
                sx={{
                  height: 3,
                  borderRadius: 2,
                  bgcolor: "#E5E7EB",
                  mt: 0.4,
                  width: 64,
                  "& .MuiLinearProgress-bar": { bgcolor: "#D97706" },
                }}
              />
            </Tooltip>
          )}
        </TableCell>

        {/* Rent */}
        <TableCell>
          <Typography sx={{ fontSize: "0.82rem", color: "#6B7280" }}>
            {fm(group.tenant_rent || group.monthly_rent)}
          </Typography>
        </TableCell>

        {/* Balance */}
        <TableCell>
          {partial ? (
            <Chip
              label={fm(group.balance_due)}
              size="small"
              sx={{
                bgcolor: "#FEF3C7",
                color: "#92400E",
                fontWeight: 700,
                fontSize: "0.68rem",
              }}
            />
          ) : (
            <Typography sx={{ fontSize: "0.75rem", color: "#9CA3AF" }}>
              —
            </Typography>
          )}
        </TableCell>

        {/* Method — show if single */}
        <TableCell>
          {!hasMultiple ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <span style={{ fontSize: 14 }}>
                {METHOD_ICONS[group.receipts[0].payment_mode] || "💳"}
              </span>
              <Typography sx={{ fontSize: "0.75rem" }}>
                {METHOD_LABELS[group.receipts[0].payment_mode] ||
                  group.receipts[0].payment_mode}
              </Typography>
            </Box>
          ) : (
            <Typography sx={{ fontSize: "0.72rem", color: "#9CA3AF" }}>
              Multiple
            </Typography>
          )}
        </TableCell>

        {/* Status */}
        <TableCell>
          <StatusChip
            status={partial ? "partial" : group.status || "settled"}
          />
        </TableCell>

        {/* Ledger */}
        <TableCell>
          <Tooltip title="View ledger history">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onLedger(group.pg_tenant_id);
              }}
              sx={{
                color: "#9CA3AF",
                "&:hover": { color: "#1B3A6B", bgcolor: "#EEF2FF" },
              }}
            >
              <Receipt sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        </TableCell>

        {/* Delete — only for single receipt rows */}
        {isOwner && (
          <TableCell align="right" sx={{ pr: 1 }}>
            {!hasMultiple && (
              <Tooltip title="Delete payment">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(e, group.receipts[0]);
                  }}
                  sx={{
                    color: "#9CA3AF",
                    "&:hover": { color: "#DC2626", bgcolor: "#FEE2E2" },
                  }}
                >
                  <DeleteOutline sx={{ fontSize: 17 }} />
                </IconButton>
              </Tooltip>
            )}
          </TableCell>
        )}
      </TableRow>

      {/* Expanded sub-rows for individual receipts */}
      {hasMultiple &&
        expanded &&
        group.receipts.map((p) => (
          <TableRow
            key={p.id}
            sx={{
              bgcolor: "#F8FAFF",
              "&:hover": { bgcolor: "#EEF2FF" },
              cursor: canCreate ? "pointer" : "default",
            }}
            onClick={() => {
              if (canCreate) onEdit(p);
            }}
          >
            <TableCell sx={{ pl: 5 }}>
              <Typography
                sx={{ fontSize: "0.78rem", color: "#1B3A6B", fontWeight: 600 }}
              >
                {p.receipt_number}
              </Typography>
            </TableCell>
            <TableCell />
            <TableCell />
            <TableCell>
              <Typography sx={{ fontSize: "0.75rem", color: "#6B7280" }}>
                {fmtDate(p.payment_date)}
              </Typography>
            </TableCell>
            <TableCell>
              <Typography sx={{ fontSize: "0.82rem", fontWeight: 600 }}>
                {fm(p.paid_amount || p.amount)}
              </Typography>
            </TableCell>
            <TableCell />
            <TableCell />
            <TableCell>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <span style={{ fontSize: 13 }}>
                  {METHOD_ICONS[p.payment_mode] || "💳"}
                </span>
                <Typography sx={{ fontSize: "0.72rem" }}>
                  {METHOD_LABELS[p.payment_mode] || p.payment_mode}
                </Typography>
              </Box>
            </TableCell>
            <TableCell />
            <TableCell />
            {isOwner && (
              <TableCell align="right" sx={{ pr: 1 }}>
                <Tooltip title="Delete payment">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(e, p);
                    }}
                    sx={{
                      color: "#9CA3AF",
                      "&:hover": { color: "#DC2626", bgcolor: "#FEE2E2" },
                    }}
                  >
                    <DeleteOutline sx={{ fontSize: 17 }} />
                  </IconButton>
                </Tooltip>
              </TableCell>
            )}
          </TableRow>
        ))}
    </>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function PaymentsPage() {
  const { pgId } = useParams();
  const api = pgAPI(pgId);
  const { can } = usePermissions();
  const canCreate = can("record_payments", "create");
  const { user } = useContext(AuthContext);
  const isOwner = user?.role === "owner" || user?.role === "master_admin";

  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState({});
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [paymentTab, setPaymentTab] = useState(0);
  const [filters, setFilters] = useState({
    search: "",
    method: "all",
    start_date: "",
    end_date: "",
    status: "all",
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPayment, setEditPayment] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState(EMPTY_ERRORS);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedTenantInfo, setSelectedTenantInfo] = useState(null);

  // Pending months for selected tenant (fetched from tenant ledger)
  const [pendingMonths, setPendingMonths] = useState(MONTH_OPTIONS);
  const [loadingTenantLedger, setLoadingTenantLedger] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");

  const [ledgerDialog, setLedgerDialog] = useState({
    open: false,
    tenantId: null,
  });

  /* ── fetch payments ── */
  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: page + 1, limit: 15, ...filters };
      if (params.method === "all") delete params.method;
      if (params.status === "all") delete params.status;
      if (paymentTab === 0) params.month = currentMonthDate;
      const res = await api.getPayments(params);
      setPayments(res.data.payments || []);
      setTotal(res.data.total || 0);
      setSummary(res.data.summary || {});
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [pgId, page, filters, paymentTab]);

  /* ── fetch PG-wide ledger ── */
  const fetchLedger = useCallback(async () => {
    try {
      const res = await api.getPgLedger();
      setLedger(res.data.ledger || []);
      setSummary((prev) => ({ ...prev, ...(res.data.summary || {}) }));
    } catch (e) {
      console.error(e);
    }
  }, [pgId]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);
  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  /* ── summary derived from ledger ── */
  const dashSummary = useMemo(() => {
    if (ledger.length > 0) {
      return {
        totalRent: ledger.reduce((s, r) => s + safeNum(r.rent_amount), 0),
        totalCollected: ledger.reduce((s, r) => s + safeNum(r.paid_amount), 0),
        currentDue: ledger.reduce((s, r) => s + safeNum(r.balance_due), 0),
        prevDueTotal: ledger.reduce((s, r) => s + safeNum(r.prev_balance), 0),
        countPaid: ledger.filter(
          (r) => safeNum(r.balance_due) === 0 && safeNum(r.prev_balance) === 0,
        ).length,
        countDue: ledger.filter(
          (r) => safeNum(r.balance_due) > 0 && safeNum(r.paid_amount) === 0,
        ).length,
        countPartial: ledger.filter(
          (r) => safeNum(r.balance_due) > 0 && safeNum(r.paid_amount) > 0,
        ).length,
        countPrevDue: ledger.filter(
          (r) => safeNum(r.balance_due) === 0 && safeNum(r.prev_balance) > 0,
        ).length,
      };
    }
    return {
      totalRent: safeNum(summary.total_rent),
      totalCollected: safeNum(summary.total_collected),
      currentDue: safeNum(summary.total_outstanding),
      prevDueTotal: 0,
      countPaid: 0,
      countDue: 0,
      countPartial: 0,
      countPrevDue: 0,
    };
  }, [ledger, summary]);

  const collectedPct =
    dashSummary.totalRent > 0
      ? Math.min(
          100,
          Math.round(
            (dashSummary.totalCollected / dashSummary.totalRent) * 100,
          ),
        )
      : 0;

  /* ── tenants with dues only ── */
  const tenantsWithDues = useMemo(
    () =>
      ledger.filter(
        (r) => safeNum(r.balance_due) > 0 || safeNum(r.prev_balance) > 0,
      ),
    [ledger],
  );
  const allHavePaid = tenantsWithDues.length === 0 && ledger.length > 0;

  const getLedgerRow = (tenantId) =>
    ledger.find((r) => String(r.tenant_id) === String(tenantId)) || null;

  /* ── fetch pending months for a specific tenant ── */
  const fetchTenantPendingMonths = useCallback(
    async (tenantId) => {
      if (!tenantId) {
        setPendingMonths(MONTH_OPTIONS);
        return;
      }
      setLoadingTenantLedger(true);
      try {
        const res = await api.getTenantLedger(tenantId);
        const tenantLedger = res.data.ledger || [];
        // Build month options from months that have balance_due > 0
        const pendingFromLedger = tenantLedger
          .filter((r) => safeNum(r.balance_due) > 0)
          .map((r) => {
            const d = new Date(r.month);
            const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
            const label =
              d.toLocaleString("en-IN", { month: "short" }) +
              "-" +
              d.getFullYear();
            return { value, label, balance_due: r.balance_due };
          });

        if (pendingFromLedger.length > 0) {
          setPendingMonths(pendingFromLedger);
          // Auto-select the first pending month
          setForm((f) => ({ ...f, month: pendingFromLedger[0].value }));
        } else {
          // No pending months from ledger — fall back to current month
          setPendingMonths([MONTH_OPTIONS[0]]);
          setForm((f) => ({ ...f, month: MONTH_OPTIONS[0].value }));
        }
      } catch (e) {
        console.error(e);
        setPendingMonths(MONTH_OPTIONS);
      } finally {
        setLoadingTenantLedger(false);
      }
    },
    [pgId],
  );

  /* ── group payments by tenant+month ── */
  const groupedPayments = useMemo(() => {
    const map = new Map();
    payments.forEach((p) => {
      const key = `${p.pg_tenant_id}-${p.month || "no-month"}`;
      if (!map.has(key)) {
        map.set(key, {
          ...p,
          receipts: [],
          total_paid: 0,
        });
      }
      const group = map.get(key);
      group.receipts.push(p);
      group.total_paid =
        (group.total_paid || 0) + safeNum(p.paid_amount || p.amount);
      // Use the latest balance_due and status
      group.balance_due = p.balance_due;
      group.status = p.status;
      group.is_partial = p.is_partial || safeNum(p.balance_due) > 0;
    });
    return [...map.values()];
  }, [payments]);

  /* ── open add dialog ── */
  const openAdd = (prefill = null) => {
    setEditPayment(null);
    setPendingMonths(MONTH_OPTIONS);
    const base = { ...EMPTY_FORM, month: MONTH_OPTIONS[0].value };
    if (prefill) {
      const tid = String(prefill.tenant_id || prefill.id || "");
      base.pg_tenant_id = tid;
      const row = getLedgerRow(tid);
      const autoAmount = row
        ? safeNum(row.balance_due) + safeNum(row.prev_balance)
        : safeNum(prefill.monthly_rent || prefill.rent_amount || 0);
      base.amount = autoAmount || "";
      setSelectedTenantInfo(row ? { ledgerRow: row } : null);
      if (tid) fetchTenantPendingMonths(tid);
    } else {
      setSelectedTenantInfo(null);
    }
    setForm(base);
    setErrors(EMPTY_ERRORS);
    setErr("");
    setDialogOpen(true);
  };

  const openEdit = (payment) => {
    setEditPayment(payment);
    setPendingMonths(MONTH_OPTIONS);
    setForm({
      pg_tenant_id: String(payment.pg_tenant_id || ""),
      amount: payment.paid_amount || payment.amount || "",
      payment_date: payment.payment_date?.split("T")[0] || "",
      payment_mode: payment.payment_mode || "cash",
      transaction_ref: payment.transaction_ref || "",
      month: payment.month || MONTH_OPTIONS[0].value,
      notes: payment.notes || "",
    });
    setErrors(EMPTY_ERRORS);
    setErr("");
    const row = getLedgerRow(payment.pg_tenant_id);
    setSelectedTenantInfo(row ? { ledgerRow: row } : null);
    setDialogOpen(true);
  };

  const handleClose = () => {
    if (saving) return;
    setDialogOpen(false);
  };
  const handleExited = () => {
    setForm(EMPTY_FORM);
    setErrors(EMPTY_ERRORS);
    setErr("");
    setEditPayment(null);
    setSelectedTenantInfo(null);
    setPendingMonths(MONTH_OPTIONS);
  };

  const handleTenantSelect = async (tenantId) => {
    const row = getLedgerRow(tenantId);
    setSelectedTenantInfo(row ? { ledgerRow: row } : null);
    const autoAmount = row
      ? safeNum(row.balance_due) + safeNum(row.prev_balance)
      : "";
    setForm((f) => ({
      ...f,
      pg_tenant_id: tenantId,
      amount: autoAmount || "",
    }));
    setErrors((e) => ({ ...e, pg_tenant_id: "", amount: "" }));
    // Fetch pending months for this tenant
    await fetchTenantPendingMonths(tenantId);
  };

  /* ── derived form values ── */
  const selRow = selectedTenantInfo?.ledgerRow;
  const rentNum = safeNum(selRow?.rent_amount);
  const balanceDueNum = safeNum(selRow?.balance_due);
  const prevDueNum = safeNum(selRow?.prev_balance);
  const totalOwed = balanceDueNum + prevDueNum;
  const amountNum = safeNum(form.amount);
  const remainingAfter = Math.max(0, totalOwed - amountNum);

  const amountHelperText = () => {
    if (!selRow) return "";
    if (!form.amount) {
      if (prevDueNum > 0 && balanceDueNum > 0)
        return `Current: ${fm(balanceDueNum)} + Previous: ${fm(prevDueNum)} = ${fm(totalOwed)} total owed`;
      if (prevDueNum > 0)
        return `Only previous balance due: ${fm(prevDueNum)} (current month paid ✓)`;
      return `Balance due this month: ${fm(balanceDueNum)}`;
    }
    if (amountNum > totalOwed)
      return `Overpayment of ${fm(amountNum - totalOwed)} — please verify`;
    if (remainingAfter > 0)
      return `Partial — ${fm(remainingAfter)} will remain after this payment`;
    return "✓ Fully settled";
  };
  const amountHelperColor = () => {
    if (!selRow || !form.amount) return "#9CA3AF";
    if (amountNum > totalOwed) return "#DC2626";
    if (remainingAfter > 0) return "#D97706";
    return "#059669";
  };

  /* ── validate ── */
  const validate = () => {
    const errs = { ...EMPTY_ERRORS };
    let ok = true;
    if (!form.pg_tenant_id) {
      errs.pg_tenant_id = "Select a tenant";
      ok = false;
    }
    if (!form.amount || safeNum(form.amount) <= 0) {
      errs.amount = "Enter a valid amount greater than 0";
      ok = false;
    }
    if (form.amount && safeNum(form.amount) > 999999) {
      errs.amount = "Amount seems too large";
      ok = false;
    }
    if (!form.payment_date) {
      errs.payment_date = "Payment date is required";
      ok = false;
    }
    // FIX: block future dates
    if (form.payment_date && form.payment_date > TODAY) {
      errs.payment_date = "Payment date cannot be in the future";
      ok = false;
    }
    if (!form.payment_mode) {
      errs.payment_mode = "Select a payment method";
      ok = false;
    }
    if (!form.month) {
      errs.month = "Select the month this payment covers";
      ok = false;
    }
    setErrors(errs);
    return ok;
  };

  /* ── submit ── */
  const handleSubmit = async () => {
    if (!validate()) return;
    setErr("");
    setSaving(true);
    try {
      if (editPayment) await api.updatePayment(editPayment.id, form);
      else await api.createPayment(form);
      setDialogOpen(false);
      await Promise.all([fetchPayments(), fetchLedger()]);
    } catch (e) {
      setErr(e.response?.data?.message || "Failed to save payment");
    } finally {
      setSaving(false);
    }
  };

  /* ── export ── */
  const handleExport = async () => {
    try {
      const params =
        paymentTab === 0
          ? { month: currentMonthDate }
          : filters.start_date
            ? { start_date: filters.start_date, end_date: filters.end_date }
            : {};
      const res = await api.exportPaymentsCSV(params);
      const url = URL.createObjectURL(
        new Blob([res.data], { type: "text/csv" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `payments-${TODAY}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed: " + e.message);
    }
  };

  /* ── delete ── */
  const openDeleteConfirm = (e, payment) => {
    e.stopPropagation();
    setDeleteTarget(payment);
    setDeleteErr("");
    setDeleteConfirmOpen(true);
  };
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteErr("");
    try {
      await api.deletePayment(deleteTarget.id);
      setDeleteConfirmOpen(false);
      await Promise.all([fetchPayments(), fetchLedger()]);
    } catch (e) {
      setDeleteErr(e.response?.data?.message || "Failed to delete payment.");
    } finally {
      setDeleting(false);
    }
  };
  const handleDeleteCancel = () => {
    if (deleting) return;
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
    setDeleteErr("");
  };

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          mb: 3,
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Payments
          </Typography>
          <Typography sx={{ color: "#6B7280", fontSize: "0.875rem" }}>
            Track rent collection and payment history.
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<Download />}
            onClick={handleExport}
            sx={{ borderRadius: 2, fontSize: "0.78rem" }}
          >
            Export CSV
          </Button>
          {canCreate && !allHavePaid && (
            <Button
              variant="contained"
              size="small"
              startIcon={<Add />}
              onClick={() => openAdd()}
              sx={{ borderRadius: 2 }}
            >
              Record Payment
            </Button>
          )}
          {canCreate && allHavePaid && (
            <Chip
              label="✓ All tenants paid this month"
              sx={{
                bgcolor: "#D1FAE5",
                color: "#059669",
                fontWeight: 700,
                fontSize: "0.75rem",
                height: 34,
                borderRadius: 2,
              }}
            />
          )}
        </Box>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          {
            label: "Total Monthly Rent",
            value: fm(dashSummary.totalRent),
            sub: `${ledger.length} active tenants`,
            color: "#1B3A6B",
            bg: "#EEF2FF",
            icon: (
              <AccountBalanceWallet sx={{ fontSize: 18, color: "#1B3A6B" }} />
            ),
          },
          {
            label: "Collected (MTD)",
            value: fm(dashSummary.totalCollected),
            sub: `${collectedPct}% of total rent`,
            color: "#059669",
            bg: "#D1FAE5",
            icon: <CheckCircle sx={{ fontSize: 18, color: "#059669" }} />,
          },
          {
            label: "Current Month Due",
            value: fm(dashSummary.currentDue),
            sub: `${dashSummary.countDue + dashSummary.countPartial} tenant${dashSummary.countDue + dashSummary.countPartial !== 1 ? "s" : ""} outstanding`,
            color: "#D97706",
            bg: "#FEF3C7",
            icon: <HourglassEmpty sx={{ fontSize: 18, color: "#D97706" }} />,
            highlight: dashSummary.currentDue > 0,
          },
          {
            label: "Previous Dues",
            value: fm(dashSummary.prevDueTotal),
            sub: `${dashSummary.countPrevDue} tenant${dashSummary.countPrevDue !== 1 ? "s" : ""} with carry-forward`,
            color: "#DC2626",
            bg: "#FEE2E2",
            icon: <ErrorOutline sx={{ fontSize: 18, color: "#DC2626" }} />,
            highlight: dashSummary.prevDueTotal > 0,
          },
        ].map((s) => (
          <Grid item xs={6} lg={3} key={s.label} sx={{ display: "flex" }}>
            <Card
              sx={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                border: s.highlight ? "1px solid #FCA5A5" : "1px solid #E5E7EB",
              }}
            >
              <CardContent sx={{ p: 2.5, flex: 1 }}>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 2,
                    bgcolor: s.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    mb: 1.5,
                  }}
                >
                  {s.icon}
                </Box>
                <Typography
                  sx={{
                    fontSize: "0.68rem",
                    color: "#6B7280",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {s.label}
                </Typography>
                <Typography
                  sx={{
                    fontSize: "1.55rem",
                    fontWeight: 800,
                    color: s.color,
                    lineHeight: 1.2,
                    mt: 0.3,
                  }}
                >
                  {s.value}
                </Typography>
                <Typography
                  sx={{ fontSize: "0.72rem", color: "#9CA3AF", mt: 0.4 }}
                >
                  {s.sub}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Progress */}
      <Card sx={{ mb: 2.5 }}>
        <CardContent sx={{ p: 2 }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 1,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <TrendingUp sx={{ fontSize: 16, color: "#1B3A6B" }} />
              <Typography sx={{ fontSize: "0.82rem", fontWeight: 600 }}>
                Monthly Collection Progress
              </Typography>
            </Box>
            <Chip
              label={`${collectedPct}%`}
              size="small"
              sx={{
                fontWeight: 800,
                fontSize: "0.75rem",
                bgcolor:
                  collectedPct >= 80
                    ? "#D1FAE5"
                    : collectedPct >= 50
                      ? "#FEF3C7"
                      : "#FEE2E2",
                color:
                  collectedPct >= 80
                    ? "#059669"
                    : collectedPct >= 50
                      ? "#D97706"
                      : "#DC2626",
              }}
            />
          </Box>
          <LinearProgress
            variant="determinate"
            value={collectedPct}
            sx={{
              height: 10,
              borderRadius: 5,
              bgcolor: "#E5E7EB",
              "& .MuiLinearProgress-bar": {
                bgcolor:
                  collectedPct >= 80
                    ? "#059669"
                    : collectedPct >= 50
                      ? "#D97706"
                      : "#DC2626",
                borderRadius: 5,
              },
            }}
          />
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              mt: 0.8,
              flexWrap: "wrap",
              gap: 0.5,
            }}
          >
            <Typography sx={{ fontSize: "0.72rem", color: "#059669" }}>
              Collected: {fm(dashSummary.totalCollected)}
            </Typography>
            <Box sx={{ display: "flex", gap: 2 }}>
              <Typography sx={{ fontSize: "0.72rem", color: "#374151" }}>
                ✓ Paid: {dashSummary.countPaid}
              </Typography>
              <Typography sx={{ fontSize: "0.72rem", color: "#D97706" }}>
                ~ Partial: {dashSummary.countPartial}
              </Typography>
              <Typography sx={{ fontSize: "0.72rem", color: "#DC2626" }}>
                ✕ Due: {dashSummary.countDue}
              </Typography>
              {dashSummary.countPrevDue > 0 && (
                <Typography sx={{ fontSize: "0.72rem", color: "#DC2626" }}>
                  ⚠ Prev Due: {dashSummary.countPrevDue}
                </Typography>
              )}
            </Box>
            <Typography sx={{ fontSize: "0.72rem", color: "#DC2626" }}>
              Remaining:{" "}
              {fm(
                Math.max(0, dashSummary.totalRent - dashSummary.totalCollected),
              )}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Outstanding Dues */}
      <OutstandingTable
        ledger={ledger}
        onRecord={openAdd}
        canCreate={canCreate}
      />

      {/* Payment Table */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ px: 2, pt: 1.5, borderBottom: "1px solid #E5E7EB" }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 1,
                flexWrap: "wrap",
                gap: 1,
              }}
            >
              <Tabs
                value={paymentTab}
                onChange={(_, v) => {
                  setPaymentTab(v);
                  setPage(0);
                }}
                sx={{
                  minHeight: 36,
                  "& .MuiTab-root": {
                    minHeight: 36,
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    py: 0.5,
                  },
                }}
              >
                <Tab
                  icon={<CalendarMonth sx={{ fontSize: 15 }} />}
                  iconPosition="start"
                  label="This Month"
                />
                <Tab
                  icon={<History sx={{ fontSize: 15 }} />}
                  iconPosition="start"
                  label="History"
                />
              </Tabs>
              <Box
                sx={{
                  display: "flex",
                  gap: 1,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <TextField
                  size="small"
                  placeholder="Search tenant…"
                  value={filters.search}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, search: e.target.value }))
                  }
                  sx={{ width: 160 }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search sx={{ fontSize: 15, color: "#9CA3AF" }} />
                      </InputAdornment>
                    ),
                  }}
                />
                {paymentTab === 1 && (
                  <>
                    <TextField
                      size="small"
                      type="date"
                      value={filters.start_date}
                      label="From"
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          start_date: e.target.value,
                        }))
                      }
                      sx={{ width: 140 }}
                      InputLabelProps={{ shrink: true }}
                      inputProps={{ max: TODAY }}
                    />
                    <TextField
                      size="small"
                      type="date"
                      value={filters.end_date}
                      label="To"
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, end_date: e.target.value }))
                      }
                      sx={{ width: 140 }}
                      InputLabelProps={{ shrink: true }}
                      inputProps={{ max: TODAY }}
                    />
                  </>
                )}
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>Method</InputLabel>
                  <Select
                    value={filters.method}
                    label="Method"
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, method: e.target.value }))
                    }
                  >
                    <MenuItem value="all">All Methods</MenuItem>
                    {METHODS.map((m) => (
                      <MenuItem key={m} value={m}>
                        {METHOD_ICONS[m]} {METHOD_LABELS[m]}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 115 }}>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={filters.status}
                    label="Status"
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, status: e.target.value }))
                    }
                  >
                    <MenuItem value="all">All Status</MenuItem>
                    <MenuItem value="settled">Paid</MenuItem>
                    <MenuItem value="partial">Partial</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </Box>
          </Box>

          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ overflowX: "auto" }}>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: "#F9FAFB" }}>
                    {[
                      "", // expand icon / receipt#
                      "Receipt / Tenant",
                      "Tenant",
                      "Month",
                      "Date",
                      "Paid",
                      "Rent",
                      "Balance",
                      "Method",
                      "Status",
                      "Ledger",
                      ...(isOwner ? [""] : []),
                    ].map((h, i) => (
                      <TableCell
                        key={i}
                        sx={{
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          color: "#6B7280",
                          py: 1.2,
                        }}
                      >
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {groupedPayments.map((group, idx) => (
                    <GroupedPaymentRow
                      key={`${group.pg_tenant_id}-${group.month}-${idx}`}
                      group={group}
                      canCreate={canCreate}
                      isOwner={isOwner}
                      onEdit={openEdit}
                      onDelete={openDeleteConfirm}
                      onLedger={(tenantId) =>
                        setLedgerDialog({ open: true, tenantId })
                      }
                    />
                  ))}
                  {groupedPayments.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={isOwner ? 12 : 11}
                        sx={{ textAlign: "center", py: 6, color: "#9CA3AF" }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 1,
                          }}
                        >
                          <Receipt sx={{ fontSize: 32, color: "#E5E7EB" }} />
                          <Typography sx={{ fontSize: "0.85rem" }}>
                            {paymentTab === 0
                              ? "No payments recorded this month yet"
                              : "No payment records found"}
                          </Typography>
                          <Typography
                            sx={{ fontSize: "0.75rem", color: "#9CA3AF" }}
                          >
                            {paymentTab === 0
                              ? "Switch to History tab to view all records"
                              : "Try adjusting the filters above"}
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
          )}
          <Box
            sx={{
              px: 2,
              py: 1,
              borderTop: "1px solid #E5E7EB",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Typography sx={{ fontSize: "0.82rem", color: "#6B7280" }}>
              Showing {groupedPayments.length} of {total} ({payments.length}{" "}
              receipts)
            </Typography>
            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={15}
              rowsPerPageOptions={[]}
              sx={{ border: "none" }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* ─── Record / Edit Dialog ─── */}
      <Dialog
        open={dialogOpen}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        keepMounted={false}
        TransitionProps={{ onExited: handleExited }}
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            pb: 1,
          }}
        >
          <Typography sx={{ fontWeight: 700, fontSize: "1rem" }}>
            {editPayment ? "Edit Payment" : "Record Payment"}
          </Typography>
          <IconButton onClick={handleClose} size="small" disabled={saving}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {err && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {err}
            </Alert>
          )}

          {/* Previous balance warning */}
          {selRow && prevDueNum > 0 && (
            <Alert
              severity="warning"
              icon={<Warning />}
              sx={{ mb: 2, borderRadius: 2 }}
            >
              <Typography sx={{ fontWeight: 700, fontSize: "0.85rem" }}>
                Previous balance: {fm(prevDueNum)}
              </Typography>
              <Typography sx={{ fontSize: "0.78rem", mt: 0.3 }}>
                {balanceDueNum > 0
                  ? `To clear all dues, collect ${fm(totalOwed)} (current ${fm(balanceDueNum)} + previous ${fm(prevDueNum)}).`
                  : `This month's rent is paid. Collecting previous balance of ${fm(prevDueNum)}.`}
              </Typography>
              <Button
                size="small"
                variant="outlined"
                color="warning"
                onClick={() => setForm((f) => ({ ...f, amount: totalOwed }))}
                sx={{
                  mt: 0.8,
                  fontSize: "0.72rem",
                  py: 0.3,
                  borderRadius: 1.5,
                }}
              >
                Auto-fill {fm(totalOwed)}
              </Button>
            </Alert>
          )}
          {selRow && prevDueNum === 0 && balanceDueNum > 0 && (
            <Alert
              severity="info"
              sx={{ mb: 2, borderRadius: 2, fontSize: "0.8rem" }}
            >
              Balance due: <strong>{fm(balanceDueNum)}</strong>
              {selRow.status === "partial" &&
                ` (partial — ${fm(safeNum(selRow.rent_amount) - balanceDueNum)} already paid this month)`}
            </Alert>
          )}

          <Grid container spacing={2} sx={{ mt: 0 }}>
            {/* Tenant dropdown — only tenants with pending dues */}
            <Grid item xs={12}>
              <FormControl fullWidth size="small" error={!!errors.pg_tenant_id}>
                <InputLabel>Select Tenant *</InputLabel>
                <Select
                  value={form.pg_tenant_id}
                  label="Select Tenant *"
                  onChange={(e) => handleTenantSelect(e.target.value)}
                  disabled={!!editPayment}
                >
                  {tenantsWithDues.length > 0 ? (
                    tenantsWithDues.map((r) => (
                      <MenuItem key={r.tenant_id} value={String(r.tenant_id)}>
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            width: "100%",
                          }}
                        >
                          <Typography sx={{ flex: 1, fontSize: "0.85rem" }}>
                            {r.tenant_name} — {r.room_number} (
                            {fm(r.rent_amount)}/mo)
                          </Typography>
                          {safeNum(r.prev_balance) > 0 &&
                            safeNum(r.balance_due) === 0 && (
                              <Chip
                                label={`PREV ${fm(r.prev_balance)}`}
                                size="small"
                                sx={{
                                  bgcolor: "#FEF3C7",
                                  color: "#92400E",
                                  fontWeight: 700,
                                  fontSize: "0.62rem",
                                }}
                              />
                            )}
                          {safeNum(r.prev_balance) > 0 &&
                            safeNum(r.balance_due) > 0 && (
                              <Chip
                                label="PREV+CURR DUE"
                                size="small"
                                sx={{
                                  bgcolor: "#FEE2E2",
                                  color: "#991B1B",
                                  fontWeight: 700,
                                  fontSize: "0.62rem",
                                }}
                              />
                            )}
                          {safeNum(r.prev_balance) === 0 &&
                            r.status === "partial" && (
                              <Chip
                                label="PARTIAL"
                                size="small"
                                sx={{
                                  bgcolor: "#FEF3C7",
                                  color: "#92400E",
                                  fontWeight: 700,
                                  fontSize: "0.62rem",
                                }}
                              />
                            )}
                        </Box>
                      </MenuItem>
                    ))
                  ) : (
                    <MenuItem disabled>
                      <Typography
                        sx={{ fontSize: "0.82rem", color: "#9CA3AF" }}
                      >
                        All tenants have paid this month
                      </Typography>
                    </MenuItem>
                  )}
                </Select>
                {errors.pg_tenant_id && (
                  <Typography
                    sx={{
                      fontSize: "0.72rem",
                      color: "#DC2626",
                      mt: 0.5,
                      ml: 1.5,
                    }}
                  >
                    {errors.pg_tenant_id}
                  </Typography>
                )}
              </FormControl>
            </Grid>

            {/* Quick-fill chips */}
            {selRow && (
              <Grid item xs={12}>
                <Box
                  sx={{
                    display: "flex",
                    gap: 1,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <Typography
                    sx={{ fontSize: "0.75rem", color: "#6B7280", mr: 0.5 }}
                  >
                    Quick fill:
                  </Typography>
                  {balanceDueNum > 0 && (
                    <Chip
                      label={`Current ${fm(balanceDueNum)}`}
                      size="small"
                      clickable
                      variant="outlined"
                      onClick={() => {
                        setForm((f) => ({ ...f, amount: balanceDueNum }));
                        setErrors((e) => ({ ...e, amount: "" }));
                      }}
                      sx={{ fontSize: "0.72rem" }}
                    />
                  )}
                  {prevDueNum > 0 && (
                    <Chip
                      label={`Prev ${fm(prevDueNum)}`}
                      size="small"
                      clickable
                      variant="outlined"
                      color="warning"
                      onClick={() => {
                        setForm((f) => ({ ...f, amount: prevDueNum }));
                        setErrors((e) => ({ ...e, amount: "" }));
                      }}
                      sx={{ fontSize: "0.72rem" }}
                    />
                  )}
                  {totalOwed > 0 && prevDueNum > 0 && (
                    <Chip
                      label={`Clear all ${fm(totalOwed)}`}
                      size="small"
                      clickable
                      variant="outlined"
                      color="error"
                      onClick={() => {
                        setForm((f) => ({ ...f, amount: totalOwed }));
                        setErrors((e) => ({ ...e, amount: "" }));
                      }}
                      sx={{ fontSize: "0.72rem" }}
                    />
                  )}
                </Box>
              </Grid>
            )}

            {/* Amount — FIX: min="1" to block negatives */}
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Amount Paid (₹) *"
                size="small"
                type="number"
                value={form.amount}
                onChange={(e) => {
                  setForm((f) => ({ ...f, amount: e.target.value }));
                  setErrors((er) => ({ ...er, amount: "" }));
                }}
                error={!!errors.amount}
                helperText={errors.amount || amountHelperText()}
                inputProps={{ min: 1 }}
                FormHelperTextProps={{
                  sx: {
                    color: errors.amount ? "#DC2626" : amountHelperColor(),
                    fontSize: "0.7rem",
                  },
                }}
              />
            </Grid>

            {/* Payment Date — FIX: max=TODAY to block future dates */}
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Payment Date *"
                size="small"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={form.payment_date}
                onChange={(e) => {
                  setForm((f) => ({ ...f, payment_date: e.target.value }));
                  setErrors((er) => ({ ...er, payment_date: "" }));
                }}
                error={!!errors.payment_date}
                helperText={errors.payment_date}
                inputProps={{ max: TODAY }}
              />
            </Grid>

            {/* Month — FIX: only pending months for selected tenant */}
            <Grid item xs={6}>
              <FormControl fullWidth size="small" error={!!errors.month}>
                <InputLabel>Month *</InputLabel>
                <Select
                  value={form.month}
                  label="Month *"
                  onChange={(e) => {
                    setForm((f) => ({ ...f, month: e.target.value }));
                    setErrors((er) => ({ ...er, month: "" }));
                  }}
                  disabled={loadingTenantLedger}
                  startAdornment={
                    loadingTenantLedger ? (
                      <InputAdornment position="start">
                        <CircularProgress size={14} />
                      </InputAdornment>
                    ) : null
                  }
                >
                  {pendingMonths.map((m) => (
                    <MenuItem key={m.value} value={m.value}>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          width: "100%",
                        }}
                      >
                        <Typography sx={{ flex: 1, fontSize: "0.85rem" }}>
                          {m.label}
                        </Typography>
                        {m.balance_due != null && (
                          <Chip
                            label={`Due ${fm(m.balance_due)}`}
                            size="small"
                            sx={{
                              bgcolor: "#FEE2E2",
                              color: "#991B1B",
                              fontWeight: 700,
                              fontSize: "0.62rem",
                            }}
                          />
                        )}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
                {errors.month && (
                  <Typography
                    sx={{
                      fontSize: "0.72rem",
                      color: "#DC2626",
                      mt: 0.5,
                      ml: 1.5,
                    }}
                  >
                    {errors.month}
                  </Typography>
                )}
              </FormControl>
            </Grid>

            {/* Method */}
            <Grid item xs={6}>
              <FormControl fullWidth size="small" error={!!errors.payment_mode}>
                <InputLabel>Method *</InputLabel>
                <Select
                  value={form.payment_mode}
                  label="Method *"
                  onChange={(e) => {
                    setForm((f) => ({ ...f, payment_mode: e.target.value }));
                    setErrors((er) => ({ ...er, payment_mode: "" }));
                  }}
                >
                  {METHODS.map((m) => (
                    <MenuItem key={m} value={m}>
                      {METHOD_ICONS[m]} {METHOD_LABELS[m]}
                    </MenuItem>
                  ))}
                </Select>
                {errors.payment_mode && (
                  <Typography
                    sx={{
                      fontSize: "0.72rem",
                      color: "#DC2626",
                      mt: 0.5,
                      ml: 1.5,
                    }}
                  >
                    {errors.payment_mode}
                  </Typography>
                )}
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Transaction Reference"
                size="small"
                placeholder={
                  form.payment_mode === "upi"
                    ? "UPI transaction ID"
                    : form.payment_mode === "cheque"
                      ? "Cheque number"
                      : "Optional reference"
                }
                value={form.transaction_ref}
                onChange={(e) =>
                  setForm((f) => ({ ...f, transaction_ref: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Notes"
                size="small"
                multiline
                rows={2}
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </Grid>
          </Grid>

          {/* Payment summary box */}
          {selRow && form.amount && (
            <Box
              sx={{
                mt: 2,
                p: 1.5,
                bgcolor: "#F9FAFB",
                borderRadius: 2,
                border: "1px solid #E5E7EB",
              }}
            >
              <Typography
                sx={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: "#374151",
                  mb: 0.8,
                }}
              >
                Payment Summary
              </Typography>
              {[
                { label: "Monthly rent", value: fm(rentNum), color: undefined },
                selRow.status === "partial" && {
                  label: "Already paid this month",
                  value: fm(rentNum - balanceDueNum),
                  color: "#059669",
                },
                balanceDueNum > 0 && {
                  label: "Current month balance",
                  value: fm(balanceDueNum),
                  color: "#D97706",
                },
                prevDueNum > 0 && {
                  label: "Previous months balance",
                  value: fm(prevDueNum),
                  color: "#DC2626",
                },
                { label: "Paying now", value: fm(amountNum), color: undefined },
              ]
                .filter(Boolean)
                .map((row, i) => (
                  <Box
                    key={i}
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      mb: 0.4,
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: "0.75rem",
                        color: row.color || "#6B7280",
                      }}
                    >
                      {row.label}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: row.color,
                      }}
                    >
                      {row.value}
                    </Typography>
                  </Box>
                ))}
              <Divider sx={{ my: 0.8 }} />
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography
                  sx={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: remainingAfter > 0 ? "#D97706" : "#059669",
                  }}
                >
                  {remainingAfter > 0
                    ? "Still owing after payment"
                    : "Status after payment"}
                </Typography>
                <Typography
                  sx={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: remainingAfter > 0 ? "#D97706" : "#059669",
                  }}
                >
                  {remainingAfter > 0
                    ? `${fm(remainingAfter)} remaining`
                    : "✓ Fully settled"}
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button
            onClick={handleClose}
            variant="outlined"
            disabled={saving}
            sx={{ borderRadius: 2, flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={saving}
            sx={{ borderRadius: 2, flex: 2 }}
          >
            {saving ? (
              <CircularProgress size={20} color="inherit" />
            ) : editPayment ? (
              "Save Changes"
            ) : (
              "Record Payment"
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Delete Confirm ─── */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={handleDeleteCancel}
        maxWidth="xs"
        fullWidth
        keepMounted={false}
        TransitionProps={{ onExited: () => setDeleteTarget(null) }}
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            pb: 1,
          }}
        >
          <Typography
            sx={{ fontWeight: 700, fontSize: "1rem", color: "#DC2626" }}
          >
            Delete Payment
          </Typography>
          <IconButton
            onClick={handleDeleteCancel}
            size="small"
            disabled={deleting}
          >
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {deleteErr && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {deleteErr}
            </Alert>
          )}
          {deleteTarget && (
            <Box>
              <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                This action is <strong>permanent</strong> and cannot be undone.
              </Alert>
              <Box
                sx={{
                  bgcolor: "#F9FAFB",
                  borderRadius: 2,
                  p: 2,
                  border: "1px solid #E5E7EB",
                }}
              >
                {[
                  ["Receipt", deleteTarget.receipt_number],
                  ["Tenant", deleteTarget.tenant_name],
                  [
                    "Month",
                    deleteTarget.month
                      ? new Date(deleteTarget.month).toLocaleString("en-IN", {
                          month: "long",
                          year: "numeric",
                        })
                      : "—",
                  ],
                  [
                    "Amount",
                    fm(deleteTarget.paid_amount || deleteTarget.amount),
                  ],
                  ["Date", fmtDate(deleteTarget.payment_date)],
                ].map(([label, val], i) => (
                  <Box
                    key={i}
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      mb: i < 4 ? 0.8 : 0,
                    }}
                  >
                    <Typography sx={{ fontSize: "0.78rem", color: "#6B7280" }}>
                      {label}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        color: label === "Amount" ? "#DC2626" : undefined,
                      }}
                    >
                      {val}
                    </Typography>
                  </Box>
                ))}
              </Box>
              <Typography
                sx={{ fontSize: "0.78rem", color: "#6B7280", mt: 1.5 }}
              >
                The tenant's ledger will be recalculated and their payment
                status will revert accordingly.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button
            onClick={handleDeleteCancel}
            variant="outlined"
            disabled={deleting}
            sx={{ borderRadius: 2, flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            variant="contained"
            disabled={deleting}
            sx={{
              borderRadius: 2,
              flex: 2,
              bgcolor: "#DC2626",
              "&:hover": { bgcolor: "#B91C1C" },
            }}
          >
            {deleting ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              `Yes, delete ${deleteTarget ? fm(deleteTarget.paid_amount || deleteTarget.amount) : ""}`
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Tenant Ledger Dialog ─── */}
      <TenantLedgerDialog
        open={ledgerDialog.open}
        tenantId={ledgerDialog.tenantId}
        pgId={pgId}
        onClose={() => setLedgerDialog({ open: false, tenantId: null })}
      />
    </Box>
  );
}
