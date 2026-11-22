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

const loan = {
  id: 1,
  borrower: { id: 101, name: 'Borrower 1' },
  equipmentType: { id: 11, name: 'Type 1' },
  lab: { id: 1, name: 'Embedded Systems Lab' },
  assetTag: 'EMB-0001',
  checkedOutAt: '2026-11-03T08:30:00.000Z',
  dueDate: '2026-11-12',
  status: 'ACTIVE',
  overdue: false,
  renewed: false,
};

const pending = {
  id: 10,
  borrower: { id: 110, name: 'Mali Chai' },
  equipmentType: { id: 210, name: 'Oscilloscope' },
  lab: { id: 1, name: 'Embedded Systems Lab' },
  purpose: null,
  createdAt: '2026-11-06T03:00:00.000Z',
};

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
const UNREADABLE = 'The request went through, but the answer was unreadable. Reload to check.';

describe('TEST-HARDEN-01 a 2xx answer that cannot be read is not a network failure', () => {
  it('says the return went through, not that the server could not be reached', async () => {
    stubApi({
      ...asCustodian,
      'GET /api/custodian/loans': () => json({ items: [loan] }),
      'POST /api/custodian/loans/1/return': () => json({ unexpected: true }),
    });
    renderApp('/custodian/loans');

    await userEvent.click(await screen.findByRole('button', { name: /^Return/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Note'), 'Fine.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm return' }));

    expect(await within(dialog).findByText(UNREADABLE)).toBeInTheDocument();
    expect(screen.queryByText('Could not reach the server.')).toBeNull();
  });

  it('says the rejection went through, not that the server could not be reached', async () => {
    stubApi({
      ...asCustodian,
      'GET /api/custodian/requests?status=PENDING': () => json({ items: [pending] }),
      'POST /api/custodian/requests/10/reject': () => json({ unexpected: true }),
    });
    renderApp('/custodian/requests');

    await userEvent.click(await screen.findByRole('button', { name: /^Reject/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Not available.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm reject' }));

    expect(await within(dialog).findByText(UNREADABLE)).toBeInTheDocument();
    expect(screen.queryByText('Could not reach the server.')).toBeNull();
  });
});

describe('TEST-HARDEN-02 dialogs keep focus inside and give it back on close', () => {
  it('cycles Tab and Shift+Tab inside the return dialog and restores focus on Escape', async () => {
    stubApi({
      ...asCustodian,
      'GET /api/custodian/loans': () => json({ items: [loan] }),
    });
    renderApp('/custodian/loans');

    const opener = await screen.findByRole('button', { name: /^Return/ });
    await userEvent.click(opener);
    const dialog = await screen.findByRole('dialog');

    for (let i = 0; i < 8; i += 1) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < 8; i += 1) {
      await userEvent.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });
});
