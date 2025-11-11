// TypeScript declaration file designed to provide type definitions for GraphQL
// Declares how .graphql files should be treated when imported into a TypeScript Object
declare module '*.graphql' {
  import { DocumentNode } from 'graphql';
  const Schema: DocumentNode;
  export = Schema;
}