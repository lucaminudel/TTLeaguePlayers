/**
 * Enum for user roles within an invite
 */
/**
 * User roles within an invite
 */
export const Role = {
    PLAYER: 'PLAYER',
    CAPTAIN: 'CAPTAIN',
    CLUB_MANAGER: 'CLUB_MANAGER'
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export interface BaseInviteRequest {
    invitee_name: string;
    invitee_email_id: string;
    league: string;
    season: string;
    invited_by: string;
}

export interface CaptainOrPlayerInviteRequest extends BaseInviteRequest {
    invitee_role: typeof Role.PLAYER | typeof Role.CAPTAIN;
    invitee_team: string;
    team_division: string;
}

export interface ClubManagerInviteRequest extends BaseInviteRequest {
    invitee_role: typeof Role.CLUB_MANAGER;
    invitee_club: string;
    club_location: string;
}

export type CreateInviteRequest = CaptainOrPlayerInviteRequest | ClubManagerInviteRequest;

export interface BaseInvite {
    nano_id: string;
    invitee_name: string;
    invitee_email_id: string;
    league: string;
    season: string;
    invited_by: string;
    created_at: number;
    accepted_at: number | null;
    invitee_already_registered?: boolean;
}

export interface CaptainOrPlayerInvite extends BaseInvite {
    invitee_role: typeof Role.PLAYER | typeof Role.CAPTAIN;
    invitee_team: string;
    team_division: string;
}

export interface ClubManagerInvite extends BaseInvite {
    invitee_role: typeof Role.CLUB_MANAGER;
    invitee_club: string;
    club_location: string;
}

export type Invite = CaptainOrPlayerInvite | ClubManagerInvite;

/**
 * Registration status of a team, as reported by POST /invites/registrations.
 */
export const TeamRegistrationStatus = {
    ACCEPTED: 'ACCEPTED',
    PENDING: 'PENDING',
    NOT_INVITED: 'NOT_INVITED'
} as const;

export type TeamRegistrationStatus = (typeof TeamRegistrationStatus)[keyof typeof TeamRegistrationStatus];

export interface TeamRegistrationsRequest {
    league: string;
    season: string;
    club_name: string;
    club_location: string;
    /**
     * Matched BYTE-EXACTLY against the stored invites — the backend has no case-insensitive
     * comparison. A casing or punctuation difference yields NOT_INVITED with no error.
     */
    team_names: string[];
}

export interface TeamRegistrationEntry {
    /** Echoes the spelling that was SENT, so the caller can join this back to its own team list. */
    team_name: string;
    status: TeamRegistrationStatus;

    /**
     * Always present. A number when ACCEPTED, and explicitly null on both PENDING and NOT_INVITED —
     * so its null does NOT distinguish the two. Branch on `status`, never on field presence.
     */
    accepted_at: number | null;

    /**
     * The four fields below come from the invite record, so they are ABSENT on NOT_INVITED entries.
     *
     * nano_id is the invite's capability token: whoever holds it can view, accept or delete the
     * invite through the unauthenticated /invites/{nano_id} routes.
     */
    nano_id?: string;
    invitee_name?: string;
    invitee_email_id?: string;
    created_at?: number;
}

export interface TeamRegistrationsResponse {
    league: string;
    season: string;
    club_name: string;
    club_location: string;
    /** One entry per REQUESTED team, in the order they were sent. A left join, not a filter. */
    teams: TeamRegistrationEntry[];
}
