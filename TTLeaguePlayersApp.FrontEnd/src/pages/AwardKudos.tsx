import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { ProtectedRoute } from '../components/common/ProtectedRoute';
import { Button } from '../components/common/Button';
import { formatFixtureDate } from '../utils/DateUtils';
import { awardKudos } from '../api/kudosApi';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { useAuth } from '../hooks/useAuth';

type KudosType = 'Positive' | 'Neutral' | 'Negative';

interface AwardKudosLocationState {
    league: string;
    season: string;
    teamDivision: string;
    teamName: string;
    personName: string;
    opponentTeam: string;
    matchDateTime: string;
    isHome: boolean;
    venue: string;
}

export const AwardKudos: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { userId, refreshActiveSeasons } = useAuth();
    const state = location.state as AwardKudosLocationState | null;
    const [showGuidelines, setShowGuidelines] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [selectedKudos, setSelectedKudos] = useState<KudosType | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // If no state is provided, redirect back to kudos page
    if (!state) {
        return (
            <ProtectedRoute>
                <MobileLayout>
                    <PageContainer title="Award Kudos">
                        <div className="space-y-4">
                            <p className="text-base sm:text-lg">
                                No match information provided. Please select a match from the Kudos page.
                            </p>
                            <Button onClick={() => { void navigate('/kudos'); }} fullWidth>
                                Back to Kudos
                            </Button>
                        </div>
                    </PageContainer>
                </MobileLayout>
            </ProtectedRoute>
        );
    }

    const matchDate = new Date(state.matchDateTime);
    const dateStr = formatFixtureDate(matchDate);

    const handleKudosClick = (type: KudosType) => {
        setSelectedKudos(type);
        setShowConfirmModal(true);
    };

    const handleConfirm = async () => {
        if (!selectedKudos) return;

        setIsSubmitting(true);
        setError(null);

        const kudosValueMap: Record<KudosType, number> = {
            'Positive': 1,
            'Neutral': 0,
            'Negative': -1
        };

        try {
            await awardKudos({
                league: state.league,
                season: state.season,
                teamDivision: state.teamDivision,
                teamName: state.teamName,
                personName: state.personName,
                giverPersonSub: userId ?? '',
                opponentTeam: state.opponentTeam,
                matchDateTime: state.matchDateTime,
                isHome: state.isHome,
                venue: state.venue,
                kudosValue: kudosValueMap[selectedKudos]
            });

            // Refresh local user attributes so 'latest_kudos' is updated in the UI
            await refreshActiveSeasons();

            // On success, navigate to kudos standing page
            void navigate('/kudos-standing', {
                state: {
                    league: state.league,
                    season: state.season,
                    team_name: state.teamName,
                    team_division: state.teamDivision,
                    person_name: state.personName,
                }
            });
        } catch (err) {
            let userFriendlyMessage = 'Something went wrong while awarding kudos. Please try again.';

            if (err instanceof Error) {
                const msg = err.message.toLowerCase();
                if (msg.includes('connection error')) {
                    userFriendlyMessage = 'Network error. Please check your internet connection.';
                } else if (msg.includes('timed out')) {
                    userFriendlyMessage = 'The request took too long. Please check your connection and try again.';
                } else if (
                    msg.includes('failed to fetch') ||
                    msg.includes('500') ||
                    msg.includes('404') ||
                    msg.includes('invalid request body') ||
                    msg.includes('json') ||
                    msg.includes('deserialization')
                ) {
                    userFriendlyMessage = 'The server is having trouble right now. Please try again in a few minutes.';
                } else {
                    // If it's a specific message from the API (not technical), use it
                    userFriendlyMessage = err.message;
                }
            }

            setError(userFriendlyMessage);
            setIsSubmitting(false);
        }
    };

    return (
        <ProtectedRoute>
            <MobileLayout>
                <PageContainer title="Award Kudos">
                    <div className="space-y-6 flex flex-col min-h-[70vh]" data-testid="award-kudos-page">
                        <div className="bg-primary border border-gray-600 rounded-lg p-2 text-center">
                            <p className="text-secondary-text text-sm sm:text-base uppercase tracking-wide mt-2 font-bold">
                                FOR THIS MATCH
                            </p>
                            <p className="text-base sm:text-lg">
                                {state.isHome ? 'Home game' : `Away game, ${state.venue}`}, {dateStr}<br />
                                Vs {state.opponentTeam}
                            </p>
                        </div>

                        <div className="flex-grow flex flex-col space-y-4">
                            <Button
                                className="!bg-[#004d27] hover:!bg-[#143D33] py-12 flex-grow flex items-center"
                                fullWidth
                                onClick={() => { handleKudosClick('Positive'); }}
                            >
                                Positive Kudos
                            </Button>

                            <Button
                                className="!bg-[#85a3c2] hover:!bg-[#6a8bb1] py-12 flex-grow flex items-center"
                                fullWidth
                                onClick={() => { handleKudosClick('Neutral'); }}
                            >
                                Neutral Kudos
                            </Button>

                            <Button
                                className="!bg-[#F06400] hover:!bg-[#CC5500] py-12 flex-grow flex items-center"
                                fullWidth
                                onClick={() => { handleKudosClick('Negative'); }}
                            >
                                <span className="p-0 m-0">Negative Kudos</span>
                            </Button>
                        </div>

                        <div className="mt-4 text-center">
                            <button
                                onClick={() => { setShowGuidelines(true); }}
                                className="text-main-text text-sm hover:underline"
                            >
                                Rating guidelines
                            </button>
                        </div>
                    </div>

                    {showGuidelines && (
                        <div
                            className="fixed inset-0 z-50 bg-primary-base overflow-y-auto animate-fadeIn"
                        >
                            <div className="max-w-xl mx-auto min-h-full flex flex-col p-6 sm:p-8">
                                <div className="flex justify-between items-center mb-6 sm:mb-8">
                                    <h2 className="text-xl sm:text-2xl font-bold text-main-text">Rating Guidelines</h2>
                                    <button
                                        onClick={() => { setShowGuidelines(false); }}
                                        className="text-secondary-text hover:text-main-text p-2 bg-gray-800/50 rounded-full transition-colors"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>

                                <div className="space-y-8 flex-grow">
                                    <div>
                                        <h3 className="text-base sm:text-lg font-bold text-[#48bb78] mb-3 border-b border-gray-700 pb-2 uppercase tracking-wide">Award positive Kudos for:</h3>
                                        <ul className="space-y-4">
                                            <li className="flex flex-col">
                                                <span className="text-sm text-secondary-text leading-relaxed"><b className="text-main-text">Happy Atmosphere</b> The environment was friendly, inclusive, and kind (including players, supporters, and staff).</span>
                                            </li>
                                            <li className="flex flex-col">
                                                <span className="text-sm text-secondary-text leading-relaxed"><b className="text-main-text">Professionalism</b> The match started on time, progressed smoothly, was played and umpired with good sportsmanship, and disputes, if any, were handled calmly and fairly.</span>
                                            </li>
                                            <li className="flex flex-col">
                                                <span className="text-sm text-secondary-text leading-relaxed"><b className="text-main-text">Accessibility</b> The venue was easy to find, well-prepared (nets, tables, etc.), and the basic facilities (changing rooms/toilets/etc.) were available and in good condition.</span>
                                            </li>
                                        </ul>
                                    </div>

                                    <div>
                                        <h3 className="text-base sm:text-lg font-bold text-[#f56565] mb-3 border-b border-gray-700 pb-2 uppercase tracking-wide">Award negative Kudos for:</h3>
                                        <ul className="space-y-4">
                                            <li className="flex flex-col">
                                                <span className="text-sm text-secondary-text leading-relaxed"><b className="text-main-text">Hostile Atmosphere</b> There were episodes of hostile, unwelcoming, disrespectful or aggressive behaviour from the opponents or their supporters.</span>
                                            </li>
                                            <li className="flex flex-col">
                                                <span className="text-sm text-secondary-text leading-relaxed"><b className="text-main-text">Unprofessionalism</b> The match was chaotic, players arrived or were substituted very late without notice or due care, or the playing area was managed in a disruptive way. Play was notably unfair or "over-competitive" to the point of conflict, including biased umpiring or escalated disputes.</span>
                                            </li>
                                            <li className="flex flex-col">
                                                <span className="text-sm text-secondary-text leading-relaxed"><b className="text-main-text">Unaccessibility</b> Significant issues in finding the venue or using basic facilities.</span>
                                            </li>
                                        </ul>
                                    </div>

                                </div>
                            </div>
                        </div>
                    )}
                    {showConfirmModal && selectedKudos && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
                            <div className="bg-primary-base border border-gray-600 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-6">
                                <h3 className="text-xl font-bold text-main-text text-center">Confirm Kudos <br />to {state.opponentTeam}</h3>

                                <div className="text-center space-y-2">
                                    <p className="text-base sm:text-lg">
                                        You are awarding a <span className={`font-bold ${selectedKudos === 'Positive' ? 'text-[#48bb78]' :
                                            selectedKudos === 'Neutral' ? 'text-[#85a3c2]' :
                                                'text-[#F06400]'
                                            }`}>{selectedKudos} Kudos</span>
                                    </p>
                                    <p className="text-base">
                                        for the {state.isHome ? 'Home game' : 'Away game'} on {dateStr}
                                    </p>
                                </div>

                                {error && <ErrorMessage>{error}</ErrorMessage>}

                                <div className="grid grid-cols-2 gap-4 pt-4">
                                    <Button
                                        onClick={() => { setShowConfirmModal(false); }}
                                        className="!bg-gray-600 hover:!bg-gray-700"
                                        disabled={isSubmitting}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={() => { void handleConfirm(); }}
                                        disabled={isSubmitting}
                                        className={
                                            selectedKudos === 'Positive' ? '!bg-[#004d27] hover:!bg-[#143D33]' :
                                                selectedKudos === 'Neutral' ? '!bg-[#85a3c2] hover:!bg-[#6a8bb1]' :
                                                    '!bg-[#F06400] hover:!bg-[#CC5500]'
                                        }
                                    >
                                        {isSubmitting ? 'Confirming...' : 'Confirm'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </PageContainer>
            </MobileLayout>
        </ProtectedRoute>
    );
};
