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

type Handler = (init?: RequestInit) => Response | Promise<Response>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const unauthenticated = () =>
  json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }, 401);

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

describe('TEST-F01-04 session restore in the UI (AC-F01-04, FR-03)', () => {
  it('shows the signed-in user from the current-user endpoint after a reload', async () => {
    stubApi({ 'GET /api/auth/me': () => json(borrower) });

    renderApp('/catalog');

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    const header = await screen.findByRole('banner');
    expect(await within(header).findByText('Arisa Kittipong')).toBeInTheDocument();
    expect(within(header).getByText('Borrower')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Equipment catalog' })).toBeInTheDocument();
  });

  it('shows the login page when there is no session', async () => {
    stubApi({ 'GET /api/auth/me': unauthenticated });

    renderApp('/catalog');

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).queryByRole('button', { name: 'Logout' })).toBeNull();
  });

  it('offers a retry when the server cannot be reached', async () => {
    let attempts = 0;
    stubApi({
      'GET /api/auth/me': () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError('Failed to fetch');
        return json(borrower);
      },
    });

    renderApp('/');

    expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Arisa Kittipong')).toBeInTheDocument();
  });
});

describe('Supporting check: login form validation (AC-SR02-02, NFR-07)', () => {
  it('shows a message under each empty field and sends no login request', async () => {
    const fetchMock = stubApi({ 'GET /api/auth/me': unauthenticated });
    renderApp('/login');

    await userEvent.click(await screen.findByRole('button', { name: 'Log in' }));

    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Enter your email address.');
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Enter your password.');
    expect(calls(fetchMock, 'POST /api/auth/login')).toHaveLength(0);
  });

  it('shows the API field messages next to the fields', async () => {
    stubApi({
      'GET /api/auth/me': unauthenticated,
      'POST /api/auth/login': () =>
        json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Check the highlighted fields.',
              fields: { email: 'Enter a valid email address.' },
            },
          },
          400,
        ),
    });
    renderApp('/login');

    await userEvent.type(await screen.findByLabelText('Email'), 'a@example.test');
    await userEvent.type(screen.getByLabelText('Password'), 'some-password');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
        'Enter a valid email address.',
      ),
    );
  });
});

describe('TEST-F01-02 generic refusal in the UI (AC-F01-02, FR-01)', () => {
  it('shows the generic message above the form and stays on the login page', async () => {
    stubApi({
      'GET /api/auth/me': unauthenticated,
      'POST /api/auth/login': () =>
        json(
          {
            error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' },
          },
          401,
        ),
    });
    renderApp('/login');

    await userEvent.type(await screen.findByLabelText('Email'), 'borrower1@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    expect(screen.getByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });
});

describe('TEST-F01-01 login in the UI (AC-F01-01, FR-01)', () => {
  it('sends the credentials, disables the button while waiting, and shows the custodian home', async () => {
    let finish: (response: Response) => void = () => {};
    const fetchMock = stubApi({
      'GET /api/auth/me': unauthenticated,
      'POST /api/auth/login': () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    });
    renderApp('/login');

    await userEvent.type(await screen.findByLabelText('Email'), 'custodian.embedded@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(screen.getByRole('button', { name: /Logging in/ })).toBeDisabled();
    const [, init] = calls(fetchMock, 'POST /api/auth/login')[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'custodian.embedded@example.com',
      password: 'correct-password-1',
    });

    finish(json(custodian));

    expect(await screen.findByRole('heading', { name: 'Pending requests' })).toBeInTheDocument();
    const header = screen.getByRole('banner');
    expect(within(header).getByText('Napat Srisuk')).toBeInTheDocument();
    expect(within(header).getByText('Custodian')).toBeInTheDocument();
  });
});

describe('Supporting check: route guards', () => {
  it('sends a custodian on a borrower page to the custodian home', async () => {
    stubApi({ 'GET /api/auth/me': () => json(custodian) });

    renderApp('/catalog');

    expect(await screen.findByRole('heading', { name: 'Pending requests' })).toBeInTheDocument();
  });

  it('sends a signed-in borrower away from the login page', async () => {
    stubApi({ 'GET /api/auth/me': () => json(borrower) });

    renderApp('/login');

    expect(await screen.findByRole('heading', { name: 'Equipment catalog' })).toBeInTheDocument();
  });
});

describe('TEST-F01-03 logout in the UI (AC-F01-03, FR-02)', () => {
  it('calls logout and returns to the login page', async () => {
    const fetchMock = stubApi({
      'GET /api/auth/me': () => json(borrower),
      'POST /api/auth/logout': () => new Response(null, { status: 204 }),
    });
    renderApp('/catalog');

    await userEvent.click(await screen.findByRole('button', { name: 'Logout' }));

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(calls(fetchMock, 'POST /api/auth/logout')).toHaveLength(1);
    expect(screen.queryByText('Arisa Kittipong')).toBeNull();
  });

  it('also returns to the login page when the session had already expired', async () => {
    stubApi({
      'GET /api/auth/me': () => json(borrower),
      'POST /api/auth/logout': unauthenticated,
    });
    renderApp('/catalog');

    await userEvent.click(await screen.findByRole('button', { name: 'Logout' }));

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });
});
