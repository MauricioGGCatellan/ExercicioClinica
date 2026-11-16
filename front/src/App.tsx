import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import HomePage from "./HomePage";
import LoginPage from "./LoginPage";
import ProtectedRoute from "./ProtectedRoute";
import SchedulePage from "./SchedulePage";
import ReportPage from "./ReportPage";
import SiteLayout from "./SiteLayout";

export default function App() {
  return (
    <BrowserRouter>
      <SiteLayout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/agendamentos" element={<SchedulePage />} />
            <Route path="/laudos" element={<ReportPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SiteLayout>
    </BrowserRouter>
  );
}