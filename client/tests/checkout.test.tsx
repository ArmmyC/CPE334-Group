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

function pending(id: number, name: string, borrowerName: string, purpose: string | null = null) {
  return {
    id,
    borrower: { id: id + 100, name: borrowerName },
    equipmentType: { id: id + 200, name },
    lab: { id: 1, name: 'Embedded Systems Lab' },
    purpose,
    createdAt: '2026-11-06T03:00:00.000Z',
  };
}

const oscilloscope = pending(10, 'Oscilloscope', 'Mali Chai', 'Sensor test');
const analyzer = pending(11, 'Logic analyzer', 'Somchai Dee');

const loanResult = {
  id: 5,
  requestId: 10,
  borrower: { id: 110, name: 'Mali Chai' },
  equipmentType: { id: 210, name: 'Oscilloscope' },
  lab: { id: 1, name: 'Embedded Systems Lab' },
  assetTag: 'OSC-0002',
  checkedOutAt: '2026-11-08T03:00:00.000Z',
  dueDate: '2026-11-15',
  status: 'ACTIVE',
};

type Handler = (init?: RequestInit) => Response | Promise<Response>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorBody(code: string, message: string, fields?: Record<string, string>, status = 409) {
  return json({ error: { code, message, fields } }, status);
}

// Routes each call by "METHOD /path". The app also calls /api/health on the login page.
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

function calls(fetchMock: ReturnType<typeof stubApi>, key: string) {
  return fetchMock.mock.calls.filter(
    ([input, init]) => `${init?.method ?? 'GET'} ${String(input)}` === key,
  );
}

const LIST = 'GET /api/custodian/requests?status=PENDING';

describe('TEST-F04-01 pending requests in the UI (AC-F04-01, FR-08)', () => {
  it('shows the pending requests in the order the API returns them', async () => {
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ items: [oscilloscope, analyzer] }),
    });
    renderApp('/custodian/requests');

    expect(await screen.findByRole('heading', { name: 'Pending requests' })).toBeInTheDocument();
    const rows = await screen.findAllByRole('row');
    expect(rows).toHaveLength(3);
    const first = within(rows[1]);
    expect(first.getByText('Mali Chai')).toBeInTheDocument();
    expect(first.getByText('Oscilloscope')).toBeInTheDocument();
    expect(first.getByText('Embedded Systems Lab')).toBeInTheDocument();
    expect(first.getByText('Sensor test')).toBeInTheDocument();
    expect(first.getByText('6 Nov 2026, 10:00')).toBeInTheDocument();
    const second = within(rows[2]);
    expect(second.getByText('Logic analyzer')).toBeInTheDocument();
    expect(second.getByText('None')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check out Oscilloscope' })).toBeInTheDocument();
  });

  it('shows the empty state when there are no pending requests', async () => {
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ items: [] }),
    });
    renderApp('/custodian/requests');

    expect(await screen.findByText('No pending requests in your labs.')).toBeInTheDocument();
  });

  it('shows the loading state while the list is in flight', async () => {
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => new Promise<Response>(() => {}),
    });
    renderApp('/custodian/requests');

    expect(await screen.findByText('Loading...')).toBeInTheDocument();
  });

  it('shows an error state with a Retry button that loads the list again', async () => {
    let fail = true;
    const fetchMock = stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () =>
        fail
          ? errorBody('INTERNAL_ERROR', 'Something went wrong.', undefined, 500)
          : json({ items: [oscilloscope] }),
    });
    renderApp('/custodian/requests');

    expect(await screen.findByText('Could not load pending requests.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Oscilloscope')).toBeInTheDocument();
    expect(calls(fetchMock, LIST)).toHaveLength(2);
  });

  it('sends a borrower away from the page', async () => {
    stubApi({ 'GET /api/auth/me': () => json(borrower) });
    renderApp('/custodian/requests');

    // The borrower header link shows once the guard has sent the borrower to their home page.
    expect(await screen.findByRole('link', { name: 'My requests' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pending requests' })).toBeNull();
  });
});

describe('TEST-F04-02 checkout through the copy dialog (AC-F04-02, FR-09)', () => {
  it('opens the dialog, sends the chosen copy, shows the success message, and reloads the list', async () => {
    let items = [oscilloscope, analyzer];
    const fetchMock = stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ items }),
      'GET /api/custodian/requests/10/available-copies': () =>
        json({
          items: [
            { id: 31, assetTag: 'OSC-0001' },
            { id: 32, assetTag: 'OSC-0002' },
          ],
        }),
      'POST /api/custodian/requests/10/checkout': () => {
        items = [analyzer];
        return json(loanResult, 201);
      },
    });
    renderApp('/custodian/requests');

    await userEvent.click(await screen.findByRole('button', { name: 'Check out Oscilloscope' }));
    const dialog = await screen.findByRole('dialog', { name: 'Check out Oscilloscope' });
    const confirm = within(dialog).getByRole('button', { name: 'Confirm checkout' });
    expect(await within(dialog).findByLabelText('OSC-0001')).toBeInTheDocument();
    expect(confirm).toBeDisabled();
    await userEvent.click(within(dialog).getByLabelText('OSC-0002'));
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Checked out OSC-0002 to Mali Chai. Due 2026-11-15.',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Oscilloscope')).toBeNull();
    expect(screen.getByText('Logic analyzer')).toBeInTheDocument();
    const [[, init]] = calls(fetchMock, 'POST /api/custodian/requests/10/checkout');
    expect(JSON.parse(String(init?.body))).toEqual({ copyId: 32 });
    expect(calls(fetchMock, LIST)).toHaveLength(2);
  });

  it('shows the empty state in the dialog when no copy is available, with no confirm button', async () => {
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ items: [oscilloscope] }),
      'GET /api/custodian/requests/10/available-copies': () => json({ items: [] }),
    });
    renderApp('/custodian/requests');

    await userEvent.click(await screen.findByRole('button', { name: 'Check out Oscilloscope' }));
    const dialog = await screen.findByRole('dialog', { name: 'Check out Oscilloscope' });

    expect(
      await within(dialog).findByText('No copies of this equipment are available right now.'),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Confirm checkout' })).toBeNull();
  });

  it('shows an error state with Retry when the copies cannot load', async () => {
    let fail = true;
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ items: [oscilloscope] }),
      'GET /api/custodian/requests/10/available-copies': () =>
        fail
          ? errorBody('INTERNAL_ERROR', 'Something went wrong.', undefined, 500)
          : json({ items: [{ id: 31, assetTag: 'OSC-0001' }] }),
    });
    renderApp('/custodian/requests');

    await userEvent.click(await screen.findByRole('button', { name: 'Check out Oscilloscope' }));
    const dialog = await screen.findByRole('dialog', { name: 'Check out Oscilloscope' });
    expect(await within(dialog).findByText('Could not load copies.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));

    expect(await within(dialog).findByLabelText('OSC-0001')).toBeInTheDocument();
  });

  it('shows a refusal above the choices and keeps the dialog open', async () => {
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ items: [oscilloscope] }),
      'GET /api/custodian/requests/10/available-copies': () =>
        json({ items: [{ id: 31, assetTag: 'OSC-0001' }] }),
      'POST /api/custodian/requests/10/checkout': () =>
        errorBody('COPY_NOT_AVAILABLE', 'This copy is not available.'),
    });
    renderApp('/custodian/requests');

    await userEvent.click(await screen.findByRole('button', { name: 'Check out Oscilloscope' }));
    const dialog = await screen.findByRole('dialog', { name: 'Check out Oscilloscope' });
    await userEvent.click(await within(dialog).findByLabelText('OSC-0001'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm checkout' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'This copy is not available.',
    );
    expect(screen.getByRole('dialog', { name: 'Check out Oscilloscope' })).toBeInTheDocument();
  });

  it('shows a copyId field message under the choices (AC-SR02-02)', async () => {
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ items: [oscilloscope] }),
      'GET /api/custodian/requests/10/available-copies': () =>
        json({ items: [{ id: 31, assetTag: 'OSC-0001' }] }),
      'POST /api/custodian/requests/10/checkout': () =>
        errorBody(
          'VALIDATION_ERROR',
          'Check the highlighted fields.',
          { copyId: 'Choose a copy.' },
          400,
        ),
    });
    renderApp('/custodian/requests');

    await userEvent.click(await screen.findByRole('button', { name: 'Check out Oscilloscope' }));
    const dialog = await screen.findByRole('dialog', { name: 'Check out Oscilloscope' });
    await userEvent.click(await within(dialog).findByLabelText('OSC-0001'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm checkout' }));

    expect(await within(dialog).findByText('Choose a copy.')).toBeInTheDocument();
  });

  it('closes the dialog with Cancel and sends no checkout', async () => {
    const fetchMock = stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ items: [oscilloscope] }),
      'GET /api/custodian/requests/10/available-copies': () =>
        json({ items: [{ id: 31, assetTag: 'OSC-0001' }] }),
    });
    renderApp('/custodian/requests');

    await userEvent.click(await screen.findByRole('button', { name: 'Check out Oscilloscope' }));
    const dialog = await screen.findByRole('dialog', { name: 'Check out Oscilloscope' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls(fetchMock, 'POST /api/custodian/requests/10/checkout')).toHaveLength(0);
  });
});
