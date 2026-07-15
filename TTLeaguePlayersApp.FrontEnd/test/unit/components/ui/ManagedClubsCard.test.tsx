import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ManagedClubsCard } from '../../../../src/components/ui/ManagedClubsCard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function club(
    club_location: string,
    club_name: string,
    league = 'League A',
    season = '2025',
) {
    return { club_location, club_name, league, season };
}

// Key format mirrors createManagedClubKey: `${league}-${season}-${club_name}`
function key(league: string, season: string, club_name: string) {
    return `${league}-${season}-${club_name}`;
}

// ---------------------------------------------------------------------------
// Group 1 – Default mode (groupByLocation = false)
// ---------------------------------------------------------------------------

describe('ManagedClubsCard – default mode', () => {
    const onSelectClub = vi.fn();

    beforeEach(() => { vi.clearAllMocks(); });

    it('renders one button per club entry', () => {
        render(
            <ManagedClubsCard
                managedClubs={[
                    club('London', 'London TTC'),
                    club('Berlin', 'Berlin TTC', 'League B'),
                ]}
                selectedClubKey={null}
                onSelectClub={onSelectClub}
            />
        );

        expect(screen.getAllByRole('button')).toHaveLength(2);
    });

    it('labels each button as "location / league"', () => {
        render(
            <ManagedClubsCard
                managedClubs={[club('London', 'London TTC', 'League A')]}
                selectedClubKey={null}
                onSelectClub={onSelectClub}
            />
        );

        expect(screen.getByRole('button', { name: 'London / League A' })).toBeInTheDocument();
    });

    it('applies the selected style to the button matching selectedClubKey', () => {
        const selectedKey = key('League A', '2025', 'London TTC');

        render(
            <ManagedClubsCard
                managedClubs={[
                    club('London', 'London TTC'),
                    club('Berlin', 'Berlin TTC', 'League B'),
                ]}
                selectedClubKey={selectedKey}
                onSelectClub={onSelectClub}
            />
        );

        expect(screen.getByRole('button', { name: 'London / League A' })).toHaveClass('bg-action-accent');
        expect(screen.getByRole('button', { name: 'Berlin / League B' })).not.toHaveClass('bg-action-accent');
    });

    it('calls onSelectClub with the button key when clicked', () => {
        const expectedKey = key('League A', '2025', 'London TTC');

        render(
            <ManagedClubsCard
                managedClubs={[club('London', 'London TTC')]}
                selectedClubKey={null}
                onSelectClub={onSelectClub}
            />
        );

        onSelectClub.mockClear();
        fireEvent.click(screen.getByRole('button', { name: 'London / League A' }));

        expect(onSelectClub).toHaveBeenCalledOnce();
        expect(onSelectClub).toHaveBeenCalledWith(expectedKey);
    });
});

// ---------------------------------------------------------------------------
// Group 2 – groupByLocation, single club name per location
// ---------------------------------------------------------------------------

describe('ManagedClubsCard – groupByLocation, single club name per location', () => {
    const onSelectClub = vi.fn();

    beforeEach(() => { vi.clearAllMocks(); });

    it('de-duplicates clubs with the same location and club name into one button', () => {
        render(
            <ManagedClubsCard
                managedClubs={[
                    club('London', 'London TTC', 'League A', '2024'),
                    club('London', 'London TTC', 'League A', '2025'),
                ]}
                selectedClubKey={null}
                onSelectClub={onSelectClub}
                groupByLocation
            />
        );

        expect(screen.getAllByRole('button')).toHaveLength(1);
    });

    it('labels the button with just the location when only one club name is at that location', () => {
        render(
            <ManagedClubsCard
                managedClubs={[club('London', 'London TTC')]}
                selectedClubKey={null}
                onSelectClub={onSelectClub}
                groupByLocation
            />
        );

        expect(screen.getByRole('button', { name: 'London' })).toBeInTheDocument();
    });

    it('clicking a location button calls onSelectClub with the first matching club key', () => {
        // First entry's key is the one that should be used for the group
        const firstKey = key('League A', '2024', 'London TTC');

        render(
            <ManagedClubsCard
                managedClubs={[
                    club('London', 'London TTC', 'League A', '2024'),
                    club('London', 'London TTC', 'League A', '2025'),
                ]}
                selectedClubKey={null}
                onSelectClub={onSelectClub}
                groupByLocation
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'London' }));

        expect(onSelectClub).toHaveBeenCalledWith(firstKey);
    });
});

// ---------------------------------------------------------------------------
// Group 3 – groupByLocation, multiple club names at the same location
// ---------------------------------------------------------------------------

describe('ManagedClubsCard – groupByLocation, multiple club names at same location', () => {
    const onSelectClub = vi.fn();

    beforeEach(() => { vi.clearAllMocks(); });

    it('renders a separate button for each distinct club name at the same location', () => {
        render(
            <ManagedClubsCard
                managedClubs={[
                    club('London', 'London TTC'),
                    club('London', 'London Stars'),
                ]}
                selectedClubKey={null}
                onSelectClub={onSelectClub}
                groupByLocation
            />
        );

        expect(screen.getAllByRole('button')).toHaveLength(2);
    });

    it('labels each button as "location / club_name" when multiple club names share a location', () => {
        render(
            <ManagedClubsCard
                managedClubs={[
                    club('London', 'London TTC'),
                    club('London', 'London Stars'),
                ]}
                selectedClubKey={null}
                onSelectClub={onSelectClub}
                groupByLocation
            />
        );

        expect(screen.getByRole('button', { name: 'London / London TTC' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'London / London Stars' })).toBeInTheDocument();
    });

    it('clicking a "location / club_name" button calls onSelectClub with the correct key', () => {
        // Clubs in two distinct locations, with multiple club names at London
        const londonStarsKey = key('League A', '2025', 'London Stars');

        render(
            <ManagedClubsCard
                managedClubs={[
                    club('London', 'London TTC'),
                    club('London', 'London Stars'),
                    club('Berlin', 'Berlin TTC', 'League B'),
                ]}
                selectedClubKey={null}
                onSelectClub={onSelectClub}
                groupByLocation
            />
        );

        // Click the "London / London Stars" button
        fireEvent.click(screen.getByRole('button', { name: 'London / London Stars' }));

        expect(onSelectClub).toHaveBeenCalledOnce();
        expect(onSelectClub).toHaveBeenCalledWith(londonStarsKey);
    });
});

// ---------------------------------------------------------------------------
// Group 4 – groupByLocation, selection state
// ---------------------------------------------------------------------------

describe('ManagedClubsCard – groupByLocation, selection state', () => {
    const onSelectClub = vi.fn();

    beforeEach(() => { vi.clearAllMocks(); });

    it('marks a location button as selected when selectedClubKey matches any club in that group', () => {
        // There are two entries for London TTC (different seasons); select the second one's key
        const secondEntryKey = key('League A', '2025', 'London TTC');

        render(
            <ManagedClubsCard
                managedClubs={[
                    club('London', 'London TTC', 'League A', '2024'),
                    club('London', 'London TTC', 'League A', '2025'),
                    club('Berlin', 'Berlin TTC', 'League B', '2025'),
                ]}
                selectedClubKey={secondEntryKey}
                onSelectClub={onSelectClub}
                groupByLocation
            />
        );

        expect(screen.getByRole('button', { name: 'London' })).toHaveClass('bg-action-accent');
    });

    it('does not mark a location button as selected when selectedClubKey belongs to a different group', () => {
        const berlinKey = key('League B', '2025', 'Berlin TTC');

        render(
            <ManagedClubsCard
                managedClubs={[
                    club('London', 'London TTC'),
                    club('Berlin', 'Berlin TTC', 'League B'),
                ]}
                selectedClubKey={berlinKey}
                onSelectClub={onSelectClub}
                groupByLocation
            />
        );

        expect(screen.getByRole('button', { name: 'London' })).not.toHaveClass('bg-action-accent');
        expect(screen.getByRole('button', { name: 'Berlin' })).toHaveClass('bg-action-accent');
    });
});

// ---------------------------------------------------------------------------
// Group 5 – Auto-selection useEffect
// ---------------------------------------------------------------------------

describe('ManagedClubsCard – auto-selection', () => {
    const onSelectClub = vi.fn();

    beforeEach(() => { vi.clearAllMocks(); });

    it('auto-selects when there is exactly one button and no current selection', () => {
        const expectedKey = key('League A', '2025', 'London TTC');

        render(
            <ManagedClubsCard
                managedClubs={[club('London', 'London TTC')]}
                selectedClubKey={null}
                onSelectClub={onSelectClub}
            />
        );

        expect(onSelectClub).toHaveBeenCalledOnce();
        expect(onSelectClub).toHaveBeenCalledWith(expectedKey);
    });

    it('does not auto-select when there are multiple buttons', () => {
        render(
            <ManagedClubsCard
                managedClubs={[
                    club('London', 'London TTC'),
                    club('Berlin', 'Berlin TTC', 'League B'),
                ]}
                selectedClubKey={null}
                onSelectClub={onSelectClub}
            />
        );

        expect(onSelectClub).not.toHaveBeenCalled();
    });

    it('does not auto-select when there is one button but a selection already exists', () => {
        const existingKey = key('League A', '2025', 'London TTC');

        render(
            <ManagedClubsCard
                managedClubs={[club('London', 'London TTC')]}
                selectedClubKey={existingKey}
                onSelectClub={onSelectClub}
            />
        );

        expect(onSelectClub).not.toHaveBeenCalled();
    });

    it('auto-selects with first entry key when groupByLocation and one deduplicated button exists', () => {
        // Two entries with same location+name (different seasons) → one button after dedup
        const firstEntryKey = key('League A', '2024', 'London TTC');

        render(
            <ManagedClubsCard
                managedClubs={[
                    club('London', 'London TTC', 'League A', '2024'),
                    club('London', 'London TTC', 'League A', '2025'),
                ]}
                selectedClubKey={null}
                onSelectClub={onSelectClub}
                groupByLocation
            />
        );

        expect(onSelectClub).toHaveBeenCalledOnce();
        expect(onSelectClub).toHaveBeenCalledWith(firstEntryKey);
    });
});

// ---------------------------------------------------------------------------
// Group 6 – Display edge cases
// ---------------------------------------------------------------------------

describe('ManagedClubsCard – display', () => {
    const onSelectClub = vi.fn();

    beforeEach(() => { vi.clearAllMocks(); });

    it('shows effectiveClubName in the heading', () => {
        render(
            <ManagedClubsCard
                managedClubs={[]}
                selectedClubKey={null}
                onSelectClub={onSelectClub}
                effectiveClubName="London TTC"
            />
        );

        expect(screen.getByRole('heading', { name: /My Club: London TTC/i })).toBeInTheDocument();
    });

    it('renders no buttons when managedClubs is empty', () => {
        render(
            <ManagedClubsCard
                managedClubs={[]}
                selectedClubKey={null}
                onSelectClub={onSelectClub}
            />
        );

        expect(screen.queryAllByRole('button')).toHaveLength(0);
    });
});