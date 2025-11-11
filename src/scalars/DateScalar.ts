import { GraphQLScalarType, Kind } from 'graphql';

export const DateScalar = new GraphQLScalarType({
  name: 'Date',
  description: 'Date custom scalar type',
  serialize(value: unknown): string {
    // Converts Date objects to a string for client-side consumption
    if (value instanceof Date) {
      return value.toISOString(); // e.g., "2023-10-27T10:00:00.000Z"
    }
    throw new Error('DateScalar can only serialize Date objects');
  },
  parseValue(value:unknown): Date {
    // Converts client-side input string to a Date object for server-side use
    if (typeof value === 'string') {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error('DateScalar parseValue received an invalid date string');
      }
      return date;
    }
    throw new Error('DateScalar can only parse string values');
  },
  parseLiteral(ast): Date | null {
    // Handles date literals in GraphQL queries
    if (ast.kind === Kind.STRING) {
      const date = new Date(ast.value);
      if (isNaN(date.getTime())) {
        throw new Error('DateScalar parseLiteral received an invalid date string');
      }
      return date;
    }
    return null;
  },
});