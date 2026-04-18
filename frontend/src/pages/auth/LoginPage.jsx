import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
  CircularProgress,
  Divider,
} from "@mui/material";
import { Visibility, VisibilityOff, Business } from "@mui/icons-material";
import { useAuth } from "../../context/AuthContext";

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) {
    if (user.role === "master_admin") navigate("/admin", { replace: true });
    else navigate("/", { replace: true });
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login(form);
      if (result.requirePGSelect) {
        navigate("/select-pg", { replace: true });
        return;
      }
      if (result.user.role === "master_admin") {
        navigate("/admin", { replace: true });
        return;
      }
      const pgId = result.defaultPgId || result.user.pgId;
      if (pgId) navigate(`/pg/${pgId}`, { replace: true });
      else navigate("/select-pg", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  const demoAccounts = [
    {
      label: "Master Admin",
      email: "admin@pgplatform.com",
      pass: "admin123",
      color: "#DC2626",
    },
    {
      label: "Owner",
      email: "ravi@grandpg.com",
      pass: "owner123",
      color: "#1B3A6B",
    },
  ];

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(135deg, #0D1F3C 0%, #1B3A6B 50%, #2952A3 100%)",
        p: 2,
      }}
    >
      {/* Decorative circles */}
      {[280, 180, 120].map((s, i) => (
        <Box
          key={i}
          sx={{
            position: "absolute",
            width: s,
            height: s,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.07)",
            top: ["8%", "55%", "25%"][i],
            left: ["3%", "70%", "35%"][i],
            pointerEvents: "none",
          }}
        />
      ))}

      <Card
        sx={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 3,
          boxShadow: "0 32px 80px rgba(0,0,0,0.35)",
        }}
      >
        <CardContent sx={{ p: 4 }}>
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3.5 }}
          >
            <Box
              sx={{
                width: 46,
                height: 46,
                borderRadius: 2,
                background: "linear-gradient(135deg,#1B3A6B,#2952A3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Business sx={{ color: "#fff", fontSize: 24 }} />
            </Box>
            <Box>
              <Typography
                sx={{
                  fontFamily: '"Sora",sans-serif',
                  fontWeight: 800,
                  fontSize: "1rem",
                  color: "#1B3A6B",
                  lineHeight: 1.2,
                }}
              >
                PG MANAGER
              </Typography>
              <Typography
                sx={{
                  fontSize: "0.68rem",
                  color: "#9CA3AF",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Platform
              </Typography>
            </Box>
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>
            Sign in
          </Typography>
          <Typography sx={{ color: "#6B7280", fontSize: "0.875rem", mb: 3 }}>
            Continue to your dashboard
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email Address"
              type="email"
              size="small"
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
              sx={{ mb: 2 }}
              required
            />
            <TextField
              fullWidth
              label="Password"
              size="small"
              value={form.password}
              type={showPass ? "text" : "password"}
              onChange={(e) =>
                setForm((f) => ({ ...f, password: e.target.value }))
              }
              sx={{ mb: 3 }}
              required
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setShowPass(!showPass)}
                    >
                      {showPass ? <VisibilityOff /> : <Visibility />}
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
              disabled={loading}
              sx={{ py: 1.4, fontSize: "0.95rem", borderRadius: 2.5 }}
            >
              {loading ? (
                <CircularProgress size={22} color="inherit" />
              ) : (
                "Sign In"
              )}
            </Button>
          </Box>

          <Divider sx={{ my: 3 }}>
            <Typography sx={{ fontSize: "0.75rem", color: "#9CA3AF" }}>
              Demo Accounts
            </Typography>
          </Divider>

          <Box sx={{ display: "flex", gap: 1 }}>
            {demoAccounts.map((a) => (
              <Box
                key={a.label}
                onClick={() => setForm({ email: a.email, password: a.pass })}
                sx={{
                  flex: 1,
                  p: 1.5,
                  borderRadius: 2,
                  border: "1px solid #E5E7EB",
                  cursor: "pointer",
                  "&:hover": { borderColor: a.color, bgcolor: "#F9FAFB" },
                  transition: "all 0.15s",
                }}
              >
                <Typography
                  sx={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    color: a.color,
                    mb: 0.3,
                  }}
                >
                  {a.label}
                </Typography>
                <Typography sx={{ fontSize: "0.68rem", color: "#6B7280" }}>
                  {a.email}
                </Typography>
                <Typography sx={{ fontSize: "0.68rem", color: "#9CA3AF" }}>
                  {a.pass}
                </Typography>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
