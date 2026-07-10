import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, apiPost, setAccessToken, onAuthExpired, bootSession, DEMO } from '../api/client.js';
import { applyOrgTheme, resetOrgTheme } from '../lib/theme.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  // On first load, restore a session. In real (Supabase) mode we also subscribe to
  // auth changes so the Microsoft (Azure) OAuth redirect signs the user in when it lands.
  useEffect(() => {
    let unsub = () => {};
    (async () => {
      try {
        const data = await bootSession();
        if (data) { setAccessToken(data.accessToken); setUser(data.user); applyOrgTheme(data.user?.org?.themeColor); }
      } catch { /* no session */ }
      finally { setBooting(false); }
    })();

    if (!DEMO) {
      import('../lib/supabaseClient.js').then(({ supabase }) => {
        const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (event === 'SIGNED_OUT' || !session) { setAccessToken(null); setUser(null); resetOrgTheme(); return; }
          if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            console.log('[DEBUG listener] fired', event);
            try {
              const { user: profile } = await api('/me');           // trigger created the profile on first login
              console.log('[DEBUG listener] /me resolved', profile.status, profile.org?.status);
              if (profile.status !== 'active' || profile.org?.status !== 'active') { await supabase.auth.signOut(); setUser(null); return; }
              setAccessToken(session.access_token);
              setUser(profile);
              applyOrgTheme(profile.org?.themeColor);
            } catch (e) { console.log('[DEBUG listener] /me threw', e.message); }
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
    const data = await apiPost('/auth/login', { email, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
    applyOrgTheme(data.user?.org?.themeColor);
    return data.user;
  }, []);

  // Microsoft / Azure Entra ID SSO — redirects to Microsoft, returns to the app.
  const loginWithMicrosoft = useCallback(async () => {
    const { supabase } = await import('../lib/supabaseClient.js');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { scopes: 'openid email profile', redirectTo: window.location.origin },
    });
    if (error) throw error;
  }, []);

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
    <AuthCtx.Provider value={{ user, setUser, booting, login, loginWithMicrosoft, logout, refreshUser }}>
      {children}
    </AuthCtx.Provider>
  );
}
