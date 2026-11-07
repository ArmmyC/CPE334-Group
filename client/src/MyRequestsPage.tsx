import { useEffect, useState } from 'react';
import type { BorrowRequest, Loan } from '@cpe334-group/shared';
import { ApiRequestError, cancelRequest, fetchMyLoans, fetchMyRequests } from './api';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  FULFILLED: 'Fulfilled',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  ACTIVE: 'Active',
  RETURNED: 'Returned',
};

// Shown in Bangkok time, the time zone the lab uses (SDS 8).
export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

type Lists = { requests: BorrowRequest[]; loans: Loan[] };

// The borrower's own requests and loans (F-03). Only the caller's records come from the API.
export function MyRequestsPage() {
  const [lists, setLists] = useState<Lists | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadFailed(false);
    Promise.all([fetchMyRequests(), fetchMyLoans()])
      .then(([requests, loans]) => {
        if (active) setLists({ requests, loans });
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  async function handleCancel(id: number) {
    setActionMessage(null);
    setCancellingId(id);
    try {
      await cancelRequest(id);
      setAttempt((count) => count + 1);
    } catch (error) {
      setActionMessage(
        error instanceof ApiRequestError ? error.message : 'Could not reach the server.',
      );
    } finally {
      setCancellingId(null);
    }
  }

  if (!lists && !loadFailed) {
    return <p className="text-body-secondary">Loading...</p>;
  }
  if (!lists) {
    return (
      <div className="alert alert-warning d-flex align-items-center gap-3">
        <span>Could not load your requests and loans.</span>
        <button
          type="button"
          className="btn btn-outline-dark btn-sm"
          onClick={() => setAttempt((count) => count + 1)}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <section>
      <h1 className="h3 mb-3">My requests and loans</h1>
      {loadFailed && (
        <div role="alert" className="alert alert-warning">
          Could not refresh your requests. The list below may be out of date.
        </div>
      )}
      {actionMessage && (
        <div role="alert" className="alert alert-danger">
          {actionMessage}
        </div>
      )}

      <h2 className="h5 mt-4">Requests</h2>
      {lists.requests.length === 0 ? (
        <p className="text-body-secondary">You have no requests yet.</p>
      ) : (
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th scope="col">Equipment</th>
                <th scope="col">Lab</th>
                <th scope="col">Purpose</th>
                <th scope="col">Status</th>
                <th scope="col">Requested on</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lists.requests.map((item) => (
                <tr key={item.id}>
                  <td>{item.equipmentType.name}</td>
                  <td>{item.lab.name}</td>
                  <td>{item.purpose ?? 'None'}</td>
                  <td>{STATUS_LABEL[item.status] ?? item.status}</td>
                  <td>{formatDateTime(item.createdAt)}</td>
                  <td className="text-end">
                    {item.status === 'PENDING' && (
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm"
                        aria-label={`Cancel request for ${item.equipmentType.name}`}
                        disabled={cancellingId === item.id}
                        onClick={() => void handleCancel(item.id)}
                      >
                        {cancellingId === item.id ? 'Cancelling...' : 'Cancel'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="h5 mt-4">Loans</h2>
      {lists.loans.length === 0 ? (
        <p className="text-body-secondary">You have no loans.</p>
      ) : (
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th scope="col">Equipment</th>
                <th scope="col">Asset tag</th>
                <th scope="col">Checked out</th>
                <th scope="col">Due date</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {lists.loans.map((loan) => (
                <tr key={loan.id}>
                  <td>{loan.equipmentType.name}</td>
                  <td>{loan.assetTag}</td>
                  <td>{formatDateTime(loan.checkedOutAt)}</td>
                  <td>{loan.dueDate}</td>
                  <td>{STATUS_LABEL[loan.status] ?? loan.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
