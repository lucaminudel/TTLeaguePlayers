import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { withSWR, invalidateCache, invalidateCacheByPrefix, type CacheEntry } from '../../../src/utils/CacheUtils';
import { setUnitFixedClockTime } from '../TestClockUtils';
import { CLTTLManagedClub2026PagesParser } from '../../../src/service/league-season-processors/clttl-2026/CLTTLManagedClub2026PagesParser';

function stubLocalStorage(overrides: Partial<Pick<Storage, 'key' | 'removeItem' | 'setItem'>> = {}): void {
    const storage = localStorage;
    const replacement: Storage = {
        get length() { return storage.length; },
        clear: storage.clear.bind(storage),
        getItem: storage.getItem.bind(storage),
        key: overrides.key ?? storage.key.bind(storage),
        removeItem: overrides.removeItem ?? storage.removeItem.bind(storage),
        setItem: overrides.setItem ?? storage.setItem.bind(storage)
    };
    vi.stubGlobal('localStorage', replacement);
}

describe('CacheUtils', () => {
    const CACHE_KEY = 'test_cache_key';
    const OPTIONS = {
        freshDurationMs: 1000,
        staleDurationMs: 5000,
    };

    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        setUnitFixedClockTime(undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('Cold start: fetches and caches data', async () => {
        const storage = localStorage;
        const removeItem = vi.fn<Storage['removeItem']>((key) => { storage.removeItem(key); });
        stubLocalStorage({ removeItem });
        const fetcher = vi.fn().mockResolvedValue({ foo: 'bar' });

        const result = await withSWR(CACHE_KEY, fetcher, OPTIONS);

        expect(result).toEqual({ foo: 'bar' });
        expect(fetcher).toHaveBeenCalledTimes(1);

        const cachedRaw = localStorage.getItem(CACHE_KEY);
        if (!cachedRaw) throw new Error('Cache missing');
        const cached = JSON.parse(cachedRaw) as CacheEntry<{ foo: string }>;
        expect(cached.data).toEqual({ foo: 'bar' });
        expect(cached.timestamp).toBeDefined();
        expect(removeItem).not.toHaveBeenCalled();
    });

    it('evicts unparseable JSON from cache, logs a warning, and fetches fresh data', async () => {
        localStorage.setItem(CACHE_KEY, '{not json');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const fetcher = vi.fn().mockImplementation(() => {
            expect(localStorage.getItem(CACHE_KEY)).toBeNull();
            return Promise.resolve({ version: 'fresh' });
        });

        await expect(withSWR(CACHE_KEY, fetcher, OPTIONS)).resolves.toEqual({ version: 'fresh' });

        expect(warn).toHaveBeenCalledWith(
            `Error parsing cached data for ${CACHE_KEY}:`,
            expect.any(SyntaxError)
        );
        expect(fetcher).toHaveBeenCalledOnce();
        warn.mockRestore();
    });

    it.each([
        ['missing timestamp', JSON.stringify({ data: 'abc' })],
        ['non-numeric timestamp', JSON.stringify({ timestamp: 'invalid', data: 'abc' })],
        ['missing data', JSON.stringify({ timestamp: 12345 })],
        ['number', JSON.stringify(42)],
        ['string', JSON.stringify('string')],
        ['null', JSON.stringify(null)]
    ])('evicts an invalid %s cache entry and fetches fresh data', async (_description, serializedEntry) => {
        localStorage.setItem(CACHE_KEY, serializedEntry);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const fetcher = vi.fn().mockImplementation(() => {
            expect(localStorage.getItem(CACHE_KEY)).toBeNull();
            return Promise.resolve({ version: 'fresh' });
        });

        await expect(withSWR(CACHE_KEY, fetcher, OPTIONS)).resolves.toEqual({ version: 'fresh' });

        expect(fetcher).toHaveBeenCalledOnce();
        expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')).toMatchObject({
            data: { version: 'fresh' }
        });
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('Fresh cache: returns data without fetching', async () => {
        setUnitFixedClockTime('2025-01-01T10:00:00Z');
        const fetcher1 = vi.fn().mockResolvedValue({ version: 1 });
        await withSWR(CACHE_KEY, fetcher1, OPTIONS);

        // Advance time by 500ms (still fresh)
        setUnitFixedClockTime('2025-01-01T10:00:00.500Z');
        const fetcher2 = vi.fn().mockResolvedValue({ version: 2 });

        const result = await withSWR(CACHE_KEY, fetcher2, OPTIONS);

        expect(result).toEqual({ version: 1 });
        expect(fetcher2).not.toHaveBeenCalled();
    });

    it('revalidates a cache entry at the fresh-duration boundary', async () => {
        setUnitFixedClockTime('2025-01-01T10:00:00Z');
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            timestamp: Date.parse('2025-01-01T10:00:00Z'),
            data: { version: 1 }
        }));
        setUnitFixedClockTime('2025-01-01T10:00:01Z');
        const fetcher = vi.fn().mockResolvedValue({ version: 2 });
        const onBackgroundUpdate = vi.fn();

        await expect(withSWR(CACHE_KEY, fetcher, OPTIONS, undefined, onBackgroundUpdate))
            .resolves.toEqual({ version: 1 });
        await vi.waitFor(() => {
            expect(onBackgroundUpdate).toHaveBeenCalledWith({ version: 2 });
        });
        expect(fetcher).toHaveBeenCalledOnce();
    });

    it('fetches synchronously at the stale-duration expiry boundary', async () => {
        setUnitFixedClockTime('2025-01-01T10:00:00Z');
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            timestamp: Date.parse('2025-01-01T10:00:00Z'),
            data: { version: 1 }
        }));
        setUnitFixedClockTime('2025-01-01T10:00:05Z');
        const fetcher = vi.fn().mockResolvedValue({ version: 2 });

        await expect(withSWR(CACHE_KEY, fetcher, OPTIONS)).resolves.toEqual({ version: 2 });
        expect(fetcher).toHaveBeenCalledOnce();
    });

    it('Stale cache: returns stale data and fetches in background', async () => {
        setUnitFixedClockTime('2025-01-01T10:00:00Z');
        const fetcher1 = vi.fn().mockResolvedValue({ version: 1 });
        await withSWR(CACHE_KEY, fetcher1, OPTIONS);

        // Advance time by 2 seconds (stale, but within 5s window)
        setUnitFixedClockTime('2025-01-01T10:00:02Z');
        const fetcher2 = vi.fn().mockResolvedValue({ version: 2 });

        const result = await withSWR(CACHE_KEY, fetcher2, OPTIONS);

        expect(result).toEqual({ version: 1 });

        // Wait for background refresh
        await vi.waitUntil(() => fetcher2.mock.calls.length > 0);
        expect(fetcher2).toHaveBeenCalledTimes(1);

        // Cache should be updated for next time
        const cachedRaw = localStorage.getItem(CACHE_KEY);
        if (!cachedRaw) throw new Error('Cache missing');
        const cached = JSON.parse(cachedRaw) as CacheEntry<{ version: number }>;
        expect(cached.data).toEqual({ version: 2 });
    });

    it('Expired cache: fetches new data', async () => {
        setUnitFixedClockTime('2025-01-01T10:00:00Z');
        const fetcher1 = vi.fn().mockResolvedValue({ version: 1 });
        await withSWR(CACHE_KEY, fetcher1, OPTIONS);

        // Advance time by 10 seconds (expired)
        setUnitFixedClockTime('2025-01-01T10:00:10Z');
        const fetcher2 = vi.fn().mockResolvedValue({ version: 2 });

        const result = await withSWR(CACHE_KEY, fetcher2, OPTIONS);

        expect(result).toEqual({ version: 2 });
        expect(fetcher2).toHaveBeenCalledTimes(1);
    });

    it.each(['missing', 'expired'] as const)('propagates a parsing failure with %s cache without writing it', async (state) => {
        setUnitFixedClockTime('2025-01-01T10:00:10Z');
        const previous = JSON.stringify({ timestamp: Date.parse('2025-01-01T10:00:00Z'), data: ['old'] });
        if (state === 'expired') localStorage.setItem(CACHE_KEY, previous);
        const fetcher = () => Promise.resolve().then(() => new CLTTLManagedClub2026PagesParser().getClubTeams('<html></html>'));

        await expect(withSWR(CACHE_KEY, fetcher, OPTIONS)).rejects.toThrow('Club teams table missing');
        expect(localStorage.getItem(CACHE_KEY)).toBe(state === 'expired' ? previous : null);
    });

    it('keeps stale data unchanged when parsing a refresh fails', async () => {
        setUnitFixedClockTime('2025-01-01T10:00:02Z');
        const previous = JSON.stringify({ timestamp: Date.parse('2025-01-01T10:00:00Z'), data: ['old'] });
        localStorage.setItem(CACHE_KEY, previous);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const fetcher = () => Promise.resolve().then(() => new CLTTLManagedClub2026PagesParser().getClubTeams('<html></html>'));

        expect(await withSWR(CACHE_KEY, fetcher, OPTIONS)).toEqual(['old']);
        await vi.waitFor(() => { expect(warn).toHaveBeenCalled(); });
        expect(localStorage.getItem(CACHE_KEY)).toBe(previous);
        warn.mockRestore();
    });

    it('Invalidate individual key', () => {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: 'test' }));
        invalidateCache(CACHE_KEY);
        expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    });

    it('Invalidate by prefix', () => {
        localStorage.setItem('prefix_1', 'val1');
        localStorage.setItem('prefix_2', 'val2');
        localStorage.setItem('other', 'val3');
        const storage = localStorage;
        const removeItem = vi.fn<Storage['removeItem']>((key) => { storage.removeItem(key); });
        stubLocalStorage({ removeItem });

        invalidateCacheByPrefix('prefix_');

        expect(localStorage.getItem('prefix_1')).toBeNull();
        expect(localStorage.getItem('prefix_2')).toBeNull();
        expect(localStorage.getItem('other')).toBe('val3');
        expect(removeItem.mock.calls).toEqual([['prefix_1'], ['prefix_2']]);
    });

    it('ignores null keys while invalidating a prefix', () => {
        localStorage.setItem('existing', 'value');
        const storage = localStorage;
        const removeItem = vi.fn<Storage['removeItem']>((key) => { storage.removeItem(key); });
        const key = vi.fn<Storage['key']>(() => null);
        stubLocalStorage({ key, removeItem });

        expect(() => {
            invalidateCacheByPrefix('prefix_');
        }).not.toThrow();
        expect(removeItem).not.toHaveBeenCalled();
    });

    it('continues with fresh data when storing it fails because of a quota error', async () => {
        const quotaError = new DOMException('Storage full', 'QuotaExceededError');
        const setItem = vi.fn<Storage['setItem']>(() => {
            throw quotaError;
        });
        stubLocalStorage({ setItem });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const freshData = { version: 'fresh' };

        await expect(withSWR(CACHE_KEY, () => Promise.resolve(freshData), OPTIONS)).resolves.toBe(freshData);

        expect(setItem).toHaveBeenCalledExactlyOnceWith(
            CACHE_KEY,
            expect.stringContaining('"version":"fresh"')
        );
        expect(warn).toHaveBeenCalledExactlyOnceWith(
            `Failed to save data to cache for ${CACHE_KEY}:`,
            quotaError
        );
        expect(localStorage.getItem(CACHE_KEY)).toBeNull();
        warn.mockRestore();
    });

    it('Applies transformer function if provided', async () => {
        const fetcher = vi.fn().mockResolvedValue({ date: '2025-01-01T10:00:00Z' });
        const transformer = (data: { date: string | Date }) => ({ date: new Date(data.date) });

        const result = await withSWR<{ date: Date }>(
            CACHE_KEY,
            fetcher as unknown as () => Promise<{ date: Date }>,
            OPTIONS,
            transformer as unknown as (data: { date: Date }) => { date: Date }
        );

        expect(result.date).toBeInstanceOf(Date);
        expect(result.date.toISOString()).toBe('2025-01-01T10:00:00.000Z');

    });

    it('Stale cache: triggers onBackgroundUpdate callback with fresh data', async () => {
        setUnitFixedClockTime('2025-01-01T10:00:00Z');
        const fetcher1 = vi.fn().mockResolvedValue({ version: 1 });
        await withSWR(CACHE_KEY, fetcher1, OPTIONS);

        // Advance time by 2 seconds (stale)
        setUnitFixedClockTime('2025-01-01T10:00:02Z');
        const fetcher2 = vi.fn().mockResolvedValue({ version: 2 });
        const onBackgroundUpdate = vi.fn();

        const result = await withSWR<{ version: number }>(CACHE_KEY, fetcher2, OPTIONS, undefined, onBackgroundUpdate);

        expect(result).toEqual({ version: 1 }); // Stale data returned immediately

        // Wait for background refresh and callback
        await vi.waitUntil(() => onBackgroundUpdate.mock.calls.length > 0);
        expect(onBackgroundUpdate).toHaveBeenCalledTimes(1);
        expect(onBackgroundUpdate).toHaveBeenCalledWith({ version: 2 });
    });
    it.each(['cold', 'expired'])('reports a %s refresh failure and retains the original error and cache', async (state) => {
        setUnitFixedClockTime('2025-01-01T10:00:10Z');
        const previous = JSON.stringify({ timestamp: new Date('2025-01-01T10:00:00Z').getTime(), data: 'old' });
        if (state === 'expired') localStorage.setItem(CACHE_KEY, previous);
        const failure = new Error('fetch failed');
        const fetcher = vi.fn().mockRejectedValue(failure);
        const callback = vi.fn();

        await expect(withSWR(CACHE_KEY, fetcher, OPTIONS, undefined, undefined, callback)).rejects.toBe(failure);
        expect(callback).toHaveBeenCalledWith(failure, { usableCache: false });
        expect(fetcher).toHaveBeenCalledWith();
        expect(localStorage.getItem(CACHE_KEY)).toBe(state === 'expired' ? previous : null);
    });

    it('reports a stale refresh failure without replacing cached data', async () => {
        setUnitFixedClockTime('2025-01-01T10:00:02Z');
        const previous = JSON.stringify({ timestamp: new Date('2025-01-01T10:00:00Z').getTime(), data: 'old' });
        localStorage.setItem(CACHE_KEY, previous);
        const failure = new Error('fetch failed');
        const callback = vi.fn();
        const update = vi.fn();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        expect(await withSWR(CACHE_KEY, () => Promise.reject(failure), OPTIONS, undefined, update, callback)).toBe('old');
        await vi.waitFor(() => { expect(callback).toHaveBeenCalledWith(failure, { usableCache: true }); });
        expect(console.warn).toHaveBeenCalledWith(`Background cache refresh failed for ${CACHE_KEY}:`, failure);
        expect(update).not.toHaveBeenCalled();
        expect(localStorage.getItem(CACHE_KEY)).toBe(previous);
        vi.restoreAllMocks();
    });

    it('does not report or fetch for fresh cache', async () => {
        setUnitFixedClockTime('2025-01-01T10:00:00Z');
        localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: new Date('2025-01-01T10:00:00Z').getTime(), data: 'old' }));
        const fetcher = vi.fn();
        const callback = vi.fn();
        expect(await withSWR(CACHE_KEY, fetcher, OPTIONS, undefined, undefined, callback)).toBe('old');
        expect(fetcher).not.toHaveBeenCalled();
        expect(callback).not.toHaveBeenCalled();
    });

    it.each(['throw', 'reject'])('isolates a callback that may %s from the original failure', async (mode) => {
        const failure = new Error('fetch failed');
        const callback = () => {
            if (mode === 'throw') throw new Error('report failed');
            return Promise.reject(new Error('report failed'));
        };
        await expect(withSWR(CACHE_KEY, () => Promise.reject(failure), OPTIONS, undefined, undefined, callback)).rejects.toBe(failure);
    });

});
