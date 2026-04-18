import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Chip,
  FormHelperText,
} from "@mui/material";
import {
  Business,
  CheckCircle,
  ErrorOutline,
  CloudUpload,
  Person,
  BadgeOutlined,
} from "@mui/icons-material";
import { authAPI } from "../../services/api";

const GENDERS = ["Male", "Female", "Other", "Prefer not to say"];
const ID_TYPES = ["Aadhar", "PAN", "Passport", "Driving License", "Voter ID"];
const PHONE_REGEX = /^[6-9]\d{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TODAY = new Date().toISOString().split("T")[0];

/* ── Max DOB = 10 years ago, Min DOB = 100 years ago ── */
const maxDob = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 10);
  return d.toISOString().split("T")[0];
})();
const minDob = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 100);
  return d.toISOString().split("T")[0];
})();

const EMPTY = {
  name: "",
  phone: "",
  email: "",
  gender: "",
  date_of_birth: "",
  father_name: "",
  parent_phone: "",
  occupation: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  permanent_address: "",
  id_type: "Aadhar",
  profile_photo_file: null,
  id_proof_file: null,
};

/* ─── Required fields list ─── */
const REQUIRED_FIELDS = [
  "profile_photo_file",
  "id_proof_file",
  "name",
  "phone",
  "date_of_birth",
  "father_name",
  "parent_phone",
  "permanent_address",
];

/* ─── Per-field validation ─── */
const validateField = (field, value) => {
  switch (field) {
    case "profile_photo_file":
      if (!value) return "Profile photo is required";
      if (value instanceof File) {
        if (!value.type.startsWith("image/"))
          return "Only image files are allowed (JPG, PNG, etc.)";
        if (value.size > 5 * 1024 * 1024) return "File must be under 5 MB";
      }
      return "";

    case "id_proof_file":
      if (!value) return "ID proof is required";
      if (value instanceof File) {
        const allowed = [
          "image/jpeg",
          "image/png",
          "image/webp",
          "application/pdf",
        ];
        if (!allowed.includes(value.type))
          return "Only JPG, PNG or PDF allowed";
        if (value.size > 10 * 1024 * 1024) return "File must be under 10 MB";
      }
      return "";

    case "name":
      if (!value?.trim()) return "Full name is required";
      if (value.trim().length < 2) return "Minimum 2 characters";
      if (value.trim().length > 100) return "Maximum 100 characters";
      if (!/^[a-zA-Z\s'.]+$/.test(value.trim()))
        return "Only letters, spaces, apostrophes allowed";
      return "";

    case "phone":
      if (!value) return "Phone number is required";
      if (!/^\d+$/.test(value)) return "Only digits allowed";
      if (!PHONE_REGEX.test(value))
        return "Must be 10 digits starting with 6-9";
      return "";

    case "email":
      if (!value) return ""; // optional
      if (!EMAIL_REGEX.test(value)) return "Invalid email address";
      return "";

    case "gender":
      return ""; // optional

    case "date_of_birth":
      if (!value) return "Date of birth is required";
      if (value > maxDob) return "Must be at least 10 years old";
      if (value < minDob) return "Date seems too old";
      return "";

    case "father_name":
      if (!value?.trim()) return "Father's name is required";
      if (value.trim().length < 2) return "Minimum 2 characters";
      if (!/^[a-zA-Z\s'.]+$/.test(value.trim())) return "Only letters allowed";
      return "";

    case "parent_phone":
      if (!value) return "Parent phone is required";
      if (!/^\d+$/.test(value)) return "Only digits allowed";
      if (!PHONE_REGEX.test(value))
        return "Must be 10 digits starting with 6-9";
      return "";

    case "occupation":
      return ""; // optional

    case "emergency_contact_name":
      return ""; // optional

    case "emergency_contact_phone":
      if (!value) return ""; // optional
      if (!/^\d+$/.test(value)) return "Only digits allowed";
      if (!PHONE_REGEX.test(value))
        return "Must be 10 digits starting with 6-9";
      return "";

    case "permanent_address":
      if (!value?.trim()) return "Permanent address is required";
      if (value.trim().length < 10)
        return "Please enter complete address (min 10 chars)";
      if (value.trim().length > 500) return "Maximum 500 characters";
      return "";

    default:
      return "";
  }
};

/* ─── Section divider ─── */
const Section = ({ label }) => (
  <Grid item xs={12}>
    <Divider sx={{ my: 0.5 }}>
      <Typography
        sx={{
          fontSize: "0.68rem",
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

/* ─── FileDropZone ─── */
function FileDropZone({ label, accept, value, onChange, icon, error }) {
  const ref = useRef();

  /* Build preview src only for image files */
  const isImageFile =
    value instanceof File
      ? value.type.startsWith("image/")
      : typeof value === "string" && /\.(jpg|jpeg|png|webp)/i.test(value);

  const isPdfFile =
    value instanceof File
      ? value.type === "application/pdf"
      : typeof value === "string" && value.endsWith(".pdf");

  /* Object URL for preview — revoked on cleanup */
  const [previewSrc, setPreviewSrc] = useState(null);
  useEffect(() => {
    if (value instanceof File && isImageFile) {
      const url = URL.createObjectURL(value);
      setPreviewSrc(url);
      return () => URL.revokeObjectURL(url);
    } else if (typeof value === "string" && isImageFile) {
      setPreviewSrc(value);
    } else {
      setPreviewSrc(null);
    }
  }, [value]);

  const handleFile = (file) => {
    if (file) onChange(file);
  };

  return (
    <Box>
      <Box
        onClick={() => ref.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
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
          transition: "border-color 0.15s, background-color 0.15s",
          position: "relative",
        }}
      >
        {previewSrc ? (
          /* Image preview */
          <Box
            component="img"
            src={previewSrc}
            alt="preview"
            sx={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : isPdfFile ? (
          /* PDF indicator */
          <Box sx={{ textAlign: "center" }}>
            <BadgeOutlined sx={{ color: "#1B3A6B", fontSize: 26 }} />
            <Typography
              sx={{
                fontSize: "0.68rem",
                color: "#1B3A6B",
                fontWeight: 600,
                mt: 0.3,
              }}
            >
              {value instanceof File
                ? value.name.substring(0, 22)
                : "PDF uploaded"}
            </Typography>
          </Box>
        ) : value && !isImageFile && !isPdfFile ? (
          /* Non-image non-pdf file name */
          <Box sx={{ textAlign: "center", px: 1 }}>
            <BadgeOutlined sx={{ color: "#1B3A6B", fontSize: 26 }} />
            <Typography
              sx={{
                fontSize: "0.68rem",
                color: "#1B3A6B",
                fontWeight: 600,
                mt: 0.3,
              }}
            >
              {value instanceof File
                ? value.name.substring(0, 22)
                : "File uploaded"}
            </Typography>
          </Box>
        ) : (
          /* Empty state */
          <Box sx={{ textAlign: "center" }}>
            {icon || (
              <CloudUpload
                sx={{ color: error ? "#DC2626" : "#9CA3AF", fontSize: 26 }}
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
            <Typography sx={{ fontSize: "0.62rem", color: "#C4B5BF", mt: 0.2 }}>
              Click or drag & drop
            </Typography>
          </Box>
        )}

        {/* Hidden input */}
        <input
          ref={ref}
          type="file"
          accept={accept}
          style={{ display: "none" }}
          /* Reset value so same file can be re-selected after clearing */
          onClick={(e) => {
            e.target.value = "";
          }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </Box>

      {/* Remove button */}
      {value && (
        <Button
          size="small"
          variant="text"
          onClick={(e) => {
            e.stopPropagation();
            onChange(null);
          }}
          sx={{
            mt: 0.3,
            fontSize: "0.68rem",
            color: "#DC2626",
            p: 0,
            minWidth: 0,
          }}
        >
          Remove
        </Button>
      )}

      {error && (
        <FormHelperText error sx={{ mx: "14px", mt: "3px" }}>
          {error}
        </FormHelperText>
      )}
    </Box>
  );
}

/* ─── Logo ─── */
function Logo() {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3 }}>
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: 2,
          background: "linear-gradient(135deg,#1B3A6B,#2952A3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Business sx={{ color: "#fff", fontSize: 24 }} />
      </Box>
      <Typography
        sx={{
          fontFamily: '"Sora",sans-serif',
          fontWeight: 800,
          fontSize: "1rem",
          color: "#1B3A6B",
        }}
      >
        PG MANAGER
      </Typography>
    </Box>
  );
}

/* ─── Main Page ─── */
export default function TenantInvitePage() {
  const [params] = useSearchParams();
  const token = params.get("token");

  const [invite, setInvite] = useState(null);
  const [tokenErr, setTokenErr] = useState("");
  const [validating, setValidating] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitErr, setSubmitErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const validated = useRef(false);

  /* ── Validate token once ── */
  useEffect(() => {
    if (validated.current) return;
    validated.current = true;
    if (!token) {
      setTokenErr(
        "Invalid invite link. Please ask your PG owner for a new link.",
      );
      setValidating(false);
      return;
    }
    authAPI
      .validateTenantInvite(token)
      .then((r) => {
        setInvite(r.data.invite);
        if (r.data.invite) {
          setForm((f) => ({
            ...f,
            name: r.data.invite.name || "",
            phone: r.data.invite.phone || "",
            email: r.data.invite.email || "",
          }));
        }
      })
      .catch((err) =>
        setTokenErr(
          err.response?.data?.message || "Invalid or expired invite link.",
        ),
      )
      .finally(() => setValidating(false));
  }, [token]);

  /* ── Set field value + live-validate if field was touched ── */
  const set = (field, value) => {
    setForm((prev) => {
      const updated = { ...prev, [field]: value };
      return updated;
    });
    // Always validate files immediately; for text fields only if touched
    if (
      field === "profile_photo_file" ||
      field === "id_proof_file" ||
      touched[field]
    ) {
      setFieldErrors((prev) => ({
        ...prev,
        [field]: validateField(field, value),
      }));
    }
    // Mark files as touched immediately
    if (field === "profile_photo_file" || field === "id_proof_file") {
      setTouched((prev) => ({ ...prev, [field]: true }));
    }
  };

  /* ── Blur handler for text fields ── */
  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setFieldErrors((prev) => ({
      ...prev,
      [field]: validateField(field, form[field]),
    }));
  };

  /* ── Submit ── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitErr("");

    // Validate all fields
    const allFields = Object.keys(EMPTY);
    const errors = {};
    allFields.forEach((field) => {
      const err = validateField(field, form[field]);
      if (err) errors[field] = err;
    });

    // Mark everything touched so errors show
    const allTouched = {};
    allFields.forEach((f) => (allTouched[f] = true));
    setTouched(allTouched);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setSubmitErr("Please fix the highlighted fields before submitting.");
      // Scroll to first error
      setTimeout(() => {
        const el = document.querySelector('[data-error="true"]');
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      return;
    }

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("token", token);
      Object.entries(form).forEach(([k, v]) => {
        if (k === "profile_photo_file" || k === "id_proof_file") return;
        if (v !== null && v !== undefined && v !== "") fd.append(k, v);
      });
      if (form.profile_photo_file instanceof File)
        fd.append("profile_photo", form.profile_photo_file);
      if (form.id_proof_file instanceof File)
        fd.append("id_proof", form.id_proof_file);

      await authAPI.submitTenantInvite(fd);
      setDone(true);
    } catch (err) {
      setSubmitErr(
        err.response?.data?.message || "Submission failed. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  /* ── Render ── */
  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "linear-gradient(135deg,#F5F6FA,#EEF2FF)",
        py: 4,
        px: 2,
      }}
    >
      <Box sx={{ maxWidth: 680, mx: "auto" }}>
        <Card
          sx={{ borderRadius: 3, boxShadow: "0 8px 32px rgba(27,58,107,0.12)" }}
        >
          <CardContent sx={{ p: 4 }}>
            <Logo />

            {/* Loading */}
            {validating && (
              <Box sx={{ textAlign: "center", py: 4 }}>
                <CircularProgress />
                <Typography sx={{ mt: 2, color: "#6B7280" }}>
                  Validating invite…
                </Typography>
              </Box>
            )}

            {/* Success */}
            {!validating && done && (
              <Box sx={{ textAlign: "center", py: 3 }}>
                <CheckCircle sx={{ fontSize: 64, color: "#059669", mb: 2 }} />
                <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>
                  Registration Complete!
                </Typography>
                <Typography sx={{ color: "#6B7280", fontSize: "0.95rem" }}>
                  Your details have been submitted. The PG manager will review
                  and assign your room soon.
                </Typography>
                <Box
                  sx={{
                    mt: 3,
                    p: 2.5,
                    bgcolor: "#F0FDF4",
                    borderRadius: 2,
                    border: "1px solid #BBF7D0",
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: "0.85rem",
                      color: "#166534",
                      fontWeight: 600,
                    }}
                  >
                    What happens next?
                  </Typography>
                  <Typography
                    sx={{ fontSize: "0.82rem", color: "#15803D", mt: 0.5 }}
                  >
                    The owner will review your details and assign a room. You'll
                    be notified once your accommodation is confirmed.
                  </Typography>
                </Box>
              </Box>
            )}

            {/* Token error */}
            {!validating && !done && tokenErr && (
              <Box sx={{ textAlign: "center", py: 3 }}>
                <ErrorOutline sx={{ fontSize: 52, color: "#DC2626", mb: 2 }} />
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                  Invalid Invite Link
                </Typography>
                <Typography sx={{ color: "#6B7280", mb: 2 }}>
                  {tokenErr}
                </Typography>
                <Typography sx={{ fontSize: "0.82rem", color: "#9CA3AF" }}>
                  Please contact your PG owner to send a new invite link.
                </Typography>
              </Box>
            )}

            {/* Form */}
            {!validating && !done && !tokenErr && invite && (
              <>
                <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>
                  PG Registration Form
                </Typography>
                <Typography
                  sx={{ color: "#6B7280", fontSize: "0.875rem", mb: 0.5 }}
                >
                  Please fill in your details accurately. Fields marked{" "}
                  <strong>*</strong> are required.
                </Typography>
                {invite.name && (
                  <Chip
                    label={`Invited as: ${invite.name}`}
                    size="small"
                    sx={{
                      mb: 2,
                      bgcolor: "#EEF2FF",
                      color: "#1B3A6B",
                      fontWeight: 700,
                    }}
                  />
                )}

                {submitErr && (
                  <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                    {submitErr}
                  </Alert>
                )}

                <Box component="form" onSubmit={handleSubmit} noValidate>
                  <Grid container spacing={2}>
                    {/* ── Photo & ID ── */}
                    <Section label="Photo & ID Proof" />

                    <Grid
                      item
                      xs={4}
                      data-error={!!fieldErrors.profile_photo_file || undefined}
                    >
                      <Typography
                        sx={{ fontSize: "0.78rem", fontWeight: 600, mb: 0.5 }}
                      >
                        Profile Photo *
                      </Typography>
                      <FileDropZone
                        label="JPG / PNG"
                        accept="image/*"
                        value={form.profile_photo_file}
                        onChange={(f) => set("profile_photo_file", f)}
                        icon={
                          <Person
                            sx={{
                              color: fieldErrors.profile_photo_file
                                ? "#DC2626"
                                : "#9CA3AF",
                              fontSize: 26,
                            }}
                          />
                        }
                        error={fieldErrors.profile_photo_file}
                      />
                    </Grid>

                    <Grid
                      item
                      xs={8}
                      data-error={!!fieldErrors.id_proof_file || undefined}
                    >
                      <Typography
                        sx={{ fontSize: "0.78rem", fontWeight: 600, mb: 0.5 }}
                      >
                        ID Proof * (PDF or Image)
                      </Typography>
                      <FileDropZone
                        label="PDF / JPG / PNG"
                        accept="image/*,.pdf"
                        value={form.id_proof_file}
                        onChange={(f) => set("id_proof_file", f)}
                        error={fieldErrors.id_proof_file}
                      />
                    </Grid>

                    <Grid item xs={12}>
                      <FormControl size="small" sx={{ minWidth: 220 }}>
                        <InputLabel>ID Type</InputLabel>
                        <Select
                          value={form.id_type}
                          label="ID Type"
                          onChange={(e) => set("id_type", e.target.value)}
                        >
                          {ID_TYPES.map((t) => (
                            <MenuItem key={t} value={t}>
                              {t}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>

                    {/* ── Personal Info ── */}
                    <Section label="Personal Information" />

                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        label="Full Name *"
                        size="small"
                        value={form.name}
                        onChange={(e) => set("name", e.target.value)}
                        onBlur={() => handleBlur("name")}
                        error={!!fieldErrors.name}
                        helperText={fieldErrors.name}
                        inputProps={{ maxLength: 100 }}
                      />
                    </Grid>

                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        label="Phone *"
                        size="small"
                        value={form.phone}
                        onChange={(e) => {
                          // Allow only digits, max 10
                          const v = e.target.value
                            .replace(/\D/g, "")
                            .slice(0, 10);
                          set("phone", v);
                        }}
                        onBlur={() => handleBlur("phone")}
                        error={!!fieldErrors.phone}
                        helperText={
                          fieldErrors.phone || "10-digit mobile number"
                        }
                        inputProps={{ inputMode: "numeric", maxLength: 10 }}
                      />
                    </Grid>

                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        label="Email"
                        size="small"
                        type="email"
                        value={form.email}
                        onChange={(e) => set("email", e.target.value)}
                        onBlur={() => handleBlur("email")}
                        error={!!fieldErrors.email}
                        helperText={fieldErrors.email || "Optional"}
                      />
                    </Grid>

                    <Grid item xs={6}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Gender</InputLabel>
                        <Select
                          value={form.gender}
                          label="Gender"
                          onChange={(e) => set("gender", e.target.value)}
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
                        label="Date of Birth *"
                        size="small"
                        type="date"
                        InputLabelProps={{ shrink: true }}
                        value={form.date_of_birth}
                        onChange={(e) => set("date_of_birth", e.target.value)}
                        onBlur={() => handleBlur("date_of_birth")}
                        error={!!fieldErrors.date_of_birth}
                        helperText={fieldErrors.date_of_birth}
                        inputProps={{ max: maxDob, min: minDob }}
                      />
                    </Grid>

                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        label="Occupation"
                        size="small"
                        value={form.occupation}
                        onChange={(e) => set("occupation", e.target.value)}
                        onBlur={() => handleBlur("occupation")}
                        helperText="Optional"
                      />
                    </Grid>

                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        label="Father's Name *"
                        size="small"
                        value={form.father_name}
                        onChange={(e) => set("father_name", e.target.value)}
                        onBlur={() => handleBlur("father_name")}
                        error={!!fieldErrors.father_name}
                        helperText={fieldErrors.father_name}
                        inputProps={{ maxLength: 100 }}
                      />
                    </Grid>

                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        label="Parent's Phone *"
                        size="small"
                        value={form.parent_phone}
                        onChange={(e) => {
                          const v = e.target.value
                            .replace(/\D/g, "")
                            .slice(0, 10);
                          set("parent_phone", v);
                        }}
                        onBlur={() => handleBlur("parent_phone")}
                        error={!!fieldErrors.parent_phone}
                        helperText={
                          fieldErrors.parent_phone || "10-digit number"
                        }
                        inputProps={{ inputMode: "numeric", maxLength: 10 }}
                      />
                    </Grid>

                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Permanent Address *"
                        size="small"
                        multiline
                        rows={2}
                        value={form.permanent_address}
                        onChange={(e) =>
                          set("permanent_address", e.target.value)
                        }
                        onBlur={() => handleBlur("permanent_address")}
                        error={!!fieldErrors.permanent_address}
                        helperText={
                          fieldErrors.permanent_address ||
                          `${form.permanent_address.length}/500`
                        }
                        inputProps={{ maxLength: 500 }}
                      />
                    </Grid>

                    {/* ── Emergency Contact ── */}
                    <Section label="Emergency Contact (Optional)" />

                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        label="Contact Name"
                        size="small"
                        value={form.emergency_contact_name}
                        onChange={(e) =>
                          set("emergency_contact_name", e.target.value)
                        }
                        onBlur={() => handleBlur("emergency_contact_name")}
                        helperText="Optional"
                        inputProps={{ maxLength: 100 }}
                      />
                    </Grid>

                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        label="Contact Phone"
                        size="small"
                        value={form.emergency_contact_phone}
                        onChange={(e) => {
                          const v = e.target.value
                            .replace(/\D/g, "")
                            .slice(0, 10);
                          set("emergency_contact_phone", v);
                        }}
                        onBlur={() => handleBlur("emergency_contact_phone")}
                        error={!!fieldErrors.emergency_contact_phone}
                        helperText={
                          fieldErrors.emergency_contact_phone || "Optional"
                        }
                        inputProps={{ inputMode: "numeric", maxLength: 10 }}
                      />
                    </Grid>
                  </Grid>

                  {/* ── Submit ── */}
                  <Box sx={{ mt: 3 }}>
                    {submitErr && (
                      <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                        {submitErr}
                      </Alert>
                    )}
                    <Button
                      fullWidth
                      type="submit"
                      variant="contained"
                      size="large"
                      disabled={saving}
                      sx={{ py: 1.5, borderRadius: 2.5, fontSize: "1rem" }}
                    >
                      {saving ? (
                        <CircularProgress size={24} color="inherit" />
                      ) : (
                        "Submit Registration"
                      )}
                    </Button>
                    <Typography
                      sx={{
                        textAlign: "center",
                        fontSize: "0.75rem",
                        color: "#9CA3AF",
                        mt: 1.5,
                      }}
                    >
                      Your data is stored securely and only shared with your PG
                      manager.
                    </Typography>
                  </Box>
                </Box>
              </>
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
