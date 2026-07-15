export function toUserFriendlyApiError(err: unknown, fallback: string): string {
    if (!(err instanceof Error)) {
        return fallback;
    }

    const msg = err.message.toLowerCase();

    if (msg.includes('connection error')) {
        return 'Network error. Please check your internet connection.';
    }

    if (msg.includes('timed out')) {
        return 'The request took too long. Please check your connection and try again.';
    }

    if (
        msg.includes('500') ||
        msg.includes('internal server error') ||
        msg.includes('failed to fetch') ||
        msg.includes('invalid request body') ||
        msg.includes('json') ||
        msg.includes('deserialization')
    ) {
        return 'The server is having trouble right now. Please try again in a few minutes.';
    }

    return err.message;
}
