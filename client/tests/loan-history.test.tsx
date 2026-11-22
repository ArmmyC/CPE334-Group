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

function item(
  id: number,
  status: 'ACTIVE' | 'RETURNED',
  extra: { returnNote?: string; renewed?: boolean } = {},
) {
  return {
    id,
    borrower: { id: 3, name: 'Arisa Kittipong' },
    assetTag: 'EMB-1',
    equipmentType: { id: 5, name: 'Logic analyzer' },
    lab,
    checkedOutAt: '2026-11-03T08:30:00.000Z',
    dueDate: '2026-11-10',
    status,
    returnedAt: status === 'RETURNED' ? '2026-11-09T05:00:00.000Z' : null,
    returnNote: extra.returnNote ?? null,
    renewed: extra.renewed ?? false,
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

const asCustodian = { 'GET /api/auth/me': () => json(custodian) };
const COPY = 'GET /api/custodian/copies/11/loans';
const BORROWER = 'GET /api/custodian/borrowers/3/loans';

describe('TEST-F18-05 the loan history pages (AC-F18-05, FR-20, SR-02)', () => {
  it('shows the loans of a copy with status, return time, note, and the renewed mark', async () => {
    stubApi({
      ...asCustodian,
      [COPY]: () =>
        json({
          items: [
            item(9, 'ACTIVE', { renewed: true }),
            item(8, 'RETURNED', { returnNote: 'Scratched case.' }),
          ],
          nextBeforeId: null,
        }),
    });
    renderApp('/custodian/copies/11/loans');

    expect(await screen.findByRole('heading', { name: 'Loan history of a copy' })).toBeVisible();
    const active = (await screen.findAllByRole('row'))[1]!;
    expect(within(active).getByText('Active')).toBeInTheDocument();
    expect(within(active).getByText('Renewed')).toBeInTheDocument();
    const returned = screen.getByText('Scratched case.').closest('tr')!;
    expect(within(returned).getByText('Returned')).toBeInTheDocument();
    expect(within(returned).getByText('Arisa Kittipong')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('shows the loans of a borrower and loads the next page with beforeId', async () => {
    const fetchMock = stubApi({
      ...asCustodian,
      [BORROWER]: () => json({ items: [item(9, 'ACTIVE')], nextBeforeId: 9 }),
      [`${BORROWER}?beforeId=9`]: () =>
        json({ items: [item(7, 'RETURNED', { returnNote: 'Older loan.' })], nextBeforeId: null }),
    });
    renderApp('/custodian/borrowers/3/loans');

    expect(
      await screen.findByRole('heading', { name: 'Loan history of a borrower' }),
    ).toBeVisible();
    await screen.findByText('Active');
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Older loan.')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('?beforeId=9'))).toBe(
      true,
    );
  });

  it('shows the empty sentence', async () => {
    stubApi({ ...asCustodian, [COPY]: () => json({ items: [], nextBeforeId: null }) });
    renderApp('/custodian/copies/11/loans');

    expect(await screen.findByText('No loans yet.')).toBeInTheDocument();
  });

  it('shows the error with a Retry button that sends the request again', async () => {
    let attempts = 0;
    stubApi({
      ...asCustodian,
      [COPY]: () => {
        attempts += 1;
        return attempts === 1
          ? json({ error: { code: 'NOT_FOUND', message: 'This copy could not be found.' } }, 404)
          : json({ items: [item(9, 'ACTIVE')], nextBeforeId: null });
      },
    });
    renderApp('/custodian/copies/11/loans');

    expect(await screen.findByText('This copy could not be found.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Active')).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it('opens the copy history from the copies page', async () => {
    stubApi({
      ...asCustodian,
      'GET /api/custodian/copies': () =>
        json({
          items: [
            {
              id: 11,
              assetTag: 'EMB-1',
              status: 'AVAILABLE',
              equipmentType: { id: 5, name: 'Logic analyzer' },
              lab,
            },
          ],
        }),
      [COPY]: () => json({ items: [item(9, 'ACTIVE')], nextBeforeId: null }),
    });
    renderApp('/custodian/copies');

    await userEvent.click(await screen.findByRole('link', { name: 'History of EMB-1' }));

    expect(await screen.findByRole('heading', { name: 'Loan history of a copy' })).toBeVisible();
  });

  it('opens the borrower history from the borrower name on the active loans page', async () => {
    stubApi({
      ...asCustodian,
      'GET /api/custodian/loans': () =>
        json({
          items: [
            {
              id: 9,
              borrower: { id: 3, name: 'Arisa Kittipong' },
              equipmentType: { id: 5, name: 'Logic analyzer' },
              lab,
              assetTag: 'EMB-1',
              checkedOutAt: '2026-11-03T08:30:00.000Z',
              dueDate: '2026-11-10',
              status: 'ACTIVE',
              overdue: false,
              renewed: false,
            },
          ],
        }),
      [BORROWER]: () => json({ items: [item(9, 'ACTIVE')], nextBeforeId: null }),
    });
    renderApp('/custodian/loans');

    await userEvent.click(await screen.findByRole('link', { name: 'Arisa Kittipong' }));

    expect(
      await screen.findByRole('heading', { name: 'Loan history of a borrower' }),
    ).toBeVisible();
  });
});
