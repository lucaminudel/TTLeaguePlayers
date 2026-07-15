import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clubsApi } from '../../../src/api/clubsApi';
import { apiFetch, GeneralApiError } from '../../../src/api/api';
import { getConfig, type EnvironmentConfig } from '../../../src/config/environment';

vi.mock('../../../src/api/api', () => ({
  apiFetch: vi.fn(),
  GeneralApiError: class extends Error {
    public status?: number;
    public response?: unknown;
    constructor(message: string, status?: number, response?: unknown) {
      super(message);
      this.status = status;
      this.response = response;
      this.name = 'ApiError';
    }
  },
}));

vi.mock('../../../src/config/environment', () => ({
  getConfig: vi.fn(),
}));

describe('clubsApi', () => {
  const mockConfig = {
    ApiGateWay: {
      ApiBaseUrl: 'https://api.example.com',
    },
  } as unknown as EnvironmentConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getConfig).mockReturnValue(mockConfig);
  });

  it('loads a club by location and club name from the specific club endpoint', async () => {
    const club = {
      location: 'London',
      club_name: 'London TTC',
      homepage: 'https://london.example.com',
      instagram: 'https://www.instagram.com/londonttc',
      facebook: 'https://www.facebook.com/londonttc',
      youtube: 'https://www.youtube.com/@londonttc',
      tournaments: [],
    };

    vi.mocked(apiFetch).mockResolvedValue(club);

    const result = await clubsApi.getClub('London', 'London TTC');

    expect(apiFetch).toHaveBeenCalledWith(
      'https://api.example.com',
      '/clubs/London/London%20TTC',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result).toEqual(club);
  });

  it('returns null when club is not found (404)', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new GeneralApiError('Not found', 404));

    const result = await clubsApi.getClub('London', 'London TTC');

    expect(result).toBeNull();
  });

  it('upserts a club using the location and club name path', async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);

    await clubsApi.upsertClub('London', 'London TTC', {
      homepage: 'https://london.example.com',
      instagram: 'https://www.instagram.com/londonttc',
      facebook: 'https://www.facebook.com/londonttc',
      youtube: 'https://www.youtube.com/@londonttc',
    });

    expect(apiFetch).toHaveBeenCalledWith(
      'https://api.example.com',
      '/clubs/London/London%20TTC',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          homepage: 'https://london.example.com',
          instagram: 'https://www.instagram.com/londonttc',
          facebook: 'https://www.facebook.com/londonttc',
          youtube: 'https://www.youtube.com/@londonttc',
        }),
      })
    );
  });

  it('upserts a club with only the required homepage field, excluding absent optional fields from the payload', async () => {
    let capturedOptions: RequestInit | undefined;
    vi.mocked(apiFetch).mockImplementation((_baseUrl, _endpoint, options) => {
      capturedOptions = options;
      return Promise.resolve(undefined);
    });

    await clubsApi.upsertClub('London', 'London TTC', {
      homepage: 'https://london.example.com',
    });

    const calledBody = JSON.parse(capturedOptions?.body as string) as Record<string, unknown>;
    expect(calledBody).toEqual({ homepage: 'https://london.example.com' });
    expect(calledBody).not.toHaveProperty('instagram');
    expect(calledBody).not.toHaveProperty('facebook');
    expect(calledBody).not.toHaveProperty('youtube');
  });

  it('upserts a club with partial optional fields, excluding absent ones from the payload', async () => {
    let capturedOptions: RequestInit | undefined;
    vi.mocked(apiFetch).mockImplementation((_baseUrl, _endpoint, options) => {
      capturedOptions = options;
      return Promise.resolve(undefined);
    });

    await clubsApi.upsertClub('London', 'London TTC', {
      homepage: 'https://london.example.com',
      instagram: 'https://www.instagram.com/londonttc',
    });

    const calledBody = JSON.parse(capturedOptions?.body as string) as Record<string, unknown>;
    expect(calledBody).toEqual({
      homepage: 'https://london.example.com',
      instagram: 'https://www.instagram.com/londonttc',
    });
    expect(calledBody).not.toHaveProperty('facebook');
    expect(calledBody).not.toHaveProperty('youtube');
  });

  it('re-throws non-404 GeneralApiError from getClub', async () => {
    const serverError = new GeneralApiError('Internal server error', 500);
    vi.mocked(apiFetch).mockRejectedValue(serverError);

    await expect(clubsApi.getClub('London', 'London TTC')).rejects.toThrow(serverError);
  });

  it('re-throws non-GeneralApiError errors from getClub', async () => {
    const networkError = new Error('Network failure');
    vi.mocked(apiFetch).mockRejectedValue(networkError);

    await expect(clubsApi.getClub('London', 'London TTC')).rejects.toThrow(networkError);
  });

  it('propagates errors from upsertClub', async () => {
    const serverError = new GeneralApiError('Internal server error', 500);
    vi.mocked(apiFetch).mockRejectedValue(serverError);

    await expect(
      clubsApi.upsertClub('London', 'London TTC', { homepage: 'https://london.example.com' })
    ).rejects.toThrow(serverError);
  });

  it('propagates errors from deleteClub', async () => {
    const serverError = new GeneralApiError('Internal server error', 500);
    vi.mocked(apiFetch).mockRejectedValue(serverError);

    await expect(clubsApi.deleteClub('London', 'London TTC')).rejects.toThrow(serverError);
  });

  it('deletes a club using the location and club name path', async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);

    await clubsApi.deleteClub('London', 'London TTC');

    expect(apiFetch).toHaveBeenCalledWith(
      'https://api.example.com',
      '/clubs/London/London%20TTC',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('deleteClub resolves with no return value', async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);

    await expect(clubsApi.deleteClub('London', 'London TTC')).resolves.toBeUndefined();
  });

  it('encodes special characters in location and club name for getClub', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      location: 'San Francisco',
      club_name: 'SF/TT Club',
      homepage: 'https://sf.example.com',
      tournaments: [],
    });

    await clubsApi.getClub('San Francisco', 'SF/TT Club');

    expect(apiFetch).toHaveBeenCalledWith(
      'https://api.example.com',
      '/clubs/San%20Francisco/SF%2FTT%20Club',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('encodes special characters in location and club name for upsertClub', async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);

    await clubsApi.upsertClub('San Francisco', 'SF/TT Club', {
      homepage: 'https://sf.example.com',
    });

    expect(apiFetch).toHaveBeenCalledWith(
      'https://api.example.com',
      '/clubs/San%20Francisco/SF%2FTT%20Club',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ homepage: 'https://sf.example.com' }),
      })
    );
  });

  it('encodes special characters in location and club name for deleteClub', async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);

    await clubsApi.deleteClub('San Francisco', 'SF/TT Club');

    expect(apiFetch).toHaveBeenCalledWith(
      'https://api.example.com',
      '/clubs/San%20Francisco/SF%2FTT%20Club',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
