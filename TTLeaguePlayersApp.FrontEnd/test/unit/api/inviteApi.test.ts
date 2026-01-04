import { describe, it, expect, vi, beforeEach } from 'vitest';
import { inviteApi } from '../../../src/api/inviteApi';
import { apiFetch } from '../../../src/api/api';
import { getConfig, type EnvironmentConfig } from '../../../src/config/environment';
import { type CreateInviteRequest, Role } from '../../../src/types/invite';

// Mock dependencies
vi.mock('../../../src/api/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('../../../src/config/environment', () => ({
  getConfig: vi.fn(),
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
});
