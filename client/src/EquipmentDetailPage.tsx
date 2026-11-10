import { Link, useParams } from 'react-router-dom';
import { ApiRequestError, fetchEquipmentType } from './api';
import { errorMessage, useLoad } from './useLoad';

function BackLink() {
  return <Link to="/catalog">Back to catalog</Link>;
}

// One equipment type (F-02, FR-05). The empty slot at the end is where F-03 places its
// RequestForm, with this type's id as `equipmentTypeId`.
export function EquipmentDetailPage() {
  const { typeId = '' } = useParams();
  const { state, reload } = useLoad(() => fetchEquipmentType(typeId), typeId);

  if (state.status === 'loading') {
    return <p className="text-body-secondary">Loading...</p>;
  }
  if (state.status === 'error') {
    if (state.error instanceof ApiRequestError && state.error.status === 404) {
      return (
        <section>
          <p>Equipment type not found.</p>
          <BackLink />
        </section>
      );
    }
    return (
      <section>
        <div className="alert alert-warning d-flex align-items-center gap-3">
          <span>{errorMessage(state.error, 'Could not load this equipment type.')}</span>
          <button type="button" className="btn btn-outline-dark btn-sm" onClick={reload}>
            Retry
          </button>
        </div>
        <BackLink />
      </section>
    );
  }

  const type = state.data;
  return (
    <section>
      <p className="mb-2">
        <BackLink />
      </p>
      <h1 className="h3">{type.name}</h1>
      <p>{type.description}</p>
      <dl className="row">
        <dt className="col-sm-3">Lab</dt>
        <dd className="col-sm-9">{type.lab.name}</dd>
        <dt className="col-sm-3">Category</dt>
        <dd className="col-sm-9">{type.category}</dd>
        <dt className="col-sm-3">Loan period</dt>
        <dd className="col-sm-9">
          {type.loanPeriodDays} {type.loanPeriodDays === 1 ? 'day' : 'days'}
        </dd>
        <dt className="col-sm-3">Availability</dt>
        <dd className="col-sm-9">{type.availableCount} available</dd>
      </dl>
      <div data-testid="request-form-slot" />
    </section>
  );
}
