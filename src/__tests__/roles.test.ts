import { ROLES, isRole, getRole, satisfiesRole, type Role } from '@/lib/auth/roles';

describe('ROLES', () => {
  it('is exactly admin and user', () => {
    // Pinned because the frontend keeps its own copy of this list (see the
    // duplication note in roles.ts). If this assertion is updated, the
    // frontend's src/lib/auth/roles.ts has to change in the same breath or the
    // API and the UI will disagree about who is an admin.
    expect([...ROLES]).toEqual(['admin', 'user']);
  });
});

describe('isRole', () => {
  it('accepts the known roles', () => {
    expect(isRole('admin')).toBe(true);
    expect(isRole('user')).toBe(true);
  });

  it('rejects wrong casing', () => {
    expect(isRole('Admin')).toBe(false);
    expect(isRole('ADMIN')).toBe(false);
    expect(isRole('User')).toBe(false);
  });

  it('rejects unknown role names', () => {
    expect(isRole('superadmin')).toBe(false);
    expect(isRole('owner')).toBe(false);
    expect(isRole('')).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isRole(undefined)).toBe(false);
    expect(isRole(null)).toBe(false);
    expect(isRole(0)).toBe(false);
    expect(isRole(true)).toBe(false);
    expect(isRole(['admin'])).toBe(false);
    expect(isRole({ role: 'admin' })).toBe(false);
  });
});

describe('getRole — fails closed on anything unrecognised', () => {
  it('reads a valid role out of the metadata claim', () => {
    expect(getRole({ metadata: { role: 'admin' } })).toBe('admin');
    expect(getRole({ metadata: { role: 'user' } })).toBe('user');
  });

  it('returns undefined when the claims themselves are absent', () => {
    expect(getRole(undefined)).toBeUndefined();
    expect(getRole(null)).toBeUndefined();
  });

  it('returns undefined when the metadata claim is missing or null', () => {
    // This is the real-world case when the Clerk Dashboard session claim
    // `{ "metadata": "{{user.public_metadata}}" }` has not been configured:
    // the token verifies fine but carries no metadata at all.
    expect(getRole({})).toBeUndefined();
    expect(getRole({ metadata: null })).toBeUndefined();
  });

  it('returns undefined when the role is missing from the metadata', () => {
    expect(getRole({ metadata: {} })).toBeUndefined();
    expect(getRole({ metadata: { role: undefined } })).toBeUndefined();
  });

  it('returns undefined for an unrecognised role rather than passing it through', () => {
    expect(getRole({ metadata: { role: 'superadmin' } })).toBeUndefined();
    expect(getRole({ metadata: { role: 'Admin' } })).toBeUndefined();
    expect(getRole({ metadata: { role: '' } })).toBeUndefined();
  });

  it('returns undefined for a non-string role', () => {
    expect(getRole({ metadata: { role: 1 } })).toBeUndefined();
    expect(getRole({ metadata: { role: true } })).toBeUndefined();
    expect(getRole({ metadata: { role: ['admin'] } })).toBeUndefined();
  });
});

describe('satisfiesRole', () => {
  it('treats user as "any verified session", including one with no role claim', () => {
    // Deliberate: a verified token with no usable role is still a signed-in
    // account, and the role is only decisive for admin. Mirrors the frontend.
    expect(satisfiesRole(undefined, 'user')).toBe(true);
    expect(satisfiesRole('user', 'user')).toBe(true);
    expect(satisfiesRole('admin', 'user')).toBe(true);
  });

  it('requires the admin role for admin', () => {
    expect(satisfiesRole('admin', 'admin')).toBe(true);
    expect(satisfiesRole('user', 'admin')).toBe(false);
    expect(satisfiesRole(undefined, 'admin')).toBe(false);
  });

  it('does not grant admin to an unrecognised role smuggled past the types', () => {
    expect(satisfiesRole('superadmin' as unknown as Role, 'admin')).toBe(false);
  });
});
