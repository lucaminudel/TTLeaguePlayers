/**
 * Read access to one team's data for a league's season, for the player/captain flows.
 *
 * Bound to a division and a team (from the user's custom:active_seasons) in the
 * implementation's constructor. Club-side capabilities belong to ManagedClubProcessor,
 * which is bound to a club instead.
 */
export interface Fixture {
    startDateTime: Date;
    venue: string;
    googleMapsUrl: string | null;
    homeTeam: string;
    awayTeam: string;
}

export interface ActiveSeasonProcessor {
    // Cache decorators notify this optional callback after a successful stale refresh.
    getTeamFixtures(onDataUpdate?: (data: Fixture[]) => void): Promise<Fixture[]>;

    getTeamPlayers(onDataUpdate?: (data: string[]) => void): Promise<string[]>;
}
