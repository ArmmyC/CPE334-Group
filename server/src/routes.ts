import type { RequestHandler } from 'express';
import type { Role } from '@cpe334-group/shared';
import { authHandlers } from './auth/routes.js';
import { createSessionService } from './auth/sessions.js';
import { checkoutHandlers } from './checkout/routes.js';
import { createCheckoutService } from './checkout/service.js';
import { copyHandlers } from './copies/routes.js';
import { createCopyService } from './copies/service.js';
import { catalogHandlers } from './catalog/routes.js';
import { createCatalogService } from './catalog/service.js';
import type { AppDependencies } from './dependencies.js';
import { healthHandler, readyHandler } from './health.js';
import { loanHandlers } from './loans/routes.js';
import { createLoanService } from './loans/service.js';
import { requestHandlers } from './requests/routes.js';
import { createRequestService } from './requests/service.js';

// `public` needs nothing, `signed-in` needs a session, and a role needs a session with that role.
export type Access = 'public' | 'signed-in' | Role;

export type RouteDefinition = {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  access: Access;
  handler: RequestHandler;
};

// The one route table (SDS 6.2). The app registers API routes only from here, and the
// AC-SR01-01 test calls every entry that is not public without a session, so a new
// endpoint is checked as soon as it is added.
export function buildRoutes(deps: AppDependencies): RouteDefinition[] {
  const auth = authHandlers({
    sessions: createSessionService(deps),
    secureCookies: deps.secureCookies ?? false,
  });
  const requests = requestHandlers({
    requests: createRequestService({ prisma: deps.prisma, clock: deps.clock }),
  });
  const checkout = checkoutHandlers({
    checkout: createCheckoutService({ prisma: deps.prisma, clock: deps.clock }),
  });
  const loans = loanHandlers({ loans: createLoanService({ prisma: deps.prisma }) });

  const copies = copyHandlers({ copies: createCopyService(deps) });
  const catalog = catalogHandlers({ catalog: createCatalogService(deps) });

  return [
    {
      method: 'get',
      path: '/api/health',
      access: 'public',
      handler: healthHandler(deps.checkDatabase, deps.healthTimeoutMs ?? 2000),
    },
    {
      method: 'get',
      path: '/api/ready',
      access: 'public',
      handler: readyHandler(deps.checkReady, deps.healthTimeoutMs ?? 2000),
    },
    { method: 'post', path: '/api/auth/login', access: 'public', handler: auth.login },
    { method: 'post', path: '/api/auth/logout', access: 'signed-in', handler: auth.logout },
    { method: 'get', path: '/api/auth/me', access: 'signed-in', handler: auth.me },
    { method: 'post', path: '/api/requests', access: 'BORROWER', handler: requests.create },
    { method: 'get', path: '/api/requests', access: 'BORROWER', handler: requests.list },
    {
      method: 'post',
      path: '/api/requests/:id/cancel',
      access: 'BORROWER',
      handler: requests.cancel,
    },
    { method: 'get', path: '/api/loans', access: 'BORROWER', handler: loans.list },
    {
      method: 'get',
      path: '/api/custodian/requests',
      access: 'CUSTODIAN',
      handler: checkout.listPending,
    },
    {
      method: 'get',
      path: '/api/custodian/requests/:id/available-copies',
      access: 'CUSTODIAN',
      handler: checkout.listAvailableCopies,
    },
    {
      method: 'post',
      path: '/api/custodian/requests/:id/checkout',
      access: 'CUSTODIAN',
      handler: checkout.checkout,
    },
    { method: 'get', path: '/api/custodian/copies', access: 'CUSTODIAN', handler: copies.list },
    {
      method: 'patch',
      path: '/api/custodian/copies/:id',
      access: 'CUSTODIAN',
      handler: copies.changeStatus,
    },
    { method: 'get', path: '/api/equipment-types', access: 'BORROWER', handler: catalog.list },
    {
      method: 'get',
      path: '/api/equipment-types/:id',
      access: 'BORROWER',
      handler: catalog.detail,
    },
  ];
}
