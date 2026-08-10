import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Landing from './pages/Landing.jsx';

import { tenantSlug } from './lib/subdomain.js';

// ---------------------------------------------------------------------------
// Every page below is loaded ON DEMAND.
//
// They were all imported statically, so one 1.45MB JavaScript file had to
// arrive before anything rendered — and it contained the platform console, the
// website builder and every admin screen for a visitor who only wanted to read
// the landing page. On mobile data that is the difference between a site that
// feels instant and one that feels broken.
//
// Login and Landing stay eager: they are the first paint for the two audiences
// that actually arrive cold (a signed-out visitor and someone signing in), and
// putting a spinner in front of those would trade one delay for another.
// Everything else is reached by a deliberate click, where a brief load is
// invisible against the navigation itself.
// ---------------------------------------------------------------------------
const AdminBilling = lazy(() => import('./pages/admin/Billing.jsx'));
const AdminDepartments = lazy(() => import('./pages/admin/Departments.jsx'));
const AdminUsers = lazy(() => import('./pages/admin/Users.jsx'));
const AdminWebsite = lazy(() => import('./pages/admin/website/WebsiteBuilder.jsx'));
const CareersApply = lazy(() => import('./pages/careers/CareersApply.jsx'));
const CareersIndex = lazy(() => import('./pages/careers/CareersIndex.jsx'));
const ChangePassword = lazy(() => import('./pages/ChangePassword.jsx'));
const Contact = lazy(() => import('./pages/Contact.jsx'));
const DeviceGuide = lazy(() => import('./pages/DeviceGuide.jsx'));
const EmbedContactForm = lazy(() => import('./pages/embed/EmbedContactForm.jsx'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'));
const Help = lazy(() => import('./pages/Help.jsx'));
const JobShare = lazy(() => import('./pages/careers/JobShare.jsx'));
const JobsBoard = lazy(() => import('./pages/careers/JobsBoard.jsx'));
const Launcher = lazy(() => import('./pages/Launcher.jsx'));
const OfferPage = lazy(() => import('./pages/OfferPage.jsx'));
const PayThanks = lazy(() => import('./pages/PayThanks.jsx'));
const PlatformAdmin = lazy(() => import('./pages/PlatformAdmin.jsx'));
const PlatformAnalytics = lazy(() => import('./pages/PlatformAnalytics.jsx'));
const PlatformSupport = lazy(() => import('./pages/PlatformSupport.jsx'));
const PostJob = lazy(() => import('./pages/careers/PostJob.jsx'));
const Privacy = lazy(() => import('./pages/Privacy.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const PublicInvoice = lazy(() => import('./pages/PublicInvoice.jsx'));
const PublicSite = lazy(() => import('./pages/site/PublicSite.jsx'));
const PublicThemes = lazy(() => import('./pages/PublicThemes.jsx'));
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'));
const Signup = lazy(() => import('./pages/Signup.jsx'));
const Status = lazy(() => import('./pages/Status.jsx'));
const SuiteShell = lazy(() => import('./pages/SuiteShell.jsx'));
const Support = lazy(() => import('./pages/Support.jsx'));
const TeamChat = lazy(() => import('./pages/TeamChat.jsx'));
const Terms = lazy(() => import('./pages/Terms.jsx'));
const TryChooser = lazy(() => import('./pages/TryChooser.jsx'));
const TryDemo = lazy(() => import('./pages/TryDemo.jsx'));

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
    // the operator's own control-plane browsing is not visitor insight
    if (location.pathname.startsWith('/platform-admin')) return;
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
  // The founding org's admin account is also the platform admin, so guesting
  // into Collarone itself lands here still flagged isPlatformAdmin — the
  // guest marker (set only by the audited guest-in flow; localStorage, same
  // home as the auth session itself) is what distinguishes "deliberately
  // testing a tenant view" from wandering in.
  let guesting = false;
  try { guesting = Boolean(localStorage.getItem('collarone_guest_mode') || sessionStorage.getItem('collarone_guest_mode')); } catch { /* no storage */ }
  if (user?.isPlatformAdmin && !guesting) return <Navigate to="/platform-admin" replace />;
  return <Launcher />;
}

// Shown while a route's code arrives. Deliberately understated: a big spinner
// flashing between two screens reads like the app restarted. A calm centred
// mark for the fraction of a second a chunk takes on a decent connection, and
// something honest to look at on a slow one.
function PageLoading() {
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }} aria-live="polite" aria-busy="true">
      <span className="boot-spinner" />
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Loading</span>
    </div>
  );
}

export default function App() {
  usePageViewTracking();
  // On a tenant subdomain (acme.collarone.app) the whole host IS that
  // customer's published site — render it for every path.
  const siteSlug = tenantSlug();
  // PublicSite is lazy too, and it renders OUTSIDE <Routes> — so it needs its
  // own boundary. Without one this path throws "A component suspended while
  // responding to synchronous input", and every tenant's published site is a
  // blank page. The one place a missed Suspense would have cost customers
  // their websites rather than merely showing a spinner.
  if (siteSlug) {
    return (
      <Suspense fallback={<PageLoading />}>
        <PublicSite slugProp={siteSlug} />
      </Suspense>
    );
  }
  return (
    <>
    <TitleManager />
    <Suspense fallback={<PageLoading />}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/docs/connect-device" element={<DeviceGuide />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/status" element={<Status />} />
      <Route path="/themes" element={<PublicThemes />} />
      <Route path="/jobs" element={<JobsBoard />} />
      <Route path="/jobs/post" element={<PostJob />} />
      <Route path="/jobs/:slug" element={<JobShare />} />
      <Route path="/careers" element={<Navigate to="/jobs" replace />} />
      <Route path="/offer/:token" element={<OfferPage />} />
      <Route path="/pay/thanks" element={<PayThanks />} />
      <Route path="/careers/:orgSlug" element={<CareersIndex />} />
      <Route path="/careers/:orgSlug/:id" element={<CareersApply />} />
      <Route path="/site/:slug" element={<PublicSite />} />
      <Route path="/inv/:token" element={<PublicInvoice />} />
      <Route path="/try" element={<TryChooser />} />
      <Route path="/try/:suiteKey" element={<TryDemo />} />
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

      <Route
        path="/chat"
        element={
          <ProtectedRoute>
            <TeamChat />
          </ProtectedRoute>
        }
      />

      {/* A platform admin has no organization workspace of their own, the
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
        path="/platform-admin/support"
        element={
          <ProtectedRoute requirePlatformAdmin>
            <PlatformSupport />
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
        path="/support"
        element={
          <ProtectedRoute>
            <Support />
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
    </Suspense>
    </>
  );
}

// [Audit 14] The SPA never updated document.title, so every tab — sign-in,
// suites, Platform Control — wore the full marketing SEO sentence and phones
// showed indistinguishable "Collarone: HR, Pay…" tabs. First match wins.
const ROUTE_TITLES = [
  ['/login', 'Sign in'], ['/signup', 'Create your workspace'],
  ['/forgot-password', 'Reset password'], ['/reset-password', 'Reset password'],
  ['/change-password', 'Change password'], ['/status', 'System status'],
  ['/support', 'Contact support'], ['/help', 'How to use Collarone'],
  ['/profile', 'My profile'], ['/workspace', 'Workspace'],
  ['/platform-admin', 'Platform Control'], ['/admin', 'Admin Center'],
  ['/suite', 'Workspace'], ['/chat', 'Team Chat'],
  ['/jobs', 'Jobs board'], ['/careers', 'Careers'],
  ['/docs/connect-device', 'Connect a clocking device'], ['/try', 'Live demo'],
  ['/themes', 'Website themes'], ['/terms', 'Terms'], ['/privacy', 'Privacy'],
  ['/contact', 'Contact'],
];
const MARKETING_TITLE = 'Collarone: HR, Payroll, CRM & Business Software for Nigerian Companies';
function TitleManager() {
  const { pathname } = useLocation();
  useEffect(() => {
    const hit = ROUTE_TITLES.find(([p]) => pathname === p || pathname.startsWith(`${p}/`));
    document.title = hit ? `${hit[1]} — Collarone` : MARKETING_TITLE;
  }, [pathname]);
  return null;
}
