import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Landing from './pages/Landing.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import Launcher from './pages/Launcher.jsx';
import SuiteShell from './pages/SuiteShell.jsx';
import AdminUsers from './pages/admin/Users.jsx';
import AdminDepartments from './pages/admin/Departments.jsx';
import Profile from './pages/Profile.jsx';
import CareersIndex from './pages/careers/CareersIndex.jsx';
import CareersApply from './pages/careers/CareersApply.jsx';

// "/" is the public marketing page for a signed-out visitor, and the app
// launcher for a signed-in one — same route, different audience.
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
  return (
    <ProtectedRoute>
      <Launcher />
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/careers" element={<CareersIndex />} />
      <Route path="/careers/:id" element={<CareersApply />} />

      <Route
        path="/change-password"
        element={
          <ProtectedRoute>
            <ChangePassword />
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<HomeRoute />} />

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

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
