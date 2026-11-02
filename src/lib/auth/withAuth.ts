// Applies an authorization policy to a whole resolver map.
//
// The point of doing it here rather than calling a guard inside each resolver
// is **default-deny**: `withAuth` throws at module load if a field in the map
// has no policy entry. Adding a resolver therefore cannot silently ship
// unprotected — the server refuses to start until someone states what the new
// field requires. A runtime default would have been quieter and worse.

import { requireRole } from './guards';
import type { AuthContext } from './guards';
import type { Role } from './roles';

/**
 * What a root field requires. `'public'` is an explicit, greppable opt-out for
 * a field that is genuinely meant to be unauthenticated — it exists so nobody
 * has to bypass this wrapper to add one. Nothing uses it today.
 */
export type FieldPolicy = Role | 'public';

// Structural types rather than codegen's generics: this has to accept whatever
// shape `Resolver<...>` takes without being rewritten after every `pnpm
// generate`. The cast at the end restores the caller's precise type.
type AnyResolverFn = (parent: never, args: never, context: never, info: never) => unknown;
type ResolverEntry = AnyResolverFn | { resolve: AnyResolverFn };

function isResolverFn(entry: unknown): entry is AnyResolverFn {
  return typeof entry === 'function';
}

function hasResolveProperty(entry: unknown): entry is { resolve: AnyResolverFn } {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'resolve' in entry &&
    typeof (entry as { resolve: unknown }).resolve === 'function'
  );
}

/**
 * Wraps every field in `resolvers` with the guard its policy entry names.
 *
 * @param mapName  Only used in error messages ("Query", "Mutation"), so a
 *                 startup failure says which map is missing a policy.
 * @throws at call time (module load) if a field has no policy entry, or if the
 *         policy names a field the map does not have — a stale policy entry is
 *         usually a renamed resolver that has quietly lost its guard.
 */
export function withAuth<T extends Record<string, unknown>>(
  resolvers: T,
  policy: Record<string, FieldPolicy>,
  mapName: string,
): T {
  const fields = Object.keys(resolvers);
  const policed = Object.keys(policy);

  const unpoliced = fields.filter((field) => !(field in policy));
  if (unpoliced.length > 0) {
    throw new Error(
      `${mapName} has no auth policy for: ${unpoliced.join(', ')}. ` +
        `Every root field must declare one in resolvers.ts — add it to the ` +
        `policy map, using 'public' only for a field that is deliberately ` +
        `reachable without a session.`,
    );
  }

  const stale = policed.filter((field) => !(field in resolvers));
  if (stale.length > 0) {
    throw new Error(
      `${mapName} auth policy names fields that do not exist: ${stale.join(', ')}. ` +
        `If a resolver was renamed, rename its policy entry too — otherwise the ` +
        `new name would be caught by the check above, but the old entry hides ` +
        `the mistake.`,
    );
  }

  const wrapped: Record<string, ResolverEntry> = {};

  for (const field of fields) {
    const entry = resolvers[field];
    const required = policy[field];

    const original = isResolverFn(entry)
      ? entry
      : hasResolveProperty(entry)
        ? entry.resolve
        : undefined;

    if (!original) {
      // A security wrapper should not quietly pass through a shape it does not
      // understand, so this is loud rather than permissive.
      throw new Error(
        `${mapName}.${field} is not a resolver function or { resolve } object, ` +
          `so withAuth cannot guard it.`,
      );
    }

    if (required === 'public') {
      wrapped[field] = original;
      continue;
    }

    wrapped[field] = ((parent, args, context, info) => {
      // Throws before the resolver body runs, so a refused request never
      // reaches a data source.
      requireRole(context as unknown as AuthContext, required);
      return original(parent, args, context, info);
    }) as AnyResolverFn;
  }

  return wrapped as unknown as T;
}
