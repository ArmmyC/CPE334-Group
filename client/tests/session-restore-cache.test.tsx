import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

const borrower = {
  id: 3,
  name: 'Arisa Kittipong',
  email: 'borrower1@example.com',
  role: 'BORROWER',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubMe(getUser: () => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/auth/me') {
        const user = getUser();
        return user
          ? json(user)
          : json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }, 401);
      }
      return json([]);
    }),
  );
}

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function pageShow(persisted: boolean) {
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', { value: persisted });
  window.dispatchEvent(event);
}

describe('NG-F02 signed-in page restored from the back/forward cache', () => {
  it('re-checks the session on a persisted pageshow and drops the signed-in view', async () => {
    let user: unknown = borrower;
    stubMe(() => user);
    renderApp('/catalog');
    expect(await screen.findByText('Arisa Kittipong')).toBeInTheDocument();

    user = null; // the server session ended while the page sat in the cache
    act(() => pageShow(true));

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Arisa Kittipong')).toBeNull());
  });

  it('does not re-check on an ordinary pageshow', async () => {
    stubMe(() => borrower);
    renderApp('/catalog');
    await screen.findByText('Arisa Kittipong');
    const fetchMock = vi.mocked(fetch);
    const before = fetchMock.mock.calls.length;

    act(() => pageShow(false));

    expect(fetchMock.mock.calls.length).toBe(before);
  });
});
