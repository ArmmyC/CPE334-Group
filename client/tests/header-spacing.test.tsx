import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

const custodian = {
  id: 1,
  name: 'Napat Srisuk',
  email: 'custodian.embedded@example.com',
  role: 'CUSTODIAN',
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

describe('NG-F01 custodian header spacing', () => {
  it('puts a margin between the nav links and the user name block', async () => {
    stubMe(() => custodian);
    renderApp('/custodian/loans');

    const header = await screen.findByRole('banner');
    const name = await within(header).findByText('Napat Srisuk');

    expect(name.parentElement).toHaveClass('ms-3');
  });
});
