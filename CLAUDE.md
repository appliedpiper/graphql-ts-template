# CLAUDE.md — Backend (GraphQL / Apollo / MongoDB)

## Stack
- Apollo Server v5 + Express 5 (`@as-integrations/express5`)
- MongoDB via the native driver — no ODM, no Mongoose
- Schema-first: modular `.graphql` type defs, GraphQL Codegen for types
- Validation: Zod v4
- Tests: Jest + ts-jest + `mongodb-memory-server` — tests spin up an
  in-memory Mongo instance; don't point tests at a real database.
  Two gotchas, both documented in `docs/auth.md`: Jest runs with
  `diagnostics: false`, so **a green `pnpm test` does not imply a green
  `tsc --noEmit`** — run both; and on **arm64** the in-memory Mongo cannot
  start without
  `MONGOMS_DISTRO=ubuntu-22.04 MONGOMS_VERSION=8.0.4`.
  Prefer new tests that need no database at all (the auth tests use data
  sources that throw on access, which also proves a refusal happens before
  any data is touched)
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
CLERK_SECRET_KEY=sk_test_...   # required; copy from frontend/.env.local
```

## Seed data
`seedDatabase` mutation (`userCount` / `orderCount`) is for local/dev
seeding only — never call it from anything resembling a real user flow.
It now requires the `admin` role **and** refuses when
`NODE_ENV=production`, because it `deleteMany({})`s both collections before
inserting. Both checks are independent; don't remove either.

**But do not treat it as safe.** `MONGO_URI` in `.env.local` points at a
**live Atlas cluster**, and local dev runs with `NODE_ENV=development` — so
the production check never fires and `seedDatabase` wipes real data. The
`admin` role is the only thing actually standing in the way. See
`docs/auth.md`.

**`seedDatabase` is slated for removal**, to be replaced by admin user
import/export (proposal in `PROGRESS.md`). Don't invest in hardening it, and
don't build anything new on top of it.

## Auth (implemented — read before touching resolvers)
Clerk session tokens **are** verified in the Apollo context. See
`docs/auth.md` for the full picture; the parts that change how you work:

- **`context.auth`** is `{ userId, role } | null`. It is `null` for any
  unverified request — missing header, malformed, expired, forged all look
  identical on purpose. There is no `context.user`.
- **Don't call guards inside resolver bodies.** Authorization is applied to
  whole resolver maps by `withAuth` in `src/resolvers/resolvers.ts`, where
  the policy table lives. A resolver body can assume it is authorized.
- **Adding a root field requires a policy entry** in `queryPolicy` or
  `mutationPolicy` (`'user'` or `'admin'`). This is **default-deny enforced
  at module load**: without an entry the server throws at startup naming the
  field. That's intentional — don't work around it, and don't add `'public'`
  unless the field is genuinely meant to be reachable with no session.
- **`src/lib/auth/roles.ts` is a deliberate duplicate** of the frontend's
  copy. Change one, change the other in the same breath — a drift means the
  API and the UI disagree about who is an admin. A test pins the list on
  each side.
- **`CLERK_SECRET_KEY` is required** and parsed at import, so the server
  refuses to boot without it. Frontend and backend must be the same Clerk
  instance.
- **Authorization is not isolation.** Any verified session can read *every*
  user and order; `users` and `orders` have no ownership field. Don't
  describe a resolver as "scoped to the customer" — that work doesn't exist
  yet.

## Commands
```
pnpm dev        # tsx watch, :4000/graphql
pnpm dev:token  # print a Clerk session token for manual GraphQL queries
pnpm generate   # graphql-codegen — run after any schema change
pnpm build      # tsc + tsc-alias
pnpm test       # jest
```

`pnpm dev:token` needs an account already signed in at :3000; it mints a token
for that live session via the Clerk Backend API. It is a convenience, **not** an
auth bypass — the server still verifies and still applies the policy — and it
refuses to run when `NODE_ENV=production`. The header value it prints is
`Bearer <token>`: one space, **no colon**. `Bearer: <token>` is ignored and
looks identical to a bad token, which has caught us once.

## Docker

Note there are **two** compose setups. `backend/docker-compose.yml` defines
`graphql-dev`/`graphql-prod`; the stack actually used for this project is the
root `claude/docker-compose.override.yml`, whose service is named **`backend`**
(which is what the frontend's `GRAPHQL_SERVER=http://backend:4000/graphql`
resolves).

```
docker-compose up graphql-dev --build     # hot reload
docker-compose up graphql-prod --build    # production build
```

### After adding a dependency, restart the backend container

**`pnpm add` run outside the container does not reach it.** The `backend`
service mounts `backend_node_modules:/app/node_modules` — a *named volume* that
shadows the bind-mounted `node_modules`, so the container has its own copy, and
`pnpm install` only runs in its startup command.

Meanwhile `pnpm dev` is `tsx watch`, which **does** pick up source changes
live. So the failure mode is: new code loads, its new import doesn't exist in
the container, the server dies with `ERR_MODULE_NOT_FOUND`, and the frontend
just shows a failed query. This happened once already, with `@clerk/backend`.

```
docker compose restart backend     # re-runs pnpm install, then pnpm dev
docker compose logs -f backend     # expect "Server is Running"
```

Also worth knowing: the `backend` service sets no `MONGO_URI`, so it inherits
the one from `.env.local` — **the live Atlas cluster.** See the `seedDatabase`
warning above.