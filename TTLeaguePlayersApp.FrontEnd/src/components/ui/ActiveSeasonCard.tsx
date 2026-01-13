import React from 'react';
import type { ActiveSeason } from '../../contexts/AuthContextDefinition';

interface ActiveSeasonCardProps {
    season: ActiveSeason;
    isExpanded: boolean;
    onToggle: () => void;
}

export const ActiveSeasonCard: React.FC<ActiveSeasonCardProps> = ({ season, isExpanded, onToggle }) => {

    return (
        <div className="bg-primary border border-gray-600 rounded-lg p-0" data-testid="active-season-card">
            <div
                className="relative flex justify-center items-center cursor-pointer"
                onClick={onToggle}
                data-testid="active-season-header"
            >
                <div className="text-center">
                    <div>
                        <p className="text-base sm:text-lg font-bold" data-testid="active-season-league">
                            {season.league} {season.season}
                        </p>
                    </div>
                    <div>
                        <p className="text-base sm:text-lg" data-testid="active-season-team">
                            {season.team_name}, {season.team_division}
                        </p>
                    </div>
                </div>
                <div className="absolute right-4 text-2xl text-secondary-text">
                    {/* Chevron icon using unicode */}
                    {isExpanded ? '▼' : '▶'}
                </div>
            </div>

            {isExpanded && (
                <div className="text-center" data-testid="active-season-details">
                    <div className="border-t border-gray-600 my-1"></div>

                    {/* Placeholder content as requested */}
                    <div className="mb-6">
                        <p className="text-secondary-text text-sm sm:text-base uppercase tracking-wide mt-2 font-bold">
                            Previous Match
                        </p>
                        <p className="text-base sm:text-lg" data-testid="active-season-prev-match">
                            Away game at Venue Name, 01/12/2025 <br />
                            Vs Team Some Name One
                        </p>
                        <div className="h-4"></div>
                        <div className="h-4"></div>
                        <div className="h-4"></div>
                    </div>

                    <div>
                        <p className="text-secondary-text text-sm sm:text-base uppercase tracking-wide mt-2 font-bold">
                            Next Match
                        </p>
                        <p className="text-base sm:text-lg" data-testid="active-season-next-match">
                            Home Game, 22/01/2026<br />
                            Vs Team Some Name Three
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};
