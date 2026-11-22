import { fireEvent, render, screen, within } from '@testing-library/react';
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

type Handler = (init?: RequestInit) => Response | Promise<Response>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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
    <MemoryRouter initialEntries={['/custodian/summary']}>
      <App />
    </MemoryRouter>,
  );
}

const asCustodian = { 'GET /api/auth/me': () => json(custodian) };
const SUMMARY = 'GET /api/custodian/summary';

function lab(id: number, name: string, extra: Record<string, unknown> = {}) {
  return {
    lab: { id, name },
    copies: { AVAILABLE: 4, ON_LOAN: 2, IN_MAINTENANCE: 1, RETIRED: 0 },
    activeLoans: 5,
    overdueLoans: 2,
    topTypes: [
      { equipmentType: { id: 7, name: 'Logic analyzer' }, checkouts: 6 },
      { equipmentType: { id: 8, name: 'Oscilloscope' }, checkouts: 3 },
    ],
    ...extra,
  };
}

const range = { from: '2026-10-09', to: '2026-11-07' };

describe('TEST-F19-06 the inventory summary page (AC-F19-06, FR-21, SR-02)', () => {
  it('shows a card per lab with copy counts, loans, overdue, and the top types', async () => {
    stubApi({
      ...asCustodian,
      [SUMMARY]: () =>
        json({ range, labs: [lab(1, 'Embedded Systems Lab'), lab(2, 'Robotics Lab')] }),
    });
    renderApp();

    const card = (await screen.findByRole('region', {
      name: 'Embedded Systems Lab',
    })) as HTMLElement;
    expect(within(card).getByText('Available: 4')).toBeInTheDocument();
    expect(within(card).getByText('On loan: 2')).toBeInTheDocument();
    expect(within(card).getByText('In maintenance: 1')).toBeInTheDocument();
    expect(within(card).getByText('Retired: 0')).toBeInTheDocument();
    expect(within(card).getByText('Active loans: 5')).toBeInTheDocument();
    expect(within(card).getByText('Overdue loans: 2')).toHaveClass('text-warning-emphasis');
    const row = within(card).getByText('Logic analyzer').closest('tr')!;
    expect(within(row).getByText('6')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Robotics Lab' })).toBeInTheDocument();
    expect(screen.getByLabelText('From')).toHaveValue('2026-10-09');
    expect(screen.getByLabelText('To')).toHaveValue('2026-11-07');
  });

  it('asks again with the chosen range when Apply is pressed', async () => {
    const fetchMock = stubApi({
      ...asCustodian,
      [SUMMARY]: () => json({ range, labs: [lab(1, 'Embedded Systems Lab')] }),
      [`${SUMMARY}?from=2026-11-01&to=2026-11-05`]: () =>
        json({
          range: { from: '2026-11-01', to: '2026-11-05' },
          labs: [lab(1, 'Embedded Systems Lab', { topTypes: [] })],
        }),
    });
    renderApp();
    await screen.findByRole('region', { name: 'Embedded Systems Lab' });

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-05' } });
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText('No checkouts in this range.')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('?from=2026-11-01&to=2026-11-05'),
      ),
    ).toBe(true);
  });

  it('shows the server message for a refused range', async () => {
    stubApi({
      ...asCustodian,
      [SUMMARY]: () => json({ range, labs: [lab(1, 'Embedded Systems Lab')] }),
      [`${SUMMARY}?from=2026-11-05&to=2026-11-01`]: () =>
        json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Check the highlighted fields.',
              fields: { to: 'From must be on or before To.' },
            },
          },
          400,
        ),
    });
    renderApp();
    await screen.findByRole('region', { name: 'Embedded Systems Lab' });

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-05' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText('From must be on or before To.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Embedded Systems Lab' })).toBeInTheDocument();
  });

  it('shows the empty sentence when no lab is assigned', async () => {
    stubApi({ ...asCustodian, [SUMMARY]: () => json({ range, labs: [] }) });
    renderApp();

    expect(await screen.findByText('No assigned labs.')).toBeInTheDocument();
  });

  it('shows the error with a Retry button that sends the request again', async () => {
    let attempts = 0;
    stubApi({
      ...asCustodian,
      [SUMMARY]: () => {
        attempts += 1;
        return attempts === 1
          ? json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } }, 500)
          : json({ range, labs: [lab(1, 'Embedded Systems Lab')] });
      },
    });
    renderApp();

    expect(await screen.findByText('Something went wrong.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('region', { name: 'Embedded Systems Lab' })).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it('is reachable from the navigation bar', async () => {
    stubApi({ ...asCustodian, [SUMMARY]: () => json({ range, labs: [] }) });
    renderApp();

    expect(await screen.findByRole('link', { name: 'Summary' })).toHaveAttribute(
      'href',
      '/custodian/summary',
    );
  });
});
