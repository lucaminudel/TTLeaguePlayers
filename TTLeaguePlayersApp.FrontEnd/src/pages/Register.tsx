import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { Button } from '../components/common/Button';

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
  const [searchParams] = useSearchParams();

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
    }
  }, [searchParams]);

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

  const handleRegister = async () => {
    setLocalError(null);

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
      await signUp(email, password);
      setShowVerification(true);
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

  const handleVerify = async () => {
    setLocalError(null);
    setIsLoading(true);

    try {
      await confirmSignUp(email, verificationCode);
      void navigate('/login');
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
            <Button fullWidth type="submit" disabled={isLoading}>
              {isLoading ? 'Verifying...' : 'Verify'}
            </Button>
          }
        >
          <div className="space-y-6 px-4">
            <p className="text-secondary-text">
              We've sent a verification code to {email}. Please enter it below.
            </p>

            <div>
              <label htmlFor="verificationCode" className="block text-sm font-medium mb-2">
                Verification Code
              </label>
              <input
                id="verificationCode"
                type="text"
                value={verificationCode}
                onChange={(e) => { setVerificationCode(e.target.value); }}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                placeholder="Enter verification code"
              />
            </div>

            {localError && (
              <div className="error-message">
                {localError}
              </div>
            )}
            
              <button
                type="button"
                onClick={() => { void handleResendCode(); }}
                disabled={isLoading}
                className="text-action-accent hover:underline disabled:opacity-50"
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
            void handleRegister();
          }
        }}
        footer={
          <Button fullWidth type="submit" disabled={isLoading || password !== confirmPassword}>
            {isLoading ? 'Creating account...' : 'Register'}
          </Button>
        }
      >
        <div className="space-y-6 px-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); }}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
              placeholder="Enter your email"
            />
            {email && !isValidEmail(email) && (
              <p className="text-action-accent text-sm mt-1">Please enter a valid email address</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); }}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
              placeholder="Enter your password"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); }}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
              placeholder="Confirm your password"
            />
            {password && (password !== confirmPassword) && (
              <p className="text-action-accent text-sm mt-1">Passwords do not match</p>
            )}
          </div>

          {localError && (
            <div className="error-message">
              {localError}
            </div>
          )}
        </div>
      </PageContainer>
    </MobileLayout>
  );
};
