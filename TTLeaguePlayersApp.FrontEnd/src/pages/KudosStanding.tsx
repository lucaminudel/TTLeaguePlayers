import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { ProtectedRoute } from '../components/common/ProtectedRoute';
import { useAuth } from '../hooks/useAuth';
import { getKudos, type KudosResponse } from '../api/kudosApi';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { formatFixtureDate } from '../utils/DateUtils';

interface KudosStandingLocationState {
    league: string;
    season: string;
    team_name: string;
    team_division: string;
    person_name: string;
}

type TabType = 'Awarded' | 'Team' | 'Table';

export const KudosStanding: React.FC = () => {
    const location = useLocation();
    const { userId, activeSeasons } = useAuth();
    const [state, setState] = useState<KudosStandingLocationState | null>(null);
    const [activeTab, setActiveTab] = useState<TabType>('Awarded');
    const [kudosList, setKudosList] = useState<KudosResponse[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const locState = location.state as KudosStandingLocationState | null;

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
                const data = await getKudos({
                    league: state.league,
                    season: state.season,
                    teamDivision: state.team_division,
                    teamName: state.team_name,
                    giverPersonSub: userId,
                });
                setKudosList(data);
            } catch (err) {
                setError('Failed to fetch kudos history');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        if (state && activeTab === 'Awarded' && userId) {
            void fetchKudosAwarded();
        }
    }, [state, activeTab, userId]);

    const renderKudosList = () => {
        if (loading) return <div className="text-center p-4">Loading...</div>;
        if (error) return <ErrorMessage>{error}</ErrorMessage>;
        if (kudosList.length === 0) return <div className="text-center p-4 text-gray-500">No kudos awarded yet.</div>;

        return (
            <div className="space-y-2">
                {kudosList.map((kudos) => {
                    const date = new Date(kudos.match_date_time * 1000);
                    // create-vite says unix timestamp (seconds)
                    // Previous awardKudos code: match_date_time: Math.floor(new Date(request.matchDateTime).getTime() / 1000)
                    // So it IS seconds.

                    return (
                        <div key={`${kudos.match_date_time.toString()}-${kudos.receiving_team}`} data-testid="kudos-item" className="flex justify-between items-center">
                            <div>
                                <span className="font-bold text-main-text text-sm">{kudos.receiving_team}</span>
                                <span className="text-sm text-secondary-text"> - {formatFixtureDate(date)}</span>
                            </div>
                            <div className={`px-2 py-1 rounded text-xs font-bold ${kudos.kudos_value > 0 ? 'bg-[#004d27] text-white' :
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

    if (!state && activeSeasons.length === 0) {
        return (
            <ProtectedRoute>
                <MobileLayout>
                    <PageContainer title="Kudos Standing">
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
                    <PageContainer title="Select Season">
                        <div className="space-y-4">
                            <p className="text-center mb-4">Please select a season to view standings:</p>
                            {activeSeasons.map((season) => (
                                <button
                                    key={`${season.league}-${season.season}-${season.team_name}`}
                                    className="w-full p-4 bg-primary border border-gray-600 rounded-lg text-left hover:bg-gray-700 transition"
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
                                    <div className="font-bold">{season.team_name}</div>
                                    <div className="text-sm text-secondary-text">{season.league} - {season.season}</div>
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
                <PageContainer title="Kudos Standing">
                    <div className="flex flex-col h-full">
                        {/* Header Info */}
                        <div className="mb-4 text-center">
                            <h2 className="text-lg font-bold text-main-text">{state.team_name}</h2>
                            <p className="text-sm text-secondary-text">{state.league} - {state.season}</p>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-gray-700 mb-4">
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
                                    <div className="mb-2 text-sm text-secondary-text uppercase tracking-wide font-bold">
                                        Kudos Given By You<br /><br />
                                    </div>
                                    {renderKudosList()}
                                </div>
                            )}
                            {activeTab === 'Team' && (
                                <div className="text-center p-8 text-gray-500">
                                    Team's Kudos feature coming soon.
                                </div>
                            )}
                            {activeTab === 'Table' && (
                                <div className="text-center p-8 text-gray-500">
                                    Kudos Table feature coming soon.
                                </div>
                            )}
                        </div>
                    </div>
                </PageContainer>
            </MobileLayout>
        </ProtectedRoute>
    );
};
