import { GraphQLScalarType, Kind } from 'graphql';
import type { ValueNode } from 'graphql';

const validateEmail = (email: unknown): string  => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (typeof email !== 'string' || !emailRegex.test(email)) {
    throw new TypeError(`Invalid email address: ${email}`);
  }
  return email;
};

export const Email = new GraphQLScalarType({
  name: 'Email',
  description: 'A custom scalar for email addresses',

  // Handles output data from the server
  serialize(value: unknown): string {
       return validateEmail(value);
  },

  // Handles incoming query variable data
  parseValue(value: unknown): string {
    return validateEmail(value);
  },

  // Handles hardcoded literal values in the query
  parseLiteral(ast: ValueNode): string | null {
    if (ast.kind !== Kind.STRING) {
      throw new TypeError(`Cannot parse non-string value as EmailAddress`);
    }
    return validateEmail(ast.value);
  },
});