import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { gzipSync } from 'node:zlib';
import { PageFetcherError } from '../../../../../src/service/league-season-processors/clttl-2026/PageFetcherError';
import { CLTTLHttpTransport } from '../../../../../src/service/league-season-processors/clttl-2026/CLTTLHttpTransport';

describe('CLTTLHttpTransport', () => {
    let transport: CLTTLHttpTransport;

    beforeEach(() => {
        vi.useFakeTimers();
        transport = new CLTTLHttpTransport();
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('uses direct HTTP by default and accepts successful statuses other than 200', async () => {
        vi.mocked(fetch).mockResolvedValue(new Response('created', { status: 201 }));

        await expect(transport.fetchText('http://fixtures/div1')).resolves.toBe('created');
        expect(fetch).toHaveBeenCalledExactlyOnceWith('http://fixtures/div1');
    });

    it('rejects readable HTTP error bodies with the original status, URL and error identity', async () => {
        vi.mocked(fetch).mockImplementation(() => Promise.resolve(new Response('error page', { status: 503 })));

        const fetchPromise = transport.fetchText('http://fixtures/div1');
        const assertionPromise = expect(fetchPromise).rejects.toMatchObject({
            name: 'PageFetcherError',
            message: 'The page or website is not available after 3 attempts: http://fixtures/div1. Details: HTTP error! status: 503'
        });

        await vi.advanceTimersByTimeAsync(1999);
        expect(fetch).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(fetch).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1999);
        expect(fetch).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1);
        await assertionPromise;
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('reports service-unavailable bodies case-insensitively after exhausting retries', async () => {
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            text: () => Promise.resolve('<html>SERVICE UNAVAILABLE</html>')
        } as Response);

        const assertionPromise = expect(transport.fetchText('http://fixtures/div1')).rejects.toThrow(
            'The page or website is not available after 3 attempts: http://fixtures/div1. Details: Service unavailable'
        );

        await vi.runAllTimersAsync();
        await assertionPromise;
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('should retry twice and succeed on the third try', async () => {
        const failResponse = { ok: false, status: 500 };
        const successResponse = { ok: true, text: () => Promise.resolve('BEGIN:VCALENDAR\nEND:VCALENDAR') };

        vi.mocked(fetch)
            .mockResolvedValueOnce(failResponse as Response)
            .mockResolvedValueOnce(failResponse as Response)
            .mockResolvedValueOnce(successResponse as Response);

        const fetchPromise = transport.fetchText('http://fixtures/div1');

        await vi.advanceTimersByTimeAsync(2000);
        await vi.advanceTimersByTimeAsync(2000);

        const result = await fetchPromise;

        expect(result).toBe('BEGIN:VCALENDAR\nEND:VCALENDAR');
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('should retry if content contains "Service unavailable"', async () => {
        const unavailableResponse = { ok: true, text: () => Promise.resolve('Service unavailable') };
        const successResponse = { ok: true, text: () => Promise.resolve('BEGIN:VCALENDAR\nEND:VCALENDAR') };

        vi.mocked(fetch)
            .mockResolvedValueOnce(unavailableResponse as Response)
            .mockResolvedValueOnce(successResponse as Response);

        const fetchPromise = transport.fetchText('http://fixtures/div1');

        await vi.advanceTimersByTimeAsync(2000);

        const result = await fetchPromise;
        expect(result).toBe('BEGIN:VCALENDAR\nEND:VCALENDAR');
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw PageFetcherError after 3 failed attempts', async () => {
        const failResponse = { ok: false, status: 500 };
        vi.mocked(fetch).mockResolvedValue(failResponse as Response);

        const fetchPromise = transport.fetchText('http://fixtures/div1');

        const assertionPromise = expect(fetchPromise).rejects.toThrow(PageFetcherError);

        await vi.runAllTimersAsync();

        await assertionPromise;

        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('should URL-encode the target page when going through the CORS proxy', async () => {
        // The proxy reads its own query string, so an unencoded "&" in the target URL would end the
        // url= parameter early and silently drop every parameter after it (divisionName, t, vm).
        const mockResponse = { ok: true, text: () => Promise.resolve('success') };
        vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

        const proxiedTransport = new CLTTLHttpTransport(true);

        await proxiedTransport.fetchText('http://fixtures/div1?leagueName=Winter%202025-26&divisionName=Division%20One&vm=2');

        expect(fetch).toHaveBeenCalledWith(
            'https://go.x2u.in/proxy?email=contact_us@ttleagueplayers.uk&apiKey=307a1c8f&url='
            + encodeURIComponent('http://fixtures/div1?leagueName=Winter%202025-26&divisionName=Division%20One&vm=2')
        );
    });

    it('should not encode the target page when fetching directly', async () => {
        const mockResponse = { ok: true, text: () => Promise.resolve('success') };
        vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

        const directTransport = new CLTTLHttpTransport(false);

        await directTransport.fetchText('http://fixtures/div1?leagueName=Winter%202025-26&divisionName=Division%20One&vm=2');

        expect(fetch).toHaveBeenCalledWith('http://fixtures/div1?leagueName=Winter%202025-26&divisionName=Division%20One&vm=2');
    });

    describe('External contracts unit testing', () => {
        describe('go.x2u.in proxy', () => {
            it('should preserve a plain response', async () => {
                const response = new Response('BEGIN:VCALENDAR\nEND:VCALENDAR');
                vi.mocked(fetch).mockResolvedValue(response);

                await expect(transport.fetchText('http://fixtures/div1')).resolves.toBe('BEGIN:VCALENDAR\nEND:VCALENDAR');
            });

            it.each([
                ['an incomplete Zstandard signature', Uint8Array.from([0x28, 0xb5, 0x2f, 0x00, 0x41])],
                ['an incomplete gzip signature', Uint8Array.from([0x1f, 0x00, 0x41])],
                ['a mismatched first Zstandard byte', Uint8Array.from([0x00, 0xb5, 0x2f, 0xfd])],
                ['a mismatched second Zstandard byte', Uint8Array.from([0x28, 0x00, 0x2f, 0xfd])],
                ['a mismatched third Zstandard byte', Uint8Array.from([0x28, 0xb5, 0x00, 0xfd])],
                ['a mismatched first gzip byte', Uint8Array.from([0x00, 0x8b])],
                ['no bytes', new Uint8Array()],
                ['one gzip prefix byte', Uint8Array.from([0x1f])],
                ['three Zstandard prefix bytes', Uint8Array.from([0x28, 0xb5, 0x2f])],
            ])('preserves plain bytes with %s', async (_description, bytes) => {
                vi.mocked(fetch).mockResolvedValue(new Response(bytes));

                await expect(transport.fetchText('http://fixtures/div1')).resolves.toBe(new TextDecoder().decode(bytes));
            });

            it('should decompress a gzip response', async () => {
                vi.useRealTimers();
                const expected = 'BEGIN:VCALENDAR\nEND:VCALENDAR';
                vi.mocked(fetch).mockImplementation(() => Promise.resolve(new Response(gzipSync(expected))));

                await expect(transport.fetchText('http://fixtures/div1')).resolves.toBe(expected);
            });

            it('retries gzip data when the runtime cannot decompress it', async () => {
                vi.stubGlobal('DecompressionStream', undefined);
                vi.mocked(fetch).mockImplementation(() => Promise.resolve(new Response(gzipSync('calendar'))));

                const fetchPromise = transport.fetchText('http://fixtures/div1');
                const assertionPromise = expect(fetchPromise).rejects.toThrow('runtime cannot decompress gzip');

                await vi.runAllTimersAsync();
                await assertionPromise;

                expect(fetch).toHaveBeenCalledTimes(3);
            });

            it('recognizes the exact two-byte gzip prefix as compressed rather than plain text', async () => {
                vi.stubGlobal('DecompressionStream', undefined);
                vi.mocked(fetch).mockImplementation(() => Promise.resolve(new Response(Uint8Array.from([0x1f, 0x8b]))));

                const assertionPromise = expect(transport.fetchText('http://fixtures/div1')).rejects.toThrow('runtime cannot decompress gzip');

                await vi.runAllTimersAsync();
                await assertionPromise;
                expect(fetch).toHaveBeenCalledTimes(3);
            });

            it('should decompress a Zstandard response even when the proxy labels it as gzip', async () => {
                const expected = 'Zstandard response';
                const zstdRawFrame = Uint8Array.from([
                    0x28, 0xb5, 0x2f, 0xfd,
                    0x20, expected.length,
                    (expected.length << 3) | 1, 0x00, 0x00,
                    ...new TextEncoder().encode(expected),
                ]);
                vi.mocked(fetch).mockImplementation(() => Promise.resolve(new Response(zstdRawFrame, { headers: { 'Content-Encoding': 'gzip' } })));

                await expect(transport.fetchText('http://fixtures/div1')).resolves.toBe(expected);
            });

            it('should retry and report an invalid compressed response', async () => {
                vi.mocked(fetch).mockImplementation(() => Promise.resolve(new Response(Uint8Array.from([0x28, 0xb5, 0x2f, 0xfd]))));

                const fetchPromise = transport.fetchText('http://fixtures/div1');
                const assertionPromise = expect(fetchPromise).rejects.toThrow(PageFetcherError);

                await vi.runAllTimersAsync();
                await assertionPromise;

                expect(fetch).toHaveBeenCalledTimes(3);
            });
        });
    });
});
