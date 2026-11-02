// Verifies a Clerk session token and reduces it to the identity the GraphQL
// layer actually needs.
//
// This is the only module that talks to Clerk. Everything downstream works with
// the plain `SessionIdentity` below, which is what makes the resolver guards and
// the context testable without a network call or a real token.

import { verifyToken } from '@clerk/backend';

import { getRole, type Role } from './roles';

export type SessionIdentity = {
  userId: string;
  role: Role | undefined;
};

/**
 * A token verifier. `createContext` takes one of these rather than importing
 * the real implementation, so tests inject a fake instead of reaching Clerk's
 * JWKS endpoint.
 */
export type SessionVerifier = (token: string) => Promise<SessionIdentity | null>;

/**
 * Builds the real verifier.
 *
 * `secretKey` is passed in rather than read from `env` here, which keeps this
 * module importable (and testable) without a configured environment — the Zod
 * `.parse()` stays at the server entry point.
 *
 * `verifyToken` checks the signature against Clerk's JWKS (fetched once and
 * cached by the SDK), along with expiry, not-before, and the authorized-party
 * claim. It *throws* on anything invalid; this wrapper converts that to `null`,
 * so callers get one unambiguous "no identity" answer and cannot accidentally
 * treat a verification failure as a successful anonymous request.
 */
export function createSessionVerifier(secretKey: string): SessionVerifier {
  return async function verifySession(token: string): Promise<SessionIdentity | null> {
    try {
      const claims = await verifyToken(token, { secretKey });

      // `sub` is the Clerk user id and is always present on a session token.
      // Treat its absence as a failure rather than inventing an empty identity.
      if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
        return null;
      }

      return {
        userId: claims.sub,
        // undefined when the Clerk Dashboard session claim
        // `{ "metadata": "{{user.public_metadata}}" }` is not configured, or
        // when the role is absent or unrecognised. Fails closed either way —
        // see roles.ts.
        role: getRole(claims as { metadata?: { role?: unknown } | null }),
      };
    } catch {
      // Expired, malformed, wrong signature, wrong instance — all the same
      // answer. The reason is deliberately not surfaced to the client: it would
      // tell an attacker which part of their token to fix.
      return null;
    }
  };
}
