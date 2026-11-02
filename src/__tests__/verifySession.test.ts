import { createSessionVerifier } from '@/lib/auth/verifySession';

// The real verifier is the only module that talks to Clerk, so Clerk is mocked
// here and nowhere else. What is under test is the reduction of Clerk's claims
// to a SessionIdentity, and — more importantly — that a throw becomes `null`
// rather than escaping into the context.
jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn(),
}));

import { verifyToken } from '@clerk/backend';

const mockVerifyToken = verifyToken as jest.MockedFunction<typeof verifyToken>;

const SECRET = 'sk_test_not_a_real_key';

beforeEach(() => {
  mockVerifyToken.mockReset();
});

describe('createSessionVerifier — passes the token to Clerk correctly', () => {
  it('calls verifyToken with the token and the secret key it was built with', async () => {
    mockVerifyToken.mockResolvedValue({ sub: 'user_123' } as never);

    const verify = createSessionVerifier(SECRET);
    await verify('the-token');

    expect(mockVerifyToken).toHaveBeenCalledWith('the-token', { secretKey: SECRET });
  });
});

describe('createSessionVerifier — a valid token', () => {
  it('returns the Clerk user id and the parsed role', async () => {
    mockVerifyToken.mockResolvedValue({
      sub: 'user_123',
      metadata: { role: 'admin' },
    } as never);

    await expect(createSessionVerifier(SECRET)('t')).resolves.toEqual({
      userId: 'user_123',
      role: 'admin',
    });
  });

  it('returns an undefined role when the metadata claim is absent', async () => {
    // The real-world case when the Clerk Dashboard session claim is not
    // configured: the token verifies, but carries no role. Still a valid
    // identity — just not an admin.
    mockVerifyToken.mockResolvedValue({ sub: 'user_123' } as never);

    await expect(createSessionVerifier(SECRET)('t')).resolves.toEqual({
      userId: 'user_123',
      role: undefined,
    });
  });

  it('returns an undefined role for an unrecognised role rather than passing it through', async () => {
    mockVerifyToken.mockResolvedValue({
      sub: 'user_123',
      metadata: { role: 'superadmin' },
    } as never);

    await expect(createSessionVerifier(SECRET)('t')).resolves.toEqual({
      userId: 'user_123',
      role: undefined,
    });
  });
});

describe('createSessionVerifier — fails closed', () => {
  it('returns null when verifyToken throws', async () => {
    // Expired, malformed, wrong signature, wrong Clerk instance — the SDK
    // throws for all of them and they must all look identical to the caller.
    mockVerifyToken.mockRejectedValue(new Error('token expired'));

    await expect(createSessionVerifier(SECRET)('t')).resolves.toBeNull();
  });

  it('does not let a verification error escape to the caller', async () => {
    // This is the load-bearing property: if this rejected, the error would
    // surface from createContext and Apollo would answer with a 500 instead of
    // treating the request as unauthenticated.
    mockVerifyToken.mockRejectedValue(new Error('boom'));

    const settled = await Promise.allSettled([createSessionVerifier(SECRET)('t')]);

    expect(settled[0].status).toBe('fulfilled');
  });

  it('swallows a non-Error throw as well', async () => {
    // A bare `catch` with no binding is what makes this work; a
    // `catch (e) { if (e instanceof Error) ... }` refactor would regress it.
    mockVerifyToken.mockImplementation(() => {
      throw 'a string, not an Error';
    });

    await expect(createSessionVerifier(SECRET)('t')).resolves.toBeNull();
  });

  it('returns null when the subject claim is missing or empty', async () => {
    // Should not happen on a real session token, but an identity with no user
    // id would be worse than no identity at all.
    mockVerifyToken.mockResolvedValue({ metadata: { role: 'admin' } } as never);
    await expect(createSessionVerifier(SECRET)('t')).resolves.toBeNull();

    mockVerifyToken.mockResolvedValue({ sub: '' } as never);
    await expect(createSessionVerifier(SECRET)('t')).resolves.toBeNull();

    mockVerifyToken.mockResolvedValue({ sub: 12345 } as never);
    await expect(createSessionVerifier(SECRET)('t')).resolves.toBeNull();
  });

  it('does not grant a role to an identity it rejected', async () => {
    // Guards against a refactor that returns a partial identity on failure.
    mockVerifyToken.mockResolvedValue({ sub: '', metadata: { role: 'admin' } } as never);

    expect(await createSessionVerifier(SECRET)('t')).toBeNull();
  });
});
