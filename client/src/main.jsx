import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider } from './auth/AuthContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { installCrashReporter } from './lib/crashReporter.js';
import { installStaleBuildRecovery, clearStaleBuildFlag } from './lib/staleBuild.js';
import App from './App.jsx';
import './styles/global.css';
import './styles/app.css';

// Order matters: catch stale-build failures before the crash reporter turns
// them into noise. They aren't bugs — they're a tab outliving its deploy.
installStaleBuildRecovery();
installCrashReporter();
// We got here, so this build's entry chunk loaded fine.
clearStaleBuildFlag();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
        <Analytics />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
