import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { Button } from '../components/common/Button';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { inviteApi } from '../api/inviteApi';
import { useAuth } from '../hooks/useAuth';
import { useAcceptInvite } from '../hooks/useAcceptInvite';
import type { Invite } from '../types/invite';

export const Join: React.FC = () => {
    const { inviteId } = useParams<{ inviteId: string }>();
    const navigate = useNavigate();
    const effectiveInviteId = inviteId ?? '';
    const { email, isAuthenticated, refreshActiveSeasons } = useAuth();
    const { status: acceptInviteStatus, error: acceptInviteError, acceptInvite } = useAcceptInvite();

    const [invite, setInvite] = useState<Invite | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<{ message: string; showRetry: boolean } | null>(null);
    const [isAcceptingInvite, setIsAcceptingInvite] = useState(false);

    // Determine if this is an accept invite flow (user already registered and logged in)
    const isAcceptInviteFlow = isAuthenticated && email === invite?.invitee_email_id;

    const isAcceptFlow = isAcceptInviteFlow || (invite?.invitee_already_registered ?? false);

    const title = !invite
        ? "Join / Accept Invite"
        : isAcceptFlow
            ? invite.invitee_role === 'CLUB_MANAGER'
                ? "Accept - Club Invite"
                : "Accept - Personal Invite"
            : invite.invitee_role === 'CLUB_MANAGER'
                ? "Join - Club Invite"
                : "Join - Personal Invite";

    useEffect(() => {
        document.title = title;
    }, [title]);

    useEffect(() => {

        const fetchInvite = async () => {
            try {
                setLoading(true);
                // 5s timeout * (1 initial + 3 retries) = ~20s total wait
                const data = await inviteApi.getInvite(effectiveInviteId, 5000, 3);
                setInvite(data);
                setError(null);
            } catch (err: unknown) {
                let message = 'An unexpected error occurred. Please try again.';
                let showRetry = true;

                // Type-safe error property check
                const isApiError = (e: unknown): e is { status?: number; message?: string; response?: string } => {
                    return typeof e === 'object' && e !== null && ('status' in e || 'message' in e);
                };

                if (isApiError(err)) {
                    const status = err.status;
                    const errMessage = err.message ?? '';
                    const errResponse = err.response ?? '';

                    if (status === 400 && errResponse.includes('nano_id malformed')) {
                        message = 'Please check this invitation link; it appears to be incorrect, missing characters, or containing extra ones.';
                        showRetry = false;
                    } else if (status === 404) {
                        message = 'This invitation cannot be found. It may have expired, been canceled, or is no longer valid. If you believe this is an error, please contact us.';
                        showRetry = false;
                    } else if (status === 409) {
                        message = 'Invite already used. Have you already registered? Try to login';
                        showRetry = false;
                    } else if (status !== undefined && status >= 500) {
                        message = 'The server is not available, retry later';
                        showRetry = true;
                    } else if (errMessage === 'Connection error' || status === undefined || errMessage.includes('NetworkError') || errMessage.includes('Failed to fetch')) {
                        message = 'Network connection error. Make sure you are online and retry later';
                        showRetry = true;
                    } else if (errMessage !== '') {
                        message = errMessage;
                    }
                } else if (err instanceof Error) {
                    message = err.message;
                }

                setError({ message, showRetry });
                console.error('Error fetching invite:', err);
            } finally {
                setLoading(false);
            }
        };

        void fetchInvite();
    }, [effectiveInviteId]);

    const displayRole = (role?: string) => {
        if (!role) return '';
        if (role === 'CAPTAIN') return 'Team Captain';
        if (role === 'PLAYER') return 'Player';
        if (role === 'CLUB_MANAGER') return 'Club Manager';
        return role;
    };

    if (loading) {
        return (
            <MobileLayout>
                <PageContainer title={title}>
                    <div className="flex flex-col justify-center items-center min-h-48 sm:min-h-64 space-y-4">
                        <div className="spinner"></div>
                        <p className="text-secondary-text text-sm sm:text-base leading-tight animate-pulse" data-testid="join-loading-message">Waiting for a response...</p>
                    </div>
                </PageContainer>
            </MobileLayout>
        );
    }

    if (error !== null) {
        return (
            <MobileLayout>
                <PageContainer
                    title={title}
                    footer={error.showRetry ? (
                        <Button fullWidth data-testid="join-retry-button" onClick={() => { window.location.reload(); }}>
                            Retry
                        </Button>
                    ) : undefined}
                >
                    <div className="flex flex-col items-center justify-center min-h-48 sm:min-h-64 space-y-4 px-4 text-center">
                        <ErrorMessage testId="join-error-message">{error.message}</ErrorMessage>
                    </div>
                </PageContainer>
            </MobileLayout>
        );
    }

    if (!invite) {
        return (
            <MobileLayout>
                <PageContainer title={title}>
                    <div className="flex flex-col items-center justify-center min-h-48 sm:min-h-64 space-y-4 px-4 text-center">
                        <ErrorMessage testId="join-missing-invite-error">Invite data is missing</ErrorMessage>
                    </div>
                </PageContainer>
            </MobileLayout>
        );
    }

    const isInviteRedeemed = 'accepted_at' in invite && invite.accepted_at !== null;

    const handleAcceptInvite = async () => {
        setIsAcceptingInvite(true);
        try {
            const success = await acceptInvite(invite.nano_id);
            if (success) {
                // Refresh local auth state to get updated custom attributes (clubs/seasons)
                await refreshActiveSeasons();
                void navigate('/');
            }
        } finally {
            setIsAcceptingInvite(false);
        }
    };

    const getAcceptButtonText = (): string => {
        if (isAcceptingInvite) return 'Accepting invite...';
        if (acceptInviteStatus === 'waiting_to_retry') return 'Retrying...';
        return 'Accept Invite';
    };

    return (
        <MobileLayout>
            <PageContainer
                title={title}
                footer={
                    isAuthenticated ? (
                        isAcceptInviteFlow ? (
                            <Button
                                fullWidth
                                data-testid="join-accept-invite-button"
                                disabled={isInviteRedeemed || isAcceptingInvite || acceptInviteStatus === 'waiting_to_retry'}
                                onClick={() => {
                                    void handleAcceptInvite();
                                }}
                            >
                                {getAcceptButtonText()}
                            </Button>
                        ) : (
                            <div className="w-full">
                                <ErrorMessage testId="join-email-mismatch-error">
                                    This invite is for {invite.invitee_email_id}. It is not for you: {email}.
                                </ErrorMessage>
                            </div>
                        )
                    ) : (
                        <div className="flex flex-col space-y-3 w-full">
                            {invite.invitee_already_registered ? (
                                <Button
                                    fullWidth
                                    data-testid="join-login-button"
                                    disabled={isInviteRedeemed}
                                    onClick={() => {
                                        if (isInviteRedeemed) {
                                            return;
                                        }
                                        void navigate(`/login?returnUrl=${encodeURIComponent(`/join/${effectiveInviteId}`)}&email=${encodeURIComponent(invite.invitee_email_id)}`);
                                    }}
                                >
                                    Login & Accept
                                </Button>
                            ) : (
                                <Button
                                    fullWidth
                                    data-testid="join-register-button"
                                    disabled={isInviteRedeemed}
                                    onClick={() => {
                                        if (isInviteRedeemed) {
                                            return;
                                        }
                                        void navigate('/register', { state: { invite } });
                                    }}
                                >
                                    Register
                                </Button>
                            )}
                        </div>
                    )
                }
            >
                <div className="flex flex-col space-y-3 sm:space-y-4 text-left px-2 max-w-sm mx-auto pb-8" data-testid="join-invite-details">
                    <div className="mt-2 sm:mt-3"></div>
                    <div className="border-b border-gray-600 pb-2 mb-2" data-testid="join-invite-from">
                        <p className="text-secondary-text text-sm sm:text-base uppercase tracking-wide">Invite from</p>
                        <p className="text-xl sm:text-2xl">{invite.invited_by}</p>
                    </div>

                    <div data-testid="join-invite-to">
                        <p className="text-secondary-text text-sm sm:text-base uppercase tracking-wide">To {displayRole(invite.invitee_role)}</p>
                        <p className="text-xl sm:text-2xl font-bold">{invite.invitee_name}</p>
                    </div>

                    {!isInviteRedeemed && (
                        <div className="border-b border-gray-600 pb-2 mb-2" data-testid="join-invite-email">
                            <p className="text-secondary-text text-sm sm:text-base uppercase tracking-wide">Email Id</p>
                            <p className="text-base sm:text-lg">{invite.invitee_email_id}</p>
                        </div>
                    )}

                    {invite.invitee_role === 'CLUB_MANAGER' ? (
                        <div data-testid="join-invite-club">
                            <p className="text-secondary-text text-sm sm:text-base uppercase tracking-wide">Club</p>
                            <p className="text-base sm:text-lg">{invite.invitee_club}, {invite.club_location}</p>
                        </div>
                    ) : (
                        <div data-testid="join-invite-team">
                            <p className="text-secondary-text text-sm sm:text-base uppercase tracking-wide">Team</p>
                            <p className="text-base sm:text-lg">{invite.invitee_team}, {invite.team_division}</p>
                        </div>
                    )}

                    <div className="pt-4 mt-2 border-t border-gray-600" data-testid="join-invite-league-season">
                        <p className="text-secondary-text text-sm sm:text-base uppercase tracking-wide">League/Season</p>
                        <p className="text-base sm:text-lg">{invite.league} {invite.season}</p>
                    </div>

                    {isInviteRedeemed && (
                        <div className="pt-4">
                            <ErrorMessage testId="join-invite-redeemed-error">Invite already redeemed</ErrorMessage>
                        </div>
                    )}

                    {acceptInviteError && (
                        <div className="pt-4 mb-4">
                            <ErrorMessage testId="join-accept-invite-error">{acceptInviteError}</ErrorMessage>
                        </div>
                    )}
                </div>
            </PageContainer>
        </MobileLayout>
    );
};
