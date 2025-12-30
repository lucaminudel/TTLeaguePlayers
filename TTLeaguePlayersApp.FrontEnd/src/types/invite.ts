/**
 * Enum for user roles within an invite
 */
/**
 * User roles within an invite
 */
export const Role = {
    PLAYER: 'PLAYER',
    CAPTAIN: 'CAPTAIN'
} as const;

export type Role = (typeof Role)[keyof typeof Role];

/**
 * Request payload for creating a new invite
 */
export interface CreateInviteRequest {
    invitee_name: string;
    invitee_email_id: string;
    invitee_role: Role;
    invitee_team: string;
    team_division: string;
    league: string;
    season: string;
    invited_by: string;
}

/**
 * Response object representing an invite
 */
export interface Invite {
    nano_id: string;
    invitee_name: string;
    invitee_email_id: string;
    invitee_role: Role;
    invitee_team: string;
    team_division: string;
    league: string;
    season: string;
    invited_by: string;
    created_at: number; // Unix timestamp in seconds
    accepted_at: number | null; // Unix timestamp in seconds or null if not yet accepted
}
