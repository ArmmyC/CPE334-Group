import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { CatalogResponse } from '@cpe334-group/shared';
import { fetchCatalog, type CatalogFilters } from './api';
import { errorMessage, useLoad } from './useLoad';

type Options = { categories: string[]; labs: { id: number; name: string }[] };

function optionsFrom(catalog: CatalogResponse): Options {
  const categories = new Set<string>();
  for (const group of catalog.items) {
    for (const type of group.equipmentTypes) categories.add(type.category);
  }
  return {
    categories: [...categories].sort((a, b) => a.localeCompare(b)),
    labs: catalog.items.map((group) => group.lab),
  };
}

const hasFilters = (filters: CatalogFilters) =>
  Boolean(filters.q || filters.category || filters.labId !== undefined || filters.available);

// The borrower's catalog (F-02, FR-04): types grouped by lab with live Available counts. F-17 adds
// search and filters. The API does the filtering, and the options of the Category and Lab
// controls come from the first answer with no filter, so they stay when a filter returns nothing.
export function CatalogPage() {
  const [filters, setFilters] = useState<CatalogFilters>({});
  const [draft, setDraft] = useState('');
  const [options, setOptions] = useState<Options>({ categories: [], labs: [] });
  const { state, reload } = useLoad(
    () => fetchCatalog(filters),
    `catalog-${filters.q ?? ''}-${filters.category ?? ''}-${filters.labId ?? ''}-${filters.available ?? ''}`,
  );

  useEffect(() => {
    if (state.status === 'ready' && !hasFilters(filters)) setOptions(optionsFrom(state.data));
  }, [state, filters]);

  // An unfiltered answer is used in the same render it arrives, so the controls never lag behind
  // the list. A filtered answer keeps the options of the last unfiltered one.
  const shownOptions =
    state.status === 'ready' && !hasFilters(filters) ? optionsFrom(state.data) : options;

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    setFilters({ ...filters, q: text === '' ? undefined : text });
  }

  function clear() {
    setFilters({});
    setDraft('');
  }

  return (
    <section>
      <h1 className="h3 mb-3">Equipment catalog</h1>
      <form className="d-flex flex-wrap align-items-end gap-3 mb-3" onSubmit={submitSearch}>
        <div>
          <label htmlFor="catalog-search" className="form-label">
            Search
          </label>
          <input
            id="catalog-search"
            type="search"
            className="form-control"
            maxLength={100}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-outline-primary">
          Search
        </button>
        <div>
          <label htmlFor="catalog-category" className="form-label">
            Category
          </label>
          <select
            id="catalog-category"
            className="form-select"
            value={filters.category ?? ''}
            onChange={(event) =>
              setFilters({ ...filters, category: event.target.value || undefined })
            }
          >
            <option value="">All categories</option>
            {shownOptions.categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="catalog-lab" className="form-label">
            Lab
          </label>
          <select
            id="catalog-lab"
            className="form-select"
            value={filters.labId ?? ''}
            onChange={(event) =>
              setFilters({
                ...filters,
                labId: event.target.value === '' ? undefined : Number(event.target.value),
              })
            }
          >
            <option value="">All labs</option>
            {shownOptions.labs.map((lab) => (
              <option key={lab.id} value={lab.id}>
                {lab.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-check mb-2">
          <input
            id="catalog-available"
            type="checkbox"
            className="form-check-input"
            checked={filters.available ?? false}
            onChange={(event) =>
              setFilters({ ...filters, available: event.target.checked || undefined })
            }
          />
          <label htmlFor="catalog-available" className="form-check-label">
            Available only
          </label>
        </div>
      </form>
      {state.status === 'loading' && <p className="text-body-secondary">Loading...</p>}
      {state.status === 'error' && (
        <div className="alert alert-warning d-flex align-items-center gap-3">
          <span>{errorMessage(state.error, 'Could not load the catalog.')}</span>
          <button type="button" className="btn btn-outline-dark btn-sm" onClick={reload}>
            Retry
          </button>
        </div>
      )}
      {state.status === 'ready' && state.data.items.length === 0 && hasFilters(filters) && (
        <div className="d-flex align-items-center gap-3">
          <p className="text-body-secondary mb-0">Nothing matches these filters.</p>
          <button type="button" className="btn btn-outline-dark btn-sm" onClick={clear}>
            Clear filters
          </button>
        </div>
      )}
      {state.status === 'ready' && state.data.items.length === 0 && !hasFilters(filters) && (
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
