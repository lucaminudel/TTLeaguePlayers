import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendFrontendEvent } from '../../../src/api/frontendEventsApi';
import { setAuthTokenProvider } from '../../../src/api/api';
import { getConfig, type EnvironmentConfig } from '../../../src/config/environment';
import type { FrontendDiagnostic } from '../../../src/types/frontendDiagnostic';

vi.mock('../../../src/config/environment', () => ({ getConfig: vi.fn() }));

const token = 'test-token';
const diagnostic: FrontendDiagnostic = {
  event_category: 'FRONTEND_API_CALL_ERROR',
  client_api_type: 'TT365',
  timestamp: '2026-10-27T20:51:26Z',
  operation: 'getTeamPlayers',
  request: { method: 'GET', url: 'https://example.test/players' },
  response: { status: 503, body: 'upstream response' },
};

function response(status: number): Response {
  return new Response(null, { status });
}

describe('sendFrontendEvent', () => {
  beforeEach(() => {
    vi.mocked(getConfig).mockReturnValue({ ApiGateWay: { ApiBaseUrl: 'https://api.example.test' } } as EnvironmentConfig);
    setAuthTokenProvider(() => Promise.resolve(token));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends the diagnostic with the existing authorization provider', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(204));
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendFrontendEvent(diagnostic)).resolves.toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/frontend-events', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(diagnostic),
    }));
  });

  it('reports a failed delivery without throwing or retrying', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network failure'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(sendFrontendEvent(diagnostic)).resolves.toEqual({ success: false });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([401, 503])('does not retry HTTP %i and returns the status', async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(response(status));
    const tokenProvider = vi.fn().mockResolvedValue(token);
    setAuthTokenProvider(tokenProvider);
    vi.stubGlobal('fetch', fetchMock);
    await expect(sendFrontendEvent(diagnostic)).resolves.toEqual({ success: false, status });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(tokenProvider).toHaveBeenCalledTimes(status === 401 ? 2 : 1);
  });

  it('times out while waiting for the token and passes an aborted signal to fetch', async () => {
    vi.useFakeTimers();
    let resolveToken!: (token: string) => void;
    setAuthTokenProvider(() => new Promise(resolve => { resolveToken = resolve; }));
    const fetchMock = vi.fn((_url: string, options: RequestInit) => {
      if (options.signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
      return Promise.resolve(response(204));
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = sendFrontendEvent(diagnostic);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(result).resolves.toEqual({ success: false });
    resolveToken(token);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(true);
  });
});
