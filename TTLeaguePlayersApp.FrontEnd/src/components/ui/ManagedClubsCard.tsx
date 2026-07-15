import React, { useEffect } from 'react';
import { createManagedClubKey } from '../../utils/clubUtils';

interface ManagedClub {
    league: string;
    season: string;
    club_name: string;
    club_location: string;
}

interface ManagedClubsCardProps {
    managedClubs: ManagedClub[];
    selectedClubKey: string | null;
    onSelectClub: (key: string) => void;
    effectiveClubName?: string;
    /** When true, renders one button per unique club_location (showing only the location label).
     *  Clicking selects the first club matching that location. */
    groupByLocation?: boolean;
}

export const ManagedClubsCard: React.FC<ManagedClubsCardProps> = ({
    managedClubs,
    selectedClubKey,
    onSelectClub,
    effectiveClubName,
    groupByLocation = false,
}) => {
    const buttons: { label: string; key: string; isSelected: boolean }[] = groupByLocation
        ? (() => {
            const seen = new Set<string>();
            const result: { label: string; key: string; isSelected: boolean }[] = [];
            
            // Count how many unique club names exist per location
            const locationToClubNames = new Map<string, Set<string>>();
            for (const club of managedClubs) {
                if (!locationToClubNames.has(club.club_location)) {
                    locationToClubNames.set(club.club_location, new Set());
                }
                const clubNames = locationToClubNames.get(club.club_location);
                if (clubNames) {
                    clubNames.add(club.club_name);
                }
            }
            
            for (const club of managedClubs) {
                const locationClubKey = `${club.club_location}-${club.club_name}`;
                if (!seen.has(locationClubKey)) {
                    seen.add(locationClubKey);
                    
                    // Always use the first club's key for this location/club_name group
                    const key = createManagedClubKey(club);
                    
                    // This location button is selected if the currently selected key matches this group
                    const isSelected = managedClubs.some(
                        (c) => c.club_location === club.club_location && c.club_name === club.club_name && createManagedClubKey(c) === selectedClubKey
                    );
                    
                    // Label is "Location / Club name" if there are multiple club names at this location
                    const clubNamesAtLocation = locationToClubNames.get(club.club_location);
                    const hasMultipleClubNames = clubNamesAtLocation && clubNamesAtLocation.size > 1;
                    const label = hasMultipleClubNames ? `${club.club_location} / ${club.club_name}` : club.club_location;
                    
                    result.push({ label, key, isSelected });
                }
            }
            return result;
        })()
        : managedClubs.map((club) => {
            const key = createManagedClubKey(club);
            return {
                label: `${club.club_location} / ${club.league}`,
                key,
                isSelected: selectedClubKey === key,
            };
        });
    
    // Auto-select when there's only one button and no selection exists
    useEffect(() => {
        if (buttons.length === 1 && !selectedClubKey) {
            onSelectClub(buttons[0].key);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [buttons.length, selectedClubKey]);


    return (
        <div className="rounded-lg border border-gray-600 bg-primary px-2 py-4 space-y-3">
            <h3 className="text-lg font-semibold">My Club: {effectiveClubName}</h3>

            {buttons.length > 0 ? (
                <div className="flex flex-wrap gap-2 justify-center">
                    {buttons.map(({ label, key, isSelected }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => { onSelectClub(key); }}
                            className={`rounded-full border px-3 py-2 text-sm font-semibold ${isSelected ? 'border-action-accent bg-action-accent text-white' : 'border-gray-600 text-main-text'}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
};
