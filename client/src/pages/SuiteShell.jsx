import { useEffect, useState, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet } from '../api/client.js';
import { SUITE_META } from '../config/suites.js';
import AppLayout from '../components/AppLayout.jsx';
import SuiteIcon from '../components/SuiteIcon.jsx';
// Each suite is its own lazy chunk: opening HR downloads only HR's code, not
// all 16 suites. This is the bulk of what used to sit in the initial bundle.
const HRApp         = lazy(() => import('../suites/hr/HRApp.jsx'));
const LeaveApp      = lazy(() => import('../suites/leave/LeaveApp.jsx'));
const TasksApp      = lazy(() => import('../suites/tasks/TasksApp.jsx'));
const VisitorsApp   = lazy(() => import('../suites/visitors/VisitorsApp.jsx'));
const PayrollApp    = lazy(() => import('../suites/payroll/PayrollApp.jsx'));
const CRMApp        = lazy(() => import('../suites/crm/CRMApp.jsx'));
const AttendanceApp = lazy(() => import('../suites/attendance/AttendanceApp.jsx'));
const BenefitsApp   = lazy(() => import('../suites/benefits/BenefitsApp.jsx'));
const ProcurementApp= lazy(() => import('../suites/procurement/ProcurementApp.jsx'));
const InventoryApp  = lazy(() => import('../suites/inventory/InventoryApp.jsx'));
const FinanceApp    = lazy(() => import('../suites/finance/FinanceApp.jsx'));
const ProjectsApp   = lazy(() => import('../suites/projects/ProjectsApp.jsx'));
const DocumentsApp  = lazy(() => import('../suites/documents/DocumentsApp.jsx'));
const TradeDocsApp  = lazy(() => import('../suites/tradeDocs/TradeDocsApp.jsx'));
const AutomationApp = lazy(() => import('../suites/automation/AutomationApp.jsx'));
const ComplianceApp = lazy(() => import('../suites/compliance/ComplianceApp.jsx'));

// Suites that have a real app built. Others fall back to the "foundation ready" stub.
const SUITE_APPS = { hr: HRApp, leave: LeaveApp, tasks: TasksApp, visitors: VisitorsApp, payroll: PayrollApp, crm: CRMApp, attendance: AttendanceApp, benefits: BenefitsApp, 'it-assets': InventoryApp, /* merged into Inventory & Assets */ procurement: ProcurementApp, inventory: InventoryApp, finance: FinanceApp, projects: ProjectsApp, documents: DocumentsApp, 'trade-docs': TradeDocsApp, automation: AutomationApp, compliance: ComplianceApp };

export default function SuiteShell() {
  const { key } = useParams();
  const nav = useNavigate();
  const [state, setState] = useState({ loading: true, suite: null, access: null, error: null });

  useEffect(() => {
    setState({ loading: true, suite: null, access: null, error: null });
    apiGet(`/suites/${key}`)
      .then((d) => setState({ loading: false, suite: d.suite, access: d.access, error: null }))
      .catch((e) => setState({ loading: false, suite: null, access: null, error: e }));
  }, [key]);

  const meta = SUITE_META[key] || {};
  const { loading, suite, access, error } = state;
  const crumb = [{ label: 'Home', to: '/' }, { label: suite?.name || 'Suite' }];

  return (
    <AppLayout breadcrumb={crumb}>
      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}

      {!loading && error && (
        <div className="denied">
          <span className="denied-icon"><SuiteIcon name="lock" size={34} color="var(--brand)" /></span>
          <h1>{error.status === 403 ? 'Access not granted' : 'Could not open suite'}</h1>
          <p>
            {error.status === 403
              ? 'Your account has not been granted access to this suite. Contact your System Administrator to request it.'
              : error.message}
          </p>
          <button className="btn btn-ghost" onClick={() => nav('/')}>Back to Home</button>
        </div>
      )}

      {!loading && suite && (
        <>
          <header className="suite-head">
            <span className="suite-head-icon" style={{ background: meta.tint || 'var(--brand)' }}>
              <SuiteIcon name={meta.icon || 'grid'} size={30} color="#fff" />
            </span>
            <div>
              <h1 style={{ margin: 0 }}>{suite.name}</h1>
              <p>{suite.desc}</p>
            </div>
            <span className={`role-pill role-${['manager','receptionist','security','management'].includes(access?.role) ? 'manager' : 'staff'}`}>
              {{ manager:'Manager view', member:'Member view', receptionist:'Receptionist', security:'Security', management:'Management', staff:'Staff' }[access?.role] || 'Member view'}
            </span>
          </header>

          {(() => {
            const App = SUITE_APPS[key];
            if (App) return (
              <Suspense fallback={<div className="full-center" style={{ minHeight: 240 }}><div className="boot-spinner" /></div>}>
                <App access={access} suite={suite} />
              </Suspense>
            );
            return (
              <section className="suite-canvas">
                <div className="suite-canvas-inner">
                  <SuiteIcon name={meta.icon || 'grid'} size={40} color={meta.tint || 'var(--brand)'} />
                  <h2>{suite.name} workspace</h2>
                  <p>Access confirmed. This suite is wired into the platform shell — its screens (records, workflows and reports) plug in here next.</p>
                  <span className="badge badge-core">Foundation ready</span>
                </div>
              </section>
            );
          })()}
        </>
      )}
    </AppLayout>
  );
}
