import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { FormField } from '../components/common/FormField';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { FieldError } from '../components/common/FieldError';
import { isValidEmail } from '../utils/emailUtils';
import { USER_INIT_ERROR_MESSAGE, isAuthInitFailure, getUserFriendlyCognitoError } from '../utils/cognitoErrorUtils';

type ForgotPasswordStep = 'request' | 'confirm';

const toUserMessage = (error: unknown): string =>
  isAuthInitFailure(error) ? USER_INIT_ERROR_MESSAGE : getUserFriendlyCognitoError(error);

export const ForgotPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const lockedEmail = searchParams.get('email');
  const returnUrl = searchParams.get('returnUrl');

  const [step, setStep] = useState<ForgotPasswordStep>('request');
  const [email, setEmail] = useState(lockedEmail ?? searchParams.get('prefillEmail') ?? '');
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const { forgotPassword, confirmForgotPassword } = useAuth();
  const navigate = useNavigate();

  const passwordsMismatch = !!newPassword && newPassword !== confirmNewPassword;
  const returnUrlParam = returnUrl ? `&returnUrl=${encodeURIComponent(returnUrl)}` : '';
  const encodedEmail = encodeURIComponent(email);

  const handleRequestCode = async () => {
    setLocalError(null);
    setInfoMessage(null);

    if (!isValidEmail(email)) {
      setLocalError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    try {
      await forgotPassword(email);
      setStep('confirm');
    } catch (error: unknown) {
      setLocalError(toUserMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setLocalError(null);
    setInfoMessage(null);

    if (newPassword !== confirmNewPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await confirmForgotPassword(email, verificationCode.trim(), newPassword);
      void navigate(`/login?email=${encodedEmail}&reset=success${returnUrlParam}`);
    } catch (error: unknown) {
      setLocalError(toUserMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setLocalError(null);
    setInfoMessage(null);
    setIsLoading(true);
    try {
      await forgotPassword(email);
      setInfoMessage(`If an account exists for ${email}, a new code has been sent.`);
    } catch (error: unknown) {
      setLocalError(toUserMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const errorBox = localError && (
    <ErrorMessage testId="forgot-password-error-message">
      {localError}
    </ErrorMessage>
  );

  if (step === 'confirm') {
    return (
      <MobileLayout>
        <PageContainer
          title="Reset Password"
          formProps={{
            onSubmit: (e) => {
              e.preventDefault();
              void handleResetPassword();
            }
          }}
          footer={
            <Button fullWidth type="submit" disabled={isLoading || passwordsMismatch} data-testid="forgot-password-reset-button">
              {isLoading ? 'Resetting...' : 'Reset Password'}
            </Button>
          }
        >
          <div className="space-y-3 sm:space-y-4 px-4">
            <p className="text-secondary-text text-sm sm:text-base leading-tight" data-testid="forgot-password-code-sent-message">
              If an account exists for {email}, we've sent a verification code. Enter it with your new password.
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

            <FormField htmlFor="newPassword" label="New Password">
              <Input
                id="newPassword"
                name="newPassword"
                autoComplete="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); }}
                required
                placeholder="Enter your new password"
                showPasswordToggle
              />
            </FormField>

            <FormField htmlFor="confirmNewPassword" label="Confirm New Password">
              <Input
                id="confirmNewPassword"
                name="confirmNewPassword"
                autoComplete="new-password"
                type="password"
                value={confirmNewPassword}
                onChange={(e) => { setConfirmNewPassword(e.target.value); }}
                required
                placeholder="Confirm your new password"
                showPasswordToggle
              />
              {passwordsMismatch && (
                <FieldError testId="forgot-password-confirm-password-field-error">Passwords do not match</FieldError>
              )}
            </FormField>

            {errorBox}

            {infoMessage && (
              <p className="text-secondary-text text-sm sm:text-base leading-tight" data-testid="forgot-password-info-message">
                {infoMessage}
              </p>
            )}

            <button
              type="button"
              data-testid="forgot-password-resend-code-button"
              onClick={() => { void handleResendCode(); }}
              disabled={isLoading}
              className="text-action-accent hover:underline disabled:opacity-50 text-sm sm:text-base"
            >
              &lt; Resend Code &gt;
            </button>

            <p className="text-secondary-text text-sm sm:text-base leading-tight" data-testid="forgot-password-unverified-hint">
              No code in your inbox or spam folder?
              <br />
              If you never completed your registration verification,{' '}
              <Link
                data-testid="forgot-password-verify-email-link"
                to={`/register?email=${encodedEmail}&verify=true${returnUrlParam}`}
                className="text-action-accent hover:underline"
              >
                verify your email first
              </Link>.
            </p>

            <p className="text-secondary-text text-sm sm:text-base leading-tight" data-testid="forgot-password-contact-us-hint">
              Still having problems?{' '}
              <Link
                data-testid="forgot-password-contact-us-link"
                to="/about-and-contact-us"
                className="text-action-accent hover:underline"
              >
                Contact us
              </Link>.
            </p>
          </div>
        </PageContainer>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <PageContainer
        title="Forgot Password"
        formProps={{
          onSubmit: (e) => {
            e.preventDefault();
            void handleRequestCode();
          }
        }}
        footer={
          <Button fullWidth type="submit" disabled={isLoading} data-testid="forgot-password-send-code-button">
            {isLoading ? 'Sending...' : 'Send Code'}
          </Button>
        }
      >
        <div className="space-y-3 sm:space-y-4 px-4">
          <p className="text-secondary-text text-sm sm:text-base leading-tight">
            Enter your account email and we'll send you a verification code.
          </p>

          <FormField htmlFor="email" label="Email">
            <Input
              id="email"
              name="email"
              autoComplete="email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); }}
              required
              locked={!!lockedEmail}
              placeholder="Enter your email"
            />
          </FormField>

          {errorBox}
        </div>
      </PageContainer>
    </MobileLayout>
  );
};
