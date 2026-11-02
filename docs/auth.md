# API authentication and authorization

Every GraphQL root field on this server requires a verified Clerk session. There
are no unauthenticated queries or mutations.

Before this existed, anything that could reach port 4000 had full read and write
access to the database — including `seedDatabase`, which deletes every user and
order before inserting. That is what this closes.

---

## Contents

- [How a request is authorized](#how-a-request-is-authorized)
- [The policy](#the-policy)
- [What is not behind the guards](#what-is-not-behind-the-guards)
- [Error codes](#error-codes)
- [Calling the API by hand](#calling-the-api-by-hand)
- [Adding a resolver](#adding-a-resolver)
- [Environment variables](#environment-variables)
- [Where each piece lives](#where-each-piece-lives)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Known gaps](#known-gaps)

---

## How a request is authorized

```
Browser
  │  fetch('/api/graphql')              no Clerk session → 401 (JSON)
  ▼
Next.js route handler  (frontend/src/app/api/graphql/route.ts)
  │  attaches Authorization: Bearer <Clerk session token>
  ▼
Apollo context  (src/context/context.ts)
  │  bearerToken()      — parse the header, or no token
  │  verifySession()    — verify the signature against Clerk's JWKS
  │  → context.auth = { userId, role } | null
  ▼
withAuth  (src/lib/auth/withAuth.ts)
  │  applies the policy for the field being resolved
  │  refuses with 401 / 403 before the resolver body runs
  ▼
Resolver
```

Three properties are worth knowing, because each one is deliberate:

1. **Verification failure is indistinguishable from no credential at all.** A
   missing header, a malformed one, an expired token and a forged signature all
   produce `context.auth = null`. `verifySession` catches everything and returns
   `null` rather than throwing — if it threw, Apollo would answer **500** instead
   of treating the request as unauthenticated, which is both wrong and a hint to
   an attacker.

2. **A refused request never touches MongoDB.** The guard throws before the
   resolver body runs. Tests prove this with a context whose data sources throw
   on property access.

3. **The frontend route handler is not the security boundary.** It is a
   convenience that turns a browser session into a Bearer token. Port 4000 is
   reachable directly, so the backend verifies every request itself and would
   refuse an unauthenticated one regardless of how it arrived.

### Why the token is trustworthy

`verifyToken` from `@clerk/backend` checks the signature against Clerk's
published JWKS, along with expiry, not-before, and the authorized-party claim.
The JWKS is fetched once and cached by the SDK, so verification is a local
operation after the first request. Nothing in the token is trusted before that
check, and the role is read only from the verified payload.

---

## The policy

Declared in one place — the policy maps at the top of
`src/resolvers/resolvers.ts`.

| Root field | Requires |
| --- | --- |
| `Query.users` | any verified session |
| `Query.userById` | any verified session |
| `Query.userByName` | any verified session |
| `Query.orders` | any verified session |
| `Query.order` | any verified session |
| `Mutation.addUser` | `admin` |
| `Mutation.seedDatabase` | `admin`, **and** refuses when `NODE_ENV=production` |

`user` means *any* verified session, including one whose role claim is missing or
unrecognised — see the note in `src/lib/auth/roles.ts`. The role is only
decisive for `admin`.

**`User.orders` is intentionally not guarded.** It is a field resolver, reachable
only after a guarded root field has already resolved a `User`, so it cannot be
used to read data without passing a guard first. Wrapping it would re-verify the
same session once per user in a list. There is a test pinning it as unwrapped so
the reasoning gets read before anyone changes it.

### `seedDatabase` has two protections, and one of them is weaker than it looks

It is `admin`-only *and* refuses when `NODE_ENV=production`, checked before the
`deleteMany` calls.

> **The `NODE_ENV` check does not protect a remote database, and in this project
> that is the normal case.** `backend/.env.local` points `MONGO_URI` at a live
> MongoDB Atlas cluster, and local development runs with `NODE_ENV` unset or
> `development`. So running `seedDatabase` locally **will wipe the live
> cluster** — the production check never fires, because the *process* is not in
> production even though the *data* is.
>
> What actually protects that data today is the **`admin` role requirement**,
> nothing else. Treat `seedDatabase` as a destructive operation against real
> data unless you have personally confirmed `MONGO_URI` points somewhere
> disposable.
>
> A guard keyed on the database target rather than on `NODE_ENV` would track the
> real risk. **Deliberately not added** (decision, 2026-11-01): `seedDatabase`
> exists only as a quick testing aid, and the intended direction is to **replace
> it with admin import/export of users** rather than harden a mutation that
> should not survive. Hardening it would have been effort spent on something
> slated for removal. Until then, the `admin` role is the barrier — and the
> warning above applies.

---

## What is *not* behind the guards

Two things resolve without a session, both by GraphQL/Apollo design rather than
by anything in the policy map. Verified by probing a running server, not assumed:

- **Root meta-fields.** `{ __typename }` answers `200` with `"Query"` for an
  unauthenticated caller. It is resolved by the executor, not by a resolver in
  `Query`, so `withAuth` never sees it. It carries no data.
- **Introspection**, in development only. `{ __schema { ... } }` returns the
  full schema — every type and field name — with no session. **Apollo blocks it
  automatically when `NODE_ENV=production`**, answering `400` with *"GraphQL
  introspection is not allowed by Apollo Server"*. No configuration was added
  for this; the default is correct, and it was confirmed by running the server
  both ways.

So in a dev environment the schema shape is readable by anyone who can reach the
port. That is intentional — it is what makes Apollo Sandbox work — and it
exposes no records. If introspection is ever wanted in production, it takes an
explicit `introspection: true`, which should not be added casually.

---

## Error codes

| Code | HTTP | Means | Client should |
| --- | --- | --- | --- |
| `UNAUTHENTICATED` | 401 | No verified session — no token, or it failed verification | Sign in, or refresh the token |
| `FORBIDDEN` | 403 | Verified, but lacks the required role | Nothing; retrying with the same token will never succeed |

The distinction matters: an anonymous caller to an admin-only field gets **401,
not 403**, so they are not told the resource merely needs a better role.

Messages are deliberately generic ("You must be signed in to perform this
action."). They never say *which* check failed or why — that would tell someone
which part of their token to adjust. A test asserts the messages mention none of
`token`, `expired`, `signature`, `header`, `jwt`, or `claim`.

---

## Calling the API by hand

Apollo Sandbox at `http://localhost:4000/graphql` still loads, but every query
now returns `UNAUTHENTICATED` until you supply a token. There is deliberately
**no bypass flag** — an `AUTH_DISABLED`-style escape hatch is exactly the thing
that ends up enabled somewhere it shouldn't be. Use a real token instead.

> ### The mistake to avoid first: `Bearer:` with a colon
>
> The header **name** and **value** are separate fields in Apollo Sandbox. The
> value must be exactly:
>
> ```
> Bearer <token>
> ```
>
> One space, **no colon**. Pasting `Bearer: <token>` leaves a colon that belongs
> to neither field, making the scheme `Bearer:` — which is not the Bearer scheme,
> so the header is ignored and every query answers `UNAUTHENTICATED` with a
> perfectly valid token. This cost real debugging time once; there is a test
> pinning the rejection, and the server now logs the reason (see below).

### Easiest by far: the IDE at `/admin/graphql`

If you just want to run queries, **skip tokens entirely**: sign in and go to
`http://localhost:3000/admin/graphql`. It is an admin-only page embedding Apollo
Sandbox pointed at the frontend's `/api/graphql`, so the browser's Clerk cookie
authenticates it and the route attaches the Bearer token for you. Nothing to
copy, nothing to refresh.

Everything below is for calling the backend **directly** on `:4000` — still
useful for curl, for scripts, and for testing the backend in isolation.

### Directly on :4000 — `pnpm dev:token`

```bash
docker compose exec backend pnpm dev:token
```

Prints a real token for an account that is already signed in, along with the
exact header value to paste, the account's role, and how long the token has
left. An admin is preferred by default so the token can reach admin-only fields.

```
pnpm dev:token                  # admin account first, if one is signed in
pnpm dev:token --role user      # a specific role
pnpm dev:token --email a@b.c    # a specific account
pnpm dev:token --raw            # only the token:  TOKEN=$(pnpm -s dev:token --raw)
pnpm dev:token --help
```

**This is a convenience, not a bypass.** It mints a token for an existing
session using the same Clerk Backend API call the app would, and the server
still verifies the signature and applies the full per-field policy. It refuses
to run when `NODE_ENV=production`, because printing a usable bearer token to a
terminal is a development-only thing to want.

It needs an account to be **signed in at `http://localhost:3000` already** — it
mints a token for a live session, it does not create one. If nobody is signed
in, it says so rather than failing obscurely.

### Alternative: the browser console

Sign in at `http://localhost:3000`, open DevTools → **Console**, and run:

```js
await window.Clerk.session.getToken()
```

That returns the session JWT as a string. `window.Clerk` is the ClerkJS
instance the provider attaches; `getToken()` is the same call the server-side
`auth()` helper makes, so you get exactly the token the app itself sends.

Force a fresh one rather than the cached value with:

```js
await window.Clerk.session.getToken({ skipCache: true })
```

Then in Apollo Sandbox open the **Headers** pane and add:

```
Authorization: Bearer <paste>
```

### Alternative: the session cookie

Same value, fewer keystrokes if the console is already busy: DevTools →
**Application** → **Cookies** → `http://localhost:3000` → copy **`__session`**.

### Or curl

```bash
TOKEN='<paste>'
curl -s http://localhost:4000/graphql \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ users { _id firstName } }"}'
```

### The token expires in about 60 seconds

Clerk refreshes session tokens roughly every minute, so a token pasted into
Sandbox goes stale fast. When queries start failing with `UNAUTHENTICATED`
again, that is almost always why — re-run `getToken({ skipCache: true })`.

Re-running `pnpm dev:token` is the quickest way to get a fresh one, and it tells
you how many seconds the token has left so an expiry is obvious rather than
mysterious.

If even that becomes annoying, a **longer-lived JWT template** is the next step:
create one in the Clerk Dashboard with a longer lifetime and call
`getToken({ template: 'your-template' })`.

> **Caveat that will bite:** a template token carries **only the claims the
> template defines.** This server reads the role from `metadata.role`, so unless
> the template includes `{"metadata": "{{user.public_metadata}}"}`, the role
> arrives `undefined` and every `admin` field answers `FORBIDDEN` while reads
> keep working — a confusing half-broken state that looks like an authorization
> bug rather than a token one.

### When auth fails, read the backend's log

The client is deliberately told nothing beyond `UNAUTHENTICATED` (see
[Error codes](#error-codes)), but the **server log** names the cause. Two
warnings exist, and neither ever prints the token itself:

| Server log line | Means |
| --- | --- |
| `[auth] an Authorization header was sent but is not a valid \`Bearer <token>\` value…` | Malformed header — a stray colon, a missing space, or the wrong scheme. The token was never even looked at |
| `[auth] a Bearer token was supplied but failed verification…` | The header parsed fine but the token didn't verify: expired (~60s), or issued by a different Clerk instance than `CLERK_SECRET_KEY` |

A request with **no** `Authorization` header logs nothing, since anonymous
traffic is normal rather than a misconfiguration.

```bash
docker compose logs -f backend | grep '\[auth\]'
```

**For an `admin` query** you must be signed in as an account whose Clerk
`public_metadata` contains `{ "role": "admin" }`. Reads work with any signed-in
account.

---

## Adding a resolver

The policy is **default-deny, enforced at module load**. Adding a resolver
without a policy entry makes the server refuse to start:

```
Query has no auth policy for: newField. Every root field must declare one in
resolvers.ts — add it to the policy map, using 'public' only for a field that is
deliberately reachable without a session.
```

This is intentional. A runtime default would have been quieter, and a resolver
shipping unprotected is exactly the failure worth making impossible rather than
merely unlikely.

So: add the field to `queryPolicy` or `mutationPolicy` in
`src/resolvers/resolvers.ts` with `'user'` or `'admin'`. Nothing else is needed —
do not call a guard inside the resolver body.

`'public'` exists for a field genuinely meant to be reachable without a session
(a health check, say). It is greppable, and it exists so nobody has to bypass
`withAuth` to add one. Nothing uses it today.

`withAuth` also refuses to start if the policy names a field that no longer
exists — a renamed resolver leaves a stale entry behind, and the new name would
be caught while the orphan made the mistake look deliberate.

---

## Environment variables

```
CLERK_SECRET_KEY=sk_test_...
```

Copy it from `frontend/.env.local`. **Both sides must point at the same Clerk
instance** — a token minted by one instance will not verify against another, and
the symptom is every request returning `UNAUTHENTICATED` with a valid-looking
token.

It is parsed as **required** by the Zod schema in `src/lib/env.ts`, so the server
refuses to boot without it rather than starting with verification silently
disabled.

Never commit it, log it, or echo it.

---

## Where each piece lives

| File | Responsibility |
| --- | --- |
| `src/lib/auth/bearer.ts` | Parse `Authorization: Bearer`. Pure; no Clerk, no Express |
| `src/lib/auth/roles.ts` | Role vocabulary and claim parsing. Fails closed |
| `src/lib/auth/verifySession.ts` | The **only** module that imports Clerk. Never throws |
| `src/lib/auth/guards.ts` | `requireUser` / `requireAdmin` and the two error shapes |
| `src/lib/auth/withAuth.ts` | Applies the policy to a whole resolver map; default-deny |
| `src/resolvers/resolvers.ts` | **The policy itself** — the table above lives here |
| `src/context/context.ts` | Extracts and verifies the caller; sets `context.auth` |
| `src/index.ts` | Builds the verifier once at startup; passes `req` to the context |

**`roles.ts` is a deliberate duplicate** of `frontend/src/lib/auth/roles.ts`.
They cannot be shared — separate repos, and the contract package only flows
backend → frontend. If you change `ROLES` or the parsing rules on one side,
change the other in the same breath, or the API and the UI will disagree about
who is an admin. A test pins the role list on each side so a drift fails rather
than going unnoticed.

---

## Testing

```bash
pnpm test
npx tsc --noEmit    # not optional — see below
```

**A green `pnpm test` does not imply a green `tsc` on this package.** The Jest
config sets `diagnostics: false` for speed, so a test file with type errors runs
and passes anyway. Run both.

Auth coverage lives in:

| File | Covers |
| --- | --- |
| `src/__tests__/bearer.test.ts` | Header parsing, including every malformed shape |
| `src/__tests__/roles.test.ts` | Claim parsing and the fail-closed cases |
| `src/__tests__/verifySession.test.ts` | Reduction of Clerk's claims; that a throw becomes `null` |
| `src/__tests__/context.test.ts` | Token → `context.auth`, and that a bad header never calls the verifier |
| `src/__tests__/guards.test.ts` | 401-vs-403, ordering, and that messages leak nothing |
| `src/__tests__/resolverGuards.test.ts` | The **real composed map** — every root field refuses when anonymous |
| `src/__tests__/seedDatabase.test.ts` | The production refusal, and that it fires before any delete |

`resolverGuards.test.ts` is the one that matters most: it enumerates the actual
`resolvers` export rather than a fixture, so a new unprotected field fails it.

### Running the suite on arm64

`businessAPI.test.ts` uses `mongodb-memory-server`, which resolves an arm64
Linux container as `linux-aarch64-debian12` — a platform **MongoDB publishes no
build for at all**. The symptom is a `DownloadError` with a 403 and all 16 tests
failing before any assertion runs. Override the platform:

```bash
MONGOMS_DISTRO=ubuntu-22.04 MONGOMS_VERSION=8.0.4 pnpm test
```

The distro needs the dotted, hyphen-delimited form — `ubuntu2204` is rejected
with *"Expected DISTRO option to have a release like ubuntu-18.04"*. This is
deliberately not pinned in `package.json`, because the default detection is
correct on x86 and hard-coding an arm64 choice would break it there.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Server exits at startup with an env error | `CLERK_SECRET_KEY` is missing from `.env` / `.env.local`. Fail-closed by design |
| `ERR_MODULE_NOT_FOUND: Cannot find package '@clerk/backend'` in Docker | The container's `node_modules` is a **named volume**, so a `pnpm add` run outside it never arrived. `docker compose restart backend` re-runs `pnpm install`. See `CLAUDE.md` |
| Frontend shows a failed query, backend logs look dead | Same cause as above — `tsx watch` reloaded the new source into a container missing the new dependency |
| Server refuses to start, naming a field with "no auth policy" | A resolver was added without a policy entry. Add it to `resolvers.ts` |
| Server refuses to start, "policy names fields that do not exist" | A resolver was renamed but its policy entry wasn't |
| Every request is `UNAUTHENTICATED`, token looks fine | Frontend and backend are on **different Clerk instances**, or the token has expired (they last ~60s) |
| `UNAUTHENTICATED` from the browser, but the page itself loads | The route handler isn't attaching the header — check `frontend/src/app/api/graphql/route.ts` |
| An admin gets `FORBIDDEN` | The Clerk Dashboard session claim `{ "metadata": "{{user.public_metadata}}" }` is not configured, so no token carries a role. See `frontend/docs/auth.md` |
| A role change hasn't taken effect | Session tokens refresh roughly every 60s; signing out and in forces it |
| Apollo Sandbox returns `UNAUTHENTICATED` | Expected. See [Calling the API by hand](#calling-the-api-by-hand) |

---

## Known gaps

- **Reads are not scoped to the caller.** This is the big one. Any verified
  session can read **every** user and order — `users` and `orders` carry no
  ownership or tenant field, so there is nothing to scope by. Authentication
  does not imply isolation here, and for a portal holding several customers'
  data that distinction matters. Fixing it means a data-model change, not a
  policy change.
- **No per-user or per-IP rate limiting.** A verified session can issue
  unlimited queries.
- **No query depth or complexity limit.** `User.orders` makes a deeply nested
  query cheap to write and expensive to serve.
- **No audit log.** Nothing records who called `addUser` or `seedDatabase`.
  `context.auth.userId` is available to log, but nothing does.
- **A refused request still opens a database connection.** The guards guarantee
  no *query* runs, which is the part that matters, but `createContext` calls
  `initMongo()` for every request — it has to, because the context is built
  before Apollo knows which field is being resolved. The client is cached after
  the first connection, so the cost is near zero in practice; the consequence is
  that a Mongo outage fails an unauthenticated request with a 500 rather than a
  clean 401. Avoiding it entirely would need lazily-resolved data sources.
- **The role vocabulary is still `admin`/`user`**, which conflates "Applied
  Piper staff" with "everyone else" and has no concept of a customer-side admin.
