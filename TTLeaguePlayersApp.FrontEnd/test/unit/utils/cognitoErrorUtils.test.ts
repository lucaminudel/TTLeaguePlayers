import { describe, it, expect } from 'vitest';
import {
    AUTH_INIT_FAILED_PREFIX,
    USER_INIT_ERROR_MESSAGE,
    isAuthInitFailure,
    getUserFriendlyCognitoError
} from '../../../src/utils/cognitoErrorUtils';

describe('cognitoErrorUtils.getUserFriendlyCognitoError', () => {
    const friendlyMessageByCognitoErrorType: [string, string][] = [
        ['InvalidPasswordException', 'Password must be at least 12 characters with uppercase, lowercase, number, and symbol.'],
        ['UsernameExistsException', 'An account with this email already exists. Try logging in instead.'],
        ['CodeMismatchException', 'The verification code is incorrect. Please try again.'],
        ['ExpiredCodeException', 'The verification code has expired. Please request a new one.'],
        ['TooManyRequestsException', 'Too many attempts. Please wait an hour before trying again. Additional attempts will extend the wait time.'],
        ['LimitExceededException', 'Too many attempts. Please wait an hour before trying again. Additional attempts will extend the wait time.'],
    ];

    describe.each(friendlyMessageByCognitoErrorType)('%s', (errorType, friendlyMessage) => {
        it('is recognised from __type (Cognito HTTP body)', () => {
            expect(getUserFriendlyCognitoError({ __type: errorType, message: 'raw' })).toBe(friendlyMessage);
        });

        it('is recognised from code (amazon-cognito-identity-js error)', () => {
            expect(getUserFriendlyCognitoError({ code: errorType, message: 'raw' })).toBe(friendlyMessage);
        });

        it('is recognised from name', () => {
            expect(getUserFriendlyCognitoError({ name: errorType, message: 'raw' })).toBe(friendlyMessage);
        });
    });

    describe('InvalidParameterException', () => {
        it('about the email asks for a valid email address', () => {
            expect(getUserFriendlyCognitoError({ code: 'InvalidParameterException', message: 'Invalid email address format.' }))
                .toBe('Please enter a valid email address.');
        });

        it('about anything else asks to check the input', () => {
            expect(getUserFriendlyCognitoError({ code: 'InvalidParameterException', message: 'Invalid code provided.' }))
                .toBe('Invalid input. Please check your information.');
        });
    });

    describe('an unmapped error', () => {
        it('shows its raw message', () => {
            expect(getUserFriendlyCognitoError({ code: 'NotAuthorizedException', message: 'Incorrect username or password.' }))
                .toBe('Incorrect username or password.');
        });

        it('without a message shows a generic text', () => {
            expect(getUserFriendlyCognitoError({ code: 'NotAuthorizedException' }))
                .toBe('An unexpected error occurred. Please try again.');
        });

        it('whose message is only the HTTP status shows a generic text', () => {
            expect(getUserFriendlyCognitoError({ code: 'InternalErrorException', message: '500' }))
                .toBe('An unexpected error occurred. Please try again.');
        });

        it('whose message is the literal "null" shows a generic text', () => {
            expect(getUserFriendlyCognitoError({ code: 'InternalErrorException', message: 'null' }))
                .toBe('An unexpected error occurred. Please try again.');
        });
    });

    it('a request that never reached Cognito asks to check the internet connection', () => {
        const sdkNetworkError = Object.assign(new Error('Network error'), { code: 'NetworkError' });

        expect(getUserFriendlyCognitoError(sdkNetworkError)).toBe('Network error. Please check your internet connection.');
    });
});

describe('cognitoErrorUtils.isAuthInitFailure', () => {
    it('recognises the AuthProvider init-failure error', () => {
        expect(isAuthInitFailure(new Error(`${AUTH_INIT_FAILED_PREFIX} authInitialisationError: boom`))).toBe(true);
    });

    it('rejects any other error', () => {
        expect(isAuthInitFailure(new Error('Incorrect username or password.'))).toBe(false);
    });

    it('rejects values without a string message', () => {
        expect(isAuthInitFailure(null)).toBe(false);
        expect(isAuthInitFailure('AuthProvider.initAuth() has failed.')).toBe(false);
        expect(isAuthInitFailure({ message: 42 })).toBe(false);
    });

    it('has a user message that tells the user to reload', () => {
        expect(USER_INIT_ERROR_MESSAGE).toBe('Unexpected authentication initialisation error: reload the page and try again.');
    });
});
