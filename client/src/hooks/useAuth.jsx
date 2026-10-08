import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { setSandboxMode } from '../api/client.js';
import { authApi, sandboxApi } from '../api/resources.js';

const AuthContext = createContext(null);

const currentUser = () =>
  authApi
    .me()
    .then(({ user }) => user)
    .catch(() => null);

// The signed-in account, and the visitor sandbox if one is active. Inside a sandbox `user` is the
// sandbox's manager, admin or demo traveller and every API call goes to the sandbox (api/client.js).
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready
  const [sandbox, setSandbox] = useState(null); // { kind, role, expiresAt } | null
  const [sandboxEnded, setSandboxEnded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const session = await sandboxApi.session().catch(() => ({ active: false }));
      setSandboxMode(session.active); // also releases API calls waiting for this answer
      if (session.active && alive) setSandbox(session);
      const me = await currentUser();
      if (alive) {
        setUser(me);
        setStatus('ready');
      }
    })();
    // The server ended the sandbox (idle or time limit): back to the real site.
    const onEnded = async () => {
      setSandbox(null);
      setSandboxEnded(true);
      setUser(await currentUser());
    };
    window.addEventListener('atlas:sandbox-ended', onEnded);
    return () => {
      alive = false;
      window.removeEventListener('atlas:sandbox-ended', onEnded);
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const { user } = await authApi.login(credentials);
    setUser(user);
    return user;
  }, []);

  const register = useCallback(async (details) => {
    const { user } = await authApi.register(details);
    setUser(user);
    return user;
  }, []);

  const startSandbox = useCallback(async (body) => {
    const session = await sandboxApi.start(body);
    setSandboxMode(true);
    setSandbox(session);
    setSandboxEnded(false);
    setUser(await currentUser());
    return session;
  }, []);

  const endSandbox = useCallback(async () => {
    // Back to real data at once (synchronously), so the page being opened never asks the ended sandbox.
    setSandboxMode(false);
    setSandbox(null);
    // "Loading" while the real account (if any) loads: protected pages wait instead of redirecting
    // to sign-in, and the bell stops polling for the sandbox account.
    setStatus('loading');
    await sandboxApi.end().catch(() => {});
    setUser(await currentUser());
    setStatus('ready');
  }, []);

  const switchSandboxView = useCallback(async () => {
    const session = await sandboxApi.switchView();
    setSandbox(session);
    setUser(await currentUser());
    return session;
  }, []);

  const logout = useCallback(async () => {
    if (sandbox) return endSandbox();
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }, [sandbox, endSandbox]);

  const value = useMemo(
    () => ({ user, status, login, register, logout, sandbox, sandboxEnded, dismissSandboxEnded: () => setSandboxEnded(false), startSandbox, endSandbox, switchSandboxView }),
    [user, status, login, register, logout, sandbox, sandboxEnded, startSandbox, endSandbox, switchSandboxView],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
