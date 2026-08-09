import { Navigate, Outlet, useLocation } from "react-router-dom";
import { BrandMark } from "./BrandMark";
import { useAuth } from "../lib/auth";
import {
  needsBiometricConfirm,
  needsBiometricSetup,
} from "../lib/biometric";

export function ProtectedRoute() {
  const { user, dek, ready } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="auth-layout">
        <div className="auth-card" style={{ textAlign: "center" }}>
          <div className="brand">
            <BrandMark />
            KeySafe
          </div>
          <p className="muted">Unlocking vault…</p>
        </div>
      </div>
    );
  }

  if (!user || !dek) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const onSetup = location.pathname === "/setup-biometric";

  // Pending = no biometric yet — onboarding only, never the vault.
  if (!user.biometric_enabled && !onSetup) {
    return <Navigate to="/setup-biometric" replace />;
  }

  // Active users must enroll this device or confirm biometrics this session.
  if (user.biometric_enabled && !onSetup) {
    if (needsBiometricSetup(user.id) || needsBiometricConfirm(user.id)) {
      return <Navigate to="/setup-biometric" replace />;
    }
  }

  return <Outlet />;
}
