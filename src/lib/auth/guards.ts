// Resolver-level authorization.
//
// These are the enforcement point for the GraphQL API. They are applied to
// every root field by `withAuth` in `resolvers.ts` — not called ad hoc inside
// individual resolvers — so that adding a resolver cannot accidentally ship it
// unprotected. See the policy table in that file.
//
// Nothing here reads the database. A refused request is refused before any data
// source is touched.

import { GraphQLError } from 'graphql';

import { satisfiesRole, type Role } from './roles';
import type { SessionIdentity } from './verifySession';

// Apollo Server maps these to HTTP 401 and 403 respectively.
export const UNAUTHENTICATED = 'UNAUTHENTICATED';
export const FORBIDDEN = 'FORBIDDEN';

// Deliberately generic. The caller learns that it failed, not which check or
// why — a missing header, an expired token and a forged signature all read the
// same, so nothing here helps someone work out what to adjust.
const NOT_SIGNED_IN = 'You must be signed in to perform this action.';
const NOT_PERMITTED = 'You do not have permission to perform this action.';

/** The slice of Context these need, so they are testable without a database. */
export type AuthContext = { auth: SessionIdentity | null };

export function unauthenticatedError(): GraphQLError {
  return new GraphQLError(NOT_SIGNED_IN, {
    extensions: { code: UNAUTHENTICATED, http: { status: 401 } },
  });
}

export function forbiddenError(): GraphQLError {
  return new GraphQLError(NOT_PERMITTED, {
    extensions: { code: FORBIDDEN, http: { status: 403 } },
  });
}

/**
 * Throws unless the request carries a verified session satisfying `required`,
 * then returns the identity.
 *
 * The two failures are distinct on purpose: an unverified caller gets 401 so a
 * client knows to sign in, while a verified caller lacking the role gets 403
 * because retrying with the same token will never help.
 */
export function requireRole(ctx: AuthContext, required: Role): SessionIdentity {
  const { auth } = ctx;

  if (!auth) {
    throw unauthenticatedError();
  }

  if (!satisfiesRole(auth.role, required)) {
    throw forbiddenError();
  }

  return auth;
}

/** Any verified session. See the `user` note in roles.ts. */
export function requireUser(ctx: AuthContext): SessionIdentity {
  return requireRole(ctx, 'user');
}

/** A verified session carrying the `admin` role. */
export function requireAdmin(ctx: AuthContext): SessionIdentity {
  return requireRole(ctx, 'admin');
}
