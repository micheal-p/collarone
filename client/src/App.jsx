import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Landing from './pages/Landing.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import Launcher from './pages/Launcher.jsx';
import SuiteShell from './pages/SuiteShell.jsx';
import AdminUsers from './pages/admin/Users.jsx';
import AdminDepartments from './pages/admin/Departments.jsx';
import AdminBilling from './pages/admin/Billing.jsx';
import AdminWebsite from './pages/admin/website/WebsiteBuilder.jsx';
import PlatformAdmin from './pages/PlatformAdmin.jsx';
import PlatformAnalytics from './pages/PlatformAnalytics.jsx';
import PublicSite from './pages/site/PublicSite.jsx';
import Profile from './pages/Profile.jsx';
import CareersIndex from './pages/careers/CareersIndex.jsx';
import CareersApply from './pages/careers/CareersApply.jsx';
import Terms from './pages/Terms.jsx';
import Privacy from './pages/Privacy.jsx';
import Signup from './pages/Signup.jsx';
import Status from './pages/Status.jsx';
import EmbedContactForm from './pages/embed/EmbedContactForm.jsx';
import Help from './pages/Help.jsx';

// "/" is the public marketing page for a signed-out visitor, and the app
// launcher for a signed-in one — same route, different audience. A platform
// admin's default landing is Platform Admin, not any tenant's workspace —
// they're a different kind of account entirely, not "the founding org's
// admin who also happens to run the platform." /workspace is the conscious,
// explicit way to still reach the tenant view when they need it.
// One beacon per navigation, app-wide — powers the "page visitors" panel on
// Platform Admin's analytics page. No cookies, no ids; see api/track.js.
function usePageViewTracking() {
  const location = useLocation();
  useEffect(() => {
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: location.pathname }),
      keepalive: true,
    }).catch(() => {});
  }, [location.pathname]);
}

function HomeRoute() {
  const { user, booting } = useAuth();
  if (booting) {
    return (
      <div className="full-center">
        <div className="boot-spinner" />
      </div>
    );
  }
  if (!user) return <Landing />;
  if (user.isPlatformAdmin) return <Navigate to="/platform-admin" replace />;
  return (
    <ProtectedRoute>
      <Launcher />
    </ProtectedRoute>
  );
}

function WorkspaceRoute() {
  const { user } = useAuth();
  if (user?.isPlatformAdmin) return <Navigate to="/platform-admin" replace />;
  return <Launcher />;
}

export default function App() {
  usePageViewTracking();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/status" element={<Status />} />
      <Route path="/careers" element={<Navigate to="/careers/collarone" replace />} />
      <Route path="/careers/:orgSlug" element={<CareersIndex />} />
      <Route path="/careers/:orgSlug/:id" element={<CareersApply />} />
      <Route path="/site/:slug" element={<PublicSite />} />
      <Route path="/embed/contact/:orgSlug" element={<EmbedContactForm />} />

      <Route
        path="/change-password"
        element={
          <ProtectedRoute>
            <ChangePassword />
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<HomeRoute />} />

      {/* A platform admin has no organization workspace of their own — the
          only way into a tenant view is the audited guest mode, where the
          session belongs to that org's admin (so isPlatformAdmin is false). */}
      <Route
        path="/workspace"
        element={
          <ProtectedRoute>
            <WorkspaceRoute />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/users"
        element={
          <ProtectedRoute requireAdmin>
            <AdminUsers />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/departments"
        element={
          <ProtectedRoute requireAdmin>
            <AdminDepartments />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/billing"
        element={
          <ProtectedRoute requireAdmin>
            <AdminBilling />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/website"
        element={
          <ProtectedRoute requireAdmin>
            <AdminWebsite />
          </ProtectedRoute>
        }
      />

      <Route
        path="/platform-admin"
        element={
          <ProtectedRoute requirePlatformAdmin>
            <PlatformAdmin />
          </ProtectedRoute>
        }
      />

      <Route
        path="/platform-admin/analytics"
        element={
          <ProtectedRoute requirePlatformAdmin>
            <PlatformAnalytics />
          </ProtectedRoute>
        }
      />

      <Route
        path="/suite/:key"
        element={
          <ProtectedRoute>
            <SuiteShell />
          </ProtectedRoute>
        }
      />

      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />

      <Route
        path="/help"
        element={
          <ProtectedRoute>
            <Help />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
