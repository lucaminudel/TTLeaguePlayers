import { frontendException } from '../../frontend-diagnostics/FrontendDiagnostics';
import { submitFrontendEvent } from '../../frontend-diagnostics/FrontendEventQueue';
import type { FrontendDiagnostic } from '../../../types/frontendDiagnostic';
import { PageFetcherError } from './PageFetcherError';
import { TT365ParsingError } from './TT365ParsingError';

export async function fetchAndParse<T>(
    operation: string,
    fetch: () => Promise<string>,
    parse: (body: string) => T,
    parameters: Record<string, unknown>,
): Promise<T> {
    let body: string;
    try {
        body = await fetch();
    } catch (error) {
        if (error instanceof PageFetcherError) {
            const diagnostic: FrontendDiagnostic = {
                event_category: 'FRONTEND_API_CALL_ERROR', client_api_type: 'TT365',
                operation, timestamp: error.timestamp,
                source: { Class: 'CLTTLHttpTransport', Method: 'fetchWithRetry' },
                exception: {
                    ...frontendException(error),
                    ...(error.cause === undefined ? {} : { cause: frontendException(error.cause) }),
                },
                request: { ...error.details.request, parameters }, response: error.details.response,
            };
            try { void submitFrontendEvent(diagnostic).catch(() => undefined); } catch { /* Preserve the original failure. */ }
        }
        throw error;
    }
    try {
        return parse(body);
    } catch (error) {
        const parser = operation === 'getClubTeams' ? 'CLTTLManagedClub2026PagesParser' : 'CLTTLActiveSeason2026PagesParser';
        const parsingError = new TT365ParsingError(error instanceof Error ? error.message : String(error), parser, operation, error);
        parsingError.diagnosticContext = { operation, request: { parameters }, response: { body } };
        throw parsingError;
    }
}

export function reportParsingFailure(error: unknown, { usableCache }: { usableCache: boolean }): void {
    if (!(error instanceof TT365ParsingError)) return;
    const context = error.diagnosticContext ?? {};
    const diagnostic: FrontendDiagnostic = {
        ...context,
        event_category: usableCache ? 'FRONTEND_API_CALL_IRREGULAR' : 'FRONTEND_API_CALL_ERROR',
        client_api_type: 'TT365', timestamp: error.timestamp,
        event_name: 'TT365 parsing failed', source: error.source,
        exception: {
            ...frontendException(error),
            ...(error.cause === undefined ? {} : { cause: {
                ...frontendException(error.cause),
                ...(error.cause instanceof Error && error.cause.cause !== undefined
                    ? { cause: frontendException(error.cause.cause) } : {}),
            } }),
        },
    };
    try { void submitFrontendEvent(diagnostic).catch(() => undefined); } catch { /* Preserve the original failure. */ }
}
