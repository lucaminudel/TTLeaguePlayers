/**
 * Helpers shared by the three club-manager pages — PromoteMyClub, PromoteMyTournaments and
 * MyClubTeams.
 *
 * They live here rather than in `src/hooks/` because none of them needs React: the selection below
 * is a pure function of (managed clubs, config, now), and putting it behind a hook would tie three
 * pages to a render cycle for no benefit. `createManagedClubKey` was already here and covers the same
 * concern, so this file is the existing home for managed-club logic rather than a new one.
 */
import type { ManagedClub } from '../contexts/AuthContextDefinition';
import type { ActiveSeasonDataSource } from '../config/environment';

export function createManagedClubKey(club: { league: string; season: string; club_name: string }): string {
    return `${club.league}-${club.season}-${club.club_name}`;
}

/** A managed club whose league-season is configured and currently open. */
export interface ActiveManagedClub {
    club: ManagedClub;
    /** The data source that matched. The pages that only filter used to compute this and throw it away. */
    dataSource: ActiveSeasonDataSource;
}

export type ManagedClubExclusionReason =
    /** The environment config carries no active_seasons_data_source at all. */
    | 'CONFIG_MISSING'
    /** No configured data source matches this club's league and season. */
    | 'DATA_SOURCE_NOT_FOUND'
    /** Configured, but "now" falls outside the registration window. */
    | 'SEASON_NOT_ACTIVE'
    /**
     * Something else went wrong while resolving this club. Very nearly unreachable, but NOT because
     * this function does no I/O — it is unreachable because of its inputs:
     *
     * - both deliberate failures throw a ManagedClubExclusionError, so they carry their own reason;
     * - `club` fields cannot throw: parseManagedClubsJson keeps only entries whose five fields are
     *   all strings (AuthContextParsers.ts);
     * - the date arithmetic cannot throw either. A garbage ratings_end_date yields NaN, and NaN
     *   comparisons are simply false, so the club is excluded as SEASON_NOT_ACTIVE instead.
     *
     * The one path that does reach it is a null or non-object entry inside
     * active_seasons_data_source, which makes the `find` predicate throw. That config is injected at
     * build time and never validated at run time, so it is possible — just not through user input.
     *
     * It exists so that such a failure is reported as unknown rather than being mislabelled as one
     * of the reasons above.
     */
    | 'UNEXPECTED_ERROR';

/**
 * Carries the reason from the point the problem is detected to the point it is recorded.
 *
 * The alternative — re-deriving the reason inside the catch by re-testing the conditions — silently
 * mislabels any failure the re-test does not cover, which is exactly the bug this avoids.
 * `name` is deliberately left as the inherited "Error" so the logged output is unchanged.
 */
class ManagedClubExclusionError extends Error {
    readonly reason: ManagedClubExclusionReason;

    constructor(reason: ManagedClubExclusionReason, message: string) {
        super(message);
        this.reason = reason;
    }
}

export interface ExcludedManagedClub {
    club: ManagedClub;
    reason: ManagedClubExclusionReason;
}

export interface ManagedClubSelection {
    active: ActiveManagedClub[];
    excluded: ExcludedManagedClub[];
}

/**
 * Splits the user's managed clubs into those whose season is currently open and those that are not.
 *
 * The window runs from the season's `registrations_start_date` to the END OF THE CALENDAR YEAR in
 * which `ratings_end_date` falls — deliberately more generous than the ratings end date itself.
 *
 * A club that cannot be resolved is EXCLUDED AND LOGGED, never thrown: one broken config entry must
 * not take down the whole page for a manager whose other clubs are fine. `console.info` matches what
 * the promotion pages did before this was extracted.
 */
export function selectActiveManagedClubs(
    allManagedClubs: ManagedClub[],
    dataSourceList: ActiveSeasonDataSource[] | undefined,
    nowEpoch: number
): ManagedClubSelection {
    const active: ActiveManagedClub[] = [];
    const excluded: ExcludedManagedClub[] = [];

    for (const club of allManagedClubs) {
        try {
            if (!dataSourceList || dataSourceList.length === 0) {
                throw new ManagedClubExclusionError(
                    'CONFIG_MISSING',
                    'Configuration error: active_seasons_data_source is missing from the environment config.'
                );
            }

            const matchingConfig = dataSourceList.find(
                source => source.league === club.league && source.season === club.season
            );

            if (!matchingConfig) {
                throw new ManagedClubExclusionError(
                    'DATA_SOURCE_NOT_FOUND',
                    `Data source not found for league "${club.league}" and season "${club.season}".`
                );
            }

            const startEpoch = matchingConfig.registrations_start_date;
            const endDate = new Date(matchingConfig.ratings_end_date * 1000);
            const endOfYear = new Date(Date.UTC(endDate.getUTCFullYear(), 11, 31, 23, 59, 59));
            const endOfYearEpoch = Math.floor(endOfYear.getTime() / 1000);

            if (nowEpoch >= startEpoch && nowEpoch <= endOfYearEpoch) {
                active.push({ club, dataSource: matchingConfig });
            } else {
                excluded.push({ club, reason: 'SEASON_NOT_ACTIVE' });
            }
        } catch (err) {
            console.info('❌ Page event log processing managed club:', err);
            // The reason travels with the error. Re-deriving it here by re-testing the conditions
            // would mislabel any failure the re-test does not cover.
            excluded.push({
                club,
                reason: err instanceof ManagedClubExclusionError ? err.reason : 'UNEXPECTED_ERROR',
            });
        }
    }

    return { active, excluded };
}
