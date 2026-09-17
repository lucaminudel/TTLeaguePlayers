/**
 * Read access to one team's data for a league's season, for the player/captain flows.
 *
 * Bound to a division and a team (from the user's custom:active_seasons) in the
 * implementation's constructor. Club-side capabilities belong to ManagedClubProcessor,
 * which is bound to a club instead.
 */
import type { Fixture } from './clttl-2025/CLTTLActiveSeason2025PagesParser';

export interface ActiveSeasonProcessor {    
    getTeamFixtures(): Promise<Fixture[]>;

    getTeamPlayers(): Promise<string[]>;
}
