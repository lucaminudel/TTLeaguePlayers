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
