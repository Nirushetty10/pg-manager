import { useState, useEffect, useCallback } from "react";
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
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Alert,
  CircularProgress,
  Divider,
  Chip,
} from "@mui/material";
import {
  Search,
  Add,
  Close,
  MoreVert,
  QrCode,
  Email as EmailIcon,
} from "@mui/icons-material";
import { pgAPI } from "../../services/api";
import StatusChip from "../../components/common/StatusChip";
import { PageHeader } from "../../components/common";

const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "-";
const EMPTY = {
  name: "",
  phone: "",
  email: "",
  permanent_address: "",
  id_type: "Aadhar",
  id_proof: "",
  room_id: "",
  bed_id: "",
  joining_date: "",
  monthly_rent: "",
  deposit: "",
  rent_due_day: 1,
  notes: "",
};
const ASSIGN_EMPTY = {
  room_id: "",
  bed_id: "",
  joining_date: "",
  monthly_rent: "",
  deposit: "",
  rent_due_day: 1,
};

export default function TenantsPage() {
  const { pgId } = useParams();
  const api = pgAPI(pgId);
  const [tenants, setTenants] = useState([]);
  const [stats, setStats] = useState({});
  const [rooms, setRooms] = useState([]);
  const [availBeds, setAvailBeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  // Dialogs
  const [addOpen, setAddOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [vacateOpen, setVacateOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [assignForm, setAssignForm] = useState(ASSIGN_EMPTY);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getTenants({
        status: tab === "all" ? undefined : tab,
        search,
        page: page + 1,
        limit: 15,
      });
      setTenants(res.data.tenants);
      setTotal(res.data.total);
      setStats(res.data.stats || {});
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [pgId, tab, search, page]);

  useEffect(() => {
    debugger;
    fetch();
  }, [fetch]);
  useEffect(() => {
    debugger;
    api
      .getRooms()
      .then((r) => {
        debugger;
        setRooms(r.data.rooms || []);
      })
      .catch(() => {});
  }, [pgId]);

  const handleRoomSelect = (roomId, setF) => {
    const room = rooms.find((r) => r.id === roomId);
    setAvailBeds(room?.beds?.filter((b) => b.status === "available") || []);
    setF((f) => ({
      ...f,
      room_id: roomId,
      bed_id: "",
      monthly_rent: room?.monthly_rent || f.monthly_rent,
    }));
  };

  // ADD TENANT
  const handleAdd = async () => {
    setErr("");
    if (!form.name || !form.phone) return setErr("Name and phone are required");
    setSaving(true);
    debugger;
    try {
      await api.createTenant(form);
      setAddOpen(false);
      fetch();
    } catch (e) {
      setErr(e.response?.data?.message || "Failed to add tenant");
    } finally {
      setSaving(false);
    }
  };

  // ASSIGN ROOM
  const handleAssign = async () => {
    setErr("");
    if (
      !assignForm.room_id ||
      !assignForm.joining_date ||
      !assignForm.monthly_rent
    )
      return setErr("Room, joining date and rent are required");
    setSaving(true);
    try {
      await api.assignRoom(selectedTenant.id, assignForm);
      setAssignOpen(false);
      fetch();
    } catch (e) {
      setErr(e.response?.data?.message || "Failed to assign room");
    } finally {
      setSaving(false);
    }
  };

  // VACATE
  const handleVacate = async () => {
    setSaving(true);
    try {
      await api.markVacated(selectedTenant.id, {
        vacated_date: new Date().toISOString().split("T")[0],
      });
      setVacateOpen(false);
      fetch();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const openAssign = (t) => {
    setSelectedTenant(t);
    setAssignForm({ ...ASSIGN_EMPTY, monthly_rent: t.monthly_rent || "" });
    setErr("");
    setAssignOpen(true);
  };
  const openVacate = (t) => {
    setSelectedTenant(t);
    setVacateOpen(true);
  };

  const statCards = [
    { label: "Total Tenants", value: stats.total || 0, color: "#1B3A6B" },
    { label: "Active", value: stats.active || 0, color: "#059669" },
    {
      label: "Pending Assignment",
      value: stats.pending || 0,
      color: "#D97706",
    },
    {
      label: "New This Month",
      value: stats.new_this_month || 0,
      color: "#7C3AED",
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Tenants"
        subtitle="Manage residents, track payments, and room allocations."
        actionLabel="Add Tenant"
        onAction={() => {
          setForm(EMPTY);
          setErr("");
          setAvailBeds([]);
          setAddOpen(true);
        }}
      />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {statCards.map((s) => (
          <Grid item xs={6} md={3} key={s.label}>
            <Card>
              <CardContent sx={{ p: 2 }}>
                <Typography
                  sx={{
                    fontSize: "0.7rem",
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
                    fontSize: "1.8rem",
                    fontWeight: 800,
                    color: s.color,
                    my: 0.3,
                  }}
                >
                  {s.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card>
        <CardContent sx={{ p: 0 }}>
          <Box
            sx={{
              px: 2.5,
              py: 2,
              display: "flex",
              gap: 2,
              alignItems: "center",
              flexWrap: "wrap",
              borderBottom: "1px solid #E5E7EB",
            }}
          >
            <TextField
              size="small"
              placeholder="Search by name or phone..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              sx={{ flex: 1, minWidth: 200 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search sx={{ fontSize: 17, color: "#9CA3AF" }} />
                  </InputAdornment>
                ),
              }}
            />
            <Tabs
              value={tab}
              onChange={(_, v) => {
                setTab(v);
                setPage(0);
              }}
              sx={{
                "& .MuiTab-root": {
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  minHeight: 40,
                  py: 0,
                  px: 2,
                },
              }}
            >
              {["all", "active", "pending", "vacated"].map((t) => (
                <Tab
                  key={t}
                  label={t.charAt(0).toUpperCase() + t.slice(1)}
                  value={t}
                />
              ))}
            </Tabs>
            <Box sx={{ ml: "auto", display: "flex", gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<EmailIcon sx={{ fontSize: 15 }} />}
                sx={{ fontSize: "0.78rem", borderRadius: 2 }}
              >
                Invite
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<QrCode sx={{ fontSize: 15 }} />}
                sx={{ fontSize: "0.78rem", borderRadius: 2 }}
              >
                QR Code
              </Button>
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
                  <TableRow>
                    {[
                      "Name",
                      "Phone",
                      "Room/Bed",
                      "Joined",
                      "Monthly Rent",
                      "Status",
                      "Actions",
                    ].map((h) => (
                      <TableCell key={h}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tenants.map((t) => (
                    <TableRow key={t.id} hover>
                      <TableCell>
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1.5,
                          }}
                        >
                          <Avatar
                            sx={{
                              width: 34,
                              height: 34,
                              bgcolor: "#1B3A6B",
                              fontSize: "0.8rem",
                            }}
                          >
                            {t.name?.charAt(0)}
                          </Avatar>
                          <Box>
                            <Typography
                              sx={{ fontWeight: 600, fontSize: "0.875rem" }}
                            >
                              {t.name}
                            </Typography>
                            <Typography
                              sx={{ fontSize: "0.72rem", color: "#6B7280" }}
                            >
                              {t.email || ""}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>{t.phone}</TableCell>
                      <TableCell>
                        {t.room_number ? (
                          <Box>
                            <Typography
                              sx={{ fontWeight: 700, fontSize: "0.875rem" }}
                            >
                              {t.room_number}
                              {t.bed_label ? `-${t.bed_label}` : ""}
                            </Typography>
                            <Typography
                              sx={{
                                fontSize: "0.7rem",
                                color: "#6B7280",
                                textTransform: "uppercase",
                              }}
                            >
                              {t.room_type}
                            </Typography>
                          </Box>
                        ) : (
                          <Typography
                            sx={{ fontSize: "0.82rem", color: "#9CA3AF" }}
                          >
                            Not Assigned
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{fmtDate(t.joining_date)}</TableCell>
                      <TableCell>
                        <Typography sx={{ fontWeight: 600 }}>
                          ₹{Number(t.monthly_rent || 0).toLocaleString("en-IN")}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <StatusChip status={t.status} />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: "flex", gap: 0.5 }}>
                          {t.status === "pending" && (
                            <Button
                              size="small"
                              variant="contained"
                              sx={{
                                fontSize: "0.72rem",
                                py: 0.4,
                                px: 1,
                                borderRadius: 1.5,
                              }}
                              onClick={() => openAssign(t)}
                            >
                              Assign Room
                            </Button>
                          )}
                          {t.status === "active" && (
                            <Button
                              size="small"
                              variant="outlined"
                              sx={{
                                fontSize: "0.72rem",
                                py: 0.4,
                                px: 1,
                                borderRadius: 1.5,
                                color: "#D97706",
                                borderColor: "#FCD34D",
                              }}
                              onClick={() => openVacate(t)}
                            >
                              Vacate
                            </Button>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                  {tenants.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        sx={{ textAlign: "center", py: 5, color: "#9CA3AF" }}
                      >
                        No tenants found
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
              Showing {tenants.length} of {total}
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

      {/* ADD TENANT DIALOG */}
      <Dialog
        open={addOpen}
        onClose={() => {
          if (!saving) setAddOpen(false);
        }}
        maxWidth="sm"
        fullWidth
        keepMounted={false}
        TransitionProps={{
          onExited: () => {
            setForm(EMPTY);
            setErr("");
            setAvailBeds([]);
          },
        }}
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            pb: 0,
          }}
        >
          <Typography sx={{ fontWeight: 700 }}>Add New Tenant</Typography>
          <IconButton
            onClick={() => setAddOpen(false)}
            size="small"
            disabled={saving}
          >
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {err && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {err}
            </Alert>
          )}
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Divider>
                <Typography
                  sx={{
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: "#6B7280",
                  }}
                >
                  Personal Info
                </Typography>
              </Divider>
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Full Name *"
                size="small"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Phone *"
                size="small"
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Email"
                size="small"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth size="small">
                <InputLabel>ID Type</InputLabel>
                <Select
                  value={form.id_type}
                  label="ID Type"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, id_type: e.target.value }))
                  }
                >
                  {[
                    "Aadhar",
                    "PAN",
                    "Passport",
                    "Driving License",
                    "Voter ID",
                  ].map((t) => (
                    <MenuItem key={t} value={t}>
                      {t}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Permanent Address"
                size="small"
                multiline
                rows={2}
                value={form.permanent_address}
                onChange={(e) =>
                  setForm((f) => ({ ...f, permanent_address: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={12}>
              <Divider>
                <Typography
                  sx={{
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: "#6B7280",
                  }}
                >
                  Room Assignment (Optional)
                </Typography>
              </Divider>
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Select Room</InputLabel>
                <Select
                  value={form.room_id}
                  label="Select Room"
                  onChange={(e) => handleRoomSelect(e.target.value, setForm)}
                >
                  {rooms
                    .filter((r) => r.available_beds > 0)
                    .map((r) => (
                      <MenuItem key={r.id} value={r.id}>
                        {r.room_number} ({r.room_type}) — {r.available_beds}{" "}
                        free
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth size="small" disabled={!form.room_id}>
                <InputLabel>Select Bed</InputLabel>
                <Select
                  value={form.bed_id}
                  label="Select Bed"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, bed_id: e.target.value }))
                  }
                >
                  {availBeds.map((b) => (
                    <MenuItem key={b.id} value={b.id}>
                      Bed {b.bed_label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Joining Date"
                size="small"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={form.joining_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, joining_date: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Monthly Rent (₹)"
                size="small"
                type="number"
                value={form.monthly_rent}
                onChange={(e) =>
                  setForm((f) => ({ ...f, monthly_rent: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Deposit (₹)"
                size="small"
                type="number"
                value={form.deposit}
                onChange={(e) =>
                  setForm((f) => ({ ...f, deposit: e.target.value }))
                }
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button
            onClick={() => setAddOpen(false)}
            variant="outlined"
            disabled={saving}
            sx={{ borderRadius: 2, flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            variant="contained"
            disabled={saving}
            sx={{ borderRadius: 2, flex: 2 }}
          >
            {saving ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              "Add Tenant"
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ASSIGN ROOM DIALOG */}
      <Dialog
        open={assignOpen}
        onClose={() => {
          if (!saving) setAssignOpen(false);
        }}
        maxWidth="xs"
        fullWidth
        keepMounted={false}
        TransitionProps={{
          onExited: () => {
            setAssignForm(ASSIGN_EMPTY);
            setErr("");
            setAvailBeds([]);
          },
        }}
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Box>
            <Typography sx={{ fontWeight: 700 }}>Assign Room</Typography>
            <Typography sx={{ fontSize: "0.78rem", color: "#6B7280" }}>
              {selectedTenant?.name}
            </Typography>
          </Box>
          <IconButton
            onClick={() => setAssignOpen(false)}
            size="small"
            disabled={saving}
          >
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
              <FormControl fullWidth size="small">
                <InputLabel>Select Room *</InputLabel>
                <Select
                  value={assignForm.room_id}
                  label="Select Room *"
                  onChange={(e) =>
                    handleRoomSelect(e.target.value, setAssignForm)
                  }
                >
                  {rooms
                    .filter((r) => r.available_beds > 0)
                    .map((r) => (
                      <MenuItem key={r.id} value={r.id}>
                        {r.room_number} ({r.room_type}) — {r.available_beds}{" "}
                        free
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControl
                fullWidth
                size="small"
                disabled={!assignForm.room_id}
              >
                <InputLabel>Select Bed</InputLabel>
                <Select
                  value={assignForm.bed_id || ""}
                  label="Select Bed"
                  onChange={(e) =>
                    setAssignForm((f) => ({ ...f, bed_id: e.target.value }))
                  }
                >
                  {availBeds.map((b) => (
                    <MenuItem key={b.id} value={b.id}>
                      Bed {b.bed_label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Joining Date *"
                size="small"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={assignForm.joining_date}
                onChange={(e) =>
                  setAssignForm((f) => ({ ...f, joining_date: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Monthly Rent (₹) *"
                size="small"
                type="number"
                value={assignForm.monthly_rent}
                onChange={(e) =>
                  setAssignForm((f) => ({ ...f, monthly_rent: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Deposit (₹)"
                size="small"
                type="number"
                value={assignForm.deposit}
                onChange={(e) =>
                  setAssignForm((f) => ({ ...f, deposit: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Rent Due Day"
                size="small"
                type="number"
                value={assignForm.rent_due_day}
                onChange={(e) =>
                  setAssignForm((f) => ({ ...f, rent_due_day: e.target.value }))
                }
                InputProps={{ inputProps: { min: 1, max: 28 } }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button
            onClick={() => setAssignOpen(false)}
            variant="outlined"
            disabled={saving}
            sx={{ borderRadius: 2, flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            variant="contained"
            disabled={saving}
            sx={{ borderRadius: 2, flex: 2 }}
          >
            {saving ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              "Assign Room"
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* VACATE DIALOG */}
      <Dialog
        open={vacateOpen}
        onClose={() => {
          if (!saving) setVacateOpen(false);
        }}
        maxWidth="xs"
        fullWidth
        keepMounted={false}
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle>
          <Typography sx={{ fontWeight: 700 }}>Mark as Vacated</Typography>
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ borderRadius: 2 }}>
            This will mark <strong>{selectedTenant?.name}</strong> as vacated
            and free their room/bed. This action cannot be undone easily.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button
            onClick={() => setVacateOpen(false)}
            variant="outlined"
            disabled={saving}
            sx={{ borderRadius: 2, flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleVacate}
            variant="contained"
            color="warning"
            disabled={saving}
            sx={{ borderRadius: 2, flex: 2 }}
          >
            {saving ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              "Confirm Vacate"
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
