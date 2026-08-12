import {
    getKudos,
    getTeamKudos,
    getKudosStandings,
    type GetKudosRequest,
    type KudosResponse,
    type KudosSummaryResponse,
    type GetTeamKudosRequest,
    type GetKudosStandingsRequest,
    type KudosStandingsResponse,
    getClubKudosStandings,
    type ClubKudosStandingsRequest,
    type ClubKudosStandingsResponse,
    type ClubKudosStandingsEntry
} from './kudosApi';
import { invalidateCache, withSWR } from '../utils/CacheUtils';

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

/**
 * Cached version of getClubKudosStandings.
 *
 * The cache key deliberately does NOT include the team list — it is keyed on the club
 *
 * The key sits under KUDOS_CACHE_PREFIX on purpose: awardKudos already calls
 * invalidateCacheByPrefix(KUDOS_CACHE_PREFIX), so a manager who rates a match immediately stops
 * seeing stale standings. 
 */
export async function getCachedClubKudosStandings(
    request: ClubKudosStandingsRequest,
    onDataUpdate?: (data: ClubKudosStandingsResponse) => void
): Promise<ClubKudosStandingsResponse> {
    const cacheKey = `${KUDOS_CACHE_PREFIX}clubstandings_${request.league}_${request.season}_${request.club_location}_${request.club_name}`;

    discardCachedClubStandingsThatCannotAnswer(cacheKey, request);

    const response = await withSWR(
        cacheKey,
        () => getClubKudosStandings(request),
        CACHE_CONFIG.STANDINGS,
        undefined,
        onDataUpdate
    );

    return projectOntoRequestedClubTeams(response, request);
}

// A cached entry covering only yesterday's teams cannot answer today's question: the club has since
// added a team. Rather than serve a short table, throw the entry away and refetch.
function discardCachedClubStandingsThatCannotAnswer(cacheKey: string, request: ClubKudosStandingsRequest): void {
    const cachedTeamNames = readCachedClubStandingsTeamNames(cacheKey);
    if (cachedTeamNames === null) {
        return;
    }

    const coversEveryRequestedTeam = request.teams.every((team) => cachedTeamNames.has(team.team_name));

    if (!coversEveryRequestedTeam) {
        invalidateCache(cacheKey);
    }
}

function readCachedClubStandingsTeamNames(cacheKey: string): Set<string> | null {
    const raw = localStorage.getItem(cacheKey);
    if (raw === null) {
        return null;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }

    if (typeof parsed !== 'object' || parsed === null || !('data' in parsed)) {
        return null;
    }
    const data: unknown = (parsed as { data: unknown }).data;

    if (typeof data !== 'object' || data === null || !('teams' in data)) {
        return null;
    }
    const teams: unknown = (data as { teams: unknown }).teams;

    if (!Array.isArray(teams)) {
        return null;
    }

    const names = new Set<string>();
    for (const team of teams as unknown[]) {
        if (typeof team === 'object' && team !== null && 'team_name' in team) {
            const name: unknown = (team as { team_name: unknown }).team_name;
            if (typeof name === 'string') {
                names.add(name);
            }
        }
    }
    return names;
}

// The cached entry may cover MORE teams than were asked for — a team the club has since dropped.
// Project onto exactly the requested teams, in the requested order.
function projectOntoRequestedClubTeams(
    response: ClubKudosStandingsResponse,
    request: ClubKudosStandingsRequest
): ClubKudosStandingsResponse {
    const entriesByTeamName = new Map<string, ClubKudosStandingsEntry>(
        response.teams.map((entry) => [entry.team_name, entry])
    );

    const teams: ClubKudosStandingsEntry[] = [];
    for (const team of request.teams) {
        const entry = entriesByTeamName.get(team.team_name);
        if (entry === undefined) {
            // A requested team missing from a FRESH response means the backend contract has drifted.
            // Returning the raw response is the honest answer: it shows what the server actually
            // said rather than silently hiding a team.
            return response;
        }
        teams.push(entry);
    }

    return { ...response, teams };
}
