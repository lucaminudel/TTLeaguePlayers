export function frontendException(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
        return { name: error.name, message: error.message, stackTrace: error.stack };
    }
    return { message: String(error) };
}
