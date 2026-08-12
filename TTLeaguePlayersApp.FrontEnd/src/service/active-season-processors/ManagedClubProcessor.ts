/**
 * Read access to a club's data for a league's season, for the club-manager flows.
 *
 * Kept separate from ActiveSeasonProcessor because the two are bound to different things:
 * ActiveSeasonProcessor needs a division and a team (from the user's custom:active_seasons),
 * while a club manager has only a club (from custom:managed_clubs). The club is bound in the
 * implementation's constructor, as division and team are for ActiveSeasonProcessor.
 */
import type { ClubTeamWithDivision } from '../../types/clubTeam';

export interface ManagedClubProcessor {
    getClubTeams(): Promise<ClubTeamWithDivision[]>;
}
