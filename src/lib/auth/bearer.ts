// Pulls the session token out of an Authorization header.
//
// Kept free of Express and Clerk imports so the parsing rules are unit tested
// directly rather than through a mocked request. Returns undefined for anything
// it does not fully recognise — a malformed header is treated as no token at
// all, never as a token to try verifying.

const BEARER = 'bearer';

/**
 * Accepts the header value, not the request, so the caller decides where it
 * came from. `Bearer` is matched case-insensitively per RFC 6750 §2.1, but the
 * token itself is returned verbatim — it is case-sensitive.
 *
 * Node lowercases incoming header names and may join repeated headers into an
 * array; an array is rejected rather than picking one, since two Authorization
 * headers is not a request we should be guessing about.
 */
export function bearerToken(header: string | string[] | undefined): string | undefined {
  if (typeof header !== 'string') return undefined;

  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2) return undefined;

  const [scheme, token] = parts;
  if (scheme.toLowerCase() !== BEARER) return undefined;

  return token.length > 0 ? token : undefined;
}
