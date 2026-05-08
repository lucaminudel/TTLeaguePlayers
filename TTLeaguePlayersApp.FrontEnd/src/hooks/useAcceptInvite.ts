import { useState, useCallback } from 'react';
import { inviteApi } from '../api/inviteApi';

type AcceptInviteStatus = 'idle' | 'accepting' | 'waiting_to_retry' | 'failed' | 'accepted';

interface UseAcceptInviteReturn {
    status: AcceptInviteStatus;
    error: string | null;
    acceptInvite: (nanoId: string) => Promise<boolean>;
}

/**
 * Custom hook to handle invite acceptance with retry logic
 * 
 * Retry strategy:
 * - 5xx (except 503): ✅ Retry up to 3 times, 10s apart
 * - 422 (Cognito user not yet propagated): ✅ Retry
 * - Connection/Network errors: ✅ Retry
 * - 503 (handled by apiFetch layer): ❌ No retry at this level
 * - All other errors: ❌ No retry
 * - Max retries exceeded: Show "Invitation confirmation failed. Please contact support..."
 */
export function useAcceptInvite(): UseAcceptInviteReturn {
    const [status, setStatus] = useState<AcceptInviteStatus>('idle');
    const [error, setError] = useState<string | null>(null);

    // Helper to wait for a specified duration
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const acceptInvite = useCallback(
        async (nanoId: string): Promise<boolean> => {
            const attemptAccept = async (currentAttempt = 1): Promise<boolean> => {
                setStatus('accepting');
                setError(null);

                try {
                    await inviteApi.acceptInvite(nanoId, Math.floor(Date.now() / 1000));
                    setStatus('accepted');
                    return true;
                } catch (err: unknown) {
                    let isRetryable = false;
                    let errorStatus: number | undefined;

                    const isApiError = (e: unknown): e is { status?: number; message?: string } => {
                        return typeof e === 'object' && e !== null && ('status' in e || 'message' in e);
                    };

                    if (isApiError(err)) {
                        errorStatus = err.status;
                        const errMessage = err.message ?? '';
                        const hasHttpStatus = errorStatus !== undefined;

                        // 503 has its own automatic apiFetch retry - don't retry here
                        if (
                            (errorStatus !== undefined && errorStatus >= 500 && errorStatus !== 503) ||
                            errorStatus === 422 ||
                            (!hasHttpStatus && (
                                errMessage === 'Connection error' ||
                                errMessage.includes('NetworkError') ||
                                errMessage.includes('Failed to fetch') ||
                                errMessage.includes('Request timed out')
                            ))
                        ) {
                            isRetryable = true;
                        }
                    }

                    if (isRetryable && currentAttempt < 3) {
                        setStatus('waiting_to_retry');
                        await wait(10000); // Wait 10 seconds
                        return attemptAccept(currentAttempt + 1);
                    } else {
                        // Final failure or non-retryable error
                        setStatus('failed');
                        const errorMessage = errorStatus === 503
                            ? 'Service temporarily unavailable. Please try again later.'
                            : 'Operation failed. Please contact support to fix the problem.';
                        setError(errorMessage);
                        return false;
                    }
                }
            };

            return attemptAccept(1);
        },
        []
    );

    return {
        status,
        error,
        acceptInvite,
    };
}
