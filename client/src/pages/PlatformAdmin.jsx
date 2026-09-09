// Platform Control's working sections, one URL each: /platform-admin/<section>.
// The rail in PlatformShell links here. Overview, Analytics and Support are
// their own pages; the sections below are the ones you WORK in, each in its
// own file under pages/platform/.
import { lazy, Suspense } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import PlatformShell from '../components/PlatformShell.jsx';

const Organizations = lazy(() => import('./platform/Organizations.jsx'));
const Revenue = lazy(() => import('./platform/Revenue.jsx'));
const Inbox = lazy(() => import('./platform/Inbox.jsx'));
const Jobs = lazy(() => import('./platform/Jobs.jsx'));
const Themes = lazy(() => import('./platform/Themes.jsx'));
const Audit = lazy(() => import('./platform/Audit.jsx'));

// Title and subtitle feed the page head in the shell.
const SECTIONS = {
  organizations: { title: 'Organizations', sub: 'Every workspace on the platform. Check a suite, guest in with an audit trail, manage billing.', el: Organizations },
  revenue: { title: 'Revenue', sub: 'Payments awaiting confirmation, every transaction, the published price list and promo codes.', el: Revenue },
  inbox: { title: 'Inbox', sub: 'Messages and demo requests from the public site, and errors from real browsers.', el: Inbox },
  jobs: { title: 'Jobs board', sub: 'Companies that asked to post on the public jobs board, and whether they may.', el: Jobs },
  themes: { title: 'Website themes', sub: 'The catalog customers pick from in the website builder, and how many live or draft sites use each.', el: Themes },
  audit: { title: 'Audit log', sub: 'Every sensitive action taken from Platform Control, most recent first.', el: Audit },
};

export default function PlatformAdmin() {
  const { section } = useParams();
  const meta = SECTIONS[section];
  if (!meta) return <Navigate to="/platform-admin" replace />;
  const Section = meta.el;
  return (
    <PlatformShell title={meta.title} subtitle={meta.sub}>
      <Suspense fallback={<div className="pc-empty">Loading…</div>}>
        <Section />
      </Suspense>
    </PlatformShell>
  );
}
