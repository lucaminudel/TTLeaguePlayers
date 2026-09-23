/**
 * Whether an address is worth sending to: something, an `@`, something, a dot, something, and no
 * whitespace anywhere.
 * Deliberately looser than RFC 5322 and deliberately STRICTER than the browser's own type="email"` check
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
    return EMAIL_PATTERN.test(email);
}
