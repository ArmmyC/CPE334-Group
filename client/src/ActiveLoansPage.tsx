import { useEffect, useRef, useState } from 'react';
import { returnLoanBodySchema, type CustodianLoan } from '@cpe334-group/shared';
import { ApiRequestError, fetchActiveLoans, renewLoan, returnLoan } from './api';
import {
  CustodianFilterBar,
  NoMatches,
  hasFilters,
  optionsFrom,
  type CustodianFilters,
} from './FilterBar';
import { formatDateTime } from './MyRequestsPage';
import { errorMessage, useLoad } from './useLoad';

// Shown next to a due date that has passed (F-10). The API calculates it, the page only shows it.
export function OverdueBadge() {
  return <span className="badge text-bg-danger ms-2">Overdue</span>;
}

// The return dialog (F-09). The note is required and the custodian can mark the copy damaged.
// A 409 or 404 means the list is out of date, so the dialog closes and the page reloads.
function ReturnDialog({
  loan,
  onClose,
  onDone,
  onStale,
}: {
  loan: CustodianLoan;
  onClose: () => void;
  onDone: () => void;
  onStale: (message: string) => void;
}) {
  const [note, setNote] = useState('');
  const [damaged, setDamaged] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  async function handleConfirm() {
    setMessage(null);
    setNoteError(null);
    const parsed = returnLoanBodySchema.safeParse({ note, damaged });
    if (!parsed.success) {
      setNoteError(parsed.error.issues[0]?.message ?? 'Enter a note about the condition.');
      return;
    }
    setSubmitting(true);
    try {
      await returnLoan(loan.id, parsed.data);
      onDone();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.status === 409 || error.status === 404) {
          onStale(error.status === 404 ? 'Loan not found.' : 'This loan was already returned.');
          return;
        }
        if (error.fields.note) setNoteError(error.fields.note);
        else setMessage(error.message);
      } else {
        setMessage('Could not reach the server.');
      }
      setSubmitting(false);
    }
  }

  const titleId = `return-title-${loan.id}`;

  return (
    <>
      <div className="modal-backdrop fade show" />
      <div
        ref={dialogRef}
        className="modal fade show d-block"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !submitting) onClose();
        }}
      >
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title h5" id={titleId}>
                Return {loan.assetTag}
              </h2>
            </div>
            <div className="modal-body">
              <p className="mb-3">
                {loan.equipmentType.name}, borrowed by {loan.borrower.name}.
              </p>
              {message && (
                <div role="alert" className="alert alert-danger">
                  {message}
                </div>
              )}
              <div className="mb-3">
                <label htmlFor="return-note" className="form-label">
                  Note
                </label>
                <textarea
                  id="return-note"
                  className={`form-control${noteError ? ' is-invalid' : ''}`}
                  rows={3}
                  value={note}
                  disabled={submitting}
                  aria-describedby={noteError ? 'return-note-error' : undefined}
                  onChange={(event) => setNote(event.target.value)}
                />
                {noteError && (
                  <div id="return-note-error" className="invalid-feedback d-block">
                    {noteError}
                  </div>
                )}
              </div>
              <div className="form-check">
                <input
                  id="return-damaged"
                  type="checkbox"
                  className="form-check-input"
                  checked={damaged}
                  disabled={submitting}
                  onChange={(event) => setDamaged(event.target.checked)}
                />
                <label htmlFor="return-damaged" className="form-check-label">
                  Copy is damaged
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline-secondary"
                disabled={submitting}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={submitting}
                onClick={() => void handleConfirm()}
              >
                {submitting ? 'Returning...' : 'Confirm return'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// F-05: the active loans in the custodian's labs, in the order the API sends them (earliest due
// date first). The API decides which loans are shown, and the page only displays its answer.
// F-10: the Overdue only box asks the API for overdue loans.
export function ActiveLoansPage() {
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selected, setSelected] = useState<CustodianLoan | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'warning'; text: string } | null>(null);
  const [renewing, setRenewing] = useState<number | null>(null);
  const [filters, setFilters] = useState<CustodianFilters>({});
  const [options, setOptions] = useState<ReturnType<typeof optionsFrom> | null>(null);
  const { state, reload } = useLoad(
    () => fetchActiveLoans({ overdueOnly, ...filters }),
    `custodian-loans-${overdueOnly}-${filters.labId ?? ''}-${filters.borrowerId ?? ''}`,
  );

  // The first unfiltered answer is used at once, before the effect below keeps it.
  const shownOptions =
    options ??
    (state.status === 'ready' && !hasFilters(filters) && !overdueOnly
      ? optionsFrom(state.data)
      : null);

  // The filter options come from the first answer with no filter, so they stay when a filter
  // returns nothing (F-17).
  useEffect(() => {
    if (state.status === 'ready' && !hasFilters(filters) && !overdueOnly) {
      setOptions(optionsFrom(state.data));
    }
  }, [state, filters, overdueOnly]);

  // F-16: one click renews the loan. A refusal shows the server message and reloads the list.
  async function handleRenew(loan: CustodianLoan) {
    setNotice(null);
    setRenewing(loan.id);
    try {
      const result = await renewLoan(loan.id);
      setNotice({
        kind: 'success',
        text: `Renewed ${loan.assetTag}. New due date ${result.dueDate}.`,
      });
    } catch (error) {
      if (error instanceof ApiRequestError && (error.status === 409 || error.status === 404)) {
        setNotice({
          kind: 'warning',
          text: error.status === 404 ? 'Loan not found.' : error.message,
        });
      } else {
        setNotice({ kind: 'warning', text: 'Could not reach the server.' });
      }
    } finally {
      setRenewing(null);
      reload();
    }
  }

  return (
    <section>
      <h1 className="h3">Active loans</h1>
      <div className="form-check mb-3">
        <input
          id="overdue-only"
          type="checkbox"
          className="form-check-input"
          checked={overdueOnly}
          onChange={(event) => setOverdueOnly(event.target.checked)}
        />
        <label htmlFor="overdue-only" className="form-check-label">
          Overdue only
        </label>
      </div>
      {shownOptions && shownOptions.borrowers.length > 0 && (
        <CustodianFilterBar options={shownOptions} filters={filters} onChange={setFilters} />
      )}
      {notice && (
        <div role="status" className={`alert alert-${notice.kind}`}>
          {notice.text}
        </div>
      )}
      {state.status === 'loading' && <p className="text-body-secondary">Loading...</p>}
      {state.status === 'error' && (
        <div className="alert alert-warning d-flex align-items-center gap-3">
          <span>{errorMessage(state.error, 'Could not load active loans.')}</span>
          <button type="button" className="btn btn-outline-dark btn-sm" onClick={reload}>
            Retry
          </button>
        </div>
      )}
      {state.status === 'ready' && state.data.length === 0 && hasFilters(filters) && (
        <NoMatches onClear={() => setFilters({})} />
      )}
      {state.status === 'ready' && state.data.length === 0 && !hasFilters(filters) && (
        <p className="text-body-secondary">
          {overdueOnly ? 'No overdue loans in your labs.' : 'No active loans in your labs.'}
        </p>
      )}
      {state.status === 'ready' && state.data.length > 0 && (
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th scope="col">Borrower</th>
                <th scope="col">Equipment</th>
                <th scope="col">Lab</th>
                <th scope="col">Asset tag</th>
                <th scope="col">Checked out</th>
                <th scope="col">Due date</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((loan) => (
                <tr key={loan.id}>
                  <td>{loan.borrower.name}</td>
                  <td>{loan.equipmentType.name}</td>
                  <td>{loan.lab.name}</td>
                  <td>{loan.assetTag}</td>
                  <td>{formatDateTime(loan.checkedOutAt)}</td>
                  <td>
                    {loan.dueDate}
                    {loan.overdue && <OverdueBadge />}
                  </td>
                  <td className="text-nowrap">
                    {loan.renewed ? (
                      <span className="text-body-secondary me-2">Renewed</span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm me-2"
                        disabled={renewing === loan.id}
                        onClick={() => void handleRenew(loan)}
                      >
                        Renew
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-outline-primary btn-sm"
                      onClick={() => {
                        setNotice(null);
                        setSelected(loan);
                      }}
                    >
                      Return
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <ReturnDialog
          loan={selected}
          onClose={() => setSelected(null)}
          onDone={() => {
            setNotice({ kind: 'success', text: `Returned ${selected.assetTag}.` });
            setSelected(null);
            reload();
          }}
          onStale={(text) => {
            setNotice({ kind: 'warning', text });
            setSelected(null);
            reload();
          }}
        />
      )}
    </section>
  );
}
