import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { LoanHistoryItem } from '@cpe334-group/shared';
import { ApiRequestError, fetchLoanHistory, type LoanHistoryKind } from './api';
import { useAuth } from './auth';
import { formatDateTime } from './MyRequestsPage';
import { errorMessage } from './useLoad';

type State =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; items: LoanHistoryItem[]; next: number | null; loadingMore: boolean };

const TITLE: Record<LoanHistoryKind, string> = {
  copy: 'Loan history of a copy',
  borrower: 'Loan history of a borrower',
};

// F-18: every loan of one copy or one borrower in the custodian's labs, newest checkout first. The
// API scopes and pages the list, and the page only shows its answer.
export function LoanHistoryPage({ kind }: { kind: LoanHistoryKind }) {
  const { id = '' } = useParams();
  const { recheck } = useAuth();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [moreFailed, setMoreFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    setMoreFailed(false);
    fetchLoanHistory(kind, id).then(
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
  }, [kind, id, attempt]);

  const loadMore = useCallback(async () => {
    if (state.status !== 'ready' || state.next === null || state.loadingMore) return;
    const { items, next } = state;
    setMoreFailed(false);
    setState({ status: 'ready', items, next, loadingMore: true });
    try {
      const page = await fetchLoanHistory(kind, id, next);
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
  }, [state, kind, id, recheck]);

  return (
    <section>
      <h1 className="h3 mb-3">{TITLE[kind]}</h1>
      {state.status === 'loading' && <p className="text-body-secondary">Loading...</p>}
      {state.status === 'error' && (
        <div className="alert alert-warning d-flex align-items-center gap-3">
          <span>{errorMessage(state.error, 'Could not load the loan history.')}</span>
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
        <p className="text-body-secondary">No loans yet.</p>
      )}
      {state.status === 'ready' && state.items.length > 0 && (
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th scope="col">Borrower</th>
                <th scope="col">Equipment</th>
                <th scope="col">Asset tag</th>
                <th scope="col">Lab</th>
                <th scope="col">Checked out</th>
                <th scope="col">Due date</th>
                <th scope="col">Status</th>
                <th scope="col">Returned</th>
                <th scope="col">Return note</th>
              </tr>
            </thead>
            <tbody>
              {state.items.map((loan) => (
                <tr key={loan.id}>
                  <td>{loan.borrower.name}</td>
                  <td>{loan.equipmentType.name}</td>
                  <td>{loan.assetTag}</td>
                  <td>{loan.lab.name}</td>
                  <td>{formatDateTime(loan.checkedOutAt)}</td>
                  <td>{loan.dueDate}</td>
                  <td>
                    <span>{loan.status === 'ACTIVE' ? 'Active' : 'Returned'}</span>
                    {loan.renewed && <span className="badge text-bg-secondary ms-2">Renewed</span>}
                  </td>
                  <td>{loan.returnedAt ? formatDateTime(loan.returnedAt) : ''}</td>
                  <td>{loan.returnNote ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {state.status === 'ready' && moreFailed && (
        <div className="alert alert-warning" role="alert">
          Could not load more loans.
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
