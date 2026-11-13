import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

const custodian = {
  id: 1,
  name: 'Napat Srisuk',
  email: 'custodian.embedded@example.com',
  role: 'CUSTODIAN',
};
const borrower = {
  id: 3,
  name: 'Arisa Kittipong',
  email: 'borrower1@example.com',
  role: 'BORROWER',
};

const embedded = { id: 1, name: 'Embedded Systems Lab' };
const network = { id: 2, name: 'Network Lab' };

function loan(
  id: number,
  borrowerName: string,
  typeName: string,
  lab: { id: number; name: string },
  assetTag: string,
  checkedOutAt: string,
  dueDate: string,
) {
  return {
    id,
    borrower: { id: 100 + id, name: borrowerName },
    equipmentType: { id: 10 + id, name: typeName },
    lab,
    assetTag,
    checkedOutAt,
    dueDate,
    status: 'ACTIVE',
  };
}

const twoLoans = {
  items: [
    loan(
      7,
      'Arisa Kittipong',
      'Logic analyzer',
      embedded,
      'EMB-LA-0002',
      '2026-11-03T08:30:00.000Z',
      '2026-11-10',
    ),
    loan(
      8,
      'Somchai Rattana',
      'Managed switch',
      network,
      'NET-SW-0001',
      '2026-11-06T03:00:00.000Z',
      '2026-11-13',
    ),
  ],
};

type Handler = (init?: RequestInit) => Response | Promise<Response>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function apiFailure(status: number, code: string, message: string) {
  return json({ error: { code, message } }, status);
}

// Routes each call by "METHOD /path". The login page also checks /api/health.
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

const LIST = 'GET /api/custodian/loans';
const asCustodian = { 'GET /api/auth/me': () => json(custodian) };

describe('TEST-F05-01 active loans page (AC-F05-01, FR-14)', () => {
  it('shows borrower, equipment, lab, asset tag, checkout time in Bangkok, and due date', async () => {
    stubApi({ ...asCustodian, [LIST]: () => json(twoLoans) });

    renderApp('/custodian/loans');

    expect(await screen.findByRole('heading', { name: 'Active loans' })).toBeInTheDocument();
    for (const header of ['Borrower', 'Equipment', 'Lab', 'Asset tag', 'Checked out', 'Due date']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    const first = within(screen.getByRole('row', { name: /EMB-LA-0002/ }));
    expect(first.getByText('Arisa Kittipong')).toBeInTheDocument();
    expect(first.getByText('Logic analyzer')).toBeInTheDocument();
    expect(first.getByText('Embedded Systems Lab')).toBeInTheDocument();
    // 08:30 UTC is 15:30 in Asia/Bangkok (SDS 8). The due date is a calendar date, shown as sent.
    expect(first.getByText('3 Nov 2026, 15:30')).toBeInTheDocument();
    expect(first.getByText('2026-11-10')).toBeInTheDocument();
    const second = within(screen.getByRole('row', { name: /NET-SW-0001/ }));
    expect(second.getByText('Somchai Rattana')).toBeInTheDocument();
    expect(second.getByText('6 Nov 2026, 10:00')).toBeInTheDocument();
    expect(second.getByText('2026-11-13')).toBeInTheDocument();
  });

  it('keeps the order the API sent', async () => {
    stubApi({ ...asCustodian, [LIST]: () => json(twoLoans) });

    renderApp('/custodian/loans');

    await screen.findByRole('heading', { name: 'Active loans' });
    const tags = (await screen.findAllByRole('row')).slice(1).map((row) => row.textContent ?? '');
    expect(tags[0]).toContain('EMB-LA-0002');
    expect(tags[1]).toContain('NET-SW-0001');
  });
});

describe('Supporting check: active loans states (AC-SR02-03)', () => {
  it('shows a loading message while the request is in flight', async () => {
    stubApi({ ...asCustodian, [LIST]: () => new Promise<Response>(() => {}) });

    renderApp('/custodian/loans');

    expect(await screen.findByRole('heading', { name: 'Active loans' })).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows the empty sentence when there are no active loans', async () => {
    stubApi({ ...asCustodian, [LIST]: () => json({ items: [] }) });

    renderApp('/custodian/loans');

    expect(await screen.findByText('No active loans in your labs.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows an error with a Retry button that sends the request again', async () => {
    let attempts = 0;
    const fetchMock = stubApi({
      ...asCustodian,
      [LIST]: () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError('Failed to fetch');
        return json(twoLoans);
      },
    });
    renderApp('/custodian/loans');

    expect(await screen.findByText('Could not load active loans.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('EMB-LA-0002')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input) === '/api/custodian/loans'),
    ).toHaveLength(2);
  });

  it('shows the API message and Retry when the API sends one', async () => {
    stubApi({
      ...asCustodian,
      [LIST]: () => apiFailure(503, 'SERVICE_BUSY', 'The service is busy.'),
    });

    renderApp('/custodian/loans');

    expect(await screen.findByText('The service is busy.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('Supporting check: header link and route guard', () => {
  it('shows an Active loans link to a custodian that opens the page', async () => {
    stubApi({
      ...asCustodian,
      'GET /api/custodian/requests?status=PENDING': () => json({ items: [] }),
      [LIST]: () => json(twoLoans),
    });
    renderApp('/custodian/requests');

    const link = await screen.findByRole('link', { name: 'Active loans' });
    expect(link).toHaveAttribute('href', '/custodian/loans');
    await userEvent.click(link);

    expect(await screen.findByRole('heading', { name: 'Active loans' })).toBeInTheDocument();
    expect(await screen.findByText('EMB-LA-0002')).toBeInTheDocument();
  });

  it('does not show the link to a borrower', async () => {
    stubApi({
      'GET /api/auth/me': () => json(borrower),
      'GET /api/equipment-types': () => json({ items: [] }),
    });
    renderApp('/catalog');

    expect(await screen.findByRole('heading', { name: 'Equipment catalog' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Active loans' })).toBeNull();
  });

  it('sends a borrower at /custodian/loans to the catalog', async () => {
    stubApi({
      'GET /api/auth/me': () => json(borrower),
      'GET /api/equipment-types': () => json({ items: [] }),
    });

    renderApp('/custodian/loans');

    expect(await screen.findByRole('heading', { name: 'Equipment catalog' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Active loans' })).toBeNull();
  });
});
