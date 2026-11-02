import { GraphQLError } from 'graphql';

import { withAuth, type FieldPolicy } from '@/lib/auth/withAuth';
import { UNAUTHENTICATED, FORBIDDEN } from '@/lib/auth/guards';

// The composed, production resolver map. Importing it is itself part of the
// test: `withAuth` throws at module load if any root field lacks a policy, so a
// resolver added without one fails this file immediately.
import { resolvers } from '@/resolvers/resolvers';

const anonymous = { auth: null };
const signedIn = { auth: { userId: 'user_1', role: 'user' as const } };
const admin = { auth: { userId: 'user_2', role: 'admin' as const } };

// A data source that fails loudly if a guard lets a refused request through to
// it. This is what proves the guard runs *before* the resolver body — a refusal
// must never touch Mongo.
const explodingDataSources = {
  businessAPI: {
    get users() {
      throw new Error('a refused request reached the users collection');
    },
    get orders() {
      throw new Error('a refused request reached the orders collection');
    },
  },
} as never;

function contextFor(auth: unknown) {
  return { ...(auth as object), dataSources: explodingDataSources, cache: {} } as never;
}

function call(entry: unknown, context: unknown) {
  const fn = entry as (p: unknown, a: unknown, c: unknown, i: unknown) => unknown;
  return fn({}, {}, context, {});
}

async function errorFrom(entry: unknown, context: unknown): Promise<GraphQLError> {
  try {
    await call(entry, context);
  } catch (error) {
    return error as GraphQLError;
  }
  throw new Error('expected the resolver to be refused, but it resolved');
}

// ////////////////////////////////////////////
//   The headline property: nothing is open
// ////////////////////////////////////////////
describe('the composed resolver map refuses every unauthenticated request', () => {
  const rootMaps = [
    ['Query', resolvers.Query],
    ['Mutation', resolvers.Mutation],
  ] as const;

  for (const [mapName, map] of rootMaps) {
    const fields = Object.keys(map ?? {});

    it(`${mapName} has fields to check`, () => {
      // Guards against the suite below passing vacuously because the map was
      // empty or the import shape changed.
      expect(fields.length).toBeGreaterThan(0);
    });

    describe(mapName, () => {
      it.each(fields)('%s is refused with UNAUTHENTICATED when anonymous', async (field) => {
        const error = await errorFrom(
          (map as Record<string, unknown>)[field],
          contextFor(anonymous),
        );

        expect(error).toBeInstanceOf(GraphQLError);
        expect(error.extensions?.code).toBe(UNAUTHENTICATED);
      });

      it.each(fields)('%s never reaches a data source when refused', async (field) => {
        // explodingDataSources throws a plain Error on property access, so if a
        // guard ran too late the assertion above would still pass while this
        // one catches it.
        const error = await errorFrom(
          (map as Record<string, unknown>)[field],
          contextFor(anonymous),
        );

        expect(error.message).not.toMatch(/reached the (users|orders) collection/);
      });
    });
  }
});

// ////////////////////////////////////////////
//   The configured policy, field by field
// ////////////////////////////////////////////
describe('query policy — any verified session may read', () => {
  const queryFields = Object.keys(resolvers.Query ?? {});

  it.each(queryFields)('%s is not refused for a signed-in non-admin', async (field) => {
    // It will fail on the exploding data source instead, which is the proof it
    // got past the guard. A GraphQLError here would mean it was refused.
    const error = await errorFrom((resolvers.Query as Record<string, unknown>)[field], contextFor(signedIn));

    expect(error).not.toBeInstanceOf(GraphQLError);
    expect(error.message).toMatch(/reached the (users|orders) collection/);
  });
});

describe('mutation policy — writes require admin', () => {
  const mutationFields = Object.keys(resolvers.Mutation ?? {});

  it('covers addUser and seedDatabase', () => {
    expect(mutationFields.sort()).toEqual(['addUser', 'seedDatabase']);
  });

  it.each(mutationFields)('%s is refused with FORBIDDEN for a signed-in non-admin', async (field) => {
    const error = await errorFrom(
      (resolvers.Mutation as Record<string, unknown>)[field],
      contextFor(signedIn),
    );

    expect(error.extensions?.code).toBe(FORBIDDEN);
  });

  it.each(mutationFields)('%s is not refused for an admin', async (field) => {
    const error = await errorFrom(
      (resolvers.Mutation as Record<string, unknown>)[field],
      contextFor(admin),
    );

    expect(error).not.toBeInstanceOf(GraphQLError);
  });
});

describe('field resolvers are deliberately unguarded', () => {
  it('leaves User.orders unwrapped, since it is only reachable via a guarded root field', async () => {
    // Pinned so the "why" is recorded as a test rather than only a comment: if
    // someone wraps it, this fails and they have to read the comment in
    // resolvers.ts before proceeding.
    const orders = (resolvers.User as Record<string, unknown>)?.orders;
    expect(typeof orders).toBe('function');

    // Reaching the data source without a session is the expected outcome here:
    // it proves no guard was applied. The resolver is async, so this is a
    // rejection rather than a synchronous throw.
    await expect(call(orders, contextFor(anonymous))).rejects.toThrow(
      /reached the orders collection/,
    );
  });
});

// ////////////////////////////////////////////
//   withAuth itself
// ////////////////////////////////////////////
describe('withAuth — default-deny at module load', () => {
  const noop = () => 'ok';

  it('throws when a field has no policy entry, naming the field', () => {
    expect(() => withAuth({ a: noop, b: noop }, { a: 'user' }, 'Query')).toThrow(/\bb\b/);
    expect(() => withAuth({ a: noop, b: noop }, { a: 'user' }, 'Query')).toThrow(
      /no auth policy/i,
    );
  });

  it('names the map in the error so a startup failure is actionable', () => {
    expect(() => withAuth({ a: noop }, {}, 'Mutation')).toThrow(/^Mutation/);
  });

  it('throws when the policy names a field that does not exist', () => {
    // A renamed resolver leaves a stale entry; without this the new name would
    // be caught but the old entry would make the mistake look intentional.
    expect(() => withAuth({ a: noop }, { a: 'user', removed: 'admin' }, 'Query')).toThrow(
      /do not exist: removed/,
    );
  });

  it('throws for an entry it cannot guard rather than passing it through', () => {
    expect(() =>
      withAuth({ a: 'not a resolver' as unknown as () => void }, { a: 'user' }, 'Query'),
    ).toThrow(/cannot guard/);
  });

  it('accepts a { resolve } object as well as a bare function', () => {
    // codegen can emit either shape; the existing callResolver helper handles
    // both, so this wrapper has to as well.
    const wrapped = withAuth({ a: { resolve: noop } }, { a: 'user' }, 'Query');
    expect(call((wrapped as Record<string, unknown>).a, signedIn)).toBe('ok');
  });
});

describe('withAuth — guarding behaviour', () => {
  const noop = () => 'ok';

  it('passes parent, args, context and info through unchanged', () => {
    const spy = jest.fn().mockReturnValue('ok');
    const wrapped = withAuth({ a: spy }, { a: 'user' }, 'Query');
    const info = { fieldName: 'a' };

    const fn = (wrapped as Record<string, unknown>).a as (
      p: unknown,
      a: unknown,
      c: unknown,
      i: unknown,
    ) => unknown;
    fn({ parent: true }, { arg: 1 }, signedIn, info);

    expect(spy).toHaveBeenCalledWith({ parent: true }, { arg: 1 }, signedIn, info);
  });

  it('does not call the resolver at all when the guard refuses', () => {
    const spy = jest.fn();
    const wrapped = withAuth({ a: spy }, { a: 'admin' }, 'Query');

    expect(() => call((wrapped as Record<string, unknown>).a, signedIn)).toThrow(GraphQLError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("leaves a 'public' field reachable without a session", () => {
    const wrapped = withAuth({ a: noop }, { a: 'public' }, 'Query');
    expect(call((wrapped as Record<string, unknown>).a, anonymous)).toBe('ok');
  });

  it('returns a new map rather than mutating the one it was given', () => {
    const original = { a: noop };
    const wrapped = withAuth(original, { a: 'admin' }, 'Query');

    expect(wrapped).not.toBe(original);
    expect(original.a).toBe(noop);
  });
});
