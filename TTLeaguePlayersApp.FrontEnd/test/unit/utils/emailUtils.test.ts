import { describe, it, expect } from 'vitest';
import { isValidEmail } from '../../../src/utils/emailUtils';

describe('emailUtils.isValidEmail', () => {
    it('accepts an ordinary address', () => {
        expect(isValidEmail('kevin@user.test')).toBe(true);
    });

    it('accepts a subdomain and a plus tag', () => {
        expect(isValidEmail('kevin+captain@mail.user.test')).toBe(true);
    });

    it('rejects an address with no @', () => {
        expect(isValidEmail('kevin.user.test')).toBe(false);
    });

    it('rejects a domain with no dot', () => {
        expect(isValidEmail('kevin@localhost')).toBe(false);
    });

    it('rejects an empty string', () => {
        expect(isValidEmail('')).toBe(false);
    });

    it('rejects whitespace anywhere, including around the address', () => {
        expect(isValidEmail(' kevin@user.test')).toBe(false);
        expect(isValidEmail('kevin@user.test ')).toBe(false);
        expect(isValidEmail('kevin smith@user.test')).toBe(false);
    });

    it('rejects a second @', () => {
        expect(isValidEmail('kevin@user@test.com')).toBe(false);
    });
});
