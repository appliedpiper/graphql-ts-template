/**
 * Converts GraphQL Codegen Resolver types to plain callable functions
 * so you don’t get “not callable” or “possibly undefined” TS errors.
 */
export type ResolversFunctions<T> = {
  [K in keyof T]-?: T[K] extends (...args: infer A) => any
    ? (...args: A) => ReturnType<T[K]>
    : T[K] extends { resolve: (...args: infer A) => any }
    ? (...args: A) => ReturnType<T[K]['resolve']>
    : never;
};