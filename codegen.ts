import type { CodegenConfig } from "@graphql-codegen/cli";

// Configuration File for GraphQL CodeGen

const config: CodegenConfig = {
  schema: "./src/schema/**/*.graphql",
  // schema: "http://localhost:4000",   // If using gql tag
  generates: {
    // "./src/__generated__/": {
    //   preset: "client",
    //   presetConfig: {
    //     gqlTagName: "gql",
    //   },
    // },
    "./src/__generated__/types.ts": {
      plugins: ["typescript", "typescript-resolvers"],
      config: {
        useTypeImports: true,
        avoidOptionals: false,
        maybeValue: 'T | null | undefined',
        scalars: {
          Email: 'string',
          Date: 'Date',
        }
      }
    },
  },
};

export default config;