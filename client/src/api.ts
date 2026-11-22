import {
  apiErrorSchema,
  availableCopyListSchema,
  borrowRequestSchema,
  checkoutResultSchema,
  catalogResponseSchema,
  currentUserSchema,
  custodianCopiesResponseSchema,
  custodianCopySchema,
  custodianEquipmentTypeSchema,
  custodianEquipmentTypesResponseSchema,
  custodianLoansResponseSchema,
  equipmentTypeDetailSchema,
  healthResponseSchema,
  historyResponseSchema,
  loanSchema,
  pendingRequestListSchema,
  rejectRequestResultSchema,
  renewLoanResultSchema,
  returnLoanResultSchema,
  type AvailableCopy,
  type BorrowRequest,
  type CheckoutResult,
  type CreateRequest,
  type CatalogResponse,
  type ChangeableCopyStatus,
  type CreateCopyBody,
  type CurrentUser,
  type CustodianEquipmentType,
  type CustodianEquipmentTypesResponse,
  type EquipmentTypeCreateBody,
  type EquipmentTypeEditBody,
  type CustodianCopy,
  type CustodianLoan,
  type EquipmentTypeDetail,
  type HealthResponse,
  type HistoryEntityType,
  type HistoryResponse,
  type Loan,
  type LoginRequest,
  type PendingRequest,
  type RejectRequestBody,
  type RenewLoanResult,
  type RejectRequestResult,
  type ReturnLoanBody,
  type ReturnLoanResult,
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
export async function fetchPendingRequests(
  filters: { labId?: number; borrowerId?: number } = {},
): Promise<PendingRequest[]> {
  const params = new URLSearchParams({ status: 'PENDING' });
  if (filters.labId !== undefined) params.set('labId', String(filters.labId));
  if (filters.borrowerId !== undefined) params.set('borrowerId', String(filters.borrowerId));
  const response = await send(`/api/custodian/requests?${params.toString()}`, { method: 'GET' });
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

// F-08 reject a Pending request with a reason (SDS 5.2).
export async function rejectRequest(
  id: number,
  body: RejectRequestBody,
): Promise<RejectRequestResult> {
  const response = await send(`/api/custodian/requests/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return rejectRequestResultSchema.parse(await response.json());
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

// F-05 active loans in the custodian's labs, earliest due date first (SDS 5.2). F-10 adds the
// overdue-only filter.
export async function fetchActiveLoans(
  options: { overdueOnly?: boolean; labId?: number; borrowerId?: number } = {},
): Promise<CustodianLoan[]> {
  const params = new URLSearchParams();
  if (options.overdueOnly) params.set('overdue', 'true');
  if (options.labId !== undefined) params.set('labId', String(options.labId));
  if (options.borrowerId !== undefined) params.set('borrowerId', String(options.borrowerId));
  const query = params.toString();
  const response = await send(`/api/custodian/loans${query ? `?${query}` : ''}`, {
    method: 'GET',
  });
  return custodianLoansResponseSchema.parse(await response.json()).items;
}

// F-09 return a loan with a condition note (SDS 5.2).
export async function returnLoan(id: number, body: ReturnLoanBody): Promise<ReturnLoanResult> {
  const response = await send(`/api/custodian/loans/${id}/return`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return returnLoanResultSchema.parse(await response.json());
}

// F-16 renew a loan once (SDS 5.2).
export async function renewLoan(id: number): Promise<RenewLoanResult> {
  const response = await send(`/api/custodian/loans/${id}/renew`, { method: 'POST' });
  return renewLoanResultSchema.parse(await response.json());
}

// F-02 catalog reads.
export type CatalogFilters = {
  q?: string;
  category?: string;
  labId?: number;
  available?: boolean;
};

// F-17: the filters go in the query string. No filter sends the plain URL.
export async function fetchCatalog(filters: CatalogFilters = {}): Promise<CatalogResponse> {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.category) params.set('category', filters.category);
  if (filters.labId !== undefined) params.set('labId', String(filters.labId));
  if (filters.available) params.set('available', 'true');
  const query = params.toString();
  const response = await send(`/api/equipment-types${query ? `?${query}` : ''}`, {
    method: 'GET',
  });
  return catalogResponseSchema.parse(await response.json());
}

export async function fetchEquipmentType(id: string): Promise<EquipmentTypeDetail> {
  const response = await send(`/api/equipment-types/${encodeURIComponent(id)}`, { method: 'GET' });
  return equipmentTypeDetailSchema.parse(await response.json());
}

// F-12 equipment type management (SDS 5.2).
export async function fetchCustodianEquipmentTypes(): Promise<CustodianEquipmentTypesResponse> {
  const response = await send('/api/custodian/equipment-types', { method: 'GET' });
  return custodianEquipmentTypesResponseSchema.parse(await response.json());
}

export async function createEquipmentType(
  body: EquipmentTypeCreateBody,
): Promise<CustodianEquipmentType> {
  const response = await send('/api/custodian/equipment-types', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return custodianEquipmentTypeSchema.parse(await response.json());
}

export async function updateEquipmentType(
  id: number,
  body: EquipmentTypeEditBody,
): Promise<CustodianEquipmentType> {
  const response = await send(`/api/custodian/equipment-types/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return custodianEquipmentTypeSchema.parse(await response.json());
}

// F-13: add a copy to an equipment type in the custodian's labs.
export async function createCopy(body: CreateCopyBody): Promise<CustodianCopy> {
  const response = await send('/api/custodian/copies', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return custodianCopySchema.parse(await response.json());
}

// F-14: one page of the history of the custodian's labs, newest first.
export async function fetchHistory(
  options: { entityType?: HistoryEntityType; beforeId?: number } = {},
): Promise<HistoryResponse> {
  const params = new URLSearchParams();
  if (options.entityType) params.set('entityType', options.entityType);
  if (options.beforeId !== undefined) params.set('beforeId', String(options.beforeId));
  const query = params.toString();
  const response = await send(`/api/custodian/history${query ? `?${query}` : ''}`, {
    method: 'GET',
  });
  return historyResponseSchema.parse(await response.json());
}
