# CLAUDE.md — Backend (GraphQL / Apollo / MongoDB)

## Stack
- Apollo Server v5 + Express 5 (`@as-integrations/express5`)
- MongoDB via the native driver — no ODM, no Mongoose
- Schema-first: modular `.graphql` type defs, GraphQL Codegen for types
- Validation: Zod v4
- Tests: Jest + ts-jest + `mongodb-memory-server` — tests spin up an
  in-memory Mongo instance; don't point tests at a real database
- Package manager: pnpm

## Schema workflow (don't skip steps)
1. Edit/add type defs under `src/schema/<feature>/typeDefs.graphql`
2. Write or update the matching resolver in the same feature folder
3. Stop the dev server and run `pnpm generate` — regenerates
   `src/__generated__/types.ts` from the schema
4. `src/schema/typeDefs.ts` merges all sub-schemas via
   `@graphql-tools/load-files` — confirm a new feature folder is actually
   picked up rather than assuming auto-discovery covers it

This package is also published as `@appliedpiper/graphql-template-contract`
and consumed by the frontend for types. **A schema change here is a
breaking change for the frontend build** until the frontend rebuilds
against the updated contract — call this out explicitly when a task
touches the schema.

## Custom scalars
`Date` and `Email` are already defined as custom scalars — use them for
those field types instead of plain `String` or ad hoc date handling.

## Env vars (`.env`)
```
DOTENV_CONFIG_QUIET=true
GQL_PORT=4000
MONGO_URI=mongodb://localhost:27017
DB_NAME=gql_template
```

## Seed data
`seedDatabase` mutation (`userCount` / `orderCount`) is for local/dev
seeding only — never call it from anything resembling a real user flow.

## Auth (not yet implemented)
There's no JWT/session verification in the Apollo context yet. If a task
implies an "authenticated" resolver, that means adding Clerk session-token
verification to the context function first — don't assume `context.user`
exists.

## Commands
```
pnpm dev        # tsx watch, :4000/graphql
pnpm generate   # graphql-codegen — run after any schema change
pnpm build      # tsc + tsc-alias
pnpm test       # jest
```

## Docker
```
docker-compose up graphql-dev --build     # hot reload
docker-compose up graphql-prod --build    # production build
```