import { initMongo } from "@/datasources/mongo";
import type { MongoCollections } from "@/datasources/mongo";
import type { KeyValueCache } from "@apollo/utils.keyvaluecache";  // Apollo cache type

import { bearerToken } from "@/lib/auth/bearer";
import type { SessionIdentity, SessionVerifier } from "@/lib/auth/verifySession";

// Define the DataSource at @/datasource
// Then Add DataSources to the context
export type DataSources = {
  businessAPI: MongoCollections;
  // Add Future data sources here:
  // mariaDB: MariaDbDataSource;
};

// Define the Context with dataSources and server cache
// Store the result of your queries in the cache to improve server performance
export type Context = {
  dataSources: DataSources;
  cache: KeyValueCache<string>;
  /**
   * The verified caller, or `null` for an unauthenticated request.
   *
   * `null` covers every failure the same way — no header, a malformed one, an
   * expired or forged token. Resolvers must not read this directly to decide
   * access; use the guards in `@/lib/auth/guards`, which are applied to every
   * root field by default in `resolvers.ts`.
   *
   * A non-null value means the signature was verified against Clerk's JWKS.
   * `role` may still be undefined — see roles.ts.
   */
  auth: SessionIdentity | null;
};

// Only the part of the Express request this needs, so tests pass a literal
// rather than constructing a request object.
export type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
};

export async function createContext({
  cache,
  req,
  verifySession,
}: {
  cache: KeyValueCache<string>;
  req: RequestLike;
  /**
   * Injected so tests supply a fake. The server entry point passes the real
   * one, built from `CLERK_SECRET_KEY`.
   */
  verifySession: SessionVerifier;
}): Promise<Context> {
  // Identity is resolved first so that the auth decision itself never depends
  // on database state.
  //
  // Note what this does NOT buy: `initMongo` below still runs for an
  // unauthenticated request, because the context is built before Apollo knows
  // which field is being resolved, and the guards run after. So a Mongo outage
  // still fails the request here — ordering cannot change that. Making a
  // refused request skip the connection entirely would need lazily-resolved
  // data sources, which is noted as a gap in docs/auth.md rather than done
  // here. The guards do guarantee no *query* runs, which is the part that
  // matters.
  //
  // Node lowercases incoming header names.
  const rawHeader = req.headers.authorization;
  const token = bearerToken(rawHeader);

  let auth: SessionIdentity | null = null;

  if (token) {
    auth = await verifySession(token);

    if (!auth) {
      // The client is told nothing beyond "unauthenticated" — see guards.ts.
      // This goes to the SERVER log only, where it leaks nothing and is the
      // difference between a five-minute fix and an afternoon.
      console.warn(
        '[auth] a Bearer token was supplied but failed verification. ' +
          'Usual causes: it expired (Clerk session tokens last ~60s), ' +
          'or it was issued by a different Clerk instance than CLERK_SECRET_KEY.',
      );
    }
  } else if (rawHeader !== undefined) {
    // A header was sent but is not parseable as `Bearer <token>`. Worth saying
    // out loud: this exact case (a stray colon, `Bearer: <token>`) produced an
    // UNAUTHENTICATED that looked like a bad token for far too long.
    console.warn(
      '[auth] an Authorization header was sent but is not a valid ' +
        '`Bearer <token>` value, so it was ignored. Check for a stray colon ' +
        '("Bearer: ..."), a missing space, or the wrong scheme. ' +
        'The header value must be exactly: Bearer <token>',
    );
  }

  const businessCollections = await initMongo();
  // const mariaDB = await initMariaDb();

  return {
    dataSources: {
      businessAPI: businessCollections,
      // mariaDB,
    },
    cache,
    auth,
  };
}
