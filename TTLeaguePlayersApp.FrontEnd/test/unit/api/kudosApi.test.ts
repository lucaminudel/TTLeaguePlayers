import { describe, it, expect, vi, beforeEach } from 'vitest';
import { awardKudos, getKudos, getTeamKudos, getKudosStandings, type KudosRequest, type GetKudosRequest, type GetTeamKudosRequest, type GetKudosStandingsRequest } from '../../../src/api/kudosApi';
import { apiFetch } from '../../../src/api/api';
import { getConfig, type EnvironmentConfig } from '../../../src/config/environment';
import { invalidateCacheByPrefix } from '../../../src/utils/CacheUtils';

// Mock dependencies
vi.mock('../../../src/api/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('../../../src/config/environment', () => ({
  getConfig: vi.fn(),
}));

vi.mock('../../../src/utils/CacheUtils', () => ({
  invalidateCacheByPrefix: vi.fn(),
}));

describe('kudosApi', () => {
  const mockConfig = {
    ApiGateWay: {
      ApiBaseUrl: 'https://api.example.com',
    },
  } as unknown as EnvironmentConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getConfig).mockReturnValue(mockConfig);
  });

  describe('awardKudos', () => {
    it('should post kudos data to /kudos endpoint', async () => {
      const request: KudosRequest = {
        league: 'CLTTL',
        season: '2025-26',
        teamDivision: 'Division 1',
        teamName: 'London TTC',
        personName: 'John Doe',
        giverPersonSub: 'user-sub-123',
        opponentTeam: 'Cambridge TTC',
        matchDateTime: '2025-09-15T19:00:00',
        isHome: true,
        venue: 'London Sports Hall',
        kudosValue: 1,
      };

      const mockResponse = { message: 'Kudos awarded successfully' };
      vi.mocked(apiFetch).mockResolvedValue(mockResponse);

      const result = await awardKudos(request);

      expect(getConfig).toHaveBeenCalled();
      expect(apiFetch).toHaveBeenCalledWith(
        'https://api.example.com',
        '/kudos',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"league":"CLTTL"') as string,
        })
      );
      expect(invalidateCacheByPrefix).toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });

    it('should transform request body correctly for away match', async () => {
      const request: KudosRequest = {
        league: 'CLTTL',
        season: '2025-26',
        teamDivision: 'Division 1',
        teamName: 'London TTC',
        personName: 'John Doe',
        giverPersonSub: 'user-sub-123',
        opponentTeam: 'Cambridge TTC',
        matchDateTime: '2025-09-15T19:00:00',
        isHome: false,
        venue: 'Cambridge Sports Hall',
        kudosValue: 1,
      };

      const mockResponse = { message: 'Kudos awarded successfully' };
      vi.mocked(apiFetch).mockResolvedValue(mockResponse);

      await awardKudos(request);

      const calledBody = JSON.parse(vi.mocked(apiFetch).mock.calls[0][2]?.body as string) as Record<string, unknown>;
      expect(calledBody.home_team).toBe('Cambridge TTC');
      expect(calledBody.away_team).toBe('London TTC');
    });

    it('should convert matchDateTime to Unix timestamp', async () => {
      const request: KudosRequest = {
        league: 'CLTTL',
        season: '2025-26',
        teamDivision: 'Division 1',
        teamName: 'London TTC',
        personName: 'John Doe',
        giverPersonSub: 'user-sub-123',
        opponentTeam: 'Cambridge TTC',
        matchDateTime: '2025-09-15T19:00:00',
        isHome: true,
        venue: 'London Sports Hall',
        kudosValue: 1,
      };

      const mockResponse = { message: 'Kudos awarded successfully' };
      vi.mocked(apiFetch).mockResolvedValue(mockResponse);

      await awardKudos(request);

      const calledBody = JSON.parse(vi.mocked(apiFetch).mock.calls[0][2]?.body as string) as Record<string, unknown>;
      expect(calledBody.match_date_time).toBe(Math.floor(new Date('2025-09-15T19:00:00').getTime() / 1000));
    });

    it('should handle neutral kudos value (0)', async () => {
      const request: KudosRequest = {
        league: 'CLTTL',
        season: '2025-26',
        teamDivision: 'Division 1',
        teamName: 'London TTC',
        personName: 'John Doe',
        giverPersonSub: 'user-sub-123',
        opponentTeam: 'Cambridge TTC',
        matchDateTime: '2025-09-15T19:00:00',
        isHome: true,
        venue: 'London Sports Hall',
        kudosValue: 0,
      };

      const mockResponse = { message: 'Kudos awarded successfully' };
      vi.mocked(apiFetch).mockResolvedValue(mockResponse);

      await awardKudos(request);

      const calledBody = JSON.parse(vi.mocked(apiFetch).mock.calls[0][2]?.body as string) as Record<string, unknown>;
      expect(calledBody.kudos_value).toBe(0);
    });

    it('should handle negative kudos value (-1)', async () => {
      const request: KudosRequest = {
        league: 'CLTTL',
        season: '2025-26',
        teamDivision: 'Division 1',
        teamName: 'London TTC',
        personName: 'John Doe',
        giverPersonSub: 'user-sub-123',
        opponentTeam: 'Cambridge TTC',
        matchDateTime: '2025-09-15T19:00:00',
        isHome: true,
        venue: 'London Sports Hall',
        kudosValue: -1,
      };

      const mockResponse = { message: 'Kudos awarded successfully' };
      vi.mocked(apiFetch).mockResolvedValue(mockResponse);

      await awardKudos(request);

      const calledBody = JSON.parse(vi.mocked(apiFetch).mock.calls[0][2]?.body as string) as Record<string, unknown>;
      expect(calledBody.kudos_value).toBe(-1);
    });

    it('should invalidate cache on successful kudos award', async () => {
      const request: KudosRequest = {
        league: 'CLTTL',
        season: '2025-26',
        teamDivision: 'Division 1',
        teamName: 'London TTC',
        personName: 'John Doe',
        giverPersonSub: 'user-sub-123',
        opponentTeam: 'Cambridge TTC',
        matchDateTime: '2025-09-15T19:00:00',
        isHome: true,
        venue: 'London Sports Hall',
        kudosValue: 1,
      };

      const mockResponse = { message: 'Kudos awarded successfully' };
      vi.mocked(apiFetch).mockResolvedValue(mockResponse);

      await awardKudos(request);

      expect(invalidateCacheByPrefix).toHaveBeenCalled();
    });
  });

  describe('getKudos', () => {
    it('should call apiFetch with correct URL and query parameters', async () => {
      const request: GetKudosRequest = {
        league: 'CLTTL',
        season: '2025-26',
        teamDivision: 'Division 1',
        teamName: 'London TTC',
        giverPersonSub: 'user-sub-123',
      };

      const mockKudos = [
        {
          league: 'CLTTL',
          season: '2025-26',
          division: 'Division 1',
          receiving_team: 'Cambridge TTC',
          home_team: 'London TTC',
          away_team: 'Cambridge TTC',
          match_date_time: 1757940000,
          giver_team: 'London TTC',
          giver_person_name: 'John Doe',
          giver_person_sub: 'user-sub-123',
          kudos_value: 1,
        },
      ];
      vi.mocked(apiFetch).mockResolvedValue(mockKudos);

      const result = await getKudos(request);

      expect(getConfig).toHaveBeenCalled();
      expect(apiFetch).toHaveBeenCalledWith(
        'https://api.example.com',
        expect.stringContaining('/kudos?'),
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual(mockKudos);
    });

    it('should include giver_person_sub in query params when provided', async () => {
      const request: GetKudosRequest = {
        league: 'CLTTL',
        season: '2025-26',
        teamDivision: 'Division 1',
        teamName: 'London TTC',
        giverPersonSub: 'user-sub-123',
      };

      vi.mocked(apiFetch).mockResolvedValue([]);

      await getKudos(request);

      const calledUrl = vi.mocked(apiFetch).mock.calls[0][1];
      expect(calledUrl).toContain('given_by=user-sub-123');
    });

    it('should include giver_person_name in query params when provided', async () => {
      const request: GetKudosRequest = {
        league: 'CLTTL',
        season: '2025-26',
        teamDivision: 'Division 1',
        teamName: 'London TTC',
        giver_person_name: 'John Doe',
      };

      vi.mocked(apiFetch).mockResolvedValue([]);

      await getKudos(request);

      const calledUrl = vi.mocked(apiFetch).mock.calls[0][1];
      expect(calledUrl).toContain('giver_person_name=John+Doe');
    });

    it('should work without optional giver parameters', async () => {
      const request: GetKudosRequest = {
        league: 'CLTTL',
        season: '2025-26',
        teamDivision: 'Division 1',
        teamName: 'London TTC',
      };

      vi.mocked(apiFetch).mockResolvedValue([]);

      await getKudos(request);

      const calledUrl = vi.mocked(apiFetch).mock.calls[0][1];
      expect(calledUrl).toContain('league=CLTTL');
      expect(calledUrl).toContain('season=2025-26');
      expect(calledUrl).toContain('team_division=Division+1');
      expect(calledUrl).toContain('team_name=London+TTC');
      expect(calledUrl).not.toContain('given_by=');
      expect(calledUrl).not.toContain('giver_person_name=');
    });

    it('should encode special characters in query parameters', async () => {
      const request: GetKudosRequest = {
        league: 'CLTTL',
        season: '2025-26',
        teamDivision: 'Division 1',
        teamName: 'London TTC',
        giver_person_name: 'John/O Doe',
      };

      vi.mocked(apiFetch).mockResolvedValue([]);

      await getKudos(request);

      const calledUrl = vi.mocked(apiFetch).mock.calls[0][1];
      expect(calledUrl).toContain('giver_person_name=John%2FO+Doe');
    });
  });

  describe('getTeamKudos', () => {
    it('should call apiFetch with correct URL and query parameters', async () => {
      const request: GetTeamKudosRequest = {
        league: 'CLTTL',
        season: '2025-26',
        teamDivision: 'Division 1',
        teamName: 'London TTC',
      };

      const mockTeamKudos = [
        {
          league: 'CLTTL',
          season: '2025-26',
          division: 'Division 1',
          home_team: 'London TTC',
          away_team: 'Cambridge TTC',
          receiving_team: 'Cambridge TTC',
          match_date_time: 1757940000,
          positive_kudos_count: 3,
          neutral_kudos_count: 1,
          negative_kudos_count: 0,
          item_type: 'match',
        },
      ];
      vi.mocked(apiFetch).mockResolvedValue(mockTeamKudos);

      const result = await getTeamKudos(request);

      expect(getConfig).toHaveBeenCalled();
      expect(apiFetch).toHaveBeenCalledWith(
        'https://api.example.com',
        expect.stringContaining('/kudos?'),
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual(mockTeamKudos);
    });

    it('should include all required query parameters', async () => {
      const request: GetTeamKudosRequest = {
        league: 'CLTTL',
        season: '2025-26',
        teamDivision: 'Division 1',
        teamName: 'London TTC',
      };

      vi.mocked(apiFetch).mockResolvedValue([]);

      await getTeamKudos(request);

      const calledUrl = vi.mocked(apiFetch).mock.calls[0][1];
      expect(calledUrl).toContain('league=CLTTL');
      expect(calledUrl).toContain('season=2025-26');
      expect(calledUrl).toContain('team_division=Division+1');
      expect(calledUrl).toContain('team_name=London+TTC');
    });

    it('should encode special characters in team name', async () => {
      const request: GetTeamKudosRequest = {
        league: 'CLTTL',
        season: '2025-26',
        teamDivision: 'Division 1',
        teamName: 'London/ TTC',
      };

      vi.mocked(apiFetch).mockResolvedValue([]);

      await getTeamKudos(request);

      const calledUrl = vi.mocked(apiFetch).mock.calls[0][1];
      expect(calledUrl).toContain('team_name=London%2F+TTC');
    });
  });

  describe('getKudosStandings', () => {
    it('should call apiFetch with correct URL and query parameters', async () => {
      const request: GetKudosStandingsRequest = {
        league: 'CLTTL',
        season: '2025-26',
        teamDivision: 'Division 1',
      };

      const mockStandings = {
        positive_kudos_table: [
          { team_name: 'Cambridge TTC', count: 5 },
          { team_name: 'London TTC', count: 3 },
        ],
        neutral_kudos_table: [
          { team_name: 'London TTC', count: 2 },
        ],
        negative_kudos_table: [],
      };
      vi.mocked(apiFetch).mockResolvedValue(mockStandings);

      const result = await getKudosStandings(request);

      expect(getConfig).toHaveBeenCalled();
      expect(apiFetch).toHaveBeenCalledWith(
        'https://api.example.com',
        expect.stringContaining('/kudos/standings?'),
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual(mockStandings);
    });

    it('should include all required query parameters', async () => {
      const request: GetKudosStandingsRequest = {
        league: 'CLTTL',
        season: '2025-26',
        teamDivision: 'Division 1',
      };

      vi.mocked(apiFetch).mockResolvedValue({
        positive_kudos_table: [],
        neutral_kudos_table: [],
        negative_kudos_table: [],
      });

      await getKudosStandings(request);

      const calledUrl = vi.mocked(apiFetch).mock.calls[0][1];
      expect(calledUrl).toContain('league=CLTTL');
      expect(calledUrl).toContain('season=2025-26');
      expect(calledUrl).toContain('team_division=Division+1');
    });

    it('should encode special characters in division name', async () => {
      const request: GetKudosStandingsRequest = {
        league: 'CLTTL',
        season: '2025-26',
        teamDivision: 'Division 1/ Premier',
      };

      vi.mocked(apiFetch).mockResolvedValue({
        positive_kudos_table: [],
        neutral_kudos_table: [],
        negative_kudos_table: [],
      });

      await getKudosStandings(request);

      const calledUrl = vi.mocked(apiFetch).mock.calls[0][1];
      expect(calledUrl).toContain('team_division=Division+1%2F+Premier');
    });

    it('should return complete standings with all tables', async () => {
      const request: GetKudosStandingsRequest = {
        league: 'CLTTL',
        season: '2025-26',
        teamDivision: 'Division 1',
      };

      const mockStandings = {
        positive_kudos_table: [
          { team_name: 'Team A', count: 10 },
          { team_name: 'Team B', count: 8 },
        ],
        neutral_kudos_table: [
          { team_name: 'Team C', count: 5 },
        ],
        negative_kudos_table: [
          { team_name: 'Team D', count: 2 },
        ],
      };
      vi.mocked(apiFetch).mockResolvedValue(mockStandings);

      const result = await getKudosStandings(request);

      expect(result.positive_kudos_table).toHaveLength(2);
      expect(result.neutral_kudos_table).toHaveLength(1);
      expect(result.negative_kudos_table).toHaveLength(1);
      expect(result.positive_kudos_table[0].team_name).toBe('Team A');
    });
  });
});
