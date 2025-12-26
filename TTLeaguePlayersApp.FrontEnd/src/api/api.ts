/**
 * Generic API error interface
 */
export interface ApiError {
    message?: string;
    error?: string;
    errors?: Record<string, string[]>; // For validation errors
}

/**
 * Generic API error class for handling fetch failures
 */
export class GeneralApiError extends Error {
    public status?: number;
    public response?: unknown;

    constructor(
        message: string,
        status?: number,
        response?: unknown
    ) {
        super(message);
        this.status = status;
        this.response = response;
        this.name = 'ApiError';
    }
}

/**
 * Get authorization headers for API calls
 */
let getAuthToken: (() => Promise<string | null>) | null = null;

export function setAuthTokenProvider(provider: () => Promise<string | null>) {
    getAuthToken = provider;
}

// --- Telemetry & Observability ---

export interface TelemetryEvent {
    endpoint: string;
    method: string;
    status?: number;
    durationMs: number;
    attempt: number;
    error?: string;
    isRetry?: boolean;
}

export const telemetry = {
    log: (event: TelemetryEvent) => {
        const flag = (event.status ?? 0) >= 200 && (event.status ?? 0) < 300 ? '✅' : '❌';
        console.log(
            `[API Telemetry] ${flag} ${event.method} ${event.endpoint} | ` +
            `Status: ${String(event.status ?? 'Error')} | Duration: ${String(event.durationMs)}ms | ` +
            `Attempt: ${String(event.attempt + 1)} | ${event.error ? `Error: ${event.error}` : ''}`
        );
    }
};

// --- API Fetch with Resilience ---

const API_HEADERS = {
    'Content-Type': 'application/json',
} as const;

const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 10000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 15000;
const RETRYABLE_STATUS_CODES = [429, 502, 503, 504];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- Request Deduplication ---
// Logic removed to simplify code and make each request independent.


/**
 * Full Jitter algorithm to prevent thundering herds
 */
function getJitteredDelay(attempt: number): number {
    const exponentialDelay = Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * Math.pow(2, attempt));
    return Math.floor(Math.random() * exponentialDelay);
}

/**
 * Extract Retry-After header value in milliseconds
 */
function getRetryAfterMs(response: Response): number | null {
    const retryAfter = response.headers.get('Retry-After');
    if (!retryAfter) return null;

    if (/^\d+$/.test(retryAfter)) {
        return parseInt(retryAfter, 10) * 1000;
    }

    const date = Date.parse(retryAfter);
    if (!isNaN(date)) {
        return Math.max(0, date - Date.now());
    }

    return null;
}

/**
 * Generic fetch wrapper with advanced resilience patterns
 */
export async function apiFetch<T>(
    baseUrl: string,
    endpoint: string,
    options: RequestInit = {},
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
    maxRetries: number = DEFAULT_MAX_RETRIES
): Promise<T> {
    const url = `${baseUrl}${endpoint}`;
    const method = (options.method ?? 'GET').toUpperCase();

    let attempt = 0;
    let lastStatus: number | undefined = undefined;
    const requestStartTime = Date.now();


    while (attempt <= maxRetries) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => { controller.abort(); }, timeoutMs);

        try {
            const optionsHeaders = options.headers as Record<string, string> | undefined;
            const headers: Record<string, string> = { ...API_HEADERS, ...(optionsHeaders ?? {}) };

            if (method !== 'GET' && !headers['Idempotency-Key']) {
                headers['Idempotency-Key'] = crypto.randomUUID();
            }

            if (getAuthToken) {
                const token = await getAuthToken();
                if (token) {
                    headers.Authorization = `Bearer ${token}`;
                }
            }

            const response = await fetch(url, {
                ...options,
                headers,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);
            const durationMs = Date.now() - requestStartTime;
            lastStatus = response.status;

            if (!response.ok) {
                const retryAfterMs = getRetryAfterMs(response);

                if (RETRYABLE_STATUS_CODES.includes(response.status) && attempt < maxRetries) {
                    const delay = retryAfterMs ?? getJitteredDelay(attempt);

                    telemetry.log({
                        endpoint, method, status: response.status, durationMs,
                        attempt, isRetry: true, error: `Retrying in ${String(delay)}ms`
                    });

                    await sleep(delay);
                    attempt++;
                    continue;
                }

                const errorText = await response.text();
                const responseStatus = response.status;
                let errorMessage = `Failed to fetch ${endpoint}: ${String(responseStatus)} ${response.statusText}`;

                try {
                    const errorData = JSON.parse(errorText) as ApiError;
                    errorMessage = errorData.message ?? errorData.error ?? errorMessage;
                } catch {
                    errorMessage = errorText || errorMessage;
                }

                telemetry.log({ endpoint, method, status: response.status, durationMs, attempt, error: errorMessage });
                throw new GeneralApiError(errorMessage, response.status, errorText);
            }

            const data = (await response.json()) as T;

            telemetry.log({ endpoint, method, status: response.status, durationMs, attempt });
            return data;

        } catch (error) {
            clearTimeout(timeoutId);
            const durationMs = Date.now() - requestStartTime;

            if (error instanceof GeneralApiError) {
                throw error;
            }

            const isTimeout = error instanceof Error && error.name === 'AbortError';
            const isNetworkError = error instanceof Error && error.name === 'TypeError';

            if ((isTimeout || isNetworkError) && attempt < maxRetries) {
                const delay = getJitteredDelay(attempt);

                telemetry.log({
                    endpoint, method, durationMs: durationMs, attempt, isRetry: true,
                    error: `${isTimeout ? 'Timeout' : 'Network error'}. Retrying in ${String(delay)}ms`
                });

                await sleep(delay);
                attempt++;
                continue;
            }

            const errorMessage = isTimeout ? `Request timed out after ${String(timeoutMs)}ms` : `Connection error`;
            telemetry.log({ endpoint, method, durationMs: durationMs, attempt, error: (error as Error).message || errorMessage });

            throw new GeneralApiError(errorMessage, lastStatus, error);
        }
    }

    throw new GeneralApiError(`Max retries reached for ${endpoint} after ${String(maxRetries)} attempts`, lastStatus);
}
