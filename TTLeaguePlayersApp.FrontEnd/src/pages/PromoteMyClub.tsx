import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { ProtectedRoute } from '../components/common/ProtectedRoute';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { FormField } from '../components/common/FormField';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { FieldError } from '../components/common/FieldError';
import { ManagedClubsCard } from '../components/ui/ManagedClubsCard';
import { useAuth } from '../hooks/useAuth';
import { clubsApi, type ClubInfoRequest } from '../api/clubsApi';
import { createManagedClubKey } from '../utils/clubUtils';
import { getConfig } from '../config/environment';
import { getClockTimeInEpochSeconds } from '../utils/DateUtils';
import { toUserFriendlyApiError } from '../utils/apiErrorUtils';

type ClubFieldName = 'homepage' | 'instagram' | 'facebook' | 'youtube';

type ClubFormValues = Record<ClubFieldName, string>;

type ClubFormErrors = Partial<Record<ClubFieldName, string>>;

const emptyFormValues: ClubFormValues = {
    homepage: '',
    instagram: '',
    facebook: '',
    youtube: '',
};

function isValidHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        
        // Must be http or https
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return false;
        }
        
        const hostname = url.hostname.toLowerCase();
        
        // Reject localhost and .local domains
        if (hostname === 'localhost' || hostname.endsWith('.local')) {
            return false;
        }
        
        // Reject single-word domains (must contain at least one dot for TLD)
        if (!hostname.includes('.')) {
            return false;
        }
        
        // Reject IPv4 addresses (e.g., 192.168.1.1)
        if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
            return false;
        }
        
        // Reject IPv6 addresses (contain colons)
        if (hostname.includes(':')) {
            return false;
        }
        
        return true;
    } catch {
        return false;
    }
}

function extractInstagramHandle(value: string | null | undefined): string {
    if (!value) return '';
    const trimmed = value.trim();
    if (isValidHttpUrl(trimmed)) {
        try {
            const url = new URL(trimmed);
            if (url.hostname.includes('instagram.com')) {
                const parts = url.pathname.split('/').filter(Boolean);
                if (parts.length > 0) {
                    return `@${parts[0]}`;
                }
            }
        } catch {
            // ignore
        }
        return trimmed;
    }
    return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
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
    // If it's just a handle, convert to URL
    if (/^@?[\w.-]+$/i.test(trimmed)) {
        return `https://www.facebook.com/${trimmed.replace(/^@/, '')}`;
    }
    return trimmed;
}

function extractYouTubeUrl(value: string | null | undefined): string {
    if (!value) return '';
    const trimmed = value.trim();
    if (isValidHttpUrl(trimmed)) {
        try {
            const url = new URL(trimmed);
            if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
                return trimmed;
            }
        } catch {
            // ignore
        }
        return trimmed;
    }
    // If it's just a handle, convert to URL
    if (/^@?[\w.-]+$/i.test(trimmed)) {
        return `https://www.youtube.com/@${trimmed.replace(/^@/, '')}`;
    }
    return trimmed;
}

function normalizeFieldValue(field: ClubFieldName, value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    if (field === 'homepage') {
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
                // Fall through to next check
            }
        }

        if (/^@?[\w.]+$/i.test(trimmed)) {
            return `https://www.instagram.com/${trimmed.replace(/^@/, '')}`;
        }

        return null;
    }

    if (field === 'facebook') {
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

    if (isValidHttpUrl(trimmed)) {
        try {
            const url = new URL(trimmed);
            if (url.hostname.includes('youtube.com')) {
                return trimmed;
            }
        } catch {
            // Fall through to next check
        }
    }

    if (/^(?:@?[\w.-]+|[\w.-]+(?:\/[\w.-]+)*|watch\?v=[\w-]+|playlist\?list=[\w-]+)$/i.test(trimmed)) {
        return `https://www.youtube.com/${trimmed.startsWith('@') ? trimmed : trimmed.replace(/^\//, '')}`;
    }

    return null;
}

function validateField(field: ClubFieldName, value: string): string | null {
    const trimmed = value.trim();

    if (field === 'homepage') {
        if (!trimmed) {
            return 'Homepage is required.';
        }

        if (!isValidHttpUrl(trimmed)) {
            return 'Please enter a valid homepage URL.';
        }

        return null;
    }

    if (!trimmed) {
        return null;
    }

    if (field === 'instagram') {
        if (isValidHttpUrl(trimmed)) {
            try {
                const url = new URL(trimmed);
                if (url.hostname.includes('instagram.com')) {
                    return null;
                }
            } catch {
                // Fall through to next check
            }
        }

        if (/^@?[\w.]+$/i.test(trimmed)) {
            return null;
        }

        return 'Please enter a valid Instagram handle or URL.';
    }

    if (field === 'facebook') {
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

        return 'Please enter a valid Facebook link.';
    }

    if (isValidHttpUrl(trimmed)) {
        try {
            const url = new URL(trimmed);
            if (url.hostname.includes('youtube.com')) {
                return null;
            }
        } catch {
            // Fall through to next check
        }
    }

    if (/^(?:@?[\w.-]+|[\w.-]+(?:\/[\w.-]+)*|watch\?v=[\w-]+|playlist\?list=[\w-]+)$/i.test(trimmed)) {
        return null;
    }

    return 'Please enter a valid YouTube URL or handle.';
}

export const PromoteMyClub: React.FC = () => {
    const { managedClubs: allManagedClubs } = useAuth();
    const navigate = useNavigate();
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
    const [formValues, setFormValues] = useState<ClubFormValues>(emptyFormValues);
    const [formErrors, setFormErrors] = useState<ClubFormErrors>({});
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasExistingClub, setHasExistingClub] = useState(false);
    const [hasFormChanged, setHasFormChanged] = useState(false);
    const [initialFormValues, setInitialFormValues] = useState<ClubFormValues>(emptyFormValues);
    const [showRemoveConfirmModal, setShowRemoveConfirmModal] = useState(false);

    const selectedManagedClub = managedClubs.find((club) => createManagedClubKey(club) === selectedClubKey) ?? null;
    const effectiveManagedClub = selectedManagedClub;

    useEffect(() => {
        if (managedClubs.length === 0) {
            setSelectedClubKey(null);
            setFormValues(emptyFormValues);
            setInitialFormValues(emptyFormValues);
            setHasExistingClub(false);
            setHasFormChanged(false);
            return;
        }
    }, [managedClubs]);

    useEffect(() => {
        if (!effectiveManagedClub) {
            setFormValues(emptyFormValues);
            setInitialFormValues(emptyFormValues);
            setHasExistingClub(false);
            setHasFormChanged(false);
            return;
        }

        const loadClubInfo = async () => {
            setIsLoading(true);
            setError(null);
            setFormErrors({});
            setFormValues(emptyFormValues);
            setHasFormChanged(false);

            try {
                const club = await clubsApi.getClub(effectiveManagedClub.club_location, effectiveManagedClub.club_name);
                if (club) {
                    const newFormValues = {
                        homepage: club.homepage,
                        instagram: extractInstagramHandle(club.instagram),
                        facebook: extractFacebookUrl(club.facebook),
                        youtube: extractYouTubeUrl(club.youtube),
                    };
                    setFormValues(newFormValues);
                    setInitialFormValues(newFormValues);
                    setHasExistingClub(true);
                } else {
                    setInitialFormValues(emptyFormValues);
                    setHasExistingClub(false);
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to load the club details.';
                setError(message);
                setInitialFormValues(emptyFormValues);
            } finally {
                setIsLoading(false);
            }
        };

        void loadClubInfo();
    }, [effectiveManagedClub]);

    const handleFieldChange = (field: ClubFieldName, value: string) => {
        const newFormValues = { ...formValues, [field]: value };
        setFormValues(newFormValues);
        setFormErrors((current) => ({ ...current, [field]: undefined }));
        setError(null);
        
        // Check if form has changed from initial values
        const hasChanged = (Object.keys(emptyFormValues) as ClubFieldName[]).some(
            (key) => newFormValues[key] !== initialFormValues[key]
        );
        setHasFormChanged(hasChanged);
    };

    const handleSave = async () => {
        if (isSaving) {
            return;
        }

        if (!effectiveManagedClub) {
            return;
        }

        const errors: ClubFormErrors = {};
        (Object.keys(emptyFormValues) as ClubFieldName[]).forEach((field) => {
            const validationError = validateField(field, formValues[field]);
            if (validationError) {
                errors[field] = validationError;
            }
        });

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        const request: ClubInfoRequest = {
            homepage: normalizeFieldValue('homepage', formValues.homepage) ?? formValues.homepage.trim(),
            instagram: normalizeFieldValue('instagram', formValues.instagram) ?? undefined,
            facebook: normalizeFieldValue('facebook', formValues.facebook) ?? undefined,
            youtube: normalizeFieldValue('youtube', formValues.youtube) ?? undefined,
        };

        setIsSaving(true);
        setError(null);

        try {
            const refreshedClub = await clubsApi.upsertClub(effectiveManagedClub.club_location, effectiveManagedClub.club_name, request);
            const newFormValues = {
                homepage: refreshedClub.homepage,
                instagram: extractInstagramHandle(refreshedClub.instagram),
                facebook: extractFacebookUrl(refreshedClub.facebook),
                youtube: extractYouTubeUrl(refreshedClub.youtube),
            };
            setFormValues(newFormValues);
            setInitialFormValues(newFormValues);
            setHasExistingClub(true);
            setHasFormChanged(false);
            // Redirect to clubs-and-tournaments after successful save
            void navigate('/clubs-and-tournaments');
            setFormErrors({});
        } catch (err) {
            setError(toUserFriendlyApiError(err, 'The club could not be saved. Please try again.'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemoveClick = () => {
        if (!effectiveManagedClub || !hasExistingClub) {
            return;
        }
        setShowRemoveConfirmModal(true);
    };

    const handleRemoveConfirm = async () => {
        if (!effectiveManagedClub || !hasExistingClub) {
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            await clubsApi.deleteClub(effectiveManagedClub.club_location, effectiveManagedClub.club_name);
            setFormValues(emptyFormValues);
            setInitialFormValues(emptyFormValues);
            setFormErrors({});
            setHasExistingClub(false);
            setHasFormChanged(false);
            setShowRemoveConfirmModal(false);
            // Redirect to clubs-and-tournaments after successful remove
            void navigate('/clubs-and-tournaments');
        } catch (err) {
            setShowRemoveConfirmModal(false);
            setError(toUserFriendlyApiError(err, 'The club could not be removed. Please try again.'));
        } finally {
            setIsSaving(false);
        }
    };

    const renderField = (field: ClubFieldName, label: string, placeholder: string, type: 'text' | 'url' = 'text') => {
        const value = formValues[field];
        const normalizedLink = normalizeFieldValue(field, value);
        const fieldError = formErrors[field];

        return (
            <FormField
                key={field}
                htmlFor={field}
                label={label}
                hint={fieldError ? <FieldError>{fieldError}</FieldError> : null}
            >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                        id={field}
                        type={type}
                        value={value}
                        onChange={(event) => { handleFieldChange(field, event.target.value); }}
                        placeholder={placeholder}
                        className={fieldError ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}
                    />
                    {normalizedLink ? (
                        <a
                            href={normalizedLink}
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
        );
    };

    return (
        <ProtectedRoute>
            <MobileLayout>
                <PageContainer 
                    title="Promote My Club"
                    footer={
                        managedClubs.length > 0 && !isLoading && effectiveManagedClub ? (
                            <div className="space-y-3 pt-6">
                                {error ? <ErrorMessage>{error}</ErrorMessage> : null}
                                <div className="flex flex-row gap-3">
                                    <Button 
                                        onClick={() => { void handleSave(); }} 
                                        disabled={isSaving || !hasFormChanged}
                                        className="flex-1"
                                    >
                                        {isSaving ? 'Saving...' : hasExistingClub ? 'UPDATE' : 'ADD'}
                                    </Button>
                                    <Button
                                        onClick={() => { handleRemoveClick(); }}
                                        disabled={isSaving || !hasExistingClub}
                                        className="!bg-gray-600 hover:!bg-gray-700 flex-1"
                                    >
                                        REMOVE
                                    </Button>
                                </div>
                            </div>
                        ) : null
                    }
                >
                    <div className="space-y-6 sm:space-y-8">
                        <p>
                            Add your club to our directory to help players find your venue and join your club. Promote the tournaments your club organises.
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
                                    isLoading ? (
                                        <p className="text-sm text-secondary-text">Loading club information…</p>
                                    ) : (
                                        <div className="space-y-4">
                                            {renderField('homepage', 'Homepage Link', 'https://yourclub.example.com', 'url')}
                                            {renderField('instagram', 'Instagram Handle', '@yourclub', 'text')}
                                            {renderField('youtube', 'YouTube', '@yourchannel or channel URL', 'text')}
                                            {renderField('facebook', 'Facebook Link', 'https://facebook.com/yourclub', 'url')}
                                        </div>
                                    )
                                ) : null}
                            </>
                        )}
                    </div>
                </PageContainer>
                
                {showRemoveConfirmModal && effectiveManagedClub && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
                        <div className="bg-primary-base border border-gray-600 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-6">
                            <h3 className="text-xl font-bold text-main-text text-center">Confirm Removal<br />of {effectiveManagedClub.club_name}</h3>

                            <div className="text-center space-y-2">
                                <p className="text-base sm:text-lg">
                                    You are about to <span className="font-bold text-action-accent">REMOVE</span> your club from the directory
                                </p>
                                <p className="text-base">
                                    Location: {effectiveManagedClub.club_location}
                                </p>
                                <p className="text-sm text-secondary-text mt-4">
                                    This action cannot be undone. Your club information will be permanently deleted.
                                </p>
                            </div>

                            {error && <ErrorMessage>{error}</ErrorMessage>}

                            <div className="grid grid-cols-2 gap-4 pt-4">
                                <Button
                                    onClick={() => { setShowRemoveConfirmModal(false); }}
                                    className="!bg-gray-600 hover:!bg-gray-700"
                                    disabled={isSaving}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={() => { void handleRemoveConfirm(); }}
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
