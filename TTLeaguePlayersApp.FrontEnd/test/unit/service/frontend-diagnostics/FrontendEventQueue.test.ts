import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrontendDiagnostic } from '../../../../src/types/frontendDiagnostic';
import type { FrontendDiagnosticDelivery } from '../../../../src/types/frontendDiagnostic';

const { sendFrontendEvent } = vi.hoisted(() => ({ sendFrontendEvent: vi.fn<(diagnostic: FrontendDiagnostic) => Promise<FrontendDiagnosticDelivery>>() }));
vi.mock('../../../../src/api/frontendEventsApi', () => ({ sendFrontendEvent }));

const KEY = 'frontend_event_queue';
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 29);
const diagnostic = (operation: string): FrontendDiagnostic => ({
    event_category: 'FRONTEND_API_CALL_ERROR', client_api_type: 'TT365',
    timestamp: '2026-10-01T12:00:00Z', operation, response: { body: '<html>original</html>' },
});
const entry = (id: string, queuedAt = NOW) => ({ id, queuedAt, diagnostic: diagnostic(id) });
const setQueue = (entries: ReturnType<typeof entry>[]) => {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, entries }));
};
const stored = (): ReturnType<typeof entry>[] => (JSON.parse(localStorage.getItem(KEY) ?? '{"entries":[]}') as { entries: ReturnType<typeof entry>[] }).entries;

describe('frontend event queue', () => {
    let queue: typeof import('../../../../src/service/frontend-diagnostics/FrontendEventQueue');

    beforeEach(async () => {
        vi.resetModules();
        vi.resetAllMocks();
        localStorage.clear();
        vi.spyOn(Date, 'now').mockReturnValue(NOW);
        vi.mocked(sendFrontendEvent).mockResolvedValue({ success: true });
        queue = await import('../../../../src/service/frontend-diagnostics/FrontendEventQueue');
    });

    afterEach(() => vi.restoreAllMocks());

    it('attempts a new diagnostic immediately and retains its complete original payload if delivery fails', async () => {
        vi.mocked(sendFrontendEvent).mockResolvedValue({ success: false });
        const event = diagnostic('fixtures');
        await queue.submitFrontendEvent(event);
        expect(sendFrontendEvent).toHaveBeenCalledOnce();
        expect(sendFrontendEvent).toHaveBeenCalledWith(event);
        expect(stored()).toHaveLength(1);
        const queued = stored()[0];
        expect(typeof queued.id).toBe('string');
        expect(queued.queuedAt).toBe(NOW);
        expect(queued.diagnostic).toEqual(event);
    });

    it('drains only the earlier snapshot and retains a newly failed diagnostic for a later trigger', async () => {
        setQueue([entry('old')]);
        vi.mocked(sendFrontendEvent).mockResolvedValueOnce({ success: false }).mockResolvedValueOnce({ success: true });
        await queue.submitFrontendEvent(diagnostic('new'));
        await vi.waitFor(() => {
            expect(stored().map(item => item.diagnostic.operation)).toEqual(['new']);
        });
        expect(sendFrontendEvent).toHaveBeenCalledTimes(2);
        expect(sendFrontendEvent).toHaveBeenNthCalledWith(1, diagnostic('new'));
        expect(sendFrontendEvent).toHaveBeenNthCalledWith(2, { ...diagnostic('old'), deferred: true });
    });

    it('resends sequentially with the original timestamp and removes each acknowledged item', async () => {
        setQueue([entry('one'), entry('two')]);
        let finishFirst!: (value: { success: boolean }) => void;
        vi.mocked(sendFrontendEvent).mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }));
        const draining = queue.drainFrontendEvents();
        expect(sendFrontendEvent).toHaveBeenCalledTimes(1);
        finishFirst({ success: true });
        await draining;
        expect(sendFrontendEvent).toHaveBeenNthCalledWith(1, { ...diagnostic('one'), deferred: true });
        expect(sendFrontendEvent).toHaveBeenNthCalledWith(2, { ...diagnostic('two'), deferred: true });
        expect(stored()).toEqual([]);
    });

    it('retains the 20 newest items when a failed submission exceeds the entry limit', async () => {
        setQueue(Array.from({ length: 20 }, (_, index) => entry(String(index), NOW - 100 + index)));
        vi.mocked(sendFrontendEvent).mockResolvedValue({ success: false, status: 503 });
        await queue.submitFrontendEvent(diagnostic('new'));
        expect(stored().map(item => item.diagnostic.operation)).toEqual([...Array.from({ length: 19 }, (_, index) => String(index + 1)), 'new']);
    });

    it('expires entries at 14 days from insertion without changing the event timestamp', async () => {
        setQueue([entry('expired', NOW - 14 * DAY), entry('retained', NOW - 14 * DAY + 1)]);
        vi.mocked(sendFrontendEvent).mockResolvedValue({ success: false });
        await queue.drainFrontendEvents();
        expect(sendFrontendEvent).toHaveBeenCalledOnce();
        expect(sendFrontendEvent).toHaveBeenCalledWith({ ...diagnostic('retained'), deferred: true });
        expect(stored().map(item => item.id)).toEqual(['retained']);
    });

    it('removes expired entries when a new immediate submission succeeds', async () => {
        setQueue([entry('expired', NOW - 14 * DAY)]);
        await queue.submitFrontendEvent(diagnostic('new'));
        expect(sendFrontendEvent).toHaveBeenCalledOnce();
        expect(stored()).toEqual([]);
    });

    it.each([400, 404, 422])('removes a permanently rejected HTTP %i item and continues', async status => {
        setQueue([entry('bad'), entry('good')]);
        vi.mocked(sendFrontendEvent).mockResolvedValueOnce({ success: false, status }).mockResolvedValueOnce({ success: true });
        await queue.drainFrontendEvents();
        expect(sendFrontendEvent).toHaveBeenCalledTimes(2);
        expect(stored()).toEqual([]);
    });

    it.each([undefined, 399, 429, 500, 503])('retains temporary failure %s and continues', async status => {
        setQueue([entry('retry'), entry('good')]);
        vi.mocked(sendFrontendEvent).mockResolvedValueOnce({ success: false, status }).mockResolvedValueOnce({ success: true });
        await queue.drainFrontendEvents();
        expect(stored().map(item => item.id)).toEqual(['retry']);
        expect(sendFrontendEvent).toHaveBeenCalledTimes(2);
    });

    it.each([401, 403])('retains the queue and pauses the pass on HTTP %i', async status => {
        setQueue([entry('auth'), entry('next')]);
        vi.mocked(sendFrontendEvent).mockResolvedValue({ success: false, status });
        await queue.drainFrontendEvents();
        expect(sendFrontendEvent).toHaveBeenCalledOnce();
        expect(stored().map(item => item.id)).toEqual(['auth', 'next']);
    });

    it('prevents overlapping drains and applies the five-second cooldown', async () => {
        setQueue([entry('retry')]);
        let finish!: (value: { success: boolean }) => void;
        vi.mocked(sendFrontendEvent).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const first = queue.drainFrontendEvents();
        await queue.drainFrontendEvents();
        expect(sendFrontendEvent).toHaveBeenCalledOnce();
        finish({ success: false });
        await first;
        vi.mocked(Date.now).mockReturnValue(NOW + 4999);
        await queue.drainFrontendEvents();
        expect(sendFrontendEvent).toHaveBeenCalledOnce();
        vi.mocked(Date.now).mockReturnValue(NOW + 5000);
        await queue.drainFrontendEvents();
        expect(sendFrontendEvent).toHaveBeenCalledTimes(2);
        expect(stored()).toEqual([]);
    });

    it('does not overlap a pending drain even after its cooldown has elapsed', async () => {
        setQueue([entry('pending')]);
        let finish!: (value: { success: boolean }) => void;
        vi.mocked(sendFrontendEvent).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const first = queue.drainFrontendEvents();
        vi.mocked(Date.now).mockReturnValue(NOW + 5000);
        await queue.drainFrontendEvents();
        expect(sendFrontendEvent).toHaveBeenCalledOnce();
        finish({ success: false });
        await first;
        await queue.drainFrontendEvents();
        expect(sendFrontendEvent).toHaveBeenCalledTimes(2);
        expect(stored()).toEqual([]);
    });

    it('does not start a cooldown for an empty drain', async () => {
        await queue.drainFrontendEvents();
        expect(sendFrontendEvent).not.toHaveBeenCalled();
        setQueue([entry('new')]);
        await queue.drainFrontendEvents();
        expect(sendFrontendEvent).toHaveBeenCalledWith({ ...diagnostic('new'), deferred: true });
        expect(stored()).toEqual([]);
    });

    it('applies cooldown when the first drain starts at epoch zero', async () => {
        vi.mocked(Date.now).mockReturnValue(0);
        setQueue([entry('retry', 0)]);
        vi.mocked(sendFrontendEvent).mockResolvedValueOnce({ success: false });
        await queue.drainFrontendEvents();
        vi.mocked(Date.now).mockReturnValue(4999);
        await queue.drainFrontendEvents();
        expect(sendFrontendEvent).toHaveBeenCalledOnce();
        vi.mocked(Date.now).mockReturnValue(5000);
        await queue.drainFrontendEvents();
        expect(sendFrontendEvent).toHaveBeenCalledTimes(2);
    });

    it('tolerates corrupt queue content and can store a later diagnostic', async () => {
        localStorage.setItem(KEY, '{invalid');
        vi.mocked(sendFrontendEvent).mockResolvedValue({ success: false });
        await expect(queue.submitFrontendEvent(diagnostic('new'))).resolves.toBeUndefined();
        expect(stored().map(item => item.diagnostic.operation)).toEqual(['new']);
    });

    it.each([null, [], {}, { version: 2, entries: [] }, { version: 1 }, { version: 1, entries: {} }])(
        'removes an invalid envelope and recovers on a later submission: %s', async envelope => {
            localStorage.setItem(KEY, JSON.stringify(envelope));
            await queue.drainFrontendEvents();
            expect(sendFrontendEvent).not.toHaveBeenCalled();
            expect(stored()).toEqual([]);
            vi.mocked(sendFrontendEvent).mockResolvedValue({ success: false });
            await queue.submitFrontendEvent(diagnostic('recovered'));
            expect(stored().map(item => item.diagnostic.operation)).toEqual(['recovered']);
        },
    );

    it('removes a mismatched version even when it contains a valid entry', async () => {
        localStorage.setItem(KEY, JSON.stringify({ version: 2, entries: [entry('old-version')] }));
        const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
        await queue.drainFrontendEvents();
        expect(removeItem).toHaveBeenCalledWith(KEY);
        expect(sendFrontendEvent).not.toHaveBeenCalled();
        expect(stored()).toEqual([]);
    });

    it('removes malformed JSON on drain without sending an event', async () => {
        localStorage.setItem(KEY, '{invalid');
        const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
        await queue.drainFrontendEvents();
        expect(removeItem).toHaveBeenCalledWith(KEY);
        expect(sendFrontendEvent).not.toHaveBeenCalled();
        expect(stored()).toEqual([]);
    });

    it('persists only usable entries before attempting delivery', async () => {
        localStorage.setItem(KEY, JSON.stringify({
            version: 1,
            entries: [null, 'invalid', entry('usable'), { id: 1, queuedAt: NOW, diagnostic: diagnostic('bad-id') },
                { id: 'bad-time', queuedAt: String(NOW), diagnostic: diagnostic('bad-time') },
                { id: 'missing-diagnostic', queuedAt: NOW }, { id: 'bad-diagnostic', queuedAt: NOW, diagnostic: 'invalid' }],
        }));
        let entriesAtDelivery: ReturnType<typeof entry>[] | undefined;
        vi.mocked(sendFrontendEvent).mockImplementation(() => {
            entriesAtDelivery = stored();
            return Promise.resolve({ success: false });
        });
        await queue.drainFrontendEvents();
        expect(sendFrontendEvent).toHaveBeenCalledOnce();
        expect(sendFrontendEvent).toHaveBeenCalledWith({ ...diagnostic('usable'), deferred: true });
        expect(entriesAtDelivery).toEqual([entry('usable')]);
        expect(stored()).toEqual([entry('usable')]);
    });

    it('caps entries read from storage before delivering and persisting them', async () => {
        setQueue(Array.from({ length: 22 }, (_, index) => entry(String(index))));
        vi.mocked(sendFrontendEvent).mockResolvedValue({ success: false });
        await queue.drainFrontendEvents();
        expect(stored().map(item => item.id)).toEqual(Array.from({ length: 20 }, (_, index) => String(index + 2)));
        expect(sendFrontendEvent.mock.calls.map(([event]) => event.operation)).toEqual(Array.from({ length: 20 }, (_, index) => String(index + 2)));
    });

    it('continues after a rejected delivery and releases the lock for a later pass', async () => {
        setQueue([entry('rejected'), entry('accepted')]);
        vi.mocked(sendFrontendEvent).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ success: true });
        await queue.drainFrontendEvents();
        expect(sendFrontendEvent).toHaveBeenCalledTimes(2);
        expect(stored()).toEqual([entry('rejected')]);
        vi.mocked(Date.now).mockReturnValue(NOW + 5000);
        await queue.drainFrontendEvents();
        expect(sendFrontendEvent).toHaveBeenCalledTimes(3);
        expect(stored()).toEqual([]);
    });

    it.each(['rejection', 'throw'])('drains the earlier snapshot and enqueues an immediate %s', async failure => {
        setQueue([entry('old')]);
        vi.mocked(sendFrontendEvent).mockImplementationOnce(() => {
            if (failure === 'throw') throw new Error('offline');
            return Promise.reject(new Error('offline'));
        }).mockResolvedValueOnce({ success: false });
        await queue.submitFrontendEvent(diagnostic('new'));
        await vi.waitFor(() => { expect(sendFrontendEvent).toHaveBeenCalledTimes(2); });
        expect(sendFrontendEvent).toHaveBeenNthCalledWith(1, diagnostic('new'));
        expect(sendFrontendEvent).toHaveBeenNthCalledWith(2, { ...diagnostic('old'), deferred: true });
        expect(stored().map(item => item.diagnostic.operation)).toEqual(['old', 'new']);
    });

    it('preserves a concurrently enqueued failure when acknowledging an earlier snapshot', async () => {
        setQueue([entry('old')]);
        let finish!: (value: { success: boolean }) => void;
        vi.mocked(sendFrontendEvent).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
            .mockResolvedValueOnce({ success: false });
        const draining = queue.drainFrontendEvents();
        await queue.submitFrontendEvent(diagnostic('new'));
        expect(stored().map(item => item.diagnostic.operation)).toEqual(['old', 'new']);
        finish({ success: true });
        await draining;
        expect(stored().map(item => item.diagnostic.operation)).toEqual(['new']);
        expect(sendFrontendEvent).toHaveBeenCalledTimes(2);
    });

    it('isolates removal failure for a corrupt envelope and still attempts the submission', async () => {
        localStorage.setItem(KEY, '{invalid');
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
        vi.mocked(sendFrontendEvent).mockResolvedValue({ success: false });
        await expect(queue.submitFrontendEvent(diagnostic('new'))).resolves.toBeUndefined();
        expect(sendFrontendEvent).toHaveBeenCalledOnce();
        expect(localStorage.getItem(KEY)).toBe('{invalid');
    });

    it('persists a failed submission when the queue is absent and removal is unavailable', async () => {
        const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
        vi.mocked(sendFrontendEvent).mockResolvedValue({ success: false });
        await queue.submitFrontendEvent(diagnostic('new'));
        expect(removeItem).not.toHaveBeenCalled();
        expect(stored().map(item => item.diagnostic.operation)).toEqual(['new']);
    });

    it('releases the drain lock after an acknowledgement write fails', async () => {
        setQueue([entry('retry')]);
        const originalSetItem = localStorage.setItem.bind(localStorage);
        const setItem = vi.spyOn(Storage.prototype, 'setItem');
        setItem.mockImplementationOnce((key, value) => { originalSetItem(key, value); });
        // Fail the acknowledgement write, after the initial normalized queue write succeeds.
        setItem.mockImplementationOnce(() => { throw new Error('denied'); });
        await queue.drainFrontendEvents();
        expect(stored()).toEqual([entry('retry')]);
        setItem.mockRestore();
        vi.mocked(Date.now).mockReturnValue(NOW + 5000);
        await queue.drainFrontendEvents();
        expect(sendFrontendEvent).toHaveBeenCalledTimes(2);
        expect(stored()).toEqual([]);
    });

    it('still attempts immediate delivery when storage is denied and isolates a failed write', async () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
        vi.mocked(sendFrontendEvent).mockResolvedValue({ success: false });
        await expect(queue.submitFrontendEvent(diagnostic('new'))).resolves.toBeUndefined();
        expect(sendFrontendEvent).toHaveBeenCalledOnce();
        await expect(queue.drainFrontendEvents()).resolves.toBeUndefined();
    });

    it('isolates a quota failure when persisting a failed diagnostic', async () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); });
        vi.mocked(sendFrontendEvent).mockResolvedValue({ success: false });
        await expect(queue.submitFrontendEvent(diagnostic('new'))).resolves.toBeUndefined();
        expect(sendFrontendEvent).toHaveBeenCalledOnce();
        expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('retains an item after a failed or ambiguous delivery so it can be attempted later', async () => {
        setQueue([entry('ambiguous')]);
        vi.mocked(sendFrontendEvent).mockRejectedValueOnce(new Error('connection lost')).mockResolvedValueOnce({ success: true });
        await queue.drainFrontendEvents();
        expect(stored()).toHaveLength(1);
        vi.mocked(Date.now).mockReturnValue(NOW + 5000);
        await queue.drainFrontendEvents();
        expect(sendFrontendEvent).toHaveBeenCalledTimes(2);
        expect(stored()).toEqual([]);
    });
});
