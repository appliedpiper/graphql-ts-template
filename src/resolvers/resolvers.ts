import type { Resolvers } from "@/__generated__/types";
import { mutationResolvers } from "@resolvers/mutations";
import { queryResolvers } from "@resolvers/queries";
import { userResolvers } from "@resolvers/users";
import { withAuth, type FieldPolicy } from "@/lib/auth/withAuth";
import { DateScalar } from "@scalars/DateScalar";
import { Email } from "@scalars/EmailScalar";

// ////////////////////////////////////////////////////////
//  Authorization policy for the GraphQL API
// ////////////////////////////////////////////////////////
//
// Every root field must appear here. `withAuth` throws at module load — so the
// server refuses to start — if a field in either map has no entry, which is what
// stops a newly added resolver from silently shipping unprotected. Use
// 'public' only for something genuinely meant to be reachable without a
// session; nothing is today.
//
// 'user' means any verified Clerk session. 'admin' additionally requires the
// `admin` role claim. See src/lib/auth/roles.ts for how that claim is parsed
// and why it fails closed.
//
// NOTE: this is coarse by design. It does not scope reads to the caller's own
// data — `users` and `orders` carry no ownership field, so any signed-in
// account can read every record. That is a known and separate gap; see
// PROGRESS.md. Do not read this table as "customer data is isolated".

const queryPolicy: Record<keyof typeof queryResolvers, FieldPolicy> = {
  users: 'user',
  userById: 'user',
  userByName: 'user',
  orders: 'user',
  order: 'user',
};

const mutationPolicy: Record<keyof typeof mutationResolvers, FieldPolicy> = {
  addUser: 'admin',
  // Also refuses outright in production, inside the resolver — see mutations.ts.
  seedDatabase: 'admin',
};

// Combined Export for all Resolvers
export const resolvers: Resolvers = {
  Email,
  Date: DateScalar,
  Query: withAuth(queryResolvers, queryPolicy, 'Query'),
  Mutation: withAuth(mutationResolvers, mutationPolicy, 'Mutation'),

  // Field resolvers are deliberately NOT wrapped. `User.orders` is only
  // reachable by first resolving a `User` through a guarded root field, so it
  // cannot be used to read data without passing a guard above. Wrapping it
  // would re-check the same session once per user in a list for no benefit.
  User: userResolvers,
};
