import { useState, useEffect, useCallback, useRef } from "react";
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
  Tooltip,
  FormHelperText,
} from "@mui/material";
import {
  Search,
  Close,
  Delete,
  QrCode,
  Email as EmailIcon,
  Edit,
  ContentCopy,
  Check,
  CloudUpload,
  Person,
  Home,
  Payment,
  Phone,
  Cake,
  Work,
  BadgeOutlined,
} from "@mui/icons-material";
import { pgAPI } from "../../services/api";
import StatusChip from "../../components/common/StatusChip";
import { PageHeader } from "../../components/common";
import { usePermissions } from "../../hooks/usePermissions";

// ─── Constants ────────────────────────────────────────────────────────────────
const fm = (n) => (n ? `₹${Number(n).toLocaleString("en-IN")}` : "₹0");
const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
const API_BASE = import.meta.env.VITE_API_URL?.replace("/api", "") || "";

const GENDERS = ["Male", "Female", "Other", "Prefer not to say"];
const ID_TYPES = ["Aadhar", "PAN", "Passport", "Driving License", "Voter ID"];

export const EMPTY_FORM = {
  name: "",
  phone: "",
  email: "",
  gender: "",
  father_name: "",
  parent_phone: "",
  occupation: "",
  date_of_birth: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  permanent_address: "",
  id_type: "Aadhar",
  profile_photo_file: null,
  id_proof_file: null,
  profile_photo: null,
  id_proof: null,
};
const ASSIGN_EMPTY = {
  room_id: "",
  bed_id: "",
  joining_date: "",
  monthly_rent: "",
  deposit: "",
  rent_due_day: 1,
};
const RENT_EMPTY = { monthly_rent: "", deposit: "", rent_due_day: 1 };

// ─── Validation ───────────────────────────────────────────────────────────────
const PHONE_REGEX = /^[6-9]\d{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateField = (field, value, form = {}) => {
  switch (field) {
    case "profile_photo_file":
    case "profile_photo":
      if (!value && !form.profile_photo && !form.profile_photo_file)
        return "Profile photo is required";
      return "";
    case "id_proof_file":
    case "id_proof":
      if (!value && !form.id_proof && !form.id_proof_file)
        return "ID proof document is required";
      return "";
    case "name":
      if (!value || !value.trim()) return "Full name is required";
      if (value.trim().length < 2) return "Name must be at least 2 characters";
      if (value.trim().length > 100) return "Name must be under 100 characters";
      if (!/^[a-zA-Z\s.'-]+$/.test(value.trim()))
        return "Name can only contain letters, spaces, and . ' -";
      return "";
    case "phone":
      if (!value || !value.trim()) return "Phone number is required";
      if (!PHONE_REGEX.test(value.replace(/\s/g, "")))
        return "Enter a valid 10-digit Indian mobile number";
      return "";
    case "date_of_birth": {
      if (!value) return "Date of birth is required";
      const dob = new Date(value);
      const today = new Date();
      const age = (today - dob) / (1000 * 60 * 60 * 24 * 365.25);
      if (isNaN(dob.getTime())) return "Enter a valid date";
      if (dob > today) return "Date of birth cannot be in the future";
      if (age < 13) return "Tenant must be at least 13 years old";
      if (age > 100) return "Enter a valid date of birth";
      return "";
    }
    case "father_name":
      if (!value || !value.trim()) return "Father's name is required";
      if (value.trim().length < 2) return "Name must be at least 2 characters";
      if (value.trim().length > 100) return "Name must be under 100 characters";
      if (!/^[a-zA-Z\s.'-]+$/.test(value.trim()))
        return "Name can only contain letters, spaces, and . ' -";
      return "";
    case "parent_phone":
      if (!value || !value.trim()) return "Parent's phone number is required";
      if (!PHONE_REGEX.test(value.replace(/\s/g, "")))
        return "Enter a valid 10-digit Indian mobile number";
      return "";
    case "permanent_address":
      if (!value || !value.trim()) return "Permanent address is required";
      if (value.trim().length < 10)
        return "Please enter a complete address (min 10 characters)";
      if (value.trim().length > 500)
        return "Address must be under 500 characters";
      return "";
    case "email":
      if (value && !EMAIL_REGEX.test(value))
        return "Enter a valid email address";
      if (value && value.length > 100)
        return "Email must be under 100 characters";
      return "";
    case "occupation":
      if (value && value.trim().length > 100)
        return "Occupation must be under 100 characters";
      return "";
    case "emergency_contact_name":
      if (value && value.trim().length > 100)
        return "Name must be under 100 characters";
      if (value && !/^[a-zA-Z\s.'-]+$/.test(value.trim()))
        return "Name can only contain letters, spaces, and . ' -";
      return "";
    case "emergency_contact_phone":
      if (value && !PHONE_REGEX.test(value.replace(/\s/g, "")))
        return "Enter a valid 10-digit Indian mobile number";
      return "";
    default:
      return "";
  }
};

export const MANDATORY_FIELDS = [
  "profile_photo_file",
  "id_proof_file",
  "name",
  "phone",
  "date_of_birth",
  "father_name",
  "parent_phone",
  "permanent_address",
];

export const validateAll = (form) => {
  const errors = {};
  if (!form.profile_photo_file && !form.profile_photo)
    errors.profile_photo_file = "Profile photo is required";
  if (!form.id_proof_file && !form.id_proof)
    errors.id_proof_file = "ID proof document is required";
  [
    "name",
    "phone",
    "date_of_birth",
    "father_name",
    "parent_phone",
    "permanent_address",
    "email",
    "occupation",
    "emergency_contact_name",
    "emergency_contact_phone",
  ].forEach((field) => {
    const err = validateField(field, form[field]);
    if (err) errors[field] = err;
  });
  return errors;
};

const payStatusColor = (s) =>
  ({
    paid: { bg: "#D1FAE5", color: "#065F46" },
    due: { bg: "#FEE2E2", color: "#991B1B" },
    partial: { bg: "#FEF3C7", color: "#92400E" },
  })[s] || { bg: "#F3F4F6", color: "#374151" };

const buildFD = (form) => {
  const fd = new FormData();
  Object.entries(form).forEach(([k, v]) => {
    if (
      [
        "profile_photo_file",
        "id_proof_file",
        "profile_photo",
        "id_proof",
      ].includes(k)
    )
      return;
    if (v !== null && v !== undefined && v !== "") fd.append(k, v);
  });
  if (form.profile_photo_file)
    fd.append("profile_photo", form.profile_photo_file);
  if (form.id_proof_file) fd.append("id_proof", form.id_proof_file);
  return fd;
};

// ─── FileDropZone — defined at module level, never re-created ─────────────────
function FileDropZone({ label, accept, value, onChange, icon, error }) {
  const ref = useRef();
  const isImg =
    value &&
    (typeof value === "string"
      ? value.match(/\.(jpg|jpeg|png|webp)/i)
      : value.type?.startsWith("image/"));
  const src =
    value &&
    (typeof value === "string"
      ? value.startsWith("/")
        ? `${API_BASE}${value}`
        : value
      : URL.createObjectURL(value));

  return (
    <Box>
      <Box
        onClick={() => ref.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) onChange(f);
        }}
        sx={{
          height: 90,
          border: "2px dashed",
          borderColor: error ? "#DC2626" : value ? "#1B3A6B" : "#D1D5DB",
          borderRadius: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          overflow: "hidden",
          bgcolor: error ? "#FEF2F2" : value ? "#EEF2FF" : "#FAFAFA",
          "&:hover": { borderColor: error ? "#DC2626" : "#1B3A6B" },
          transition: "all 0.15s",
        }}
      >
        {value && isImg ? (
          <Box
            component="img"
            src={src}
            sx={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : value ? (
          <Box sx={{ textAlign: "center" }}>
            <BadgeOutlined sx={{ color: "#1B3A6B", fontSize: 22 }} />
            <Typography
              sx={{
                fontSize: "0.68rem",
                color: "#1B3A6B",
                fontWeight: 600,
                mt: 0.3,
              }}
            >
              {typeof value === "string"
                ? "Uploaded"
                : value.name?.substring(0, 18)}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ textAlign: "center" }}>
            {icon || (
              <CloudUpload
                sx={{ color: error ? "#DC2626" : "#9CA3AF", fontSize: 24 }}
              />
            )}
            <Typography
              sx={{
                fontSize: "0.68rem",
                color: error ? "#DC2626" : "#9CA3AF",
                mt: 0.3,
              }}
            >
              {label}
            </Typography>
          </Box>
        )}
        <input
          ref={ref}
          type="file"
          accept={accept}
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files[0]) onChange(e.target.files[0]);
          }}
        />
      </Box>
      {error && (
        <FormHelperText error sx={{ mx: "14px", mt: "3px" }}>
          {error}
        </FormHelperText>
      )}
    </Box>
  );
}

// ─── Sec — defined at module level ────────────────────────────────────────────
function Sec({ label }) {
  return (
    <Grid item xs={12}>
      <Divider sx={{ my: 0.5 }}>
        <Typography
          sx={{
            fontSize: "0.65rem",
            fontWeight: 700,
            textTransform: "uppercase",
            color: "#6B7280",
            letterSpacing: "0.08em",
          }}
        >
          {label}
        </Typography>
      </Divider>
    </Grid>
  );
}

// ─── TenantFormFields — defined at module level, receives all state as props ──
function TenantFormFields({
  form,
  fieldErrors,
  rooms,
  availBeds,
  isEdit,
  onFieldChange,
  onBlur,
  onFileChange,
  onRoomSelect,
}) {
  return (
    <Grid container spacing={2}>
      <Sec label="Photo & ID" />
      <Grid item xs={3}>
        <Typography sx={{ fontSize: "0.72rem", fontWeight: 600, mb: 0.5 }}>
          Profile Photo <span style={{ color: "#DC2626" }}>*</span>
        </Typography>
        <FileDropZone
          label="Upload"
          accept="image/*"
          value={form.profile_photo_file || form.profile_photo}
          onChange={(f) => onFileChange("profile_photo_file", f)}
          icon={
            <Person
              sx={{
                color: fieldErrors.profile_photo_file ? "#DC2626" : "#9CA3AF",
                fontSize: 24,
              }}
            />
          }
          error={fieldErrors.profile_photo_file}
        />
      </Grid>
      <Grid item xs={9}>
        <Typography sx={{ fontSize: "0.72rem", fontWeight: 600, mb: 0.5 }}>
          ID Proof Document <span style={{ color: "#DC2626" }}>*</span>
        </Typography>
        <FileDropZone
          label="PDF or Image"
          accept="image/*,.pdf"
          value={form.id_proof_file || form.id_proof}
          onChange={(f) => onFileChange("id_proof_file", f)}
          error={fieldErrors.id_proof_file}
        />
      </Grid>
      <Grid item xs={12}>
        <Box sx={{ display: "flex", gap: 1, mt: 0.8 }}>
          <FormControl size="small" sx={{ minWidth: 250 }}>
            <InputLabel>ID Type</InputLabel>
            <Select
              value={form.id_type}
              label="ID Type"
              onChange={(e) => onFieldChange("id_type", e.target.value)}
            >
              {ID_TYPES.map((t) => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Grid>

      <Sec label="Personal Info" />

      <Grid item xs={6}>
        <TextField
          fullWidth
          label={
            <>
              Full Name <span style={{ color: "#DC2626" }}>*</span>
            </>
          }
          size="small"
          value={form.name}
          onChange={(e) => onFieldChange("name", e.target.value)}
          onBlur={() => onBlur("name")}
          error={!!fieldErrors.name}
          helperText={fieldErrors.name}
          inputProps={{ maxLength: 100 }}
        />
      </Grid>
      <Grid item xs={6}>
        <TextField
          fullWidth
          label={
            <>
              Phone <span style={{ color: "#DC2626" }}>*</span>
            </>
          }
          size="small"
          value={form.phone}
          onChange={(e) =>
            onFieldChange(
              "phone",
              e.target.value.replace(/\D/g, "").slice(0, 10),
            )
          }
          onBlur={() => onBlur("phone")}
          error={!!fieldErrors.phone}
          helperText={fieldErrors.phone}
          inputProps={{ maxLength: 10 }}
          placeholder="10-digit mobile number"
        />
      </Grid>
      <Grid item xs={6}>
        <TextField
          fullWidth
          label="Email"
          size="small"
          value={form.email}
          onChange={(e) => onFieldChange("email", e.target.value)}
          onBlur={() => onBlur("email")}
          error={!!fieldErrors.email}
          helperText={fieldErrors.email}
          inputProps={{ maxLength: 100 }}
          placeholder="optional"
        />
      </Grid>
      <Grid item xs={6}>
        <FormControl fullWidth size="small">
          <InputLabel>Gender</InputLabel>
          <Select
            value={form.gender}
            label="Gender"
            onChange={(e) => onFieldChange("gender", e.target.value)}
          >
            {GENDERS.map((g) => (
              <MenuItem key={g} value={g}>
                {g}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={6}>
        <TextField
          fullWidth
          label={
            <>
              Date of Birth <span style={{ color: "#DC2626" }}>*</span>
            </>
          }
          size="small"
          type="date"
          InputLabelProps={{ shrink: true }}
          value={form.date_of_birth}
          onChange={(e) => onFieldChange("date_of_birth", e.target.value)}
          onBlur={() => onBlur("date_of_birth")}
          error={!!fieldErrors.date_of_birth}
          helperText={fieldErrors.date_of_birth}
          inputProps={{ max: new Date().toISOString().split("T")[0] }}
        />
      </Grid>
      <Grid item xs={6}>
        <TextField
          fullWidth
          label="Occupation"
          size="small"
          value={form.occupation}
          onChange={(e) => onFieldChange("occupation", e.target.value)}
          onBlur={() => onBlur("occupation")}
          error={!!fieldErrors.occupation}
          helperText={
            fieldErrors.occupation || `${form.occupation?.length || 0}/100`
          }
          inputProps={{ maxLength: 100 }}
        />
      </Grid>
      <Grid item xs={6}>
        <TextField
          fullWidth
          label={
            <>
              Father's Name <span style={{ color: "#DC2626" }}>*</span>
            </>
          }
          size="small"
          value={form.father_name}
          onChange={(e) => onFieldChange("father_name", e.target.value)}
          onBlur={() => onBlur("father_name")}
          error={!!fieldErrors.father_name}
          helperText={fieldErrors.father_name}
          inputProps={{ maxLength: 100 }}
        />
      </Grid>
      <Grid item xs={6}>
        <TextField
          fullWidth
          label={
            <>
              Parent's Phone <span style={{ color: "#DC2626" }}>*</span>
            </>
          }
          size="small"
          value={form.parent_phone}
          onChange={(e) =>
            onFieldChange(
              "parent_phone",
              e.target.value.replace(/\D/g, "").slice(0, 10),
            )
          }
          onBlur={() => onBlur("parent_phone")}
          error={!!fieldErrors.parent_phone}
          helperText={fieldErrors.parent_phone}
          inputProps={{ maxLength: 10 }}
          placeholder="10-digit mobile number"
        />
      </Grid>
      <Grid item xs={12}>
        <TextField
          fullWidth
          label={
            <>
              Permanent Address <span style={{ color: "#DC2626" }}>*</span>
            </>
          }
          size="small"
          multiline
          rows={2}
          value={form.permanent_address}
          onChange={(e) => onFieldChange("permanent_address", e.target.value)}
          onBlur={() => onBlur("permanent_address")}
          error={!!fieldErrors.permanent_address}
          helperText={
            fieldErrors.permanent_address ||
            `${form.permanent_address?.length || 0}/500`
          }
          inputProps={{ maxLength: 500 }}
        />
      </Grid>

      <Sec label="Emergency Contact" />

      <Grid item xs={6}>
        <TextField
          fullWidth
          label="Contact Name"
          size="small"
          value={form.emergency_contact_name}
          onChange={(e) =>
            onFieldChange("emergency_contact_name", e.target.value)
          }
          onBlur={() => onBlur("emergency_contact_name")}
          error={!!fieldErrors.emergency_contact_name}
          helperText={fieldErrors.emergency_contact_name}
          inputProps={{ maxLength: 100 }}
        />
      </Grid>
      <Grid item xs={6}>
        <TextField
          fullWidth
          label="Contact Phone"
          size="small"
          value={form.emergency_contact_phone}
          onChange={(e) =>
            onFieldChange(
              "emergency_contact_phone",
              e.target.value.replace(/\D/g, "").slice(0, 10),
            )
          }
          onBlur={() => onBlur("emergency_contact_phone")}
          error={!!fieldErrors.emergency_contact_phone}
          helperText={fieldErrors.emergency_contact_phone}
          inputProps={{ maxLength: 10 }}
          placeholder="10-digit mobile number"
        />
      </Grid>

      {!isEdit && (
        <>
          <Sec label="Room Assignment (Optional)" />
          <Grid item xs={6}>
            <FormControl fullWidth size="small">
              <InputLabel>Select Room</InputLabel>
              <Select
                value={form.room_id || ""}
                label="Select Room"
                onChange={(e) => onRoomSelect(e.target.value)}
              >
                {rooms
                  .filter((r) => r.available_beds > 0)
                  .map((r) => (
                    <MenuItem key={r.id} value={r.id}>
                      {r.room_number} ({r.room_type}) — {r.available_beds} free
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6}>
            <FormControl fullWidth size="small" disabled={!form.room_id}>
              <InputLabel>Select Bed</InputLabel>
              <Select
                value={form.bed_id || ""}
                label="Select Bed"
                onChange={(e) => onFieldChange("bed_id", e.target.value)}
              >
                {availBeds.map((b) => (
                  <MenuItem key={b.id} value={b.id}>
                    Bed {b.bed_label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={4}>
            <TextField
              fullWidth
              label="Joining Date"
              size="small"
              type="date"
              InputLabelProps={{ shrink: true }}
              value={form.joining_date || ""}
              onChange={(e) => onFieldChange("joining_date", e.target.value)}
            />
          </Grid>
          <Grid item xs={4}>
            <TextField
              fullWidth
              label="Monthly Rent (₹)"
              size="small"
              type="number"
              value={form.monthly_rent || ""}
              onChange={(e) => onFieldChange("monthly_rent", e.target.value)}
              inputProps={{ min: 0, max: 9999999 }}
            />
          </Grid>
          <Grid item xs={4}>
            <TextField
              fullWidth
              label="Deposit (₹)"
              size="small"
              type="number"
              value={form.deposit || ""}
              onChange={(e) => onFieldChange("deposit", e.target.value)}
              inputProps={{ min: 0, max: 9999999 }}
            />
          </Grid>
        </>
      )}
    </Grid>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TenantsPage() {
  const { pgId } = useParams();
  const api = pgAPI(pgId);
  const { can } = usePermissions();
  const canCreate = can("manage_tenants", "create");

  const [tenants, setTenants] = useState([]);
  const [stats, setStats] = useState({});
  const [rooms, setRooms] = useState([]);
  const [availBeds, setAvailBeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const [addOpen, setAddOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [rentOpen, setRentOpen] = useState(false);
  const [vacateOpen, setVacateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [editMode, setEditMode] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [tenantDetail, setTenantDetail] = useState(null);
  const [assignForm, setAssignForm] = useState(ASSIGN_EMPTY);
  const [rentForm, setRentForm] = useState(RENT_EMPTY);
  const [inviteForm, setInviteForm] = useState({
    name: "",
    phone: "",
    email: "",
  });
  const [inviteErrors, setInviteErrors] = useState({});
  const [inviteLink, setInviteLink] = useState("");
  const [qrData, setQrData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  // ─── Stable callbacks passed as props to TenantFormFields ─────────────────
  const handleFieldChange = useCallback((field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      setFieldErrors((errs) => {
        if (!errs[field]) return errs;
        return { ...errs, [field]: validateField(field, value, next) };
      });
      return next;
    });
  }, []);

  const handleBlur = useCallback((field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setForm((prev) => {
      setFieldErrors((errs) => ({
        ...errs,
        [field]: validateField(field, prev[field], prev),
      }));
      return prev;
    });
  }, []);

  const handleFileChange = useCallback((fileField, file) => {
    setForm((prev) => ({ ...prev, [fileField]: file }));
    setFieldErrors((prev) => ({ ...prev, [fileField]: "" }));
  }, []);

  const handleRoomSelectForForm = useCallback(
    (roomId) => {
      const room = rooms.find((r) => r.id === roomId);
      setAvailBeds(room?.beds?.filter((b) => b.status === "available") || []);
      setForm((f) => ({
        ...f,
        room_id: roomId,
        bed_id: "",
        monthly_rent: room?.monthly_rent || f.monthly_rent,
      }));
    },
    [rooms],
  );

  const resetFormState = useCallback(() => {
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setTouched({});
    setErr("");
    setAvailBeds([]);
  }, []);

  // Stable props object passed to TenantFormFields — avoids inline object re-creation
  // (rooms & availBeds are state, so this object itself can't be memoized cheaply,
  //  but the handler functions above ARE stable via useCallback)

  // ─── Data fetching ─────────────────────────────────────────────────────────
  const fetchTenants = useCallback(async () => {
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
    fetchTenants();
  }, [fetchTenants]);

  useEffect(() => {
    api
      .getRooms()
      .then((r) => setRooms(r.data.rooms || []))
      .catch(() => {});
  }, [pgId]);

  const handleRoomSelectForAssign = (roomId) => {
    const room = rooms.find((r) => r.id === roomId);
    setAvailBeds(room?.beds?.filter((b) => b.status === "available") || []);
    setAssignForm((f) => ({
      ...f,
      room_id: roomId,
      bed_id: "",
      monthly_rent: room?.monthly_rent || f.monthly_rent,
    }));
  };

  const loadDetail = async (tenant) => {
    setSelectedTenant(tenant);
    setDetailOpen(true);
    setEditMode(false);
    setFieldErrors({});
    setTouched({});
    try {
      const r = await api.getTenantById(tenant.id);
      setTenantDetail(r.data);
      setForm({
        ...EMPTY_FORM,
        name: r.data.name || "",
        phone: r.data.phone || "",
        email: r.data.email || "",
        gender: r.data.gender || "",
        father_name: r.data.father_name || "",
        parent_phone: r.data.parent_phone || "",
        occupation: r.data.occupation || "",
        date_of_birth: r.data.date_of_birth?.split("T")[0] || "",
        emergency_contact_name: r.data.emergency_contact_name || "",
        emergency_contact_phone: r.data.emergency_contact_phone || "",
        permanent_address: r.data.permanent_address || "",
        id_type: r.data.id_type || "Aadhar",
        profile_photo: r.data.profile_photo || null,
        id_proof: r.data.id_proof || null,
      });
      setRentForm({
        monthly_rent: r.data.monthly_rent || "",
        deposit: r.data.deposit || "",
        rent_due_day: r.data.rent_due_day || 1,
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleAdd = async () => {
    setErr("");
    const allTouched = {};
    MANDATORY_FIELDS.forEach((f) => (allTouched[f] = true));
    setTouched(allTouched);
    const errors = validateAll(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setErr("Please fix the errors below before submitting.");
      return;
    }
    setSaving(true);
    try {
      await api.createTenant(buildFD(form));
      setAddOpen(false);
      fetchTenants();
    } catch (e) {
      setErr(e.response?.data?.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    setErr("");
    const allTouched = {};
    [
      "name",
      "phone",
      "date_of_birth",
      "father_name",
      "parent_phone",
      "permanent_address",
    ].forEach((f) => (allTouched[f] = true));
    setTouched(allTouched);
    const errors = validateAll(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setErr("Please fix the errors below before submitting.");
      return;
    }
    setSaving(true);
    try {
      await api.updateTenant(selectedTenant.id, buildFD(form));
      setEditMode(false);
      const r = await api.getTenantById(selectedTenant.id);
      setTenantDetail(r.data);
      fetchTenants();
    } catch (e) {
      setErr(e.response?.data?.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async () => {
    setErr("");
    if (
      !assignForm.room_id ||
      !assignForm.joining_date ||
      !assignForm.monthly_rent
    )
      return setErr("Room, date and rent required");
    setSaving(true);
    try {
      await api.assignRoom(selectedTenant.id, assignForm);
      setAssignOpen(false);
      fetchTenants();
      if (detailOpen) {
        const r = await api.getTenantById(selectedTenant.id);
        setTenantDetail(r.data);
      }
    } catch (e) {
      setErr(e.response?.data?.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleRentUpdate = async () => {
    setErr("");
    setSaving(true);
    try {
      await api.updateRent(selectedTenant.id, rentForm);
      setRentOpen(false);
      fetchTenants();
      const r = await api.getTenantById(selectedTenant.id);
      setTenantDetail(r.data);
    } catch (e) {
      setErr(e.response?.data?.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleVacate = async () => {
    setSaving(true);
    try {
      await api.markVacated(selectedTenant.id, {
        vacated_date: new Date().toISOString().split("T")[0],
      });
      setVacateOpen(false);
      setDetailOpen(false);
      fetchTenants();
    } catch (e) {
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteTenant(id);
      setDeleteId(null);
      setDetailOpen(false);
      fetchTenants();
    } catch (e) {
      alert(e.response?.data?.message || "Failed");
    }
  };

  const handleInvite = async () => {
    setErr("");
    const errors = {};
    if (!inviteForm.name.trim()) errors.name = "Name is required";
    else if (inviteForm.name.trim().length < 2)
      errors.name = "Name must be at least 2 characters";
    if (!inviteForm.phone.trim()) errors.phone = "Phone is required";
    else if (!PHONE_REGEX.test(inviteForm.phone.replace(/\s/g, "")))
      errors.phone = "Enter a valid 10-digit Indian mobile number";
    if (inviteForm.email && !EMAIL_REGEX.test(inviteForm.email))
      errors.email = "Enter a valid email address";
    setInviteErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    try {
      const r = await api.inviteTenant(inviteForm);
      setInviteLink(r.data.inviteLink);
    } catch (e) {
      setErr(e.response?.data?.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenQR = async () => {
    setQrOpen(true);
    if (!qrData) {
      try {
        const r = await api.getQRCode();
        setQrData(r.data);
      } catch (e) {}
    }
  };

  const handleCopy = (t) => {
    navigator.clipboard.writeText(t);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <Box>
      <PageHeader
        title="Tenants"
        subtitle="Manage residents, track payments and room allocations."
        actionLabel={canCreate ? "Add Tenant" : null}
        onAction={() => {
          resetFormState();
          setAddOpen(true);
        }}
      />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: "Total", value: stats.total || 0, color: "#1B3A6B" },
          { label: "Active", value: stats.active || 0, color: "#059669" },
          { label: "Pending", value: stats.pending || 0, color: "#D97706" },
          {
            label: "New This Month",
            value: stats.new_this_month || 0,
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
              placeholder="Search name, phone..."
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
              {canCreate && (
                <>
                  <Tooltip title="Send invite link">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<EmailIcon sx={{ fontSize: 14 }} />}
                      onClick={() => {
                        setInviteForm({ name: "", phone: "", email: "" });
                        setInviteErrors({});
                        setInviteLink("");
                        setErr("");
                        setInviteOpen(true);
                      }}
                      sx={{ fontSize: "0.78rem", borderRadius: 2 }}
                    >
                      Invite
                    </Button>
                  </Tooltip>
                  <Tooltip title="QR code for self-registration">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<QrCode sx={{ fontSize: 14 }} />}
                      onClick={handleOpenQR}
                      sx={{ fontSize: "0.78rem", borderRadius: 2 }}
                    >
                      QR Code
                    </Button>
                  </Tooltip>
                </>
              )}
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
                      "Tenant",
                      "Phone",
                      "Room/Bed",
                      "Joined",
                      "Rent",
                      "Status",
                      "Payment",
                      "Actions",
                    ].map((h) => (
                      <TableCell key={h}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tenants.map((t) => (
                    <TableRow
                      key={t.id}
                      hover
                      onClick={() => loadDetail(t)}
                      sx={{
                        cursor: "pointer",
                        "&:hover": { bgcolor: "#F5F7FF" },
                      }}
                    >
                      <TableCell>
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1.5,
                          }}
                        >
                          <Avatar
                            src={
                              t.profile_photo
                                ? `${API_BASE}${t.profile_photo}`
                                : undefined
                            }
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
                              {t.email || t.gender || ""}
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
                          {fm(t.monthly_rent)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <StatusChip status={t.status} />
                      </TableCell>
                      <TableCell>
                        {t.payment_status && (
                          <Chip
                            label={t.payment_status?.toUpperCase()}
                            size="small"
                            sx={{
                              bgcolor: payStatusColor(t.payment_status).bg,
                              color: payStatusColor(t.payment_status).color,
                              fontWeight: 700,
                              fontSize: "0.65rem",
                              height: 20,
                            }}
                          />
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Box sx={{ display: "flex", gap: 0.3 }}>
                          {t.status === "pending" && canCreate && (
                            <Button
                              size="small"
                              variant="contained"
                              sx={{
                                fontSize: "0.68rem",
                                py: 0.3,
                                px: 0.8,
                                borderRadius: 1.5,
                              }}
                              onClick={() => {
                                setSelectedTenant(t);
                                setAssignForm({
                                  ...ASSIGN_EMPTY,
                                  monthly_rent: t.monthly_rent || "",
                                });
                                setErr("");
                                setAssignOpen(true);
                              }}
                            >
                              Assign
                            </Button>
                          )}
                          {t.status === "active" && canCreate && (
                            <Button
                              size="small"
                              variant="outlined"
                              sx={{
                                fontSize: "0.68rem",
                                py: 0.3,
                                px: 0.8,
                                borderRadius: 1.5,
                                color: "#D97706",
                                borderColor: "#FCD34D",
                              }}
                              onClick={() => {
                                setSelectedTenant(t);
                                setVacateOpen(true);
                              }}
                            >
                              Vacate
                            </Button>
                          )}
                          {canCreate && (
                            <IconButton
                              size="small"
                              sx={{
                                color: "#DC2626",
                                opacity: 0.5,
                                "&:hover": { opacity: 1 },
                              }}
                              onClick={() => setDeleteId(t.id)}
                            >
                              <Delete sx={{ fontSize: 14 }} />
                            </IconButton>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                  {tenants.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={8}
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

      {/* ── ADD TENANT ─────────────────────────────────────────────────────── */}
      <Dialog
        open={addOpen}
        onClose={() => {
          if (!saving) setAddOpen(false);
        }}
        maxWidth="md"
        fullWidth
        keepMounted={false}
        TransitionProps={{ onExited: resetFormState }}
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle
          sx={{ display: "flex", justifyContent: "space-between", pb: 0 }}
        >
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: "1.05rem" }}>
              Add New Tenant
            </Typography>
            <Typography sx={{ fontSize: "0.72rem", color: "#6B7280", mt: 0.3 }}>
              Fields marked <span style={{ color: "#DC2626" }}>*</span> are
              required
            </Typography>
          </Box>
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
          <TenantFormFields
            form={form}
            fieldErrors={fieldErrors}
            rooms={rooms}
            availBeds={availBeds}
            isEdit={false}
            onFieldChange={handleFieldChange}
            onBlur={handleBlur}
            onFileChange={handleFileChange}
            onRoomSelect={handleRoomSelectForForm}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button
            onClick={() => setAddOpen(false)}
            variant="outlined"
            disabled={saving}
            sx={{ borderRadius: 2, minWidth: 100 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            variant="contained"
            disabled={saving}
            sx={{ borderRadius: 2, minWidth: 160 }}
          >
            {saving ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              "Add Tenant"
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── TENANT DETAIL / EDIT ───────────────────────────────────────────── */}
      <Dialog
        open={detailOpen}
        onClose={() => {
          if (!saving) {
            setDetailOpen(false);
            setEditMode(false);
          }
        }}
        maxWidth="md"
        fullWidth
        keepMounted={false}
        TransitionProps={{
          onExited: () => {
            setTenantDetail(null);
            setSelectedTenant(null);
            setEditMode(false);
            setErr("");
            setFieldErrors({});
            setTouched({});
          },
        }}
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle
          sx={{ display: "flex", justifyContent: "space-between", pb: 1 }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            {tenantDetail && (
              <Avatar
                src={
                  tenantDetail.profile_photo
                    ? `${API_BASE}${tenantDetail.profile_photo}`
                    : undefined
                }
                sx={{
                  width: 44,
                  height: 44,
                  bgcolor: "#1B3A6B",
                  fontSize: "1.1rem",
                }}
              >
                {tenantDetail.name?.charAt(0)}
              </Avatar>
            )}
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: "1.05rem" }}>
                {tenantDetail?.name || selectedTenant?.name}
              </Typography>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                <StatusChip
                  status={tenantDetail?.status || selectedTenant?.status}
                />
                {tenantDetail?.room_number && (
                  <Chip
                    label={`${tenantDetail.room_number}${tenantDetail.bed_label ? `-${tenantDetail.bed_label}` : ""}`}
                    size="small"
                    sx={{
                      bgcolor: "#EEF2FF",
                      color: "#1B3A6B",
                      fontWeight: 700,
                      fontSize: "0.68rem",
                    }}
                  />
                )}
                {tenantDetail?.payment_status && (
                  <Chip
                    label={tenantDetail.payment_status.toUpperCase()}
                    size="small"
                    sx={{
                      bgcolor: payStatusColor(tenantDetail.payment_status).bg,
                      color: payStatusColor(tenantDetail.payment_status).color,
                      fontWeight: 700,
                      fontSize: "0.65rem",
                    }}
                  />
                )}
              </Box>
            </Box>
          </Box>
          <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
            {!editMode && canCreate && (
              <>
                <Tooltip title="Edit personal info">
                  <IconButton
                    onClick={() => {
                      setEditMode(true);
                      setFieldErrors({});
                      setTouched({});
                    }}
                    sx={{ color: "#1B3A6B" }}
                  >
                    <Edit fontSize="small" />
                  </IconButton>
                </Tooltip>
                {tenantDetail?.status === "pending" && (
                  <Button
                    size="small"
                    variant="contained"
                    sx={{ fontSize: "0.75rem", borderRadius: 2 }}
                    onClick={() => {
                      setAssignForm({
                        ...ASSIGN_EMPTY,
                        monthly_rent: tenantDetail?.monthly_rent || "",
                      });
                      setErr("");
                      setAssignOpen(true);
                    }}
                  >
                    Assign Room
                  </Button>
                )}
                {tenantDetail?.status === "active" && (
                  <>
                    <Button
                      size="small"
                      variant="outlined"
                      sx={{
                        fontSize: "0.72rem",
                        borderRadius: 2,
                        color: "#1B3A6B",
                      }}
                      onClick={() => {
                        setRentForm({
                          monthly_rent: tenantDetail.monthly_rent || "",
                          deposit: tenantDetail.deposit || "",
                          rent_due_day: tenantDetail.rent_due_day || 1,
                        });
                        setErr("");
                        setRentOpen(true);
                      }}
                    >
                      Edit Rent
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      sx={{
                        fontSize: "0.72rem",
                        borderRadius: 2,
                        color: "#D97706",
                        borderColor: "#FCD34D",
                      }}
                      onClick={() => setVacateOpen(true)}
                    >
                      Vacate
                    </Button>
                  </>
                )}
              </>
            )}
            <IconButton
              onClick={() => {
                setDetailOpen(false);
                setEditMode(false);
              }}
              size="small"
              disabled={saving}
            >
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 0 }}>
          {!tenantDetail ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}>
              <CircularProgress />
            </Box>
          ) : editMode ? (
            <Box sx={{ p: 2.5 }}>
              <Typography
                sx={{ fontSize: "0.72rem", color: "#6B7280", mb: 1.5 }}
              >
                Fields marked <span style={{ color: "#DC2626" }}>*</span> are
                required
              </Typography>
              {err && (
                <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                  {err}
                </Alert>
              )}
              <TenantFormFields
                form={form}
                fieldErrors={fieldErrors}
                rooms={rooms}
                availBeds={availBeds}
                isEdit
                onFieldChange={handleFieldChange}
                onBlur={handleBlur}
                onFileChange={handleFileChange}
                onRoomSelect={handleRoomSelectForForm}
              />
            </Box>
          ) : (
            <Box>
              <Box
                sx={{
                  display: "flex",
                  gap: 0,
                  borderBottom: "1px solid #E5E7EB",
                  overflowX: "auto",
                }}
              >
                {[
                  {
                    icon: <Phone sx={{ fontSize: 14 }} />,
                    label: "Phone",
                    value: tenantDetail.phone,
                  },
                  {
                    icon: <Work sx={{ fontSize: 14 }} />,
                    label: "Occupation",
                    value: tenantDetail.occupation || "—",
                  },
                  {
                    icon: <Cake sx={{ fontSize: 14 }} />,
                    label: "DOB",
                    value: fmtDate(tenantDetail.date_of_birth),
                  },
                ].map((s) => (
                  <Box
                    key={s.label}
                    sx={{
                      px: 2.5,
                      py: 1.5,
                      borderRight: "1px solid #E5E7EB",
                      minWidth: 110,
                      flexShrink: 0,
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.4,
                        color: "#6B7280",
                        mb: 0.3,
                      }}
                    >
                      {s.icon}
                      <Typography
                        sx={{
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        {s.label}
                      </Typography>
                    </Box>
                    <Typography
                      sx={{
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        color: "#1A1F36",
                      }}
                    >
                      {s.value}
                    </Typography>
                  </Box>
                ))}
              </Box>
              <Grid container sx={{ p: 2.5 }} spacing={2}>
                <Grid item xs={12} md={6}>
                  <Card sx={{ boxShadow: "none", border: "1px solid #E5E7EB" }}>
                    <CardContent sx={{ p: 2 }}>
                      <Typography
                        sx={{
                          fontWeight: 700,
                          fontSize: "0.82rem",
                          mb: 1.5,
                          display: "flex",
                          alignItems: "center",
                          gap: 0.5,
                        }}
                      >
                        <Person sx={{ fontSize: 14, color: "#1B3A6B" }} />{" "}
                        Personal Details
                      </Typography>
                      {[
                        { label: "Gender", value: tenantDetail.gender },
                        {
                          label: "Father's Name",
                          value: tenantDetail.father_name,
                        },
                        {
                          label: "Parent's Phone",
                          value: tenantDetail.parent_phone,
                        },
                        {
                          label: "Emergency Contact",
                          value: tenantDetail.emergency_contact_name,
                        },
                        {
                          label: "Emergency Phone",
                          value: tenantDetail.emergency_contact_phone,
                        },
                        {
                          label: "Address",
                          value: tenantDetail.permanent_address,
                        },
                      ]
                        .filter((r) => r.value)
                        .map((row) => (
                          <Box
                            key={row.label}
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              mb: 0.8,
                              pb: 0.8,
                              borderBottom: "1px solid #F3F4F6",
                            }}
                          >
                            <Typography
                              sx={{ fontSize: "0.78rem", color: "#6B7280" }}
                            >
                              {row.label}
                            </Typography>
                            <Typography
                              sx={{
                                fontSize: "0.82rem",
                                fontWeight: 500,
                                textAlign: "right",
                                maxWidth: "58%",
                              }}
                            >
                              {row.value}
                            </Typography>
                          </Box>
                        ))}
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Card
                    sx={{
                      boxShadow: "none",
                      border: "1px solid #E5E7EB",
                      mb: 1.5,
                    }}
                  >
                    <CardContent sx={{ p: 2 }}>
                      <Typography
                        sx={{
                          fontWeight: 700,
                          fontSize: "0.82rem",
                          mb: 1.5,
                          display: "flex",
                          alignItems: "center",
                          gap: 0.5,
                        }}
                      >
                        <Home sx={{ fontSize: 14, color: "#1B3A6B" }} /> Room &
                        Rent
                      </Typography>
                      {[
                        {
                          label: "Room",
                          value: tenantDetail.room_number
                            ? `${tenantDetail.room_number}${tenantDetail.bed_label ? `-${tenantDetail.bed_label}` : ""}`
                            : "Not Assigned",
                        },
                        { label: "Room Type", value: tenantDetail.room_type },
                        {
                          label: "Joining Date",
                          value: fmtDate(tenantDetail.joining_date),
                        },
                        {
                          label: "Monthly Rent",
                          value: fm(tenantDetail.monthly_rent),
                        },
                        { label: "Deposit", value: fm(tenantDetail.deposit) },
                        {
                          label: "Rent Due Day",
                          value: tenantDetail.rent_due_day
                            ? `Day ${tenantDetail.rent_due_day}`
                            : "—",
                        },
                      ].map((row) => (
                        <Box
                          key={row.label}
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            mb: 0.8,
                            pb: 0.8,
                            borderBottom: "1px solid #F3F4F6",
                          }}
                        >
                          <Typography
                            sx={{ fontSize: "0.78rem", color: "#6B7280" }}
                          >
                            {row.label}
                          </Typography>
                          <Typography
                            sx={{ fontSize: "0.82rem", fontWeight: 600 }}
                          >
                            {row.value}
                          </Typography>
                        </Box>
                      ))}
                    </CardContent>
                  </Card>
                  {tenantDetail.id_proof && (
                    <Card
                      sx={{ boxShadow: "none", border: "1px solid #E5E7EB" }}
                    >
                      <CardContent sx={{ p: 2 }}>
                        <Typography
                          sx={{ fontWeight: 700, fontSize: "0.82rem", mb: 1 }}
                        >
                          ID Proof ({tenantDetail.id_type})
                        </Typography>
                        {tenantDetail.id_proof.match(
                          /\.(jpg|jpeg|png|webp)/i,
                        ) ? (
                          <Box
                            component="img"
                            src={`${API_BASE}${tenantDetail.id_proof}`}
                            sx={{
                              width: "100%",
                              maxHeight: 100,
                              objectFit: "contain",
                              borderRadius: 1.5,
                              border: "1px solid #E5E7EB",
                            }}
                          />
                        ) : (
                          <Button
                            size="small"
                            variant="outlined"
                            href={`${API_BASE}${tenantDetail.id_proof}`}
                            target="_blank"
                            sx={{ borderRadius: 2, fontSize: "0.78rem" }}
                          >
                            View Document
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </Grid>
                {tenantDetail.payments?.length > 0 && (
                  <Grid item xs={12}>
                    <Card
                      sx={{ boxShadow: "none", border: "1px solid #E5E7EB" }}
                    >
                      <CardContent sx={{ p: 2 }}>
                        <Typography
                          sx={{
                            fontWeight: 700,
                            fontSize: "0.82rem",
                            mb: 1.5,
                            display: "flex",
                            alignItems: "center",
                            gap: 0.5,
                          }}
                        >
                          <Payment sx={{ fontSize: 14, color: "#1B3A6B" }} />{" "}
                          Payment History
                        </Typography>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              {[
                                "Receipt",
                                "Month",
                                "Date",
                                "Paid",
                                "Balance",
                                "Mode",
                                "Status",
                              ].map((h) => (
                                <TableCell key={h}>{h}</TableCell>
                              ))}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {tenantDetail.payments.slice(0, 5).map((p) => (
                              <TableRow key={p.id} hover>
                                <TableCell>
                                  <Typography
                                    sx={{
                                      fontSize: "0.75rem",
                                      color: "#1B3A6B",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {p.receipt_number}
                                  </Typography>
                                </TableCell>
                                <TableCell>{p.month || "—"}</TableCell>
                                <TableCell>{fmtDate(p.payment_date)}</TableCell>
                                <TableCell>
                                  <Typography
                                    sx={{
                                      fontWeight: 700,
                                      fontSize: "0.82rem",
                                    }}
                                  >
                                    {fm(p.paid_amount || p.amount)}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  {p.balance_due > 0 ? (
                                    <Typography
                                      sx={{
                                        fontSize: "0.78rem",
                                        color: "#D97706",
                                        fontWeight: 600,
                                      }}
                                    >
                                      {fm(p.balance_due)}
                                    </Typography>
                                  ) : (
                                    "—"
                                  )}
                                </TableCell>
                                <TableCell
                                  sx={{
                                    textTransform: "capitalize",
                                    fontSize: "0.78rem",
                                  }}
                                >
                                  {p.payment_mode?.replace("_", " ")}
                                </TableCell>
                                <TableCell>
                                  <StatusChip
                                    status={p.is_partial ? "pending" : p.status}
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </Grid>
                )}
              </Grid>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          {editMode ? (
            <>
              <Button
                onClick={() => {
                  setEditMode(false);
                  setErr("");
                  setFieldErrors({});
                  setTouched({});
                }}
                variant="outlined"
                disabled={saving}
                sx={{ borderRadius: 2 }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdate}
                variant="contained"
                disabled={saving}
                sx={{ borderRadius: 2, minWidth: 130 }}
              >
                {saving ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  "Save Changes"
                )}
              </Button>
            </>
          ) : (
            <Button
              onClick={() => {
                setDetailOpen(false);
                setEditMode(false);
              }}
              variant="outlined"
              sx={{ borderRadius: 2 }}
            >
              Close
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* ── ASSIGN ROOM ────────────────────────────────────────────────────── */}
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
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between" }}>
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
                  onChange={(e) => handleRoomSelectForAssign(e.target.value)}
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
                inputProps={{ min: 0, max: 9999999 }}
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
                inputProps={{ min: 0, max: 9999999 }}
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
                helperText="Day 1–28 of each month"
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

      {/* ── EDIT RENT ──────────────────────────────────────────────────────── */}
      <Dialog
        open={rentOpen}
        onClose={() => {
          if (!saving) setRentOpen(false);
        }}
        maxWidth="xs"
        fullWidth
        keepMounted={false}
        TransitionProps={{
          onExited: () => {
            setRentForm(RENT_EMPTY);
            setErr("");
          },
        }}
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between" }}>
          <Typography sx={{ fontWeight: 700 }}>Edit Rent Details</Typography>
          <IconButton onClick={() => setRentOpen(false)} size="small">
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
                label="Monthly Rent (₹)"
                size="small"
                type="number"
                value={rentForm.monthly_rent}
                onChange={(e) =>
                  setRentForm((f) => ({ ...f, monthly_rent: e.target.value }))
                }
                inputProps={{ min: 0, max: 9999999 }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Deposit (₹)"
                size="small"
                type="number"
                value={rentForm.deposit}
                onChange={(e) =>
                  setRentForm((f) => ({ ...f, deposit: e.target.value }))
                }
                inputProps={{ min: 0, max: 9999999 }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Rent Due Day (1–28)"
                size="small"
                type="number"
                value={rentForm.rent_due_day}
                onChange={(e) =>
                  setRentForm((f) => ({ ...f, rent_due_day: e.target.value }))
                }
                InputProps={{ inputProps: { min: 1, max: 28 } }}
                helperText="Day 1–28 of each month"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button
            onClick={() => setRentOpen(false)}
            variant="outlined"
            disabled={saving}
            sx={{ borderRadius: 2, flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleRentUpdate}
            variant="contained"
            disabled={saving}
            sx={{ borderRadius: 2, flex: 2 }}
          >
            {saving ? <CircularProgress size={20} color="inherit" /> : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── VACATE ─────────────────────────────────────────────────────────── */}
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
          <Typography sx={{ fontWeight: 700 }}>Confirm Vacate</Typography>
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ borderRadius: 2 }}>
            Mark <strong>{selectedTenant?.name}</strong> as vacated and free
            their room/bed?
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

      {/* ── DELETE ─────────────────────────────────────────────────────────── */}
      <Dialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        maxWidth="xs"
        fullWidth
        keepMounted={false}
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle>
          <Typography sx={{ fontWeight: 700 }}>Delete Tenant</Typography>
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ borderRadius: 2 }}>
            This permanently removes the tenant and all payment records.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button
            onClick={() => setDeleteId(null)}
            variant="outlined"
            sx={{ borderRadius: 2, flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => handleDelete(deleteId)}
            variant="contained"
            color="error"
            sx={{ borderRadius: 2, flex: 2 }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── INVITE ─────────────────────────────────────────────────────────── */}
      <Dialog
        open={inviteOpen}
        onClose={() => {
          if (!saving) setInviteOpen(false);
        }}
        maxWidth="xs"
        fullWidth
        keepMounted={false}
        TransitionProps={{
          onExited: () => {
            setInviteForm({ name: "", phone: "", email: "" });
            setInviteErrors({});
            setInviteLink("");
            setErr("");
          },
        }}
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between" }}>
          <Box>
            <Typography sx={{ fontWeight: 700 }}>Invite Tenant</Typography>
            <Typography sx={{ fontSize: "0.78rem", color: "#6B7280" }}>
              Send self-registration link
            </Typography>
          </Box>
          <IconButton onClick={() => setInviteOpen(false)} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {err && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {err}
            </Alert>
          )}
          {inviteLink ? (
            <Box>
              <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
                Link created!
              </Alert>
              <Box
                sx={{
                  p: 2,
                  bgcolor: "#F9FAFB",
                  borderRadius: 2,
                  border: "1px solid #E5E7EB",
                  fontSize: "0.78rem",
                  wordBreak: "break-all",
                  mb: 2,
                }}
              >
                {inviteLink}
              </Box>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={copied ? <Check /> : <ContentCopy />}
                  onClick={() => handleCopy(inviteLink)}
                  sx={{ borderRadius: 2 }}
                >
                  {copied ? "Copied!" : "Copy Link"}
                </Button>
                {inviteForm.phone && (
                  <Button
                    fullWidth
                    variant="outlined"
                    color="success"
                    href={`https://wa.me/${inviteForm.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${inviteForm.name}, register for PG: ${inviteLink}`)}`}
                    target="_blank"
                    sx={{ borderRadius: 2 }}
                  >
                    WhatsApp
                  </Button>
                )}
              </Box>
            </Box>
          ) : (
            <Grid container spacing={2} sx={{ mt: 0 }}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Name *"
                  size="small"
                  value={inviteForm.name}
                  onChange={(e) => {
                    setInviteForm((f) => ({ ...f, name: e.target.value }));
                    if (inviteErrors.name)
                      setInviteErrors((p) => ({ ...p, name: "" }));
                  }}
                  error={!!inviteErrors.name}
                  helperText={inviteErrors.name}
                  inputProps={{ maxLength: 100 }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Phone *"
                  size="small"
                  value={inviteForm.phone}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 10);
                    setInviteForm((f) => ({ ...f, phone: v }));
                    if (inviteErrors.phone)
                      setInviteErrors((p) => ({ ...p, phone: "" }));
                  }}
                  error={!!inviteErrors.phone}
                  helperText={inviteErrors.phone}
                  inputProps={{ maxLength: 10 }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Email (optional)"
                  size="small"
                  value={inviteForm.email}
                  onChange={(e) => {
                    setInviteForm((f) => ({ ...f, email: e.target.value }));
                    if (inviteErrors.email)
                      setInviteErrors((p) => ({ ...p, email: "" }));
                  }}
                  error={!!inviteErrors.email}
                  helperText={inviteErrors.email}
                  inputProps={{ maxLength: 100 }}
                />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        {!inviteLink && (
          <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
            <Button
              onClick={() => setInviteOpen(false)}
              variant="outlined"
              disabled={saving}
              sx={{ borderRadius: 2, flex: 1 }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleInvite}
              variant="contained"
              disabled={saving}
              sx={{ borderRadius: 2, flex: 2 }}
            >
              {saving ? (
                <CircularProgress size={20} color="inherit" />
              ) : (
                "Generate Link"
              )}
            </Button>
          </DialogActions>
        )}
      </Dialog>

      {/* ── QR CODE ────────────────────────────────────────────────────────── */}
      <Dialog
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        maxWidth="xs"
        fullWidth
        keepMounted={false}
        TransitionProps={{ onExited: () => setQrData(null) }}
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between" }}>
          <Box>
            <Typography sx={{ fontWeight: 700 }}>
              QR Code Registration
            </Typography>
            <Typography sx={{ fontSize: "0.78rem", color: "#6B7280" }}>
              Tenants scan to self-register
            </Typography>
          </Box>
          <IconButton onClick={() => setQrOpen(false)} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {!qrData ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ textAlign: "center" }}>
              <Box
                sx={{
                  p: 3,
                  bgcolor: "#fff",
                  borderRadius: 2,
                  border: "2px solid #E5E7EB",
                  display: "inline-block",
                  mb: 2,
                }}
              >
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData.inviteLink)}`}
                  alt="QR"
                  width={200}
                  height={200}
                  style={{ display: "block" }}
                />
              </Box>
              <Typography sx={{ fontWeight: 700, mb: 0.5 }}>
                {qrData.pgName}
              </Typography>
              <Typography sx={{ fontSize: "0.78rem", color: "#6B7280", mb: 2 }}>
                Valid 30 days · Expires {fmtDate(qrData.expiresAt)}
              </Typography>
              <Box
                sx={{
                  p: 1.5,
                  bgcolor: "#F9FAFB",
                  borderRadius: 2,
                  border: "1px solid #E5E7EB",
                  fontSize: "0.72rem",
                  wordBreak: "break-all",
                  mb: 2,
                  textAlign: "left",
                }}
              >
                {qrData.inviteLink}
              </Box>
              <Box sx={{ display: "flex", gap: 1, justifyContent: "center" }}>
                <Button
                  variant="outlined"
                  startIcon={copied ? <Check /> : <ContentCopy />}
                  onClick={() => handleCopy(qrData.inviteLink)}
                  sx={{ borderRadius: 2 }}
                >
                  {copied ? "Copied!" : "Copy Link"}
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrData.inviteLink)}`;
                    a.download = "tenant-qr.png";
                    a.click();
                  }}
                  sx={{ borderRadius: 2 }}
                >
                  Download
                </Button>
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
