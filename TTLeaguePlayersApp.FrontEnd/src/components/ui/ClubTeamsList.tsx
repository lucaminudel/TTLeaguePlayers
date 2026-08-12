import React, { useEffect, useState } from 'react';
import type { ManagedClubProcessor } from '../../service/active-season-processors/ManagedClubProcessor';
import type { TeamRegistrationEntry, TeamRegistrationStatus } from '../../types/invite';
import { getCachedTeamRegistrations } from '../../api/cachedInviteApi';
import { formatSingleDate } from '../../utils/DateUtils';

interface ClubTeamsListProps {
    /** Injected rather than built here, following ActiveSeasonCard, so tests can stub it. */
    processor: ManagedClubProcessor;
    league: string;
    season: string;
    clubName: string;
    clubLocation: string;
}

const STATUS_LABEL: Record<TeamRegistrationStatus, string> = {
    ACCEPTED: 'Registered',
    PENDING: 'Invite sent',
    NOT_INVITED: 'Not invited',
};

// Same palette as the Kudos standings pills, so a status reads the same way across the app.
const STATUS_PILL_COLOUR: Record<TeamRegistrationStatus, string> = {
    ACCEPTED: 'bg-[#004d27] text-white',
    PENDING: 'bg-[#85a3c2] text-white',
    NOT_INVITED: 'bg-[#F06400] text-white',
};

// Progress first. The club page already returns its teams in string order, and Array.prototype.sort
// is stable, so sorting on status alone preserves that order inside each group.
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
 * ACCEPTED as well, but is deliberately not shown there.
 */
function dateFor(team: TeamRegistrationEntry): string {
    if (team.status === 'ACCEPTED') {
        return team.accepted_at === null ? '' : formatSingleDate(team.accepted_at);
    }
    if (team.status === 'PENDING') {
        return team.created_at === undefined ? '' : formatSingleDate(team.created_at);
    }
    return '';
}

/** The invitee is shown on PENDING too — on a pending row they are the person to chase. */
function inviteeFor(team: TeamRegistrationEntry): string {
    if (team.status === 'NOT_INVITED') return '';
    return team.invitee_name ?? '';
}

export const ClubTeamsList: React.FC<ClubTeamsListProps> = ({
    processor,
    league,
    season,
    clubName,
    clubLocation,
}) => {
    const [teams, setTeams] = useState<TeamRegistrationEntry[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setIsLoading(true);
            // Rows never outlive the props they were fetched for. MyClubTeams keeps ONE list mounted
            // across a club switch (no `key`), so without this a failed load for the newly selected
            // club would leave the previous club's rows on screen under the new club's heading.
            setTeams(null);
            try {
                const clubTeams = await processor.getClubTeams();

                // A club with no teams must NOT reach the endpoint: an empty team_names is a 400,
                // and the client API has no guard of its own.
                if (clubTeams.length === 0) {
                    if (!cancelled) setTeams([]);
                    return;
                }

                const response = await getCachedTeamRegistrations({
                    league,
                    season,
                    club_name: clubName,
                    club_location: clubLocation,
                    // This page needs only the names. The division now travelling alongside each
                    // team is for the club-standings endpoint; the /invites/registrations contract
                    // is deliberately unchanged.
                    team_names: clubTeams.map((team) => team.team_name),
                });

                // Rendered directly: the response carries one entry per requested team, in the order
                // they were sent. A left join, not a filter — no client-side join is needed.
                if (!cancelled) setTeams(response.teams);
            } catch (error) {
                // Console-only, as everywhere else in the club-manager pages: the area renders blank.
                console.error('❌ Page event log loading club teams:', error);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };

        void load();

        return () => { cancelled = true; };
    }, [processor, league, season, clubName, clubLocation]);

    if (isLoading) {
        return <p className="text-sm text-secondary-text" data-testid="club-teams-loading">Loading teams…</p>;
    }

    if (teams === null) {
        return null;
    }

    if (teams.length === 0) {
        return <p className="text-sm text-secondary-text">No teams found for this club.</p>;
    }

    const sortedTeams = [...teams].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

    return (
        <div className="divide-y divide-gray-600" data-testid="club-teams">
            {sortedTeams.map((team) => (
                <div
                    key={team.team_name}
                    className="flex items-center gap-2 py-3"
                    data-testid={`club-team-row-${team.team_name}`}
                >
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-main-text" data-testid="club-team-name">
                            {team.team_name}
                        </div>
                        <div className="text-xs text-secondary-text">
                            <span data-testid="club-team-date">{dateFor(team)}</span>
                            {dateFor(team) && inviteeFor(team) ? ' \u00b7 ' : ''}
                            <span data-testid="club-team-invitee">{inviteeFor(team)}</span>
                        </div>
                    </div>

                    <div
                        className={`w-24 shrink-0 whitespace-nowrap px-2 py-1 rounded text-xs font-bold text-center ${STATUS_PILL_COLOUR[team.status]}`}
                        data-testid="club-team-status"
                    >
                        {STATUS_LABEL[team.status]}
                    </div>

                    {/* Reserved for the send / re-send invite icons. Empty while the page is read-only. */}
                    <div className="w-16 shrink-0" data-testid="club-team-actions"></div>
                </div>
            ))}
        </div>
    );
};
