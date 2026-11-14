import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { apiErrorSchema } from '@cpe334-group/shared';
import { prisma } from '../src/db.js';
import { requireRole } from '../src/http/access.js';
import { HttpError } from '../src/http/errors.js';
import { buildRoutes } from '../src/routes.js';
import { appDependencies, createTestApp } from './helpers/app.js';

afterAll(async () => {
  await prisma.$disconnect();
});

const routes = buildRoutes(appDependencies());

describe('TEST-SR01-01 every protected route needs a session (AC-SR01-01, NFR-02)', () => {
  const protectedRoutes = routes.filter(({ access }) => access !== 'public');

  it('has protected routes to check', () => {
    expect(protectedRoutes.length).toBeGreaterThan(0);
  });

  it.each(protectedRoutes.map((route) => [`${route.method.toUpperCase()} ${route.path}`, route]))(
    '%s returns 401 and no data without a session',
    async (_label, route) => {
      const path = route.path.replace(/:[A-Za-z]+/g, '1');
      const call = request(createTestApp())[route.method](path);
      const response = route.method === 'get' ? await call : await call.send({});

      expect(response.status).toBe(401);
      expect(apiErrorSchema.strict().parse(response.body)).toEqual({
        error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' },
      });
    },
  );
});

describe('Supporting check: public routes', () => {
  it('lists only the health check, the readiness check, and login as public', () => {
    expect(
      routes
        .filter(({ access }) => access === 'public')
        .map(({ method, path }) => `${method.toUpperCase()} ${path}`)
        .sort(),
    ).toEqual(['GET /api/health', 'GET /api/ready', 'POST /api/auth/login']);
  });
});

describe('Supporting check: wrong role (NFR-03)', () => {
  function run(role: 'BORROWER' | 'CUSTODIAN', userRole: 'BORROWER' | 'CUSTODIAN') {
    const next = vi.fn();
    const response = {
      locals: { user: { id: 1, name: 'A', email: 'a@example.test', role: userRole } },
    };
    requireRole(role)({} as never, response as never, next);
    return next;
  }

  it('passes the matching role through', () => {
    expect(run('CUSTODIAN', 'CUSTODIAN')).toHaveBeenCalledWith();
  });

  it('refuses the other role with 403 FORBIDDEN', () => {
    const next = run('CUSTODIAN', 'BORROWER');
    const error = next.mock.calls[0][0];

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });
});
