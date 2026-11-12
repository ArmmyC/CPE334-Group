import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError } from './api';
import { useAuth } from './auth';

export type Load<T> =
  { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: unknown };

// Loads one read endpoint and offers a reload for the Retry button (SR-02). A 401 means the
// session may have ended, so the auth state is checked again and a signed-out user is sent to
// login (SDS 4.2).
export function useLoad<T>(
  load: () => Promise<T>,
  key: string,
): { state: Load<T>; reload: () => void; refresh: () => void } {
  const { recheck: recheckSession } = useAuth();
  const [state, setState] = useState<Load<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // A reload after a change can keep the current data on screen instead of showing Loading.
  const quiet = useRef(false);

  useEffect(() => {
    let active = true;
    if (!quiet.current) setState({ status: 'loading' });
    quiet.current = false;
    load().then(
      (data) => {
        if (active) setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (!active) return;
        if (error instanceof ApiRequestError && error.status === 401) {
          recheckSession();
        }
        // If the session check finds the user signed out, the app moves to the login page and
        // this page goes away. If the session is still valid, the error and Retry stay visible.
        setState({ status: 'error', error });
      },
    );
    return () => {
      active = false;
    };
    // `key` stands for the request, so a new type id loads again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);
  // Loads again without the Loading state, for a list that just changed.
  const refresh = useCallback(() => {
    quiet.current = true;
    setAttempt((count) => count + 1);
  }, []);
  return { state, reload, refresh };
}

// The message for a failed load. The API's own message is shown when it sent one.
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError && error.code !== 'UNEXPECTED_RESPONSE'
    ? error.message
    : fallback;
}
