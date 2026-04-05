import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Avatar,
  IconButton,
  CircularProgress,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
} from "@mui/material";
import { Add, Close, Edit, Delete } from "@mui/icons-material";
import { pgAPI } from "../../services/api";
import { PageHeader } from "../../components/common";
import StatusChip from "../../components/common/StatusChip";
import { usePermissions } from "../../hooks/usePermissions";

const TYPES = ["single", "double", "triple", "deluxe"];
const AMENITIES = ["AC", "WIFI", "ATTACHED_BATH", "TV", "FRIDGE", "GEYSER"];
const EMPTY = {
  room_number: "",
  floor: 1,
  room_type: "single",
  amenities: [],
  monthly_rent: "",
  total_beds: 1,
  notes: "",
};
const typeColor = (t) =>
  ({
    single: "#1B3A6B",
    double: "#059669",
    triple: "#D97706",
    deluxe: "#7C3AED",
  })[t] || "#6B7280";

export default function RoomsPage() {
  const { pgId } = useParams();
  const api = pgAPI(pgId);
  const { can } = usePermissions();
  const canCreate = can("manage_rooms", "create");

  const [rooms, setRooms] = useState([]);
  const [stats, setStats] = useState({});
  const [tenants, setTenants] = useState([]); // pending tenants for assign
  const [loading, setLoading] = useState(true);
  const [floor, setFloor] = useState("all");

  const [roomDialog, setRoomDialog] = useState(false);
  const [editRoom, setEditRoom] = useState(null);
  const [assignDialog, setAssignDialog] = useState(false);
  const [selectedBed, setSelectedBed] = useState(null);
  const [unassignDialog, setUnassignDialog] = useState(false);
  const [unassignTarget, setUnassignTarget] = useState(null); // {tenantId, tenantName, bedLabel}

  const [form, setForm] = useState(EMPTY);
  const [assignTenantId, setAssignTenantId] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const p = floor !== "all" ? { floor } : {};
      const r = await api.getRooms(p);
      setRooms(r.data.rooms || []);
      setStats(r.data.stats || {});
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [pgId, floor]);

  useEffect(() => {
    fetch();
  }, [fetch]);
  useEffect(() => {
    api
      .getTenants({ status: "pending", limit: 100 })
      .then((r) => setTenants(r.data.tenants || []))
      .catch(() => {});
  }, [pgId]);

  const floors = [...new Set(rooms.map((r) => r.floor))].sort();

  const openAdd = () => {
    setEditRoom(null);
    setForm(EMPTY);
    setErr("");
    setRoomDialog(true);
  };
  const openEdit = (room) => {
    setEditRoom(room);
    setForm({
      room_number: room.room_number,
      floor: room.floor,
      room_type: room.room_type,
      amenities: room.amenities || [],
      monthly_rent: room.monthly_rent,
      total_beds: room.total_beds,
      notes: room.notes || "",
    });
    setErr("");
    setRoomDialog(true);
  };

  const handleSaveRoom = async () => {
    setErr("");
    if (!form.room_number || !form.monthly_rent)
      return setErr("Room number and rent required");
    setSaving(true);
    try {
      if (editRoom) await api.updateRoom(editRoom.id, form);
      else await api.createRoom(form);
      setRoomDialog(false);
      fetch();
    } catch (e) {
      setErr(e.response?.data?.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this room?")) return;
    try {
      await api.deleteRoom(id);
      fetch();
    } catch (e) {
      alert(e.response?.data?.message || "Failed");
    }
  };

  const openAssign = (bed) => {
    setSelectedBed(bed);
    setAssignTenantId("");
    setErr("");
    setAssignDialog(true);
  };
  const handleAssign = async () => {
    setErr("");
    if (!assignTenantId) return setErr("Select a tenant");
    setSaving(true);
    try {
      await api.assignBed({
        bed_id: selectedBed.id,
        tenant_id: assignTenantId,
      });
      setAssignDialog(false);
      fetch();
      api
        .getTenants({ status: "pending", limit: 100 })
        .then((r) => setTenants(r.data.tenants || []));
    } catch (e) {
      setErr(e.response?.data?.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const openUnassign = (bed) => {
    setUnassignTarget({
      tenantId: bed.tenant_id,
      tenantName: bed.tenant_name,
      bedLabel: bed.bed_label,
    });
    setUnassignDialog(true);
  };
  const handleUnassign = async () => {
    setSaving(true);
    try {
      await api.unassignBed({ tenant_id: unassignTarget.tenantId });
      setUnassignDialog(false);
      fetch();
      api
        .getTenants({ status: "pending", limit: 100 })
        .then((r) => setTenants(r.data.tenants || []));
    } catch (e) {
      alert(e.response?.data?.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <PageHeader
        title="Rooms & Beds"
        subtitle="Manage room occupancy and bed assignments."
        actionLabel={canCreate ? "Add Room" : null}
        onAction={openAdd}
      />

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          {
            label: "Beds Occupied",
            value: `${stats.occupied_beds || 0}/${stats.total_beds || 0}`,
            prog:
              stats.total_beds > 0
                ? (stats.occupied_beds / stats.total_beds) * 100
                : 0,
            color: "#1B3A6B",
          },
          {
            label: "Vacant Beds",
            value: stats.available_beds || 0,
            color: "#059669",
          },
          {
            label: "Total Rooms",
            value: stats.total_rooms || 0,
            color: "#D97706",
          },
          {
            label: "Occupied Rooms",
            value: stats.occupied_rooms || 0,
            color: "#7C3AED",
          },
        ].map((s) => (
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
                {s.prog !== undefined && (
                  <LinearProgress
                    variant="determinate"
                    value={s.prog}
                    sx={{
                      height: 4,
                      borderRadius: 2,
                      bgcolor: "#E5E7EB",
                      "& .MuiLinearProgress-bar": { bgcolor: s.color },
                    }}
                  />
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Floor filter */}
      <Box sx={{ display: "flex", gap: 1, mb: 2.5, flexWrap: "wrap" }}>
        {["all", ...floors].map((f) => (
          <Chip
            key={f}
            label={f === "all" ? "All Floors" : `Floor ${f}`}
            clickable
            onClick={() => setFloor(f === "all" ? "all" : f)}
            sx={{
              fontWeight: 600,
              bgcolor: floor === f ? "#1B3A6B" : "#F3F4F6",
              color: floor === f ? "#fff" : "#374151",
              cursor: "pointer",
            }}
          />
        ))}
        <Box sx={{ ml: "auto", display: "flex", gap: 1 }}>
          <Chip
            icon={
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  bgcolor: "#1B3A6B",
                  mr: "-4px",
                }}
              />
            }
            label="OCCUPIED"
            size="small"
            sx={{ fontWeight: 700, fontSize: "0.72rem" }}
          />
          <Chip
            icon={
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  bgcolor: "#9CA3AF",
                  mr: "-4px",
                }}
              />
            }
            label="AVAILABLE"
            size="small"
            sx={{ fontWeight: 700, fontSize: "0.72rem" }}
          />
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={2} alignItems="stretch">
          {rooms.map((room) => (
            <Grid
              item
              xs={12}
              sm={6}
              md={4}
              lg={3}
              key={room.id}
              sx={{ display: "flex" }}
            >
              <Card
                sx={{
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  transition: "all 0.18s",
                  "&:hover": {
                    transform: "translateY(-2px)",
                    boxShadow: "0 6px 20px rgba(0,0,0,0.1)",
                  },
                }}
              >
                <CardContent
                  sx={{
                    p: 2,
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {/* Header */}
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      mb: 1,
                    }}
                  >
                    <Box>
                      <Typography
                        sx={{
                          fontSize: "0.68rem",
                          color: "#9CA3AF",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        ROOM
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: "1.5rem",
                          fontWeight: 800,
                          lineHeight: 1.1,
                        }}
                      >
                        {room.room_number}
                      </Typography>
                    </Box>
                    {canCreate && (
                      <Box sx={{ display: "flex", gap: 0.2 }}>
                        <IconButton
                          size="small"
                          sx={{ color: "#6B7280" }}
                          onClick={() => openEdit(room)}
                        >
                          <Edit sx={{ fontSize: 14 }} />
                        </IconButton>
                        <IconButton
                          size="small"
                          sx={{ color: "#DC2626" }}
                          onClick={() => handleDelete(room.id)}
                        >
                          <Delete sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Box>
                    )}
                  </Box>

                  {/* Type + amenities */}
                  <Box
                    sx={{
                      display: "flex",
                      gap: 0.5,
                      mb: 1.5,
                      flexWrap: "wrap",
                    }}
                  >
                    <Chip
                      label={room.room_type?.toUpperCase()}
                      size="small"
                      sx={{
                        fontSize: "0.62rem",
                        fontWeight: 700,
                        bgcolor: `${typeColor(room.room_type)}18`,
                        color: typeColor(room.room_type),
                      }}
                    />
                    <Chip
                      label={`F${room.floor}`}
                      size="small"
                      sx={{
                        fontSize: "0.62rem",
                        bgcolor: "#F3F4F6",
                        color: "#374151",
                      }}
                    />
                    {(room.amenities || []).slice(0, 2).map((a) => (
                      <Chip
                        key={a}
                        label={a}
                        size="small"
                        sx={{
                          fontSize: "0.6rem",
                          bgcolor: "#F3F4F6",
                          color: "#374151",
                        }}
                      />
                    ))}
                  </Box>

                  <Typography
                    sx={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "#059669",
                      mb: 1,
                    }}
                  >
                    ₹{Number(room.monthly_rent).toLocaleString("en-IN")}/mo
                  </Typography>

                  {/* Beds — flex:1 so all cards stretch equally */}
                  <Box sx={{ flex: 1 }}>
                    {(room.beds || []).map((bed) => (
                      <Box
                        key={bed.id}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          mb: 0.7,
                          p: 0.8,
                          borderRadius: 1.5,
                          bgcolor:
                            bed.status === "occupied" ? "#F0F4FF" : "#F9FAFB",
                          minHeight: 42,
                        }}
                      >
                        {bed.status === "occupied" ? (
                          <Avatar
                            sx={{
                              width: 24,
                              height: 24,
                              fontSize: "0.65rem",
                              bgcolor: "#1B3A6B",
                              flexShrink: 0,
                            }}
                          >
                            {bed.tenant_name?.charAt(0)}
                          </Avatar>
                        ) : (
                          <Box
                            sx={{
                              width: 24,
                              height: 24,
                              borderRadius: "50%",
                              border: "1.5px dashed #D1D5DB",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <Add sx={{ fontSize: 12, color: "#9CA3AF" }} />
                          </Box>
                        )}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          {bed.status === "occupied" ? (
                            <>
                              <Typography
                                sx={{ fontSize: "0.72rem", fontWeight: 600 }}
                                noWrap
                              >
                                {bed.tenant_name}
                              </Typography>
                              <Typography
                                sx={{ fontSize: "0.65rem", color: "#6B7280" }}
                              >
                                Bed {bed.bed_label}
                              </Typography>
                            </>
                          ) : (
                            <Typography
                              sx={{ fontSize: "0.72rem", color: "#9CA3AF" }}
                            >
                              Bed {bed.bed_label} — Vacant
                            </Typography>
                          )}
                        </Box>
                        {bed.status === "available" && canCreate && (
                          <Button
                            size="small"
                            variant="contained"
                            sx={{
                              py: 0.1,
                              px: 0.8,
                              fontSize: "0.62rem",
                              borderRadius: 1.2,
                              minWidth: "auto",
                              flexShrink: 0,
                            }}
                            onClick={() => openAssign(bed)}
                          >
                            Assign
                          </Button>
                        )}
                        {bed.status === "occupied" &&
                          canCreate &&
                          bed.tenant_id && (
                            <Button
                              size="small"
                              variant="outlined"
                              color="warning"
                              sx={{
                                py: 0.1,
                                px: 0.8,
                                fontSize: "0.62rem",
                                borderRadius: 1.2,
                                minWidth: "auto",
                                flexShrink: 0,
                              }}
                              onClick={() => openUnassign(bed)}
                            >
                              Remove
                            </Button>
                          )}
                      </Box>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}

          {/* Add room card */}
          {canCreate && (
            <Grid item xs={12} sm={6} md={4} lg={3} sx={{ display: "flex" }}>
              <Card
                onClick={openAdd}
                sx={{
                  width: "100%",
                  minHeight: 180,
                  cursor: "pointer",
                  border: "2px dashed #D1D5DB",
                  boxShadow: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  "&:hover": { borderColor: "#1B3A6B", bgcolor: "#F9FAFB" },
                  transition: "all 0.18s",
                }}
              >
                <Box sx={{ textAlign: "center" }}>
                  <Add sx={{ color: "#9CA3AF", fontSize: 32, mb: 1 }} />
                  <Typography
                    sx={{
                      fontWeight: 600,
                      color: "#6B7280",
                      fontSize: "0.875rem",
                    }}
                  >
                    Add New Room
                  </Typography>
                </Box>
              </Card>
            </Grid>
          )}
        </Grid>
      )}

      {/* ADD/EDIT ROOM DIALOG */}
      <Dialog
        open={roomDialog}
        onClose={() => {
          if (!saving) setRoomDialog(false);
        }}
        maxWidth="sm"
        fullWidth
        keepMounted={false}
        TransitionProps={{
          onExited: () => {
            setForm(EMPTY);
            setErr("");
            setEditRoom(null);
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
          <Typography sx={{ fontWeight: 700 }}>
            {editRoom ? "Edit Room" : "Add New Room"}
          </Typography>
          <IconButton
            onClick={() => setRoomDialog(false)}
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
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Room Number *"
                size="small"
                value={form.room_number}
                onChange={(e) =>
                  setForm((f) => ({ ...f, room_number: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Floor"
                size="small"
                type="number"
                value={form.floor}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    floor: parseInt(e.target.value) || 1,
                  }))
                }
                InputProps={{ inputProps: { min: 1, max: 20 } }}
              />
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Room Type</InputLabel>
                <Select
                  value={form.room_type}
                  label="Room Type"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, room_type: e.target.value }))
                  }
                >
                  {TYPES.map((t) => (
                    <MenuItem key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Total Beds"
                size="small"
                type="number"
                value={form.total_beds}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    total_beds: parseInt(e.target.value) || 1,
                  }))
                }
                InputProps={{ inputProps: { min: 1, max: 4 } }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Monthly Rent (₹) *"
                size="small"
                type="number"
                value={form.monthly_rent}
                onChange={(e) =>
                  setForm((f) => ({ ...f, monthly_rent: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={12}>
              <Typography sx={{ fontSize: "0.82rem", fontWeight: 600, mb: 1 }}>
                Amenities
              </Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {AMENITIES.map((a) => (
                  <Chip
                    key={a}
                    label={a}
                    size="small"
                    clickable
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        amenities: f.amenities.includes(a)
                          ? f.amenities.filter((x) => x !== a)
                          : [...f.amenities, a],
                      }))
                    }
                    sx={{
                      fontWeight: 600,
                      fontSize: "0.75rem",
                      bgcolor: form.amenities.includes(a)
                        ? "#1B3A6B"
                        : "#F3F4F6",
                      color: form.amenities.includes(a) ? "#fff" : "#374151",
                    }}
                  />
                ))}
              </Box>
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
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button
            onClick={() => setRoomDialog(false)}
            variant="outlined"
            disabled={saving}
            sx={{ borderRadius: 2, flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveRoom}
            variant="contained"
            disabled={saving}
            sx={{ borderRadius: 2, flex: 2 }}
          >
            {saving ? (
              <CircularProgress size={20} color="inherit" />
            ) : editRoom ? (
              "Save Changes"
            ) : (
              "Create Room"
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ASSIGN BED */}
      <Dialog
        open={assignDialog}
        onClose={() => {
          if (!saving) setAssignDialog(false);
        }}
        maxWidth="xs"
        fullWidth
        keepMounted={false}
        TransitionProps={{
          onExited: () => {
            setAssignTenantId("");
            setErr("");
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
          <Typography sx={{ fontWeight: 700 }}>
            Assign Bed {selectedBed?.bed_label}
          </Typography>
          <IconButton onClick={() => setAssignDialog(false)} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {err && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {err}
            </Alert>
          )}
          <FormControl fullWidth size="small" sx={{ mt: 1 }}>
            <InputLabel>Select Pending Tenant</InputLabel>
            <Select
              value={assignTenantId}
              label="Select Pending Tenant"
              onChange={(e) => setAssignTenantId(e.target.value)}
            >
              {tenants.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name} — {t.phone}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {tenants.length === 0 && (
            <Typography sx={{ fontSize: "0.78rem", color: "#9CA3AF", mt: 1 }}>
              No pending tenants. Add a tenant first.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button
            onClick={() => setAssignDialog(false)}
            variant="outlined"
            disabled={saving}
            sx={{ borderRadius: 2, flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            variant="contained"
            disabled={saving || !assignTenantId}
            sx={{ borderRadius: 2, flex: 2 }}
          >
            {saving ? <CircularProgress size={20} color="inherit" /> : "Assign"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* UNASSIGN BED */}
      <Dialog
        open={unassignDialog}
        onClose={() => {
          if (!saving) setUnassignDialog(false);
        }}
        maxWidth="xs"
        fullWidth
        keepMounted={false}
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle>
          <Typography sx={{ fontWeight: 700 }}>Remove from Bed</Typography>
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ borderRadius: 2 }}>
            Remove <strong>{unassignTarget?.tenantName}</strong> from Bed{" "}
            {unassignTarget?.bedLabel}? They will become{" "}
            <strong>Pending</strong> and need to be re-assigned later.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button
            onClick={() => setUnassignDialog(false)}
            variant="outlined"
            disabled={saving}
            sx={{ borderRadius: 2, flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleUnassign}
            variant="contained"
            color="warning"
            disabled={saving}
            sx={{ borderRadius: 2, flex: 2 }}
          >
            {saving ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              "Remove from Bed"
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
