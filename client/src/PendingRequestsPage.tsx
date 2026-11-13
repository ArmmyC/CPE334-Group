import { useCallback, useEffect, useRef, useState } from 'react';
import type { AvailableCopy, CheckoutResult, PendingRequest } from '@cpe334-group/shared';
import { ApiRequestError, checkoutCopy, fetchAvailableCopies, fetchPendingRequests } from './api';
import { formatDateTime } from './MyRequestsPage';

type CopiesState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; copies: AvailableCopy[] };

// The copy selection dialog (F-04, SDS 4.1). It lists the Available copies of the request's
// type. A refusal shows above the choices and the dialog stays open, so the custodian can pick
// another copy. Checkout checks the copy again on the server (BR-17).
function CheckoutDialog({
  request,
  onClose,
  onDone,
}: {
  request: PendingRequest;
  onClose: () => void;
  onDone: (result: CheckoutResult) => void;
}) {
  const [copies, setCopies] = useState<CopiesState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setCopies({ status: 'loading' });
    fetchAvailableCopies(request.id)
      .then((list) => {
        if (active) setCopies({ status: 'ready', copies: list });
      })
      .catch(() => {
        if (active) setCopies({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [request.id, attempt]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // After a refusal the list can be out of date, so it is read again without a loading state.
  const refreshCopies = useCallback(() => {
    fetchAvailableCopies(request.id)
      .then((list) => {
        setCopies({ status: 'ready', copies: list });
        setChosen((current) => (list.some((copy) => copy.id === current) ? current : null));
      })
      .catch(() => {});
  }, [request.id]);

  async function handleConfirm() {
    if (chosen === null) return;
    setMessage(null);
    setFields({});
    setSubmitting(true);
    try {
      const result = await checkoutCopy(request.id, chosen);
      onDone(result);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setFields(error.fields);
        if (error.code !== 'VALIDATION_ERROR') setMessage(error.message);
        if (error.status === 409) refreshCopies();
      } else {
        setMessage('Could not reach the server.');
      }
      setSubmitting(false);
    }
  }

  const titleId = `checkout-title-${request.id}`;

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
                Check out {request.equipmentType.name}
              </h2>
            </div>
            <div className="modal-body">
              <p className="mb-3">
                Request from {request.borrower.name} in {request.lab.name}.
              </p>
              {message && (
                <div role="alert" className="alert alert-danger">
                  {message}
                </div>
              )}
              {copies.status === 'loading' && (
                <p className="text-body-secondary">Loading copies...</p>
              )}
              {copies.status === 'error' && (
                <div className="alert alert-warning d-flex align-items-center gap-3">
                  <span>Could not load copies.</span>
                  <button
                    type="button"
                    className="btn btn-outline-dark btn-sm"
                    onClick={() => setAttempt((count) => count + 1)}
                  >
                    Retry
                  </button>
                </div>
              )}
              {copies.status === 'ready' && copies.copies.length === 0 && (
                <p className="text-body-secondary">
                  No copies of this equipment are available right now.
                </p>
              )}
              {copies.status === 'ready' && copies.copies.length > 0 && (
                <fieldset aria-describedby={fields.copyId ? 'copyId-error' : undefined}>
                  <legend className="h6">Choose a copy</legend>
                  {copies.copies.map((copy) => (
                    <div className="form-check" key={copy.id}>
                      <input
                        className={`form-check-input${fields.copyId ? ' is-invalid' : ''}`}
                        type="radio"
                        name="copyId"
                        id={`copy-${copy.id}`}
                        checked={chosen === copy.id}
                        disabled={submitting}
                        onChange={() => setChosen(copy.id)}
                      />
                      <label className="form-check-label" htmlFor={`copy-${copy.id}`}>
                        {copy.assetTag}
                      </label>
                    </div>
                  ))}
                  {fields.copyId && (
                    <div id="copyId-error" className="text-danger small mt-1">
                      {fields.copyId}
                    </div>
                  )}
                </fieldset>
              )}
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
              {copies.status === 'ready' && copies.copies.length > 0 && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={chosen === null || submitting}
                  onClick={() => void handleConfirm()}
                >
                  {submitting ? 'Checking out...' : 'Confirm checkout'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// The custodian's Pending requests (F-04). The API returns only the labs the custodian is
// assigned to, oldest first. The heading shows in every state.
export function PendingRequestsPage() {
  const [items, setItems] = useState<PendingRequest[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<PendingRequest | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadFailed(false);
    fetchPendingRequests()
      .then((list) => {
        if (active) setItems(list);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  function handleDone(request: PendingRequest, result: CheckoutResult) {
    setSelected(null);
    setSuccess(
      `Checked out ${result.assetTag} to ${request.borrower.name}. Due ${result.dueDate}.`,
    );
    setAttempt((count) => count + 1);
  }

  let body;
  if (!items && !loadFailed) {
    body = <p className="text-body-secondary">Loading...</p>;
  } else if (!items) {
    body = (
      <div className="alert alert-warning d-flex align-items-center gap-3">
        <span>Could not load pending requests.</span>
        <button
          type="button"
          className="btn btn-outline-dark btn-sm"
          onClick={() => setAttempt((count) => count + 1)}
        >
          Retry
        </button>
      </div>
    );
  } else if (items.length === 0) {
    body = <p className="text-body-secondary">No pending requests in your labs.</p>;
  } else {
    body = (
      <div className="table-responsive">
        <table className="table align-middle">
          <thead>
            <tr>
              <th scope="col">Borrower</th>
              <th scope="col">Equipment</th>
              <th scope="col">Lab</th>
              <th scope="col">Purpose</th>
              <th scope="col">Requested on</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.borrower.name}</td>
                <td>{item.equipmentType.name}</td>
                <td>{item.lab.name}</td>
                <td>{item.purpose ?? 'None'}</td>
                <td>{formatDateTime(item.createdAt)}</td>
                <td className="text-end">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    aria-label={`Check out ${item.equipmentType.name}`}
                    onClick={() => {
                      setSuccess(null);
                      setSelected(item);
                    }}
                  >
                    Check out
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <section>
      <h1 className="h3 mb-3">Pending requests</h1>
      {success && (
        <div role="status" className="alert alert-success">
          {success}
        </div>
      )}
      {loadFailed && items && (
        <div role="alert" className="alert alert-warning">
          Could not refresh the list. It may be out of date.
        </div>
      )}
      {body}
      {selected && (
        <CheckoutDialog
          request={selected}
          onClose={() => setSelected(null)}
          onDone={(result) => handleDone(selected, result)}
        />
      )}
    </section>
  );
}
