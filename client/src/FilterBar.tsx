export type CustodianFilters = { labId?: number; borrowerId?: number };

type Option = { id: number; name: string };

// The Lab and Borrower options for a custodian list, taken from an unfiltered answer so they stay
// when a filter returns nothing (F-17).
export function optionsFrom(items: { lab: Option; borrower: Option }[]): {
  labs: Option[];
  borrowers: Option[];
} {
  const unique = (list: Option[]) =>
    [...new Map(list.map((option) => [option.id, option])).values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  return {
    labs: unique(items.map((item) => item.lab)),
    borrowers: unique(items.map((item) => item.borrower)),
  };
}

export function hasFilters(filters: CustodianFilters): boolean {
  return filters.labId !== undefined || filters.borrowerId !== undefined;
}

// Lab and Borrower selects above a custodian list. The API does the filtering (F-17).
export function CustodianFilterBar({
  options,
  filters,
  onChange,
}: {
  options: { labs: Option[]; borrowers: Option[] };
  filters: CustodianFilters;
  onChange: (filters: CustodianFilters) => void;
}) {
  const pick = (value: string) => (value === '' ? undefined : Number(value));
  return (
    <div className="d-flex flex-wrap gap-3 mb-3">
      <div>
        <label htmlFor="filter-lab" className="form-label">
          Lab
        </label>
        <select
          id="filter-lab"
          className="form-select"
          value={filters.labId ?? ''}
          onChange={(event) => onChange({ ...filters, labId: pick(event.target.value) })}
        >
          <option value="">All labs</option>
          {options.labs.map((lab) => (
            <option key={lab.id} value={lab.id}>
              {lab.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="filter-borrower" className="form-label">
          Borrower
        </label>
        <select
          id="filter-borrower"
          className="form-select"
          value={filters.borrowerId ?? ''}
          onChange={(event) => onChange({ ...filters, borrowerId: pick(event.target.value) })}
        >
          <option value="">All borrowers</option>
          {options.borrowers.map((borrower) => (
            <option key={borrower.id} value={borrower.id}>
              {borrower.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// The sentence for a filtered list with no rows, with a button that clears the filters.
export function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="d-flex align-items-center gap-3">
      <p className="text-body-secondary mb-0">Nothing matches these filters.</p>
      <button type="button" className="btn btn-outline-dark btn-sm" onClick={onClear}>
        Clear filters
      </button>
    </div>
  );
}
