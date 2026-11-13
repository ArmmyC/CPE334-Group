import { render, screen, waitFor, within } from '@testing-library/react';
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

const catalog = {
  items: [
    {
      lab: { id: 1, name: 'Embedded Systems Lab' },
      equipmentTypes: [
        { id: 4, name: 'Arduino Uno R3', category: 'Boards', availableCount: 2 },
        { id: 5, name: 'Oscilloscope', category: 'Instruments', availableCount: 0 },
      ],
    },
    {
      lab: { id: 2, name: 'Network Lab' },
      equipmentTypes: [{ id: 6, name: 'Managed switch', category: 'Network', availableCount: 1 }],
    },
  ],
};

const detail = {
  id: 4,
  name: 'Arduino Uno R3',
  category: 'Boards',
  description: 'A microcontroller board for small projects.',
  loanPeriodDays: 14,
  lab: { id: 1, name: 'Embedded Systems Lab' },
  availableCount: 2,
};

type Handler = (init?: RequestInit) => Response | Promise<Response>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function apiFailure(status: number, code: string, message: string) {
  return json({ error: { code, message } }, status);
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

const asBorrower = { 'GET /api/auth/me': () => json(borrower) };

describe('TEST-F02-01 catalog page (AC-F02-01, FR-04)', () => {
  it('shows each lab as a heading with its types and Available counts', async () => {
    stubApi({ ...asBorrower, 'GET /api/equipment-types': () => json(catalog) });

    renderApp('/catalog');

    expect(
      await screen.findByRole('heading', { name: 'Embedded Systems Lab' }),
    ).toBeInTheDocument();
    const embedded = screen.getByRole('region', { name: 'Embedded Systems Lab' });
    const arduino = within(embedded).getByRole('listitem', { name: /Arduino Uno R3/ });
    expect(arduino).toHaveTextContent('Boards');
    expect(arduino).toHaveTextContent('2 available');
    expect(within(embedded).getByRole('listitem', { name: /Oscilloscope/ })).toHaveTextContent(
      '0 available',
    );
    const network = screen.getByRole('region', { name: 'Network Lab' });
    expect(within(network).getByRole('listitem', { name: /Managed switch/ })).toHaveTextContent(
      '1 available',
    );
    expect(screen.getByRole('heading', { name: 'Equipment catalog' })).toBeInTheDocument();
  });

  it('opens the detail page from a type name', async () => {
    stubApi({
      ...asBorrower,
      'GET /api/equipment-types': () => json(catalog),
      'GET /api/equipment-types/4': () => json(detail),
    });
    renderApp('/catalog');

    await userEvent.click(await screen.findByRole('link', { name: 'Arduino Uno R3' }));

    expect(await screen.findByRole('heading', { name: 'Arduino Uno R3' })).toBeInTheDocument();
    expect(screen.getByText('A microcontroller board for small projects.')).toBeInTheDocument();
  });
});

describe('TEST-SR02-03 catalog states (AC-SR02-03, NFR-07)', () => {
  it('shows a loading message while the request is in flight', async () => {
    stubApi({ ...asBorrower, 'GET /api/equipment-types': () => new Promise<Response>(() => {}) });

    renderApp('/catalog');

    expect(await screen.findByRole('heading', { name: 'Equipment catalog' })).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows the empty sentence when there are no types', async () => {
    stubApi({ ...asBorrower, 'GET /api/equipment-types': () => json({ items: [] }) });

    renderApp('/catalog');

    expect(await screen.findByText('No equipment types in the catalog yet.')).toBeInTheDocument();
  });

  it('shows an error with a Retry button that loads again', async () => {
    let attempts = 0;
    const fetchMock = stubApi({
      ...asBorrower,
      'GET /api/equipment-types': () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError('Failed to fetch');
        return json(catalog);
      },
    });
    renderApp('/catalog');

    expect(await screen.findByText('Could not load the catalog.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { name: 'Network Lab' })).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input) === '/api/equipment-types'),
    ).toHaveLength(2);
  });

  it('shows the API message when the API sends one', async () => {
    stubApi({
      ...asBorrower,
      'GET /api/equipment-types': () => apiFailure(503, 'SERVICE_BUSY', 'The service is busy.'),
    });

    renderApp('/catalog');

    expect(await screen.findByText('The service is busy.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows the login page when the session has ended', async () => {
    let meCalls = 0;
    stubApi({
      'GET /api/auth/me': () => {
        meCalls += 1;
        return meCalls === 1 ? json(borrower) : apiFailure(401, 'UNAUTHENTICATED', 'Sign in.');
      },
      'GET /api/equipment-types': () => apiFailure(401, 'UNAUTHENTICATED', 'Sign in to continue.'),
    });

    renderApp('/catalog');

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });

  it('shows the error and Retry when a 401 arrives but the session is still valid', async () => {
    stubApi({
      'GET /api/auth/me': () => json(borrower),
      'GET /api/equipment-types': () => apiFailure(401, 'UNAUTHENTICATED', 'Sign in to continue.'),
    });

    renderApp('/catalog');

    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText('Loading...')).toBeNull();
  });
});

describe('TEST-F02-02 type detail page (AC-F02-02, FR-05)', () => {
  it('shows description, lab, loan period, and Available count', async () => {
    stubApi({ ...asBorrower, 'GET /api/equipment-types/4': () => json(detail) });

    renderApp('/catalog/4');

    expect(await screen.findByRole('heading', { name: 'Arduino Uno R3' })).toBeInTheDocument();
    expect(screen.getByText('A microcontroller board for small projects.')).toBeInTheDocument();
    expect(screen.getByText('Embedded Systems Lab')).toBeInTheDocument();
    expect(screen.getByText('14 days')).toBeInTheDocument();
    expect(screen.getByText('2 available')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to catalog' })).toHaveAttribute(
      'href',
      '/catalog',
    );
  });

  it('writes one day in the singular', async () => {
    stubApi({
      ...asBorrower,
      'GET /api/equipment-types/4': () => json({ ...detail, loanPeriodDays: 1 }),
    });

    renderApp('/catalog/4');

    expect(await screen.findByText('1 day')).toBeInTheDocument();
  });

  it('places the F-03 request form in the slot and submits this type (TEST-F03-01 UI)', async () => {
    const sent: unknown[] = [];
    stubApi({
      ...asBorrower,
      'GET /api/equipment-types/4': () => json(detail),
      'POST /api/requests': (init) => {
        sent.push(JSON.parse(String(init?.body)));
        return json(
          {
            id: 21,
            equipmentType: { id: 4, name: 'Arduino Uno R3' },
            lab: { name: 'Embedded Systems Lab' },
            purpose: 'Lab 3 project',
            status: 'PENDING',
            createdAt: '2026-11-13T03:00:00.000Z',
            decidedAt: null,
          },
          201,
        );
      },
    });
    const user = userEvent.setup();

    renderApp('/catalog/4');

    const slot = await screen.findByTestId('request-form-slot');
    await user.type(within(slot).getByLabelText('Purpose (optional)'), 'Lab 3 project');
    await user.click(within(slot).getByRole('button', { name: 'Submit request' }));

    expect(await within(slot).findByRole('status')).toHaveTextContent('Request submitted.');
    expect(sent).toEqual([{ equipmentTypeId: 4, purpose: 'Lab 3 project' }]);
  });

  it('shows the no-copy message in place of the form when no copy is available', async () => {
    stubApi({
      ...asBorrower,
      'GET /api/equipment-types/4': () => json({ ...detail, availableCount: 0 }),
    });

    renderApp('/catalog/4');

    const slot = await screen.findByTestId('request-form-slot');
    expect(slot).toHaveTextContent('No copies of this equipment are available right now.');
    expect(within(slot).queryByRole('button', { name: 'Submit request' })).toBeNull();
  });
});

describe('Supporting check: detail states', () => {
  it('shows a loading message while the request is in flight', async () => {
    const fetchMock = stubApi({
      ...asBorrower,
      'GET /api/equipment-types/4': () => new Promise<Response>(() => {}),
    });

    renderApp('/catalog/4');

    await waitFor(() =>
      expect(fetchMock.mock.calls.map(([input]) => String(input))).toContain(
        '/api/equipment-types/4',
      ),
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows not found with a link back when the API returns 404', async () => {
    stubApi({
      ...asBorrower,
      'GET /api/equipment-types/99': () => apiFailure(404, 'NOT_FOUND', 'Not found.'),
    });

    renderApp('/catalog/99');

    expect(await screen.findByText('Equipment type not found.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to catalog' })).toBeInTheDocument();
  });

  it('shows an error with a Retry button for any other failure', async () => {
    let attempts = 0;
    stubApi({
      ...asBorrower,
      'GET /api/equipment-types/4': () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError('Failed to fetch');
        return json(detail);
      },
    });
    renderApp('/catalog/4');

    expect(await screen.findByText('Could not load this equipment type.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { name: 'Arduino Uno R3' })).toBeInTheDocument();
  });

  it('shows the API message and Retry when the API sends one', async () => {
    stubApi({
      ...asBorrower,
      'GET /api/equipment-types/4': () => apiFailure(503, 'SERVICE_BUSY', 'The service is busy.'),
    });
    renderApp('/catalog/4');

    expect(await screen.findByText('The service is busy.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('Supporting check: route guard', () => {
  it('sends a custodian from a detail page to the custodian home', async () => {
    stubApi({ 'GET /api/auth/me': () => json(custodian) });

    renderApp('/catalog/1');

    expect(await screen.findByRole('heading', { name: 'Pending requests' })).toBeInTheDocument();
  });
});
