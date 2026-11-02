import { GraphQLError } from 'graphql';

import {
  requireRole,
  requireUser,
  requireAdmin,
  UNAUTHENTICATED,
  FORBIDDEN,
  type AuthContext,
} from '@/lib/auth/guards';

const anonymous: AuthContext = { auth: null };
const signedIn: AuthContext = { auth: { userId: 'user_1', role: 'user' } };
const admin: AuthContext = { auth: { userId: 'user_2', role: 'admin' } };
const roleless: AuthContext = { auth: { userId: 'user_3', role: undefined } };

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return (error as GraphQLError).extensions?.code as string;
  }
  throw new Error('expected the guard to throw, but it did not');
}

function statusOf(fn: () => unknown): number | undefined {
  try {
    fn();
  } catch (error) {
    const http = (error as GraphQLError).extensions?.http as { status?: number } | undefined;
    return http?.status;
  }
  throw new Error('expected the guard to throw, but it did not');
}

describe('requireUser', () => {
  it('returns the identity for any verified session', () => {
    expect(requireUser(signedIn)).toEqual({ userId: 'user_1', role: 'user' });
    expect(requireUser(admin)).toEqual({ userId: 'user_2', role: 'admin' });
  });

  it('allows a verified session with no usable role claim', () => {
    // The Clerk Dashboard session claim may not be configured, which makes
    // every account role-less. They are still signed in, and the role is only
    // decisive for admin. Mirrors the frontend's satisfiesRole.
    expect(requireUser(roleless)).toEqual({ userId: 'user_3', role: undefined });
  });

  it('throws UNAUTHENTICATED for an unverified caller', () => {
    expect(() => requireUser(anonymous)).toThrow(GraphQLError);
    expect(codeOf(() => requireUser(anonymous))).toBe(UNAUTHENTICATED);
  });

  it('maps UNAUTHENTICATED to HTTP 401', () => {
    expect(statusOf(() => requireUser(anonymous))).toBe(401);
  });
});

describe('requireAdmin', () => {
  it('returns the identity for an admin', () => {
    expect(requireAdmin(admin)).toEqual({ userId: 'user_2', role: 'admin' });
  });

  it('throws FORBIDDEN for a verified non-admin', () => {
    // 403 rather than 401: the caller is who they say they are, and retrying
    // with the same token will never succeed.
    expect(codeOf(() => requireAdmin(signedIn))).toBe(FORBIDDEN);
    expect(statusOf(() => requireAdmin(signedIn))).toBe(403);
  });

  it('throws FORBIDDEN for a verified session with no role claim', () => {
    expect(codeOf(() => requireAdmin(roleless))).toBe(FORBIDDEN);
  });

  it('throws UNAUTHENTICATED, not FORBIDDEN, for an unverified caller', () => {
    // Order matters: an anonymous caller must not be told that the resource
    // merely needs a better role.
    expect(codeOf(() => requireAdmin(anonymous))).toBe(UNAUTHENTICATED);
    expect(statusOf(() => requireAdmin(anonymous))).toBe(401);
  });

  it('does not grant admin to an unrecognised role smuggled past the types', () => {
    const smuggled = { auth: { userId: 'x', role: 'superadmin' } } as unknown as AuthContext;
    expect(codeOf(() => requireAdmin(smuggled))).toBe(FORBIDDEN);
  });
});

describe('guard error messages', () => {
  it('do not reveal which check failed or why', () => {
    // A missing header, an expired token and a forged signature all arrive here
    // as `auth: null`, and the message must not help someone work out which.
    const messageOf = (fn: () => unknown): string => {
      try {
        fn();
      } catch (e) {
        return (e as GraphQLError).message;
      }
      throw new Error('expected the guard to throw, but it did not');
    };

    const messages = [
      messageOf(() => requireUser(anonymous)),
      messageOf(() => requireAdmin(signedIn)),
    ];

    for (const message of messages) {
      expect(message).toBeTruthy();
      expect(message).not.toMatch(/token|expired|signature|header|jwt|claim/i);
    }
  });
});

describe('requireRole', () => {
  it('is the shared implementation both helpers delegate to', () => {
    expect(requireRole(admin, 'admin')).toEqual(admin.auth);
    expect(requireRole(signedIn, 'user')).toEqual(signedIn.auth);
    expect(codeOf(() => requireRole(signedIn, 'admin'))).toBe(FORBIDDEN);
    expect(codeOf(() => requireRole(anonymous, 'user'))).toBe(UNAUTHENTICATED);
  });
});
