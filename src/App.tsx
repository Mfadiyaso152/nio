import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { testConnection } from './firebase';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { AdminEventsHomePage } from './pages/AdminEventsHomePage';
import { AdminEventWorkspacePage } from './pages/AdminEventWorkspacePage';
import { GuestInvitationPage } from './pages/GuestInvitationPage';
import { HostReportPage } from './pages/HostReportPage';

export default function App() {
  useEffect(() => {
    void testConnection();
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin" element={<AdminEventsHomePage />} />
          <Route path="/admin/event/:eventSlug" element={<AdminEventWorkspacePage />} />
          <Route path="/invite/:inviteToken" element={<GuestInvitationPage />} />
          <Route path="/report/:shareToken" element={<HostReportPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
