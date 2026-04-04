import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
} from "@mui/material";
import { Business, Add, KingBed, People } from "@mui/icons-material";
import { ownerAPI } from "../../services/api";
import { useAuth } from "../../context/AuthContext";

export default function PGSelectPage() {
  const { user, selectPG, logout } = useAuth();
  const navigate = useNavigate();
  const [pgs, setPgs] = useState([]);
  const [loading, setLoading] = useState(true);

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
                      {pg.city}{" "}
                      {pg.address && `· ${pg.address.substring(0, 30)}...`}
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

            <Grid item xs={12} sm={6}>
              <Card
                onClick={() => navigate("/select-pg?create=1")}
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
                  <Add sx={{ fontSize: 32, color: "#9CA3AF", mb: 1 }} />
                  <Typography sx={{ fontWeight: 600, color: "#6B7280" }}>
                    Add New PG
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
    </Box>
  );
}
