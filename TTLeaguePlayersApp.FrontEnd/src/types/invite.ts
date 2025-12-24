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
    name: string;
    email_ID: string;
    role: Role;
    team_name: string;
    division: string;
    league: string;
    season: string;
}

/**
 * Response object representing an invite
 */
export interface Invite {
    nano_id: string;
    name: string;
    email_ID: string;
    role: Role;
    team_name: string;
    division: string;
    league: string;
    season: string;
    created_at: number; // Unix timestamp in milliseconds
    accepted_at: number | null; // Unix timestamp in milliseconds or null if not yet accepted
}
