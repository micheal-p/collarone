import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { installCrashReporter } from './lib/crashReporter.js';
import { installStaleBuildRecovery, cleanRecoveryUrl } from './lib/staleBuild.js';
import App from './App.jsx';
import './styles/global.css';
import './styles/app.css';

// Order matters: catch stale-build failures before the crash reporter turns
// them into noise. They aren't bugs — they're a tab outliving its deploy.
installStaleBuildRecovery();
installCrashReporter();
// We got here, so this build's entry chunk loaded fine. This only tidies the
// cache-busting query out of the URL — it deliberately does NOT clear the
// one-reload guard, which is what turned this into a reload loop.
cleanRecoveryUrl();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
