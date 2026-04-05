import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TablePagination,
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
  Grid,
  LinearProgress,
  Chip,
  TextField,
} from "@mui/material";
import {
  Add,
  Close,
  Download,
  Edit,
  Delete,
  ElectricBolt,
  WaterDrop,
  PeopleAlt,
  Build,
  CleaningServices,
  Wifi,
  Kitchen,
  MoreHoriz,
  TrendingUp,
  TrendingDown,
} from "@mui/icons-material";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { pgAPI } from "../../services/api";
import StatusChip from "../../components/common/StatusChip";
import { usePermissions } from "../../hooks/usePermissions";

const fm = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

const CAT = {
  electricity: {
    icon: <ElectricBolt sx={{ fontSize: 17 }} />,
    color: "#F59E0B",
    bg: "#FEF3C7",
  },
  water: {
    icon: <WaterDrop sx={{ fontSize: 17 }} />,
    color: "#3B82F6",
    bg: "#DBEAFE",
  },
  salaries: {
    icon: <PeopleAlt sx={{ fontSize: 17 }} />,
    color: "#8B5CF6",
    bg: "#EDE9FE",
  },
  repairs: {
    icon: <Build sx={{ fontSize: 17 }} />,
    color: "#EF4444",
    bg: "#FEE2E2",
  },
  cleaning: {
    icon: <CleaningServices sx={{ fontSize: 17 }} />,
    color: "#10B981",
    bg: "#D1FAE5",
  },
  internet: {
    icon: <Wifi sx={{ fontSize: 17 }} />,
    color: "#6366F1",
    bg: "#E0E7FF",
  },
  groceries: {
    icon: <Kitchen sx={{ fontSize: 17 }} />,
    color: "#F97316",
    bg: "#FFEDD5",
  },
  other: {
    icon: <MoreHoriz sx={{ fontSize: 17 }} />,
    color: "#6B7280",
    bg: "#F3F4F6",
  },
};
const CATS = Object.keys(CAT);
const STATUSES = ["paid", "pending", "processing"];
const EMPTY = {
  description: "",
  sub_description: "",
  category: "electricity",
  amount: "",
  expense_date: new Date().toISOString().split("T")[0],
  due_date: "",
  status: "paid",
  invoice_number: "",
  vendor: "",
};

export default function ExpensesPage() {
  const { pgId } = useParams();
  const api = pgAPI(pgId);
  const { can } = usePermissions();
  const canCreate = can("manage_expenses", "create");

  const [expenses, setExpenses] = useState([]);
  const [stats, setStats] = useState({});
  const [dist, setDist] = useState([]);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [catFilter, setCatFilter] = useState("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editExpense, setEditExpense] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getExpenses({
        page: page + 1,
        limit: 15,
        category: catFilter === "all" ? undefined : catFilter,
      });
      setExpenses(res.data.expenses || []);
      setTotal(res.data.total || 0);
      setStats(res.data.stats || {});
      setDist(res.data.distribution || []);
      setTrend(res.data.monthlyTrend || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [pgId, page, catFilter]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const openAdd = () => {
    setEditExpense(null);
    setForm(EMPTY);
    setErr("");
    setDialogOpen(true);
  };
  const openEdit = (exp) => {
    setEditExpense(exp);
    setForm({
      description: exp.description,
      sub_description: exp.sub_description || "",
      category: exp.category,
      amount: exp.amount,
      expense_date: exp.expense_date?.split("T")[0] || "",
      due_date: exp.due_date?.split("T")[0] || "",
      status: exp.status,
      invoice_number: exp.invoice_number || "",
      vendor: exp.vendor || "",
    });
    setErr("");
    setDialogOpen(true);
  };
  const handleClose = () => {
    if (saving) return;
    setDialogOpen(false);
  };
  const handleExited = () => {
    setForm(EMPTY);
    setErr("");
    setEditExpense(null);
  };

  const handleSubmit = async () => {
    setErr("");
    if (!form.description || !form.amount || !form.expense_date)
      return setErr("Description, amount and date required");
    setSaving(true);
    try {
      if (editExpense) await api.updateExpense(editExpense.id, form);
      else await api.createExpense(form);
      setDialogOpen(false);
      fetch();
    } catch (e) {
      setErr(e.response?.data?.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this expense?")) return;
    await api.deleteExpense(id);
    fetch();
  };

  const distTotal = dist.reduce((s, d) => s + parseFloat(d.total || 0), 0);

  // MoM change
  const mom =
    stats.total_this_month > 0 && stats.total_last_month > 0
      ? Math.round(
          ((stats.total_this_month - stats.total_last_month) /
            stats.total_last_month) *
            100,
        )
      : null;

  // Chart data: color current month differently
  const currentMonth = new Date().toLocaleString("en", { month: "short" });
  const trendChartData = trend.map((t) => ({
    month: t.month,
    total: parseFloat(t.total),
    isCurrent: t.month === currentMonth,
  }));

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Expenses
          </Typography>
          <Typography sx={{ color: "#6B7280", fontSize: "0.875rem" }}>
            Track and manage all property expenses.
          </Typography>
        </Box>
        {canCreate && (
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={openAdd}
            sx={{ px: 2.5 }}
          >
            Add Expense
          </Button>
        )}
      </Box>

      {/* Top row: stats + mini trend chart */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ p: 2.5 }}>
              <Typography
                sx={{
                  fontSize: "0.68rem",
                  color: "#6B7280",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  mb: 1,
                }}
              >
                This Month
              </Typography>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                <Typography sx={{ fontSize: "1.7rem", fontWeight: 800 }}>
                  {fm(stats.total_this_month)}
                </Typography>
                {mom !== null && (
                  <Chip
                    icon={
                      mom >= 0 ? (
                        <TrendingUp sx={{ fontSize: "12px !important" }} />
                      ) : (
                        <TrendingDown sx={{ fontSize: "12px !important" }} />
                      )
                    }
                    label={`${mom >= 0 ? "+" : ""}${mom}%`}
                    size="small"
                    sx={{
                      bgcolor: mom >= 0 ? "#FEE2E2" : "#D1FAE5",
                      color: mom >= 0 ? "#991B1B" : "#065F46",
                      fontWeight: 700,
                      fontSize: "0.68rem",
                    }}
                  />
                )}
              </Box>
              <Typography
                sx={{ fontSize: "0.72rem", color: "#9CA3AF", mt: 0.5 }}
              >
                vs {fm(stats.total_last_month)} last month
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: "#FFF7ED", border: "1px solid #FED7AA" }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography
                sx={{
                  fontSize: "0.68rem",
                  color: "#6B7280",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  mb: 1,
                }}
              >
                Upcoming Bills
              </Typography>
              <Typography sx={{ fontSize: "1.7rem", fontWeight: 800 }}>
                {fm(stats.upcoming_bills)}
              </Typography>
              <Typography
                sx={{
                  fontSize: "0.72rem",
                  color: "#D97706",
                  fontWeight: 600,
                  mt: 0.5,
                }}
              >
                Due in next 7 days
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 2 }}>
              <Typography sx={{ fontWeight: 700, fontSize: "0.85rem", mb: 1 }}>
                6-Month Trend
              </Typography>
              <ResponsiveContainer width="100%" height={80}>
                <BarChart data={trendChartData} barSize={20}>
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10, fill: "#9CA3AF" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    formatter={(v) => [fm(v), "Total"]}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #E5E7EB",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="total" radius={[3, 3, 0, 0]}>
                    {trendChartData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.isCurrent ? "#1B3A6B" : "#CBD5E0"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Table + Distribution */}
      <Grid container spacing={2.5}>
        <Grid item xs={12} lg={8}>
          <Card>
            <CardContent sx={{ p: 0 }}>
              <Box
                sx={{
                  px: 2.5,
                  py: 2,
                  display: "flex",
                  gap: 1.5,
                  flexWrap: "wrap",
                  alignItems: "center",
                  borderBottom: "1px solid #E5E7EB",
                }}
              >
                <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
                  Transactions
                </Typography>
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <Select
                    value={catFilter}
                    onChange={(e) => setCatFilter(e.target.value)}
                  >
                    <MenuItem value="all">All Categories</MenuItem>
                    {CATS.map((c) => (
                      <MenuItem key={c} value={c}>
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              {loading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <Box sx={{ overflowX: "auto" }}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        {[
                          "Description",
                          "Category",
                          "Date",
                          "Amount",
                          "Status",
                          "",
                        ].map((h) => (
                          <TableCell key={h}>{h}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {expenses.map((exp) => {
                        const c = CAT[exp.category] || CAT.other;
                        return (
                          <TableRow
                            key={exp.id}
                            hover
                            onClick={() => canCreate && openEdit(exp)}
                            sx={{ cursor: canCreate ? "pointer" : "default" }}
                          >
                            <TableCell>
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1.5,
                                }}
                              >
                                <Box
                                  sx={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 2,
                                    bgcolor: c.bg,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: c.color,
                                    flexShrink: 0,
                                  }}
                                >
                                  {c.icon}
                                </Box>
                                <Box>
                                  <Typography
                                    sx={{
                                      fontSize: "0.875rem",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {exp.description}
                                  </Typography>
                                  <Typography
                                    sx={{
                                      fontSize: "0.72rem",
                                      color: "#6B7280",
                                    }}
                                  >
                                    {exp.sub_description}
                                  </Typography>
                                </Box>
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={exp.category}
                                size="small"
                                sx={{
                                  bgcolor: c.bg,
                                  color: c.color,
                                  fontWeight: 700,
                                  fontSize: "0.68rem",
                                }}
                              />
                            </TableCell>
                            <TableCell>{fmtDate(exp.expense_date)}</TableCell>
                            <TableCell>
                              <Typography sx={{ fontWeight: 700 }}>
                                {fm(exp.amount)}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <StatusChip status={exp.status} />
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              {canCreate && (
                                <IconButton
                                  size="small"
                                  sx={{ color: "#DC2626" }}
                                  onClick={() => handleDelete(exp.id)}
                                >
                                  <Delete sx={{ fontSize: 15 }} />
                                </IconButton>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {expenses.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            sx={{
                              textAlign: "center",
                              py: 5,
                              color: "#9CA3AF",
                            }}
                          >
                            No expenses found
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
                  Showing {expenses.length} of {total}
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
        </Grid>

        {/* Distribution */}
        <Grid item xs={12} lg={4}>
          <Card>
            <CardContent sx={{ p: 2.5 }}>
              <Typography sx={{ fontWeight: 700, mb: 2 }}>
                This Month Distribution
              </Typography>
              {dist.length === 0 ? (
                <Typography sx={{ color: "#9CA3AF", fontSize: "0.82rem" }}>
                  No data this month
                </Typography>
              ) : (
                dist.map((d) => {
                  const c = CAT[d.category] || CAT.other;
                  const pct = distTotal > 0 ? (d.total / distTotal) * 100 : 0;
                  return (
                    <Box key={d.category} sx={{ mb: 1.5 }}>
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          mb: 0.4,
                        }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.8,
                          }}
                        >
                          <Box sx={{ color: c.color, display: "flex" }}>
                            {c.icon}
                          </Box>
                          <Typography
                            sx={{
                              fontSize: "0.82rem",
                              fontWeight: 600,
                              textTransform: "capitalize",
                            }}
                          >
                            {d.category}
                          </Typography>
                        </Box>
                        <Typography
                          sx={{
                            fontSize: "0.82rem",
                            fontWeight: 700,
                            color: "#1B3A6B",
                          }}
                        >
                          {fm(d.total)}
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        sx={{
                          height: 6,
                          borderRadius: 3,
                          bgcolor: "#E5E7EB",
                          "& .MuiLinearProgress-bar": { bgcolor: c.color },
                        }}
                      />
                    </Box>
                  );
                })
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ADD/EDIT DIALOG */}
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
          }}
        >
          <Typography sx={{ fontWeight: 700 }}>
            {editExpense ? "Edit Expense" : "Add Expense"}
          </Typography>
          <IconButton onClick={handleClose} size="small" disabled={saving}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {err && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {err}
            </Alert>
          )}
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description *"
                size="small"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Sub-description / Invoice"
                size="small"
                value={form.sub_description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sub_description: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Category *</InputLabel>
                <Select
                  value={form.category}
                  label="Category *"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value }))
                  }
                >
                  {CATS.map((c) => (
                    <MenuItem key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select
                  value={form.status}
                  label="Status"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value }))
                  }
                >
                  {STATUSES.map((s) => (
                    <MenuItem key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Amount (₹) *"
                size="small"
                type="number"
                value={form.amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Expense Date *"
                size="small"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={form.expense_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, expense_date: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Due Date"
                size="small"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={form.due_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, due_date: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Invoice Number"
                size="small"
                value={form.invoice_number}
                onChange={(e) =>
                  setForm((f) => ({ ...f, invoice_number: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Vendor"
                size="small"
                value={form.vendor}
                onChange={(e) =>
                  setForm((f) => ({ ...f, vendor: e.target.value }))
                }
              />
            </Grid>
          </Grid>
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
            ) : editExpense ? (
              "Save Changes"
            ) : (
              "Add Expense"
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
