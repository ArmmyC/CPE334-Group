import { render, screen, within } from '@testing-library/react';
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
const embedded = { id: 1, name: 'Embedded Systems Lab' };

function myLoan(id: number, tag: string, dueDate: string, overdue: boolean) {
  return {
    id,
    equipmentType: { id: 10 + id, name: `Type ${id}` },
    assetTag: tag,
    checkedOutAt: '2026-11-03T08:30:00.000Z',
    dueDate,
    status: 'ACTIVE',
    overdue,
  };
}

function custodianLoan(id: number, tag: string, dueDate: string, overdue: boolean) {
  return {
    id,
    borrower: { id: 100 + id, name: `Borrower ${id}` },
    equipmentType: { id: 10 + id, name: `Type ${id}` },
    lab: embedded,
    assetTag: tag,
    checkedOutAt: '2026-11-03T08:30:00.000Z',
    dueDate,
    status: 'ACTIVE',
    overdue,
  };
}

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

const LIST = 'GET /api/custodian/loans';
const OVERDUE_LIST = 'GET /api/custodian/loans?overdue=true';

describe('TEST-F10-02 borrower sees the Overdue badge (AC-F10-02, FR-13)', () => {
  it('marks only the overdue loan on My requests and loans', async () => {
    stubApi({
      'GET /api/auth/me': () => json(borrower),
      'GET /api/requests': () => json([]),
      'GET /api/loans': () =>
        json([myLoan(1, 'LA-0001', '2026-11-09', true), myLoan(2, 'LA-0002', '2026-11-12', false)]),
    });
    renderApp('/my');

    await screen.findByRole('heading', { name: 'My requests and loans' });
    const late = within(screen.getByRole('row', { name: /LA-0001/ }));
    const onTime = within(screen.getByRole('row', { name: /LA-0002/ }));
    expect(late.getByText('Overdue')).toBeInTheDocument();
    expect(onTime.queryByText('Overdue')).toBeNull();
  });
});

describe('TEST-F10-03 custodian Active loans page (AC-F10-03, FR-14)', () => {
  it('shows the Overdue badge on overdue rows only', async () => {
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () =>
        json({
          items: [
            custodianLoan(1, 'EMB-0001', '2026-11-09', true),
            custodianLoan(2, 'EMB-0002', '2026-11-12', false),
          ],
        }),
    });
    renderApp('/custodian/loans');

    await screen.findByText('EMB-0001');
    expect(
      within(screen.getByRole('row', { name: /EMB-0001/ })).getByText('Overdue'),
    ).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /EMB-0002/ })).queryByText('Overdue')).toBeNull();
  });

  it('reloads with overdue=true when Overdue only is ticked, and back when cleared', async () => {
    const fetchMock = stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () =>
        json({
          items: [
            custodianLoan(1, 'EMB-0001', '2026-11-09', true),
            custodianLoan(2, 'EMB-0002', '2026-11-12', false),
          ],
        }),
      [OVERDUE_LIST]: () => json({ items: [custodianLoan(1, 'EMB-0001', '2026-11-09', true)] }),
    });
    renderApp('/custodian/loans');

    await screen.findByText('EMB-0002');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Overdue only' }));

    await screen.findByText('EMB-0001');
    expect(screen.queryByText('EMB-0002')).toBeNull();
    expect(
      fetchMock.mock.calls.some(([input]) => String(input) === '/api/custodian/loans?overdue=true'),
    ).toBe(true);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Overdue only' }));
    expect(await screen.findByText('EMB-0002')).toBeInTheDocument();
  });

  it('shows its own empty sentence when no loan is overdue', async () => {
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ items: [custodianLoan(2, 'EMB-0002', '2026-11-12', false)] }),
      [OVERDUE_LIST]: () => json({ items: [] }),
    });
    renderApp('/custodian/loans');

    await screen.findByText('EMB-0002');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Overdue only' }));

    expect(await screen.findByText('No overdue loans in your labs.')).toBeInTheDocument();
  });
});
