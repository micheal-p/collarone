import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { api, apiPost, setAccessToken, onAuthExpired, bootSession, DEMO } from '../api/client.js';
import { applyOrgTheme, resetOrgTheme } from '../lib/theme.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  // signInWithPassword() (inside login()) fires the SAME auth-state-change
  // event this listener reacts to. Without this guard, both paths independently
  // fetch /me and race to call signOut() when an account/org is pending — the
  // listener's silent branch can win the race and clobber login()'s own error
  // message (same race applies to bootSession() vs. the listener's
  // INITIAL_SESSION branch on page reload). The explicit call owns the outcome
  // whenever one is in flight; the listener exists for the one path that never
  // goes through either — a fresh Azure OAuth redirect landing back in the app.
  const explicitAuthInFlight = useRef(false);

  // On first load, restore a session. In real (Supabase) mode we also subscribe to
  // auth changes so the Microsoft (Azure) OAuth redirect signs the user in when it lands.
  useEffect(() => {
    let unsub = () => {};
    (async () => {
      explicitAuthInFlight.current = true;
      try {
        const data = await bootSession();
        if (data) { setAccessToken(data.accessToken); setUser(data.user); applyOrgTheme(data.user?.org?.themeColor); }
      } catch { /* no session */ }
      finally { explicitAuthInFlight.current = false; setBooting(false); }
    })();

    if (!DEMO) {
      import('../lib/supabaseClient.js').then(({ supabase }) => {
        const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (explicitAuthInFlight.current) return;
          if (event === 'SIGNED_OUT' || !session) { setAccessToken(null); setUser(null); resetOrgTheme(); return; }
          if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            try {
              const { user: profile } = await api('/me');           // trigger created the profile on first login
              if (profile.status !== 'active' || profile.org?.status !== 'active') { await supabase.auth.signOut(); setUser(null); return; }
              setAccessToken(session.access_token);
              setUser(profile);
              applyOrgTheme(profile.org?.themeColor);
            } catch { /* no profile yet */ }
            finally { setBooting(false); }
          }
        });
        unsub = () => sub.subscription.unsubscribe();
      });
    }
    return () => unsub();
  }, []);

  // Forced sign-out when a refresh fails mid-session.
  useEffect(() => onAuthExpired(() => { setAccessToken(null); setUser(null); }), []);

  const login = useCallback(async (email, password) => {
    explicitAuthInFlight.current = true;
    try {
      const data = await apiPost('/auth/login', { email, password });
      // An explicit password login is never a guest session — a marker left
      // behind by an earlier guest-in must not attach (or its 1h hard expiry
      // would sign this real session out).
      try { localStorage.removeItem('collarone_guest_mode'); sessionStorage.removeItem('collarone_guest_mode'); } catch { /* no storage */ }
      setAccessToken(data.accessToken);
      setUser(data.user);
      applyOrgTheme(data.user?.org?.themeColor);
      return data.user;
    } finally {
      explicitAuthInFlight.current = false;
    }
  }, []);

  // Microsoft/Azure SSO removed from the UI for now (was never switched on
  // in Supabase anyway). The auth-state listener above still handles any
  // OAuth-style redirect landing, so re-adding a provider later is just a
  // button + signInWithOAuth call.

  const logout = useCallback(async () => {
    try { await apiPost('/auth/logout'); } catch { /* ignore */ }
    setAccessToken(null);
    setUser(null);
    resetOrgTheme();
  }, []);

  const refreshUser = useCallback(async () => {
    const data = await api('/me');
    setUser(data.user);
    applyOrgTheme(data.user?.org?.themeColor);
    return data.user;
  }, []);

  return (
    <AuthCtx.Provider value={{ user, setUser, booting, login, logout, refreshUser }}>
      {children}
    </AuthCtx.Provider>
  );
}
