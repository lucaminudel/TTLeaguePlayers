import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { FormField } from '../components/common/FormField';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { FieldError } from '../components/common/FieldError';
import { useAcceptInvite } from '../hooks/useAcceptInvite';
import type { Invite } from '../types/invite';

const AUTH_INIT_FAILED_PREFIX = 'AuthProvider.initAuth() has failed.';
const USER_INIT_ERROR_MESSAGE = 'Unexpected authentication initialisation error: reload the page and try again.';

export const Register: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { signUp, confirmSignUp, resendConfirmationCode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const inviteState = location.state as { invite?: Invite } | null;
  const invite = inviteState?.invite;
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const isAuthInitFailure = (error: unknown): boolean => {
    const message = (typeof error === 'object' && error !== null && 'message' in error)
      ? (error as { message?: unknown }).message
      : undefined;

    return typeof message === 'string' && message.startsWith(AUTH_INIT_FAILED_PREFIX);
  };

  const isValidEmail = (emailToValidate: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToValidate);
  };

  useEffect(() => {
    const emailParam = searchParams.get('email');
    const verifyParam = searchParams.get('verify');

    if (emailParam && verifyParam === 'true') {
      setEmail(emailParam);
      setShowVerification(true);
    } else if (invite?.invitee_email_id) {
      setEmail(invite.invitee_email_id);
    }
  }, [searchParams, invite]);

  useEffect(() => {
    if (invite && passwordInputRef.current) {
      passwordInputRef.current.focus();
    }
  }, [invite]);

  const displayRole = (role?: string) => {
    if (!role) return '';
    if (role === 'CAPTAIN') return 'Team Captain';
    if (role === 'PLAYER') return 'Player';
    if (role === 'CLUB_MANAGER') return 'Club Manager';
    return role;
  };

  const getUserFriendlyError = (error: unknown): string => {
    const errorRecord = error as Record<string, unknown>;
    const errorType = errorRecord.__type ?? errorRecord.code ?? errorRecord.name;
    const message = (errorRecord.message as string) || '';

    switch (errorType) {
      case 'InvalidPasswordException':
        return 'Password must be at least 12 characters with uppercase, lowercase, number, and symbol.';
      case 'UsernameExistsException':
        return 'An account with this email already exists. Try logging in instead.';
      case 'InvalidParameterException':
        if (message.includes('email')) {
          return 'Please enter a valid email address.';
        }
        return 'Invalid input. Please check your information.';
      case 'CodeMismatchException':
        return 'The verification code is incorrect. Please try again.';
      case 'ExpiredCodeException':
        return 'The verification code has expired. Please request a new one.';
      case 'TooManyRequestsException':
      case 'LimitExceededException':
        return 'Too many attempts. Please wait an hour before trying again. Additional attempts will extend the wait time.';
      default:
        return (errorRecord.message as string) || 'An unexpected error occurred. Please try again.';
    }
  };

  const [userAlreadyExists, setUserAlreadyExists] = useState(false);
  const { status: acceptInviteStatus, error: acceptInviteError, acceptInvite } = useAcceptInvite();



  const handleRegister = async () => {
    setLocalError(null);
    setUserAlreadyExists(false);

    if (!isValidEmail(email)) {
      setLocalError('Please enter a valid email address.');
      return;
    }

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      // Step 1: Register User
      await signUp(email, password);
      setUserAlreadyExists(false);

      // Step 2: Accept Invite (if exists)
      if (invite) {
        const accepted = await acceptInvite(invite.nano_id);
        if (accepted) {
          setShowVerification(true);
        }
        // If not accepted, acceptInviteStatus is 'failed' and acceptInviteError is set. 
        // User stays on page with error and "Complete Email Verification" button.
      } else {
        setShowVerification(true);
      }

    } catch (error: unknown) {
      if (isAuthInitFailure(error)) {
        setLocalError(USER_INIT_ERROR_MESSAGE);
        return;
      }

      const errorRecord = error as Record<string, unknown>;
      const errorType = errorRecord.__type ?? errorRecord.code ?? errorRecord.name;

      // Scenario 2: User Already Exists
      if (errorType === 'UsernameExistsException' && invite) {
        setUserAlreadyExists(true);
        const accepted = await acceptInvite(invite.nano_id);
        if (accepted) {
          void navigate('/login');
        }
        // If failed, same as above: stay on page with error.
      } else {
        setLocalError(getUserFriendlyError(error));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    setLocalError(null);
    setIsLoading(true);

    try {
      await confirmSignUp(email, verificationCode);
      const returnUrl = searchParams.get('returnUrl');
      const returnUrlParam = returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : '';
      void navigate(`/login${returnUrlParam}`);
    } catch (error: unknown) {
      if (isAuthInitFailure(error)) {
        setLocalError(USER_INIT_ERROR_MESSAGE);
        return;
      }
      setLocalError(getUserFriendlyError(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setLocalError(null);
    setIsLoading(true);

    try {
      await resendConfirmationCode(email);
      setLocalError('New verification code sent to your email.');
    } catch (error: unknown) {
      if (isAuthInitFailure(error)) {
        setLocalError(USER_INIT_ERROR_MESSAGE);
        return;
      }
      setLocalError(getUserFriendlyError(error));
    } finally {
      setIsLoading(false);
    }
  };

  if (showVerification) {
    return (
      <MobileLayout>
        <PageContainer
          title="Verify Email"
          formProps={{
            onSubmit: (e) => {
              e.preventDefault();
              void handleVerify();
            }
          }}
          footer={
            <Button fullWidth type="submit" disabled={isLoading} data-testid="register-verify-button">
              {isLoading ? 'Verifying...' : 'Verify'}
            </Button>
          }
        >
          <div className="space-y-3 sm:space-y-4 px-4">
            <p className="text-secondary-text text-sm sm:text-base leading-tight" data-testid="register-verify-success-message">
              We've sent a verification code to {email}. Please enter it below.
            </p>

            <FormField htmlFor="verificationCode" label="Verification Code">
              <Input
                id="verificationCode"
                type="text"
                value={verificationCode}
                onChange={(e) => { setVerificationCode(e.target.value); }}
                required
                placeholder="Enter verification code"
              />
            </FormField>

            {localError && (
              <ErrorMessage testId="register-verify-error-message">
                {localError}
              </ErrorMessage>
            )}

            <button
              type="button"
              data-testid="register-resend-code-button"
              onClick={() => { void handleResendCode(); }}
              disabled={isLoading}
              className="text-action-accent hover:underline disabled:opacity-50 text-sm sm:text-base"
            >
              &lt; Resend Code &gt;
            </button>
          </div>
        </PageContainer>
      </MobileLayout>
    );
  }



  return (
    <MobileLayout>
      <PageContainer
        title="Register"
        formProps={{
          onSubmit: (e) => {
            e.preventDefault();
            if (acceptInviteStatus === 'failed') {
              setLocalError(null);
              setShowVerification(true);
            } else {
              void handleRegister();
            }
          }
        }}
        footer={
          (acceptInviteStatus === 'failed' && userAlreadyExists) ? undefined : (
            <Button
              fullWidth
              type="submit"
              disabled={isLoading || (password !== confirmPassword && acceptInviteStatus !== 'failed')}
              data-testid="register-submit-button"
            >
              {isLoading
                ? 'Creating account...'
                : acceptInviteStatus === 'failed'
                  ? 'Continue to Email Verification'
                  : 'Register'}
            </Button>
          )
        }
      >
        <div className="space-y-3 sm:space-y-4 px-4">
          {invite && (
            <div className="mb-3 sm:mb-4" data-testid="register-invite-details">
              <p className="text-base">{invite.invitee_name}, {displayRole(invite.invitee_role)}</p>
              <p className="text-base">
                {invite.league} {invite.season}, {invite.invitee_role === 'CLUB_MANAGER' ? `${invite.invitee_club} - ${invite.club_location}` : `${invite.invitee_team} - ${invite.team_division}`}
              </p>
            </div>
          )}



          <FormField htmlFor="email" label="Email">
            <Input
              id="email"
              name="email"
              autoComplete="email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); }}
              required
              disabled={!!invite || acceptInviteStatus === 'failed' || acceptInviteStatus === 'waiting_to_retry'}
              className={invite || acceptInviteStatus === 'failed' || acceptInviteStatus === 'waiting_to_retry'
                ? '!bg-gray-400 !text-gray-800 cursor-not-allowed !opacity-100'
                : ''}
              style={invite || acceptInviteStatus === 'failed' || acceptInviteStatus === 'waiting_to_retry' ? { backgroundColor: '#9ca3af !important', color: '#1f2937', opacity: 1 } : undefined}
              placeholder="Enter your email"
            />
            {email && !isValidEmail(email) && (
              <FieldError testId="register-email-field-error">Please enter a valid email address</FieldError>
            )}
          </FormField>

          <FormField htmlFor="password" label="Password">
            <Input
              id="password"
              name="password"
              autoComplete="new-password"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); }}
              required
              ref={passwordInputRef}
              disabled={acceptInviteStatus === 'failed' || acceptInviteStatus === 'waiting_to_retry'}
              placeholder="Enter your password"
              showPasswordToggle
            />
          </FormField>

          <FormField htmlFor="confirmPassword" label="Confirm Password">
            <Input
              id="confirmPassword"
              name="confirmPassword"
              autoComplete="new-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); }}
              required
              disabled={acceptInviteStatus === 'failed' || acceptInviteStatus === 'waiting_to_retry'}
              placeholder="Confirm your password"
              showPasswordToggle
            />
            {password && (password !== confirmPassword) && (
              <FieldError testId="register-confirm-password-field-error">Passwords do not match</FieldError>
            )}
          </FormField>

          {(acceptInviteStatus === 'waiting_to_retry' || acceptInviteStatus === 'accepting') && (
            <div className="flex flex-col justify-center items-center space-y-4 py-2 sm:py-4">
              <div className="spinner"></div>
              <p className="text-secondary-text text-sm sm:text-base leading-tight animate-pulse">Waiting to confirm the invite ...</p>
            </div>
          )}

          {(localError ?? acceptInviteError) && (
            <ErrorMessage testId="register-error-message">
              {localError ?? acceptInviteError}
            </ErrorMessage>
          )}
        </div>
      </PageContainer>
    </MobileLayout>
  );
};
