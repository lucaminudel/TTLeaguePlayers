import { inviteApi } from './inviteApi';
import {
    TeamRegistrationStatus,
    type PlayerRegistrationEntry,
    type TeamPlayersRegistrationsRequest,
    type TeamPlayersRegistrationsResponse,
    type TeamRegistrationEntry,
    type TeamRegistrationsRequest,
    type TeamRegistrationsResponse
} from '../types/invite';
import { invalidateCache, withSWR } from '../utils/CacheUtils';

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

const CACHE_CONFIG = {
    TEAM_REGISTRATIONS: {
        freshDurationMs: ONE_DAY,
        staleDurationMs: 6 * ONE_DAY,
    },
    TEAM_PLAYERS_REGISTRATIONS: {
        freshDurationMs: ONE_DAY,
        staleDurationMs: 3 * ONE_DAY,
    }
};

export const INVITE_CACHE_PREFIX = 'invite_cache_';

/**
 * Cached version of getTeamRegistrations.
 */
export async function getCachedTeamRegistrations(
    request: TeamRegistrationsRequest,
    onDataUpdate?: (data: TeamRegistrationsResponse) => void
): Promise<TeamRegistrationsResponse> {
    const cacheKey = `${INVITE_CACHE_PREFIX}registrations_${request.league}_${request.season}_${request.club_location}_${request.club_name}`;

    discardCachedEntryThatCannotAnswer(cacheKey, request);

    const response = await withSWR(
        cacheKey,
        () => inviteApi.getTeamRegistrations(request),
        CACHE_CONFIG.TEAM_REGISTRATIONS,
        undefined,
        onDataUpdate
    );

    return projectOntoRequestedTeams(response, request);
}

function discardCachedEntryThatCannotAnswer(cacheKey: string, request: TeamRegistrationsRequest): void {
    const cachedTeamNames = readCachedNames(cacheKey, 'teams', 'team_name');
    if (cachedTeamNames === null) {
        return;
    }

    const coversEveryRequestedTeam = request.team_names.every((name) => cachedTeamNames.has(name));

    if (!coversEveryRequestedTeam) {
        invalidateCache(cacheKey);
    }
}

/**
 * Cached version of getTeamPlayersRegistrations. Its own key (one entry per team), a shorter stale
 * window than the club twin (1 day fresh / 3 days stale) and its own fitness rule: judged on the REQUESTED names only, because the extras
 * are whatever the backend found and say nothing about what the caller asked for.
 */
export async function getCachedTeamPlayersRegistrations(
    request: TeamPlayersRegistrationsRequest,
    onDataUpdate?: (data: TeamPlayersRegistrationsResponse) => void
): Promise<TeamPlayersRegistrationsResponse> {
    const cacheKey = `${INVITE_CACHE_PREFIX}players_${request.league}_${request.season}_${request.team_division}_${request.team_name}`;

    discardCachedPlayersEntryThatCannotAnswer(cacheKey, request);

    const response = await withSWR(
        cacheKey,
        () => inviteApi.getTeamPlayersRegistrations(request),
        CACHE_CONFIG.TEAM_PLAYERS_REGISTRATIONS,
        undefined,
        onDataUpdate
    );

    return projectOntoRequestedPlayers(response, request);
}

function discardCachedPlayersEntryThatCannotAnswer(cacheKey: string, request: TeamPlayersRegistrationsRequest): void {
    // Extras have no player_name and are skipped by the reader, so an extra never "covers" a name.
    const cachedPlayerNames = readCachedNames(cacheKey, 'players', 'player_name');
    if (cachedPlayerNames === null) {
        return;
    }

    const coversEveryRequestedPlayer = request.player_names.every((name) => cachedPlayerNames.has(name));

    if (!coversEveryRequestedPlayer) {
        invalidateCache(cacheKey);
    }
}

// The names a cached entry can answer for: the `nameField` of every element of `data.<listField>`
// that has one (a string). Shared by the two twins, which differ only in those two field names.
function readCachedNames(cacheKey: string, listField: string, nameField: string): Set<string> | null {
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

    if (typeof data !== 'object' || data === null || !(listField in data)) {
        return null;
    }
    const list: unknown = (data as Record<string, unknown>)[listField];

    if (!Array.isArray(list)) {
        return null;
    }

    const names = new Set<string>();
    for (const element of list as unknown[]) {
        if (typeof element === 'object' && element !== null && nameField in element) {
            const name: unknown = (element as Record<string, unknown>)[nameField];
            if (typeof name === 'string') {
                names.add(name);
            }
        }
    }
    return names;
}

function projectOntoRequestedTeams(
    response: TeamRegistrationsResponse,
    request: TeamRegistrationsRequest
): TeamRegistrationsResponse {
    const entriesByTeamName = new Map<string, TeamRegistrationEntry>(
        response.teams.map((entry) => [entry.team_name, entry])
    );

    const teams: TeamRegistrationEntry[] = [];
    for (const teamName of request.team_names) {
        const entry = entriesByTeamName.get(teamName);
        if (entry === undefined) {
            return response;
        }
        teams.push(entry);
    }

    return { ...response, teams };
}

// The requested entries in THIS caller's order, followed by the extras (no player_name), ordered by
// created_at as the backend orders them. A cached row whose player_name is no longer requested is
// what a fresh call would treat as "not asked about": if it carries an invite it is demoted to an
// extra (player_name stripped), exactly as the backend would report that invite; if it was
// NOT_INVITED there is nothing to show and it is dropped. A cached entry that passed the fitness
// check always has a row for each requested name; if it somehow does not, the response is returned
// as is rather than mangled.
function projectOntoRequestedPlayers(
    response: TeamPlayersRegistrationsResponse,
    request: TeamPlayersRegistrationsRequest
): TeamPlayersRegistrationsResponse {
    const requestedNames = new Set(request.player_names);
    const entriesByPlayerName = new Map<string, PlayerRegistrationEntry>();
    const extras: PlayerRegistrationEntry[] = [];
    for (const entry of response.players) {
        if (entry.player_name === undefined) {
            extras.push(entry);
        } else if (requestedNames.has(entry.player_name)) {
            entriesByPlayerName.set(entry.player_name, entry);
        } else if (entry.status !== TeamRegistrationStatus.NOT_INVITED) {
            extras.push(withoutPlayerName(entry));
        }
    }

    const players: PlayerRegistrationEntry[] = [];
    for (const playerName of request.player_names) {
        const entry = entriesByPlayerName.get(playerName);
        if (entry === undefined) {
            return response;
        }
        players.push(entry);
    }

    extras.sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));

    return { ...response, players: [...players, ...extras] };
}

function withoutPlayerName(entry: PlayerRegistrationEntry): PlayerRegistrationEntry {
    const copy: PlayerRegistrationEntry = { ...entry };
    delete copy.player_name;
    return copy;
}
