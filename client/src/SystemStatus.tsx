import { useEffect, useState } from 'react';
import { fetchHealth } from './api';

type SystemStatus = 'loading' | 'ok' | 'database-unreachable' | 'api-unreachable';

const STATUS_TEXT: Record<SystemStatus, string> = {
  loading: 'Checking system status...',
  ok: 'System status: API and database are reachable.',
  'database-unreachable': 'System status: the database is unreachable.',
  'api-unreachable': 'System status: the API is unreachable.',
};

// Shows whether the API and the database answer, from the scaffold's health check.
export function SystemStatus() {
  const [status, setStatus] = useState<SystemStatus>('loading');

  useEffect(() => {
    let active = true;
    fetchHealth()
      .then((health) => {
        if (active) setStatus(health.database === 'ok' ? 'ok' : 'database-unreachable');
      })
      .catch(() => {
        if (active) setStatus('api-unreachable');
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <p role="status" className={status === 'ok' ? 'text-success mb-0' : 'mb-0'}>
      {STATUS_TEXT[status]}
    </p>
  );
}
