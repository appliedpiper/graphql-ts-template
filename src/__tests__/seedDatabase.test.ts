import { GraphQLError } from 'graphql';

import { mutationResolvers } from '@/resolvers/mutations';
import { callResolver } from '@/__tests__/helpers/callResolver';

// seedDatabase deletes every user and order before inserting, so on top of
// requiring the admin role (enforced by the policy map in resolvers.ts, covered
// in resolverGuards.test.ts) it refuses outright in production. This file
// covers that second, independent check.
//
// The data sources throw on access, so a test that gets past the production
// check fails loudly rather than silently needing a database.
const explodingContext = {
  dataSources: {
    businessAPI: {
      get users(): never {
        throw new Error('reached the users collection');
      },
      get orders(): never {
        throw new Error('reached the orders collection');
      },
    },
  },
  cache: {},
  auth: { userId: 'user_admin', role: 'admin' as const },
} as never;

// The schema declares `seedDatabase(input: SeedInput = {})`, so codegen types
// the argument as required even though both of its fields are optional. The
// resolver reads the counts defensively anyway (`args?.input?.userCount ?? 5`).
const SEED_ARGS = { input: {} };

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe('seedDatabase — refuses to run in production', () => {
  it('throws FORBIDDEN when NODE_ENV is production, even for an admin', async () => {
    process.env.NODE_ENV = 'production';

    await expect(
      callResolver(mutationResolvers.seedDatabase, {}, SEED_ARGS, explodingContext),
    ).rejects.toThrow(GraphQLError);
  });

  it('refuses before touching either collection', async () => {
    process.env.NODE_ENV = 'production';

    // If the production check ran after the deleteMany calls, this would be the
    // exploding-data-source error instead — which is the whole point, since by
    // then the data would already be gone.
    await expect(
      callResolver(mutationResolvers.seedDatabase, {}, SEED_ARGS, explodingContext),
    ).rejects.toThrow(/disabled in production/);
  });

  it('carries the FORBIDDEN code and a 403', async () => {
    process.env.NODE_ENV = 'production';

    try {
      await callResolver(mutationResolvers.seedDatabase, {}, SEED_ARGS, explodingContext);
      throw new Error('expected seedDatabase to be refused');
    } catch (error) {
      const gqlError = error as GraphQLError;
      expect(gqlError.extensions?.code).toBe('FORBIDDEN');
      expect(gqlError.extensions?.http).toEqual({ status: 403 });
    }
  });
});

describe('seedDatabase — outside production', () => {
  it.each(['development', 'test', undefined])(
    'gets past the production check when NODE_ENV is %s',
    async (value) => {
      if (value === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = value;
      }

      // Reaching the data source is success here: it means the production guard
      // let it through and the seeding logic began. The actual seeding is
      // covered by businessAPI.test.ts against a real in-memory Mongo.
      await expect(
        callResolver(mutationResolvers.seedDatabase, {}, SEED_ARGS, explodingContext),
      ).rejects.toThrow(/reached the (users|orders) collection/);
    },
  );
});
