export interface TestInvite {
    nano_id: string;
    invitee_name: string;
    invitee_email_id: string;
    invitee_role: string;
    invitee_team?: string;
    team_division?: string;
    league?: string;
    season?: string;
    invited_by: string;
    accepted_at: number | null;
    invitee_already_registered?: boolean;
    invitee_club?: string;
    club_location?: string;
    [key: string]: unknown;
}

export class TestInviteBuilder {
    private invite: TestInvite;

    constructor(nanoId = 'test-invite-123') {
        // Set up a standard baseline valid invite
        this.invite = {
            nano_id: nanoId,
            invitee_name: 'John Doe',
            invitee_email_id: 'john@example.com',
            invitee_role: 'PLAYER',
            invitee_team: 'The Smashers',
            team_division: 'Premier',
            league: 'Local League',
            season: 'Winter 2024',
            invited_by: 'Luca',
            accepted_at: null
        };
    }

    withEmail(email: string) {
        this.invite.invitee_email_id = email;
        return this;
    }

    withName(name: string) {
        this.invite.invitee_name = name;
        return this;
    }

    withRole(role: string) {
        this.invite.invitee_role = role;
        return this;
    }

    withTeam(team: string, division: string) {
        this.invite.invitee_team = team;
        this.invite.team_division = division;
        return this;
    }

    withLeague(league: string) {
        this.invite.league = league;
        return this;
    }

    withSeason(season: string) {
        this.invite.season = season;
        return this;
    }

    asClubManager(club = 'Morpeth TTC', location = 'London') {
        this.invite.invitee_role = 'CLUB_MANAGER';
        this.invite.invitee_club = club;
        this.invite.club_location = location;
        
        // Remove team-specific properties to ensure payload accuracy
        delete this.invite.invitee_team;
        delete this.invite.team_division;
        
        return this;
    }

    asAccepted(timestamp = 1735776000) {
        this.invite.accepted_at = timestamp;
        return this;
    }

    withAlreadyRegistered(isRegistered = true) {
        this.invite.invitee_already_registered = isRegistered;
        return this;
    }

    build(): TestInvite {
        return { ...this.invite };
    }
}

