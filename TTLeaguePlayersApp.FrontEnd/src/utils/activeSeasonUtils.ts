/**
 * Helpers for the captain-side flows, which read the user's `custom:active_seasons`.
 */
import type { ActiveSeason } from '../contexts/AuthContextDefinition';
import type { ActiveSeasonDataSource } from '../config/environment';

/**
 * Whether this active season is a captaincy.
 */
export function isCaptainSeason(season: ActiveSeason): boolean {
    return season.role === 'CAPTAIN';
}

/**
 * Whether the user captains at least one team, in any league or season.
 */
export function hasCaptainRole(activeSeasons: ActiveSeason[]): boolean {
    return activeSeasons.some(isCaptainSeason);
}

/** A captaincy the app can actually show, paired with the config entry that resolved it. */
export interface CaptainSeason {
    season: ActiveSeason;
    /** The matched data source — the captain page needs it to build the processor. */
    dataSource: ActiveSeasonDataSource;
}

/**
 * The user's captaincies that are currently in season, in the order the claim lists them. *
 * Three filters, in this order:
 * 1. **Role** — only `CAPTAIN`
 * 2. **Configuration** — a data source whose league AND season both match
 * 3. **The strict window** — `registrations_start_date <= now <= ratings_end_date`
 */
export function selectCaptainSeasons(
    activeSeasons: ActiveSeason[],
    dataSourceList: ActiveSeasonDataSource[] | undefined,
    nowEpoch: number
): CaptainSeason[] {
    const captainSeasons: CaptainSeason[] = [];

    for (const season of activeSeasons) {
        if (!isCaptainSeason(season)) {
            continue;
        }

        if (!dataSourceList || dataSourceList.length === 0) {
            logCaptainSeasonIssue(
                'Configuration error: active_seasons_data_source is missing from the environment config.'
            );
            continue;
        }

        const matchingConfig = dataSourceList.find(
            (source) => source.league === season.league && source.season === season.season
        );

        if (!matchingConfig) {
            logCaptainSeasonIssue(
                `Data source not found for league "${season.league}" and season "${season.season}".`
            );
            continue;
        }

        const isInSeason = nowEpoch >= matchingConfig.registrations_start_date
            && nowEpoch <= matchingConfig.ratings_end_date;

        if (isInSeason) {
            captainSeasons.push({ season, dataSource: matchingConfig });
        }
    }

    return captainSeasons;
}

function logCaptainSeasonIssue(message: string): void {
    console.error('❌ Page event log processing captain season:', new Error(message));
}
