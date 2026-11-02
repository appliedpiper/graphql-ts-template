import {
  formatOutput,
  parseArgs,
  secondsUntilExpiry,
  selectCandidate,
  type TokenCandidate,
} from '@/lib/devToken';

const admin: TokenCandidate = {
  userId: 'user_admin',
  sessionId: 'sess_a',
  email: 'admin@example.com',
  role: 'admin',
};
const plain: TokenCandidate = {
  userId: 'user_plain',
  sessionId: 'sess_b',
  email: 'plain@example.com',
  role: 'user',
};
const roleless: TokenCandidate = {
  userId: 'user_none',
  sessionId: 'sess_c',
  email: 'none@example.com',
};

describe('selectCandidate — nothing to pick', () => {
  it('explains that nobody is signed in, and what to do', () => {
    const result = selectCandidate([]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/no account has an active clerk session/i);
      expect(result.reason).toMatch(/localhost:3000/);
    }
  });
});

describe('selectCandidate — deterministic default', () => {
  it('prefers an admin, so the default token can reach admin-only fields', () => {
    const result = selectCandidate([plain, admin, roleless]);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.candidate).toEqual(admin);
  });

  it('reports how many others it chose among, rather than picking silently', () => {
    const result = selectCandidate([plain, admin, roleless]);

    if (result.ok) expect(result.alternatives).toBe(2);
  });

  it('reports no alternatives when only one account has a session', () => {
    const result = selectCandidate([plain]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.candidate).toEqual(plain);
      expect(result.alternatives).toBe(0);
    }
  });

  it('is stable for equal roles, ordering by email then user id', () => {
    const b = { ...plain, email: 'b@example.com', userId: 'user_b' };
    const a = { ...plain, email: 'a@example.com', userId: 'user_a' };

    const one = selectCandidate([b, a]);
    const two = selectCandidate([a, b]);

    // Same input set in either order must yield the same choice, or the script
    // would hand back a different account run to run.
    expect(one.ok && one.candidate.userId).toBe('user_a');
    expect(two.ok && two.candidate.userId).toBe('user_a');
  });

  it('does not mutate the array it was given', () => {
    const input = [plain, admin];
    selectCandidate(input);

    expect(input).toEqual([plain, admin]);
  });
});

describe('selectCandidate — filtering', () => {
  it('selects by role', () => {
    const result = selectCandidate([admin, plain], { role: 'user' });

    expect(result.ok && result.candidate).toEqual(plain);
  });

  it('selects by email, case-insensitively', () => {
    const result = selectCandidate([admin, plain], { email: 'PLAIN@EXAMPLE.COM' });

    expect(result.ok && result.candidate).toEqual(plain);
  });

  it('applies email and role together', () => {
    const result = selectCandidate([admin, plain], {
      email: 'admin@example.com',
      role: 'admin',
    });

    expect(result.ok && result.candidate).toEqual(admin);
  });

  it('fails when the email has no session, listing who does', () => {
    const result = selectCandidate([admin, plain], { email: 'nobody@example.com' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/nobody@example\.com/);
      // The point of the message is telling you what you *could* have asked for.
      expect(result.reason).toMatch(/admin@example\.com/);
      expect(result.reason).toMatch(/plain@example\.com/);
    }
  });

  it('fails when no session has the requested role', () => {
    const result = selectCandidate([plain], { role: 'admin' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/role "admin"/);
  });

  it('describes a role-less account as "no role" rather than undefined', () => {
    const result = selectCandidate([roleless], { role: 'admin' });

    if (!result.ok) expect(result.reason).toMatch(/\(no role\)/);
  });

  it('matches a role-less account only when no role filter is given', () => {
    expect(selectCandidate([roleless]).ok).toBe(true);
    expect(selectCandidate([roleless], { role: 'user' }).ok).toBe(false);
  });
});

describe('parseArgs', () => {
  it('defaults to no filters and full output', () => {
    expect(parseArgs([])).toEqual({ raw: false, help: false });
  });

  it('reads space-separated flags', () => {
    expect(parseArgs(['--email', 'a@b.c', '--role', 'admin'])).toEqual({
      email: 'a@b.c',
      role: 'admin',
      raw: false,
      help: false,
    });
  });

  it('reads equals-separated flags', () => {
    expect(parseArgs(['--email=a@b.c', '--role=user'])).toEqual({
      email: 'a@b.c',
      role: 'user',
      raw: false,
      help: false,
    });
  });

  it('reads --raw and --help', () => {
    expect(parseArgs(['--raw']).raw).toBe(true);
    expect(parseArgs(['--help']).help).toBe(true);
    expect(parseArgs(['-h']).help).toBe(true);
  });

  it('ignores unknown flags rather than throwing', () => {
    expect(parseArgs(['--nope', '--raw']).raw).toBe(true);
  });
});

describe('secondsUntilExpiry', () => {
  function jwtWithExp(exp: unknown): string {
    const payload = Buffer.from(JSON.stringify({ exp }), 'utf8').toString('base64url');
    return `header.${payload}.signature`;
  }

  it('computes the remaining lifetime from the exp claim', () => {
    // exp is in seconds, now is in milliseconds.
    expect(secondsUntilExpiry(jwtWithExp(1_000_060), 1_000_000_000)).toBe(60);
  });

  it('goes negative for an already-expired token', () => {
    expect(secondsUntilExpiry(jwtWithExp(999_990), 1_000_000_000)).toBe(-10);
  });

  it('returns undefined for a token that is not three parts', () => {
    expect(secondsUntilExpiry('not-a-jwt', 0)).toBeUndefined();
    expect(secondsUntilExpiry('two.parts', 0)).toBeUndefined();
  });

  it('returns undefined when the payload is not decodable or has no exp', () => {
    expect(secondsUntilExpiry('a.!!!not-base64!!!.c', 0)).toBeUndefined();
    expect(secondsUntilExpiry(jwtWithExp('soon'), 0)).toBeUndefined();
    expect(secondsUntilExpiry(jwtWithExp(undefined), 0)).toBeUndefined();
  });
});

describe('formatOutput', () => {
  const base = {
    token: 'eyJhbGciOiJSUzI1NiJ9.payload.sig',
    candidate: admin,
    alternatives: 0,
    graphqlUrl: 'http://localhost:4000/graphql',
  };

  it('puts the header value on its own line with a single space and no colon', () => {
    // The whole reason this script exists: a pasted `Bearer: <token>` is
    // unparseable, so the output has to be copyable verbatim.
    const out = formatOutput(base);

    expect(out).toContain(`\nBearer ${base.token}\n`);
    expect(out).not.toContain(`Bearer: ${base.token}`);
  });

  it('spells out that there is no colon', () => {
    expect(formatOutput(base)).toMatch(/NO colon/);
  });

  it('names the account and role', () => {
    const out = formatOutput(base);

    expect(out).toContain('admin@example.com');
    expect(out).toContain('admin');
    expect(out).toContain('user_admin');
  });

  it('warns when the account has no role, since admin fields will be refused', () => {
    const out = formatOutput({ ...base, candidate: roleless });

    expect(out).toMatch(/no role/);
    expect(out).toMatch(/FORBIDDEN/);
  });

  it('mentions other sessions only when there are some', () => {
    expect(formatOutput({ ...base, alternatives: 2 })).toMatch(/2 other account/);
    expect(formatOutput(base)).not.toMatch(/other account/);
  });

  it('reports the remaining lifetime, and flags an expired token', () => {
    expect(formatOutput({ ...base, expiresInSeconds: 47 })).toMatch(/in ~47s/);
    expect(formatOutput({ ...base, expiresInSeconds: -3 })).toMatch(/ALREADY EXPIRED/);
  });

  it('omits the expiry line entirely when it could not be determined', () => {
    expect(formatOutput(base)).not.toMatch(/expires:/);
  });

  it('includes a runnable curl against the configured URL', () => {
    const out = formatOutput(base);

    expect(out).toContain('http://localhost:4000/graphql');
    expect(out).toContain(`-H 'Authorization: Bearer ${base.token}'`);
  });
});
