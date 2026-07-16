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
    let capturedOptions: RequestInit | undefined;
    vi.mocked(apiFetch).mockImplementation((_baseUrl, _endpoint, options) => {
      capturedOptions = options;
      return Promise.resolve(undefined);
    });

    await clubsApi.upsertClub('London', 'London TTC', {
      homepage: 'https://london.example.com',
      instagram: 'https://www.instagram.com/londonttc',
      facebook: 'https://www.facebook.com/londonttc',
      youtube: 'https://www.youtube.com/@londonttc',
    });

    expect(apiFetch).toHaveBeenCalledWith(
      'https://api.example.com',
      '/clubs/London/London%20TTC',
      expect.objectContaining({ method: 'PUT' })
    );

    const calledBody = JSON.parse(capturedOptions?.body as string) as Record<string, unknown>;
    expect(calledBody).toEqual({
      homepage: 'https://london.example.com',
      instagram: 'https://www.instagram.com/londonttc',
      facebook: 'https://www.facebook.com/londonttc',
      youtube: 'https://www.youtube.com/@londonttc',
    });
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

  it('excludes empty string optional fields from upsertClub payload', async () => {
    let capturedOptions: RequestInit | undefined;
    vi.mocked(apiFetch).mockImplementation((_baseUrl, _endpoint, options) => {
      capturedOptions = options;
      return Promise.resolve(undefined);
    });

    // Empty strings are falsy in JS, so they should be excluded like undefined
    await clubsApi.upsertClub('London', 'London TTC', {
      homepage: 'https://london.example.com',
      instagram: '', // empty string should be excluded (falsy)
      facebook: undefined, // undefined should be excluded
      youtube: undefined, // undefined should be excluded
    });

    const calledBody = JSON.parse(capturedOptions?.body as string) as Record<string, unknown>;
    expect(calledBody).toEqual({ homepage: 'https://london.example.com' });
    expect(calledBody).not.toHaveProperty('instagram');
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
      expect.objectContaining({ method: 'PUT' })
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

  describe('Tournament endpoints', () => {
    it('gets all clubs with tournaments', async () => {
      const clubsWithTournaments = [
        {
          location: 'London',
          club_name: 'London TTC',
          homepage: 'https://london.example.com',
          tournaments: [],
        },
      ];

      vi.mocked(apiFetch).mockResolvedValue(clubsWithTournaments);

      const result = await clubsApi.getAllClubsWithTournaments();

      expect(apiFetch).toHaveBeenCalledWith(
        'https://api.example.com',
        '/clubs',
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual(clubsWithTournaments);
    });

    it('gets clubs with tournaments by location', async () => {
      const clubsWithTournaments = [
        {
          location: 'London',
          club_name: 'London TTC',
          homepage: 'https://london.example.com',
          tournaments: [],
        },
      ];

      vi.mocked(apiFetch).mockResolvedValue(clubsWithTournaments);

      const result = await clubsApi.getClubsWithTournamentsByLocation('London');

      expect(apiFetch).toHaveBeenCalledWith(
        'https://api.example.com',
        '/clubs/London',
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual(clubsWithTournaments);
    });

    it('encodes special characters in location for getClubsWithTournamentsByLocation', async () => {
      vi.mocked(apiFetch).mockResolvedValue([]);

      await clubsApi.getClubsWithTournamentsByLocation('San Francisco');

      expect(apiFetch).toHaveBeenCalledWith(
        'https://api.example.com',
        '/clubs/San%20Francisco',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('gets a tournament by location, club name, and tournament name', async () => {
      const tournament = {
        tournament_name: 'Spring Open',
        tournament_info: 'https://tournament.example.com',
        start_date: 1234567890,
        end_date: 1234567900,
      };

      vi.mocked(apiFetch).mockResolvedValue(tournament);

      const result = await clubsApi.getTournament('London', 'London TTC', 'Spring Open');

      expect(apiFetch).toHaveBeenCalledWith(
        'https://api.example.com',
        '/clubs/London/London%20TTC/tournaments/Spring%20Open',
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual(tournament);
    });

    it('returns null when tournament is not found (404)', async () => {
      vi.mocked(apiFetch).mockRejectedValue(new GeneralApiError('Not found', 404));

      const result = await clubsApi.getTournament('London', 'London TTC', 'Spring Open');

      expect(result).toBeNull();
    });

    it('re-throws non-404 GeneralApiError from getTournament', async () => {
      const serverError = new GeneralApiError('Internal server error', 500);
      vi.mocked(apiFetch).mockRejectedValue(serverError);

      await expect(clubsApi.getTournament('London', 'London TTC', 'Spring Open')).rejects.toThrow(serverError);
    });

    it('re-throws non-GeneralApiError errors from getTournament', async () => {
      const networkError = new Error('Network failure');
      vi.mocked(apiFetch).mockRejectedValue(networkError);

      await expect(clubsApi.getTournament('London', 'London TTC', 'Spring Open')).rejects.toThrow(networkError);
    });

    it('encodes special characters in location, club name, and tournament name for getTournament', async () => {
      vi.mocked(apiFetch).mockResolvedValue({
        tournament_name: 'Spring/Summer Open',
        tournament_info: 'https://tournament.example.com',
        start_date: 1234567890,
        end_date: 1234567900,
      });

      await clubsApi.getTournament('San Francisco', 'SF/TT Club', 'Spring/Summer Open');

      expect(apiFetch).toHaveBeenCalledWith(
        'https://api.example.com',
        '/clubs/San%20Francisco/SF%2FTT%20Club/tournaments/Spring%2FSummer%20Open',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('upserts a tournament using the location, club name, and tournament name path', async () => {
      let capturedOptions: RequestInit | undefined;
      vi.mocked(apiFetch).mockImplementation((_baseUrl, _endpoint, options) => {
        capturedOptions = options;
        return Promise.resolve(undefined);
      });

      await clubsApi.upsertTournament('London', 'London TTC', 'Spring Open', {
        tournament_info: 'https://tournament.example.com',
        instagram: 'https://www.instagram.com/springopen',
        facebook: 'https://www.facebook.com/springopen',
        start_date: 1234567890,
        end_date: 1234567900,
      });

      expect(apiFetch).toHaveBeenCalledWith(
        'https://api.example.com',
        '/clubs/London/London%20TTC/tournaments/Spring%20Open',
        expect.objectContaining({ method: 'PUT' })
      );

      const calledBody = JSON.parse(capturedOptions?.body as string) as Record<string, unknown>;
      expect(calledBody).toEqual({
        tournament_info: 'https://tournament.example.com',
        instagram: 'https://www.instagram.com/springopen',
        facebook: 'https://www.facebook.com/springopen',
        start_date: 1234567890,
        end_date: 1234567900,
      });
    });

    it('upserts a tournament with only required fields, excluding absent optional fields from the payload', async () => {
      let capturedOptions: RequestInit | undefined;
      vi.mocked(apiFetch).mockImplementation((_baseUrl, _endpoint, options) => {
        capturedOptions = options;
        return Promise.resolve(undefined);
      });

      await clubsApi.upsertTournament('London', 'London TTC', 'Spring Open', {
        tournament_info: 'https://tournament.example.com',
        start_date: 1234567890,
        end_date: 1234567900,
      });

      const calledBody = JSON.parse(capturedOptions?.body as string) as Record<string, unknown>;
      expect(calledBody).toEqual({
        tournament_info: 'https://tournament.example.com',
        start_date: 1234567890,
        end_date: 1234567900,
      });
      expect(calledBody).not.toHaveProperty('instagram');
      expect(calledBody).not.toHaveProperty('facebook');
    });

    it('upserts a tournament with partial optional fields, excluding absent ones from the payload', async () => {
      let capturedOptions: RequestInit | undefined;
      vi.mocked(apiFetch).mockImplementation((_baseUrl, _endpoint, options) => {
        capturedOptions = options;
        return Promise.resolve(undefined);
      });

      await clubsApi.upsertTournament('London', 'London TTC', 'Spring Open', {
        tournament_info: 'https://tournament.example.com',
        instagram: 'https://www.instagram.com/springopen',
        start_date: 1234567890,
        end_date: 1234567900,
      });

      const calledBody = JSON.parse(capturedOptions?.body as string) as Record<string, unknown>;
      expect(calledBody).toEqual({
        tournament_info: 'https://tournament.example.com',
        instagram: 'https://www.instagram.com/springopen',
        start_date: 1234567890,
        end_date: 1234567900,
      });
      expect(calledBody).not.toHaveProperty('facebook');
    });

    it('encodes special characters in location, club name, and tournament name for upsertTournament', async () => {
      vi.mocked(apiFetch).mockResolvedValue(undefined);

      await clubsApi.upsertTournament('San Francisco', 'SF/TT Club', 'Spring/Summer Open', {
        tournament_info: 'https://tournament.example.com',
        start_date: 1234567890,
        end_date: 1234567900,
      });

      expect(apiFetch).toHaveBeenCalledWith(
        'https://api.example.com',
        '/clubs/San%20Francisco/SF%2FTT%20Club/tournaments/Spring%2FSummer%20Open',
        expect.objectContaining({ method: 'PUT' })
      );
    });

    it('propagates errors from upsertTournament', async () => {
      const serverError = new GeneralApiError('Internal server error', 500);
      vi.mocked(apiFetch).mockRejectedValue(serverError);

      await expect(
        clubsApi.upsertTournament('London', 'London TTC', 'Spring Open', {
          tournament_info: 'https://tournament.example.com',
          start_date: 1234567890,
          end_date: 1234567900,
        })
      ).rejects.toThrow(serverError);
    });

    it('deletes a tournament using the location, club name, and tournament name path', async () => {
      vi.mocked(apiFetch).mockResolvedValue(undefined);

      await clubsApi.deleteTournament('London', 'London TTC', 'Spring Open');

      expect(apiFetch).toHaveBeenCalledWith(
        'https://api.example.com',
        '/clubs/London/London%20TTC/tournaments/Spring%20Open',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('deleteTournament resolves with no return value', async () => {
      vi.mocked(apiFetch).mockResolvedValue(undefined);

      await expect(clubsApi.deleteTournament('London', 'London TTC', 'Spring Open')).resolves.toBeUndefined();
    });

    it('encodes special characters in location, club name, and tournament name for deleteTournament', async () => {
      vi.mocked(apiFetch).mockResolvedValue(undefined);

      await clubsApi.deleteTournament('San Francisco', 'SF/TT Club', 'Spring/Summer Open');

      expect(apiFetch).toHaveBeenCalledWith(
        'https://api.example.com',
        '/clubs/San%20Francisco/SF%2FTT%20Club/tournaments/Spring%2FSummer%20Open',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('propagates errors from deleteTournament', async () => {
      const serverError = new GeneralApiError('Internal server error', 500);
      vi.mocked(apiFetch).mockRejectedValue(serverError);

      await expect(clubsApi.deleteTournament('London', 'London TTC', 'Spring Open')).rejects.toThrow(serverError);
    });

    it('propagates errors from getAllClubsWithTournaments', async () => {
      const serverError = new GeneralApiError('Internal server error', 500);
      vi.mocked(apiFetch).mockRejectedValue(serverError);

      await expect(clubsApi.getAllClubsWithTournaments()).rejects.toThrow(serverError);
    });

    it('propagates errors from getClubsWithTournamentsByLocation', async () => {
      const serverError = new GeneralApiError('Internal server error', 500);
      vi.mocked(apiFetch).mockRejectedValue(serverError);

      await expect(clubsApi.getClubsWithTournamentsByLocation('London')).rejects.toThrow(serverError);
    });

    it('gets all clubs with populated tournaments array', async () => {
      const clubsWithTournaments = [
        {
          location: 'London',
          club_name: 'London TTC',
          homepage: 'https://london.example.com',
          tournaments: [
            {
              tournament_name: 'Spring Open',
              tournament_info: 'https://tournament.example.com',
              start_date: 1234567890,
              end_date: 1234567900,
            },
            {
              tournament_name: 'Summer Championship',
              tournament_info: 'https://summer.example.com',
              instagram: 'https://www.instagram.com/summer',
              start_date: 1234578900,
              end_date: 1234589000,
            },
          ],
        },
      ];

      vi.mocked(apiFetch).mockResolvedValue(clubsWithTournaments);

      const result = await clubsApi.getAllClubsWithTournaments();

      expect(result).toEqual(clubsWithTournaments);
      expect((result as { tournaments: unknown[] }[])[0].tournaments).toHaveLength(2);
    });

    it('upserts a tournament without youtube field (tournaments do not support youtube)', async () => {
      let capturedOptions: RequestInit | undefined;
      vi.mocked(apiFetch).mockImplementation((_baseUrl, _endpoint, options) => {
        capturedOptions = options;
        return Promise.resolve(undefined);
      });

      await clubsApi.upsertTournament('London', 'London TTC', 'Spring Open', {
        tournament_info: 'https://tournament.example.com',
        instagram: 'https://www.instagram.com/springopen',
        facebook: 'https://www.facebook.com/springopen',
        start_date: 1234567890,
        end_date: 1234567900,
      });

      const calledBody = JSON.parse(capturedOptions?.body as string) as Record<string, unknown>;
      // Verify youtube is never included in tournament payloads (domain constraint)
      expect(calledBody).not.toHaveProperty('youtube');
    });

    it('excludes empty string optional fields from upsertTournament payload', async () => {
      let capturedOptions: RequestInit | undefined;
      vi.mocked(apiFetch).mockImplementation((_baseUrl, _endpoint, options) => {
        capturedOptions = options;
        return Promise.resolve(undefined);
      });

      // Empty strings are falsy in JS, so they should be excluded like undefined
      await clubsApi.upsertTournament('London', 'London TTC', 'Spring Open', {
        tournament_info: 'https://tournament.example.com',
        instagram: '', // empty string should be excluded (falsy)
        facebook: undefined, // undefined should be excluded
        start_date: 1234567890,
        end_date: 1234567900,
      });

      const calledBody = JSON.parse(capturedOptions?.body as string) as Record<string, unknown>;
      expect(calledBody).toEqual({
        tournament_info: 'https://tournament.example.com',
        start_date: 1234567890,
        end_date: 1234567900,
      });
      expect(calledBody).not.toHaveProperty('instagram');
      expect(calledBody).not.toHaveProperty('facebook');
    });
  });
});
