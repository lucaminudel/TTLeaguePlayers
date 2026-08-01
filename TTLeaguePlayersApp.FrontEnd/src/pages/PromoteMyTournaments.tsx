import React, { useEffect, useState } from 'react';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { ProtectedRoute } from '../components/common/ProtectedRoute';
import { ManagedClubsCard } from '../components/ui/ManagedClubsCard';
import { Button } from '../components/common/Button';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Input } from '../components/common/Input';
import { FormField } from '../components/common/FormField';
import { FieldError } from '../components/common/FieldError';
import { useAuth } from '../hooks/useAuth';
import { clubsApi } from '../api/clubsApi';
import type { TournamentInfo, TournamentRequest } from '../api/clubsApi';
import { createManagedClubKey } from '../utils/clubUtils';
import { getConfig } from '../config/environment';
import { getClockTimeInEpochSeconds } from '../utils/DateUtils';
import { toUserFriendlyApiError } from '../utils/apiErrorUtils';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFacebookSquare, faInstagram } from '@fortawesome/free-brands-svg-icons';

function formatTournamentDateRange(startDate: number, endDate: number): string {
    const start = new Date(startDate * 1000);
    const end = new Date(endDate * 1000);
    const now = new Date();
    const currentYear = now.getFullYear();

    const startYear = start.getFullYear();
    const endYear = end.getFullYear();
    const startMonth = start.toLocaleString('default', { month: 'short' });
    const endMonth = end.toLocaleString('default', { month: 'short' });
    const startDay = start.getDate();
    const endDay = end.getDate();

    // If both start and end are in the current year, don't show the year at all.
    const showYear = !(startYear === currentYear && endYear === currentYear);

    // Otherwise, if start and end share the same year, only show it once (on the end date).
    const showStartYear = showYear && startYear !== endYear;

    // If start and end share the same month, only show it once (on the end date).
    const showStartMonth = startMonth !== endMonth;

    // If start and end share the same day, only show it once (on the end date).
    const showStartDay = startDay !== endDay;

    const startDayMonth = [
        showStartDay ? String(startDay) : null,
        showStartMonth ? startMonth : null,
    ].filter((part): part is string => part !== null).join(' ');

    const startResult = showStartYear
        ? (startDayMonth ? `${startDayMonth}, ${String(startYear)}` : String(startYear))
        : startDayMonth;

    const endResult = showYear
        ? `${String(endDay)} ${endMonth}, ${String(endYear)}`
        : `${String(endDay)} ${endMonth}`;

    return startResult ? `${startResult} - ${endResult}` : endResult;
}

function isValidHttpUrl(value: string): boolean {
    try {
        const parsedUrl = new URL(value);
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            return false;
        }
        // Round-trip canonical form check: if the WHATWG parser had to normalise
        // anything (e.g. backslash → slash, space encoding, etc.) the input was
        // not well-formed. Bare-authority URLs get a trailing slash added — allow that.
        if (parsedUrl.href !== value && parsedUrl.href !== `${value}/`) {
            return false;
        }
        const hostname = parsedUrl.hostname.toLowerCase();
        if (hostname === 'localhost' || hostname.endsWith('.local')) {
            return false;
        }
        if (!hostname.includes('.')) {
            return false;
        }
        if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
            return false;
        }
        if (hostname.includes(':')) {
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

// Returns the WHATWG-normalised URL when the input is a parseable URL that fails
// the canonical form check (e.g. contains backslashes). Returns null when the
// input is already canonical, unparseable, or when the normalised form is itself invalid.
function getNormalizedUrl(value: string): string | null {
    const trimmed = value.trim();
    try {
        const url = new URL(trimmed);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        const normalized = url.href;
        if (normalized === trimmed || normalized === `${trimmed}/`) return null;
        if (!isValidHttpUrl(normalized)) return null;
        return normalized;
    } catch {
        return null;
    }
}

function extractInstagramUrl(value: string | null | undefined): string {
    if (!value) return '';
    return value.trim();
}

function extractFacebookUrl(value: string | null | undefined): string {
    if (!value) return '';
    const trimmed = value.trim();
    if (isValidHttpUrl(trimmed)) {
        try {
            const url = new URL(trimmed);
            if (url.hostname.includes('facebook.com')) {
                return trimmed;
            }
        } catch {
            // ignore
        }
        return trimmed;
    }
    if (/^@?[\w.-]+$/i.test(trimmed)) {
        return `https://www.facebook.com/${trimmed.replace(/^@/, '')}`;
    }
    return trimmed;
}

function normalizeFieldValue(field: 'tournament_info' | 'instagram' | 'facebook', value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    if (field === 'tournament_info') {
        return isValidHttpUrl(trimmed) ? trimmed : null;
    }

    if (field === 'instagram') {
        if (isValidHttpUrl(trimmed)) {
            try {
                const url = new URL(trimmed);
                if (url.hostname.includes('instagram.com')) {
                    return trimmed;
                }
            } catch {
                // Fall through
            }
        }
        return null;
    }

    // field === 'facebook'
    if (isValidHttpUrl(trimmed)) {
        try {
            const url = new URL(trimmed);
            if (url.hostname.includes('facebook.com')) {
                return trimmed;
            }
        } catch {
            // Fall through to next check
        }
    }

    if (/^@?[\w.-]+$/i.test(trimmed)) {
        return `https://www.facebook.com/${trimmed.replace(/^@/, '')}`;
    }

    return null;
}

function validateTournamentField(field: keyof TournamentInfo, value: TournamentInfo[keyof TournamentInfo], allValues: TournamentInfo): string | null {
    if (field === 'tournament_name') {
        const trimmed = String(value ?? '').trim();
        if (!trimmed) {
            return 'Tournament name is required.';
        }
        return null;
    }

    if (field === 'tournament_info') {
        const trimmed = String(value ?? '').trim();
        if (!trimmed) {
            return 'Tournament info URL is required.';
        }
        if (!isValidHttpUrl(trimmed)) {
            const suggestion = getNormalizedUrl(trimmed);
            const base = 'Please enter a valid tournament info URL.';
            return suggestion ? `${base} Did you mean: ${suggestion}?` : base;
        }
        return null;
    }

    if (field === 'instagram') {
        const trimmed = String(value ?? '').trim();
        if (!trimmed) {
            return null;
        }
        if (isValidHttpUrl(trimmed)) {
            try {
                const url = new URL(trimmed);
                if (url.hostname.includes('instagram.com')) {
                    return null;
                }
            } catch {
                // Fall through
            }
        }
        const suggestion = getNormalizedUrl(trimmed);
        const base = 'Please enter a valid Instagram post URL (e.g. https://www.instagram.com/p/...)';
        return suggestion ? `${base}. Did you mean: ${suggestion}?` : `${base}.`;
    }

    if (field === 'facebook') {
        const trimmed = String(value ?? '').trim();
        if (!trimmed) {
            return null;
        }
        if (isValidHttpUrl(trimmed)) {
            try {
                const url = new URL(trimmed);
                if (url.hostname.includes('facebook.com')) {
                    return null;
                }
            } catch {
                // Fall through to next check
            }
        }
        if (/^@?[\w.-]+$/i.test(trimmed)) {
            return null;
        }
        const suggestion = getNormalizedUrl(trimmed);
        const base = 'Please enter a valid Facebook link.';
        return suggestion ? `${base} Did you mean: ${suggestion}?` : base;
    }

    if (field === 'start_date') {
        const numValue = Number(value);
        if (!numValue || isNaN(numValue)) {
            return 'Start date is required.';
        }
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        if (numValue < Math.floor(todayStart.getTime() / 1000)) {
            return 'Start date cannot be earlier than today.';
        }
        return null;
    }

    // field === 'end_date'
    const numValue = Number(value);
    if (!numValue || isNaN(numValue)) {
        return 'End date is required.';
    }
    if (allValues.start_date && numValue < allValues.start_date) {
        return 'End date must be on or after start date.';
    }
    return null;
}


export const PromoteMyTournaments: React.FC = () => {
    const { managedClubs: allManagedClubs } = useAuth();
    const config = getConfig();
    const nowEpoch = getClockTimeInEpochSeconds();

    const managedClubs = allManagedClubs.filter(club => {
        try {
            const dataSourceList = config.active_seasons_data_source as typeof config.active_seasons_data_source | undefined;
            if (!dataSourceList || dataSourceList.length === 0) {
                throw new Error('Configuration error: active_seasons_data_source is missing from the environment config.');
            }

            const matchingConfig = dataSourceList.find(
                source => source.league === club.league && source.season === club.season
            );

            if (!matchingConfig) {
                throw new Error(`Data source not found for league "${club.league}" and season "${club.season}".`);
            }

            const startEpoch = matchingConfig.registrations_start_date;
            const endDate = new Date(matchingConfig.ratings_end_date * 1000);
            const endOfYear = new Date(Date.UTC(endDate.getUTCFullYear(), 11, 31, 23, 59, 59));
            const endOfYearEpoch = Math.floor(endOfYear.getTime() / 1000);

            return nowEpoch >= startEpoch && nowEpoch <= endOfYearEpoch;
        } catch (err) {
            console.info('❌ Page event log processing managed club:', err);
            //throw err;
            return false;
        }
    });

    const [selectedClubKey, setSelectedClubKey] = useState<string | null>(null);
    const [tournaments, setTournaments] = useState<TournamentInfo[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [editingTournament, setEditingTournament] = useState<TournamentInfo | null>(null);
    const [isNewTournament, setIsNewTournament] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
    const [deletingTournament, setDeletingTournament] = useState<TournamentInfo | null>(null);
    const [formErrors, setFormErrors] = useState<Partial<Record<keyof TournamentInfo, string>>>({});

    const selectedManagedClub = managedClubs.find((club) => createManagedClubKey(club) === selectedClubKey) ?? null;
    const effectiveManagedClub = selectedManagedClub;

    useEffect(() => {
        if (managedClubs.length === 0) {
            setSelectedClubKey(null);
            return;
        }
    }, [managedClubs]);

    useEffect(() => {
        if (!effectiveManagedClub) {
            setTournaments([]);
            setEditingTournament(null);
            return;
        }

        const loadTournaments = async () => {
            setIsLoading(true);
            setLoadError(null);
            try {
                const clubTournaments = await clubsApi.getTournamentsForClub(effectiveManagedClub.club_location, effectiveManagedClub.club_name);
                setTournaments(clubTournaments);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to load tournaments.';
                setLoadError(message);
                setTournaments([]);
            } finally {
                setIsLoading(false);
            }
        };

        void loadTournaments();
    }, [effectiveManagedClub]);

    const handleEditTournament = (tournament: TournamentInfo) => {
        setEditingTournament({
            ...tournament,
            instagram: extractInstagramUrl(tournament.instagram),
            facebook: extractFacebookUrl(tournament.facebook),
        });
        setIsNewTournament(false);
        setFormErrors({});
        setActionError(null);
    };

    const handleFieldChange = (field: keyof TournamentInfo, value: TournamentInfo[keyof TournamentInfo]) => {
        if (!editingTournament) return;
        setEditingTournament({ ...editingTournament, [field]: value } as TournamentInfo);
        setFormErrors((current) => ({ ...current, [field]: undefined }));
        setActionError(null);
    };

    const handleDeleteTournament = (tournament: TournamentInfo) => {
        setDeletingTournament(tournament);
        setShowDeleteConfirmModal(true);
        setActionError(null);
    };

    const handleDeleteConfirm = async () => {
        if (!deletingTournament || !effectiveManagedClub) {
            return;
        }

        setIsSaving(true);
        setActionError(null);

        try {
            await clubsApi.deleteTournament(
                effectiveManagedClub.club_location,
                effectiveManagedClub.club_name,
                deletingTournament.tournament_name
            );
            setTournaments(tournaments.filter(t => t.tournament_name !== deletingTournament.tournament_name));
            setShowDeleteConfirmModal(false);
            setDeletingTournament(null);
        } catch (err) {
            let userMessage = toUserFriendlyApiError(err, 'The tournament could not be deleted. Please try again.');
            if (err && typeof err === 'object' && 'errors' in err) {
                const errObj = err as { errors?: string[] };
                if (Array.isArray(errObj.errors) && errObj.errors.length > 0) {
                    userMessage += " ( ";
                    userMessage += errObj.errors.join(', ');
                    userMessage += " )";
                }
            }
            setActionError(userMessage);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveTournament = async (tournamentData: TournamentRequest) => {
        if (!effectiveManagedClub) {
            return;
        }

        setIsSaving(true);
        setActionError(null);

        try {
            const tournamentName = editingTournament?.tournament_name ?? tournamentData.tournament_info;
            const savedTournament = await clubsApi.upsertTournament(
                effectiveManagedClub.club_location,
                effectiveManagedClub.club_name,
                tournamentName,
                tournamentData
            );

            if (isNewTournament) {
                setTournaments([...tournaments, savedTournament]);
            } else {
                setTournaments(tournaments.map(t =>
                    t.tournament_name === editingTournament?.tournament_name ? savedTournament : t
                ));
            }

            setEditingTournament(null);
        } catch (err) {
            let userMessage = toUserFriendlyApiError(err, 'The tournament could not be saved. Please try again.');
            if (err && typeof err === 'object' && 'errors' in err) {
                const errObj = err as { errors?: string[] };
                if (Array.isArray(errObj.errors) && errObj.errors.length > 0) {
                    userMessage += " ( ";
                    userMessage += errObj.errors.join(', ');
                    userMessage += " )";
                }
            }
            setActionError(userMessage);
        } finally {
            setIsSaving(false);
        }
    };



    return (
        <ProtectedRoute>
            <MobileLayout>
                <PageContainer 
                    title="Promote My Tournament"
                    footer={
                        managedClubs.length > 0 && effectiveManagedClub && !isLoading ? (
                            <div className="space-y-3 pt-6">
                                <Button
                                    onClick={() => {
                                        setEditingTournament({
                                            tournament_name: '',
                                            tournament_info: '',
                                            instagram: '',
                                            facebook: '',
                                            start_date: Math.floor(Date.now() / 1000),
                                            end_date: Math.floor(Date.now() / 1000)
                                        } as TournamentInfo);
                                        setIsNewTournament(true);
                                        setFormErrors({});
                                        setActionError(null);
                                    }}
                                    className="w-full"
                                >
                                    ADD TOURNAMENT
                                </Button>
                            </div>
                        ) : null
                    }
                >
                    <div className="space-y-6 sm:space-y-8">
                        <p>
                            Promote the tournaments your club organises
                        </p>

                        {managedClubs.length === 0 ? (
                            <div className="rounded-lg border border-gray-600 bg-primary p-4">
                                <p className="text-base sm:text-lg leading-relaxed">
                                    ⚠️ You are not currently registered as a club manager.
                                </p>
                                <p className="mt-2 text-sm text-secondary-text">
                                    Ask the league team for manager access so you can promote your club here.
                                </p>
                            </div>
                        ) : (
                            <>
                                <ManagedClubsCard
                                    managedClubs={managedClubs}
                                    selectedClubKey={selectedClubKey}
                                    onSelectClub={setSelectedClubKey}
                                    effectiveClubName={effectiveManagedClub?.club_name}
                                    groupByLocation
                                />

                                {effectiveManagedClub ? (
                                    <div className="space-y-4">
                                        <p className="text-sm text-secondary-text">
                                            Now you can promote tournaments for {effectiveManagedClub.club_name} in {effectiveManagedClub.club_location}.
                                        </p>

                                        {isLoading ? (
                                            <p className="text-sm text-secondary-text">Loading tournaments…</p>
                                        ) : loadError ? (
                                            <ErrorMessage testId="main-error">{loadError}</ErrorMessage>
                                        ) : tournaments.length === 0 ? (
                                            <p className="text-sm text-secondary-text">No tournaments found. Add your first tournament below.</p>
                                        ) : (
                                            <div>
                                                <table className="w-full table-fixed divide-y divide-gray-600">
                                                    <thead className="bg-gray-800">
                                                        <tr>
                                                            <th className="w-16 pl-0 pr-2 py-3"></th>
                                                            <th className="pl-2 pr-1 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                                                Tournament
                                                            </th>
                                                            <th className="w-16 pl-[10px] pr-2 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                                                Social
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="bg-primary divide-y divide-gray-600">
                                                        {tournaments.map((tournament) => (
                                                            <tr key={tournament.tournament_name}>
                                                                <td className="w-16 pl-0 pr-2 py-4 whitespace-nowrap text-sm font-medium">
                                                                    <div className="flex gap-4">
                                                                        <button
                                                                            onClick={() => { handleEditTournament(tournament); }}
                                                                            className="text-blue-500 hover:text-blue-400"
                                                                            title="Edit"
                                                                        >
                                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                            </svg>
                                                                        </button>
                                                                        <button
                                                                            onClick={() => { handleDeleteTournament(tournament); }}
                                                                            className="text-red-500 hover:text-red-400"
                                                                            title="Delete"
                                                                        >
                                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                            </svg>
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                                <td className="pl-2 pr-1 py-4 break-words text-sm font-medium text-main-text text-left">
                                                                    <a
                                                                        href={tournament.tournament_info}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        className="text-blue-500 hover:text-blue-400 underline"
                                                                        data-testid="tournament-link"
                                                                    >
                                                                        {tournament.tournament_name}, {formatTournamentDateRange(tournament.start_date, tournament.end_date)}
                                                                    </a>
                                                                </td>
                                                                <td className="w-16 pl-[10px] pr-2 py-4 whitespace-nowrap text-sm text-main-text">
                                                                    <div className="flex gap-2">
                                                                        {tournament.instagram && (
                                                                            <a
                                                                                href={tournament.instagram}
                                                                                target="_blank"
                                                                                rel="noreferrer"
                                                                                className="text-pink-600 hover:text-pink-500"
                                                                                data-testid="tournament-instagram-link"
                                                                            >
                                                                                <FontAwesomeIcon icon={faInstagram} size="lg" />
                                                                            </a>
                                                                        )}
                                                                        {tournament.facebook && (
                                                                            <a
                                                                                href={tournament.facebook}
                                                                                target="_blank"
                                                                                rel="noreferrer"
                                                                                className="text-blue-600 hover:text-blue-500"
                                                                                data-testid="tournament-facebook-link"
                                                                            >
                                                                                <FontAwesomeIcon icon={faFacebookSquare} size="lg" />
                                                                            </a>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                ) : null}
                            </>
                        )}
                    </div>
                </PageContainer>
                
                {editingTournament && effectiveManagedClub && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
                        <div className="bg-primary-base border border-gray-600 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-6">
                            <h3 className="text-xl font-bold text-main-text text-center">
                                {isNewTournament ? 'Add Tournament' : 'Edit Tournament'}
                            </h3>

                            <div className="space-y-4">
                                <FormField
                                    htmlFor="tournament_name"
                                    label="Tournament Name"
                                    hint={formErrors.tournament_name ? <FieldError>{formErrors.tournament_name}</FieldError> : null}
                                >
                                    <Input
                                        id="tournament_name"
                                        type="text"
                                        value={editingTournament.tournament_name}
                                        onChange={(e) => { handleFieldChange('tournament_name', e.target.value); }}
                                        placeholder="Enter tournament name"
                                        disabled={!isNewTournament}
                                        className={formErrors.tournament_name ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}
                                    />
                                </FormField>

                                <FormField
                                    htmlFor="tournament_info"
                                    label="Tournament Info URL"
                                    hint={formErrors.tournament_info ? <FieldError>{formErrors.tournament_info}</FieldError> : null}
                                >
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                        <Input
                                            id="tournament_info"
                                            type="url"
                                            value={editingTournament.tournament_info}
                                            onChange={(e) => { handleFieldChange('tournament_info', e.target.value); }}
                                            placeholder="https://club.com/tournament_info.html"
                                            className={formErrors.tournament_info ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}
                                        />
                                        {normalizeFieldValue('tournament_info', editingTournament.tournament_info) ? (
                                            <a
                                                href={normalizeFieldValue('tournament_info', editingTournament.tournament_info) ?? ''}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center justify-center rounded-md border border-blue-500 px-3 py-1 text-sm font-semibold text-blue-500 hover:bg-blue-50 whitespace-nowrap"
                                            >
                                                Test
                                            </a>
                                        ) : (
                                            <span className="inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-500 whitespace-nowrap">
                                                Test
                                            </span>
                                        )}
                                    </div>
                                </FormField>

                                <FormField
                                    htmlFor="instagram"
                                    label="Instagram Post"
                                    hint={formErrors.instagram ? <FieldError>{formErrors.instagram}</FieldError> : null}
                                >
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                        <Input
                                            id="instagram"
                                            type="url"
                                            value={editingTournament.instagram ?? ''}
                                            onChange={(e) => { handleFieldChange('instagram', e.target.value); }}
                                            placeholder="https://www.instagram.com/p/..."
                                            className={formErrors.instagram ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}
                                        />
                                        {normalizeFieldValue('instagram', editingTournament.instagram ?? '') ? (
                                            <a
                                                href={normalizeFieldValue('instagram', editingTournament.instagram ?? '') ?? ''}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center justify-center rounded-md border border-blue-500 px-3 py-1 text-sm font-semibold text-blue-500 hover:bg-blue-50 whitespace-nowrap"
                                            >
                                                Test
                                            </a>
                                        ) : (
                                            <span className="inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-500 whitespace-nowrap">
                                                Test
                                            </span>
                                        )}
                                    </div>
                                </FormField>

                                <FormField
                                    htmlFor="facebook"
                                    label="Facebook Post"
                                    hint={formErrors.facebook ? <FieldError>{formErrors.facebook}</FieldError> : null}
                                >
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                        <Input
                                            id="facebook"
                                            type="url"
                                            value={editingTournament.facebook ?? ''}
                                            onChange={(e) => { handleFieldChange('facebook', e.target.value); }}
                                            placeholder="https://facebook.com/tournament"
                                            className={formErrors.facebook ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}
                                        />
                                        {normalizeFieldValue('facebook', editingTournament.facebook ?? '') ? (
                                            <a
                                                href={normalizeFieldValue('facebook', editingTournament.facebook ?? '') ?? ''}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center justify-center rounded-md border border-blue-500 px-3 py-1 text-sm font-semibold text-blue-500 hover:bg-blue-50 whitespace-nowrap"
                                            >
                                                Test
                                            </a>
                                        ) : (
                                            <span className="inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-500 whitespace-nowrap">
                                                Test
                                            </span>
                                        )}
                                    </div>
                                </FormField>

                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        htmlFor="start_date"
                                        label="Start Date"
                                        error={formErrors.start_date ? <FieldError>{formErrors.start_date}</FieldError> : null}
                                    >
                                        <Input
                                            id="start_date"
                                            type="date"
                                            value={editingTournament.start_date ? new Date(editingTournament.start_date * 1000).toISOString().split('T')[0] : ''}
                                            onChange={(e) => {
                                                if (!e.target.value) {
                                                    handleFieldChange('start_date', NaN);
                                                    return;
                                                }
                                                const date = new Date(e.target.value);
                                                handleFieldChange('start_date', Math.floor(date.getTime() / 1000));
                                            }}
                                            className={formErrors.start_date ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}
                                        />
                                    </FormField>

                                    <FormField
                                        htmlFor="end_date"
                                        label="End Date"
                                        error={formErrors.end_date ? <FieldError>{formErrors.end_date}</FieldError> : null}
                                    >
                                        <Input
                                            id="end_date"
                                            type="date"
                                            value={editingTournament.end_date ? new Date(editingTournament.end_date * 1000).toISOString().split('T')[0] : ''}
                                            onChange={(e) => {
                                                if (!e.target.value) {
                                                    handleFieldChange('end_date', NaN);
                                                    return;
                                                }
                                                const date = new Date(e.target.value);
                                                handleFieldChange('end_date', Math.floor(date.getTime() / 1000));
                                            }}
                                            className={formErrors.end_date ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}
                                        />
                                    </FormField>
                                </div>
                            </div>

                            {actionError && <ErrorMessage testId="delete-error">{actionError}</ErrorMessage>}

                            <div className="grid grid-cols-2 gap-4 pt-4">
                                <Button
                                    onClick={() => { setEditingTournament(null); setActionError(null); }}
                                    className="!bg-gray-600 hover:!bg-gray-700"
                                    disabled={isSaving}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={() => {
                                        if (isSaving) {
                                            return;
                                        }

                                        const errors: Partial<Record<keyof TournamentInfo, string>> = {};
                                        const fields: (keyof TournamentInfo)[] = ['tournament_name', 'tournament_info', 'instagram', 'facebook', 'start_date', 'end_date'];
                                        
                                        fields.forEach((field) => {
                                            const validationError = validateTournamentField(field, editingTournament[field], editingTournament);
                                            if (validationError) {
                                                errors[field] = validationError;
                                            }
                                        });

                                        if (Object.keys(errors).length > 0) {
                                            setFormErrors(errors);
                                            return;
                                        }

                                        const tournamentData: TournamentRequest = {
                                            tournament_info: normalizeFieldValue('tournament_info', editingTournament.tournament_info) ?? editingTournament.tournament_info.trim(),
                                            instagram: normalizeFieldValue('instagram', editingTournament.instagram ?? '') ?? undefined,
                                            facebook: normalizeFieldValue('facebook', editingTournament.facebook ?? '') ?? undefined,
                                            start_date: editingTournament.start_date,
                                            end_date: editingTournament.end_date,
                                        };

                                        void handleSaveTournament(tournamentData);
                                    }}
                                    disabled={isSaving}
                                >
                                    {isSaving ? 'Saving...' : isNewTournament ? 'ADD' : 'UPDATE'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {showDeleteConfirmModal && deletingTournament && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
                        <div className="bg-primary-base border border-gray-600 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-6">
                            <h3 className="text-xl font-bold text-main-text text-center" data-testid="delete-confirm-title">Confirm Removal<br />of {deletingTournament.tournament_name}</h3>

                            <div className="text-center space-y-2">
                                <p className="text-base sm:text-lg">
                                    You are about to <span className="font-bold text-action-accent">REMOVE</span> this tournament
                                </p>
                                <p className="text-sm text-secondary-text mt-4">
                                    This action cannot be undone. The tournament information will be permanently deleted.
                                </p>
                            </div>

                            {actionError && <ErrorMessage testId="delete-error">{actionError}</ErrorMessage>}

                            <div className="grid grid-cols-2 gap-4 pt-4">
                                <Button
                                    onClick={() => { setShowDeleteConfirmModal(false); setDeletingTournament(null); setActionError(null); }}
                                    className="!bg-gray-600 hover:!bg-gray-700"
                                    disabled={isSaving}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={() => { void handleDeleteConfirm(); }}
                                    disabled={isSaving}
                                    className="!bg-action-accent hover:!bg-red-700"
                                >
                                    {isSaving ? 'Removing...' : 'Confirm Remove'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </MobileLayout>
        </ProtectedRoute>
    );
};
