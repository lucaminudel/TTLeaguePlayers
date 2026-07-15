import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PromoteMyClub } from '../../../src/pages/PromoteMyClub';
import { setUnitFixedClockTime } from '../TestClockUtils';
import type { EnvironmentConfig } from '../../../src/config/environment';

const mockNavigate = vi.fn();
const clubsApiMocks = vi.hoisted(() => ({
    getClub: vi.fn(),
    upsertClub: vi.fn(),
    deleteClub: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const mockUseAuth = vi.fn();
vi.mock('../../../src/hooks/useAuth', () => ({
    useAuth: () => mockUseAuth() as unknown,
}));

const mockGetConfig = vi.fn();
vi.mock('../../../src/config/environment', () => ({
    getConfig: () => mockGetConfig() as EnvironmentConfig,
}));

vi.mock('../../../src/api/clubsApi', () => ({
    clubsApi: {
        getClub: clubsApiMocks.getClub,
        upsertClub: clubsApiMocks.upsertClub,
        deleteClub: clubsApiMocks.deleteClub,
    },
}));

describe('PromoteMyClub', () => {
    const managedClub = {
        league: 'CLTTL',
        season: '2025-2026',
        club_name: 'Morpeth TTC',
        club_location: 'London',
        manager_name: 'Luca',
    };

    const defaultConfig: EnvironmentConfig = {
        FrontEnd: { WebsiteBaseUrl: 'https://example.test' },
        ApiGateWay: {
            ApiBaseUrl: 'https://api.example.test',
            CreateInviteAutomaticallySendInviteEmail: false,
        },
        DynamoDB: {
            ServiceLocalUrl: '',
            'AWS.Profile': '',
            'AWS.Region': null,
        },
        Cognito: {
            UserPoolId: 'test-user-pool',
            ClientId: 'test-client',
            Domain: 'auth.example.test',
        },
        EmailForwarder: {
            InviteEmailAddress: 'invites@example.test',
            ContactUsEmailAddress: 'contact@example.test',
            ForwardToEmailAddress: 'admin@example.test',
        },
        active_seasons_data_source: [{
            league: 'CLTTL',
            season: '2025-2026',
            custom_processor: 'CLTTLActiveSeason2025Processor',
            registrations_start_date: 1735689600,
            ratings_end_date: 1767139200,
            division_tables: [],
            division_fixtures: [],
            division_players: [],
        }],
    };

    const renderPageShell = () => {
        render(
            <MemoryRouter initialEntries={['/promote-my-club']}>
                <PromoteMyClub />
            </MemoryRouter>
        );
    };

    const renderPage = async () => {
        renderPageShell();

        await screen.findByLabelText('Homepage Link');
    };

    const typeIntoField = (label: string, value: string) => {
        const input = screen.getByLabelText(label);
        fireEvent.change(input, { target: { value } });
    };

    const clickSave = () => {
        fireEvent.click(getSaveButton());
    };

    const getSaveButton = () => screen.getByRole('button', { name: /^(ADD|UPDATE)$/ });

    const getRemoveButton = () => screen.getByRole('button', { name: 'REMOVE' });

    const getFieldControl = (label: string) => {
        const fieldControl = screen.getByLabelText(label).closest('div');
        if (!fieldControl) throw new Error(`${label} field control missing`);
        return fieldControl;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        setUnitFixedClockTime('2025-06-01T12:00:00Z');

        mockUseAuth.mockReturnValue({
            isAuthenticated: true,
            email: 'manager@example.test',
            username: 'Luca',
            activeSeasons: [],
            managedClubs: [managedClub],
            isPlayerOrCaptain: false,
            isClubManager: true,
            signOut: vi.fn(),
            refreshActiveSeasons: vi.fn(),
        });

        mockGetConfig.mockReturnValue(defaultConfig);
        clubsApiMocks.getClub.mockResolvedValue({
            club_name: managedClub.club_name,
            club_location: managedClub.club_location,
            homepage: 'https://morpeth.example.com',
            instagram: null,
            facebook: null,
            youtube: null,
        });
        clubsApiMocks.upsertClub.mockResolvedValue(undefined);
        clubsApiMocks.deleteClub.mockResolvedValue(undefined);
    });

    describe('input validation', () => {
        it.each([
            ['ftp URL', 'ftp://morpeth.example.com'],
            ['localhost URL', 'https://localhost'],
            ['.local domain', 'https://morpeth.local'],
            ['single-word host', 'https://morpeth'],
            ['IPv4 address', 'https://192.168.1.1'],
            ['IPv6 address', 'https://[::1]'],
            ['malformed URL', 'not a url'],
        ])('rejects homepage %s', async (_caseName, homepage) => {
            await renderPage();

            typeIntoField('Homepage Link', homepage);
            clickSave();

            expect(await screen.findByText('Please enter a valid homepage URL.')).toBeInTheDocument();
            expect(clubsApiMocks.upsertClub).not.toHaveBeenCalled();
        });

        it.each([
            ['http URL', 'http://morpeth.example.com'],
            ['https URL', 'https://new-morpeth.example.com'],
        ])('accepts homepage %s', async (_caseName, homepage) => {
            await renderPage();

            typeIntoField('Homepage Link', homepage);
            clickSave();

            await waitFor(() => {
                expect(clubsApiMocks.upsertClub).toHaveBeenCalledWith(
                    managedClub.club_location,
                    managedClub.club_name,
                    expect.objectContaining({ homepage })
                );
            });
            expect(screen.queryByText('Please enter a valid homepage URL.')).not.toBeInTheDocument();
        });

        it('requires homepage', async () => {
            await renderPage();

            typeIntoField('Homepage Link', '');
            clickSave();

            expect(await screen.findByText('Homepage is required.')).toBeInTheDocument();
            expect(clubsApiMocks.upsertClub).not.toHaveBeenCalled();
        });

        it('allows optional social fields to be blank', async () => {
            await renderPage();

            typeIntoField('Homepage Link', 'https://new-morpeth.example.com');
            typeIntoField('Instagram Handle', '');
            typeIntoField('YouTube', '');
            typeIntoField('Facebook Link', '');
            clickSave();

            await waitFor(() => {
                expect(clubsApiMocks.upsertClub).toHaveBeenCalledWith(
                    managedClub.club_location,
                    managedClub.club_name,
                    {
                        homepage: 'https://new-morpeth.example.com',
                        instagram: undefined,
                        facebook: undefined,
                        youtube: undefined,
                    }
                );
            });
            expect(screen.queryByText('Please enter a valid Instagram handle or URL.')).not.toBeInTheDocument();
            expect(screen.queryByText('Please enter a valid Facebook link.')).not.toBeInTheDocument();
            expect(screen.queryByText('Please enter a valid YouTube URL or handle.')).not.toBeInTheDocument();
        });

        it.each([
            ['Instagram Handle', 'not a handle!', 'Please enter a valid Instagram handle or URL.'],
            ['Facebook Link', 'not a facebook link!', 'Please enter a valid Facebook link.'],
            ['YouTube', 'youtube channel!', 'Please enter a valid YouTube URL or handle.'],
        ])('shows the field-specific validation message for invalid %s input', async (label, value, message) => {
            await renderPage();

            typeIntoField(label, value);
            clickSave();

            expect(await screen.findByText(message)).toBeInTheDocument();
            expect(clubsApiMocks.upsertClub).not.toHaveBeenCalled();
        });
    });

    describe('page validation', () => {
        it('shows all field errors and does not save when submitted with invalid fields', async () => {
            await renderPage();

            typeIntoField('Homepage Link', 'https://localhost');
            typeIntoField('Instagram Handle', 'not a handle!');
            typeIntoField('Facebook Link', 'not a facebook link!');
            typeIntoField('YouTube', 'youtube channel!');
            clickSave();

            expect(await screen.findByText('Please enter a valid homepage URL.')).toBeInTheDocument();
            expect(screen.getByText('Please enter a valid Instagram handle or URL.')).toBeInTheDocument();
            expect(screen.getByText('Please enter a valid Facebook link.')).toBeInTheDocument();
            expect(screen.getByText('Please enter a valid YouTube URL or handle.')).toBeInTheDocument();
            expect(clubsApiMocks.upsertClub).not.toHaveBeenCalled();
        });

        it('does not save when only the required homepage is missing', async () => {
            await renderPage();

            typeIntoField('Homepage Link', '');
            typeIntoField('Instagram Handle', '@morpeth.ttc');
            typeIntoField('Facebook Link', 'morpeth.ttc');
            typeIntoField('YouTube', '@morpethttc');
            clickSave();

            expect(await screen.findByText('Homepage is required.')).toBeInTheDocument();
            expect(screen.queryByText('Please enter a valid Instagram handle or URL.')).not.toBeInTheDocument();
            expect(screen.queryByText('Please enter a valid Facebook link.')).not.toBeInTheDocument();
            expect(screen.queryByText('Please enter a valid YouTube URL or handle.')).not.toBeInTheDocument();
            expect(clubsApiMocks.upsertClub).not.toHaveBeenCalled();
        });
    });

    describe('initial club info visualisation', () => {
        it('shows a loading state while selected club info is being fetched', async () => {
            let resolveGetClub: (value: {
                club_name: string;
                location: string;
                homepage: string;
                instagram: string | null;
                facebook: string | null;
                youtube: string | null;
                tournaments: unknown[];
            }) => void = () => undefined;

            clubsApiMocks.getClub.mockReturnValue(new Promise(resolve => {
                resolveGetClub = resolve;
            }));

            renderPageShell();

            expect(await screen.findByText('Loading club information…')).toBeInTheDocument();
            expect(screen.queryByLabelText('Homepage Link')).not.toBeInTheDocument();

            resolveGetClub({
                club_name: managedClub.club_name,
                location: managedClub.club_location,
                homepage: 'https://morpeth.example.com',
                instagram: 'https://www.instagram.com/morpeth.ttc/',
                facebook: 'https://www.facebook.com/morpeth.ttc',
                youtube: 'https://www.youtube.com/@morpethttc',
                tournaments: [],
            });

            expect(await screen.findByLabelText('Homepage Link')).toBeInTheDocument();
            expect(screen.queryByText('Loading club information…')).not.toBeInTheDocument();
        });

        it('populates fields from existing club info and extracts the Instagram handle', async () => {
            clubsApiMocks.getClub.mockResolvedValue({
                club_name: managedClub.club_name,
                location: managedClub.club_location,
                homepage: 'https://morpeth.example.com',
                instagram: 'https://www.instagram.com/morpeth.ttc/',
                facebook: 'https://www.facebook.com/morpeth.ttc',
                youtube: 'https://www.youtube.com/@morpethttc',
                tournaments: [],
            });

            await renderPage();

            expect(clubsApiMocks.getClub).toHaveBeenCalledWith(
                managedClub.club_location,
                managedClub.club_name
            );
            expect(screen.getByLabelText('Homepage Link')).toHaveValue('https://morpeth.example.com');
            expect(screen.getByLabelText('Instagram Handle')).toHaveValue('@morpeth.ttc');
            expect(screen.getByLabelText('Facebook Link')).toHaveValue('https://www.facebook.com/morpeth.ttc');
            expect(screen.getByLabelText('YouTube')).toHaveValue('https://www.youtube.com/@morpethttc');
            expect(screen.getByRole('button', { name: 'UPDATE' })).toBeDisabled();
            expect(getRemoveButton()).toBeEnabled();
        });
    });

    describe('button visualization logic', () => {
        it('shows disabled ADD and disabled REMOVE when the selected club has no existing club info', async () => {
            clubsApiMocks.getClub.mockResolvedValue(null);

            await renderPage();

            expect(screen.getByRole('button', { name: 'ADD' })).toBeDisabled();
            expect(getRemoveButton()).toBeDisabled();
        });

        it('shows disabled UPDATE and enabled REMOVE when the selected club has existing club info', async () => {
            await renderPage();

            expect(screen.getByRole('button', { name: 'UPDATE' })).toBeDisabled();
            expect(getRemoveButton()).toBeEnabled();
        });

        it('enables ADD or UPDATE only after an input differs from the loaded values', async () => {
            await renderPage();

            expect(getSaveButton()).toBeDisabled();

            typeIntoField('Instagram Handle', '@morpeth.ttc');
            expect(getSaveButton()).toBeEnabled();

            typeIntoField('Instagram Handle', '');
            expect(getSaveButton()).toBeDisabled();
        });

        it('clears a field error when that field changes', async () => {
            await renderPage();

            typeIntoField('Instagram Handle', 'not a handle!');
            clickSave();

            expect(await screen.findByText('Please enter a valid Instagram handle or URL.')).toBeInTheDocument();

            typeIntoField('Instagram Handle', '@morpeth.ttc');

            expect(screen.queryByText('Please enter a valid Instagram handle or URL.')).not.toBeInTheDocument();
        });

        it('clears the page-level error when any field changes', async () => {
            clubsApiMocks.upsertClub.mockRejectedValue(new Error('The service is not available.'));

            await renderPage();

            typeIntoField('Homepage Link', 'https://new-morpeth.example.com');
            clickSave();

            expect(await screen.findByText('The service is not available.')).toBeInTheDocument();

            typeIntoField('Homepage Link', 'https://another-morpeth.example.com');

            expect(screen.queryByText('The service is not available.')).not.toBeInTheDocument();
        });

        it('keeps REMOVE disabled until an ADD succeeds when no existing club info is loaded', async () => {
            clubsApiMocks.getClub.mockResolvedValueOnce(null);
            clubsApiMocks.upsertClub.mockResolvedValueOnce({
                location: managedClub.club_location,
                club_name: managedClub.club_name,
                homepage: 'https://new-morpeth.example.com',
                instagram: null,
                facebook: null,
                youtube: null,
                tournaments: [],
            });

            await renderPage();

            expect(screen.getByRole('button', { name: 'ADD' })).toBeDisabled();
            expect(getRemoveButton()).toBeDisabled();

            typeIntoField('Homepage Link', 'https://new-morpeth.example.com');
            expect(screen.getByRole('button', { name: 'ADD' })).toBeEnabled();

            clickSave();

            await waitFor(() => {
                expect(clubsApiMocks.upsertClub).toHaveBeenCalledWith(
                    managedClub.club_location,
                    managedClub.club_name,
                    expect.objectContaining({ homepage: 'https://new-morpeth.example.com' })
                );
            });
            await waitFor(() => {
                expect(screen.getByRole('button', { name: 'UPDATE' })).toBeDisabled();
            });
            expect(getRemoveButton()).toBeEnabled();
            expect(mockNavigate).toHaveBeenCalledWith('/clubs-and-tournaments');
        });

        it('opens the remove confirmation modal and closes it when cancelled', async () => {
            await renderPage();

            fireEvent.click(getRemoveButton());

            expect(screen.getByText(/Confirm Removal/i)).toBeInTheDocument();
            expect(screen.getByText(`Location: ${managedClub.club_location}`)).toBeInTheDocument();

            fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

            expect(screen.queryByText(/Confirm Removal/i)).not.toBeInTheDocument();
        });

        it('removes existing club info, resets the form, closes the modal, and navigates', async () => {
            await renderPage();

            fireEvent.click(getRemoveButton());
            fireEvent.click(screen.getByRole('button', { name: 'Confirm Remove' }));

            await waitFor(() => {
                expect(clubsApiMocks.deleteClub).toHaveBeenCalledWith(
                    managedClub.club_location,
                    managedClub.club_name
                );
            });
            expect(screen.queryByText(/Confirm Removal/i)).not.toBeInTheDocument();
            expect(screen.getByLabelText('Homepage Link')).toHaveValue('');
            expect(screen.getByLabelText('Instagram Handle')).toHaveValue('');
            expect(screen.getByLabelText('Facebook Link')).toHaveValue('');
            expect(screen.getByLabelText('YouTube')).toHaveValue('');
            expect(screen.getByRole('button', { name: 'ADD' })).toBeDisabled();
            expect(getRemoveButton()).toBeDisabled();
            expect(mockNavigate).toHaveBeenCalledWith('/clubs-and-tournaments');
        });
    });

    describe('eligibility filtering', () => {
        const makeClub = (overrides: Partial<typeof managedClub> = {}) => ({ ...managedClub, ...overrides });

        const makeConfig = (overrides: Partial<typeof defaultConfig.active_seasons_data_source[0]> = {}) => ({
            ...defaultConfig,
            active_seasons_data_source: [{ ...defaultConfig.active_seasons_data_source[0], ...overrides }],
        });

        describe('no match – manager message shown, no buttons', () => {
            it('shows not-registered message when managed club league does not match any config', async () => {
                mockUseAuth.mockReturnValue({
                    ...mockUseAuth(),
                    managedClubs: [makeClub({ league: 'UNKNOWN_LEAGUE' })],
                });

                renderPageShell();

                expect(await screen.findByText('⚠️ You are not currently registered as a club manager.')).toBeInTheDocument();
                expect(screen.queryByLabelText('Homepage Link')).not.toBeInTheDocument();
            });

            it('shows not-registered message when managed club season does not match config season', async () => {
                mockUseAuth.mockReturnValue({
                    ...mockUseAuth(),
                    managedClubs: [makeClub({ league: 'CLTTL', season: '9999-9999' })],
                });

                renderPageShell();

                expect(await screen.findByText('⚠️ You are not currently registered as a club manager.')).toBeInTheDocument();
                expect(screen.queryByLabelText('Homepage Link')).not.toBeInTheDocument();
            });

            it('shows not-registered message when managed club league does not match config league (season matches)', async () => {
                mockUseAuth.mockReturnValue({
                    ...mockUseAuth(),
                    managedClubs: [makeClub({ league: 'OTHER_LEAGUE', season: '2025-2026' })],
                });

                renderPageShell();

                expect(await screen.findByText('⚠️ You are not currently registered as a club manager.')).toBeInTheDocument();
                expect(screen.queryByLabelText('Homepage Link')).not.toBeInTheDocument();
            });

            it('shows not-registered message when now is 1 day before registrations_start_date', async () => {
                setUnitFixedClockTime('2024-12-31T00:00:00Z');

                renderPageShell();

                expect(await screen.findByText('⚠️ You are not currently registered as a club manager.')).toBeInTheDocument();
                expect(screen.queryByLabelText('Homepage Link')).not.toBeInTheDocument();
            });

            it('shows not-registered message when now is 1 day after end of the ratings end year', async () => {
                setUnitFixedClockTime('2026-01-01T23:59:59Z');

                renderPageShell();

                expect(await screen.findByText('⚠️ You are not currently registered as a club manager.')).toBeInTheDocument();
                expect(screen.queryByLabelText('Homepage Link')).not.toBeInTheDocument();
            });
        });

        describe('1 match – 1 button auto-selected, form visible', () => {
            it('shows the form when now is exactly registrations_start_date', async () => {
                setUnitFixedClockTime('2025-01-01T00:00:00Z');

                await renderPage();

                expect(screen.getByLabelText('Homepage Link')).toBeInTheDocument();
                expect(screen.queryByText('⚠️ You are not currently registered as a club manager.')).not.toBeInTheDocument();
            });

            it('shows the form when now is exactly ratings_end_date', async () => {
                setUnitFixedClockTime('2025-12-31T00:00:00Z');

                await renderPage();

                expect(screen.getByLabelText('Homepage Link')).toBeInTheDocument();
                expect(screen.queryByText('⚠️ You are not currently registered as a club manager.')).not.toBeInTheDocument();
            });

            it('shows the form when now is Dec 31 23:59:59 UTC of the ratings end year', async () => {
                setUnitFixedClockTime('2025-12-31T23:59:59Z');

                await renderPage();

                expect(screen.getByLabelText('Homepage Link')).toBeInTheDocument();
                expect(screen.queryByText('⚠️ You are not currently registered as a club manager.')).not.toBeInTheDocument();
            });
        });

        describe('3 matches, 2 locations – 2 buttons, none auto-selected', () => {
            it('shows 2 location buttons and no form or footer when clubs are in London and Manchester', async () => {
                mockUseAuth.mockReturnValue({
                    ...mockUseAuth(),
                    managedClubs: [
                        makeClub({ club_location: 'London' }),
                        makeClub({ club_location: 'Manchester' }),
                    ],
                });
                mockGetConfig.mockReturnValue(makeConfig());

                renderPageShell();

                expect(await screen.findByRole('button', { name: 'London' })).toBeInTheDocument();
                expect(screen.getByRole('button', { name: 'Manchester' })).toBeInTheDocument();
                expect(screen.queryByLabelText('Homepage Link')).not.toBeInTheDocument();
                expect(screen.queryByRole('button', { name: /^(ADD|UPDATE|REMOVE)$/ })).not.toBeInTheDocument();
            });
        });

        describe('2 matches, same location, different club names – 2 buttons, none auto-selected', () => {
            it('shows 2 location/club-name buttons and no form or footer', async () => {
                mockUseAuth.mockReturnValue({
                    ...mockUseAuth(),
                    managedClubs: [
                        makeClub({ club_location: 'London', club_name: 'Morpeth TTC' }),
                        makeClub({ club_location: 'London', club_name: 'London Stars' }),
                    ],
                });
                mockGetConfig.mockReturnValue(makeConfig());

                renderPageShell();

                expect(await screen.findByRole('button', { name: 'London / Morpeth TTC' })).toBeInTheDocument();
                expect(screen.getByRole('button', { name: 'London / London Stars' })).toBeInTheDocument();
                expect(screen.queryByLabelText('Homepage Link')).not.toBeInTheDocument();
                expect(screen.queryByRole('button', { name: /^(ADD|UPDATE|REMOVE)$/ })).not.toBeInTheDocument();
            });
        });

        describe('switching between location buttons', () => {
            it('reloads club info when clicking a different location button', async () => {
                // Two clubs in different locations
                const londonClub = makeClub({ club_location: 'London', club_name: 'Morpeth TTC' });
                const manchesterClub = makeClub({ club_location: 'Manchester', club_name: 'Manchester TTC' });

                mockUseAuth.mockReturnValue({
                    ...mockUseAuth(),
                    managedClubs: [londonClub, manchesterClub],
                });
                mockGetConfig.mockReturnValue(makeConfig());

                // First club (London) loads successfully when clicked
                clubsApiMocks.getClub.mockResolvedValueOnce({
                    club_name: londonClub.club_name,
                    location: londonClub.club_location,
                    homepage: 'https://london.example.com',
                    instagram: null,
                    facebook: null,
                    youtube: null,
                    tournaments: [],
                });

                // Second club (Manchester) loads successfully when clicked
                clubsApiMocks.getClub.mockResolvedValueOnce({
                    club_name: manchesterClub.club_name,
                    location: manchesterClub.club_location,
                    homepage: 'https://manchester.example.com',
                    instagram: null,
                    facebook: null,
                    youtube: null,
                    tournaments: [],
                });

                renderPageShell();

                // Click London button to select it
                fireEvent.click(screen.getByRole('button', { name: 'London' }));

                // Wait for London form to load
                expect(await screen.findByLabelText('Homepage Link')).toHaveValue('https://london.example.com');

                // Click Manchester button
                fireEvent.click(screen.getByRole('button', { name: 'Manchester' }));

                // getClub should be called with Manchester's location/name
                expect(clubsApiMocks.getClub).toHaveBeenCalledWith(
                    manchesterClub.club_location,
                    manchesterClub.club_name
                );

                // Form should update with Manchester's info
                await waitFor(() => {
                    expect(screen.getByLabelText('Homepage Link')).toHaveValue('https://manchester.example.com');
                });
            });
        });
    });

    describe('successful save', () => {
        it('refreshes form fields, resets to UPDATE disabled and REMOVE enabled, and navigates after ADD', async () => {
            clubsApiMocks.getClub.mockResolvedValueOnce(null);
            clubsApiMocks.upsertClub.mockResolvedValueOnce({
                location: managedClub.club_location,
                club_name: managedClub.club_name,
                homepage: 'https://morpeth.example.com',
                instagram: 'https://www.instagram.com/morpeth.ttc/',
                facebook: 'https://www.facebook.com/morpeth.ttc',
                youtube: 'https://www.youtube.com/@morpethttc',
                tournaments: [],
            });

            await renderPage();

            typeIntoField('Homepage Link', 'https://morpeth.example.com');
            typeIntoField('Instagram Handle', '@morpeth.ttc');
            typeIntoField('Facebook Link', 'https://www.facebook.com/morpeth.ttc');
            typeIntoField('YouTube', 'https://www.youtube.com/@morpethttc');
            clickSave();

            await waitFor(() => {
                expect(screen.getByLabelText('Homepage Link')).toHaveValue('https://morpeth.example.com');
            });
            expect(screen.getByLabelText('Instagram Handle')).toHaveValue('@morpeth.ttc');
            expect(screen.getByLabelText('Facebook Link')).toHaveValue('https://www.facebook.com/morpeth.ttc');
            expect(screen.getByLabelText('YouTube')).toHaveValue('https://www.youtube.com/@morpethttc');
            expect(screen.getByRole('button', { name: 'UPDATE' })).toBeDisabled();
            expect(getRemoveButton()).toBeEnabled();
            expect(mockNavigate).toHaveBeenCalledWith('/clubs-and-tournaments');
        });

        it('refreshes form fields, resets to UPDATE disabled and REMOVE enabled, and navigates after UPDATE', async () => {
            clubsApiMocks.getClub.mockResolvedValueOnce({
                location: managedClub.club_location,
                club_name: managedClub.club_name,
                homepage: 'https://morpeth.example.com',
                instagram: null,
                facebook: null,
                youtube: null,
                tournaments: [],
            });
            clubsApiMocks.upsertClub.mockResolvedValueOnce({
                location: managedClub.club_location,
                club_name: managedClub.club_name,
                homepage: 'https://new-morpeth.example.com',
                instagram: 'https://www.instagram.com/morpeth.ttc/',
                facebook: 'https://www.facebook.com/morpeth.ttc',
                youtube: 'https://www.youtube.com/@morpethttc',
                tournaments: [],
            });

            await renderPage();

            typeIntoField('Homepage Link', 'https://new-morpeth.example.com');
            typeIntoField('Instagram Handle', '@morpeth.ttc');
            typeIntoField('Facebook Link', 'morpeth.ttc');
            typeIntoField('YouTube', '@morpethttc');
            clickSave();

            await waitFor(() => {
                expect(screen.getByLabelText('Homepage Link')).toHaveValue('https://new-morpeth.example.com');
            });
            expect(screen.getByLabelText('Instagram Handle')).toHaveValue('@morpeth.ttc');
            expect(screen.getByLabelText('Facebook Link')).toHaveValue('https://www.facebook.com/morpeth.ttc');
            expect(screen.getByLabelText('YouTube')).toHaveValue('https://www.youtube.com/@morpethttc');
            expect(screen.getByRole('button', { name: 'UPDATE' })).toBeDisabled();
            expect(getRemoveButton()).toBeEnabled();
            expect(mockNavigate).toHaveBeenCalledWith('/clubs-and-tournaments');
        });
    });

    describe('error messages', () => {
        it('shows the not-registered message and no form or footer when there are no eligible managed clubs', async () => {
            mockUseAuth.mockReturnValue({
                isAuthenticated: true,
                email: 'manager@example.test',
                username: 'Luca',
                activeSeasons: [],
                managedClubs: [],
                isPlayerOrCaptain: false,
                isClubManager: false,
                signOut: vi.fn(),
                refreshActiveSeasons: vi.fn(),
            });

            renderPageShell();

            expect(await screen.findByText('⚠️ You are not currently registered as a club manager.')).toBeInTheDocument();
            expect(screen.queryByLabelText('Homepage Link')).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /^(ADD|UPDATE|REMOVE)$/ })).not.toBeInTheDocument();
        });

        it('shows the error message when getClub rejects and leaves the form in empty state', async () => {
            clubsApiMocks.getClub.mockRejectedValue(new Error('Failed to load club'));

            renderPageShell();

            expect(await screen.findByText('Failed to load club')).toBeInTheDocument();
            expect(await screen.findByLabelText('Homepage Link')).toHaveValue('');
            expect(screen.getByRole('button', { name: 'ADD' })).toBeDisabled();
        });

        it('shows the thrown message and re-enables buttons when upsertClub rejects', async () => {
            clubsApiMocks.upsertClub.mockRejectedValue(new Error('Save failed'));

            await renderPage();

            typeIntoField('Homepage Link', 'https://new-morpeth.example.com');
            clickSave();

            expect(await screen.findByText('Save failed')).toBeInTheDocument();
            expect(getSaveButton()).toBeEnabled();
            expect(getRemoveButton()).toBeEnabled();
            expect(mockNavigate).not.toHaveBeenCalled();
        });

        it('shows the fallback message when upsertClub rejects with a non-Error', async () => {
            clubsApiMocks.upsertClub.mockRejectedValue('unexpected');

            await renderPage();

            typeIntoField('Homepage Link', 'https://new-morpeth.example.com');
            clickSave();

            expect(await screen.findByText('The club could not be saved. Please try again.')).toBeInTheDocument();
        });

        it('closes the modal, shows the error on the main page when deleteClub rejects', async () => {
            clubsApiMocks.deleteClub.mockRejectedValue(new Error('Remove failed'));

            await renderPage();

            fireEvent.click(getRemoveButton());
            fireEvent.click(screen.getByRole('button', { name: 'Confirm Remove' }));

            expect(await screen.findByText('Remove failed')).toBeInTheDocument();
            expect(screen.queryByRole('heading', { name: /Confirm Removal/i })).not.toBeInTheDocument();
            expect(mockNavigate).not.toHaveBeenCalled();
        });

        it('closes the modal, shows the fallback message on the main page when deleteClub rejects with a non-Error', async () => {
            clubsApiMocks.deleteClub.mockRejectedValue('unexpected');

            await renderPage();

            fireEvent.click(getRemoveButton());
            fireEvent.click(screen.getByRole('button', { name: 'Confirm Remove' }));

            expect(await screen.findByText('The club could not be removed. Please try again.')).toBeInTheDocument();
            expect(screen.queryByRole('heading', { name: /Confirm Removal/i })).not.toBeInTheDocument();
        });
    });

    describe('data normalisation', () => {
        describe('Instagram extraction on load', () => {
            it.each([
                ['full Instagram URL', 'https://www.instagram.com/morpeth.ttc/', '@morpeth.ttc'],
                ['Instagram URL without trailing slash', 'https://www.instagram.com/morpeth.ttc', '@morpeth.ttc'],
                ['already an @handle', '@morpeth.ttc', '@morpeth.ttc'],
                ['bare handle without @', 'morpeth.ttc', '@morpeth.ttc'],
            ])('displays %s as @handle in the Instagram field', async (_caseName, apiValue, expectedDisplay) => {
                clubsApiMocks.getClub.mockResolvedValue({
                    club_name: managedClub.club_name,
                    location: managedClub.club_location,
                    homepage: 'https://morpeth.example.com',
                    instagram: apiValue,
                    facebook: null,
                    youtube: null,
                    tournaments: [],
                });

                await renderPage();

                expect(screen.getByLabelText('Instagram Handle')).toHaveValue(expectedDisplay);
            });

            it('displays empty string when Instagram is null', async () => {
                clubsApiMocks.getClub.mockResolvedValue({
                    club_name: managedClub.club_name,
                    location: managedClub.club_location,
                    homepage: 'https://morpeth.example.com',
                    instagram: null,
                    facebook: null,
                    youtube: null,
                    tournaments: [],
                });

                await renderPage();

                expect(screen.getByLabelText('Instagram Handle')).toHaveValue('');
            });
        });

        describe('save request shaping', () => {
            it.each([
                ['@handle', '@morpeth.ttc', 'https://www.instagram.com/morpeth.ttc'],
                ['bare handle', 'morpeth.ttc', 'https://www.instagram.com/morpeth.ttc'],
                ['full Instagram URL', 'https://www.instagram.com/morpeth.ttc/', 'https://www.instagram.com/morpeth.ttc/'],
            ])('normalises Instagram %s to canonical URL in upsertClub call', async (_caseName, input, expectedUrl) => {
                clubsApiMocks.getClub.mockResolvedValue(null);

                await renderPage();

                typeIntoField('Homepage Link', 'https://morpeth.example.com');
                typeIntoField('Instagram Handle', input);
                clickSave();

                await waitFor(() => {
                    expect(clubsApiMocks.upsertClub).toHaveBeenCalledWith(
                        managedClub.club_location,
                        managedClub.club_name,
                        expect.objectContaining({ instagram: expectedUrl })
                    );
                });
            });

            it.each([
                ['bare page name', 'morpeth.ttc', 'https://www.facebook.com/morpeth.ttc'],
                ['full Facebook URL', 'https://www.facebook.com/morpeth.ttc', 'https://www.facebook.com/morpeth.ttc'],
            ])('normalises Facebook %s to canonical URL in upsertClub call', async (_caseName, input, expectedUrl) => {
                clubsApiMocks.getClub.mockResolvedValue(null);

                await renderPage();

                typeIntoField('Homepage Link', 'https://morpeth.example.com');
                typeIntoField('Facebook Link', input);
                clickSave();

                await waitFor(() => {
                    expect(clubsApiMocks.upsertClub).toHaveBeenCalledWith(
                        managedClub.club_location,
                        managedClub.club_name,
                        expect.objectContaining({ facebook: expectedUrl })
                    );
                });
            });

            it.each([
                ['@handle', '@morpethttc', 'https://www.youtube.com/@morpethttc'],
                ['full YouTube URL', 'https://www.youtube.com/@morpethttc', 'https://www.youtube.com/@morpethttc'],
            ])('normalises YouTube %s to canonical URL in upsertClub call', async (_caseName, input, expectedUrl) => {
                clubsApiMocks.getClub.mockResolvedValue(null);

                await renderPage();

                typeIntoField('Homepage Link', 'https://morpeth.example.com');
                typeIntoField('YouTube', input);
                clickSave();

                await waitFor(() => {
                    expect(clubsApiMocks.upsertClub).toHaveBeenCalledWith(
                        managedClub.club_location,
                        managedClub.club_name,
                        expect.objectContaining({ youtube: expectedUrl })
                    );
                });
            });

            it('sends undefined for blank optional social fields', async () => {
                clubsApiMocks.getClub.mockResolvedValue(null);

                await renderPage();

                typeIntoField('Homepage Link', 'https://morpeth.example.com');
                typeIntoField('Instagram Handle', '');
                typeIntoField('Facebook Link', '');
                typeIntoField('YouTube', '');
                clickSave();

                await waitFor(() => {
                    expect(clubsApiMocks.upsertClub).toHaveBeenCalledWith(
                        managedClub.club_location,
                        managedClub.club_name,
                        {
                            homepage: 'https://morpeth.example.com',
                            instagram: undefined,
                            facebook: undefined,
                            youtube: undefined,
                        }
                    );
                });
            });

            it('passes the homepage URL unchanged', async () => {
                clubsApiMocks.getClub.mockResolvedValue(null);

                await renderPage();

                typeIntoField('Homepage Link', 'https://morpeth.example.com');
                clickSave();

                await waitFor(() => {
                    expect(clubsApiMocks.upsertClub).toHaveBeenCalledWith(
                        managedClub.club_location,
                        managedClub.club_name,
                        expect.objectContaining({ homepage: 'https://morpeth.example.com' })
                    );
                });
            });
        });
    });

    describe('test links', () => {
        it.each([
            ['Homepage Link', 'https://morpeth.example.com', 'https://morpeth.example.com'],
            ['Instagram Handle', '@morpeth.ttc', 'https://www.instagram.com/morpeth.ttc'],
            ['Facebook Link', 'morpeth.ttc', 'https://www.facebook.com/morpeth.ttc'],
            ['YouTube', '@morpethttc', 'https://www.youtube.com/@morpethttc'],
        ])('renders a Test link for valid normalized %s input', async (label, value, expectedHref) => {
            await renderPage();

            typeIntoField(label, value);

            const fieldControl = getFieldControl(label);
            const testLink = within(fieldControl).getByRole('link', { name: 'Test' });
            expect(testLink).toHaveAttribute('href', expectedHref);
            expect(testLink).toHaveAttribute('target', '_blank');
            expect(testLink).toHaveAttribute('rel', 'noreferrer');
        });

        it.each([
            ['Homepage Link', 'https://localhost'],
            ['Instagram Handle', 'not a handle!'],
            ['Facebook Link', 'not a facebook link!'],
            ['YouTube', 'youtube channel!'],
        ])('renders a disabled Test control for invalid %s input', async (label, value) => {
            await renderPage();

            typeIntoField(label, value);

            const fieldControl = getFieldControl(label);
            expect(within(fieldControl).queryByRole('link', { name: 'Test' })).not.toBeInTheDocument();
            expect(within(fieldControl).getByText('Test').tagName).toBe('SPAN');
        });
    });
});
