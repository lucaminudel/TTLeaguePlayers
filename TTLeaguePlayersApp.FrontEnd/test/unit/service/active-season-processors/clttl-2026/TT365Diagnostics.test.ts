import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAndParse, reportParsingFailure } from '../../../../../src/service/league-season-processors/clttl-2026/TT365Diagnostics';
import { PageFetcherError } from '../../../../../src/service/league-season-processors/clttl-2026/PageFetcherError';
import { TT365ParsingError } from '../../../../../src/service/league-season-processors/clttl-2026/TT365ParsingError';
import { sendFrontendEvent } from '../../../../../src/api/frontendEventsApi';

vi.mock('../../../../../src/api/frontendEventsApi', () => ({
    sendFrontendEvent: vi.fn().mockResolvedValue({ success: true }),
}));

describe('TT365 diagnostics', () => {
    beforeEach(() => vi.clearAllMocks());

    it('reports the final request error and its HTTP details once', async () => {
        const original = new Error('HTTP error');
        const error = new PageFetcherError('failed', { request: { url: 'https://tt365.test' }, response: { status: 503, body: 'down' } }, original);
        const promise = fetchAndParse('getTeamFixtures', () => {
            return Promise.reject(error);
        }, value => value, { division: 'A' });
        await expect(promise).rejects.toBe(error);
        expect(sendFrontendEvent).toHaveBeenCalledOnce();
        expect(sendFrontendEvent).toHaveBeenCalledWith(expect.objectContaining({
            event_category: 'FRONTEND_API_CALL_ERROR',
            request: { url: 'https://tt365.test', parameters: { division: 'A' } }, response: { status: 503, body: 'down' },
            exception: { name: error.name, message: error.message, stackTrace: error.stack,
                cause: { name: original.name, message: original.message, stackTrace: original.stack } },
        }));
        expect(vi.mocked(sendFrontendEvent).mock.calls[0][0]).not.toHaveProperty('user_claims');
        reportParsingFailure(error, { usableCache: true });
        expect(sendFrontendEvent).toHaveBeenCalledOnce();
    });

    it.each([[true, 'FRONTEND_API_CALL_IRREGULAR'], [false, 'FRONTEND_API_CALL_ERROR']] as const)(
        'reports a parsing failure with usable cache %s as %s', async (usableCache, category) => {
            const cause = new Error('bad page');
            const error = await fetchAndParse('getTeamPlayers', () => Promise.resolve('bad'),
                () => { throw cause; }, { division: 'A', teamId: 10 }).catch((failure: unknown) => failure);
            expect(error).toBeInstanceOf(TT365ParsingError);
            if (!(error instanceof TT365ParsingError)) throw new Error('Expected a parsing error');
            expect(error.cause).toBe(cause);
            expect(sendFrontendEvent).not.toHaveBeenCalled();
            reportParsingFailure(error, { usableCache });
            expect(sendFrontendEvent).toHaveBeenCalledWith(expect.objectContaining({
                event_category: category, response: { body: 'bad' },
                request: { parameters: { division: 'A', teamId: 10 } },
                source: { Class: 'CLTTLActiveSeason2026PagesParser', Method: 'getTeamPlayers' }, timestamp: error.timestamp,
            }));
            expect(vi.mocked(sendFrontendEvent).mock.calls[0][0]).not.toHaveProperty('user_claims');
        },
    );

    it('includes the original parsing error and its cause alongside the wrapper exception', () => {
        const cause = new SyntaxError('Unexpected token at position 2');
        const parserError = new Error('Invalid player response JSON', { cause });
        const error = new TT365ParsingError(parserError.message, 'Parser', 'getTeamPlayers', parserError);

        reportParsingFailure(error, { usableCache: false });

        expect(sendFrontendEvent).toHaveBeenCalledWith(expect.objectContaining({
            exception: {
                name: error.name, message: error.message, stackTrace: error.stack,
                cause: { name: parserError.name, message: parserError.message, stackTrace: parserError.stack,
                    cause: { name: cause.name, message: cause.message, stackTrace: cause.stack } },
            },
        }));
    });
});
