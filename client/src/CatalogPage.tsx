import { Link } from 'react-router-dom';
import { fetchCatalog } from './api';
import { errorMessage, useLoad } from './useLoad';

// The borrower's catalog (F-02, FR-04): types grouped by lab with live Available counts.
export function CatalogPage() {
  const { state, reload } = useLoad(fetchCatalog, 'catalog');

  return (
    <section>
      <h1 className="h3 mb-3">Equipment catalog</h1>
      {state.status === 'loading' && <p className="text-body-secondary">Loading...</p>}
      {state.status === 'error' && (
        <div className="alert alert-warning d-flex align-items-center gap-3">
          <span>{errorMessage(state.error, 'Could not load the catalog.')}</span>
          <button type="button" className="btn btn-outline-dark btn-sm" onClick={reload}>
            Retry
          </button>
        </div>
      )}
      {state.status === 'ready' && state.data.items.length === 0 && (
        <p className="text-body-secondary">No equipment types in the catalog yet.</p>
      )}
      {state.status === 'ready' &&
        state.data.items.map(({ lab, equipmentTypes }) => (
          <section key={lab.id} aria-labelledby={`lab-${lab.id}`} className="mb-4">
            <h2 id={`lab-${lab.id}`} className="h5">
              {lab.name}
            </h2>
            <ul className="list-group">
              {equipmentTypes.map((type) => (
                <li
                  key={type.id}
                  aria-label={type.name}
                  className="list-group-item d-flex justify-content-between align-items-center"
                >
                  <span>
                    <Link to={`/catalog/${type.id}`}>{type.name}</Link>
                    <span className="text-body-secondary ms-2">{type.category}</span>
                  </span>
                  <span className="badge text-bg-secondary">{type.availableCount} available</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </section>
  );
}
