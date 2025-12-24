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
    isCircuitOpen?: boolean;
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

// --- Circuit Breaker ---

interface CircuitState {
    failures: number;
    lastFailureTime: number;
    status: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

const CIRCUIT_BREAKER_CONFIG = {
    FAILURE_THRESHOLD: 5,
    RESET_TIMEOUT_MS: 30000, // 30 seconds
};

// --- Circuit Breaker Persistence ---

function loadCircuitState(): Record<string, CircuitState> {
    try {
        const stored = localStorage.getItem('circuit-breaker-state');
        return stored ? (JSON.parse(stored) as Record<string, CircuitState>) : {};
    } catch {
        return {};
    }
}

function saveCircuitState() {
    try {
        localStorage.setItem('circuit-breaker-state', JSON.stringify(circuitStates));
    } catch {
        // Ignore localStorage errors
    }
}

const circuitStates: Record<string, CircuitState | undefined> = loadCircuitState();

function getCircuitKey(baseUrl: string, endpoint: string): string {
    // Grouping by base path to prevent cascading if one resource is down
    const resource = endpoint.split('/')[1] || 'root';
    return `${baseUrl}/${resource}`;
}

function checkCircuit(key: string): boolean {
    const state = circuitStates[key];
    if (!state || state.status === 'CLOSED') return true;

    if (state.status === 'OPEN') {
        if (Date.now() - state.lastFailureTime > CIRCUIT_BREAKER_CONFIG.RESET_TIMEOUT_MS) {
            state.status = 'HALF_OPEN';
            return true;
        }
        return false;
    }

    return true; // HALF_OPEN
}

function recordSuccess(key: string) {
    circuitStates[key] = { failures: 0, lastFailureTime: 0, status: 'CLOSED' };
    saveCircuitState();
}

function recordFailure(key: string) {
    const state = circuitStates[key] ?? { failures: 0, lastFailureTime: 0, status: 'CLOSED' };
    state.failures++;
    state.lastFailureTime = Date.now();

    if (state.failures >= CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD) {
        state.status = 'OPEN';
        console.error(`[Circuit Breaker] OPEN for ${key}. Blocking further requests.`);
    }
    circuitStates[key] = state;
    saveCircuitState();
}

// --- API Fetch with Resilience ---

const API_HEADERS = {
    'Content-Type': 'application/json',
} as const;

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 10000;
const DEFAULT_TIMEOUT_MS = 15000;
const RETRYABLE_STATUS_CODES = [429, 502, 503, 504];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- Request Deduplication ---

const pendingRequests = new Map<string, Promise<unknown>>();

function getRequestKey(baseUrl: string, endpoint: string, options: RequestInit): string {
    const bodyStr = typeof options.body === 'string' ? options.body : '';
    return `${options.method ?? 'GET'}:${baseUrl}${endpoint}:${bodyStr}`;
}

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
    timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
    const url = `${baseUrl}${endpoint}`;
    const circuitKey = getCircuitKey(baseUrl, endpoint);
    const method = (options.method ?? 'GET').toUpperCase();

    // Check for duplicate requests
    const requestKey = getRequestKey(baseUrl, endpoint, options);
    const pending = pendingRequests.get(requestKey);
    if (pending) {
        return pending as Promise<T>;
    }

    if (!checkCircuit(circuitKey)) {
        const error = `Circuit is OPEN for ${circuitKey}`;
        telemetry.log({ endpoint, method, durationMs: 0, attempt: 0, error, isCircuitOpen: true });
        throw new GeneralApiError(error, 503);
    }

    const requestPromise = (async (): Promise<T> => {
        let attempt = 0;
        const requestStartTime = Date.now();

        while (attempt <= MAX_RETRIES) {
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

                if (!response.ok) {
                    const retryAfterMs = getRetryAfterMs(response);

                    if (RETRYABLE_STATUS_CODES.includes(response.status) && attempt < MAX_RETRIES) {
                        const delay = retryAfterMs ?? getJitteredDelay(attempt);

                        telemetry.log({
                            endpoint, method, status: response.status, durationMs,
                            attempt, isRetry: true, error: `Retrying in ${String(delay)}ms`
                        });

                        await sleep(delay);
                        attempt++;
                        continue;
                    }

                    recordFailure(circuitKey);
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

                recordSuccess(circuitKey);
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

                if ((isTimeout || isNetworkError) && attempt < MAX_RETRIES) {
                    const delay = getJitteredDelay(attempt);

                    telemetry.log({
                        endpoint, method, durationMs: durationMs, attempt, isRetry: true,
                        error: `${isTimeout ? 'Timeout' : 'Network error'}. Retrying in ${String(delay)}ms`
                    });

                    await sleep(delay);
                    attempt++;
                    continue;
                }

                recordFailure(circuitKey);
                const errorMessage = isTimeout ? `Request timed out after ${String(timeoutMs)}ms` : `Connection error`;
                telemetry.log({ endpoint, method, durationMs: durationMs, attempt, error: (error as Error).message || errorMessage });

                throw new GeneralApiError(errorMessage, undefined, error);
            }
        }

        throw new GeneralApiError(`Max retries reached for ${endpoint}`);
    })();

    pendingRequests.set(requestKey, requestPromise);

    // Clean up after completion
    void requestPromise.finally(() => {
        pendingRequests.delete(requestKey);
    });

    return requestPromise;
}
