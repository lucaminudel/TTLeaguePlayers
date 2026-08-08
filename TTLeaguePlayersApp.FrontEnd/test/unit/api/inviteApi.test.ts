import { describe, it, expect, vi, beforeEach } from 'vitest';
import { inviteApi } from '../../../src/api/inviteApi';
import { apiFetch } from '../../../src/api/api';
import { getConfig, type EnvironmentConfig } from '../../../src/config/environment';
import {
  type CreateInviteRequest,
  type TeamRegistrationsRequest,
  type TeamRegistrationsResponse,
  Role,
} from '../../../src/types/invite';
import { invalidateCacheByPrefix } from '../../../src/utils/CacheUtils';
import { INVITE_CACHE_PREFIX } from '../../../src/api/cachedInviteApi';

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

describe('inviteApi', () => {
  const mockConfig = {
    ApiGateWay: {
      ApiBaseUrl: 'https://api.example.com',
    },
  } as unknown as EnvironmentConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getConfig).mockReturnValue(mockConfig);
  });

  describe('getInvite', () => {
    it('should call apiFetch with correct URL', async () => {
      const nanoId = 'test-id';
      const expectedUrl = 'https://api.example.com';
      const expectedEndpoint = '/invites/test-id';

      const mockInvite = { id: 'test-id', inviter: 'Luca' };
      vi.mocked(apiFetch).mockResolvedValue(mockInvite);

      const result = await inviteApi.getInvite(nanoId);

      expect(getConfig).toHaveBeenCalled();
      expect(apiFetch).toHaveBeenCalledWith(
        expectedUrl,
        expectedEndpoint,
        expect.objectContaining({}),
        undefined,
        undefined
      );
      expect(result).toEqual(mockInvite);
    });

    it('should encode nanoId', async () => {
      const nanoId = 'id/with/slash';
      await inviteApi.getInvite(nanoId);

      expect(apiFetch).toHaveBeenCalledWith(
        expect.anything(),
        '/invites/id%2Fwith%2Fslash',
        expect.anything(),
        undefined,
        undefined
      );
    });
  });

  describe('createInvite', () => {
    it('should post data to /invites', async () => {
      const request: CreateInviteRequest = {
        invitee_name: 'Test User',
        invitee_email_id: 'test@example.com',
        invitee_role: Role.PLAYER,
        invitee_team: 'Test Team',
        team_division: 'Division 1',
        league: 'League A',
        season: '2024',
        invited_by: 'Luca'
      };
      const mockResponse = { id: 'new-id' };
      vi.mocked(apiFetch).mockResolvedValue(mockResponse);

      await inviteApi.createInvite(request);

      expect(apiFetch).toHaveBeenCalledWith(
        'https://api.example.com',
        '/invites',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
        })
      );
    });
  });

  describe('acceptInvite', () => {
    it('should patch data to /invites/{nanoId}', async () => {
      const nanoId = 'test-id';
      const acceptedAt = 1234567890;
      const mockResponse = { id: 'test-id', accepted_at: acceptedAt };
      vi.mocked(apiFetch).mockResolvedValue(mockResponse);

      await inviteApi.acceptInvite(nanoId, acceptedAt);

      expect(apiFetch).toHaveBeenCalledWith(
        'https://api.example.com',
        '/invites/test-id',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ accepted_at: acceptedAt }),
        })
      );
    });
  });

  describe('createInvite (club manager)', () => {
    it('should post club manager data to /invites', async () => {
      const request: CreateInviteRequest = {
        invitee_name: 'Club Manager',
        invitee_email_id: 'manager@example.com',
        invitee_role: Role.CLUB_MANAGER,
        invitee_club: 'London TTC',
        club_location: 'London',
        league: 'League A',
        season: '2024',
        invited_by: 'Luca'
      };
      const mockResponse = { id: 'new-id' };
      vi.mocked(apiFetch).mockResolvedValue(mockResponse);

      await inviteApi.createInvite(request);

      expect(apiFetch).toHaveBeenCalledWith(
        'https://api.example.com',
        '/invites',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
        })
      );
    });
  });

  describe('acceptInvite (club manager)', () => {
    it('should patch data to /invites/{nanoId} for club manager invite', async () => {
      const nanoId = 'mgr-id01';
      const acceptedAt = 1234567890;
      const mockResponse = { id: 'mgr-id01', accepted_at: acceptedAt };
      vi.mocked(apiFetch).mockResolvedValue(mockResponse);

      await inviteApi.acceptInvite(nanoId, acceptedAt);

      expect(apiFetch).toHaveBeenCalledWith(
        'https://api.example.com',
        '/invites/mgr-id01',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ accepted_at: acceptedAt }),
        })
      );
    });
  });

  describe('getTeamRegistrations', () => {
    const request: TeamRegistrationsRequest = {
      league: 'CLTTL',
      season: '2025-2026',
      club_name: 'Morpeth Table Tennis Club',
      club_location: 'London',
      team_names: ['Morpeth 9', "St Katharine's Trust 2"],
    };

    it('should POST to /invites/registrations', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ teams: [] });

      await inviteApi.getTeamRegistrations(request);

      expect(apiFetch).toHaveBeenCalledWith(
        'https://api.example.com',
        '/invites/registrations',
        expect.objectContaining({ method: 'POST' })
      );
    });

    // The team list travels in the BODY, never in the URL. These names contain a space and an
    // apostrophe, which is the reason the endpoint is a POST at all.
    it('should send the whole request in the body, spaces and apostrophes intact', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ teams: [] });

      await inviteApi.getTeamRegistrations(request);

      expect(apiFetch).toHaveBeenCalledWith(
        'https://api.example.com',
        '/invites/registrations',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
        })
      );
    });

    it('should not put team names in the path', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ teams: [] });

      await inviteApi.getTeamRegistrations(request);

      const [, path] = vi.mocked(apiFetch).mock.calls[0];
      expect(path).toBe('/invites/registrations');
      expect(path).not.toContain('Morpeth');
      expect(path).not.toContain('Katharine');
    });

    it('should return the response unchanged', async () => {
      const response: TeamRegistrationsResponse = {
        league: 'CLTTL',
        season: '2025-2026',
        club_name: 'Morpeth Table Tennis Club',
        club_location: 'London',
        teams: [
          { team_name: 'Morpeth 9', status: 'ACCEPTED', accepted_at: 1786000000, nano_id: 'abcd1234' },
          { team_name: 'Morpeth 10', status: 'PENDING', accepted_at: null, nano_id: 'efgh5678' },
          { team_name: 'Morpeth 11', status: 'NOT_INVITED', accepted_at: null },
        ],
      };
      vi.mocked(apiFetch).mockResolvedValue(response);

      const result = await inviteApi.getTeamRegistrations(request);

      expect(result).toEqual(response);
      // NOT_INVITED entries carry accepted_at: null and no nano_id.
      expect(result.teams[2].accepted_at).toBeNull();
      expect(result.teams[2].nano_id).toBeUndefined();
    });

    it('should not invalidate the cache — it is a read', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ teams: [] });

      await inviteApi.getTeamRegistrations(request);

      expect(invalidateCacheByPrefix).not.toHaveBeenCalled();
    });
  });

  // A new or accepted invite changes what getTeamRegistrations would return, and that answer is
  // cached for a day. Without invalidation a manager who has just invited a captain keeps being told
  // the team is NOT_INVITED.
  describe('cache invalidation', () => {
    it('should invalidate the invite cache after creating an invite', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ nano_id: 'abcd1234' });

      const request: CreateInviteRequest = {
        invitee_name: 'Test Captain',
        invitee_email_id: 'captain@example.com',
        invitee_role: Role.CAPTAIN,
        invitee_team: 'Morpeth 9',
        team_division: 'Division 4',
        league: 'CLTTL',
        season: '2025-2026',
        invited_by: 'Test',
      };

      await inviteApi.createInvite(request);

      expect(invalidateCacheByPrefix).toHaveBeenCalledWith(INVITE_CACHE_PREFIX);
    });

    it('should invalidate the invite cache after accepting an invite', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ nano_id: 'abcd1234', accepted_at: 1786000000 });

      await inviteApi.acceptInvite('abcd1234', 1786000000);

      expect(invalidateCacheByPrefix).toHaveBeenCalledWith(INVITE_CACHE_PREFIX);
    });

    it('should not invalidate the cache when reading a single invite', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ nano_id: 'abcd1234' });

      await inviteApi.getInvite('abcd1234');

      expect(invalidateCacheByPrefix).not.toHaveBeenCalled();
    });
  });
});
