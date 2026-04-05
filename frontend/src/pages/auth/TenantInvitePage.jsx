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

const PHONE_REGEX = /^[6-9]\d{9}$/;

const validateField = (field, value, form = {}) => {
  switch (field) {
    case "profile_photo_file":
      if (!value) return "Profile photo is required";
      return "";

    case "id_proof_file":
      if (!value) return "ID proof is required";
      return "";

    case "name":
      if (!value?.trim()) return "Full name is required";
      if (value.length < 2) return "Minimum 2 characters";
      return "";

    case "phone":
      if (!value) return "Phone is required";
      if (!PHONE_REGEX.test(value)) return "Invalid phone number";
      return "";

    case "date_of_birth":
      if (!value) return "DOB is required";
      return "";

    case "father_name":
      if (!value?.trim()) return "Father name required";
      return "";

    case "parent_phone":
      if (!value) return "Parent phone required";
      if (!PHONE_REGEX.test(value)) return "Invalid phone";
      return "";

    case "permanent_address":
      if (!value?.trim()) return "Address required";
      if (value.length < 10) return "Enter full address";
      return "";

    default:
      return "";
  }
};

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

export default function TenantInvitePage() {
  const [params] = useSearchParams();
  const token = params.get("token");

  const [invite, setInvite] = useState(null);
  const [tokenErr, setTokenErr] = useState("");
  const [validating, setValidating] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [submitErr, setSubmitErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const validated = useRef(false);

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
        // Pre-fill name/phone from invite
        if (r.data.invite?.name)
          setForm((f) => ({
            ...f,
            name: r.data.invite.name || "",
            phone: r.data.invite.phone || "",
            email: r.data.invite.email || "",
          }));
      })
      .catch((err) =>
        setTokenErr(
          err.response?.data?.message || "Invalid or expired invite link.",
        ),
      )
      .finally(() => setValidating(false));
  }, [token]);

  const set = (k, v) => {
    setForm((f) => {
      const updated = { ...f, [k]: v };

      if (fieldErrors[k]) {
        setFieldErrors((prev) => ({
          ...prev,
          [k]: validateField(k, v, updated),
        }));
      }

      return updated;
    });
  };

  const handleBlur = (field) => {
    setTouched((t) => ({ ...t, [field]: true }));

    setFieldErrors((prev) => ({
      ...prev,
      [field]: validateField(field, form[field], form),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitErr("");
    const errors = {};
    [
      "profile_photo_file",
      "id_proof_file",
      "name",
      "phone",
      "date_of_birth",
      "father_name",
      "parent_phone",
      "permanent_address",
    ].forEach((field) => {
      const err = validateField(field, form[field], form);
      if (err) errors[field] = err;
    });

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setSubmitErr("Please fix all required fields");
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("token", token);
      Object.entries(form).forEach(([k, v]) => {
        if (k === "profile_photo_file" || k === "id_proof_file") return;
        if (v) fd.append(k, v);
      });
      if (form.profile_photo_file)
        fd.append("profile_photo", form.profile_photo_file);
      if (form.id_proof_file) fd.append("id_proof", form.id_proof_file);
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

  const Logo = () => (
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
                  Validating invite...
                </Typography>
              </Box>
            )}

            {/* Done */}
            {!validating && done && (
              <Box sx={{ textAlign: "center", py: 3 }}>
                <CheckCircle sx={{ fontSize: 64, color: "#059669", mb: 2 }} />
                <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>
                  Registration Complete!
                </Typography>
                <Typography sx={{ color: "#6B7280", fontSize: "0.95rem" }}>
                  Your details have been submitted successfully. The PG manager
                  will review and assign your room soon.
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

            {/* Registration form */}
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

                <Box component="form" onSubmit={handleSubmit}>
                  <Grid container spacing={2}>
                    <Section label="Photo & ID Proof" />
                    <Grid item xs={4}>
                      <Typography
                        sx={{ fontSize: "0.78rem", fontWeight: 600, mb: 0.5 }}
                      >
                        Profile Photo
                      </Typography>
                      <FileDropZone
                        label="Upload"
                        accept="image/*"
                        value={form.profile_photo_file || form.profile_photo}
                        onChange={(f) => onFileChange("profile_photo_file", f)}
                        icon={
                          <Person
                            sx={{
                              color: fieldErrors.profile_photo_file
                                ? "#DC2626"
                                : "#9CA3AF",
                              fontSize: 24,
                            }}
                          />
                        }
                        error={fieldErrors.profile_photo_file}
                      />
                    </Grid>
                    <Grid item xs={8}>
                      <Typography
                        sx={{ fontSize: "0.78rem", fontWeight: 600, mb: 0.5 }}
                      >
                        ID Proof (PDF or Image)
                      </Typography>
                      <FileDropZone
                        label="PDF or Image"
                        accept="image/*,.pdf"
                        value={form.id_proof_file || form.id_proof}
                        onChange={(f) => onFileChange("id_proof_file", f)}
                        error={fieldErrors.id_proof_file}
                      />
                    </Grid>
                    <Grid item xs={8}>
                      <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                        <FormControl size="small" sx={{ minWidth: 250 }}>
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
                      </Box>
                    </Grid>

                    <Section label="Personal Information" />
                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        label="Full Name *"
                        size="small"
                        value={form.name}
                        onChange={(e) => set("name", e.target.value)}
                        error={!!fieldErrors.name}
                        helperText={fieldErrors.name}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        label="Phone *"
                        size="small"
                        value={form.phone}
                        onChange={(e) => set("phone", e.target.value)}
                        error={!!fieldErrors.phone}
                        helperText={fieldErrors.phone}
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
                        error={!!fieldErrors.email}
                        helperText={fieldErrors.email}
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
                        label="Date of Birth"
                        size="small"
                        type="date"
                        InputLabelProps={{ shrink: true }}
                        value={form.date_of_birth}
                        onChange={(e) => set("date_of_birth", e.target.value)}
                        error={!!fieldErrors.date_of_birth}
                        helperText={fieldErrors.date_of_birth}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        label="Occupation"
                        size="small"
                        value={form.occupation}
                        onChange={(e) => set("occupation", e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        label="Father's Name"
                        size="small"
                        value={form.father_name}
                        onChange={(e) => set("father_name", e.target.value)}
                        error={!!fieldErrors.father_name}
                        helperText={fieldErrors.father_name}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        label="Parent's Phone"
                        size="small"
                        value={form.parent_phone}
                        onChange={(e) => set("parent_phone", e.target.value)}
                        error={!!fieldErrors.parent_phone}
                        helperText={fieldErrors.parent_phone}
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
                        error={!!fieldErrors.permanent_address}
                        helperText={fieldErrors.permanent_address}
                      />
                    </Grid>

                    <Section label="Emergency Contact" />
                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        label="Contact Name"
                        size="small"
                        value={form.emergency_contact_name}
                        onChange={(e) =>
                          set("emergency_contact_name", e.target.value)
                        }
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        label="Contact Phone"
                        size="small"
                        value={form.emergency_contact_phone}
                        onChange={(e) =>
                          set("emergency_contact_phone", e.target.value)
                        }
                      />
                    </Grid>
                  </Grid>

                  <Box sx={{ mt: 3 }}>
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
