import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getAuthToken } from "./auth";

export default function ProtectedRoute() {
  const location = useLocation();
  const token = getAuthToken();

  if (!token) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <Outlet />;
}