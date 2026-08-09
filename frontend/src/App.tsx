import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "./components/AdminLayout";
import { AdminRoute } from "./components/AdminRoute";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider, useAuth } from "./lib/auth";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { AdminLoginPage } from "./pages/AdminLoginPage";
import { AdminSecurityPage } from "./pages/AdminSecurityPage";
import { AdminUserDetailPage } from "./pages/AdminUserDetailPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { LoginHistoryPage } from "./pages/LoginHistoryPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SecurityPage } from "./pages/SecurityPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SetupBiometricPage } from "./pages/SetupBiometricPage";
import { TrashPage } from "./pages/TrashPage";
import { VaultPage } from "./pages/VaultPage";
import { Verify2FAPage } from "./pages/Verify2FAPage";

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, dek, ready } = useAuth();
  if (!ready) return null;
  if (user && dek) {
    return <Navigate to="/setup-biometric" replace />;
  }
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route
          path="/login"
          element={
            <PublicOnly>
              <LoginPage />
            </PublicOnly>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnly>
              <RegisterPage />
            </PublicOnly>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <PublicOnly>
              <ForgotPasswordPage />
            </PublicOnly>
          }
        />
        <Route path="/verify-2fa" element={<Verify2FAPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/setup-biometric" element={<SetupBiometricPage />} />
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="vault" element={<VaultPage />} />
            <Route path="trash" element={<TrashPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="security" element={<SecurityPage />} />
            <Route path="login-history" element={<LoginHistoryPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="users/:userId" element={<AdminUserDetailPage />} />
            <Route path="security" element={<AdminSecurityPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </AuthProvider>
  );
}
