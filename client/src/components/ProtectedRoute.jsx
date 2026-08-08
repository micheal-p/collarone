import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

/** Gate any authenticated area. Optionally require the System-Admin role or platform-admin status. */
export default function ProtectedRoute({ children, requireAdmin = false, requirePlatformAdmin = false }) {
  const { user, booting } = useAuth();
  const loc = useLocation();

  if (booting) {
    return (
      <div className="full-center">
        <div className="boot-spinner" />
      </div>
    );
  }
  // The destination rides in ?next= (not only router state): Login's sandbox
  // purge does a full reload, and reloads wipe state — the URL survives.
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace state={{ from: loc.pathname }} />;
  if (user.mustChangePassword && loc.pathname !== '/change-password')
    return <Navigate to="/change-password" replace />;
  if (requireAdmin && user.role !== 'super_admin') return <Navigate to="/" replace />;
  if (requirePlatformAdmin && !user.isPlatformAdmin) return <Navigate to="/" replace />;

  return children;
}
