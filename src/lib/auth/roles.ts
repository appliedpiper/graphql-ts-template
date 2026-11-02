// Role vocabulary for the GraphQL layer, and safe parsing of the role out of a
// verified Clerk session token's claims.
//
// DELIBERATE DUPLICATE of `frontend/src/lib/auth/roles.ts`. The two cannot be
// shared: they are separate repos, and the contract package only flows
// backend -> frontend, never the reverse. Keep `ROLES` and the parsing rules in
// step with the frontend copy — if they drift, the API and the UI will disagree
// about who is an admin. The frontend copy carries the same warning.
//
// One real difference, and it matters: the frontend reads claims from
// `auth()`, this reads them from `verifyToken`. Both nest the role under a
// `metadata` claim, which only exists if the Clerk Dashboard is configured with
// `{ "metadata": "{{user.public_metadata}}" }`. Every level is therefore
// treated as possibly absent.

export const ROLES = ['admin', 'user'] as const;

export type Role = (typeof ROLES)[number];

// Only the shape we rely on, rather than Clerk's full JwtPayload — this module
// stays importable without pulling Clerk's types in.
export type ClaimsLike =
  | { metadata?: { role?: unknown } | null }
  | null
  | undefined;

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

// Returns undefined for an absent, misspelled, or non-string role so callers
// fail closed instead of trusting an unrecognised value.
export function getRole(claims: ClaimsLike): Role | undefined {
  const raw = claims?.metadata?.role;
  return isRole(raw) ? raw : undefined;
}

/**
 * `user` means "any signed-in account" — a verified session with no usable role
 * claim still satisfies it, because the role is only decisive for `admin`.
 * This mirrors the frontend's policy exactly; see the duplication note above.
 */
export function satisfiesRole(actual: Role | undefined, required: Role): boolean {
  return required === 'user' ? true : actual === 'admin';
}
