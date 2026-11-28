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

function pending(id: number, name: string, borrowerName: string) {
  return {
    id,
    borrower: { id: id + 100, name: borrowerName },
    equipmentType: { id: id + 200, name },
    lab: { id: 1, name: 'Embedded Systems Lab' },
    purpose: null,
    createdAt: '2026-11-06T03:00:00.000Z',
  };
}

const oscilloscope = pending(10, 'Oscilloscope', 'Mali Chai');
const analyzer = pending(11, 'Logic analyzer', 'Somchai Dee');

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

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

const LIST = 'GET /api/custodian/requests?status=PENDING';
const REJECT = 'POST /api/custodian/requests/10/reject';

describe('TEST-F08-07 the reject dialog (AC-F08-07, SR-02)', () => {
  it('asks for a reason, rejects the request, shows the success message, and removes the row', async () => {
    let reloaded = false;
    const fetchMock = stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ items: reloaded ? [analyzer] : [oscilloscope, analyzer] }),
      [REJECT]: () => {
        reloaded = true;
        return json({
          id: 10,
          status: 'REJECTED',
          rejectionReason: 'Out for repair.',
          decidedAt: '2026-11-10T05:00:00.000Z',
        });
      },
    });
    renderApp('/custodian/requests');

    await userEvent.click(await screen.findByRole('button', { name: 'Reject Oscilloscope' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reject Oscilloscope' });

    // An empty reason is stopped in the page, and no request is sent.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm reject' }));
    expect(await within(dialog).findByText('Enter a reason.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/reject'))).toBe(false);

    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Out for repair.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm reject' }));

    expect(await screen.findByText('Rejected the request from Mali Chai.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Mali Chai', { selector: 'td' })).toBeNull();
    const call = fetchMock.mock.calls.find(([input]) => String(input).includes('/reject'))!;
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({
      reason: 'Out for repair.',
    });
  });

  it('shows the field message from a 400 and keeps the dialog open', async () => {
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ items: [oscilloscope] }),
      [REJECT]: () =>
        errorBody(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', {
          reason: 'Use a reason of at most 500 characters.',
        }),
    });
    renderApp('/custodian/requests');

    await userEvent.click(await screen.findByRole('button', { name: 'Reject Oscilloscope' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Something.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm reject' }));

    expect(
      await within(dialog).findByText('Use a reason of at most 500 characters.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows the 409 message, closes the dialog, and reloads the list', async () => {
    let reloaded = false;
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ items: reloaded ? [] : [oscilloscope] }),
      [REJECT]: () => {
        reloaded = true;
        return errorBody(409, 'INVALID_STATUS', 'This request is no longer pending.');
      },
    });
    renderApp('/custodian/requests');

    await userEvent.click(await screen.findByRole('button', { name: 'Reject Oscilloscope' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Late.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm reject' }));

    expect(await screen.findByText('This request is no longer pending.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText('No pending requests in your labs.')).toBeInTheDocument();
  });
});

describe('TEST-F08-05 the borrower sees the rejection reason (AC-F08-05, FR-11)', () => {
  it('shows the status Rejected and the reason on the request row', async () => {
    stubApi({
      'GET /api/auth/me': () => json(borrower),
      'GET /api/loans': () => json([]),
      'GET /api/requests': () =>
        json([
          {
            id: 7,
            equipmentType: { id: 210, name: 'Oscilloscope' },
            lab: { name: 'Embedded Systems Lab' },
            purpose: null,
            status: 'REJECTED',
            createdAt: '2026-11-06T03:00:00.000Z',
            decidedAt: '2026-11-07T03:00:00.000Z',
            rejectionReason: 'Out for repair.',
          },
        ]),
    });
    renderApp('/my');

    const row = within(await screen.findByRole('row', { name: /Oscilloscope/ }));
    expect(row.getByText('Rejected')).toBeInTheDocument();
    expect(row.getByText(/Out for repair\./)).toBeInTheDocument();
  });
});

describe('TEST-F08-09 an ended session and an unreadable success (SDS 4.2)', () => {
  const expired = () => errorBody(401, 'UNAUTHENTICATED', 'Sign in to continue.');

  async function confirmReject() {
    await userEvent.click(await screen.findByRole('button', { name: 'Reject Oscilloscope' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Late.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm reject' }));
    return dialog;
  }

  it('checks the session again when the reject answers 401', async () => {
    let signedIn = true;
    stubApi({
      'GET /api/auth/me': () => (signedIn ? json(custodian) : expired()),
      [LIST]: () => json({ items: [oscilloscope] }),
      [REJECT]: () => {
        signedIn = false;
        return expired();
      },
    });
    renderApp('/custodian/requests');
    await confirmReject();

    expect(await screen.findByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('checks the session again when the list load answers 401', async () => {
    let calls = 0;
    stubApi({
      'GET /api/auth/me': () => (++calls === 1 ? json(custodian) : expired()),
      [LIST]: expired,
    });
    renderApp('/custodian/requests');

    expect(await screen.findByRole('button', { name: 'Log in' })).toBeInTheDocument();
  });

  it('does not report a network failure when a 200 body is unreadable', async () => {
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ items: [oscilloscope] }),
      [REJECT]: () => json({ unexpected: true }),
    });
    renderApp('/custodian/requests');
    const dialog = await confirmReject();

    expect(
      await within(dialog).findByText(
        'The request went through, but the answer was unreadable. Reload to check.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText('Could not reach the server.')).toBeNull();
  });
});
