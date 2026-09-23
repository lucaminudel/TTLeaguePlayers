import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TeamPlayersList } from '../../../../src/components/ui/TeamPlayersList';
import type { ActiveSeasonProcessor } from '../../../../src/service/active-season-processors/ActiveSeasonProcessor';
import type { PlayerRegistrationEntry, TeamPlayersRegistrationsResponse } from '../../../../src/types/invite';
import { PageFetcherError } from '../../../../src/service/active-season-processors/clttl-2025/CLTTLActiveSeason2025PagesFetcher';
import { GeneralApiError } from '../../../../src/api/api';
import { setUnitFixedClockTime } from '../../TestClockUtils';

const inviteApiMocks = vi.hoisted(() => ({
    getCachedTeamPlayersRegistrations: vi.fn(),
}));

vi.mock('../../../../src/api/cachedInviteApi', () => ({
    getCachedTeamPlayersRegistrations: inviteApiMocks.getCachedTeamPlayersRegistrations,
}));

const createInviteMocks = vi.hoisted(() => ({ createInvite: vi.fn() }));
vi.mock('../../../../src/api/inviteApi', () => ({
    inviteApi: { createInvite: createInviteMocks.createInvite },
}));

describe('TeamPlayersList', () => {
    const LEAGUE = 'CLTTL';
    const SEASON = '2025-2026';
    const TEAM_DIVISION = 'Division 4';
    const TEAM_NAME = 'Morpeth 10';
    const INVITED_BY = 'Luca Minudel';

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

    function stubProcessor(players: string[] | Error): ActiveSeasonProcessor {
        return {
            getTeamFixtures: vi.fn(),
            getTeamPlayers: players instanceof Error
                ? vi.fn().mockRejectedValue(players)
                : vi.fn().mockResolvedValue(players),
        };
    }

    function entry(overrides: Partial<PlayerRegistrationEntry> = {}): PlayerRegistrationEntry {
        return {
            status: 'NOT_INVITED',
            accepted_at: null,
            ...overrides,
        };
    }

    function response(players: PlayerRegistrationEntry[]): TeamPlayersRegistrationsResponse {
        return { league: LEAGUE, season: SEASON, team_division: TEAM_DIVISION, team_name: TEAM_NAME, players };
    }

    const renderList = (processor: ActiveSeasonProcessor) => render(
        <TeamPlayersList
            processor={processor}
            league={LEAGUE}
            season={SEASON}
            teamDivision={TEAM_DIVISION}
            teamName={TEAM_NAME}
            invitedBy={INVITED_BY}
        />
    );

    const rowOf = (playerName: string) => screen.getByTestId(`team-player-row-${playerName}`);

    // ---------------------------------------------------------------- loading and request

    it('shows a loading line, then the rows', async () => {
        inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(
            response([entry({ player_name: 'Kevin Ji' })])
        );

        renderList(stubProcessor(['Kevin Ji']));

        expect(screen.getByTestId('team-players-loading')).toHaveTextContent('Loading players…');
        await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });
        expect(screen.queryByTestId('team-players-loading')).toBeNull();
    });

    it('asks the endpoint for exactly the roster names, in the roster order', async () => {
        inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([]));

        renderList(stubProcessor(['Kevin Ji', 'Suzy Song']));

        await waitFor(() => {
            expect(inviteApiMocks.getCachedTeamPlayersRegistrations).toHaveBeenCalledWith({
                league: LEAGUE,
                season: SEASON,
                team_division: TEAM_DIVISION,
                team_name: TEAM_NAME,
                player_names: ['Kevin Ji', 'Suzy Song'],
            });
        });
    });

    // An empty player_names is a 400 from the endpoint, and the client has no guard of its own.
    it('does not call the endpoint when the league site lists no players for the team', async () => {
        renderList(stubProcessor([]));

        await waitFor(() => {
            expect(screen.getByTestId('team-players-empty'))
                .toHaveTextContent('No players found for this team on the league site.');
        });
        expect(inviteApiMocks.getCachedTeamPlayersRegistrations).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------------- statuses, dates, e-mail

    it('labels the three statuses', async () => {
        inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([
            entry({ player_name: 'Registered Player', status: 'ACCEPTED', accepted_at: epochOf('2026-02-03T00:00:00Z') }),
            entry({ player_name: 'Pending Player', status: 'PENDING', created_at: epochOf('2026-01-09T00:00:00Z') }),
            entry({ player_name: 'New Player' }),
        ]));

        renderList(stubProcessor(['Registered Player', 'Pending Player', 'New Player']));

        await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });
        expect(within(rowOf('Registered Player')).getByTestId('team-player-status')).toHaveTextContent('Registered');
        expect(within(rowOf('Pending Player')).getByTestId('team-player-status')).toHaveTextContent('Invite sent');
        expect(within(rowOf('New Player')).queryByTestId('team-player-status')).toBeNull();
        expect(within(rowOf('New Player')).getByTestId('team-player-invite-button')).toHaveTextContent('Invite');
    });

    it('gives the Invite control a border, and the status labels none', async () => {
        inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([
            entry({ player_name: 'New Player' }),
            entry({ player_name: 'Pending Player', status: 'PENDING', created_at: epochOf('2026-01-09T00:00:00Z') }),
        ]));

        renderList(stubProcessor(['New Player', 'Pending Player']));

        await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });
        expect(screen.getByTestId('team-player-invite-button').className).toContain('border');
        expect(within(rowOf('Pending Player')).getByTestId('team-player-status').className).not.toContain('border');
    });

    it('keeps the Not invited label on a row that cannot be invited', async () => {
        inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([
            entry({ player_name: INVITED_BY }),
        ]));

        renderList(stubProcessor([INVITED_BY]));

        await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });
        expect(within(rowOf(INVITED_BY)).getByTestId('team-player-status')).toHaveTextContent('Not invited');
        expect(within(rowOf(INVITED_BY)).queryByTestId('team-player-invite-button')).toBeNull();
    });

    it('shows the accepted date on a registered row and the sent date on a pending row, and no date when not invited', async () => {
        inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([
            entry({
                player_name: 'Registered Player',
                status: 'ACCEPTED',
                accepted_at: epochOf('2026-02-03T00:00:00Z'),
                created_at: epochOf('2026-01-01T00:00:00Z'),
            }),
            entry({ player_name: 'Pending Player', status: 'PENDING', created_at: epochOf('2026-01-09T00:00:00Z') }),
            entry({ player_name: 'New Player' }),
        ]));

        renderList(stubProcessor(['Registered Player', 'Pending Player', 'New Player']));

        await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });
        expect(within(rowOf('Registered Player')).getByTestId('team-player-date')).toHaveTextContent('3 Feb');
        expect(within(rowOf('Pending Player')).getByTestId('team-player-date')).toHaveTextContent('9 Jan');
        expect(within(rowOf('New Player')).getByTestId('team-player-date')).toHaveTextContent('');
    });

    it('shows no date on a not-invited row even when the payload carries dates', async () => {
        inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([
            entry({
                player_name: 'New Player',
                status: 'NOT_INVITED',
                created_at: epochOf('2026-01-09T00:00:00Z'),
                accepted_at: epochOf('2026-02-03T00:00:00Z'),
            }),
        ]));

        renderList(stubProcessor(['New Player']));

        await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });
        expect(within(rowOf('New Player')).getByTestId('team-player-date')).toHaveTextContent('');
    });

    it('shows the invitee e-mail on invited rows and nothing on a not-invited row', async () => {
        inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([
            entry({ player_name: 'Pending Player', status: 'PENDING', created_at: epochOf('2026-01-09T00:00:00Z'), invitee_email_id: 'pending@user.test' }),
            entry({ player_name: 'New Player' }),
        ]));

        renderList(stubProcessor(['Pending Player', 'New Player']));

        await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });
        expect(within(rowOf('Pending Player')).getByTestId('team-player-email')).toHaveTextContent('pending@user.test');
        expect(within(rowOf('New Player')).getByTestId('team-player-email')).toHaveTextContent('');
    });

    it('tags a row whose invite is the CAPTAIN one, and only that row', async () => {
        inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([
            entry({ player_name: 'The Captain', status: 'ACCEPTED', accepted_at: epochOf('2026-02-03T00:00:00Z'), invitee_role: 'CAPTAIN' }),
            entry({ player_name: 'A Player', status: 'ACCEPTED', accepted_at: epochOf('2026-02-04T00:00:00Z'), invitee_role: 'PLAYER' }),
        ]));

        renderList(stubProcessor(['The Captain', 'A Player']));

        await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });
        expect(within(rowOf('The Captain')).getByTestId('team-player-role')).toHaveTextContent('Captain');
        expect(within(rowOf('A Player')).queryByTestId('team-player-role')).toBeNull();
    });

    // ---------------------------------------------------------------- order

    it('orders the roster progress-first, keeping the roster order inside each status', async () => {
        inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([
            entry({ player_name: 'Not Invited One' }),
            entry({ player_name: 'Pending One', status: 'PENDING', created_at: epochOf('2026-01-09T00:00:00Z') }),
            entry({ player_name: 'Accepted One', status: 'ACCEPTED', accepted_at: epochOf('2026-02-03T00:00:00Z') }),
            entry({ player_name: 'Not Invited Two' }),
        ]));

        renderList(stubProcessor(['Not Invited One', 'Pending One', 'Accepted One', 'Not Invited Two']));

        await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });
        const names = screen.getAllByTestId('team-player-name').map((element) => element.textContent);
        expect(names).toEqual(['Accepted One', 'Pending One', 'Not Invited One', 'Not Invited Two']);
    });

    // ---------------------------------------------------------------- extras

    it('renders the extras after the roster, under their own label, keyed by the stored name', async () => {
        inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([
            entry({ player_name: 'On The Roster' }),
            entry({ status: 'PENDING', created_at: epochOf('2026-01-02T00:00:00Z'), invitee_name: 'Left The Team', invitee_email_id: 'left@user.test' }),
        ]));

        renderList(stubProcessor(['On The Roster']));

        await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });
        expect(screen.getByTestId('team-players-extras-label'))
            .toHaveTextContent("Also invited — not on the team's league roster");
        const extraRow = screen.getByTestId('team-player-extra-row-Left The Team');
        expect(within(extraRow).getByTestId('team-player-name')).toHaveTextContent('Left The Team');
        expect(within(extraRow).getByTestId('team-player-status')).toHaveTextContent('Invite sent');
        expect(within(extraRow).getByTestId('team-player-email')).toHaveTextContent('left@user.test');
    });

    it('shows no extras label when every invite matched a roster name', async () => {
        inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([
            entry({ player_name: 'On The Roster' }),
        ]));

        renderList(stubProcessor(['On The Roster']));

        await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });
        expect(screen.queryByTestId('team-players-extras-label')).toBeNull();
    });

    // ---------------------------------------------------------------- spelling drift

    it('shows the stored spelling when it differs from the roster spelling', async () => {
        inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([
            entry({
                player_name: 'Michele de Giovanni',
                status: 'ACCEPTED',
                accepted_at: epochOf('2026-02-03T00:00:00Z'),
                invitee_name: 'Michele De Giovani',
            }),
        ]));

        renderList(stubProcessor(['Michele de Giovanni']));

        await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });
        expect(within(rowOf('Michele de Giovanni')).getByTestId('team-player-invitee'))
            .toHaveTextContent('invited as Michele De Giovani');
    });

    it('does not report drift when the two spellings differ only by case or surrounding space', async () => {
        inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([
            entry({
                player_name: 'Michele de Giovanni',
                status: 'ACCEPTED',
                accepted_at: epochOf('2026-02-03T00:00:00Z'),
                invitee_name: '  Michele De Giovanni ',
            }),
        ]));

        renderList(stubProcessor(['Michele de Giovanni']));

        await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });
        expect(within(rowOf('Michele de Giovanni')).queryByTestId('team-player-invitee')).toBeNull();
    });

    // ---------------------------------------------------------------- the capability token

    it('never puts the invite nano_id in the DOM', async () => {
        inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([
            entry({ player_name: 'Pending Player', status: 'PENDING', created_at: epochOf('2026-01-09T00:00:00Z'), nano_id: 'SECRET42' }),
            entry({ status: 'PENDING', created_at: epochOf('2026-01-02T00:00:00Z'), invitee_name: 'Left The Team', nano_id: 'SECRET77' }),
        ]));

        const { container } = renderList(stubProcessor(['Pending Player']));

        await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });
        expect(container.innerHTML).not.toContain('SECRET42');
        expect(container.innerHTML).not.toContain('SECRET77');
    });

    // ---------------------------------------------------------------- failures

    it('says the player list is unavailable when the division has no configured players page', async () => {
        renderList(stubProcessor(new Error('Division "Division 2" not found in data source.')));

        await waitFor(() => {
            expect(screen.getByTestId('team-players-unavailable'))
                .toHaveTextContent('The player list for this league is not available.');
        });
        expect(screen.queryByTestId('team-players')).toBeNull();
        expect(consoleErrorSpy).toHaveBeenCalled();
        expect(inviteApiMocks.getCachedTeamPlayersRegistrations).not.toHaveBeenCalled();
    });

    it('says the player list is unavailable when the team is not on the division page', async () => {
        renderList(stubProcessor(new Error('Team "Morpeth 10" not found in division "Division 4".')));

        await waitFor(() => { expect(screen.getByTestId('team-players-unavailable')).toBeTruthy(); });
    });

    it('says the player list is unavailable when the league site cannot be fetched', async () => {
        renderList(stubProcessor(new PageFetcherError('The page or website is not available after 3 attempts: http://site. Details: boom')));

        await waitFor(() => { expect(screen.getByTestId('team-players-unavailable')).toBeTruthy(); });
    });

    it('explains itself when the registrations endpoint fails', async () => {
        inviteApiMocks.getCachedTeamPlayersRegistrations.mockRejectedValue(new GeneralApiError('Connection error'));

        renderList(stubProcessor(['Kevin Ji']));

        await waitFor(() => {
            expect(screen.getByTestId('team-players-error'))
                .toHaveTextContent('Network error. Please check your internet connection.');
        });
        expect(screen.queryByTestId('team-players')).toBeNull();
        expect(screen.queryByTestId('team-players-unavailable')).toBeNull();
        expect(screen.queryByTestId('team-players-empty')).toBeNull();
        expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('falls back to its own wording when the failure is not an Error', async () => {
        inviteApiMocks.getCachedTeamPlayersRegistrations.mockRejectedValue('boom');

        renderList(stubProcessor(['Kevin Ji']));

        await waitFor(() => {
            expect(screen.getByTestId('team-players-error'))
                .toHaveTextContent('The registration status of your team players could not be loaded. Please try again.');
        });
    });

    it('appends the field-level reasons a rejected request came back with', async () => {
        inviteApiMocks.getCachedTeamPlayersRegistrations.mockRejectedValue(
            new GeneralApiError('Validation failed', 400, undefined, ['player_names is required'])
        );

        renderList(stubProcessor(['Kevin Ji']));

        await waitFor(() => {
            expect(screen.getByTestId('team-players-error')).toHaveTextContent('player_names is required');
        });
    });

    // ---------------------------------------------------------------- inviting

    describe('inviting a player', () => {
        const typeEmailAndSend = (email: string) => {
            fireEvent.change(screen.getByTestId('invite-player-email'), { target: { value: email } });
            fireEvent.click(screen.getByTestId('invite-player-send'));
        };

        it('offers Invite on a not-invited roster row only', async () => {
            inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([
                entry({ player_name: 'New Player' }),
                entry({ player_name: 'Pending Player', status: 'PENDING', created_at: epochOf('2026-01-09T00:00:00Z') }),
                entry({ player_name: 'Registered Player', status: 'ACCEPTED', accepted_at: epochOf('2026-02-03T00:00:00Z') }),
                entry({ status: 'PENDING', created_at: epochOf('2026-01-02T00:00:00Z'), invitee_name: 'Left The Team' }),
            ]));

            renderList(stubProcessor(['New Player', 'Pending Player', 'Registered Player']));

            await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });
            expect(within(rowOf('New Player')).getByTestId('team-player-invite-button')).toBeTruthy();
            expect(within(rowOf('Pending Player')).queryByTestId('team-player-invite-button')).toBeNull();
            expect(within(rowOf('Registered Player')).queryByTestId('team-player-invite-button')).toBeNull();
            expect(within(screen.getByTestId('team-player-extra-row-Left The Team')).queryByTestId('team-player-invite-button')).toBeNull();
        });

        it('does not offer Invite on the captain\'s own row', async () => {
            inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([
                entry({ player_name: INVITED_BY }),
                entry({ player_name: 'Kevin Ji' }),
            ]));

            renderList(stubProcessor([INVITED_BY, 'Kevin Ji']));

            await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });
            expect(within(rowOf(INVITED_BY)).queryByTestId('team-player-invite-button')).toBeNull();
            expect(within(rowOf('Kevin Ji')).getByTestId('team-player-invite-button')).toBeTruthy();
        });

        it('recognises the captain\'s own row despite case and surrounding space', async () => {
            inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([
                entry({ player_name: '  luca MINUDEL ' }),
            ]));

            renderList(stubProcessor(['  luca MINUDEL ']));

            await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });
            expect(screen.queryByTestId('team-player-invite-button')).toBeNull();
        });

        it('opens the dialog for the player whose row was clicked', async () => {
            inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([
                entry({ player_name: 'Kevin Ji' }),
                entry({ player_name: 'Suzy Song' }),
            ]));

            renderList(stubProcessor(['Kevin Ji', 'Suzy Song']));
            await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });

            fireEvent.click(within(rowOf('Suzy Song')).getByTestId('team-player-invite-button'));

            expect(screen.getByTestId('invite-player-dialog')).toHaveTextContent('Invite Suzy Song');
        });

        it('creates a PLAYER invite for this team, under the roster spelling', async () => {
            inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([
                entry({ player_name: 'Kevin Ji' }),
            ]));
            createInviteMocks.createInvite.mockResolvedValue({ nano_id: 'NEWINVITE' });

            renderList(stubProcessor(['Kevin Ji']));
            await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });

            fireEvent.click(screen.getByTestId('team-player-invite-button'));
            typeEmailAndSend('kevin@user.test');

            await waitFor(() => {
                expect(createInviteMocks.createInvite).toHaveBeenCalledWith({
                    invitee_name: 'Kevin Ji',
                    invitee_email_id: 'kevin@user.test',
                    invitee_role: 'PLAYER',
                    invitee_team: TEAM_NAME,
                    team_division: TEAM_DIVISION,
                    league: LEAGUE,
                    season: SEASON,
                    invited_by: INVITED_BY,
                });
            });
        });

        it('closes the dialog and re-reads the statuses, showing the invite as sent', async () => {
            inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValueOnce(response([
                entry({ player_name: 'Kevin Ji' }),
            ]));
            createInviteMocks.createInvite.mockResolvedValue({ nano_id: 'NEWINVITE' });

            renderList(stubProcessor(['Kevin Ji']));
            await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });

            // What the endpoint reports once the invite exists.
            inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([
                entry({
                    player_name: 'Kevin Ji',
                    status: 'PENDING',
                    created_at: epochOf('2026-05-20T00:00:00Z'),
                    invitee_email_id: 'kevin@user.test',
                }),
            ]));

            fireEvent.click(screen.getByTestId('team-player-invite-button'));
            typeEmailAndSend('kevin@user.test');

            await waitFor(() => { expect(screen.queryByTestId('invite-player-dialog')).toBeNull(); });
            expect(inviteApiMocks.getCachedTeamPlayersRegistrations).toHaveBeenCalledTimes(2);
            // The second read asks for the same roster: the site is not scraped again.
            expect(inviteApiMocks.getCachedTeamPlayersRegistrations).toHaveBeenLastCalledWith(
                expect.objectContaining({ player_names: ['Kevin Ji'] })
            );
            expect(within(rowOf('Kevin Ji')).getByTestId('team-player-status')).toHaveTextContent('Invite sent');
            expect(within(rowOf('Kevin Ji')).getByTestId('team-player-date')).toHaveTextContent('20 May');
            expect(within(rowOf('Kevin Ji')).getByTestId('team-player-email')).toHaveTextContent('kevin@user.test');
        });

        it('shows the invite as sent even when the refresh afterwards fails', async () => {
            inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValueOnce(response([
                entry({ player_name: 'Kevin Ji' }),
            ]));
            createInviteMocks.createInvite.mockResolvedValue({
                nano_id: 'NEWINVITE',
                invitee_name: 'Kevin Ji',
                invitee_email_id: 'kevin@user.test',
                invitee_role: 'PLAYER',
                created_at: epochOf('2026-05-20T00:00:00Z'),
                accepted_at: null,
            });

            renderList(stubProcessor(['Kevin Ji']));
            await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });

            inviteApiMocks.getCachedTeamPlayersRegistrations.mockRejectedValue(new Error('500'));

            fireEvent.click(screen.getByTestId('team-player-invite-button'));
            typeEmailAndSend('kevin@user.test');

            await waitFor(() => { expect(screen.queryByTestId('invite-player-dialog')).toBeNull(); });
            const row = rowOf('Kevin Ji');
            expect(within(row).getByTestId('team-player-status')).toHaveTextContent('Invite sent');
            expect(within(row).getByTestId('team-player-date')).toHaveTextContent('20 May');
            expect(within(row).getByTestId('team-player-email')).toHaveTextContent('kevin@user.test');
            // No second chance to invite the same person, which is the point of the whole thing.
            expect(within(row).queryByTestId('team-player-invite-button')).toBeNull();
        });

        it('keeps the dialog open, with the reason, when creating the invite fails', async () => {
            inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([
                entry({ player_name: 'Kevin Ji' }),
            ]));
            createInviteMocks.createInvite.mockRejectedValue(new Error('Connection error'));

            renderList(stubProcessor(['Kevin Ji']));
            await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });

            fireEvent.click(screen.getByTestId('team-player-invite-button'));
            typeEmailAndSend('kevin@user.test');

            await waitFor(() => { expect(screen.getByTestId('invite-player-error')).toBeTruthy(); });
            expect(screen.getByTestId('invite-player-dialog')).toBeTruthy();
            expect(inviteApiMocks.getCachedTeamPlayersRegistrations).toHaveBeenCalledTimes(1);
        });

        it('never renders the nano_id of the invite it just created', async () => {
            inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([
                entry({ player_name: 'Kevin Ji' }),
            ]));
            createInviteMocks.createInvite.mockResolvedValue({ nano_id: 'FRESHSECRET' });

            const { container } = renderList(stubProcessor(['Kevin Ji']));
            await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });

            fireEvent.click(screen.getByTestId('team-player-invite-button'));
            typeEmailAndSend('kevin@user.test');

            await waitFor(() => { expect(screen.queryByTestId('invite-player-dialog')).toBeNull(); });
            expect(container.innerHTML).not.toContain('FRESHSECRET');
        });

        it('closes the dialog without creating anything when cancelled', async () => {
            inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([
                entry({ player_name: 'Kevin Ji' }),
            ]));

            renderList(stubProcessor(['Kevin Ji']));
            await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });

            fireEvent.click(screen.getByTestId('team-player-invite-button'));
            fireEvent.click(screen.getByTestId('invite-player-cancel'));

            expect(screen.queryByTestId('invite-player-dialog')).toBeNull();
            expect(createInviteMocks.createInvite).not.toHaveBeenCalled();
        });
    });

    // ---------------------------------------------------------------- props change

    it('drops the previous team rows when the props change', async () => {
        inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([
            entry({ player_name: 'Kevin Ji' }),
        ]));

        const { rerender } = renderList(stubProcessor(['Kevin Ji']));
        await waitFor(() => { expect(screen.getByTestId('team-players')).toBeTruthy(); });

        inviteApiMocks.getCachedTeamPlayersRegistrations.mockResolvedValue(response([
            entry({ player_name: 'Other Team Player' }),
        ]));
        rerender(
            <TeamPlayersList
                processor={stubProcessor(['Other Team Player'])}
                league={LEAGUE}
                season={SEASON}
                teamDivision="Division 2"
                teamName="Morpeth B"
                invitedBy={INVITED_BY}
            />
        );

        await waitFor(() => { expect(screen.getByTestId('team-player-row-Other Team Player')).toBeTruthy(); });
        expect(screen.queryByTestId('team-player-row-Kevin Ji')).toBeNull();
    });
});
