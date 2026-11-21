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

function loan(id: number, tag: string) {
  return {
    id,
    borrower: { id: 100 + id, name: `Borrower ${id}` },
    equipmentType: { id: 10 + id, name: `Type ${id}` },
    lab: { id: 1, name: 'Embedded Systems Lab' },
    assetTag: tag,
    checkedOutAt: '2026-11-03T08:30:00.000Z',
    dueDate: '2026-11-12',
    status: 'ACTIVE',
    overdue: false,
  };
}

type Handler = (init?: RequestInit) => Response | Promise<Response>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorBody(status: number, code: string, message: string, fields?: object) {
  return json({ error: { code, message, ...(fields ? { fields } : {}) } }, status);
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
const RETURN = 'POST /api/custodian/loans/1/return';

describe('TEST-F09-07 the return dialog (AC-F09-07, FR-12, SR-02)', () => {
  it('asks for a note, then returns the loan, shows the success message, and removes the row', async () => {
    let reloaded = false;
    const fetchMock = stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () =>
        json({
          items: reloaded ? [loan(2, 'EMB-0002')] : [loan(1, 'EMB-0001'), loan(2, 'EMB-0002')],
        }),
      [RETURN]: () => {
        reloaded = true;
        return json({
          id: 1,
          status: 'RETURNED',
          returnedAt: '2026-11-10T05:00:00.000Z',
          copy: { id: 5, assetTag: 'EMB-0001', status: 'AVAILABLE' },
        });
      },
    });
    renderApp();

    await screen.findByText('EMB-0001');
    await userEvent.click(
      within(screen.getByRole('row', { name: /EMB-0001/ })).getByRole('button', { name: 'Return' }),
    );
    const dialog = await screen.findByRole('dialog');

    // An empty note is stopped in the page, and no request is sent.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm return' }));
    expect(
      await within(dialog).findByText('Enter a note about the condition.'),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/return'))).toBe(false);

    await userEvent.type(within(dialog).getByLabelText('Note'), 'Works fine.');
    await userEvent.click(within(dialog).getByLabelText('Copy is damaged'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm return' }));

    expect(await screen.findByText('Returned EMB-0001.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('EMB-0001', { selector: 'td' })).toBeNull();
    const call = fetchMock.mock.calls.find(([input]) => String(input).includes('/return'))!;
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({
      note: 'Works fine.',
      damaged: true,
    });
  });

  it('shows the field message from a 400 and keeps the dialog open', async () => {
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ items: [loan(1, 'EMB-0001')] }),
      [RETURN]: () =>
        errorBody(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', {
          note: 'Use a note of at most 500 characters.',
        }),
    });
    renderApp();

    await screen.findByText('EMB-0001');
    await userEvent.click(screen.getByRole('button', { name: 'Return' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Note'), 'Something.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm return' }));

    expect(
      await within(dialog).findByText('Use a note of at most 500 characters.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows the 409 message, closes the dialog, and reloads the list', async () => {
    let reloaded = false;
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ items: reloaded ? [] : [loan(1, 'EMB-0001')] }),
      [RETURN]: () => {
        reloaded = true;
        return errorBody(409, 'INVALID_STATUS', 'This loan was already returned.');
      },
    });
    renderApp();

    await screen.findByText('EMB-0001');
    await userEvent.click(screen.getByRole('button', { name: 'Return' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Note'), 'Late.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm return' }));

    expect(await screen.findByText('This loan was already returned.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText('No active loans in your labs.')).toBeInTheDocument();
  });
});
