import { useCallback, useEffect, useState } from 'react';
import {
  COPY_STATUS_LABEL,
  type ChangeableCopyStatus,
  type CustodianCopy,
} from '@cpe334-group/shared';
import { ApiRequestError, changeCopyStatus, fetchCustodianCopies } from './api';
import { useAuth } from './auth';

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; copies: CustodianCopy[] };

type Confirming = { copyId: number; target: ChangeableCopyStatus };

// The switch a custodian can make from each status (F-06). On loan and Retired have none.
const SWITCH_TO: Partial<Record<CustodianCopy['status'], ChangeableCopyStatus>> = {
  AVAILABLE: 'IN_MAINTENANCE',
  IN_MAINTENANCE: 'AVAILABLE',
};

// F-06: the copies in the custodian's labs, with a confirmed switch between Available and
// In maintenance. The API decides what is allowed, and the UI only shows its answer.
export function CopiesPage() {
  const { retry: restoreSession } = useAuth();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<{ copyId: number; message: string } | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // A 401 means the session ended, so the auth context checks it again and shows the login page.
  const handleExpiredSession = useCallback(
    (error: unknown) => {
      if (error instanceof ApiRequestError && error.status === 401) {
        restoreSession();
        return true;
      }
      return false;
    },
    [restoreSession],
  );

  useEffect(() => {
    let active = true;
    fetchCustodianCopies()
      .then((copies) => {
        if (active) setLoad({ status: 'loaded', copies });
      })
      .catch((error: unknown) => {
        if (active && !handleExpiredSession(error)) {
          setLoad({
            status: 'error',
            message:
              error instanceof ApiRequestError && error.code !== 'UNEXPECTED_RESPONSE'
                ? error.message
                : 'Could not load copies.',
          });
        }
      });
    return () => {
      active = false;
    };
  }, [attempt, handleExpiredSession]);

  function reload(showLoading: boolean) {
    if (showLoading) setLoad({ status: 'loading' });
    setAttempt((count) => count + 1);
  }

  function clearMessages() {
    setFieldError(null);
    setRefusal(null);
    setSuccess(null);
  }

  async function confirm(copy: CustodianCopy, target: ChangeableCopyStatus) {
    setSaving(true);
    clearMessages();
    try {
      await changeCopyStatus(copy.id, target);
      setConfirming(null);
      setSuccess(`${copy.assetTag} is now ${COPY_STATUS_LABEL[target]}.`);
      reload(false);
    } catch (error) {
      if (handleExpiredSession(error)) return;
      if (error instanceof ApiRequestError && error.fields.status) {
        setFieldError({ copyId: copy.id, message: error.fields.status });
      } else {
        setConfirming(null);
        setRefusal(
          error instanceof ApiRequestError ? error.message : 'Could not reach the server.',
        );
        // A refusal usually means the copy changed since the list loaded.
        if (error instanceof ApiRequestError && error.status === 409) reload(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <h1 className="h3">Copies</h1>
      {refusal && (
        <div className="alert alert-danger" role="alert">
          {refusal}
        </div>
      )}
      {success && (
        <div className="alert alert-success" role="status">
          {success}
        </div>
      )}
      {load.status === 'loading' && <p className="text-body-secondary">Loading...</p>}
      {load.status === 'error' && (
        <div className="alert alert-warning d-flex align-items-center gap-3">
          <span>{load.message}</span>
          <button
            type="button"
            className="btn btn-outline-dark btn-sm"
            onClick={() => reload(true)}
          >
            Retry
          </button>
        </div>
      )}
      {load.status === 'loaded' && load.copies.length === 0 && (
        <p className="text-body-secondary">No copies in your labs.</p>
      )}
      {load.status === 'loaded' && load.copies.length > 0 && (
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th scope="col">Lab</th>
                <th scope="col">Equipment</th>
                <th scope="col">Asset tag</th>
                <th scope="col">Status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {load.copies.map((copy) => {
                const target = SWITCH_TO[copy.status];
                const asking = confirming?.copyId === copy.id ? confirming : null;
                const errorId = `copy-${copy.id}-error`;
                const hasError = fieldError?.copyId === copy.id;
                return (
                  <tr key={copy.id}>
                    <td>{copy.lab.name}</td>
                    <td>{copy.equipmentType.name}</td>
                    <td>{copy.assetTag}</td>
                    <td>{COPY_STATUS_LABEL[copy.status]}</td>
                    <td>
                      {!target && <span className="text-body-secondary">Cannot change</span>}
                      {target && !asking && (
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm"
                          onClick={() => {
                            clearMessages();
                            setConfirming({ copyId: copy.id, target });
                          }}
                        >
                          {`Set ${COPY_STATUS_LABEL[target]}`}
                        </button>
                      )}
                      {asking && (
                        <div className="d-flex flex-wrap align-items-center gap-2">
                          <span>{`Change ${copy.assetTag} to ${COPY_STATUS_LABEL[asking.target]}?`}</span>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={saving}
                            aria-describedby={hasError ? errorId : undefined}
                            onClick={() => void confirm(copy, asking.target)}
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm"
                            disabled={saving}
                            onClick={() => setConfirming(null)}
                          >
                            Cancel
                          </button>
                          {hasError && (
                            <div id={errorId} className="text-danger small w-100">
                              {fieldError.message}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
