// Pure helpers for the `pnpm dev:token` script.
//
// Kept separate from the script itself so the selection rules and the output
// format are unit tested, rather than only exercised by running the CLI against
// a live Clerk instance.
//
// Nothing here talks to Clerk or reads the environment.

/** One account with an active session that a token could be minted from. */
export type TokenCandidate = {
  userId: string;
  sessionId: string;
  email?: string;
  role?: string;
};

export type CandidateFilter = {
  email?: string;
  role?: string;
};

export type Selection =
  | { ok: true; candidate: TokenCandidate; alternatives: number }
  | { ok: false; reason: string };

function describe(c: TokenCandidate): string {
  return `${c.email ?? c.userId} (${c.role ?? 'no role'})`;
}

/**
 * Deterministic so the script is predictable and testable: admins first, then
 * by email, then by user id. When several accounts match, the first is used and
 * the caller is told how many it chose among — friendlier than refusing, and
 * honest about having picked.
 */
export function selectCandidate(
  candidates: TokenCandidate[],
  filter: CandidateFilter = {},
): Selection {
  if (candidates.length === 0) {
    return {
      ok: false,
      reason:
        'No account has an active Clerk session, so there is no token to mint. ' +
        'Sign in at http://localhost:3000 first, then re-run.',
    };
  }

  let matching = candidates;

  if (filter.email) {
    const wanted = filter.email.toLowerCase();
    matching = matching.filter((c) => c.email?.toLowerCase() === wanted);
    if (matching.length === 0) {
      return {
        ok: false,
        reason:
          `No active session for email "${filter.email}". ` +
          `Accounts with a session: ${candidates.map(describe).join(', ')}.`,
      };
    }
  }

  if (filter.role) {
    const wanted = filter.role.toLowerCase();
    matching = matching.filter((c) => (c.role ?? '').toLowerCase() === wanted);
    if (matching.length === 0) {
      return {
        ok: false,
        reason:
          `No active session for an account with role "${filter.role}". ` +
          `Accounts with a session: ${candidates.map(describe).join(', ')}.`,
      };
    }
  }

  const sorted = [...matching].sort((a, b) => {
    const aAdmin = a.role === 'admin' ? 0 : 1;
    const bAdmin = b.role === 'admin' ? 0 : 1;
    if (aAdmin !== bAdmin) return aAdmin - bAdmin;
    const byEmail = (a.email ?? '').localeCompare(b.email ?? '');
    if (byEmail !== 0) return byEmail;
    return a.userId.localeCompare(b.userId);
  });

  return { ok: true, candidate: sorted[0], alternatives: sorted.length - 1 };
}

export type Args = {
  email?: string;
  role?: string;
  raw: boolean;
  help: boolean;
};

/** Supports `--email a@b.c`, `--role admin`, `--raw`, `--help`, and `--k=v`. */
export function parseArgs(argv: string[]): Args {
  const args: Args = { raw: false, help: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--raw') {
      args.raw = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg.startsWith('--email=')) {
      args.email = arg.slice('--email='.length);
    } else if (arg.startsWith('--role=')) {
      args.role = arg.slice('--role='.length);
    } else if (arg === '--email') {
      args.email = argv[++i];
    } else if (arg === '--role') {
      args.role = argv[++i];
    }
  }

  return args;
}

/**
 * Seconds of life left in a JWT, from its `exp` claim. Returns undefined if the
 * token cannot be decoded — this is a convenience readout, never a check: the
 * server verifies the signature and expiry itself.
 *
 * `now` is a parameter so this is testable without faking the clock.
 */
export function secondsUntilExpiry(jwt: string, now: number): number | undefined {
  const parts = jwt.split('.');
  if (parts.length !== 3) return undefined;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (typeof payload.exp !== 'number') return undefined;
    return payload.exp - Math.floor(now / 1000);
  } catch {
    return undefined;
  }
}

export function formatOutput(options: {
  token: string;
  candidate: TokenCandidate;
  alternatives: number;
  expiresInSeconds?: number;
  graphqlUrl: string;
}): string {
  const { token, candidate, alternatives, expiresInSeconds, graphqlUrl } = options;

  const lines = [
    `account:  ${candidate.email ?? candidate.userId}`,
    `role:     ${candidate.role ?? 'no role — admin-only fields will return FORBIDDEN'}`,
    `user id:  ${candidate.userId}`,
  ];

  if (alternatives > 0) {
    lines.push(
      `note:     ${alternatives} other account(s) also have a session; ` +
        `pass --email or --role to pick a different one`,
    );
  }

  if (expiresInSeconds !== undefined) {
    lines.push(
      expiresInSeconds > 0
        ? `expires:  in ~${expiresInSeconds}s — re-run this when you get UNAUTHENTICATED`
        : `expires:  ALREADY EXPIRED (${expiresInSeconds}s) — re-run this`,
    );
  }

  // The header VALUE is given on its own line, ready to paste. Spelled out
  // because the one thing that actually went wrong in practice was a stray
  // colon turning the whole value into an unparseable scheme.
  lines.push(
    '',
    'In Apollo Sandbox, add a header with:',
    '  name:   Authorization',
    '  value:  (the line below — one space after Bearer, NO colon)',
    '',
    `Bearer ${token}`,
    '',
    'curl:',
    `  curl -s ${graphqlUrl} \\`,
    `    -H 'Content-Type: application/json' \\`,
    `    -H 'Authorization: Bearer ${token}' \\`,
    `    -d '{"query":"{ users { _id firstName } }"}'`,
  );

  return lines.join('\n');
}
