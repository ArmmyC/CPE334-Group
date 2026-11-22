import { useEffect, useState, type FormEvent } from 'react';
import type { SummaryResponse } from '@cpe334-group/shared';
import { ApiRequestError, fetchSummary } from './api';
import { useAuth } from './auth';
import { errorMessage } from './useLoad';

type State =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; data: SummaryResponse };

const COPY_LINES = [
  ['AVAILABLE', 'Available'],
  ['ON_LOAN', 'On loan'],
  ['IN_MAINTENANCE', 'In maintenance'],
  ['RETIRED', 'Retired'],
] as const;

// A refused range shows the server sentence for the field, which is the one the user can fix.
function rangeMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 400) {
    return error.fields.from ?? error.fields.to ?? error.message;
  }
  return errorMessage(error, 'Could not load the summary.');
}

// F-19: a card per assigned lab with copy counts, loans, overdue, and the top 5 equipment types by
// checkouts in the chosen range. The API counts everything, and the page only shows its answer.
export function SummaryPage() {
  const { recheck } = useAuth();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applyError, setApplyError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    fetchSummary().then(
      (data) => {
        if (!active) return;
        setFrom(data.range.from);
        setTo(data.range.to);
        setState({ status: 'ready', data });
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
  }, [attempt]);

  async function apply(event: FormEvent) {
    event.preventDefault();
    setApplyError(null);
    try {
      const data = await fetchSummary({ from, to });
      setState({ status: 'ready', data });
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) recheck();
      setApplyError(rangeMessage(error));
    }
  }

  return (
    <section>
      <h1 className="h3 mb-3">Inventory summary</h1>
      {state.status === 'loading' && <p className="text-body-secondary">Loading...</p>}
      {state.status === 'error' && (
        <div className="alert alert-warning d-flex align-items-center gap-3">
          <span>{errorMessage(state.error, 'Could not load the summary.')}</span>
          <button
            type="button"
            className="btn btn-outline-dark btn-sm"
            onClick={() => setAttempt((count) => count + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {state.status === 'ready' && (
        <>
          <form className="d-flex flex-wrap align-items-end gap-3 mb-3" onSubmit={apply}>
            <div>
              <label htmlFor="summary-from" className="form-label">
                From
              </label>
              <input
                id="summary-from"
                type="date"
                className="form-control"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="summary-to" className="form-label">
                To
              </label>
              <input
                id="summary-to"
                type="date"
                className="form-control"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-outline-primary">
              Apply
            </button>
          </form>
          {applyError && (
            <div role="alert" className="alert alert-warning">
              {applyError}
            </div>
          )}
          {state.data.labs.length === 0 && <p className="text-body-secondary">No assigned labs.</p>}
          {state.data.labs.map((entry) => (
            <section
              key={entry.lab.id}
              aria-labelledby={`summary-lab-${entry.lab.id}`}
              className="card mb-3"
            >
              <div className="card-body">
                <h2 id={`summary-lab-${entry.lab.id}`} className="h5">
                  {entry.lab.name}
                </h2>
                <ul className="list-unstyled d-flex flex-wrap gap-4 mb-3">
                  {COPY_LINES.map(([status, label]) => (
                    <li key={status}>{`${label}: ${entry.copies[status]}`}</li>
                  ))}
                  <li>{`Active loans: ${entry.activeLoans}`}</li>
                  <li className={entry.overdueLoans > 0 ? 'text-warning-emphasis fw-semibold' : ''}>
                    {`Overdue loans: ${entry.overdueLoans}`}
                  </li>
                </ul>
                <h3 className="h6">Most borrowed equipment types</h3>
                {entry.topTypes.length === 0 ? (
                  <p className="text-body-secondary mb-0">No checkouts in this range.</p>
                ) : (
                  <table className="table table-sm mb-0">
                    <thead>
                      <tr>
                        <th scope="col">Equipment type</th>
                        <th scope="col">Checkouts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.topTypes.map((top) => (
                        <tr key={top.equipmentType.id}>
                          <td>{top.equipmentType.name}</td>
                          <td>{top.checkouts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          ))}
        </>
      )}
    </section>
  );
}
