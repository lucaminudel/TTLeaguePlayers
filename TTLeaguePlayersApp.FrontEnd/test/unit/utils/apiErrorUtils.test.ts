import { describe, expect, it } from 'vitest';
import { toUserFriendlyApiError } from '../../../src/utils/apiErrorUtils';

describe('toUserFriendlyApiError', () => {
    const fallback = 'Could not complete the request.';

    it('uses the fallback for non-Error values', () => {
        expect(toUserFriendlyApiError({ message: 'failed to fetch' }, fallback)).toBe(fallback);
        expect(toUserFriendlyApiError(null, fallback)).toBe(fallback);
    });

    it.each([
        ['Connection error while requesting clubs', 'Network error. Please check your internet connection.'],
        ['The request timed out', 'The request took too long. Please check your connection and try again.'],
        ['HTTP 500 response', 'The server is having trouble right now. Please try again in a few minutes.'],
        ['Internal Server Error', 'The server is having trouble right now. Please try again in a few minutes.'],
        ['Failed to fetch', 'The server is having trouble right now. Please try again in a few minutes.'],
        ['Invalid request body', 'The server is having trouble right now. Please try again in a few minutes.'],
        ['Invalid JSON response', 'The server is having trouble right now. Please try again in a few minutes.'],
        ['Response deserialization failed', 'The server is having trouble right now. Please try again in a few minutes.'],
    ])('maps "%s" to its user message', (message, expected) => {
        expect(toUserFriendlyApiError(new Error(message), fallback)).toBe(expected);
    });

    it('preserves an unclassified Error message', () => {
        expect(toUserFriendlyApiError(new Error('Validation rejected'), fallback)).toBe('Validation rejected');
    });
});
