import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

const borrower = {
  id: 3,
  name: 'Arisa Kittipong',
  email: 'borrower1@example.com',
  role: 'BORROWER',
};
const custodian = {
  id: 1,
  name: 'Napat Srisuk',
  email: 'custodian.embedded@example.com',
  role: 'CUSTODIAN',
};

const labA = { id: 1, name: 'Embedded Systems Lab' };
const labB = { id: 2, name: 'Network Lab' };

type Handler = (init?: RequestInit) => Response | Promise<Response>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubApi(handlers: Record<string, Handler>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`;
    if (handlers[key]) return handlers[key](init);
    if (key === 'GET /api/health') return json({ status: 'ok', database: 'ok' });
    throw new Error(`Unexpected request ${key}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

const urls = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.map(([input]) => String(input));

const catalogAll = {
  items: [
    {
      lab: labA,
      equipmentTypes: [
        { id: 1, name: 'Oscilloscope', category: 'Instruments', availableCount: 2 },
        { id: 2, name: 'Arduino Uno', category: 'Boards', availableCount: 0 },
      ],
    },
    {
      lab: labB,
      equipmentTypes: [{ id: 3, name: 'Managed switch', category: 'Network', availableCount: 1 }],
    },
  ],
};
const emptyCatalog = { items: [] };

describe('TEST-F17-05 the catalog filters (AC-F17-05, FR-19, SR-02)', () => {
  it('sends the search, category, lab, and availability filters', async () => {
    const fetchMock = stubApi({
      'GET /api/auth/me': () => json(borrower),
      'GET /api/equipment-types': () => json(catalogAll),
      'GET /api/equipment-types?q=scope': () => json(emptyCatalog),
      'GET /api/equipment-types?category=Boards': () => json(emptyCatalog),
      'GET /api/equipment-types?labId=2': () => json(emptyCatalog),
      'GET /api/equipment-types?available=true': () => json(emptyCatalog),
    });
    renderApp('/catalog');
    await screen.findByText('Oscilloscope');

    await userEvent.type(screen.getByLabelText('Search'), 'scope');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText('Nothing matches these filters.');
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await screen.findByText('Oscilloscope');

    await userEvent.selectOptions(screen.getByLabelText('Category'), 'Boards');
    await screen.findByText('Nothing matches these filters.');
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await screen.findByText('Oscilloscope');

    await userEvent.selectOptions(screen.getByLabelText('Lab'), 'Network Lab');
    await screen.findByText('Nothing matches these filters.');
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await screen.findByText('Oscilloscope');

    await userEvent.click(screen.getByLabelText('Available only'));
    await screen.findByText('Nothing matches these filters.');

    expect(urls(fetchMock)).toEqual(
      expect.arrayContaining([
        '/api/equipment-types?q=scope',
        '/api/equipment-types?category=Boards',
        '/api/equipment-types?labId=2',
        '/api/equipment-types?available=true',
      ]),
    );
  });

  it('keeps the options after a filter returns nothing and restores the list on Clear', async () => {
    stubApi({
      'GET /api/auth/me': () => json(borrower),
      'GET /api/equipment-types': () => json(catalogAll),
      'GET /api/equipment-types?category=Boards': () => json(emptyCatalog),
    });
    renderApp('/catalog');
    await screen.findByText('Oscilloscope');

    await userEvent.selectOptions(screen.getByLabelText('Category'), 'Boards');
    await screen.findByText('Nothing matches these filters.');
    expect(screen.getByRole('option', { name: 'Network' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Network Lab' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('Managed switch')).toBeInTheDocument();
    expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe('');
  });
});

const pending = {
  items: [
    {
      id: 11,
      borrower: { id: 3, name: 'Arisa Kittipong' },
      equipmentType: { id: 1, name: 'Oscilloscope' },
      lab: labA,
      purpose: null,
      createdAt: '2026-11-10T05:00:00.000Z',
    },
    {
      id: 12,
      borrower: { id: 4, name: 'Somchai Rattana' },
      equipmentType: { id: 3, name: 'Managed switch' },
      lab: labB,
      purpose: null,
      createdAt: '2026-11-10T06:00:00.000Z',
    },
  ],
};

describe('TEST-F17-05 the custodian filters (AC-F17-05, FR-19)', () => {
  it('filters pending requests by lab and borrower from options of the full list', async () => {
    const fetchMock = stubApi({
      'GET /api/auth/me': () => json(custodian),
      'GET /api/custodian/requests?status=PENDING': () => json(pending),
      'GET /api/custodian/requests?status=PENDING&borrowerId=4': () =>
        json({ items: [pending.items[1]] }),
      'GET /api/custodian/requests?status=PENDING&labId=1&borrowerId=4': () => json({ items: [] }),
    });
    renderApp('/custodian/requests');
    await screen.findByRole('cell', { name: 'Arisa Kittipong' });

    await userEvent.selectOptions(screen.getByLabelText('Borrower'), 'Somchai Rattana');
    await screen.findByText('Managed switch');
    expect(screen.queryByRole('cell', { name: 'Arisa Kittipong' })).toBeNull();

    await userEvent.selectOptions(screen.getByLabelText('Lab'), 'Embedded Systems Lab');
    await screen.findByText('Nothing matches these filters.');
    expect(urls(fetchMock)).toContain(
      '/api/custodian/requests?status=PENDING&labId=1&borrowerId=4',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByRole('cell', { name: 'Arisa Kittipong' })).toBeInTheDocument();
  });

  it('filters active loans by lab and borrower', async () => {
    const loan = (id: number, name: string, lab: typeof labA, borrowerId: number) => ({
      id,
      borrower: { id: borrowerId, name },
      equipmentType: { id: 1, name: 'Oscilloscope' },
      lab,
      assetTag: `TAG-${id}`,
      checkedOutAt: '2026-11-03T08:30:00.000Z',
      dueDate: '2026-11-13',
      status: 'ACTIVE',
      overdue: false,
      renewed: false,
    });
    const all = {
      items: [loan(7, 'Arisa Kittipong', labA, 3), loan(8, 'Somchai Rattana', labB, 4)],
    };
    const fetchMock = stubApi({
      'GET /api/auth/me': () => json(custodian),
      'GET /api/custodian/loans': () => json(all),
      'GET /api/custodian/loans?labId=2': () => json({ items: [all.items[1]] }),
      'GET /api/custodian/loans?labId=2&borrowerId=3': () => json({ items: [] }),
    });
    renderApp('/custodian/loans');
    await screen.findByText('TAG-7');

    await userEvent.selectOptions(screen.getByLabelText('Lab'), 'Network Lab');
    await screen.findByText('TAG-8');
    expect(screen.queryByText('TAG-7')).toBeNull();

    await userEvent.selectOptions(screen.getByLabelText('Borrower'), 'Arisa Kittipong');
    await screen.findByText('Nothing matches these filters.');
    expect(urls(fetchMock)).toContain('/api/custodian/loans?labId=2&borrowerId=3');
  });
});
