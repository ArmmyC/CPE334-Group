import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { CurrentUser, Role } from '@cpe334-group/shared';
import { fetchCurrentUser, logout } from './api';

export type AuthState =
  | { status: 'loading' }
  | { status: 'unreachable' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; user: CurrentUser };

type AuthContextValue = {
  state: AuthState;
  signIn: (user: CurrentUser) => void;
  signOut: () => Promise<void>;
  retry: () => void;
  recheck: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const ROLE_LABEL: Record<Role, string> = { BORROWER: 'Borrower', CUSTODIAN: 'Custodian' };

// Where each role lands after login (SDS 4.1).
export function homePath(role: Role): string {
  return role === 'BORROWER' ? '/catalog' : '/custodian/requests';
}

// Restores the user from the current-user endpoint on load (FR-03) and holds the sign-in state.
// It decides only what the UI shows. The API checks every permission again.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    fetchCurrentUser()
      .then((user) => {
        if (active) setState(user ? { status: 'signed-in', user } : { status: 'signed-out' });
      })
      .catch(() => {
        if (active) setState({ status: 'unreachable' });
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const signIn = useCallback((user: CurrentUser) => setState({ status: 'signed-in', user }), []);

  // Signs out only after the server ends the session (or reports it already gone, 401). On
  // any other failure the user stays signed in, so a shared PC never shows "signed out" while
  // the session is still alive.
  const signOut = useCallback(async () => {
    await logout();
    setState({ status: 'signed-out' });
  }, []);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((count) => count + 1);
  }, []);

  // Asks the server again after a page got a 401, without the "Loading..." state, so the page
  // that asked stays mounted. Only a clear "no session" answer signs the user out.
  const recheck = useCallback(() => {
    fetchCurrentUser().then(
      (user) => {
        if (!user) setState({ status: 'signed-out' });
      },
      () => {},
    );
  }, []);

  return (
    <AuthContext.Provider value={{ state, signIn, signOut, retry, recheck }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return value;
}
