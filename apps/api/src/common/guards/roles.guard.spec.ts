import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../enums';
import { RolesGuard } from './roles.guard';

const contextFor = (user: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  const guardWith = (required: UserRole[] | undefined) => {
    const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
    return new RolesGuard(reflector);
  };

  it('allows any authenticated user when no roles are required', () => {
    expect(guardWith(undefined).canActivate(contextFor({ role: UserRole.VIEWER }))).toBe(true);
  });

  it('rejects a viewer from an operator-only route', () => {
    const guard = guardWith([UserRole.ADMIN, UserRole.OPERATOR]);
    expect(() => guard.canActivate(contextFor({ role: UserRole.VIEWER }))).toThrow(
      ForbiddenException,
    );
  });

  it('allows an operator on an operator route', () => {
    const guard = guardWith([UserRole.ADMIN, UserRole.OPERATOR]);
    expect(guard.canActivate(contextFor({ role: UserRole.OPERATOR }))).toBe(true);
  });

  it('rejects an operator from an admin-only route', () => {
    const guard = guardWith([UserRole.ADMIN]);
    expect(() => guard.canActivate(contextFor({ role: UserRole.OPERATOR }))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects an unauthenticated request', () => {
    expect(guardWith([UserRole.VIEWER]).canActivate(contextFor(undefined))).toBe(false);
  });
});
