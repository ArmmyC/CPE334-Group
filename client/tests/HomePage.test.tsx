import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomePage } from '../src/HomePage';

function stubHealthResponse(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
}

describe('HomePage', () => {
  it('shows a loading state, then reports a reachable API and database', async () => {
    stubHealthResponse({ status: 'ok', database: 'ok' });

    render(<HomePage />);

    expect(screen.getByRole('status')).toHaveTextContent('Checking system status...');
    expect(await screen.findByText(/API and database are reachable/)).toBeInTheDocument();
  });

  it('reports an unreachable database', async () => {
    stubHealthResponse({ status: 'error', database: 'unreachable' }, 503);

    render(<HomePage />);

    expect(await screen.findByText(/the database is unreachable/)).toBeInTheDocument();
  });

  it('reports an unreachable API when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    render(<HomePage />);

    expect(await screen.findByText(/the API is unreachable/)).toBeInTheDocument();
  });
});
