import { useCallback, useEffect, useState } from 'react';
import {
  HISTORY_ENTITY_LABEL,
  type HistoryEntityType,
  type HistoryEntry,
} from '@cpe334-group/shared';
import { ApiRequestError, fetchHistory } from './api';
import { useAuth } from './auth';
import { formatDateTime } from './MyRequestsPage';
import { errorMessage } from './useLoad';

// "IN_MAINTENANCE" is shown as "In maintenance", the same words as the rest of the UI.
function statusLabel(status: string): string {
  const text = status.toLowerCase().replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function changeText(entry: HistoryEntry): string {
  return entry.oldStatus === null
    ? `New: ${statusLabel(entry.newStatus)}`
    : `${statusLabel(entry.oldStatus)} to ${statusLabel(entry.newStatus)}`;
}

const FILTERS: { value: '' | HistoryEntityType; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'REQUEST', label: 'Requests' },
  { value: 'LOAN', label: 'Loans' },
  { value: 'COPY', label: 'Copies' },
];

type State =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; items: HistoryEntry[]; next: number | null; loadingMore: boolean };

// F-14: the history entries of the custodian's labs, newest first. The API filters by lab and
// pages the list, and the page only shows its answer.
export function HistoryPage() {
  const { recheck } = useAuth();
  const [filter, setFilter] = useState<'' | HistoryEntityType>('');
  const [state, setState] = useState<State>({ status: 'loading' });
  const [moreFailed, setMoreFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    setMoreFailed(false);
    fetchHistory({ entityType: filter || undefined }).then(
      (page) => {
        if (active)
          setState({
            status: 'ready',
            items: page.items,
            next: page.nextBeforeId,
            loadingMore: false,
          });
      },
      (error: unknown) => {
        if (!active) return;
        if (error instanceof ApiRequestError && error.status === 401) recheck();
        setState({ status: 'error', error });
      },
    );
    return () => {
      active = false;
    };
    // `recheck` is stable enough for a one-off call on error.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, attempt]);

  const loadMore = useCallback(async () => {
    if (state.status !== 'ready' || state.next === null || state.loadingMore) return;
    const { items, next } = state;
    setMoreFailed(false);
    setState({ status: 'ready', items, next, loadingMore: true });
    try {
      const page = await fetchHistory({ entityType: filter || undefined, beforeId: next });
      setState({
        status: 'ready',
        items: [...items, ...page.items],
        next: page.nextBeforeId,
        loadingMore: false,
      });
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) recheck();
      setMoreFailed(true);
      setState({ status: 'ready', items, next, loadingMore: false });
    }
  }, [state, filter, recheck]);

  return (
    <section>
      <h1 className="h3">History</h1>
      <div className="mb-3" style={{ maxWidth: '16rem' }}>
        <label htmlFor="history-type" className="form-label">
          Type
        </label>
        <select
          id="history-type"
          className="form-select"
          value={filter}
          onChange={(event) => setFilter(event.target.value as '' | HistoryEntityType)}
        >
          {FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {state.status === 'loading' && <p className="text-body-secondary">Loading...</p>}
      {state.status === 'error' && (
        <div className="alert alert-warning d-flex align-items-center gap-3">
          <span>{errorMessage(state.error, 'Could not load history.')}</span>
          <button
            type="button"
            className="btn btn-outline-dark btn-sm"
            onClick={() => setAttempt((count) => count + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {state.status === 'ready' && state.items.length === 0 && (
        <p className="text-body-secondary">No history yet.</p>
      )}
      {state.status === 'ready' && state.items.length > 0 && (
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Type</th>
                <th scope="col">Record</th>
                <th scope="col">Change</th>
                <th scope="col">By</th>
                <th scope="col">Lab</th>
              </tr>
            </thead>
            <tbody>
              {state.items.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDateTime(entry.createdAt)}</td>
                  <td>{HISTORY_ENTITY_LABEL[entry.entityType]}</td>
                  <td>{entry.subject}</td>
                  <td>{changeText(entry)}</td>
                  <td>{entry.actor.name}</td>
                  <td>{entry.lab.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {state.status === 'ready' && moreFailed && (
        <div className="alert alert-warning" role="alert">
          Could not load more history.
        </div>
      )}
      {state.status === 'ready' && state.next !== null && (
        <button
          type="button"
          className="btn btn-outline-primary"
          disabled={state.loadingMore}
          onClick={() => void loadMore()}
        >
          {state.loadingMore ? 'Loading...' : 'Load more'}
        </button>
      )}
    </section>
  );
}
