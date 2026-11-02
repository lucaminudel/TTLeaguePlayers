import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ApiModule = typeof import('../../../src/api/api');

let api: ApiModule;

const ok = (body = '{"value":1}', status = 200, headers?: HeadersInit) =>
    new Response(body, { status, headers });

const failed = (status: number, body = '', statusText = 'Failure', headers?: HeadersInit) =>
    new Response(body, { status, statusText, headers });

const abortError = () => Object.assign(new Error('request aborted'), { name: 'AbortError' });

async function flushRetry(delay = 0) {
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(delay);
}

describe('apiFetch', () => {
    beforeEach(async () => {
        // A fresh module is the only public way to restore its private token provider to "no provider".
        vi.resetModules();
        api = await import('../../../src/api/api');
        vi.spyOn(api.telemetry, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('sends default GET, JSON headers, and a supplied bearer token', async () => {
        const provider = vi.fn().mockResolvedValue('token');
        const fetchMock = vi.fn().mockResolvedValue(ok('{"answer":42}'));
        api.setAuthTokenProvider(provider);
        vi.stubGlobal('fetch', fetchMock);

        await expect(api.apiFetch('https://api.test', '/items')).resolves.toEqual({ answer: 42 });
        expect(fetchMock).toHaveBeenCalledWith('https://api.test/items', expect.objectContaining({
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
        }));
        expect(provider).toHaveBeenCalledOnce();
    });

    it('preserves custom request options and normalizes the telemetry method', async () => {
        const fetchMock = vi.fn().mockResolvedValue(ok());
        vi.stubGlobal('fetch', fetchMock);

        await api.apiFetch('https://api.test', '/items', {
            method: 'patch', body: '{"name":"A"}', headers: { 'X-Request-Id': 'request-1' },
        });

        expect(fetchMock).toHaveBeenCalledWith('https://api.test/items', expect.objectContaining({
            method: 'patch', body: '{"name":"A"}',
            headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'request-1' },
            signal: expect.any(AbortSignal) as unknown as AbortSignal,
        }));
        expect(api.telemetry.log).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'PATCH' }));
    });

    it('omits Authorization when the provider returns no token or no provider is registered', async () => {
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(ok()));
        vi.stubGlobal('fetch', fetchMock);
        await api.apiFetch('https://api.test', '/without-provider');
        api.setAuthTokenProvider(vi.fn().mockResolvedValue(null));
        await api.apiFetch('https://api.test', '/without-token');

        for (const [, init] of fetchMock.mock.calls) {
            expect((init as RequestInit).headers).toEqual({ 'Content-Type': 'application/json' });
        }
    });

    it('turns token-provider failures into a connection error without calling fetch', async () => {
        const providerFailure = new Error('Cognito unavailable');
        api.setAuthTokenProvider(vi.fn().mockRejectedValue(providerFailure));
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(api.apiFetch('https://api.test', '/items', {}, 100, 0)).rejects.toMatchObject({
            name: 'ApiError', message: 'Connection error', status: undefined, response: providerFailure,
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refreshes once after a 401 and retries the request when retry capacity permits', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1_000);
        const provider = vi.fn().mockResolvedValue('fresh-token');
        const fetchMock = vi.fn().mockResolvedValueOnce(failed(401)).mockResolvedValueOnce(ok('{"ok":true}'));
        api.setAuthTokenProvider(provider);
        vi.stubGlobal('fetch', fetchMock);

        await expect(api.apiFetch('https://api.test', '/secure', {}, 100, 1)).resolves.toEqual({ ok: true });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(provider).toHaveBeenCalledTimes(3);
        expect(api.telemetry.log).toHaveBeenNthCalledWith(1, {
            endpoint: '/secure', method: 'GET', status: 401, durationMs: 0,
            attempt: 0, isRetry: true, error: 'Token expired, refreshing',
        });
    });

    it('records the 401 and stops before a second fetch when maxRetries is zero', async () => {
        const provider = vi.fn().mockResolvedValue('token');
        const fetchMock = vi.fn().mockResolvedValue(failed(401));
        api.setAuthTokenProvider(provider);
        vi.stubGlobal('fetch', fetchMock);

        await expect(api.apiFetch('https://api.test', '/secure', {}, 100, 0)).rejects.toMatchObject({
            message: 'Max retries reached for /secure after 0 attempts', status: 401,
        });
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(provider).toHaveBeenCalledTimes(2);
    });

    it('returns the original 401 without refreshing when no token provider is registered', async () => {
        const fetchMock = vi.fn().mockResolvedValue(failed(401, 'unauthorized'));
        vi.stubGlobal('fetch', fetchMock);

        await expect(api.apiFetch('https://api.test', '/secure', {}, 100, 1)).rejects.toMatchObject({
            message: 'unauthorized', status: 401,
        });
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('does not refresh again when the retried request also returns 401', async () => {
        const provider = vi.fn().mockResolvedValue('token');
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(failed(401, 'unauthorized')));
        api.setAuthTokenProvider(provider);
        vi.stubGlobal('fetch', fetchMock);

        await expect(api.apiFetch('https://api.test', '/secure', {}, 100, 2)).rejects.toMatchObject({
            message: 'unauthorized', status: 401,
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(provider).toHaveBeenCalledTimes(3);
    });

    it('parses JSON, maps an empty successful body to an object, and reports malformed JSON exactly', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(ok('{"name":"Ada"}'))
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
            .mockResolvedValueOnce(ok('{bad json'));
        vi.stubGlobal('fetch', fetchMock);

        await expect(api.apiFetch('https://api.test', '/json')).resolves.toEqual({ name: 'Ada' });
        await expect(api.apiFetch('https://api.test', '/empty')).resolves.toEqual({});
        const malformed = api.apiFetch('https://api.test', '/bad');
        await expect(malformed).rejects.toMatchObject({
            name: 'ApiError', status: 200, response: '{bad json',
        });
        await expect(malformed).rejects.toThrow(/^Invalid JSON response: /);
    });

    it('preserves structured, plain, empty, and malformed HTTP error details', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(failed(422, '{"error":"Invalid player","errors":["name is required"]}'))
            .mockResolvedValueOnce(failed(400, 'Plain response'))
            .mockResolvedValueOnce(failed(500, '', 'Server Error'))
            .mockResolvedValueOnce(failed(400, '{not-json'));
        vi.stubGlobal('fetch', fetchMock);

        await expect(api.apiFetch('https://api.test', '/structured', {}, 100, 0)).rejects.toMatchObject({
            name: 'ApiError', message: 'Invalid player', status: 422,
            response: '{"error":"Invalid player","errors":["name is required"]}', errors: ['name is required'],
        });
        await expect(api.apiFetch('https://api.test', '/plain', {}, 100, 0)).rejects.toMatchObject({
            message: 'Plain response', status: 400, response: 'Plain response', errors: undefined,
        });
        await expect(api.apiFetch('https://api.test', '/empty', {}, 100, 0)).rejects.toMatchObject({
            message: 'Failed to fetch /empty: 500 Server Error', status: 500, response: '', errors: undefined,
        });
        await expect(api.apiFetch('https://api.test', '/malformed', {}, 100, 0)).rejects.toMatchObject({
            message: '{not-json', status: 400, response: '{not-json', errors: undefined,
        });
    });

    it.each([429, 502, 503, 504])('retries HTTP %i and recovers', async (status) => {
        vi.useFakeTimers();
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const fetchMock = vi.fn().mockResolvedValueOnce(failed(status)).mockResolvedValueOnce(ok('{"recovered":true}'));
        vi.stubGlobal('fetch', fetchMock);

        const request = api.apiFetch('https://api.test', '/retry', {}, 100, 1);
        await flushRetry();
        await expect(request).resolves.toEqual({ recovered: true });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not retry a non-retryable HTTP status', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1_000);
        const fetchMock = vi.fn().mockResolvedValue(failed(418, 'short and stout'));
        vi.stubGlobal('fetch', fetchMock);

        await expect(api.apiFetch('https://api.test', '/teapot', {}, 100, 3)).rejects.toMatchObject({ status: 418 });
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(api.telemetry.log).toHaveBeenCalledExactlyOnceWith({
            endpoint: '/teapot', method: 'GET', status: 418, durationMs: 0,
            attempt: 0, error: 'short and stout',
        });
    });

    it('exhausts retryable HTTP responses at the maxRetries boundary', async () => {
        // A zero Retry-After keeps this boundary test independent of fake-timer promise scheduling.
        const fetchMock = vi.fn().mockImplementation(() =>
            Promise.resolve(failed(503, 'unavailable', 'Failure', { 'Retry-After': '0' }))
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(api.apiFetch('https://api.test', '/retry', {}, 100, 2)).rejects.toMatchObject({
            message: 'unavailable', status: 503, response: 'unavailable',
        });
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it.each([
        ['numeric', { 'Retry-After': '2' }, 2_000],
        ['zero', { 'Retry-After': '0' }, 0],
        ['future date', { 'Retry-After': 'Wed, 01 Jan 2025 00:00:02 GMT' }, 2_000],
        ['past date', { 'Retry-After': 'Tue, 31 Dec 2024 23:59:58 GMT' }, 0],
        ['malformed', { 'Retry-After': 'later' }, 250],
        ['missing', undefined, 250],
    ] as const)('uses %s Retry-After handling before the retry', async (_kind, headers, delay) => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const fetchMock = vi.fn().mockResolvedValueOnce(failed(429, '', 'Too Many Requests', headers)).mockResolvedValueOnce(ok());
        vi.stubGlobal('fetch', fetchMock);

        const request = api.apiFetch('https://api.test', '/rate-limited', {}, 9_999, 1);
        await Promise.resolve();
        if (delay > 0) {
            await vi.advanceTimersByTimeAsync(delay - 1);
            expect(fetchMock).toHaveBeenCalledOnce();
            await vi.advanceTimersByTimeAsync(1);
        } else {
            await vi.advanceTimersByTimeAsync(0);
        }
        await expect(request).resolves.toEqual({ value: 1 });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('reports timeout retries with their timeout category', async () => {
        vi.useFakeTimers();
        vi.spyOn(Math, 'random').mockReturnValue(0);
        vi.spyOn(Date, 'now').mockReturnValue(1_000);
        const fetchMock = vi.fn().mockRejectedValueOnce(abortError()).mockResolvedValueOnce(ok());
        vi.stubGlobal('fetch', fetchMock);

        const request = api.apiFetch('https://api.test', '/timeout-retry', {}, 100, 1);
        await vi.advanceTimersToNextTimerAsync();
        await expect(request).resolves.toEqual({ value: 1 });
        expect(api.telemetry.log).toHaveBeenNthCalledWith(1, {
            endpoint: '/timeout-retry', method: 'GET', durationMs: 0,
            attempt: 0, isRetry: true, error: 'Timeout. Retrying in 0ms',
        });
    });

    it('uses deterministic full-jitter backoff when Retry-After is unavailable', async () => {
        vi.useFakeTimers();
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const fetchMock = vi.fn().mockResolvedValueOnce(failed(503)).mockResolvedValueOnce(ok());
        vi.stubGlobal('fetch', fetchMock);

        const request = api.apiFetch('https://api.test', '/jitter', {}, 9_999, 1);
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(249);
        expect(fetchMock).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(1);
        await expect(request).resolves.toEqual({ value: 1 });
    });

    it('doubles the jitter ceiling for the second retry', async () => {
        vi.useFakeTimers();
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const fetchMock = vi.fn().mockResolvedValueOnce(failed(503)).mockResolvedValueOnce(failed(503)).mockResolvedValueOnce(ok());
        vi.stubGlobal('fetch', fetchMock);

        const request = api.apiFetch('https://api.test', '/jitter-growth', {}, 9_999, 2);
        await vi.advanceTimersByTimeAsync(250);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(499);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1);
        await expect(request).resolves.toEqual({ value: 1 });
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it.each([
        ['numeric values with trailing text', { 'Retry-After': '2s' }, 250],
        ['numeric values with leading text', { 'Retry-After': 'x2' }, 250],
        ['multi-digit numeric values', { 'Retry-After': '20' }, 20_000],
    ] as const)('keeps the Retry-After numeric grammar strict for %s', async (_kind, headers, delay) => {
        vi.useFakeTimers();
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const fetchMock = vi.fn().mockResolvedValueOnce(failed(429, '', 'Too Many Requests', headers)).mockResolvedValueOnce(ok());
        vi.stubGlobal('fetch', fetchMock);

        const request = api.apiFetch('https://api.test', '/retry-after-grammar', {}, 9_999, 1);
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(delay - 1);
        expect(fetchMock).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(1);
        await expect(request).resolves.toEqual({ value: 1 });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('uses the GET default and an exact successful telemetry event', async () => {
        vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_015);
        const fetchMock = vi.fn().mockResolvedValue(ok('{"ok":true}'));
        vi.stubGlobal('fetch', fetchMock);

        await expect(api.apiFetch('https://api.test', '/default-method')).resolves.toEqual({ ok: true });
        expect(api.telemetry.log).toHaveBeenCalledExactlyOnceWith({
            endpoint: '/default-method', method: 'GET', status: 200, durationMs: 15, attempt: 0,
        });
    });

    it('records exact retry telemetry fields for HTTP and network retries', async () => {
        vi.useFakeTimers();
        vi.spyOn(Math, 'random').mockReturnValue(0);
        vi.spyOn(Date, 'now').mockReturnValue(1_000);
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(failed(503))
            .mockRejectedValueOnce(new TypeError('offline'))
            .mockResolvedValueOnce(ok());
        vi.stubGlobal('fetch', fetchMock);

        const request = api.apiFetch('https://api.test', '/telemetry-retry', {}, 100, 2);
        await vi.advanceTimersToNextTimerAsync();
        await vi.advanceTimersToNextTimerAsync();
        await expect(request).resolves.toEqual({ value: 1 });

        expect(api.telemetry.log).toHaveBeenNthCalledWith(1, {
            endpoint: '/telemetry-retry', method: 'GET', status: 503, durationMs: 0,
            attempt: 0, isRetry: true, error: 'Retrying in 0ms',
        });
        expect(api.telemetry.log).toHaveBeenNthCalledWith(2, {
            endpoint: '/telemetry-retry', method: 'GET', durationMs: 0,
            attempt: 1, isRetry: true, error: 'Network error. Retrying in 0ms',
        });
        expect(api.telemetry.log).toHaveBeenNthCalledWith(3, {
            endpoint: '/telemetry-retry', method: 'GET', status: 200, durationMs: 0, attempt: 2,
        });
    });

    it.each([
        ['AbortError', abortError],
        ['TypeError', () => new TypeError('network down')],
    ])('retries a %s and recovers', async (_name, makeError) => {
        vi.useFakeTimers();
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const fetchMock = vi.fn().mockRejectedValueOnce(makeError()).mockResolvedValueOnce(ok('{"ok":true}'));
        vi.stubGlobal('fetch', fetchMock);

        const request = api.apiFetch('https://api.test', '/network', {}, 100, 1);
        await flushRetry();
        await expect(request).resolves.toEqual({ ok: true });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('reports a terminal AbortError as a timeout and retains its original cause', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1_000);
        const aborted = abortError();
        const fetchMock = vi.fn().mockRejectedValue(aborted);
        vi.stubGlobal('fetch', fetchMock);

        await expect(api.apiFetch('https://api.test', '/timeout', {}, 100, 0)).rejects.toMatchObject({
            name: 'ApiError', message: 'Request timed out after 100ms', status: undefined, response: aborted,
        });
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(api.telemetry.log).toHaveBeenCalledExactlyOnceWith({
            endpoint: '/timeout', method: 'GET', durationMs: 0,
            attempt: 0, error: 'request aborted',
        });
    });

    it('exhausts retryable network failures, but converts unrelated failures without retrying', async () => {
        vi.useFakeTimers();
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const network = new TypeError('offline');
        const unrelated = new RangeError('bad range');
        const fetchMock = vi.fn().mockRejectedValueOnce(network).mockRejectedValueOnce(network).mockRejectedValueOnce(unrelated);
        vi.stubGlobal('fetch', fetchMock);

        const retrying = api.apiFetch('https://api.test', '/network', {}, 100, 1);
        const retryingRejection = expect(retrying).rejects.toMatchObject({
            message: 'Connection error', status: undefined, response: network,
        });
        await flushRetry();
        await retryingRejection;
        await expect(api.apiFetch('https://api.test', '/unrelated', {}, 100, 3)).rejects.toMatchObject({
            message: 'Connection error', status: undefined, response: unrelated,
        });
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('retains the most recent HTTP status and the final network cause across mixed failures', async () => {
        vi.useFakeTimers();
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const network = new TypeError('connection reset');
        const fetchMock = vi.fn().mockResolvedValueOnce(failed(503)).mockRejectedValueOnce(network);
        vi.stubGlobal('fetch', fetchMock);

        const request = api.apiFetch('https://api.test', '/mixed', {}, 100, 1);
        const rejection = expect(request).rejects.toMatchObject({
            message: 'Connection error', status: 503, response: network,
        });
        await flushRetry();
        await rejection;
    });

    it('clears completed attempt abort timers and keeps retry sleep separate from the next request timeout', async () => {
        vi.useFakeTimers();
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        let firstSignal: AbortSignal | null | undefined;
        const fetchMock = vi.fn()
            .mockImplementationOnce((_url: RequestInfo | URL, init?: RequestInit) => {
                firstSignal = init?.signal;
                return Promise.resolve(failed(503));
            })
            .mockResolvedValueOnce(ok());
        vi.stubGlobal('fetch', fetchMock);

        const request = api.apiFetch('https://api.test', '/timers', {}, 100, 1);
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(100);
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(firstSignal).toBeInstanceOf(AbortSignal);
        expect(firstSignal?.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(150);
        await expect(request).resolves.toEqual({ value: 1 });
        expect(vi.getTimerCount()).toBe(0);
    });

    it('clears the failed attempt abort timer before waiting to retry', async () => {
        vi.useFakeTimers();
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        let firstSignal: AbortSignal | null | undefined;
        const fetchMock = vi.fn()
            .mockImplementationOnce((_url: RequestInfo | URL, init?: RequestInit) => {
                firstSignal = init?.signal;
                return Promise.reject(new TypeError('offline'));
            })
            .mockResolvedValueOnce(ok());
        vi.stubGlobal('fetch', fetchMock);

        const request = api.apiFetch('https://api.test', '/failed-timer', {}, 100, 1);
        await vi.advanceTimersByTimeAsync(100);
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(firstSignal).toBeInstanceOf(AbortSignal);
        expect(firstSignal?.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(150);
        await expect(request).resolves.toEqual({ value: 1 });
        expect(vi.getTimerCount()).toBe(0);
    });

    it('emits structured telemetry without depending on console formatting', async () => {
        const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => { throw new Error('console must not be used'); });
        const fetchMock = vi.fn().mockResolvedValue(ok('{"ok":true}'));
        vi.stubGlobal('fetch', fetchMock);

        await expect(api.apiFetch('https://api.test', '/telemetry', { method: 'post' })).resolves.toEqual({ ok: true });
        expect(consoleLog).not.toHaveBeenCalled();
        expect(api.telemetry.log).toHaveBeenCalledWith(expect.objectContaining({
            endpoint: '/telemetry', method: 'POST', status: 200, attempt: 0, durationMs: expect.any(Number) as unknown as number,
        }));
    });
});
