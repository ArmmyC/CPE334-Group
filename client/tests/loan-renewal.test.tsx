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

function loan(id: number, assetTag: string, dueDate: string, renewed: boolean) {
  return {
    id,
    borrower: { id: 100 + id, name: `Borrower ${id}` },
    equipmentType: { id: 10 + id, name: 'Logic analyzer' },
    lab,
    assetTag,
    checkedOutAt: '2026-11-03T08:30:00.000Z',
    dueDate,
    status: 'ACTIVE',
    overdue: false,
    renewed,
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

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/custodian/loans']}>
      <App />
    </MemoryRouter>,
  );
}

const LIST = 'GET /api/custodian/loans';
const asCustodian = { 'GET /api/auth/me': () => json(custodian) };

describe('TEST-F16-07 the renew button (AC-F16-07, FR-18, SR-02)', () => {
  it('shows Renewed instead of a button for a renewed loan', async () => {
    stubApi({
      ...asCustodian,
      [LIST]: () =>
        json({
          items: [loan(7, 'EMB-1', '2026-11-20', true), loan(8, 'EMB-2', '2026-11-13', false)],
        }),
    });
    renderApp();

    const renewedRow = (await screen.findByText('EMB-1')).closest('tr')!;
    const freshRow = screen.getByText('EMB-2').closest('tr')!;

    expect(within(renewedRow).getByText('Renewed')).toBeInTheDocument();
    expect(within(renewedRow).queryByRole('button', { name: 'Renew' })).toBeNull();
    expect(within(freshRow).getByRole('button', { name: 'Renew' })).toBeInTheDocument();
  });

  it('renews, shows the new due date, and reloads the list', async () => {
    let renewed = false;
    const fetchMock = stubApi({
      ...asCustodian,
      [LIST]: () =>
        json({ items: [loan(7, 'EMB-1', renewed ? '2026-11-20' : '2026-11-13', renewed)] }),
      'POST /api/custodian/loans/7/renew': () => {
        renewed = true;
        return json({ id: 7, dueDate: '2026-11-20', renewedAt: '2026-11-10T05:00:00.000Z' });
      },
    });
    renderApp();
    await screen.findByText('EMB-1');

    await userEvent.click(screen.getByRole('button', { name: 'Renew' }));

    expect(await screen.findByText('Renewed EMB-1. New due date 2026-11-20.')).toBeInTheDocument();
    expect(await screen.findByText('Renewed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Renew' })).toBeNull();
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input) === '/api/custodian/loans').length,
    ).toBe(2);
  });

  it('shows the server message on a 409 and reloads the list', async () => {
    stubApi({
      ...asCustodian,
      [LIST]: () => json({ items: [loan(7, 'EMB-1', '2026-11-13', false)] }),
      'POST /api/custodian/loans/7/renew': () =>
        json(
          { error: { code: 'LOAN_OVERDUE', message: 'An overdue loan cannot be renewed.' } },
          409,
        ),
    });
    renderApp();
    await screen.findByText('EMB-1');

    await userEvent.click(screen.getByRole('button', { name: 'Renew' }));

    expect(await screen.findByText('An overdue loan cannot be renewed.')).toBeInTheDocument();
  });

  it('shows Loan not found on a 404', async () => {
    stubApi({
      ...asCustodian,
      [LIST]: () => json({ items: [loan(7, 'EMB-1', '2026-11-13', false)] }),
      'POST /api/custodian/loans/7/renew': () =>
        json({ error: { code: 'NOT_FOUND', message: 'This loan could not be found.' } }, 404),
    });
    renderApp();
    await screen.findByText('EMB-1');

    await userEvent.click(screen.getByRole('button', { name: 'Renew' }));

    expect(await screen.findByText('Loan not found.')).toBeInTheDocument();
  });
});
