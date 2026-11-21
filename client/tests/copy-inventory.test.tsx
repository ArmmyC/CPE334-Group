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
const arduino = { id: 1, name: 'Arduino Uno R3' };

function copy(id: number, assetTag: string, status: string) {
  return { id, assetTag, status, equipmentType: arduino, lab };
}

const available = copy(11, 'EMB-ARD-001', 'AVAILABLE');
const maintenance = copy(12, 'EMB-ARD-003', 'IN_MAINTENANCE');
const onLoan = copy(13, 'EMB-ARD-004', 'ON_LOAN');

const typesResponse = {
  labs: [lab],
  items: [
    {
      id: 1,
      name: 'Arduino Uno R3',
      category: 'Boards',
      description: 'A board.',
      loanPeriodDays: 7,
      lab,
    },
  ],
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
    <MemoryRouter initialEntries={['/custodian/copies']}>
      <App />
    </MemoryRouter>,
  );
}

const LIST = 'GET /api/custodian/copies';
const TYPES = 'GET /api/custodian/equipment-types';
const ADD = 'POST /api/custodian/copies';
const PATCH_11 = 'PATCH /api/custodian/copies/11';

const callsTo = (fetchMock: ReturnType<typeof stubApi>, key: string) =>
  fetchMock.mock.calls.filter(
    ([input, init]) => `${init?.method ?? 'GET'} ${String(input)}` === key,
  );

const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body));

describe('TEST-F13-08 add and retire on the copies page (AC-F13-09, FR-16, BR-08)', () => {
  it('adds a copy for a chosen type and refreshes the list', async () => {
    let added = false;
    const fetchMock = stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () =>
        json({ items: added ? [available, copy(15, 'NEW-1', 'AVAILABLE')] : [available] }),
      [TYPES]: () => json(typesResponse),
      [ADD]: () => {
        added = true;
        return json(copy(15, 'NEW-1', 'AVAILABLE'), 201);
      },
    });
    renderApp();

    await userEvent.click(await screen.findByRole('button', { name: 'Add copy' }));
    await userEvent.selectOptions(await screen.findByLabelText('Equipment type'), '1');
    await userEvent.type(screen.getByLabelText('Asset tag'), 'NEW-1');
    await userEvent.click(screen.getByRole('button', { name: 'Save copy' }));

    expect(await screen.findByText('Added NEW-1.')).toBeInTheDocument();
    expect(await screen.findByRole('row', { name: /NEW-1/ })).toBeInTheDocument();
    expect(bodyOf(callsTo(fetchMock, ADD)[0]!)).toEqual({ equipmentTypeId: 1, assetTag: 'NEW-1' });
  });

  it('stops an empty tag in the page and shows the duplicate tag message on the field', async () => {
    const fetchMock = stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ items: [available] }),
      [TYPES]: () => json(typesResponse),
      [ADD]: () =>
        json(
          {
            error: {
              code: 'DUPLICATE_ASSET_TAG',
              message: 'This asset tag is already in use.',
              fields: { assetTag: 'This asset tag is already in use.' },
            },
          },
          409,
        ),
    });
    renderApp();

    await userEvent.click(await screen.findByRole('button', { name: 'Add copy' }));
    await userEvent.selectOptions(await screen.findByLabelText('Equipment type'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Save copy' }));
    expect(await screen.findByText('Asset tag is required.')).toBeInTheDocument();
    expect(callsTo(fetchMock, ADD)).toHaveLength(0);

    await userEvent.type(screen.getByLabelText('Asset tag'), 'EMB-ARD-001');
    await userEvent.click(screen.getByRole('button', { name: 'Save copy' }));

    expect(await screen.findByText('This asset tag is already in use.')).toBeInTheDocument();
    expect(screen.getByLabelText('Asset tag')).toHaveAttribute('aria-invalid', 'true');
  });

  it('retires a copy only after confirmation', async () => {
    let retired = false;
    const fetchMock = stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ items: [retired ? copy(11, 'EMB-ARD-001', 'RETIRED') : available] }),
      [PATCH_11]: () => {
        retired = true;
        return json(copy(11, 'EMB-ARD-001', 'RETIRED'));
      },
    });
    renderApp();

    const row = await screen.findByRole('row', { name: /EMB-ARD-001/ });
    await userEvent.click(within(row).getByRole('button', { name: 'Retire' }));
    expect(screen.getByText('Retire EMB-ARD-001? This cannot be undone.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(callsTo(fetchMock, PATCH_11)).toHaveLength(0);

    await userEvent.click(within(row).getByRole('button', { name: 'Retire' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('EMB-ARD-001 is now Retired.')).toBeInTheDocument();
    expect(bodyOf(callsTo(fetchMock, PATCH_11)[0]!)).toEqual({ status: 'RETIRED' });
    expect(
      within(await screen.findByRole('row', { name: /EMB-ARD-001/ })).getByText('Retired'),
    ).toBeInTheDocument();
  });

  it('offers Retire for Available and In maintenance copies and not for On loan', async () => {
    stubApi({
      'GET /api/auth/me': () => json(custodian),
      [LIST]: () => json({ items: [available, maintenance, onLoan] }),
    });
    renderApp();

    await screen.findByRole('row', { name: /EMB-ARD-001/ });

    expect(
      within(screen.getByRole('row', { name: /EMB-ARD-001/ })).getByRole('button', {
        name: 'Retire',
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('row', { name: /EMB-ARD-003/ })).getByRole('button', {
        name: 'Retire',
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('row', { name: /EMB-ARD-004/ })).queryByRole('button'),
    ).toBeNull();
  });
});
