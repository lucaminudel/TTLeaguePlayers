import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { GeneralApiError } from '../../../src/api/api';
import { useAcceptInvite } from '../../../src/hooks/useAcceptInvite';

const mocks = vi.hoisted(() => ({
    acceptInvite: vi.fn<(nanoId: string, acceptedAt: number) => Promise<{ nano_id: string }>>()
}));

vi.mock('../../../src/api/inviteApi', () => ({
    inviteApi: {
        acceptInvite: mocks.acceptInvite
    }
}));

function requireAcceptance(acceptance: Promise<boolean> | undefined): Promise<boolean> {
    if (!acceptance) {
        throw new Error('Expected invite acceptance to have started');
    }
    return acceptance;
}

describe('useAcceptInvite', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-31T12:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('starts idle and reports accepting while the API call is pending', async () => {
        let resolveAccept: ((value: { nano_id: string }) => void) | undefined;
        mocks.acceptInvite.mockImplementationOnce(() => new Promise((resolve) => {
            resolveAccept = resolve;
        }));
        const { result } = renderHook(() => useAcceptInvite());

        expect(result.current.status).toBe('idle');
        expect(result.current.error).toBeNull();

        let acceptance: Promise<boolean> | undefined;
        act(() => {
            acceptance = result.current.acceptInvite('invite-id');
        });
        expect(result.current.status).toBe('accepting');

        await act(async () => {
            resolveAccept?.({ nano_id: 'invite-id' });
            await requireAcceptance(acceptance);
        });
        expect(result.current.status).toBe('accepted');
    });

    it('accepts the invite and records the successful state', async () => {
        mocks.acceptInvite.mockResolvedValue({
            nano_id: 'invite-id'
        });
        const { result } = renderHook(() => useAcceptInvite());

        let accepted: boolean | undefined;
        await act(async () => {
            accepted = await result.current.acceptInvite('invite-id');
        });

        expect(mocks.acceptInvite.mock.calls).toHaveLength(1);
        expect(mocks.acceptInvite.mock.calls[0]).toEqual([
            'invite-id',
            Math.floor(Date.now() / 1000)
        ]);
        expect(accepted).toBe(true);
        expect(result.current.status).toBe('accepted');
        expect(result.current.error).toBeNull();
    });

    it.each([
        ['a server error', new GeneralApiError('server error', 500)],
        ['a Cognito propagation error', new GeneralApiError('user not yet propagated', 422)],
        ['a status-only server error', { status: 500 }]
    ])('retries %s once after ten seconds and then succeeds', async (_description, retryableError) => {
        mocks.acceptInvite
            .mockRejectedValueOnce(retryableError)
            .mockResolvedValueOnce({ nano_id: 'invite-id' });
        const { result } = renderHook(() => useAcceptInvite());

        let acceptance: Promise<boolean> | undefined;
        act(() => {
            acceptance = result.current.acceptInvite('invite-id');
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(result.current.status).toBe('waiting_to_retry');
        expect(result.current.error).toBeNull();
        expect(mocks.acceptInvite.mock.calls).toHaveLength(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(9999);
        });
        expect(mocks.acceptInvite.mock.calls).toHaveLength(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
            await requireAcceptance(acceptance);
        });

        expect(mocks.acceptInvite.mock.calls).toHaveLength(2);
        expect(result.current.status).toBe('accepted');
        expect(result.current.error).toBeNull();
    });

    it.each([
        'Connection error',
        'NetworkError: connection interrupted',
        'Failed to fetch /invites/invite-id',
        'Request timed out after 5000ms'
    ])('retries a network failure with message "%s"', async (message) => {
        mocks.acceptInvite
            .mockRejectedValueOnce(new Error(message))
            .mockResolvedValueOnce({ nano_id: 'invite-id' });
        const { result } = renderHook(() => useAcceptInvite());

        let acceptance: Promise<boolean> | undefined;
        act(() => {
            acceptance = result.current.acceptInvite('invite-id');
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10000);
            await requireAcceptance(acceptance);
        });

        expect(mocks.acceptInvite.mock.calls).toHaveLength(2);
        expect(result.current.status).toBe('accepted');
    });

    it('stops after three failed attempts and exposes the final failure', async () => {
        mocks.acceptInvite
            .mockRejectedValue(new GeneralApiError('server error', 500));
        const { result } = renderHook(() => useAcceptInvite());

        let acceptance: Promise<boolean> | undefined;
        act(() => {
            acceptance = result.current.acceptInvite('invite-id');
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(20000);
        });
        await act(async () => {
            await requireAcceptance(acceptance);
        });

        expect(mocks.acceptInvite.mock.calls).toHaveLength(3);
        expect(result.current.status).toBe('failed');
        expect(result.current.error).toBe('Operation failed. Please contact support to fix the problem.');
        expect(vi.getTimerCount()).toBe(0);
    });

    it('does not retry HTTP 503 and shows its specific error', async () => {
        mocks.acceptInvite.mockRejectedValue(
            new GeneralApiError('service unavailable', 503)
        );
        const { result } = renderHook(() => useAcceptInvite());

        let accepted: boolean | undefined;
        await act(async () => {
            accepted = await result.current.acceptInvite('invite-id');
        });

        expect(accepted).toBe(false);
        expect(mocks.acceptInvite.mock.calls).toHaveLength(1);
        expect(result.current.status).toBe('failed');
        expect(result.current.error).toBe('Service temporarily unavailable. Please try again later.');
    });

    it('does not retry other HTTP or unrecognized errors', async () => {
        const { result } = renderHook(() => useAcceptInvite());
        const failures: unknown[] = [
            new GeneralApiError('unauthorized', 401),
            new GeneralApiError('invalid request', 400),
            new GeneralApiError('Failed to fetch despite HTTP response', 400),
            new Error('Unexpected failure'),
            'Unexpected rejection',
            { status: undefined },
            null
        ];

        for (const failure of failures) {
            mocks.acceptInvite.mockRejectedValueOnce(failure);
            let acceptance: Promise<boolean> | undefined;
            act(() => {
                acceptance = result.current.acceptInvite('invite-id');
            });
            let accepted: boolean | undefined;
            await act(async () => {
                await vi.advanceTimersByTimeAsync(20000);
                accepted = await requireAcceptance(acceptance);
            });

            expect(accepted).toBe(false);
            expect(result.current.status).toBe('failed');
            expect(result.current.error).toBe('Operation failed. Please contact support to fix the problem.');
        }

        expect(mocks.acceptInvite.mock.calls).toHaveLength(failures.length);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('clears the previous error and starts accepting again', async () => {
        mocks.acceptInvite
            .mockRejectedValueOnce(new GeneralApiError('unauthorized', 401))
            .mockResolvedValueOnce({ nano_id: 'invite-id' });
        const { result } = renderHook(() => useAcceptInvite());

        await act(async () => {
            await result.current.acceptInvite('invite-id');
        });
        expect(result.current.status).toBe('failed');
        expect(result.current.error).not.toBeNull();

        await act(async () => {
            await expect(result.current.acceptInvite('invite-id')).resolves.toBe(true);
        });
        expect(result.current.status).toBe('accepted');
        expect(result.current.error).toBeNull();
    });
});
