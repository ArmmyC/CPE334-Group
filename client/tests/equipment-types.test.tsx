import { render, screen, within } from '@testing-library/react';
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

const lab = { id: 1, name: 'Embedded Systems Lab' };
const oscilloscope = {
  id: 10,
  name: 'Oscilloscope',
  category: 'Meters',
  description: 'Two channels.',
  loanPeriodDays: 7,
  lab,
};

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

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/custodian/equipment-types']}>
      <App />
    </MemoryRouter>,
  );
}

const LIST = 'GET /api/custodian/equipment-types';
const CREATE = 'POST /api/custodian/equipment-types';
const EDIT = 'PATCH /api/custodian/equipment-types/10';

const sent = (fetchMock: ReturnType<typeof stubApi>, method: string) =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      String(input).includes('/api/custodian/equipment-types') &&
      (init as RequestInit | undefined)?.method === method,
  );

describe('TEST-F12-07 the equipment types page (AC-F12-07, FR-15, BR-05)', () => {
  it('lists the types with their loan period', async () => {
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ labs: [lab], items: [oscilloscope] }),
    });
    renderApp();

    const row = (await screen.findByText('Oscilloscope')).closest('tr')!;

    expect(within(row).getByText('Meters')).toBeInTheDocument();
    expect(within(row).getByText('7 days')).toBeInTheDocument();
    expect(within(row).getByText('Embedded Systems Lab')).toBeInTheDocument();
  });

  it('creates a type, shows the saved notice, and reloads the list', async () => {
    let created = false;
    const fetchMock = stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () =>
        json({
          labs: [lab],
          items: created
            ? [oscilloscope, { ...oscilloscope, id: 11, name: 'Logic analyzer' }]
            : [oscilloscope],
        }),
      [CREATE]: () => {
        created = true;
        return json({ ...oscilloscope, id: 11, name: 'Logic analyzer' }, 201);
      },
    });
    renderApp();
    await screen.findByText('Oscilloscope');

    await userEvent.selectOptions(screen.getByLabelText('Lab'), '1');
    await userEvent.type(screen.getByLabelText('Name'), 'Logic analyzer');
    await userEvent.type(screen.getByLabelText('Category'), 'Meters');
    await userEvent.type(screen.getByLabelText('Description'), 'Eight channels.');
    await userEvent.clear(screen.getByLabelText('Loan period (days)'));
    await userEvent.type(screen.getByLabelText('Loan period (days)'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Add equipment type' }));

    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(await screen.findByText('Logic analyzer')).toBeInTheDocument();
    const body = JSON.parse(String((sent(fetchMock, 'POST')[0]![1] as RequestInit).body));
    expect(body).toEqual({
      labId: 1,
      name: 'Logic analyzer',
      category: 'Meters',
      description: 'Eight channels.',
      loanPeriodDays: 10,
    });
  });

  it('shows the duplicate name message on the name field', async () => {
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ labs: [lab], items: [oscilloscope] }),
      [CREATE]: () =>
        errorBody(409, 'DUPLICATE_NAME', 'A type with this name already exists in this lab.', {
          name: 'A type with this name already exists in this lab.',
        }),
    });
    renderApp();
    await screen.findByText('Oscilloscope');

    await userEvent.selectOptions(screen.getByLabelText('Lab'), '1');
    await userEvent.type(screen.getByLabelText('Name'), 'Oscilloscope');
    await userEvent.type(screen.getByLabelText('Category'), 'Meters');
    await userEvent.type(screen.getByLabelText('Description'), 'Again.');
    await userEvent.click(screen.getByRole('button', { name: 'Add equipment type' }));

    const name = screen.getByLabelText('Name');
    expect(
      await screen.findByText('A type with this name already exists in this lab.'),
    ).toBeInTheDocument();
    expect(name).toHaveAttribute('aria-invalid', 'true');
  });

  it('stops a loan period of 40 in the page without calling the API', async () => {
    const fetchMock = stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ labs: [lab], items: [oscilloscope] }),
    });
    renderApp();
    await screen.findByText('Oscilloscope');

    await userEvent.click(screen.getByRole('button', { name: 'Edit Oscilloscope' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Oscilloscope' });
    const period = within(dialog).getByLabelText('Loan period (days)');
    await userEvent.clear(period);
    await userEvent.type(period, '15');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(
      await within(dialog).findByText('Loan period must be from 1 to 14 days.'),
    ).toBeInTheDocument();
    expect(sent(fetchMock, 'PATCH')).toHaveLength(0);
  });

  it('edits a type with PATCH and reloads the list', async () => {
    let saved = false;
    const fetchMock = stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () =>
        json({
          labs: [lab],
          items: [saved ? { ...oscilloscope, loanPeriodDays: 14 } : oscilloscope],
        }),
      [EDIT]: () => {
        saved = true;
        return json({ ...oscilloscope, loanPeriodDays: 14 });
      },
    });
    renderApp();
    await screen.findByText('Oscilloscope');

    await userEvent.click(screen.getByRole('button', { name: 'Edit Oscilloscope' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Oscilloscope' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Oscilloscope');
    const period = within(dialog).getByLabelText('Loan period (days)');
    await userEvent.clear(period);
    await userEvent.type(period, '14');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(await screen.findByText('14 days')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    const body = JSON.parse(String((sent(fetchMock, 'PATCH')[0]![1] as RequestInit).body));
    expect(body).toEqual({
      name: 'Oscilloscope',
      category: 'Meters',
      description: 'Two channels.',
      loanPeriodDays: 14,
    });
  });
});
