import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AwardKudos } from '../../../src/pages/AwardKudos';

const mocks = vi.hoisted(() => ({
    awardKudos: vi.fn(),
    refreshActiveSeasons: vi.fn(),
    toUserFriendlyApiError: vi.fn(),
    userId: 'player-sub' as string | null,
}));

vi.mock('../../../src/api/kudosApi', () => ({ awardKudos: mocks.awardKudos }));
vi.mock('../../../src/hooks/useAuth', () => ({
    useAuth: () => ({ userId: mocks.userId, refreshActiveSeasons: mocks.refreshActiveSeasons }),
}));
vi.mock('../../../src/utils/apiErrorUtils', () => ({ toUserFriendlyApiError: mocks.toUserFriendlyApiError }));
vi.mock('../../../src/components/common/ProtectedRoute', () => ({
    ProtectedRoute: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../../../src/components/layout/MobileLayout', () => ({
    MobileLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../../src/components/layout/PageContainer', () => ({
    PageContainer: ({ title, children }: { title: string; children: React.ReactNode }) => <main><h1>{title}</h1>{children}</main>,
}));

const match = {
    league: 'CLTTL',
    season: '2025-2026',
    teamDivision: 'Division 4',
    teamName: 'Walworth Tigers',
    personName: 'Player One',
    opponentTeam: 'Morpeth 9',
    matchDateTime: '2026-01-10T19:00:00Z',
    isHome: false,
    venue: 'Morpeth Sports Hall',
};

function Destination() {
    const location = useLocation();
    return <output data-testid="destination-state">{JSON.stringify(location.state)}</output>;
}

function getStyledRatingSpan(button: HTMLElement, index = 0): HTMLElement {
    const spans = button.querySelectorAll<HTMLElement>('span[style]');
    if (index >= spans.length) throw new Error('Expected styled rating span');
    return spans[index];
}

function renderAwardPage(withMatch = true, matchState = match) {
    return render(
        <MemoryRouter initialEntries={[{ pathname: '/award-kudos', state: withMatch ? matchState : null }]}>
            <Routes>
                <Route path="/award-kudos" element={<AwardKudos />} />
                <Route path="/kudos" element={<h1>Kudos page</h1>} />
                <Route path="/kudos-standings" element={<Destination />} />
            </Routes>
        </MemoryRouter>
    );
}

describe('AwardKudos', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.userId = 'player-sub';
        mocks.awardKudos.mockResolvedValue({ message: 'saved' });
        mocks.refreshActiveSeasons.mockResolvedValue(undefined);
        mocks.toUserFriendlyApiError.mockReturnValue('Could not award kudos');
    });

    afterEach(() => vi.restoreAllMocks());

    it('returns to the Kudos page when match navigation state is missing', async () => {
        renderAwardPage(false);

        expect(screen.getByText('No match information provided. Please select a match from the Kudos page.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Back to Kudos' }));

        expect(await screen.findByRole('heading', { name: 'Kudos page' })).toBeInTheDocument();
    });

    it('shows home-game context without a venue and confirms the home rating', () => {
        renderAwardPage(true, { ...match, isHome: true });

        expect(screen.getByText(/Home game,/)).toBeInTheDocument();
        expect(screen.queryByText(/Morpeth Sports Hall/)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Standard Kudos/ }));
        expect(screen.getByText(/for the Home game on/)).toBeInTheDocument();
    });

    it.each([
        { buttonName: /Extra Kudos/, label: 'Extra', kudosValue: 1 },
        { buttonName: /Standard Kudos/, label: 'Standard', kudosValue: 0 },
        { buttonName: /Fewer Kudos/, label: 'Fewer', kudosValue: -1 },
    ])('submits $label Kudos, refreshes registrations and navigates with the match context', async ({ buttonName, label, kudosValue }) => {
        renderAwardPage();

        expect(screen.getByText(/Away game, Morpeth Sports Hall/)).toBeInTheDocument();
        expect(screen.getByText(/Vs Morpeth 9/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: buttonName }));
        expect(screen.getByRole('heading', { name: /Confirm Kudos to Morpeth 9/ })).toBeInTheDocument();
        expect(screen.getByText(/You are awarding/)).toHaveTextContent(`You are awarding ${label} Kudos`);
        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

        await waitFor(() => {
            expect(mocks.awardKudos).toHaveBeenCalledWith({
                league: 'CLTTL',
                season: '2025-2026',
                teamDivision: 'Division 4',
                teamName: 'Walworth Tigers',
                personName: 'Player One',
                giverPersonSub: 'player-sub',
                opponentTeam: 'Morpeth 9',
                matchDateTime: match.matchDateTime,
                isHome: false,
                venue: 'Morpeth Sports Hall',
                kudosValue,
            });
        });
        expect(mocks.refreshActiveSeasons).toHaveBeenCalledOnce();
        expect(await screen.findByTestId('destination-state')).toHaveTextContent(JSON.stringify({
            league: 'CLTTL',
            season: '2025-2026',
            team_name: 'Walworth Tigers',
            team_division: 'Division 4',
            person_name: 'Player One',
        }));
    });

    it('opens the rating criteria and closes the guidelines panel', () => {
        renderAwardPage();

        expect(screen.queryByText('Award Extra Kudos for:')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Rating Guidelines' }));
        expect(screen.getByText('Award Extra Kudos for:')).toBeInTheDocument();
        expect(screen.getByText('The environment was friendly, inclusive, and kind.')).toBeInTheDocument();
        expect(screen.getByText('Award Fewer Kudos for:')).toBeInTheDocument();

        const closeButton = screen.getByRole('heading', { name: 'Rating Guidelines' }).parentElement?.querySelector('button');
        if (closeButton === null || closeButton === undefined) {
            throw new Error('Expected the guidelines close button next to its heading');
        }
        fireEvent.click(closeButton);
        expect(screen.queryByText('Award Extra Kudos for:')).not.toBeInTheDocument();
    });

    it('explains what each rating means before the player selects it', () => {
        renderAwardPage();

        expect(screen.getByRole('button', { name: /Extra Kudos.*for a notably friendly experience & fair play/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Standard Kudos.*for a good, standard match experience/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Fewer Kudos.*for an experience with room for improvement/ })).toBeInTheDocument();
    });

    it('keeps the three rating choices and confirmation visually distinct', () => {
        renderAwardPage();

        const extraButton = screen.getByRole('button', { name: /Extra Kudos/ });
        const standardButton = screen.getByRole('button', { name: /Standard Kudos/ });
        const fewerButton = screen.getByRole('button', { name: /Fewer Kudos/ });
        expect(extraButton).toHaveClass('!bg-[#004d27]', 'hover:!bg-[#143D33]');
        expect(standardButton).toHaveClass('!bg-[#85a3c2]', 'hover:!bg-[#6a8bb1]');
        expect(fewerButton).toHaveClass('!bg-transparent', 'hover:!bg-[#85a3c2]/10', 'border-4', 'border-[#85a3c2]');
        expect(extraButton.textContent).toMatch(/Extra Kudos:\s+★{5}/);
        expect(standardButton.textContent).toMatch(/Standard Kudos:\s+★{3}☆{2}/);
        expect(fewerButton.textContent).toMatch(/Fewer Kudos:\s+★☆{4}/);
        expect(getStyledRatingSpan(extraButton).style.color).toBe('rgb(244, 196, 48)');
        expect(getStyledRatingSpan(standardButton).style.color).toBe('rgb(244, 196, 48)');
        expect(getStyledRatingSpan(standardButton, 1).style.color).toBe('rgb(224, 224, 224)');
        expect(getStyledRatingSpan(fewerButton).style.color).toBe('rgb(244, 196, 48)');
        expect(getStyledRatingSpan(fewerButton, 1).style.color).toBe('rgb(224, 224, 224)');

        fireEvent.click(extraButton);
        const extraConfirmation = screen.getByText(/You are awarding/).querySelector('span');
        expect(extraConfirmation).toHaveClass('font-bold', 'text-[#48bb78]');
        expect(screen.getByRole('button', { name: 'Confirm' })).toHaveClass('!bg-[#004d27]', 'hover:!bg-[#143D33]');

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        fireEvent.click(standardButton);
        const standardConfirmation = screen.getByText(/You are awarding/).querySelector('span');
        expect(standardConfirmation).toHaveClass('font-bold', 'text-[#85a3c2]');
        expect(screen.getByRole('button', { name: 'Confirm' })).toHaveClass('!bg-[#85a3c2]', 'hover:!bg-[#6a8bb1]');

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        fireEvent.click(fewerButton);
        const fewerConfirmation = screen.getByText(/You are awarding/).querySelector('span');
        expect(fewerConfirmation).toHaveClass('font-bold', 'text-white');
        expect(screen.getByRole('button', { name: 'Confirm' })).toHaveClass('!bg-transparent', 'hover:!bg-[#85a3c2]/10', 'border-4', 'border-[#85a3c2]');
    });

    it('shows a pending confirmation state while the rating request is in flight', async () => {
        let finishAward: (value: { message: string }) => void = () => undefined;
        mocks.awardKudos.mockReturnValueOnce(new Promise((resolve) => { finishAward = resolve; }));
        renderAwardPage();

        fireEvent.click(screen.getByRole('button', { name: /Extra Kudos/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

        expect(screen.getByRole('button', { name: 'Confirming...' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
        finishAward({ message: 'saved' });

        expect(await screen.findByTestId('destination-state')).toBeInTheDocument();
    });

    it('sends an empty giver id when auth has no user id', async () => {
        mocks.userId = null;
        renderAwardPage();

        fireEvent.click(screen.getByRole('button', { name: /Standard Kudos/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

        await waitFor(() => {
            expect(mocks.awardKudos).toHaveBeenCalledWith(expect.objectContaining({ giverPersonSub: '' }));
        });
    });

    it('closes a confirmation without sending a rating when the player cancels', () => {
        renderAwardPage();

        fireEvent.click(screen.getByRole('button', { name: /Extra Kudos/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(screen.queryByRole('heading', { name: /Confirm Kudos to/ })).not.toBeInTheDocument();
        expect(mocks.awardKudos).not.toHaveBeenCalled();
    });

    it('shows a friendly failure and lets the player retry', async () => {
        mocks.awardKudos.mockRejectedValueOnce(new Error('transport detail'));
        const { container } = renderAwardPage();
        expect(container.querySelector('.error-message')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Fewer Kudos/ }));
        expect(container.querySelector('.error-message')).not.toBeInTheDocument();
        expect(screen.getByText(/for the Away game on/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

        expect(await screen.findByText('Could not award kudos')).toBeInTheDocument();
        expect(mocks.toUserFriendlyApiError).toHaveBeenCalledWith(
            expect.any(Error),
            'Something went wrong while awarding kudos. Please try again.'
        );
        expect(mocks.refreshActiveSeasons).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
    });
});
