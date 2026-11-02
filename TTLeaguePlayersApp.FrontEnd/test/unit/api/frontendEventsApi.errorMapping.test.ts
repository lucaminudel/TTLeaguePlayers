import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('../../../src/api/api', async importOriginal => ({
    ...await importOriginal<typeof import('../../../src/api/api')>(),
    apiFetch,
}));

import { GeneralApiError } from '../../../src/api/api';
import { sendFrontendEvent } from '../../../src/api/frontendEventsApi';
import { getConfig, type EnvironmentConfig } from '../../../src/config/environment';
import type { FrontendDiagnostic } from '../../../src/types/frontendDiagnostic';

vi.mock('../../../src/config/environment', () => ({ getConfig: vi.fn() }));

const diagnostic: FrontendDiagnostic = {
    event_category: 'FRONTEND_API_CALL_ERROR',
    client_api_type: 'TT365',
    timestamp: '2026-10-27T20:51:26Z',
    operation: 'getTeamPlayers',
    request: { method: 'GET', url: 'https://example.test/players' },
    response: { status: 503, body: 'upstream response' },
};

describe('sendFrontendEvent error mapping and delivery timeout', () => {
    beforeEach(() => {
        vi.mocked(getConfig).mockReturnValue({ ApiGateWay: { ApiBaseUrl: 'https://api.example.test' } } as EnvironmentConfig);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it.each([
        ['a numeric status', new GeneralApiError('unavailable', 503), { success: false, status: 503 }],
        ['an omitted status', new GeneralApiError('connection error'), { success: false }],
        ['an explicit undefined status', new GeneralApiError('connection error', undefined), { success: false }],
    ])('returns the exact failure shape for %s', async (_description, error, expected) => {
        apiFetch.mockRejectedValueOnce(error);

        await expect(sendFrontendEvent(diagnostic)).resolves.toStrictEqual(expected);
    });

    it('does not propagate a status-shaped error outside GeneralApiError', async () => {
        apiFetch.mockRejectedValueOnce(Object.assign(new Error('unavailable'), { status: 503 }));

        await expect(sendFrontendEvent(diagnostic)).resolves.toStrictEqual({ success: false });
    });

    it.each([
        ['success', () => Promise.resolve({}), { success: true }],
        ['rejection', () => Promise.reject(new GeneralApiError('unavailable', 503)), { success: false, status: 503 }],
    ])('clears the outer delivery timeout after %s', async (_outcome, createRequest, expected) => {
        vi.useFakeTimers();
        apiFetch.mockImplementationOnce(createRequest);

        await expect(sendFrontendEvent(diagnostic)).resolves.toEqual(expected);
        expect(vi.getTimerCount()).toBe(0);

        await vi.advanceTimersByTimeAsync(5000);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('clears the outer delivery timeout after it wins and ignores a later request completion', async () => {
        vi.useFakeTimers();
        let resolveRequest!: (value: unknown) => void;
        apiFetch.mockImplementationOnce(() => new Promise(resolve => { resolveRequest = resolve; }));

        const delivery = sendFrontendEvent(diagnostic);
        await vi.advanceTimersByTimeAsync(5000);
        await expect(delivery).resolves.toEqual({ success: false });
        expect(vi.getTimerCount()).toBe(0);

        resolveRequest({});
        await Promise.resolve();
        expect(vi.getTimerCount()).toBe(0);
    });
});
