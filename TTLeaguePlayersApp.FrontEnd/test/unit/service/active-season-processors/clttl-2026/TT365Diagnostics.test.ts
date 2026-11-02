import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAndParse, reportParsingFailure } from '../../../../../src/service/league-season-processors/clttl-2026/TT365Diagnostics';
import { PageFetcherError } from '../../../../../src/service/league-season-processors/clttl-2026/PageFetcherError';
import { TT365ParsingError } from '../../../../../src/service/league-season-processors/clttl-2026/TT365ParsingError';
import { submitFrontendEvent } from '../../../../../src/service/frontend-diagnostics/FrontendEventQueue';

vi.mock('../../../../../src/service/frontend-diagnostics/FrontendEventQueue', () => ({
    submitFrontendEvent: vi.fn().mockResolvedValue(undefined),
}));

const exception = (error: Error) => ({ name: error.name, message: error.message, stackTrace: error.stack });

describe('TT365 diagnostics', () => {
    beforeEach(() => vi.clearAllMocks());

    it('reports the exact transport event and rethrows the original request failure', async () => {
        const original = new Error('HTTP error');
        const error = new PageFetcherError('failed', { request: { url: 'https://tt365.test', method: 'GET' }, response: { status: 503, body: 'down' } }, original);
        await expect(fetchAndParse('getTeamFixtures', () => Promise.reject(error), value => value, { division: 'A' })).rejects.toBe(error);
        expect(submitFrontendEvent).toHaveBeenCalledOnce();
        expect(vi.mocked(submitFrontendEvent).mock.calls[0][0]).toStrictEqual({
            event_category: 'FRONTEND_API_CALL_ERROR', client_api_type: 'TT365', operation: 'getTeamFixtures', timestamp: error.timestamp,
            source: { Class: 'CLTTLHttpTransport', Method: 'fetchWithRetry' },
            exception: { ...exception(error), cause: exception(original) },
            request: { url: 'https://tt365.test', method: 'GET', parameters: { division: 'A' } }, response: { status: 503, body: 'down' },
        });
        reportParsingFailure(error, { usableCache: true });
        expect(submitFrontendEvent).toHaveBeenCalledOnce();
    });

    it.each([['absent', undefined], ['non-Error', 'offline']] as const)(
        'reports a transport failure with an %s cause', async (_label, cause) => {
            const error = new PageFetcherError('failed', {}, cause);
            await expect(fetchAndParse('getClubTeams', () => Promise.reject(error), value => value, {})).rejects.toBe(error);
            expect(vi.mocked(submitFrontendEvent).mock.calls[0][0]).toStrictEqual({
                event_category: 'FRONTEND_API_CALL_ERROR', client_api_type: 'TT365', operation: 'getClubTeams', timestamp: error.timestamp,
                source: { Class: 'CLTTLHttpTransport', Method: 'fetchWithRetry' },
                exception: { ...exception(error), ...(cause === undefined ? {} : { cause: { message: cause } }) },
                request: { parameters: {} }, response: undefined,
            });
        },
    );

    it.each([
        [true, 'FRONTEND_API_CALL_IRREGULAR', 'getClubTeams', 'CLTTLManagedClub2026PagesParser'],
        [false, 'FRONTEND_API_CALL_ERROR', 'getTeamPlayers', 'CLTTLActiveSeason2026PagesParser'],
    ] as const)('reports the exact parsing event with usable cache %s', async (usableCache, category, operation, parser) => {
        const cause = new Error('bad page');
        const error = await fetchAndParse(operation, () => Promise.resolve('bad'), () => { throw cause; },
            { division: 'A', teamId: 10 }).catch((failure: unknown) => failure);
        expect(error).toBeInstanceOf(TT365ParsingError);
        if (!(error instanceof TT365ParsingError)) throw new Error('Expected a parsing error');
        expect(error.name).toBe('TT365ParsingError');
        expect(error.message).toBe('bad page');
        expect(error.cause).toBe(cause);
        expect(submitFrontendEvent).not.toHaveBeenCalled();
        reportParsingFailure(error, { usableCache });
        expect(submitFrontendEvent).toHaveBeenCalledOnce();
        expect(vi.mocked(submitFrontendEvent).mock.calls[0][0]).toStrictEqual({
            operation, request: { parameters: { division: 'A', teamId: 10 } }, response: { body: 'bad' },
            event_category: category, client_api_type: 'TT365', timestamp: error.timestamp, event_name: 'TT365 parsing failed',
            source: { Class: parser, Method: operation }, exception: { ...exception(error), cause: exception(cause) },
        });
    });

    it('reports nested parsing causes with their exact shape', () => {
        const cause = new SyntaxError('Unexpected token');
        const parserError = new Error('Invalid player response JSON', { cause });
        const error = new TT365ParsingError(parserError.message, 'Parser', 'getTeamPlayers', parserError);
        reportParsingFailure(error, { usableCache: false });
        expect(vi.mocked(submitFrontendEvent).mock.calls[0][0]).toStrictEqual({
            event_category: 'FRONTEND_API_CALL_ERROR', client_api_type: 'TT365', timestamp: error.timestamp,
            event_name: 'TT365 parsing failed', source: { Class: 'Parser', Method: 'getTeamPlayers' },
            exception: { ...exception(error), cause: { ...exception(parserError), cause: exception(cause) } },
        });
    });

    it.each([['absent', undefined], ['non-Error', 'invalid']] as const)(
        'reports a parsing failure with an %s cause', (_label, cause) => {
            const error = new TT365ParsingError('bad', 'Parser', 'method', cause);
            reportParsingFailure(error, { usableCache: true });
            expect(vi.mocked(submitFrontendEvent).mock.calls[0][0]).toStrictEqual({
                event_category: 'FRONTEND_API_CALL_IRREGULAR', client_api_type: 'TT365', timestamp: error.timestamp,
                event_name: 'TT365 parsing failed', source: { Class: 'Parser', Method: 'method' },
                exception: { ...exception(error), ...(cause === undefined ? {} : { cause: { message: cause } }) },
            });
        },
    );

    it('wraps a non-Error parser failure and preserves it as the cause', async () => {
        const failure = await fetchAndParse('getClubTeams', () => Promise.resolve('body'), () => (function* () { yield undefined; })().throw(42), {})
            .catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(TT365ParsingError);
        if (!(failure instanceof TT365ParsingError)) throw new Error('Expected a parsing error');
        expect(failure.message).toBe('42');
        expect(failure.cause).toBe(42);
        expect(failure.diagnosticContext).toStrictEqual({ operation: 'getClubTeams', request: { parameters: {} }, response: { body: 'body' } });
    });

    it('returns the parser result on success without reporting', async () => {
        const parse = vi.fn((body: string) => ({ body }));
        await expect(fetchAndParse('getTeamPlayers', () => Promise.resolve('page'), parse, {})).resolves.toStrictEqual({ body: 'page' });
        expect(parse).toHaveBeenCalledExactlyOnceWith('page');
        expect(submitFrontendEvent).not.toHaveBeenCalled();
    });

    it('rethrows non-PageFetcher failures without parsing or reporting', async () => {
        const error = new Error('network failure');
        const parse = vi.fn();
        await expect(fetchAndParse('getTeamPlayers', () => Promise.reject(error), parse, {})).rejects.toBe(error);
        expect(parse).not.toHaveBeenCalled();
        expect(submitFrontendEvent).not.toHaveBeenCalled();
    });

    it.each(['throw', 'reject'] as const)('preserves the request failure if reporting does %s', async mode => {
        const error = new PageFetcherError('failed');
        if (mode === 'throw') vi.mocked(submitFrontendEvent).mockImplementationOnce(() => { throw new Error('storage unavailable'); });
        else vi.mocked(submitFrontendEvent).mockRejectedValueOnce(new Error('storage unavailable'));
        await expect(fetchAndParse('getTeamFixtures', () => Promise.reject(error), value => value, {})).rejects.toBe(error);
    });

    it.each(['throw', 'reject'] as const)('isolates a parsing report that does %s', async mode => {
        if (mode === 'throw') vi.mocked(submitFrontendEvent).mockImplementationOnce(() => { throw new Error('storage unavailable'); });
        else vi.mocked(submitFrontendEvent).mockRejectedValueOnce(new Error('storage unavailable'));
        const error = new TT365ParsingError('bad page', 'Parser', 'getClubTeams', new Error('bad page'));
        expect(() => { reportParsingFailure(error, { usableCache: true }); }).not.toThrow();
        await Promise.resolve();
    });
});
