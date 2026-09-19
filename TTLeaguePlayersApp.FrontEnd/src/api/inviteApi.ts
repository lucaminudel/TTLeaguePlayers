import type {
    CreateInviteRequest,
    Invite,
    TeamPlayersRegistrationsRequest,
    TeamPlayersRegistrationsResponse,
    TeamRegistrationsRequest,
    TeamRegistrationsResponse
} from '../types/invite';
import { apiFetch } from './api';
import { getConfig } from '../config/environment';
import { invalidateCacheByPrefix } from '../utils/CacheUtils';
import { INVITE_CACHE_PREFIX } from './cachedInviteApi';

/**
 * Pure API functions for invite endpoints
 */
export const inviteApi = {
    /**
     * Fetch an invite by its nano_id
     * GET /invites/{nano_id}
     */
    async getInvite(nanoId: string, timeoutMs?: number, maxRetries?: number): Promise<Invite> {
        const baseUrl = getConfig().ApiGateWay.ApiBaseUrl;
        const encodedId = encodeURIComponent(nanoId);
        return apiFetch<Invite>(baseUrl, `/invites/${encodedId}`, {}, timeoutMs, maxRetries);
    },

    /**
     * Create a new invite
     * POST /invites
     */
    async createInvite(request: CreateInviteRequest): Promise<Invite> {
        const baseUrl = getConfig().ApiGateWay.ApiBaseUrl;
        const invite = await apiFetch<Invite>(baseUrl, '/invites', {
            method: 'POST',
            body: JSON.stringify(request),
        });

        invalidateCacheByPrefix(INVITE_CACHE_PREFIX);

        return invite;
    },

    /**
     * Accept an invite
     * PATCH /invites/{nano_id}
     */
    async acceptInvite(nanoId: string, acceptedAt: number): Promise<Invite> {
        const baseUrl = getConfig().ApiGateWay.ApiBaseUrl;
        const encodedId = encodeURIComponent(nanoId);
        const invite = await apiFetch<Invite>(baseUrl, `/invites/${encodedId}`, {
            method: 'PATCH',
            body: JSON.stringify({ accepted_at: acceptedAt }),
        });

        // Accepting flips a team from PENDING to ACCEPTED, so the cached registrations are now wrong
        // in the same way a new invite makes them wrong.
        invalidateCacheByPrefix(INVITE_CACHE_PREFIX);

        return invite;
    },

    /**
     * Registration status for a club's teams in one league and season.
     * POST /invites/registrations/club-teams
     */
    async getTeamRegistrations(request: TeamRegistrationsRequest): Promise<TeamRegistrationsResponse> {
        const baseUrl = getConfig().ApiGateWay.ApiBaseUrl;
        return apiFetch<TeamRegistrationsResponse>(baseUrl, '/invites/registrations/club-teams', {
            method: 'POST',
            body: JSON.stringify(request),
        });
    },

    /**
     * Registration status of one team's players in one league and season — a full outer join of the
     * requested names and the team's invites (see TeamPlayersRegistrationsResponse).
     * POST /invites/registrations/team-players
     */
    async getTeamPlayersRegistrations(request: TeamPlayersRegistrationsRequest): Promise<TeamPlayersRegistrationsResponse> {
        const baseUrl = getConfig().ApiGateWay.ApiBaseUrl;
        return apiFetch<TeamPlayersRegistrationsResponse>(baseUrl, '/invites/registrations/team-players', {
            method: 'POST',
            body: JSON.stringify(request),
        });
    }
};
