import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import {
  ThemeProvider,
  CssBaseline,
  CircularProgress,
  Box,
} from "@mui/material";
import { AuthProvider, useAuth } from "./context/AuthContext";
import theme from "./theme";
import LoginPage from "./pages/auth/LoginPage";
import InviteRegisterPage from "./pages/auth/InviteRegisterPage";
import TenantInvitePage from "./pages/auth/TenantInvitePage";
import PGSelectPage from "./pages/auth/PGSelectPage";
import MasterLayout from "./pages/admin/MasterLayout";
import MasterDashboard from "./pages/admin/MasterDashboard";
import MasterOwners from "./pages/admin/MasterOwners";
import OwnerDetail from "./pages/admin/OwnerDetail";
import OwnerLayout from "./pages/owner/OwnerLayout";
import DashboardPage from "./pages/owner/DashboardPage";
import TenantsPage from "./pages/owner/TenantsPage";
import RoomsPage from "./pages/owner/RoomsPage";
import PaymentsPage from "./pages/owner/PaymentsPage";
import ExpensesPage from "./pages/owner/ExpensesPage";
import AdminPage from "./pages/owner/AdminPage";
import ListingsPage from "./pages/listing/ListingsPage";
import PGDetailPage from "./pages/listing/PGDetailPage";

const Loader = () => (
  <Box
    sx={{
      display: "flex",
      height: "100vh",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <CircularProgress />
  </Box>
);

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role))
    return <Navigate to="/" replace />;
  return children;
};

const RootRedirect = () => {
  const { user, loading, activePgId } = useAuth();
  if (loading) return <Loader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "master_admin") return <Navigate to="/admin" replace />;
  if (user.role === "owner") {
    if (!activePgId) return <Navigate to="/select-pg" replace />;
    return <Navigate to={`/pg/${activePgId}`} replace />;
  }
  if (user.pgId) return <Navigate to={`/pg/${user.pgId}`} replace />;
  return <Navigate to="/login" replace />;
};

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/invite/owner" element={<InviteRegisterPage />} />
            <Route path="/invite/tenant" element={<TenantInvitePage />} />
            <Route
              path="/select-pg"
              element={
                <ProtectedRoute allowedRoles={["owner"]}>
                  <PGSelectPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={["master_admin"]}>
                  <MasterLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<MasterDashboard />} />
              <Route path="owners" element={<MasterOwners />} />
              <Route path="owners/:id" element={<OwnerDetail />} />
            </Route>
            <Route
              path="/pg/:pgId"
              element={
                <ProtectedRoute allowedRoles={["owner", "manager", "staff"]}>
                  <OwnerLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="tenants" element={<TenantsPage />} />
              <Route path="rooms" element={<RoomsPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="expenses" element={<ExpensesPage />} />
              <Route path="admin" element={<AdminPage />} />
            </Route>
            <Route path="/listings" element={<ListingsPage />} />
            <Route path="/listings/:pgId" element={<PGDetailPage />} />
            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
