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

const lab = { id: 1, name: 'Embedded Systems Lab' };

function entry(
  id: number,
  entityType: 'REQUEST' | 'LOAN' | 'COPY',
  subject: string,
  oldStatus: string | null,
  newStatus: string,
) {
  return {
    id,
    entityType,
    entityId: id + 100,
    subject,
    oldStatus,
    newStatus,
    createdAt: '2026-11-10T05:00:00.000Z',
    actor: { id: 1, name: 'Napat Srisuk' },
    lab,
  };
}

const requestEntry = entry(
  9,
  'REQUEST',
  'Request #3: Oscilloscope for Mali Chai',
  'PENDING',
  'FULFILLED',
);
const copyEntry = entry(8, 'COPY', 'EMB-ARD-001 (Arduino Uno R3)', null, 'AVAILABLE');
const loanEntry = entry(7, 'LOAN', 'Loan #2: EMB-ARD-004 to Mali Chai', 'ACTIVE', 'RETURNED');
const maintenanceEntry = entry(
  6,
  'COPY',
  'EMB-ARD-003 (Arduino Uno R3)',
  'AVAILABLE',
  'IN_MAINTENANCE',
);

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

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/custodian/history']}>
      <App />
    </MemoryRouter>,
  );
}

const ALL = 'GET /api/custodian/history';

describe('TEST-F14-07 the history page (AC-F14-07, FR-17, SR-02)', () => {
  it('shows each entry with its subject, change, actor, and lab', async () => {
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [ALL]: () => json({ items: [requestEntry, copyEntry, maintenanceEntry], nextBeforeId: null }),
    });
    renderApp();

    const request = (await screen.findByText('Request #3: Oscilloscope for Mali Chai')).closest(
      'tr',
    )!;
    expect(within(request).getByText('Request')).toBeInTheDocument();
    expect(within(request).getByText('Pending to Fulfilled')).toBeInTheDocument();
    expect(within(request).getByText('Napat Srisuk')).toBeInTheDocument();
    expect(within(request).getByText('Embedded Systems Lab')).toBeInTheDocument();
    const created = screen.getByText('EMB-ARD-001 (Arduino Uno R3)').closest('tr')!;
    expect(within(created).getByText('New: Available')).toBeInTheDocument();
    const maintenance = screen.getByText('EMB-ARD-003 (Arduino Uno R3)').closest('tr')!;
    expect(within(maintenance).getByText('Available to In maintenance')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('filters by type and sends entityType', async () => {
    const fetchMock = stubApi({
      'GET /api/auth/me': () => json(custodian),
      [ALL]: () => json({ items: [requestEntry, loanEntry], nextBeforeId: null }),
      [`${ALL}?entityType=LOAN`]: () => json({ items: [loanEntry], nextBeforeId: null }),
    });
    renderApp();
    await screen.findByText('Request #3: Oscilloscope for Mali Chai');

    await userEvent.selectOptions(screen.getByLabelText('Type'), 'Loans');

    expect(await screen.findByText('Active to Returned')).toBeInTheDocument();
    expect(screen.queryByText('Request #3: Oscilloscope for Mali Chai')).toBeNull();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('entityType=LOAN'))).toBe(
      true,
    );
  });

  it('loads the next page with beforeId and appends it', async () => {
    const fetchMock = stubApi({
      'GET /api/auth/me': () => json(custodian),
      [ALL]: () => json({ items: [requestEntry, copyEntry], nextBeforeId: 8 }),
      [`${ALL}?beforeId=8`]: () => json({ items: [loanEntry], nextBeforeId: null }),
    });
    renderApp();
    await screen.findByText('Request #3: Oscilloscope for Mali Chai');

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Loan #2: EMB-ARD-004 to Mali Chai')).toBeInTheDocument();
    expect(screen.getByText('Request #3: Oscilloscope for Mali Chai')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('?beforeId=8'))).toBe(
      true,
    );
  });

  it('shows the empty sentence', async () => {
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [ALL]: () => json({ items: [], nextBeforeId: null }),
    });
    renderApp();

    expect(await screen.findByText('No history yet.')).toBeInTheDocument();
  });

  it('shows the error with a Retry button that sends the request again', async () => {
    let attempts = 0;
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [ALL]: () => {
        attempts += 1;
        return attempts === 1
          ? json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } }, 500)
          : json({ items: [copyEntry], nextBeforeId: null });
      },
    });
    renderApp();

    expect(await screen.findByText('Something went wrong.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('EMB-ARD-001 (Arduino Uno R3)')).toBeInTheDocument();
    expect(attempts).toBe(2);
  });
});
