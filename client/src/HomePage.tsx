import { useEffect, useState } from 'react';
import { fetchHealth } from './api';

type SystemStatus = 'loading' | 'ok' | 'database-unreachable' | 'api-unreachable';

const STATUS_TEXT: Record<SystemStatus, string> = {
  loading: 'Checking system status...',
  ok: 'System status: API and database are reachable.',
  'database-unreachable': 'System status: the database is unreachable.',
  'api-unreachable': 'System status: the API is unreachable.',
};

export function HomePage() {
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
    <section>
      <h1 className="h3">CPE Lab Equipment Borrowing</h1>
      <p className="text-body-secondary">Borrow lab equipment from the CPE department.</p>
      <p role="status" className={status === 'ok' ? 'text-success' : undefined}>
        {STATUS_TEXT[status]}
      </p>
    </section>
  );
}
