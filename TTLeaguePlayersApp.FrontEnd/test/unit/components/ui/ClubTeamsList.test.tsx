import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { ClubTeamsList } from '../../../../src/components/ui/ClubTeamsList';
import type { ManagedClubProcessor } from '../../../../src/service/active-season-processors/ManagedClubProcessor';
import type { TeamRegistrationEntry, TeamRegistrationsResponse } from '../../../../src/types/invite';
import { setUnitFixedClockTime } from '../../TestClockUtils';

const inviteApiMocks = vi.hoisted(() => ({
    getCachedTeamRegistrations: vi.fn(),
}));

vi.mock('../../../../src/api/cachedInviteApi', () => ({
    getCachedTeamRegistrations: inviteApiMocks.getCachedTeamRegistrations,
}));

describe('ClubTeamsList', () => {
    const LEAGUE = 'CLTTL';
    const SEASON = '2025-2026';
    const CLUB_NAME = 'Walworth Table Tennis Club';
    const CLUB_LOCATION = 'London';

    // The suite's fixed clock. Dates in the current year render without a year.
    const FIXED_CLOCK = '2026-06-01T12:00:00Z';

    const epochOf = (isoUtc: string) => Math.floor(new Date(isoUtc).getTime() / 1000);

    let consoleErrorSpy: MockInstance;

    beforeEach(() => {
        vi.clearAllMocks();
        setUnitFixedClockTime(FIXED_CLOCK);
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        setUnitFixedClockTime(undefined);
    });

    // ---------------------------------------------------------------- builders

    // Call sites still pass plain team NAMES: this page uses only the name, and spelling out a
    // division at every one of them would add noise no assertion here depends on. The division the
    // processor now returns is filled in with a constant, and the mapping happens here.
    function stubProcessor(teams: string[] | Error): ManagedClubProcessor {
        return {
            getClubTeams: teams instanceof Error
                ? vi.fn().mockRejectedValue(teams)
                : vi.fn().mockResolvedValue(
                    teams.map((team_name) => ({ team_name, team_division: 'Division 4' }))
                ),
        };
    }

    function entry(overrides: Partial<TeamRegistrationEntry> & { team_name: string }): TeamRegistrationEntry {
        return {
            status: 'NOT_INVITED',
            accepted_at: null,
            ...overrides,
        } as TeamRegistrationEntry;
    }

    function respondWith(teams: TeamRegistrationEntry[]): void {
        const response: TeamRegistrationsResponse = {
            league: LEAGUE,
            season: SEASON,
            club_name: CLUB_NAME,
            club_location: CLUB_LOCATION,
            teams,
        };
        inviteApiMocks.getCachedTeamRegistrations.mockResolvedValue(response);
    }

    // Separate from renderList so a test can re-render the SAME instance with another club's props,
    // which is what selecting a different club in ManagedClubsCard does to this component.
    function listFor(
        processor: ManagedClubProcessor,
        clubName: string = CLUB_NAME,
        clubLocation: string = CLUB_LOCATION
    ) {
        return (
            <ClubTeamsList
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

    const rowCells = (teamName: string) => {
        const row = screen.getByTestId(`club-team-row-${teamName}`);
        return {
            status: within(row).getByTestId('club-team-status').textContent,
            date: within(row).getByTestId('club-team-date').textContent,
            invitee: within(row).getByTestId('club-team-invitee').textContent,
        };
    };

    // ---------------------------------------------------------------- tests

    it('requests the registrations for exactly the teams the processor returned', async () => {
        respondWith([entry({ team_name: 'Walworth 1' }), entry({ team_name: 'Walworth 2' })]);

        renderList(stubProcessor(['Walworth 1', 'Walworth 2']));

        await waitFor(() => {
            expect(inviteApiMocks.getCachedTeamRegistrations).toHaveBeenCalledWith({
                league: LEAGUE,
                season: SEASON,
                club_name: CLUB_NAME,
                club_location: CLUB_LOCATION,
                team_names: ['Walworth 1', 'Walworth 2'],
            });
        });
    });

    it('orders rows ACCEPTED, then PENDING, then NOT_INVITED', async () => {
        respondWith([
            entry({ team_name: 'Not invited team', status: 'NOT_INVITED' }),
            entry({ team_name: 'Pending team', status: 'PENDING', created_at: epochOf('2026-03-05T00:00:00Z') }),
            entry({ team_name: 'Accepted team', status: 'ACCEPTED', accepted_at: epochOf('2026-04-09T00:00:00Z') }),
        ]);

        renderList(stubProcessor(['Not invited team', 'Pending team', 'Accepted team']));

        await waitFor(() => { expect(screen.getAllByTestId('club-team-name')).toHaveLength(3); });

        expect(screen.getAllByTestId('club-team-name').map((cell) => cell.textContent))
            .toEqual(['Accepted team', 'Pending team', 'Not invited team']);
    });

    it('keeps the order the club page gave, within one status group', async () => {
        respondWith([
            entry({ team_name: 'Walworth 1', status: 'NOT_INVITED' }),
            entry({ team_name: 'Walworth 10', status: 'NOT_INVITED' }),
            entry({ team_name: 'Walworth 2', status: 'NOT_INVITED' }),
        ]);

        renderList(stubProcessor(['Walworth 1', 'Walworth 10', 'Walworth 2']));

        await waitFor(() => { expect(screen.getAllByTestId('club-team-name')).toHaveLength(3); });

        // The club page is already string-sorted, so a stable sort on status alone preserves it -
        // including the lexicographic oddity that puts 10 before 2.
        expect(screen.getAllByTestId('club-team-name').map((cell) => cell.textContent))
            .toEqual(['Walworth 1', 'Walworth 10', 'Walworth 2']);
    });

    it('shows the accepted date and the invitee on an ACCEPTED row, and never created_at', async () => {
        respondWith([entry({
            team_name: 'Walworth 1',
            status: 'ACCEPTED',
            accepted_at: epochOf('2026-04-09T00:00:00Z'),
            created_at: epochOf('2026-01-02T00:00:00Z'),
            invitee_name: 'Ada Lovelace',
        })]);

        renderList(stubProcessor(['Walworth 1']));

        await waitFor(() => { expect(screen.getByTestId('club-team-name')).toBeInTheDocument(); });

        const cells = rowCells('Walworth 1');
        expect(cells.status).toBe('Registered');
        expect(cells.date).toBe('9 Apr');
        expect(cells.date).not.toContain('Jan');
        expect(cells.invitee).toBe('Ada Lovelace');
    });

    it('shows created_at and the invitee on a PENDING row', async () => {
        respondWith([entry({
            team_name: 'Walworth 2',
            status: 'PENDING',
            created_at: epochOf('2026-03-05T00:00:00Z'),
            invitee_name: 'Grace Hopper',
        })]);

        renderList(stubProcessor(['Walworth 2']));

        await waitFor(() => { expect(screen.getByTestId('club-team-name')).toBeInTheDocument(); });

        const cells = rowCells('Walworth 2');
        expect(cells.status).toBe('Invite sent');
        expect(cells.date).toBe('5 Mar');
        expect(cells.invitee).toBe('Grace Hopper');
    });

    // The fixture deliberately carries created_at and invitee_name even though a conforming backend
    // omits both on NOT_INVITED. That is what makes this test sharp: an implementation that decided
    // what to show from FIELD PRESENCE rather than from `status` would render them here.
    it('shows neither a date nor an invitee on a NOT_INVITED row, even when both fields are present', async () => {
        respondWith([entry({
            team_name: 'Walworth 3',
            status: 'NOT_INVITED',
            created_at: epochOf('2026-03-05T00:00:00Z'),
            invitee_name: 'Should Not Appear',
        })]);

        renderList(stubProcessor(['Walworth 3']));

        await waitFor(() => { expect(screen.getByTestId('club-team-name')).toBeInTheDocument(); });

        const cells = rowCells('Walworth 3');
        expect(cells.status).toBe('Not invited');
        expect(cells.date).toBe('');
        expect(cells.invitee).toBe('');
    });

    it('treats a PENDING row as pending even though its accepted_at is null', async () => {
        // accepted_at is ALWAYS present and null on both PENDING and NOT_INVITED, so its null cannot
        // tell the two apart — the status field is the only thing that can.
        respondWith([entry({
            team_name: 'Walworth 4',
            status: 'PENDING',
            accepted_at: null,
            created_at: epochOf('2026-03-05T00:00:00Z'),
        })]);

        renderList(stubProcessor(['Walworth 4']));

        await waitFor(() => { expect(screen.getByTestId('club-team-name')).toBeInTheDocument(); });

        const cells = rowCells('Walworth 4');
        expect(cells.status).toBe('Invite sent');
        expect(cells.date).toBe('5 Mar');
    });

    it('leaves an empty action cell on every row, for the future invite icons', async () => {
        respondWith([entry({ team_name: 'Walworth 1' })]);

        renderList(stubProcessor(['Walworth 1']));

        await waitFor(() => { expect(screen.getByTestId('club-team-name')).toBeInTheDocument(); });

        expect(screen.getByTestId('club-team-actions')).toBeInTheDocument();
    });

    it('does not call the endpoint when the club has no teams, and says so', async () => {
        renderList(stubProcessor([]));

        await waitFor(() => {
            expect(screen.getByText('No teams found for this club.')).toBeInTheDocument();
        });

        // An empty team_names is a 400 from the endpoint, so it must never be sent.
        expect(inviteApiMocks.getCachedTeamRegistrations).not.toHaveBeenCalled();
    });

    it('logs and renders no rows when the club page cannot be read', async () => {
        renderList(stubProcessor(new Error('Network failure')));

        await waitFor(() => {
            expect(screen.queryByTestId('club-teams-loading')).not.toBeInTheDocument();
        });

        expect(screen.queryAllByTestId('club-team-name')).toHaveLength(0);
        expect(screen.queryByText('No teams found for this club.')).not.toBeInTheDocument();
        expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('logs and renders no rows when the registrations endpoint fails', async () => {
        inviteApiMocks.getCachedTeamRegistrations.mockRejectedValue(new Error('API down'));

        renderList(stubProcessor(['Walworth 1']));

        await waitFor(() => {
            expect(screen.queryByTestId('club-teams-loading')).not.toBeInTheDocument();
        });

        expect(screen.queryAllByTestId('club-team-name')).toHaveLength(0);
        expect(consoleErrorSpy).toHaveBeenCalled();
    });

    // MyClubTeams renders ONE ClubTeamsList with no `key`, so choosing another club in
    // ManagedClubsCard re-runs this effect on the same instance rather than mounting a fresh one.
    // The rows already in state therefore survive a failed load, and the user is left reading the
    // previous club's teams under the newly selected club's heading.
    it('clears the previous club rows when the newly selected club fails to load', async () => {
        respondWith([entry({ team_name: 'Walworth 1' }), entry({ team_name: 'Walworth 2' })]);

        const { rerender } = renderList(stubProcessor(['Walworth 1', 'Walworth 2']));

        await waitFor(() => { expect(screen.getAllByTestId('club-team-name')).toHaveLength(2); });

        // The club switch: a new processor instance, plus the newly selected club's name and location.
        rerender(listFor(
            stubProcessor(new Error('Club "Flick M" not found in data source.')),
            'Flick M',
            'Hackney'
        ));

        // The logged error is the signal that the SECOND load has settled — the first one succeeds,
        // so nothing else in this test writes to console.error.
        await waitFor(() => {
            expect(consoleErrorSpy).toHaveBeenCalled();
            expect(screen.queryByTestId('club-teams-loading')).not.toBeInTheDocument();
        });

        expect(screen.queryAllByTestId('club-team-name')).toHaveLength(0);
        expect(screen.queryByTestId('club-teams')).not.toBeInTheDocument();
    });

    it('shows a loading indicator until the data arrives', async () => {
        respondWith([entry({ team_name: 'Walworth 1' })]);

        renderList(stubProcessor(['Walworth 1']));

        expect(screen.getByTestId('club-teams-loading')).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.queryByTestId('club-teams-loading')).not.toBeInTheDocument();
        });
    });
});
