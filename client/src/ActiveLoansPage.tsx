import { fetchActiveLoans } from './api';
import { formatDateTime } from './MyRequestsPage';
import { errorMessage, useLoad } from './useLoad';

// F-05: the active loans in the custodian's labs, in the order the API sends them (earliest due
// date first). The API decides which loans are shown, and the page only displays its answer.
export function ActiveLoansPage() {
  const { state, reload } = useLoad(fetchActiveLoans, 'custodian-loans');

  return (
    <section>
      <h1 className="h3">Active loans</h1>
      {state.status === 'loading' && <p className="text-body-secondary">Loading...</p>}
      {state.status === 'error' && (
        <div className="alert alert-warning d-flex align-items-center gap-3">
          <span>{errorMessage(state.error, 'Could not load active loans.')}</span>
          <button type="button" className="btn btn-outline-dark btn-sm" onClick={reload}>
            Retry
          </button>
        </div>
      )}
      {state.status === 'ready' && state.data.length === 0 && (
        <p className="text-body-secondary">No active loans in your labs.</p>
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
                  <td>{loan.dueDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
