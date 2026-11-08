import { useCallback, useEffect, useState } from 'react';
import { ApiRequestError } from './api';
import { useAuth } from './auth';

export type Load<T> =
  { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: unknown };

// Loads one read endpoint and offers a reload for the Retry button (SR-02). A 401 means the
// session has ended, so the auth state is checked again and the user is sent to login (SDS 4.2).
export function useLoad<T>(
  load: () => Promise<T>,
  key: string,
): { state: Load<T>; reload: () => void } {
  const { retry: recheckSession } = useAuth();
  const [state, setState] = useState<Load<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    load().then(
      (data) => {
        if (active) setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (!active) return;
        if (error instanceof ApiRequestError && error.status === 401) {
          recheckSession();
          return;
        }
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
  return { state, reload };
}

// The message for a failed load. The API's own message is shown when it sent one.
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError && error.code !== 'UNEXPECTED_RESPONSE'
    ? error.message
    : fallback;
}
