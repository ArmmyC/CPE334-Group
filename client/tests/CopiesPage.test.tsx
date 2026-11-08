import { render, screen, waitFor, within } from '@testing-library/react';
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

const lab = { id: 1, name: 'Embedded Systems Lab' };
const arduino = { id: 1, name: 'Arduino Uno R3' };

function copy(id: number, assetTag: string, status: string) {
  return { id, assetTag, status, equipmentType: arduino, lab };
}

const available = copy(11, 'EMB-ARD-001', 'AVAILABLE');
const maintenance = copy(12, 'EMB-ARD-003', 'IN_MAINTENANCE');
const onLoan = copy(13, 'EMB-ARD-004', 'ON_LOAN');
const retired = copy(14, 'EMB-ARD-005', 'RETIRED');

type Handler = (init?: RequestInit) => Response | Promise<Response>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function apiFailure(code: string, message: string, status: number, fields?: object) {
  return json({ error: { code, message, ...(fields ? { fields } : {}) } }, status);
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

function calls(fetchMock: ReturnType<typeof stubApi>, key: string) {
  return fetchMock.mock.calls.filter(
    ([input, init]) => `${init?.method ?? 'GET'} ${String(input)}` === key,
  );
}

const LIST = 'GET /api/custodian/copies';
const PATCH_11 = 'PATCH /api/custodian/copies/11';

function row(assetTag: string) {
  return screen.getByRole('row', { name: new RegExp(assetTag) });
}

describe('TEST-F06-01 switching a copy in the UI (AC-F06-01)', () => {
  it('sends the PATCH only after Confirm, shows a success message, and reloads the list', async () => {
    let listed = 0;
    const fetchMock = stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => {
        listed += 1;
        return json({
          items: [listed === 1 ? available : { ...available, status: 'IN_MAINTENANCE' }],
        });
      },
      [PATCH_11]: () => json({ ...available, status: 'IN_MAINTENANCE' }),
    });
    renderApp('/custodian/copies');

    await userEvent.click(await screen.findByRole('button', { name: 'Set In maintenance' }));

    expect(screen.getByText('Change EMB-ARD-001 to In maintenance?')).toBeInTheDocument();
    expect(calls(fetchMock, PATCH_11)).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'EMB-ARD-001 is now In maintenance.',
    );
    const [, init] = calls(fetchMock, PATCH_11)[0];
    expect(JSON.parse(String(init?.body))).toEqual({ status: 'IN_MAINTENANCE' });
    await waitFor(() => expect(listed).toBe(2));
    expect(await screen.findByRole('button', { name: 'Set Available' })).toBeInTheDocument();
  });

  it('shows the copies with lab, equipment, asset tag, and status', async () => {
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ items: [available] }),
    });
    renderApp('/custodian/copies');

    expect(await screen.findByRole('heading', { name: 'Copies' })).toBeInTheDocument();
    const cells = within(await screen.findByRole('row', { name: /EMB-ARD-001/ }));
    expect(cells.getByText('Embedded Systems Lab')).toBeInTheDocument();
    expect(cells.getByText('Arduino Uno R3')).toBeInTheDocument();
    expect(cells.getByText('Available')).toBeInTheDocument();
  });
});

describe('Supporting check: actions by status', () => {
  it('offers the switch that fits the status, and none for On loan and Retired', async () => {
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ items: [available, maintenance, onLoan, retired] }),
    });
    renderApp('/custodian/copies');

    await screen.findByRole('row', { name: /EMB-ARD-001/ });

    expect(
      within(row('EMB-ARD-001')).getByRole('button', { name: 'Set In maintenance' }),
    ).toBeInTheDocument();
    expect(
      within(row('EMB-ARD-003')).getByRole('button', { name: 'Set Available' }),
    ).toBeInTheDocument();
    for (const tag of ['EMB-ARD-004', 'EMB-ARD-005']) {
      expect(within(row(tag)).queryByRole('button')).toBeNull();
      expect(within(row(tag)).getByText('Cannot change')).toBeInTheDocument();
    }
    expect(within(row('EMB-ARD-004')).getByText('On loan')).toBeInTheDocument();
    expect(within(row('EMB-ARD-005')).getByText('Retired')).toBeInTheDocument();
  });

  it('closes the confirmation on Cancel and sends nothing', async () => {
    const fetchMock = stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ items: [available] }),
    });
    renderApp('/custodian/copies');

    await userEvent.click(await screen.findByRole('button', { name: 'Set In maintenance' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText(/Change EMB-ARD-001/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Set In maintenance' })).toBeInTheDocument();
    expect(calls(fetchMock, PATCH_11)).toHaveLength(0);
  });
});

describe('Supporting check: loading, empty, and error states (AC-SR02-03)', () => {
  it('shows Loading... while the list request is in flight', async () => {
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => new Promise<Response>(() => {}),
    });
    renderApp('/custodian/copies');

    await screen.findByRole('heading', { name: 'Copies' });
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows the empty sentence', async () => {
    stubApi({ 'GET /api/auth/me': () => json(custodian), [LIST]: () => json({ items: [] }) });
    renderApp('/custodian/copies');

    expect(await screen.findByText('No copies in your labs.')).toBeInTheDocument();
  });

  it('shows the error with a Retry button that sends the request again', async () => {
    let attempts = 0;
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => {
        attempts += 1;
        return attempts === 1
          ? apiFailure('INTERNAL_ERROR', 'Something went wrong.', 500)
          : json({ items: [available] });
      },
    });
    renderApp('/custodian/copies');

    expect(await screen.findByText('Could not load copies.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('row', { name: /EMB-ARD-001/ })).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it('returns to the login page when the list answers 401', async () => {
    let signedIn = true;
    stubApi({
      'GET /api/auth/me': () =>
        signedIn ? json(custodian) : apiFailure('UNAUTHENTICATED', 'Sign in to continue.', 401),
      [LIST]: () => {
        signedIn = false;
        return apiFailure('UNAUTHENTICATED', 'Sign in to continue.', 401);
      },
    });
    renderApp('/custodian/copies');

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });
});

describe('Supporting check: refusal messages (AC-SR02-02)', () => {
  it('shows a 409 message above the table and reloads the list', async () => {
    let listed = 0;
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => {
        listed += 1;
        return json({ items: [listed === 1 ? available : { ...available, status: 'ON_LOAN' }] });
      },
      [PATCH_11]: () =>
        apiFailure('INVALID_STATUS', 'A copy that is on loan cannot be changed.', 409),
    });
    renderApp('/custodian/copies');

    await userEvent.click(await screen.findByRole('button', { name: 'Set In maintenance' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A copy that is on loan cannot be changed.',
    );
    await waitFor(() => expect(listed).toBe(2));
    expect(
      await within(await screen.findByRole('row', { name: /EMB-ARD-001/ })).findByText('On loan'),
    ).toBeInTheDocument();
  });

  it('shows a status field message in the row', async () => {
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ items: [available] }),
      [PATCH_11]: () =>
        apiFailure('VALIDATION_ERROR', 'Check the highlighted fields.', 400, {
          status: 'Choose Available or In maintenance.',
        }),
    });
    renderApp('/custodian/copies');

    await userEvent.click(await screen.findByRole('button', { name: 'Set In maintenance' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(
      await within(row('EMB-ARD-001')).findByText('Choose Available or In maintenance.'),
    ).toBeInTheDocument();
  });
});

describe('Supporting check: header link and route guard', () => {
  it('shows the Copies link to a custodian and not to a borrower', async () => {
    stubApi({ 'GET /api/auth/me': () => json(custodian), [LIST]: () => json({ items: [] }) });
    const first = renderApp('/custodian/copies');

    const link = await within(await screen.findByRole('banner')).findByRole('link', {
      name: 'Copies',
    });
    expect(link).toHaveAttribute('href', '/custodian/copies');
    first.unmount();

    stubApi({ 'GET /api/auth/me': () => json(borrower) });
    renderApp('/catalog');

    await within(await screen.findByRole('banner')).findByText('Arisa Kittipong');
    expect(within(screen.getByRole('banner')).queryByRole('link', { name: 'Copies' })).toBeNull();
  });

  it('sends a borrower at /custodian/copies to the catalog', async () => {
    const fetchMock = stubApi({ 'GET /api/auth/me': () => json(borrower) });

    renderApp('/custodian/copies');

    expect(await screen.findByRole('heading', { name: 'Equipment catalog' })).toBeInTheDocument();
    expect(calls(fetchMock, LIST)).toHaveLength(0);
  });
});
