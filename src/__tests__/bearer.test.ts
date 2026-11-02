import { bearerToken } from '@/lib/auth/bearer';

// Every case that must yield "no token". A malformed Authorization header is
// deliberately indistinguishable from an absent one, so a caller can never
// end up trying to verify a fragment of a header.
describe('bearerToken — rejects anything not a well-formed Bearer header', () => {
  it('returns undefined when the header is absent', () => {
    expect(bearerToken(undefined)).toBeUndefined();
  });

  it('returns undefined for an empty or whitespace-only header', () => {
    expect(bearerToken('')).toBeUndefined();
    expect(bearerToken('   ')).toBeUndefined();
  });

  it('returns undefined for a different auth scheme', () => {
    expect(bearerToken('Basic dXNlcjpwYXNz')).toBeUndefined();
    expect(bearerToken('Digest abc123')).toBeUndefined();
  });

  it('returns undefined for the scheme with no token', () => {
    expect(bearerToken('Bearer')).toBeUndefined();
    expect(bearerToken('Bearer ')).toBeUndefined();
  });

  it('returns undefined for a bare token with no scheme', () => {
    expect(bearerToken('eyJhbGciOiJSUzI1NiJ9.payload.sig')).toBeUndefined();
  });

  it('returns undefined for "Bearer:" with a stray colon after the scheme', () => {
    // A real mistake, made when pasting into Apollo Sandbox's Headers pane:
    // the name goes in one field and the value in another, so typing
    // `Bearer: <token>` as the value leaves a colon that belongs to neither.
    // It produced an UNAUTHENTICATED that looked like a token problem.
    // Rejecting it is correct — `Bearer:` is not the Bearer scheme — but the
    // context now logs the reason server-side so it is diagnosable.
    expect(bearerToken('Bearer: eyJhbGciOiJSUzI1NiJ9.payload.sig')).toBeUndefined();
    expect(bearerToken('bearer: abc123')).toBeUndefined();
  });

  it('returns undefined when there are more than two parts', () => {
    // Two tokens, or a token containing a space, is not a request to guess at.
    expect(bearerToken('Bearer token extra')).toBeUndefined();
  });

  it('returns undefined for repeated headers, which Node surfaces as an array', () => {
    expect(bearerToken(['Bearer one', 'Bearer two'])).toBeUndefined();
    // Even a single-element array — one well-formed value does not make the
    // duplicated header safe to interpret.
    expect(bearerToken(['Bearer one'])).toBeUndefined();
  });
});

describe('bearerToken — extracts the token', () => {
  it('returns the token for a well-formed header', () => {
    expect(bearerToken('Bearer abc123')).toBe('abc123');
  });

  it('matches the scheme case-insensitively, per RFC 6750', () => {
    // Some clients and proxies normalise the scheme's casing.
    expect(bearerToken('bearer abc123')).toBe('abc123');
    expect(bearerToken('BEARER abc123')).toBe('abc123');
    expect(bearerToken('BeArEr abc123')).toBe('abc123');
  });

  it('leaves the token itself case-sensitive and otherwise untouched', () => {
    const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyX0FiQ2QifQ.SiGnAtUrE-_x';
    expect(bearerToken(`Bearer ${jwt}`)).toBe(jwt);
  });

  it('tolerates surrounding whitespace and repeated inner spaces', () => {
    expect(bearerToken('  Bearer abc123  ')).toBe('abc123');
    expect(bearerToken('Bearer    abc123')).toBe('abc123');
    expect(bearerToken('Bearer\tabc123')).toBe('abc123');
  });
});
