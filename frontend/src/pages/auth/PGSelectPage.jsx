import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Chip,
  CircularProgress,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";
import { Business, Add, KingBed, People, Close } from "@mui/icons-material";
import { ownerAPI } from "../../services/api";
import { useAuth } from "../../context/AuthContext";

const EMPTY = {
  name: "",
  city: "",
  address: "",
  phone: "",
  email: "",
  pg_type: "mixed",
};
const PG_TYPES = ["male", "female", "mixed", "co-living"];
const ERRORS = { name: "", city: "", phone: "" };

export default function PGSelectPage() {
  const { user, selectPG, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [pgs, setPgs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const createOpen = searchParams.get("create") === "1";
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState(ERRORS);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    ownerAPI
      .getPGs()
      .then((r) => setPgs(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = (pgId) => {
    selectPG(pgId);
    navigate(`/pg/${pgId}`);
  };

  const openCreate = () => {
    setForm(EMPTY);
    setErrors(ERRORS);
    setErr("");
    setSearchParams({ create: "1" });
  };
  const closeCreate = () => {
    setSearchParams({});
  };

  const validate = () => {
    const e = { name: "", city: "", phone: "" };
    let ok = true;
    if (!form.name.trim()) {
      e.name = "PG name is required";
      ok = false;
    }
    if (!form.city.trim()) {
      e.city = "City is required";
      ok = false;
    }
    if (!form.phone.trim()) {
      e.phone = "Contact phone is required";
      ok = false;
    } else if (!/^[6-9]\d{9}$/.test(form.phone.replace(/\s/g, ""))) {
      e.phone = "Enter a valid 10-digit mobile number";
      ok = false;
    }
    setErrors(e);
    return ok;
  };

  const handleCreate = async () => {
    setErr("");
    if (!validate()) return;
    setSaving(true);
    try {
      const res = await ownerAPI.createPG(form);
      const newPg = res.data;
      // Refresh list and auto-select new PG
      const listRes = await ownerAPI.getPGs();
      setPgs(listRes.data);
      closeCreate();
      selectPG(newPg.id);
      navigate(`/pg/${newPg.id}`);
    } catch (e) {
      setErr(
        e.response?.data?.message || "Failed to create PG. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: "" }));
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "linear-gradient(135deg,#F5F6FA,#EEF2FF)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        p: 3,
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 700 }}>
        {/* Header */}
        <Box sx={{ textAlign: "center", mb: 4 }}>
          <Box
            sx={{
              width: 52,
              height: 52,
              borderRadius: 2.5,
              background: "linear-gradient(135deg,#1B3A6B,#2952A3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mx: "auto",
              mb: 2,
            }}
          >
            <Business sx={{ color: "#fff", fontSize: 28 }} />
          </Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
            Select Your PG
          </Typography>
          <Typography sx={{ color: "#6B7280" }}>
            Welcome back, {user?.name}. Choose which property to manage.
          </Typography>
        </Box>

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Grid container spacing={2}>
            {pgs.map((pg) => (
              <Grid item xs={12} sm={6} key={pg.id}>
                <Card
                  onClick={() => handleSelect(pg.id)}
                  sx={{
                    cursor: "pointer",
                    transition: "all 0.2s",
                    "&:hover": {
                      transform: "translateY(-3px)",
                      boxShadow: "0 8px 24px rgba(27,58,107,0.15)",
                      borderColor: "#1B3A6B",
                    },
                  }}
                >
                  <CardContent sx={{ p: 2.5 }}>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        mb: 1.5,
                      }}
                    >
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: 2,
                          background: "linear-gradient(135deg,#1B3A6B,#2952A3)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Business sx={{ color: "#fff", fontSize: 22 }} />
                      </Box>
                      <Chip
                        label={pg.is_active ? "Active" : "Inactive"}
                        size="small"
                        sx={{
                          bgcolor: pg.is_active ? "#D1FAE5" : "#F3F4F6",
                          color: pg.is_active ? "#065F46" : "#374151",
                          fontWeight: 700,
                          fontSize: "0.68rem",
                        }}
                      />
                    </Box>
                    <Typography
                      sx={{ fontWeight: 700, fontSize: "1.05rem", mb: 0.3 }}
                    >
                      {pg.name}
                    </Typography>
                    <Typography
                      sx={{ fontSize: "0.82rem", color: "#6B7280", mb: 1.5 }}
                    >
                      {pg.city}
                      {pg.address && ` · ${pg.address.substring(0, 35)}...`}
                    </Typography>
                    <Divider sx={{ mb: 1.5 }} />
                    <Box sx={{ display: "flex", gap: 3 }}>
                      {[
                        {
                          icon: <People sx={{ fontSize: 14 }} />,
                          label: `${pg.active_tenants || 0} tenants`,
                        },
                        {
                          icon: <KingBed sx={{ fontSize: 14 }} />,
                          label: `${pg.vacant_beds || 0} vacant beds`,
                        },
                      ].map((s) => (
                        <Box
                          key={s.label}
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.5,
                            color: "#6B7280",
                          }}
                        >
                          {s.icon}
                          <Typography sx={{ fontSize: "0.78rem" }}>
                            {s.label}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}

            {/* Add New PG card */}
            <Grid item xs={12} sm={6}>
              <Card
                onClick={openCreate}
                sx={{
                  cursor: "pointer",
                  border: "2px dashed #D1D5DB",
                  boxShadow: "none",
                  "&:hover": { borderColor: "#1B3A6B", bgcolor: "#F9FAFB" },
                  transition: "all 0.2s",
                  minHeight: 140,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Box sx={{ textAlign: "center", p: 3 }}>
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      border: "2px dashed #D1D5DB",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      mx: "auto",
                      mb: 1,
                    }}
                  >
                    <Add sx={{ fontSize: 22, color: "#9CA3AF" }} />
                  </Box>
                  <Typography sx={{ fontWeight: 600, color: "#6B7280" }}>
                    Add New PG
                  </Typography>
                  <Typography
                    sx={{ fontSize: "0.75rem", color: "#9CA3AF", mt: 0.3 }}
                  >
                    Set up a new property
                  </Typography>
                </Box>
              </Card>
            </Grid>
          </Grid>
        )}

        <Box sx={{ textAlign: "center", mt: 3 }}>
          <Button size="small" onClick={logout} sx={{ color: "#6B7280" }}>
            Sign out
          </Button>
        </Box>
      </Box>

      {/* ── CREATE PG DIALOG ──────────────────────────────────────── */}
      <Dialog
        open={createOpen}
        onClose={closeCreate}
        maxWidth="sm"
        fullWidth
        keepMounted={false}
        TransitionProps={{
          onExited: () => {
            setForm(EMPTY);
            setErrors(ERRORS);
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
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: "1.05rem" }}>
              Add New PG Property
            </Typography>
            <Typography sx={{ fontSize: "0.78rem", color: "#6B7280" }}>
              Fields marked * are required
            </Typography>
          </Box>
          <IconButton onClick={closeCreate} size="small" disabled={saving}>
            <Close />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          {err && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {err}
            </Alert>
          )}

          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="PG Name *"
                size="small"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                error={!!errors.name}
                helperText={
                  errors.name || "e.g. Sunshine PG, Green Valley Residency"
                }
                placeholder="e.g. Sunshine PG"
              />
            </Grid>

            <Grid item xs={6}>
              <TextField
                fullWidth
                label="City *"
                size="small"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                error={!!errors.city}
                helperText={errors.city}
                placeholder="e.g. Bangalore"
              />
            </Grid>

            <Grid item xs={6}>
              <FormControl fullWidth size="small">
                <InputLabel>PG Type</InputLabel>
                <Select
                  value={form.pg_type}
                  label="PG Type"
                  onChange={(e) => set("pg_type", e.target.value)}
                >
                  {PG_TYPES.map((t) => (
                    <MenuItem key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Address"
                size="small"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                multiline
                rows={2}
                placeholder="Street, area, landmark..."
              />
            </Grid>

            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Contact Phone *"
                size="small"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                error={!!errors.phone}
                helperText={errors.phone}
                placeholder="10-digit mobile number"
                inputProps={{ maxLength: 10 }}
              />
            </Grid>

            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Email"
                size="small"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                type="email"
                placeholder="pg@example.com"
              />
            </Grid>
          </Grid>

          <Box
            sx={{
              mt: 2,
              p: 2,
              bgcolor: "#F0F4FF",
              borderRadius: 2,
              border: "1px solid #C7D2FE",
            }}
          >
            <Typography
              sx={{ fontSize: "0.78rem", color: "#1B3A6B", fontWeight: 600 }}
            >
              💡 What happens next?
            </Typography>
            <Typography sx={{ fontSize: "0.75rem", color: "#374151", mt: 0.5 }}>
              After creating, you'll be taken straight to your new PG dashboard
              where you can add rooms, beds, and start adding tenants.
            </Typography>
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button
            onClick={closeCreate}
            variant="outlined"
            disabled={saving}
            sx={{ borderRadius: 2, minWidth: 100 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            variant="contained"
            disabled={saving}
            sx={{ borderRadius: 2, minWidth: 160 }}
          >
            {saving ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              "Create PG & Go →"
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
