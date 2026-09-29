export const AUTH_INIT_FAILED_PREFIX = 'AuthProvider.initAuth() has failed.';
export const USER_INIT_ERROR_MESSAGE = 'Unexpected authentication initialisation error: reload the page and try again.';

export function isAuthInitFailure(error: unknown): boolean {
    const message = (typeof error === 'object' && error !== null && 'message' in error)
        ? (error as { message?: unknown }).message
        : undefined;

    return typeof message === 'string' && message.startsWith(AUTH_INIT_FAILED_PREFIX);
}

const UNEXPECTED_ERROR_MESSAGE = 'An unexpected error occurred. Please try again.';

// amazon-cognito-identity-js builds the message from the response body, falling back to the literal
// "null" when the body has none, or to the bare HTTP status (e.g. "500") when the body is unreadable.
const isReadableMessage = (message: string): boolean => {
    const trimmed = message.trim();
    return trimmed !== '' && trimmed !== 'null' && !/^\d+$/.test(trimmed);
};

export function getUserFriendlyCognitoError(error: unknown): string {
    const errorRecord = error as Record<string, unknown>;
    const errorType = errorRecord.__type ?? errorRecord.code ?? errorRecord.name;
    const message = (errorRecord.message as string) || '';

    switch (errorType) {
        case 'NetworkError':
            return 'Network error. Please check your internet connection.';
        case 'InvalidPasswordException':
            return 'Password must be at least 12 characters with uppercase, lowercase, number, and symbol.';
        case 'UsernameExistsException':
            return 'An account with this email already exists. Try logging in instead.';
        case 'InvalidParameterException':
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
            return isReadableMessage(message) ? message : UNEXPECTED_ERROR_MESSAGE;
    }
}
