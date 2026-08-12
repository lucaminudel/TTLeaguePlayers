import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ClubStandingsList } from '../../../../src/components/ui/ClubStandingsList';
import type { ManagedClubProcessor } from '../../../../src/service/active-season-processors/ManagedClubProcessor';
import type { ClubKudosStandingsEntry, ClubKudosStandingsResponse } from '../../../../src/api/kudosApi';

const kudosApiMocks = vi.hoisted(() => ({
    getCachedClubKudosStandings: vi.fn(),
}));

vi.mock('../../../../src/api/cachedKudosApi', () => ({
    getCachedClubKudosStandings: kudosApiMocks.getCachedClubKudosStandings,
}));

describe('ClubStandingsList', () => {
    const LEAGUE = 'CLTTL';
    const SEASON = '2025-2026';
    const CLUB_NAME = 'Highbury Table Tennis Club';
    const CLUB_LOCATION = 'Islington';

    let consoleErrorSpy: MockInstance;

    beforeEach(() => {
        vi.clearAllMocks();
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    // ---------------------------------------------------------------- builders

    function stubProcessor(teams: { team_name: string; team_division: string }[] | Error): ManagedClubProcessor {
        return {
            getClubTeams: teams instanceof Error
                ? vi.fn().mockRejectedValue(teams)
                : vi.fn().mockResolvedValue(teams),
        };
    }

    function entry(team_name: string, positive = 0, neutral = 0, negative = 0): ClubKudosStandingsEntry {
        return { team_name, positive_count: positive, neutral_count: neutral, negative_count: negative };
    }

    function respondWith(teams: ClubKudosStandingsEntry[]): void {
        const response: ClubKudosStandingsResponse = {
            league: LEAGUE,
            season: SEASON,
            club_name: CLUB_NAME,
            club_location: CLUB_LOCATION,
            teams,
        };
        kudosApiMocks.getCachedClubKudosStandings.mockResolvedValue(response);
    }

    function listFor(processor: ManagedClubProcessor, clubName = CLUB_NAME, clubLocation = CLUB_LOCATION) {
        return (
            <ClubStandingsList
                processor={processor}
                league={LEAGUE}
                season={SEASON}
                clubName={clubName}
                clubLocation={clubLocation}
            />
        );
    }

    function renderList(processor: ManagedClubProcessor) {
        return render(listFor(processor));
    }

    // ---------------------------------------------------------------- tests

    it('shows a loading message before the standings arrive', () => {
        respondWith([]);

        renderList(stubProcessor([{ team_name: 'Highbury 2', team_division: 'Division 4' }]));

        expect(screen.getByTestId('club-standings-loading')).toBeInTheDocument();
    });

    it('renders one row per team, in the order returned, with all three counts', async () => {
        respondWith([entry('Highbury 2', 5, 1, 0), entry('Highbury 5', 2, 0, 3)]);

        renderList(stubProcessor([
            { team_name: 'Highbury 2', team_division: 'Division 4' },
            { team_name: 'Highbury 5', team_division: 'Division 7' },
        ]));

        await waitFor(() => { expect(screen.getAllByTestId('club-standing-name')).toHaveLength(2); });

        expect(screen.getAllByTestId('club-standing-name').map((n) => n.textContent))
            .toEqual(['Highbury 2', 'Highbury 5']);
        expect(screen.getAllByTestId('club-standing-positive').map((n) => n.textContent)).toEqual(['5', '2']);
        expect(screen.getAllByTestId('club-standing-neutral').map((n) => n.textContent)).toEqual(['1', '0']);
        expect(screen.getAllByTestId('club-standing-negative').map((n) => n.textContent)).toEqual(['0', '3']);
    });

    // NOT sorted by count, deliberately unlike the Kudos Standings page: this one mirrors the club
    // page so a manager finds their teams where they expect them.
    it('does not reorder the rows by count', async () => {
        respondWith([entry('Highbury 2', 1), entry('Highbury 5', 9)]);

        renderList(stubProcessor([
            { team_name: 'Highbury 2', team_division: 'Division 4' },
            { team_name: 'Highbury 5', team_division: 'Division 7' },
        ]));

        await waitFor(() => { expect(screen.getAllByTestId('club-standing-name')).toHaveLength(2); });

        expect(screen.getAllByTestId('club-standing-name').map((n) => n.textContent))
            .toEqual(['Highbury 2', 'Highbury 5']);
    });

    it('renders a team with no kudos as three zeros rather than hiding it', async () => {
        respondWith([entry('Highbury 2', 3), entry('Highbury 9')]);

        renderList(stubProcessor([
            { team_name: 'Highbury 2', team_division: 'Division 4' },
            { team_name: 'Highbury 9', team_division: 'Division 7' },
        ]));

        await waitFor(() => { expect(screen.getAllByTestId('club-standing-name')).toHaveLength(2); });

        const zeros = screen.getAllByTestId('club-standing-row-Highbury 9');
        expect(zeros).toHaveLength(1);
        expect(zeros[0].textContent).toContain('Highbury 9');
        expect(screen.getAllByTestId('club-standing-positive')[1].textContent).toBe('0');
        expect(screen.getAllByTestId('club-standing-neutral')[1].textContent).toBe('0');
        expect(screen.getAllByTestId('club-standing-negative')[1].textContent).toBe('0');
    });

    // An empty teams list is a 400 from the endpoint, and the client API has no guard of its own.
    it('shows the no-teams message and makes NO api call when the club has no teams', async () => {
        renderList(stubProcessor([]));

        await waitFor(() => {
            expect(screen.queryByTestId('club-standings-loading')).not.toBeInTheDocument();
        });

        expect(screen.getByText('No teams found for this club.')).toBeInTheDocument();
        expect(kudosApiMocks.getCachedClubKudosStandings).not.toHaveBeenCalled();
    });

    it('passes the team couples, including each division, straight through to the api', async () => {
        respondWith([entry('Highbury 2'), entry('Highbury 5')]);

        renderList(stubProcessor([
            { team_name: 'Highbury 2', team_division: 'Division 4' },
            { team_name: 'Highbury 5', team_division: 'Division 7' },
        ]));

        await waitFor(() => { expect(kudosApiMocks.getCachedClubKudosStandings).toHaveBeenCalled(); });

        expect(kudosApiMocks.getCachedClubKudosStandings).toHaveBeenCalledWith({
            league: LEAGUE,
            season: SEASON,
            club_name: CLUB_NAME,
            club_location: CLUB_LOCATION,
            teams: [
                { team_name: 'Highbury 2', team_division: 'Division 4' },
                { team_name: 'Highbury 5', team_division: 'Division 7' },
            ],
        });
    });

    // The parser keeps a link-less team with an empty division so My Club Teams still lists it, but
    // the endpoint 400s the WHOLE request over one blank division. Without this filter a single odd
    // row on the club page would replace every team's standings with an error message.
    it('drops a team with no division rather than letting it fail the whole request', async () => {
        respondWith([entry('Highbury 2', 3)]);

        renderList(stubProcessor([
            { team_name: 'Highbury 2', team_division: 'Division 4' },
            { team_name: 'Odd Team', team_division: '' },
        ]));

        await waitFor(() => { expect(kudosApiMocks.getCachedClubKudosStandings).toHaveBeenCalled(); });

        expect(kudosApiMocks.getCachedClubKudosStandings).toHaveBeenCalledWith(
            expect.objectContaining({
                teams: [{ team_name: 'Highbury 2', team_division: 'Division 4' }],
            })
        );

        expect(screen.getAllByTestId('club-standing-name').map((n) => n.textContent)).toEqual(['Highbury 2']);
    });

    // Every team lacking a division collapses to the same branch as a club with no teams at all.
    it('makes NO api call when every team lacks a division', async () => {
        renderList(stubProcessor([{ team_name: 'Odd Team', team_division: '' }]));

        await waitFor(() => {
            expect(screen.queryByTestId('club-standings-loading')).not.toBeInTheDocument();
        });

        expect(kudosApiMocks.getCachedClubKudosStandings).not.toHaveBeenCalled();
    });

    // Deliberately UNLIKE ClubTeamsList, which fails silently to the console: a blank standings area
    // is indistinguishable from a club with nothing to show.
    it('renders an error message when the standings cannot be loaded', async () => {
        kudosApiMocks.getCachedClubKudosStandings.mockRejectedValue(new Error('boom'));

        renderList(stubProcessor([{ team_name: 'Highbury 2', team_division: 'Division 4' }]));

        await waitFor(() => { expect(screen.getByTestId('club-standings-error')).toBeInTheDocument(); });

        expect(screen.queryAllByTestId('club-standing-name')).toHaveLength(0);
    });

    // WORDING: a club with no club_teams entry in the config (BCS, FLICK) throws from the fetcher and
    // lands in the SAME catch. Saying "this club has no teams" would state something false about it.
    it('never claims the club has no teams when the club page could not be read', async () => {
        renderList(stubProcessor(new Error('Club "Flick M" not found in data source.')));

        await waitFor(() => { expect(screen.getByTestId('club-standings-error')).toBeInTheDocument(); });

        expect(screen.queryByText('No teams found for this club.')).not.toBeInTheDocument();
    });

    // MyClubStandings renders ONE ClubStandingsList with no `key`, so choosing another club re-runs
    // this effect on the same instance rather than mounting a fresh one. Without the reset the user
    // reads the previous club's rows under the newly selected club's heading.
    it('clears the previous club rows when the newly selected club fails to load', async () => {
        respondWith([entry('Highbury 2', 3), entry('Highbury 5', 1)]);

        const { rerender } = renderList(stubProcessor([
            { team_name: 'Highbury 2', team_division: 'Division 4' },
            { team_name: 'Highbury 5', team_division: 'Division 7' },
        ]));

        await waitFor(() => { expect(screen.getAllByTestId('club-standing-name')).toHaveLength(2); });

        rerender(listFor(
            stubProcessor(new Error('Club "Flick M" not found in data source.')),
            'Flick M',
            'Hackney'
        ));

        await waitFor(() => { expect(screen.getByTestId('club-standings-error')).toBeInTheDocument(); });

        expect(screen.queryAllByTestId('club-standing-name')).toHaveLength(0);
    });
});
