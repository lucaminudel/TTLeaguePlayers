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

    it.each([undefined, 429, 500, 503])('retains temporary failure %s and continues', async status => {
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

    it('tolerates corrupt queue content and can store a later diagnostic', async () => {
        localStorage.setItem(KEY, '{invalid');
        vi.mocked(sendFrontendEvent).mockResolvedValue({ success: false });
        await expect(queue.submitFrontendEvent(diagnostic('new'))).resolves.toBeUndefined();
        expect(stored().map(item => item.diagnostic.operation)).toEqual(['new']);
    });

    it('drops malformed versioned entries while retaining usable entries', async () => {
        localStorage.setItem(KEY, JSON.stringify({
            version: 1,
            entries: [entry('usable'), { id: 'missing-diagnostic', queuedAt: NOW }],
        }));
        await queue.drainFrontendEvents();
        expect(sendFrontendEvent).toHaveBeenCalledWith({ ...diagnostic('usable'), deferred: true });
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
