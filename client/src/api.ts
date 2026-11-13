import {
  apiErrorSchema,
  availableCopyListSchema,
  borrowRequestSchema,
  checkoutResultSchema,
  catalogResponseSchema,
  currentUserSchema,
  custodianCopiesResponseSchema,
  custodianCopySchema,
  custodianLoansResponseSchema,
  equipmentTypeDetailSchema,
  healthResponseSchema,
  loanSchema,
  pendingRequestListSchema,
  type AvailableCopy,
  type BorrowRequest,
  type CheckoutResult,
  type CreateRequest,
  type CatalogResponse,
  type ChangeableCopyStatus,
  type CurrentUser,
  type CustodianCopy,
  type CustodianLoan,
  type EquipmentTypeDetail,
  type HealthResponse,
  type Loan,
  type LoginRequest,
  type PendingRequest,
} from '@cpe334-group/shared';

// An API error in the shared shape (SDS 5.3), with `fields` for validation errors.
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(path, {
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!response.ok) {
    const body = apiErrorSchema.safeParse(await response.json().catch(() => null));
    if (body.success) {
      const { code, message, fields } = body.data.error;
      throw new ApiRequestError(response.status, code, message, fields);
    }
    throw new ApiRequestError(
      response.status,
      'UNEXPECTED_RESPONSE',
      'Could not reach the server.',
    );
  }
  return response;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health');
  return healthResponseSchema.parse(await response.json());
}

// Returns the signed-in user, or null when there is no valid session (FR-03).
export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  try {
    const response = await send('/api/auth/me', { method: 'GET' });
    return currentUserSchema.parse(await response.json());
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export async function login(credentials: LoginRequest): Promise<CurrentUser> {
  const response = await send('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
  return currentUserSchema.parse(await response.json());
}

// A 401 means the session was already gone, which is the outcome logout wants.
export async function logout(): Promise<void> {
  try {
    await send('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    if (!(error instanceof ApiRequestError && error.status === 401)) {
      throw error;
    }
  }
}

// The borrower's own requests, newest first (F-03).
export async function fetchMyRequests(): Promise<BorrowRequest[]> {
  const response = await send('/api/requests', { method: 'GET' });
  return borrowRequestSchema.array().parse(await response.json());
}

// The borrower's own loans, newest first (F-03).
export async function fetchMyLoans(): Promise<Loan[]> {
  const response = await send('/api/loans', { method: 'GET' });
  return loanSchema.array().parse(await response.json());
}

export async function submitRequest(input: CreateRequest): Promise<BorrowRequest> {
  const response = await send('/api/requests', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return borrowRequestSchema.parse(await response.json());
}

export async function cancelRequest(id: number): Promise<BorrowRequest> {
  const response = await send(`/api/requests/${id}/cancel`, { method: 'POST' });
  return borrowRequestSchema.parse(await response.json());
}

// The Pending requests in the custodian's labs, oldest first (F-04).
export async function fetchPendingRequests(): Promise<PendingRequest[]> {
  const response = await send('/api/custodian/requests?status=PENDING', { method: 'GET' });
  return pendingRequestListSchema.parse(await response.json()).items;
}

export async function fetchAvailableCopies(requestId: number): Promise<AvailableCopy[]> {
  const response = await send(`/api/custodian/requests/${requestId}/available-copies`, {
    method: 'GET',
  });
  return availableCopyListSchema.parse(await response.json()).items;
}

export async function checkoutCopy(requestId: number, copyId: number): Promise<CheckoutResult> {
  const response = await send(`/api/custodian/requests/${requestId}/checkout`, {
    method: 'POST',
    body: JSON.stringify({ copyId }),
  });
  return checkoutResultSchema.parse(await response.json());
}

// F-06 copy maintenance status (SDS 5.2).
export async function fetchCustodianCopies(): Promise<CustodianCopy[]> {
  const response = await send('/api/custodian/copies', { method: 'GET' });
  return custodianCopiesResponseSchema.parse(await response.json()).items;
}

export async function changeCopyStatus(
  copyId: number,
  status: ChangeableCopyStatus,
): Promise<CustodianCopy> {
  const response = await send(`/api/custodian/copies/${copyId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  return custodianCopySchema.parse(await response.json());
}

// F-05 active loans in the custodian's labs, earliest due date first (SDS 5.2).
export async function fetchActiveLoans(): Promise<CustodianLoan[]> {
  const response = await send('/api/custodian/loans', { method: 'GET' });
  return custodianLoansResponseSchema.parse(await response.json()).items;
}

// F-02 catalog reads.
export async function fetchCatalog(): Promise<CatalogResponse> {
  const response = await send('/api/equipment-types', { method: 'GET' });
  return catalogResponseSchema.parse(await response.json());
}

export async function fetchEquipmentType(id: string): Promise<EquipmentTypeDetail> {
  const response = await send(`/api/equipment-types/${encodeURIComponent(id)}`, { method: 'GET' });
  return equipmentTypeDetailSchema.parse(await response.json());
}
