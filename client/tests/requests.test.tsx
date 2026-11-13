import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { RequestForm } from '../src/RequestForm';

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

const pendingRequest = {
  id: 10,
  equipmentType: { id: 4, name: 'Oscilloscope' },
  lab: { name: 'Embedded Lab' },
  purpose: 'Sensor test',
  status: 'PENDING',
  createdAt: '2026-11-06T03:00:00.000Z',
  decidedAt: null,
};

const activeLoan = {
  id: 2,
  equipmentType: { id: 5, name: 'Logic analyzer' },
  assetTag: 'LA-0002',
  checkedOutAt: '2026-11-05T03:00:00.000Z',
  dueDate: '2026-11-12',
  status: 'ACTIVE',
};

type Handler = (init?: RequestInit) => Response | Promise<Response>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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

describe('TEST-F03-04 my requests and loans in the UI (AC-F03-04, FR-07)', () => {
  it('shows my requests and loans with status, purpose, asset tag, and due date', async () => {
    stubApi({
      'GET /api/auth/me': () => json(borrower),
      'GET /api/requests': () => json([pendingRequest]),
      'GET /api/loans': () => json([activeLoan]),
    });
    renderApp('/my');

    expect(
      await screen.findByRole('heading', { name: 'My requests and loans' }),
    ).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /Oscilloscope/ });
    expect(within(row).getByText('Sensor test')).toBeInTheDocument();
    expect(within(row).getByText('Pending')).toBeInTheDocument();
    const loanRow = screen.getByRole('row', { name: /Logic analyzer/ });
    expect(within(loanRow).getByText('LA-0002')).toBeInTheDocument();
    expect(within(loanRow).getByText('2026-11-12')).toBeInTheDocument();
  });

  it('shows the empty states when there are no requests and no loans', async () => {
    stubApi({
      'GET /api/auth/me': () => json(borrower),
      'GET /api/requests': () => json([]),
      'GET /api/loans': () => json([]),
    });
    renderApp('/my');

    expect(await screen.findByText('You have no requests yet.')).toBeInTheDocument();
    expect(screen.getByText('You have no loans.')).toBeInTheDocument();
  });

  it('shows an error state with a retry when the lists cannot load', async () => {
    const fetchMock = stubApi({
      'GET /api/auth/me': () => json(borrower),
      'GET /api/requests': () => json({ error: { code: 'INTERNAL_ERROR', message: 'x' } }, 500),
      'GET /api/loans': () => json([]),
    });
    renderApp('/my');

    expect(await screen.findByText('Could not load your requests and loans.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(calls(fetchMock, 'GET /api/requests').length).toBeGreaterThan(0);
  });
});

describe('TEST-F03-06 cancel a Pending request in the UI (AC-F03-06, FR-10)', () => {
  it('cancels the request and shows it as Cancelled after the list reloads', async () => {
    let requests: Record<string, unknown>[] = [pendingRequest];
    const fetchMock = stubApi({
      'GET /api/auth/me': () => json(borrower),
      'GET /api/requests': () => json(requests),
      'GET /api/loans': () => json([]),
      'POST /api/requests/10/cancel': () => {
        requests = [
          { ...pendingRequest, status: 'CANCELLED', decidedAt: '2026-11-07T01:00:00.000Z' },
        ];
        return json(requests[0]);
      },
    });
    renderApp('/my');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Cancel request for Oscilloscope' }),
    );

    expect(await screen.findByText('Cancelled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cancel request for/ })).toBeNull();
    expect(calls(fetchMock, 'POST /api/requests/10/cancel')).toHaveLength(1);
  });

  it('shows the API message above the list when the cancel is refused', async () => {
    stubApi({
      'GET /api/auth/me': () => json(borrower),
      'GET /api/requests': () => json([pendingRequest]),
      'GET /api/loans': () => json([]),
      'POST /api/requests/10/cancel': () =>
        json(
          {
            error: { code: 'INVALID_STATUS', message: 'This request can no longer be cancelled.' },
          },
          409,
        ),
    });
    renderApp('/my');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Cancel request for Oscilloscope' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This request can no longer be cancelled.',
    );
  });
});

describe('TEST-F03-01 submit a request in the UI (AC-F03-01, FR-06)', () => {
  it('sends the purpose and shows the success message', async () => {
    const fetchMock = stubApi({
      'POST /api/requests': () => json(pendingRequest, 201),
    });
    render(
      <MemoryRouter>
        <RequestForm equipmentTypeId={4} />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText('Purpose (optional)'), 'Sensor test');
    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Request submitted.');
    const [[, init]] = calls(fetchMock, 'POST /api/requests');
    expect(JSON.parse(String(init?.body))).toEqual({ equipmentTypeId: 4, purpose: 'Sensor test' });
  });

  it('shows the purpose limit message and sends nothing when the purpose is too long', async () => {
    const fetchMock = stubApi({});
    render(
      <MemoryRouter>
        <RequestForm equipmentTypeId={4} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Purpose (optional)'), {
      target: { value: 'x'.repeat(501) },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }));

    expect(await screen.findByText('Use a purpose of at most 500 characters.')).toBeInTheDocument();
    expect(calls(fetchMock, 'POST /api/requests')).toHaveLength(0);
  });

  it('shows a duplicate refusal above the form', async () => {
    stubApi({
      'POST /api/requests': () =>
        json(
          {
            error: {
              code: 'DUPLICATE_REQUEST',
              message:
                'You already have a Pending request or an active loan for this equipment type.',
            },
          },
          409,
        ),
    });
    render(
      <MemoryRouter>
        <RequestForm equipmentTypeId={4} />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You already have a Pending request or an active loan for this equipment type.',
    );
  });
});

describe('Route and header for borrow requests (FR-06, FR-07, BR-16)', () => {
  it('shows a My requests link in the header to a borrower', async () => {
    stubApi({ 'GET /api/auth/me': () => json(borrower) });
    renderApp('/catalog');

    expect(await screen.findByRole('link', { name: 'My requests' })).toBeInTheDocument();
  });

  it('sends a custodian away from the borrower page', async () => {
    stubApi({ 'GET /api/auth/me': () => json(custodian) });
    renderApp('/my');

    expect(await screen.findByRole('heading', { name: 'Pending requests' })).toBeInTheDocument();
  });
});
