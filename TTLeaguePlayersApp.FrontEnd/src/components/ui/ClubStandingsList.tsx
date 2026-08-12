import React, { useEffect, useState } from 'react';
import type { ManagedClubProcessor } from '../../service/active-season-processors/ManagedClubProcessor';
import type { ClubKudosStandingsEntry } from '../../api/kudosApi';
import { getCachedClubKudosStandings } from '../../api/cachedKudosApi';
import { ErrorMessage } from '../common/ErrorMessage';

interface ClubStandingsListProps {
    /** Injected rather than built here, following ClubTeamsList, so tests can stub it. */
    processor: ManagedClubProcessor;
    league: string;
    season: string;
    clubName: string;
    clubLocation: string;
}

// Same palette as the Kudos standings pills, so a count reads the same way across the app.
const POSITIVE_PILL = 'bg-[#004d27] text-white';
const NEUTRAL_PILL = 'bg-[#85a3c2] text-white';
const NEGATIVE_PILL = 'bg-[#F06400] text-white';

export const ClubStandingsList: React.FC<ClubStandingsListProps> = ({
    processor,
    league,
    season,
    clubName,
    clubLocation,
}) => {
    const [teams, setTeams] = useState<ClubKudosStandingsEntry[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasFailed, setHasFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setIsLoading(true);
            setHasFailed(false);
            // Rows never outlive the props they were fetched for. MyClubStandings keeps ONE list
            // mounted across a club switch (no `key`), so without this a failed load for the newly
            // selected club would leave the previous club's rows under the new club's heading.
            setTeams(null);
            try {
                const clubTeams = await processor.getClubTeams();

                // The parser KEEPS a team whose link carries no division, with an empty division, so
                // that My Club Teams still lists it. The standings endpoint rejects a blank division
                // for the WHOLE request, so sending one such team would turn this page into an error
                // for every team of the club. Dropping it costs one row; keeping it costs the page.
                const teamsWithADivision = clubTeams.filter((team) => team.team_division !== '');

                // A club with no teams must NOT reach the endpoint: an empty teams list is a 400,
                // and the client API has no guard of its own. A club whose teams ALL lack a division
                // lands here too and reads "no teams found", which is not strictly true — never seen
                // live, and still better than an error page.
                if (teamsWithADivision.length === 0) {
                    if (!cancelled) setTeams([]);
                    return;
                }

                const response = await getCachedClubKudosStandings({
                    league,
                    season,
                    club_name: clubName,
                    club_location: clubLocation,
                    teams: teamsWithADivision,
                });

                // Rendered in the order returned: the response carries one entry per requested team,
                // in the order they were sent. A left join, not a filter — no client-side join and
                // NO SORTING, so the page mirrors the club page.
                if (!cancelled) setTeams(response.teams);
            } catch (error) {
                // Unlike ClubTeamsList, which fails silently to the console: a blank standings area
                // is indistinguishable from a club with nothing to show, so this one says so.
                console.error('❌ Page event log loading club standings:', error);
                if (!cancelled) setHasFailed(true);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };

        void load();

        return () => { cancelled = true; };
    }, [processor, league, season, clubName, clubLocation]);

    if (isLoading) {
        return <p className="text-sm text-secondary-text" data-testid="club-standings-loading">Loading teams…</p>;
    }

    if (hasFailed) {
        // WORDING IS LOAD-BEARING: a club with no club_teams entry in the config (BCS, FLICK) throws
        // "Club ... not found in data source." from the fetcher and lands in this same branch. Saying
        // "this club has no teams" here would state something false about the club.
        return (
            <ErrorMessage testId="club-standings-error">
                The standings for this club could not be loaded. Please try again later.
            </ErrorMessage>
        );
    }

    if (teams === null) {
        return null;
    }

    if (teams.length === 0) {
        return <p className="text-sm text-secondary-text">No teams found for this club.</p>;
    }

    return (
        <div className="divide-y divide-gray-600" data-testid="club-standings">
            {teams.map((team) => (
                <div
                    key={team.team_name}
                    className="flex items-center gap-2 py-3"
                    data-testid={`club-standing-row-${team.team_name}`}
                >
                    <div className="flex-1 min-w-0 text-sm font-bold text-main-text" data-testid="club-standing-name">
                        {team.team_name}
                    </div>

                    <div
                        className={`w-10 shrink-0 px-2 py-1 rounded text-xs font-bold text-center ${POSITIVE_PILL}`}
                        data-testid="club-standing-positive"
                    >
                        {team.positive_count}
                    </div>
                    <div
                        className={`w-10 shrink-0 px-2 py-1 rounded text-xs font-bold text-center ${NEUTRAL_PILL}`}
                        data-testid="club-standing-neutral"
                    >
                        {team.neutral_count}
                    </div>
                    <div
                        className={`w-10 shrink-0 px-2 py-1 rounded text-xs font-bold text-center ${NEGATIVE_PILL}`}
                        data-testid="club-standing-negative"
                    >
                        {team.negative_count}
                    </div>
                </div>
            ))}
        </div>
    );
};
