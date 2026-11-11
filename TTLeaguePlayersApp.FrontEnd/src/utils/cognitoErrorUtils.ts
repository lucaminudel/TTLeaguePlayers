export function getCognitoErrorRecord(error: unknown): Record<string, unknown> {
    return typeof error === 'object' && error !== null
        ? error as Record<string, unknown>
        : {};
}

export function isAuthInitFailure(error: unknown): boolean {
    const message = getCognitoErrorRecord(error).message;

    return typeof message === 'string' && message.startsWith('AuthProvider.initAuth() has failed.');
}

// amazon-cognito-identity-js builds the message from the response body, falling back to the literal
// "null" when the body has none, or to the bare HTTP status (e.g. "500") when the body is unreadable.
const isReadableMessage = (message: string): boolean => {
    const trimmed = message.trim();
    return trimmed !== '' && trimmed !== 'null' && !/^\d+$/.test(trimmed);
};

export const NO_VERIFIED_RECOVERY_CONTACT_MESSAGE = 'Cannot reset the password because there is no registered or verified email.';

export function getUserFriendlyCognitoError(error: unknown): string {
    const errorRecord = getCognitoErrorRecord(error);
    const errorType = errorRecord.__type ?? errorRecord.code ?? errorRecord.name;
    const message = typeof errorRecord.message === 'string' ? errorRecord.message : '';

    switch (errorType) {
        case 'NetworkError':
            return 'Network error. Please check your internet connection.';
        case 'InvalidPasswordException':
            return 'Password must be at least 12 characters with uppercase, lowercase, number, and symbol.';
        case 'UsernameExistsException':
            return 'An account with this email already exists. Try logging in instead.';
        case 'InvalidParameterException':
            if (message.includes('Cannot reset password for the user')) {
                return NO_VERIFIED_RECOVERY_CONTACT_MESSAGE;
            }
            if (message.includes('email')) {
                return 'Please enter a valid email address.';
            }
            return 'Invalid input. Please check your information.';
        case 'CodeMismatchException':
            return 'The verification code is incorrect. Please try again.';
        case 'ExpiredCodeException':
            return 'The verification code has expired. Please request a new one.';
        case 'TooManyRequestsException':
        case 'LimitExceededException':
            return 'Too many attempts. Please wait an hour before trying again. Additional attempts will extend the wait time.';
        default:
            return isReadableMessage(message) ? message : 'An unexpected error occurred. Please try again.';
    }
}

export function getUserFacingAuthError(error: unknown): string {
    return isAuthInitFailure(error)
        ? 'Unexpected authentication initialisation error: reload the page and try again.'
        : getUserFriendlyCognitoError(error);
}
