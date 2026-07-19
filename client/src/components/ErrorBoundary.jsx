import { Component } from 'react';
import { reportCrash } from '../lib/crashReporter.js';

// Top-level safety net: a render crash anywhere in the tree used to unmount
// the whole app into a blank white page. This catches it, reports it, and
// gives the user a way back that doesn't involve guessing.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error) { reportCrash(error?.message || 'Render error', error?.stack); }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F6F5F1', padding: 24, fontFamily: 'inherit' }}>
        <div style={{ maxWidth: 420, background: '#fff', borderRadius: 16, boxShadow: '0 18px 50px rgba(10,14,26,0.10)', padding: '30px 32px', textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FFF0E9', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E0500F" strokeWidth="1.8" strokeLinecap="round"><path d="M12 8v5M12 16.5v.01"/><path d="M10.3 3.9 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
          </div>
          <h1 style={{ fontSize: 18, margin: '0 0 8px', color: '#14161C' }}>Something went wrong</h1>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#454852', margin: '0 0 18px' }}>
            This page hit an unexpected error. It has been reported to our team automatically — your data is safe on the server.
          </p>
          <button type="button" onClick={() => window.location.reload()}
            style={{ background: '#FF5B1F', border: 'none', borderRadius: 9, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', padding: '10px 22px', fontFamily: 'inherit' }}>
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}
