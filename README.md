# GraphQL TypeScript Template

A standalone GraphQL server template built with **TypeScript**, **MongoDB**, and **Apollo Server**, designed for rapid API development. GraphQL Server can be deployed in a local or containerized environment.   

--- 
## Table of Contents
- [Features](#features)
- [Authentication](#authentication)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Configure Environment Variables](#configure-environment-variables)
- [Seeding the Database](#seeding-the-database)
- [Customizing the Schema](#customizing-the-schema)
- [Testing](#testing)
- [Docker](#docker)
- [Contributing](#contributing)
- [License](#license)


## Features
- TypeScript-first GraphQL API
- MongoDB as primary data source
- Modular `.graphql` schema files
- Apollo Server context with multiple datasources support
- Custom Scalars (`Date`, `Email`)
- GraphQL Codegen for TypeScript types
- **Clerk session-token verification on every resolver**, with role-based
  authorization and default-deny for new fields — see
  [Authentication](#authentication)
- Seed data mutations for users and orders (admin-only, non-production)
- Jest tests for resolvers, database operations, and authorization
- Containerized GraphQL Production and Development builds

---

## Authentication

**Every GraphQL root field requires a verified Clerk session.** There are no
unauthenticated queries or mutations. Requests arrive with the caller's Clerk
session token as `Authorization: Bearer <token>`; the Apollo context verifies it
against Clerk's JWKS and derives `{ userId, role }`, and a per-field policy
decides what that identity may do.

| | |
| --- | --- |
| Reads (`users`, `orders`, …) | any verified session |
| Writes (`addUser`, `seedDatabase`) | the `admin` role |
| `seedDatabase` | additionally refuses when `NODE_ENV=production` |

Two things to know before working on this:

- **`CLERK_SECRET_KEY` is required** and the server will not boot without it.
  Copy it from `frontend/.env.local`; both sides must point at the same Clerk
  instance.
- **Apollo Sandbox needs a token.** Queries return `UNAUTHENTICATED` until you
  paste one into the Headers pane. There is no bypass flag, on purpose. Get one
  with:

  ```bash
  docker compose exec backend pnpm dev:token
  ```

  The header value must be `Bearer <token>` — one space, **no colon**.
  `Bearer: <token>` is silently ignored and looks exactly like a bad token.

Full details — the request flow, the error codes, how to get a token for
Sandbox, how to add a resolver, troubleshooting, and the known gaps (reads are
**not** scoped per customer) — are in **[docs/auth.md](./docs/auth.md)**.

---

## Prerequisites

- Node.js >= 18
- pnpm >= 10
- MongoDB instance (local or cloud)

---

## Getting Started

Follow these steps to set up the project locally:

1. **Install pnpm globally** (if not already installed):

```bash
npm install -g pnpm
```

2. **Clone the Repository**
```bash
git clone https://github.com/appliedpiper/graphql-ts-template.git
cd graphql-ts-template
```

3. **Install the Dependencies**
```bash
pnpm install
```

4. **Configure Environment Variables**
Update the .env file in the project root to specify the MongoDB URI, Database Name, GraphQL Port, and the Clerk secret key used to verify session tokens
```
DOTENV_CONFIG_QUIET=true
GQL_PORT=4000
#Replace the MONGO_URI with your MongoDB connection string
MONGO_URI=mongodb://localhost:27017
DB_NAME=gql_template
#Copy from frontend/.env.local — both must be the same Clerk instance
CLERK_SECRET_KEY=sk_test_...
```
`CLERK_SECRET_KEY` is **required**: the server refuses to boot without it rather than starting with token verification silently disabled. Never commit, log, or echo it.

5. **Start the Development Server**
```bash
pnpm dev
```
Your server should now be running at http://localhost:4000/graphql (or the port you specified).


6. **Seeding the Database**
Use the GraphQL mutation seedDatabase to populate user and orders collections.  Defaults: userCount = 5, orderCount = 10.

> **Requires an `admin` session token, and refuses to run when `NODE_ENV=production`.** This mutation **deletes every user and order** before inserting, so it is local/dev only. See [docs/auth.md](./docs/auth.md#calling-the-api-by-hand) for how to supply a token.
```
mutation SeedDatabase($input: SeedInput) {
  seedDatabase(input: $input) {
    ordersInserted
    usersInserted
  }
}
```

Define the SeedInput as part of the gql variables
```
  "variables": {
    "input": {
      "orderCount": 10,
      "userCount": 20
    }
  }
```

7. **Execute GQL Queries**
From http://localhost:4000/graphql Build a query such as the one below.

> **You must supply a session token first**, or every query returns `UNAUTHENTICATED`. Sign in at http://localhost:3000, then run `pnpm dev:token` (or `docker compose exec backend pnpm dev:token`) and paste the header value it prints into Sandbox's Headers pane — name `Authorization`, value `Bearer <token>` with **no colon**. See [docs/auth.md](./docs/auth.md#calling-the-api-by-hand). Tokens last ~60 seconds; re-run to refresh.

```
query USER_QUERY {
  user(name: "1") {
    firstName
    lastName
    email
    orders {
      total
      createdAt
    }
  }
}
```

8.  **Customizing the Schema**
Update the schema as desired (/src/schema), creating new types, scalars, queries and mutations.  After you make changes be sure to stop the GraphQL server and run:

```bash
pnpm generate
```

This will create the new TypeScript Types from the GraphQL Schema in /src/__generated__/types.ts.  /src/schema/typeDefs.ts imports all sub-schemas.  

Depending on the size of your project or organizational preference, you may want to organize your schema directory based on feature.  

Ex: 
```
src/
├─ schema/
│ ├─ user/
│ │ ├─ typeDefs.graphql
│ │ ├─ resolvers.ts
│ ├─ order/
│ │ ├─ typeDefs.graphql
│ │ ├─ resolvers.ts
```
9.  **Testing**
JEST is configured for Typescript.  Example test cases are located in /src/__tests__/*.test.ts.  Tests and coverage report can be executed by running:

```bash
pnpm test
npx tsc --noEmit    # run both — see below
```

**A passing `pnpm test` does not mean the types are sound.** The Jest config sets `diagnostics: false` for speed, so a test file with type errors still runs and passes. Run `npx tsc --noEmit` as well.

**On arm64**, `mongodb-memory-server` cannot start — it resolves the platform as `linux-aarch64-debian12`, which MongoDB publishes no build for, and the database-backed tests all fail with a `DownloadError` before any assertion runs. Override it:

```bash
MONGOMS_DISTRO=ubuntu-22.04 MONGOMS_VERSION=8.0.4 pnpm test
```

The distro needs the dotted form (`ubuntu-22.04`, not `ubuntu2204`). This is not pinned in `package.json` because the default detection is correct on x86.

10. **Docker**
To improve the deployment process I included a Dockerfile and docker-compose.yml to fully containerize a production or development environments.  

```bash
# Development mode with hot reload
docker-compose up graphql-dev --build

# Production mode
docker-compose up graphql-prod --build
```

## Contributing

1. Fork the repository
2. Create a feature branch (git checkout -b feature/my-feature)
3. Commit your changes (git commit -m 'Add new feature')
4. Push to the branch (git push origin feature/my-feature)
5. Open a pull request

## License
This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.