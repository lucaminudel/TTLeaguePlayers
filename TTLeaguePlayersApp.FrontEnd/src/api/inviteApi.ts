import type { CreateInviteRequest, Invite } from '../types/invite';
import { apiFetch } from './api';
import { loadConfig } from '../config/environment';

/**
 * Pure API functions for invite endpoints
 */
export const inviteApi = {
    /**
     * Fetch an invite by its nano_id
     * GET /invites/{nano_id}
     */
    async getInvite(nanoId: string, timeoutMs?: number, maxRetries?: number): Promise<Invite> {
        const config = await loadConfig();
        const baseUrl = config.ApiGateWay.ApiBaseUrl;
        const encodedId = encodeURIComponent(nanoId);
        return apiFetch<Invite>(baseUrl, `/invites/${encodedId}`, {}, timeoutMs, maxRetries);
    },

    /**
     * Create a new invite
     * POST /invites
     */
    async createInvite(request: CreateInviteRequest): Promise<Invite> {
        const config = await loadConfig();
        const baseUrl = config.ApiGateWay.ApiBaseUrl;
        return apiFetch<Invite>(baseUrl, '/invites', {
            method: 'POST',
            body: JSON.stringify(request),
        });
    }
};
