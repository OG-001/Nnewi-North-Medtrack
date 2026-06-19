import { Navigate, Route, Routes } from "react-router-dom";
import { useSession } from "./lib/session";
import { AppShell } from "./components/AppShell";
import { FacilitySelectPage } from "./pages/FacilitySelect";
import { LoginPage } from "./pages/Login";
import { DashboardPage } from "./pages/Dashboard";
import { PatientsPage } from "./pages/Patients";
import { PatientDetailPage } from "./pages/PatientDetail";
import { QueuePage } from "./pages/Queue";
import { MaternalPage } from "./pages/Maternal";
import { ImmunizationPage } from "./pages/Immunization";
import { ReportsPage } from "./pages/Reports";
import { OversightPage } from "./pages/Oversight";
import { AdminPage } from "./pages/Admin";

export function App() {
  const { user, selectedFacilityId } = useSession();

  // 1. No facility chosen yet → the door screen (select your PHC).
  if (!selectedFacilityId) {
    return (
      <Routes>
        <Route path="*" element={<FacilitySelectPage />} />
      </Routes>
    );
  }

  // 2. Facility chosen but not signed in → facility-scoped sign-in.
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="patients" element={<PatientsPage />} />
        <Route path="patients/:id" element={<PatientDetailPage />} />
        <Route path="queue" element={<QueuePage />} />
        <Route path="maternal" element={<MaternalPage />} />
        <Route path="immunization" element={<ImmunizationPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="oversight" element={<OversightPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
