import { Navigate, Outlet } from "react-router-dom";
import { hasAdminSession } from "../lib/api";

export function AdminRoute() {
  if (!hasAdminSession()) {
    return <Navigate to="/admin/login" replace />;
  }

  return <Outlet />;
}
