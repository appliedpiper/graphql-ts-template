import type { GraphQLResolveInfo } from 'graphql';
import type { Resolver, ResolverFn } from '@/__generated__/types';
/**
 * Safely unwraps a resolver and calls it with all four arguments
 * Required to resolve 'This expression is not callable' directly calling Resolvers
 * This is related to how the resolvers are defined using the TS code generator
 * @param resolver - The resolver to call (from QueryResolvers, MutationResolvers, etc.)
 * @param parent - Parent object (usually null for root fields)
 * @param args - Arguments object
 * @param context - Your Context object
 * @param info - Optional GraphQLResolveInfo (default is a mock)
 * @returns The result of the resolver
 */
export async function callResolver<
  TResult,
  TParent = Record<PropertyKey, never>,
  TContext = any,
  TArgs = any
>(
  resolver: Resolver<TResult, TParent, TContext, TArgs> | undefined,
  parent: TParent = {} as TParent,
  args: TArgs = {} as TArgs,
  context: TContext,
  info: GraphQLResolveInfo = {} as GraphQLResolveInfo
): Promise<TResult> {
  if (!resolver) throw new Error('Resolver is undefined');

  // unwrap the resolver if it is a { resolve } object
  const fn: ResolverFn<TResult, TParent, TContext, TArgs> =
    typeof resolver === 'function' ? resolver : resolver.resolve;

  return await fn(parent, args, context, info);
}