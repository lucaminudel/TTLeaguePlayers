import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { ProtectedRoute } from '../components/common/ProtectedRoute';
import { useAuth } from '../hooks/useAuth';
import { type KudosResponse, type KudosSummaryResponse, type KudosStandingsResponse } from '../api/kudosApi';
import { getCachedPlayerKudos, getCachedTeamKudos, getCachedKudosStandings } from '../api/cachedKudosApi';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { shortFormatFixtureDate } from '../utils/DateUtils';

interface KudosStandingsLocationState {
    league: string;
    season: string;
    team_name: string;
    team_division: string;
    person_name: string;
}

type TabType = 'Awarded' | 'Team' | 'Table';

export const KudosStandings: React.FC = () => {
    const location = useLocation();
    const { userId, activeSeasons } = useAuth();
    const [state, setState] = useState<KudosStandingsLocationState | null>(null);
    const [activeTab, setActiveTab] = useState<TabType>('Awarded');
    const [kudosList, setKudosList] = useState<KudosResponse[]>([]);
    const [teamKudosList, setTeamKudosList] = useState<KudosSummaryResponse[]>([]);
    const [standingsData, setStandingsData] = useState<KudosStandingsResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const locState = location.state as KudosStandingsLocationState | null;

        if (locState) {
            setState(locState);
        } else if (activeSeasons.length === 1) {
            const season = activeSeasons[0];
            setState({
                league: season.league,
                season: season.season,
                team_name: season.team_name,
                team_division: season.team_division,
                person_name: season.person_name,
            });
        }
        // TODO: Handle multiple active seasons selection
    }, [location.state, activeSeasons]);

    useEffect(() => {
        const fetchKudosAwarded = async () => {
            if (!state || !userId) return;
            setLoading(true);
            setError(null);
            try {
                const data = await getCachedPlayerKudos({
                    league: state.league,
                    season: state.season,
                    teamDivision: state.team_division,
                    teamName: state.team_name,
                    giver_person_name: state.person_name,
                    giverPersonSub: userId,
                }, (freshData) => { setKudosList(freshData); });
                setKudosList(data);
            } catch (err) {
                setError('Failed to fetch kudos history');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        const fetchTeamKudos = async () => {
            if (!state) return;
            setLoading(true);
            setError(null);
            try {
                const data = await getCachedTeamKudos({
                    league: state.league,
                    season: state.season,
                    teamDivision: state.team_division,
                    teamName: state.team_name,
                }, (freshData) => { setTeamKudosList(freshData); });
                setTeamKudosList(data);
            } catch (err) {
                setError('Failed to fetch team kudos');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        const fetchKudosStandings = async () => {
            if (!state) return;
            setLoading(true);
            setError(null);
            try {
                const data = await getCachedKudosStandings({
                    league: state.league,
                    season: state.season,
                    teamDivision: state.team_division,
                }, (freshData) => { setStandingsData(freshData); });
                setStandingsData(data);
            } catch (err) {
                setError('Failed to fetch kudos standings');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        if (state && activeTab === 'Awarded' && userId) {
            void fetchKudosAwarded();
        } else if (state && activeTab === 'Team') {
            void fetchTeamKudos();
        } else if (state && activeTab === 'Table') {
            void fetchKudosStandings();
        }
    }, [state, activeTab, userId]);

    const renderKudosList = () => {
        if (loading) return <div className="text-center p-4">Loading...</div>;
        if (error) return <ErrorMessage>{error}</ErrorMessage>;
        if (kudosList.length === 0) return <div className="text-center p-4 text-gray-500">No kudos awarded yet.</div>;

        return (
            <div className="space-y-2" data-testid="my-kudos-items">
                {kudosList.map((kudos) => {
                    const date = new Date(kudos.match_date_time * 1000);
                    // create-vite says unix timestamp (seconds)
                    // Previous awardKudos code: match_date_time: Math.floor(new Date(request.matchDateTime).getTime() / 1000)
                    // So it IS seconds.

                    return (
                        <div key={`${kudos.match_date_time.toString()}-${kudos.receiving_team}`} data-testid="my-kudos-item" className="flex justify-between items-center">
                            <div>
                                <span className="font-bold text-main-text text-sm">{kudos.receiving_team}</span>
                                <span className="text-sm text-secondary-text"> - {shortFormatFixtureDate(date)}</span>
                            </div>
                            <div className={`px-2 py-1 rounded text-xs font-bold w-20 text-center ${kudos.kudos_value > 0 ? 'bg-[#004d27] text-white' :
                                kudos.kudos_value === 0 ? 'bg-[#85a3c2] text-white' :
                                    'bg-[#F06400] text-white'
                                }`}>
                                {kudos.kudos_value > 0 ? 'Positive' : kudos.kudos_value === 0 ? 'Neutral' : 'Negative'}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderTeamKudosList = () => {
        if (loading) return <div className="text-center p-4">Loading...</div>;
        if (error) return <ErrorMessage>{error}</ErrorMessage>;
        if (teamKudosList.length === 0) return <div className="text-center p-4 text-gray-500">No kudos received yet.</div>;

        // Flatten the kudos summaries into individual kudos items
        const kudosItems: {
            key: string;
            opponentTeam: string;
            date: Date;
            kudosType: 'Positive' | 'Neutral' | 'Negative';
            kudosValue: number;
        }[] = [];

        teamKudosList.forEach((kudosSummary) => {
            const date = new Date(kudosSummary.match_date_time * 1000);
            const baseKey = `${kudosSummary.match_date_time.toString()}-${kudosSummary.home_team}-${kudosSummary.away_team}`;

            // Determine the opponent team (the one that's not the receiving team)
            const opponentTeam = kudosSummary.home_team === kudosSummary.receiving_team
                ? kudosSummary.away_team
                : kudosSummary.home_team;

            if (kudosSummary.positive_kudos_count > 0) {
                kudosItems.push({
                    key: `${baseKey}-positive`,
                    opponentTeam,
                    date,
                    kudosType: 'Positive',
                    kudosValue: 1
                });
            }
            if (kudosSummary.neutral_kudos_count > 0) {
                kudosItems.push({
                    key: `${baseKey}-neutral`,
                    opponentTeam,
                    date,
                    kudosType: 'Neutral',
                    kudosValue: 0
                });
            }
            if (kudosSummary.negative_kudos_count > 0) {
                kudosItems.push({
                    key: `${baseKey}-negative`,
                    opponentTeam,
                    date,
                    kudosType: 'Negative',
                    kudosValue: -1
                });
            }
        });

        return (
            <div className="space-y-2" data-testid="team-kudos-items">
                {kudosItems.map((kudos) => (
                    <div key={kudos.key} data-testid="team-kudos-item" className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <div className={`px-2 py-1 rounded text-xs font-bold w-20 text-center ${kudos.kudosValue > 0 ? 'bg-[#004d27] text-white' :
                                kudos.kudosValue === 0 ? 'bg-[#85a3c2] text-white' :
                                    'bg-[#F06400] text-white'
                                }`}>
                                {kudos.kudosType}
                            </div>
                            <div className="flex items-center">
                                <span className="font-bold text-main-text text-sm">{kudos.opponentTeam}</span>
                                <span className="text-sm text-secondary-text"> - {shortFormatFixtureDate(kudos.date)}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderKudosStandingsTable = () => {
        if (loading) return <div className="text-center p-4">Loading...</div>;
        if (error) return <ErrorMessage>{error}</ErrorMessage>;
        if (!standingsData || (standingsData.positive_kudos_table.length === 0 &&
            standingsData.neutral_kudos_table.length === 0 &&
            standingsData.negative_kudos_table.length === 0)) {
            return <div className="text-center p-4 text-gray-500">No standings data available.</div>;
        }

        return (
            <div className="space-y-6" data-testid="kudos-standings-tables">
                {/* Positive Kudos Table */}
                {standingsData.positive_kudos_table.length > 0 && (
                    <div data-testid="positive-kudos-standings">
                        <h3 className="text-xs font-bold text-main-text mb-3 uppercase tracking-wide">Positive Kudos Match Tally</h3>
                        <div className="space-y-2">
                            {standingsData.positive_kudos_table.map((entry) => (
                                <div key={entry.team_name} className="flex justify-between items-center" data-testid={`positive-standing-${entry.team_name}`}>
                                    <span className="font-bold text-main-text text-sm">{entry.team_name}</span>
                                    <div className="px-2 py-1 rounded text-xs font-bold bg-[#004d27] text-white">
                                        {entry.count}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Neutral Kudos Table */}
                {standingsData.neutral_kudos_table.length > 0 && (
                    <div data-testid="neutral-kudos-standings">
                        <h3 className="text-xs font-bold text-main-text mb-3 uppercase tracking-wide">Neutral Kudos Match Tally</h3>
                        <div className="space-y-2">
                            {standingsData.neutral_kudos_table.map((entry) => (
                                <div key={entry.team_name} className="flex justify-between items-center" data-testid={`neutral-standing-${entry.team_name}`}>
                                    <span className="font-bold text-main-text text-sm">{entry.team_name}</span>
                                    <div className="px-2 py-1 rounded text-xs font-bold bg-[#85a3c2] text-white">
                                        {entry.count}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Negative Kudos Table */}
                {standingsData.negative_kudos_table.length > 0 && (
                    <div data-testid="negative-kudos-standings">
                        <h3 className="text-xs font-bold text-main-text mb-2 uppercase tracking-wide">Negative Kudos Match Tally</h3>
                        <div className="space-y-2">
                            {standingsData.negative_kudos_table.map((entry) => (
                                <div key={entry.team_name} className="flex justify-between items-center" data-testid={`negative-standing-${entry.team_name}`}>
                                    <span className="font-bold text-main-text text-sm">{entry.team_name}</span>
                                    <div className="px-2 py-1 rounded text-xs font-bold bg-[#F06400] text-white">
                                        {entry.count}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    if (!state && activeSeasons.length === 0) {
        return (
            <ProtectedRoute>
                <MobileLayout>
                    <PageContainer title="Kudos Standings">
                        <div className="text-center p-4">No active seasons configured.</div>
                    </PageContainer>
                </MobileLayout>
            </ProtectedRoute>
        );
    }

    if (!state && activeSeasons.length > 1) {
        // Allow user to select season
        return (
            <ProtectedRoute>
                <MobileLayout>
                    <PageContainer title="Kudos Standings">
                        <div className="space-y-4">
                            {activeSeasons.map((season) => (
                                <button
                                    key={`${season.league}-${season.season}-${season.team_name}`}
                                    className="w-full bg-primary border border-gray-600 rounded-lg relative flex justify-center items-center hover:bg-gray-700 transition"
                                    onClick={() => {
                                        setState({
                                            league: season.league,
                                            season: season.season,
                                            team_name: season.team_name,
                                            team_division: season.team_division,
                                            person_name: season.person_name,
                                        });
                                    }}
                                >
                                    <div className="text-center">
                                        <h3 className="text-lg font-bold text-main-text">{season.team_name}</h3>
                                        <p className="text-sm text-secondary-text">{season.league} - {season.season}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </PageContainer>
                </MobileLayout>
            </ProtectedRoute>
        );
    }

    if (!state) return null; // Should assume one of the above hit or useEffect will set state

    return (
        <ProtectedRoute>
            <MobileLayout>
                <PageContainer title="Kudos Standings">
                    <div className="flex flex-col h-full">
                        {/* Header Info */}
                        <div
                            className={`bg-primary border border-gray-600 rounded-lg mb-4 relative flex justify-center items-center ${activeSeasons.length > 1 ? 'cursor-pointer' : ''}`}
                            onClick={() => { if (activeSeasons.length > 1) setState(null); }}
                            data-testid="active-season-header"
                        >
                            <div className="text-center">
                                <h3 className="text-lg font-bold text-main-text">{state.team_name}</h3>
                                <p className="text-sm text-secondary-text">{state.league} - {state.season}</p>
                            </div>
                            {activeSeasons.length > 1 && (
                                <div className="absolute right-4 text-2xl text-secondary-text">
                                    ▶
                                </div>
                            )}
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-gray-700 mb-4" data-testid="kudos-standings-tabs">
                            <button
                                className={`flex-1 py-2 text-center text-sm font-medium ${activeTab === 'Awarded' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-400'}`}
                                onClick={() => { setActiveTab('Awarded'); }}
                            >
                                Awarded
                            </button>
                            <button
                                className={`flex-1 py-2 text-center text-sm font-medium ${activeTab === 'Team' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-400'}`}
                                onClick={() => { setActiveTab('Team'); }}
                            >
                                Team's
                            </button>
                            <button
                                className={`flex-1 py-2 text-center text-sm font-medium ${activeTab === 'Table' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-400'}`}
                                onClick={() => { setActiveTab('Table'); }}
                            >
                                Table
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-grow overflow-auto">
                            {activeTab === 'Awarded' && (
                                <div>
                                    <div className="mb-2 text-sm text-secondary-text uppercase tracking-wide font-bold" data-testid='active tab'>
                                        Kudos Given By You<br /><br />
                                    </div>
                                    {renderKudosList()}
                                </div>
                            )}
                            {activeTab === 'Team' && (
                                <div>
                                    <div className="mb-2 text-sm text-secondary-text uppercase tracking-wide font-bold" data-testid='active tab'>
                                        Kudos Received By Your Team<br /><br />
                                    </div>
                                    {renderTeamKudosList()}
                                </div>
                            )}
                            {activeTab === 'Table' && (
                                <div>
                                    <div className="mb-4 text-sm text-secondary-text uppercase tracking-wide font-bold" data-testid='active tab'>
                                        Kudos Table<br /><br />
                                    </div>
                                    {renderKudosStandingsTable()}
                                </div>
                            )}
                        </div>
                    </div>
                </PageContainer>
            </MobileLayout>
        </ProtectedRoute>
    );
};
