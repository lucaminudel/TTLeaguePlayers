import {
    getKudos,
    getTeamKudos,
    getKudosStandings,
    type GetKudosRequest,
    type KudosResponse,
    type KudosSummaryResponse,
    type GetTeamKudosRequest,
    type GetKudosStandingsRequest,
    type KudosStandingsResponse
} from './kudosApi';
import { withSWR } from '../utils/CacheUtils';

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;
const ONE_WEEK = 7 * ONE_DAY;

const CACHE_CONFIG = {
    PLAYER_KUDOS: {
        freshDurationMs: 2 * ONE_HOUR,
        staleDurationMs: ONE_WEEK,
    },
    TEAM_KUDOS: {
        freshDurationMs: 2 * ONE_HOUR,
        staleDurationMs: ONE_WEEK,
    },
    STANDINGS: {
        freshDurationMs: 2 * ONE_HOUR,
        staleDurationMs: ONE_WEEK,
    }
};

export const KUDOS_CACHE_PREFIX = 'kudos_cache_';

/**
 * Cached version of getKudos for player-awarded kudos (with giverPersonSub)
 */
export async function getCachedPlayerKudos(
    request: GetKudosRequest,
    onDataUpdate?: (data: KudosResponse[]) => void
): Promise<KudosResponse[]> {
    const cacheKey = `${KUDOS_CACHE_PREFIX}player_${request.league}_${request.season}_${request.teamDivision}_${request.teamName}_${request.giverPersonSub ?? 'all'}`;

    return withSWR(
        cacheKey,
        () => getKudos(request),
        CACHE_CONFIG.PLAYER_KUDOS,
        undefined,
        onDataUpdate
    );
}

/**
 * Cached version of getTeamKudos
 */
export async function getCachedTeamKudos(
    request: GetTeamKudosRequest,
    onDataUpdate?: (data: KudosSummaryResponse[]) => void
): Promise<KudosSummaryResponse[]> {
    const cacheKey = `${KUDOS_CACHE_PREFIX}team_${request.league}_${request.season}_${request.teamDivision}_${request.teamName}`;

    return withSWR(
        cacheKey,
        () => getTeamKudos(request),
        CACHE_CONFIG.TEAM_KUDOS,
        undefined,
        onDataUpdate
    );
}

/**
 * Cached version of getKudosStandings
 */
export async function getCachedKudosStandings(
    request: GetKudosStandingsRequest,
    onDataUpdate?: (data: KudosStandingsResponse) => void
): Promise<KudosStandingsResponse> {
    const cacheKey = `${KUDOS_CACHE_PREFIX}standings_${request.league}_${request.season}_${request.teamDivision}`;

    return withSWR(
        cacheKey,
        () => getKudosStandings(request),
        CACHE_CONFIG.STANDINGS,
        undefined,
        onDataUpdate
    );
}
