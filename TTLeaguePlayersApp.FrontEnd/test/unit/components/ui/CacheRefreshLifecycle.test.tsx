import { StrictMode, type ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActiveSeasonCard } from '../../../../src/components/ui/ActiveSeasonCard';
import { ClubTeamsList } from '../../../../src/components/ui/ClubTeamsList';
import { ClubStandingsList } from '../../../../src/components/ui/ClubStandingsList';
import { TeamPlayersList } from '../../../../src/components/ui/TeamPlayersList';
import { ClubsAndTournaments } from '../../../../src/pages/ClubsAndTournaments';
import type { Fixture } from '../../../../src/service/active-season-processors/ActiveSeasonProcessor';
import type { ClubTeamWithDivision } from '../../../../src/types/clubTeam';
import type { ActiveSeason } from '../../../../src/contexts/AuthContextDefinition';
import type { ClubWithTournaments } from '../../../../src/api/clubsApi';
import { setUnitFixedClockTime } from '../../TestClockUtils';

const mocks = vi.hoisted(() => ({ registrations: vi.fn(), players: vi.fn(), standings: vi.fn(), clubs: vi.fn() }));
vi.mock('../../../../src/api/cachedInviteApi', () => ({
    getCachedTeamRegistrations: mocks.registrations,
    getCachedTeamPlayersRegistrations: mocks.players,
}));
vi.mock('../../../../src/api/cachedKudosApi', () => ({ getCachedClubKudosStandings: mocks.standings }));
vi.mock('../../../../src/api/cachedClubsApi', () => ({ getCachedAllClubsWithTournaments: mocks.clubs }));
vi.mock('../../../../src/hooks/useAuth', () => ({ useAuth: () => ({
    isAuthenticated: true, isPlayerOrCaptain: true, isClubManager: true, isCaptain: true,
    userId: 'user', username: 'Test', activeSeasons: [], managedClubs: [], signOut: () => undefined,
}) }));

const season: ActiveSeason = { league: 'L', season: 'S', team_name: 'My team', team_division: 'D', person_name: 'Me', role: 'CAPTAIN', latest_kudos: [] };
const common = { league: 'L', season: 'S', clubName: 'Club', clubLocation: 'Town' };
const fixture = (name: string): Fixture => ({ homeTeam: 'My team', awayTeam: name, startDateTime: new Date('2026-10-25T19:00:00Z'), venue: 'Hall', googleMapsUrl: null });
const teams = (name: string): ClubTeamWithDivision[] => [{ team_name: name, team_division: 'D' }];
const clubs = (name: string): ClubWithTournaments[] => [{ club_name: name, location: 'Town', homepage: 'https://example.com', tournaments: [] }];
type Read = <T>(update?: (data: T) => void) => Promise<T>;
const cases: { name: string; render: (read: Read) => ReactNode; stale: unknown; fresh: unknown; loading: string }[] = [
    { name: 'fixtures', render: (read) => <ActiveSeasonCard season={season} processor={{ getTeamFixtures: (update) => read<Fixture[]>(update), getTeamPlayers: () => Promise.resolve([]) }} isExpanded onToggle={() => undefined} />,
        stale: [fixture('Discarded value')], fresh: [fixture('Current value')], loading: 'Loading match data...' },
    { name: 'club teams', render: (read) => <ClubTeamsList {...common} processor={{ getClubTeams: (update) => read<ClubTeamWithDivision[]>(update) }} />,
        stale: teams('Discarded value'), fresh: teams('Current value'), loading: 'Loading teams…' },
    { name: 'club standings', render: (read) => <ClubStandingsList {...common} processor={{ getClubTeams: (update) => read<ClubTeamWithDivision[]>(update) }} />,
        stale: teams('Discarded value'), fresh: teams('Current value'), loading: 'Loading teams…' },
    { name: 'team roster', render: (read) => <TeamPlayersList league="L" season="S" teamDivision="D" teamName="My team" invitedBy="Me" processor={{ getTeamPlayers: (update) => read<string[]>(update), getTeamFixtures: () => Promise.resolve([]) }} />,
        stale: ['Discarded value'], fresh: ['Current value'], loading: 'Loading players…' },
    { name: 'public listing', render: (read) => { mocks.clubs.mockImplementation((update?: (data: ClubWithTournaments[]) => void) => read(update)); return <ClubsAndTournaments />; },
        stale: clubs('Discarded value'), fresh: clubs('Current value'), loading: 'Loading clubs and tournaments…' },
];

beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    setUnitFixedClockTime('2026-10-24T12:00:00Z');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.registrations.mockImplementation((request: { team_names: string[] }) => Promise.resolve({ teams: request.team_names.map((team_name) => ({ team_name, status: 'NOT_INVITED', accepted_at: null })) }));
    mocks.players.mockImplementation((request: { player_names: string[] }) => Promise.resolve({ players: request.player_names.map((player_name) => ({ player_name, status: 'NOT_INVITED', accepted_at: null })) }));
    mocks.standings.mockImplementation((request: { teams: ClubTeamWithDivision[] }) => Promise.resolve({ teams: request.teams.map(({ team_name }) => ({ team_name, positive_count: 1, neutral_count: 0, negative_count: 0 })) }));
});
afterEach(() => { vi.restoreAllMocks(); setUnitFixedClockTime(undefined); });

interface Control { resolve: (data: unknown) => void; reject: (reason: Error) => void; update: (data: unknown) => void }
function controlledRead(controls: Control[]): Read {
    return <T,>(update?: (data: T) => void) => new Promise<T>((resolve, reject) => {
        controls.push({ resolve: (data) => { resolve(data as T); }, reject, update: (data) => { update?.(data as T); } });
    });
}
const settlements = [
    { outcome: 'success', order: 'before current' }, { outcome: 'failure', order: 'before current' },
    { outcome: 'success', order: 'after current' }, { outcome: 'failure', order: 'after current' },
];

describe.each(cases)('$name StrictMode lifecycle', (resource) => {
    it.each(settlements)('ignores discarded $outcome $order', async ({ outcome, order }) => {
        const controls: Control[] = [];
        render(<StrictMode><MemoryRouter>{resource.render(controlledRead(controls))}</MemoryRouter></StrictMode>);
        await waitFor(() => { expect(controls).toHaveLength(2); });
        if (order === 'after current') {
            await act(async () => { controls[1].resolve(resource.fresh); await Promise.resolve(); });
            await waitFor(() => { expect(screen.getByText(/Current value/)).toBeInTheDocument(); });
        }
        await act(async () => {
            if (outcome === 'success') controls[0].resolve(resource.stale);
            else controls[0].reject(new Error('Discarded request failed'));
            await Promise.resolve();
        });
        if (order === 'before current') expect(screen.getByText(resource.loading)).toBeInTheDocument();
        expect(screen.queryByText(/Discarded value/)).toBeNull();
        expect(screen.queryByText(/could not be loaded|not available|retry later/i)).toBeNull();
        if (order === 'before current') {
            await act(async () => { controls[1].resolve(resource.fresh); await Promise.resolve(); });
        }
        await waitFor(() => { expect(screen.getByText(/Current value/)).toBeInTheDocument(); });
        act(() => { controls[0].update(resource.stale); });
        expect(screen.getByText(/Current value/)).toBeInTheDocument();
        expect(screen.queryByText(/Discarded value/)).toBeNull();
    });
});

describe.each(cases.filter((resource) => ['club teams', 'club standings', 'team roster'].includes(resource.name)))('$name dependent request lifecycle', (resource) => {
    it.each(settlements)('ignores old status $outcome $order after a refreshed team list', async ({ outcome, order }) => {
        const primary: Control[] = [];
        const statuses: Control[] = [];
        const statusRead = controlledRead(statuses);
        const api = resource.name === 'club teams' ? mocks.registrations : resource.name === 'club standings' ? mocks.standings : mocks.players;
        api.mockImplementation((_request: unknown, update?: (data: unknown) => void) => statusRead(update));
        const response = (name: string) => resource.name === 'team roster'
            ? { players: [{ player_name: name, status: 'NOT_INVITED', accepted_at: null }] }
            : resource.name === 'club teams' ? { teams: [{ team_name: name, status: 'NOT_INVITED', accepted_at: null }] }
                : { teams: [{ team_name: name, positive_count: 1, neutral_count: 0, negative_count: 0 }] };
        render(<StrictMode><MemoryRouter>{resource.render(controlledRead(primary))}</MemoryRouter></StrictMode>);
        await act(async () => { primary[1].resolve(resource.stale); await Promise.resolve(); });
        await waitFor(() => { expect(statuses).toHaveLength(1); });
        act(() => { primary[1].update(resource.fresh); });
        await waitFor(() => { expect(statuses).toHaveLength(2); });
        if (order === 'after current') {
            await act(async () => { statuses[1].resolve(response('Current value')); await Promise.resolve(); });
            await waitFor(() => { expect(screen.getByText(/Current value/)).toBeInTheDocument(); });
        }
        await act(async () => {
            if (outcome === 'failure') statuses[0].reject(new Error('Old statuses failed'));
            else statuses[0].resolve(response('Discarded value'));
            await Promise.resolve();
        });
        if (order === 'before current') expect(screen.getByText(resource.loading)).toBeInTheDocument();
        expect(screen.queryByText(/Discarded value/)).toBeNull();
        expect(screen.queryByText(/could not be loaded|not available/i)).toBeNull();
        if (order === 'before current') {
            await act(async () => { statuses[1].resolve(response('Current value')); await Promise.resolve(); });
        }
        await waitFor(() => { expect(screen.getByText(/Current value/)).toBeInTheDocument(); });
        act(() => { statuses[0].update(response('Discarded value')); });
        expect(screen.queryByText(/Discarded value/)).toBeNull();
    });
});
