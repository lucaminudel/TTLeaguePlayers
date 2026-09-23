import React, { useCallback, useEffect, useState } from 'react';
import type { ActiveSeasonProcessor } from '../../service/active-season-processors/ActiveSeasonProcessor';
import type { PlayerRegistrationEntry, TeamRegistrationStatus } from '../../types/invite';
import { Role } from '../../types/invite';
import { getCachedTeamPlayersRegistrations } from '../../api/cachedInviteApi';
import { inviteApi } from '../../api/inviteApi';
import { ErrorMessage } from '../common/ErrorMessage';
import { formatSingleDate } from '../../utils/DateUtils';
import { toUserFriendlyApiError } from '../../utils/apiErrorUtils';
import { InvitePlayerDialog } from './InvitePlayerDialog';

interface TeamPlayersListProps {
    /** Injected rather than built here, following ClubTeamsList, so tests can stub it. */
    processor: ActiveSeasonProcessor;
    league: string;
    season: string;
    teamDivision: string;
    teamName: string;
    /** The captain's own name, as it will be stamped on the invites they send. */
    invitedBy: string;
}

// Same three maps as ClubTeamsList: a status reads the same way wherever it appears in the app.
const STATUS_LABEL: Record<TeamRegistrationStatus, string> = {
    ACCEPTED: 'Registered',
    PENDING: 'Invite sent',
    NOT_INVITED: 'Not invited',
};

const STATUS_PILL_COLOUR: Record<TeamRegistrationStatus, string> = {
    ACCEPTED: 'bg-[#004d27] text-white',
    PENDING: 'bg-[#85a3c2] text-white',
    NOT_INVITED: 'bg-[#F06400] text-white',
};

const STATUS_ORDER: Record<TeamRegistrationStatus, number> = {
    ACCEPTED: 0,
    PENDING: 1,
    NOT_INVITED: 2,
};

/**
 * Which date a row shows, if any.
 *
 * Branch on `status`, never on field presence: accepted_at is ALWAYS present and null on BOTH
 * PENDING and NOT_INVITED, so its null cannot tell those two apart. created_at is present on
 * ACCEPTED as well, but the accepted date is the one that matters there.
 */
function dateFor(player: PlayerRegistrationEntry): string {
    if (player.status === 'ACCEPTED') {
        return player.accepted_at === null ? '' : formatSingleDate(player.accepted_at);
    }
    if (player.status === 'PENDING') {
        return player.created_at === undefined ? '' : formatSingleDate(player.created_at);
    }
    return '';
}

function driftedInviteeName(player: PlayerRegistrationEntry): string {
    if (player.player_name === undefined || player.invitee_name === undefined) return '';

    const sameName = player.player_name.trim().toLocaleLowerCase() === player.invitee_name.trim().toLocaleLowerCase();

    return sameName ? '' : player.invitee_name;
}

function toUserFriendlyLoadError(error: unknown): string {
    let message = toUserFriendlyApiError(
        error,
        'The registration status of your team players could not be loaded. Please try again.'
    );

    const reasons = (error as { errors?: string[] }).errors;
    if (Array.isArray(reasons) && reasons.length > 0) {
        message += ` ( ${reasons.join(', ')} )`;
    }

    return message;
}

export const TeamPlayersList: React.FC<TeamPlayersListProps> = ({
    processor,
    league,
    season,
    teamDivision,
    teamName,
    invitedBy,
}) => {
    const [players, setPlayers] = useState<PlayerRegistrationEntry[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    // True when the league site could not give us a roster at all, which is a different state from
    // "the roster is empty" and from "the registrations call failed" - see the render below.
    const [isRosterUnavailable, setIsRosterUnavailable] = useState(false);
    // Set when the roster was read fine but the registration statuses could not be. Kept apart from
    // isRosterUnavailable because the two have different causes and different wording.
    const [loadError, setLoadError] = useState<string | null>(null);
    // The roster this list is showing, kept so that a refresh after sending an invite can re-read
    // the statuses WITHOUT scraping the league site again.
    const [rosterNames, setRosterNames] = useState<string[]>([]);
    // The player whose invite dialog is open, by the league site's spelling of their name.
    const [playerBeingInvited, setPlayerBeingInvited] = useState<string | null>(null);

    const readStatuses = useCallback(async (names: string[]) => {
        const response = await getCachedTeamPlayersRegistrations({
            league,
            season,
            team_division: teamDivision,
            team_name: teamName,
            player_names: names,
        });

        return response.players;
    }, [league, season, teamDivision, teamName]);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setIsLoading(true);
            setPlayers(null);
            setIsRosterUnavailable(false);
            setLoadError(null);
            setRosterNames([]);
            setPlayerBeingInvited(null);

            let names: string[];
            try {
                names = await processor.getTeamPlayers();
            } catch (error) {
                console.error('❌ Page event log loading team players:', error);
                if (!cancelled) {
                    setIsRosterUnavailable(true);
                    setIsLoading(false);
                }
                return;
            }

            try {
                if (names.length === 0) {
                    if (!cancelled) setPlayers([]);
                    return;
                }

                const registeredPlayers = await readStatuses(names);

                if (!cancelled) {
                    setRosterNames(names);
                    setPlayers(registeredPlayers);
                }
            } catch (error) {
                console.error('❌ Page event log loading team players registrations:', error);
                if (!cancelled) setLoadError(toUserFriendlyLoadError(error));
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };

        void load();

        return () => { cancelled = true; };
    }, [processor, readStatuses]);

    const sendInvite = async (playerName: string, email: string) => {
        const createdInvite = await inviteApi.createInvite({
            invitee_name: playerName,
            invitee_email_id: email,
            invitee_role: Role.PLAYER,
            invitee_team: teamName,
            team_division: teamDivision,
            league,
            season,
            invited_by: invitedBy,
        });

        setPlayerBeingInvited(null);

        setPlayers((current) => current?.map((player) => (
            player.player_name === playerName
                ? {
                    ...player,
                    // Just created, so it cannot be accepted yet.
                    status: 'PENDING',
                    invitee_role: Role.PLAYER,
                    accepted_at: createdInvite.accepted_at,
                    created_at: createdInvite.created_at,
                    nano_id: createdInvite.nano_id,
                    invitee_name: createdInvite.invitee_name,
                    invitee_email_id: createdInvite.invitee_email_id,
                }
                : player
        )) ?? current);

        try {
            setPlayers(await readStatuses(rosterNames));
        } catch (error) {
            console.error('❌ Page event log refreshing team players after an invite:', error);
        }
    };

    if (isLoading) {
        return <p className="text-sm text-secondary-text" data-testid="team-players-loading">Loading players…</p>;
    }

    if (isRosterUnavailable) {
        return (
            <p className="text-sm text-secondary-text" data-testid="team-players-unavailable">
                The player list for this league is not available.
            </p>
        );
    }

    if (loadError !== null) {
        return <ErrorMessage testId="team-players-error">{loadError}</ErrorMessage>;
    }

    if (players === null) {
        return null;
    }

    if (players.length === 0) {
        return (
            <p className="text-sm text-secondary-text" data-testid="team-players-empty">
                No players found for this team on the league site.
            </p>
        );
    }

    // Requested names carry player_name; the extras tail does not (see TeamPlayersRegistrationsResponse).
    const roster = players
        .filter((player) => player.player_name !== undefined)
        .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
    const extras = players.filter((player) => player.player_name === undefined);

    /**
     * Whether this roster row is the logged-in captain.
     */
    const isTheCaptainThemselves = (playerName: string | undefined): boolean =>
        playerName !== undefined
        && playerName.trim().toLocaleLowerCase() === invitedBy.trim().toLocaleLowerCase();

    const renderRow = (player: PlayerRegistrationEntry, name: string, testId: string, canInvite: boolean) => {
        const date = dateFor(player);
        const email = player.invitee_email_id ?? '';
        const drifted = driftedInviteeName(player);

        return (
            <div key={testId} className="flex items-center gap-2 py-3" data-testid={testId}>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-main-text">
                        <span data-testid="team-player-name">{name}</span>
                        {player.invitee_role === 'CAPTAIN' ? (
                            <span
                                className="ml-2 px-1.5 py-0.5 rounded bg-gray-600 text-white text-xs font-bold align-middle"
                                data-testid="team-player-role"
                            >
                                Captain
                            </span>
                        ) : null}
                    </div>
                    <div className="text-xs text-secondary-text break-words">
                        <span data-testid="team-player-date">{date}</span>
                        {date && email ? ' · ' : ''}
                        <span data-testid="team-player-email">{email}</span>
                        {drifted ? (
                            <>
                                {date || email ? ' · ' : ''}
                                <span data-testid="team-player-invitee">invited as {drifted}</span>
                            </>
                        ) : null}
                    </div>
                </div>

                {canInvite ? (
                    <button
                        type="button"
                        className={`w-24 shrink-0 whitespace-nowrap px-2 py-1 rounded border-2 border-white/80 text-xs font-bold text-center ${STATUS_PILL_COLOUR.NOT_INVITED}`}
                        onClick={() => { setPlayerBeingInvited(name); }}
                        data-testid="team-player-invite-button"
                    >
                        Invite
                    </button>
                ) : (
                    <div
                        className={`w-24 shrink-0 whitespace-nowrap px-2 py-1 rounded text-xs font-bold text-center ${STATUS_PILL_COLOUR[player.status]}`}
                        data-testid="team-player-status"
                    >
                        {STATUS_LABEL[player.status]}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div data-testid="team-players">
            <div className="divide-y divide-gray-600">
                {roster.map((player) => renderRow(
                    player,
                    player.player_name ?? '',
                    `team-player-row-${player.player_name ?? ''}`,

                    player.status === 'NOT_INVITED' && !isTheCaptainThemselves(player.player_name)
                ))}
            </div>

            {extras.length > 0 ? (
                <>
                    <p className="text-xs text-secondary-text pt-3" data-testid="team-players-extras-label">
                        Also invited — not on the team&apos;s league roster
                    </p>
                    <div className="divide-y divide-gray-600">
                        {extras.map((player) => renderRow(
                            player,
                            player.invitee_name ?? '',
                            `team-player-extra-row-${player.invitee_name ?? ''}`,
                            false
                        ))}
                    </div>
                </>
            ) : null}

            {playerBeingInvited !== null && (
                <InvitePlayerDialog
                    playerName={playerBeingInvited}
                    onCancel={() => { setPlayerBeingInvited(null); }}
                    onSend={(email) => sendInvite(playerBeingInvited, email)}
                />
            )}
        </div>
    );
};
