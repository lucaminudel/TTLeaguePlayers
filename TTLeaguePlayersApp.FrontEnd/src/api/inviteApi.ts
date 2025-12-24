import type { CreateInviteRequest, Invite } from '../types/invite';
import { apiFetch } from './api';
import { API_BASE_URL } from '../config/environment';

/**
 * Pure API functions for invite endpoints
 */
export const inviteApi = {
    /**
     * Fetch an invite by its nano_id
     * GET /invites/{nano_id}
     */
    async getInvite(nanoId: string): Promise<Invite> {
        const encodedId = encodeURIComponent(nanoId);
        return apiFetch<Invite>(API_BASE_URL, `/invites/${encodedId}`);
    },

    /**
     * Create a new invite
     * POST /invites
     */
    async createInvite(request: CreateInviteRequest): Promise<Invite> {
        return apiFetch<Invite>(API_BASE_URL, '/invites', {
            method: 'POST',
            body: JSON.stringify(request),
        });
    }
};
