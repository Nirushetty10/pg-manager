import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
  Divider,
} from "@mui/material";
import {
  Business,
  Visibility,
  VisibilityOff,
  CheckCircle,
  ErrorOutline,
  Login,
} from "@mui/icons-material";
import { authAPI } from "../../services/api";

export default function InviteRegisterPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");

  // Separate states for validation vs submission errors
  const [invite, setInvite] = useState(null);
  const [tokenError, setTokenError] = useState(""); // shown when token is invalid (replaces form)
  const [tokenCode, setTokenCode] = useState(""); // 'ALREADY_USED' | 'INVALID'
  const [submitError, setSubmitError] = useState(""); // shown inside form after failed submit
  const [validating, setValidating] = useState(true);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // Prevent double-invocation in React StrictMode
  const validated = useRef(false);

  useEffect(() => {
    if (validated.current) return;
    validated.current = true;

    if (!token) {
      setTokenError(
        "No invite token found in the link. Please use the full invite URL.",
      );
      setTokenCode("INVALID");
      setValidating(false);
      return;
    }

    authAPI
      .validateInvite(token)
      .then((r) => {
        setInvite(r.data.invite);
      })
      .catch((err) => {
        const msg =
          err.response?.data?.message || "Invalid or expired invite link.";
        const code = err.response?.data?.code || "INVALID";
        setTokenError(msg);
        setTokenCode(code);
      })
      .finally(() => setValidating(false));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");

    if (password.length < 6)
      return setSubmitError("Password must be at least 6 characters");
    if (password !== confirm) return setSubmitError("Passwords do not match");

    setSaving(true);
    try {
      if (invite.type === "tenant")
        await authAPI.registerTenant({ token, password });
      else await authAPI.registerOwner({ token, password });
      setDone(true);
      setTimeout(() => navigate("/login", { replace: true }), 3000);
    } catch (err) {
      const msg =
        err.response?.data?.message || "Registration failed. Please try again.";
      const code = err.response?.data?.code;

      // If server says already used/registered, treat as token error (not submit error)
      if (code === "ALREADY_USED" || code === "ALREADY_REGISTERED") {
        setTokenError(msg);
        setTokenCode(code);
      } else {
        setSubmitError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const Logo = () => (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3.5 }}>
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
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(135deg,#0D1F3C 0%,#1B3A6B 60%,#2952A3 100%)",
        p: 2,
      }}
    >
      <Card
        sx={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 3,
          boxShadow: "0 32px 80px rgba(0,0,0,0.35)",
        }}
      >
        <CardContent sx={{ p: 4 }}>
          <Logo />

          {/* ── Loading ── */}
          {validating && (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <CircularProgress sx={{ mb: 2 }} />
              <Typography sx={{ color: "#6B7280", fontSize: "0.875rem" }}>
                Validating your invite link...
              </Typography>
            </Box>
          )}

          {/* ── Done ── */}
          {!validating && done && (
            <Box sx={{ textAlign: "center", py: 2 }}>
              <CheckCircle sx={{ fontSize: 56, color: "#059669", mb: 2 }} />
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                Account Created!
              </Typography>
              <Typography
                sx={{ color: "#6B7280", fontSize: "0.875rem", mb: 2 }}
              >
                Welcome, {invite?.name}! You can now log in.
              </Typography>
              <Typography sx={{ fontSize: "0.78rem", color: "#9CA3AF" }}>
                Redirecting to login in 3 seconds...
              </Typography>
              <Button
                variant="contained"
                fullWidth
                sx={{ mt: 3, borderRadius: 2.5 }}
                onClick={() => navigate("/login", { replace: true })}
              >
                Go to Login Now
              </Button>
            </Box>
          )}

          {/* ── Token error (invalid / already used) ── */}
          {!validating && !done && tokenError && (
            <Box sx={{ textAlign: "center", py: 2 }}>
              <ErrorOutline
                sx={{
                  fontSize: 52,
                  color:
                    tokenCode === "ALREADY_USED" ||
                    tokenCode === "ALREADY_REGISTERED"
                      ? "#D97706"
                      : "#DC2626",
                  mb: 2,
                }}
              />
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                {tokenCode === "ALREADY_USED" ||
                tokenCode === "ALREADY_REGISTERED"
                  ? "Already Registered"
                  : "Invalid Invite Link"}
              </Typography>
              <Typography
                sx={{ color: "#6B7280", fontSize: "0.875rem", mb: 3 }}
              >
                {tokenError}
              </Typography>
              {(tokenCode === "ALREADY_USED" ||
                tokenCode === "ALREADY_REGISTERED") && (
                <Button
                  variant="contained"
                  fullWidth
                  startIcon={<Login />}
                  sx={{ borderRadius: 2.5 }}
                  onClick={() => navigate("/login")}
                >
                  Go to Login
                </Button>
              )}
              <Divider sx={{ my: 2 }} />
              <Typography sx={{ fontSize: "0.78rem", color: "#9CA3AF" }}>
                If this is unexpected, please contact your PG manager to resend
                the invite.
              </Typography>
            </Box>
          )}

          {/* ── Registration form ── */}
          {!validating && !done && !tokenError && invite && (
            <>
              <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>
                Create your account
              </Typography>
              <Typography
                sx={{ color: "#6B7280", fontSize: "0.875rem", mb: 3 }}
              >
                Welcome, <strong>{invite.name}</strong>! Set a password to get
                started.
              </Typography>

              {submitError && (
                <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                  {submitError}
                </Alert>
              )}

              <Box component="form" onSubmit={handleSubmit}>
                {/* Email (read-only) */}
                <TextField
                  fullWidth
                  label="Email"
                  size="small"
                  value={invite?.email || ""}
                  disabled
                  sx={{ mb: 2 }}
                  InputProps={{
                    sx: { bgcolor: "#F9FAFB", color: "#6B7280" },
                  }}
                />

                {/* Password */}
                <TextField
                  fullWidth
                  label="Password *"
                  size="small"
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  sx={{ mb: 2 }}
                  required
                  helperText="Minimum 6 characters"
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          onClick={() => setShowPass(!showPass)}
                        >
                          {showPass ? (
                            <VisibilityOff fontSize="small" />
                          ) : (
                            <Visibility fontSize="small" />
                          )}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />

                {/* Confirm Password */}
                <TextField
                  fullWidth
                  label="Confirm Password *"
                  size="small"
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  sx={{ mb: 3 }}
                  required
                  error={confirm.length > 0 && password !== confirm}
                  helperText={
                    confirm.length > 0 && password !== confirm
                      ? "Passwords do not match"
                      : ""
                  }
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          onClick={() => setShowConfirm(!showConfirm)}
                        >
                          {showConfirm ? (
                            <VisibilityOff fontSize="small" />
                          ) : (
                            <Visibility fontSize="small" />
                          )}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />

                <Button
                  fullWidth
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={
                    saving || (confirm.length > 0 && password !== confirm)
                  }
                  sx={{ py: 1.5, borderRadius: 2.5, fontSize: "0.95rem" }}
                >
                  {saving ? (
                    <CircularProgress size={22} color="inherit" />
                  ) : (
                    "Create Account"
                  )}
                </Button>
              </Box>

              <Divider sx={{ my: 2.5 }} />
              <Typography
                sx={{
                  textAlign: "center",
                  fontSize: "0.82rem",
                  color: "#6B7280",
                }}
              >
                Already have an account?{" "}
                <Box
                  component="span"
                  onClick={() => navigate("/login")}
                  sx={{
                    color: "#1B3A6B",
                    fontWeight: 700,
                    cursor: "pointer",
                    "&:hover": { textDecoration: "underline" },
                  }}
                >
                  Sign in
                </Box>
              </Typography>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
