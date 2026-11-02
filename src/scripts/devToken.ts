// `pnpm dev:token` — prints a real Clerk session token for pasting into Apollo
// Sandbox or curl.
//
// This is a DEVELOPMENT CONVENIENCE, not an auth bypass. It mints a token for an
// account that is already signed in, using the same Clerk Backend API call the
// app itself would; the server still verifies the signature and still applies
// the full per-field policy. There is no way to use this to skip a guard.
//
// It refuses to run with NODE_ENV=production, because printing a usable bearer
// token to a terminal is a development-only thing to want.
//
// Usage:
//   pnpm dev:token                      # admin account first, if one is signed in
//   pnpm dev:token --role user          # a specific role
//   pnpm dev:token --email a@b.c        # a specific account
//   pnpm dev:token --raw                # just the token, for  TOKEN=$(pnpm -s dev:token --raw)

import { createClerkClient } from '@clerk/backend';

import env from '@/lib/env';
import {
  formatOutput,
  parseArgs,
  secondsUntilExpiry,
  selectCandidate,
  type TokenCandidate,
} from '@/lib/devToken';

const USAGE = `
pnpm dev:token — print a Clerk session token for manual GraphQL queries

  pnpm dev:token                  pick an account with an active session (admin first)
  pnpm dev:token --role user      only an account with this role
  pnpm dev:token --email a@b.c    only this account
  pnpm dev:token --raw            print only the token (no surrounding text)
  pnpm dev:token --help           this message

The account must already be signed in at http://localhost:3000 — this mints a
token for an existing session, it does not create one. Tokens last ~60 seconds.
`.trim();

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  if (process.env.NODE_ENV === 'production') {
    console.error(
      'dev:token is disabled when NODE_ENV=production — it prints a usable bearer token.',
    );
    return 1;
  }

  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });

  // Fail with a clear message rather than a stack trace if the key is wrong —
  // otherwise this looks identical to "no sessions".
  let users;
  try {
    const list = await clerk.users.getUserList({ limit: 100 });
    users = list.data;
  } catch (error) {
    console.error(
      'Clerk rejected CLERK_SECRET_KEY. Check backend/.env.local — it must be ' +
        'the same Clerk instance as the frontend.\n  ' +
        (error instanceof Error ? error.message : String(error)),
    );
    return 1;
  }

  const candidates: TokenCandidate[] = [];
  for (const user of users) {
    const { data: sessions } = await clerk.sessions.getSessionList({
      userId: user.id,
      status: 'active',
    });
    if (sessions.length === 0) continue;

    const role = user.publicMetadata?.role;
    candidates.push({
      userId: user.id,
      sessionId: sessions[0].id,
      email: user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress,
      role: typeof role === 'string' ? role : undefined,
    });
  }

  const selection = selectCandidate(candidates, { email: args.email, role: args.role });

  if (!selection.ok) {
    console.error(selection.reason);
    return 1;
  }

  const { candidate, alternatives } = selection;

  let token: string;
  try {
    token = (await clerk.sessions.getToken(candidate.sessionId)).jwt;
  } catch (error) {
    console.error(
      `Could not mint a token for session ${candidate.sessionId}: ` +
        (error instanceof Error ? error.message : String(error)),
    );
    return 1;
  }

  if (args.raw) {
    // Only the token, so this composes: TOKEN=$(pnpm -s dev:token --raw)
    console.log(token);
    return 0;
  }

  const port = env.GQL_PORT ? parseInt(env.GQL_PORT, 10) : 4000;
  const graphqlUrl = `${env.PUBLIC_URL || 'http://localhost'}:${port}/graphql`;

  console.log(
    formatOutput({
      token,
      candidate,
      alternatives,
      expiresInSeconds: secondsUntilExpiry(token, Date.now()),
      graphqlUrl,
    }),
  );

  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('dev:token failed:', error);
    process.exit(1);
  });
