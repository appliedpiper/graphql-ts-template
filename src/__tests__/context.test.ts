import type { KeyValueCache } from '@apollo/utils.keyvaluecache';

import { createContext, type RequestLike } from '@/context/context';
import type { SessionIdentity, SessionVerifier } from '@/lib/auth/verifySession';

// The context opens a Mongo connection, which is irrelevant to what is under
// test here and would need a real database. Mocked so these tests stay pure —
// see the arm64 mongodb-memory-server note in PROGRESS.md for why that matters.
const order: string[] = [];

jest.mock('@/datasources/mongo', () => ({
  initMongo: jest.fn().mockImplementation(async () => {
    order.push('initMongo');
    return { users: {}, orders: {} };
  }),
}));

// The context warns (server-side only) when a header is present but unusable.
// Silenced here so the suite output stays readable; asserted explicitly in the
// "diagnostics" block at the bottom.
let warn: jest.SpyInstance;

beforeEach(() => {
  order.length = 0;
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

const cache = {
  get: async () => undefined,
  set: async () => {},
  delete: async () => {},
} as KeyValueCache<string>;

const ADMIN: SessionIdentity = { userId: 'user_admin', role: 'admin' };

// Records what it was handed so the tests can assert the context verified the
// token it actually received, not some other string.
function fakeVerifier(result: SessionIdentity | null) {
  const calls: string[] = [];
  const verify: SessionVerifier = async (token) => {
    calls.push(token);
    order.push('verifySession');
    return result;
  };
  return { verify, calls };
}

function request(headers: RequestLike['headers'] = {}): RequestLike {
  return { headers };
}

describe('createContext — extracts and verifies the caller', () => {
  it('verifies the bearer token and exposes the resulting identity', async () => {
    const { verify, calls } = fakeVerifier(ADMIN);

    const ctx = await createContext({
      cache,
      req: request({ authorization: 'Bearer the-token' }),
      verifySession: verify,
    });

    expect(calls).toEqual(['the-token']);
    expect(ctx.auth).toEqual(ADMIN);
  });

  it('still builds the data sources and cache alongside the identity', async () => {
    const { verify } = fakeVerifier(ADMIN);

    const ctx = await createContext({
      cache,
      req: request({ authorization: 'Bearer t' }),
      verifySession: verify,
    });

    expect(ctx.dataSources.businessAPI).toBeDefined();
    expect(ctx.cache).toBe(cache);
  });

  it('resolves the identity before opening the data sources', async () => {
    // So the auth decision never depends on database state. Note this does not
    // make a refused request skip the connection — the context is built before
    // Apollo knows the field, so initMongo still runs. See the comment in
    // context.ts and the gap noted in docs/auth.md.
    const { verify } = fakeVerifier(ADMIN);

    await createContext({
      cache,
      req: request({ authorization: 'Bearer t' }),
      verifySession: verify,
    });

    expect(order).toEqual(['verifySession', 'initMongo']);
  });

  it('carries an undefined role through rather than defaulting it', async () => {
    const { verify } = fakeVerifier({ userId: 'user_1', role: undefined });

    const ctx = await createContext({
      cache,
      req: request({ authorization: 'Bearer t' }),
      verifySession: verify,
    });

    expect(ctx.auth).toEqual({ userId: 'user_1', role: undefined });
  });
});

describe('createContext — unauthenticated requests', () => {
  it('sets auth to null when there is no Authorization header', async () => {
    const { verify, calls } = fakeVerifier(ADMIN);

    const ctx = await createContext({
      cache,
      req: request(),
      verifySession: verify,
    });

    expect(ctx.auth).toBeNull();
    // Nothing to verify, so Clerk is never called — no wasted round trip and no
    // chance of a verifier treating an empty string as valid.
    expect(calls).toEqual([]);
  });

  it.each([
    ['a different scheme', 'Basic dXNlcjpwYXNz'],
    ['the scheme with no token', 'Bearer'],
    ['a bare token with no scheme', 'eyJhbGciOiJSUzI1NiJ9.x.y'],
    ['an empty header', ''],
  ])('sets auth to null for %s, without calling the verifier', async (_label, header) => {
    const { verify, calls } = fakeVerifier(ADMIN);

    const ctx = await createContext({
      cache,
      req: request({ authorization: header }),
      verifySession: verify,
    });

    expect(ctx.auth).toBeNull();
    expect(calls).toEqual([]);
  });

  it('sets auth to null when the verifier rejects the token', async () => {
    // A well-formed header whose token does not verify. The distinction between
    // this and a missing header must not reach the resolvers.
    const { verify, calls } = fakeVerifier(null);

    const ctx = await createContext({
      cache,
      req: request({ authorization: 'Bearer forged' }),
      verifySession: verify,
    });

    expect(calls).toEqual(['forged']);
    expect(ctx.auth).toBeNull();
  });

  it('sets auth to null for a repeated Authorization header', async () => {
    const { verify, calls } = fakeVerifier(ADMIN);

    const ctx = await createContext({
      cache,
      req: request({ authorization: ['Bearer one', 'Bearer two'] }),
      verifySession: verify,
    });

    expect(ctx.auth).toBeNull();
    expect(calls).toEqual([]);
  });
});

// ////////////////////////////////////////////
//   Server-side diagnostics
// ////////////////////////////////////////////
// These warnings go to the server log only. The client still learns nothing
// beyond UNAUTHENTICATED (see guards.ts), but a developer gets the reason —
// which is what was missing when a stray colon in `Bearer: <token>` presented
// as an indefinite UNAUTHENTICATED.
describe('createContext — explains auth failures in the server log', () => {
  it('warns that an unparseable Authorization header was ignored', async () => {
    const { verify } = fakeVerifier(ADMIN);

    await createContext({
      cache,
      req: request({ authorization: 'Bearer: some.jwt.value' }),
      verifySession: verify,
    });

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toMatch(/Authorization header/i);
    expect(message).toMatch(/stray colon/i);
  });

  it('names the exact required format in that warning', async () => {
    const { verify } = fakeVerifier(ADMIN);

    await createContext({
      cache,
      req: request({ authorization: 'Bearer: x' }),
      verifySession: verify,
    });

    expect(String(warn.mock.calls[0][0])).toContain('Bearer <token>');
  });

  it('warns that a well-formed token failed verification, naming the likely causes', async () => {
    const { verify } = fakeVerifier(null);

    await createContext({
      cache,
      req: request({ authorization: 'Bearer expired.or.forged' }),
      verifySession: verify,
    });

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toMatch(/failed verification/i);
    expect(message).toMatch(/expired/i);
    expect(message).toMatch(/different Clerk instance/i);
  });

  it('never logs the token itself', async () => {
    // The warning is a diagnostic, not a credential dump — a server log is not
    // a safe place for a usable bearer token.
    const secretish = 'eyJhbGciOiJSUzI1NiJ9.SENSITIVE-PAYLOAD.sig';
    const { verify } = fakeVerifier(null);

    await createContext({
      cache,
      req: request({ authorization: `Bearer ${secretish}` }),
      verifySession: verify,
    });

    const logged = warn.mock.calls.flat().map(String).join(' ');
    expect(logged).not.toContain(secretish);
    expect(logged).not.toContain('SENSITIVE-PAYLOAD');
  });

  it('stays silent when no Authorization header is sent at all', async () => {
    // A plain anonymous request is normal traffic, not a misconfiguration, so
    // it must not produce log noise on every hit.
    const { verify } = fakeVerifier(ADMIN);

    await createContext({ cache, req: request(), verifySession: verify });

    expect(warn).not.toHaveBeenCalled();
  });

  it('stays silent on a successful verification', async () => {
    const { verify } = fakeVerifier(ADMIN);

    await createContext({
      cache,
      req: request({ authorization: 'Bearer good.token' }),
      verifySession: verify,
    });

    expect(warn).not.toHaveBeenCalled();
  });
});
