import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { FormField } from '../components/common/FormField';
import { ErrorMessage } from '../components/common/ErrorMessage';

const AUTH_INIT_FAILED_PREFIX = 'AuthProvider.initAuth() has failed.';

export interface LoginNavigationState {
  errorFromPreviousPage?: string;
}

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { signIn, authError, clearAuthError } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const emailParam = searchParams.get('email');
  const isPasswordJustReset = searchParams.get('reset') === 'success';
  const location = useLocation();
  const [errorFromPreviousPage, setErrorFromPreviousPage] = useState<string | null>(
    () => (location.state as LoginNavigationState | null)?.errorFromPreviousPage ?? null
  );
  const shownError = localError ?? authError ?? errorFromPreviousPage;

  // authError is shared: an error left by another page's auth call (e.g. Register) must not show here;
  // a page that wants Login to show its error passes it in the navigation state instead.
  useEffect(() => {
    clearAuthError();
  }, [clearAuthError]);

  useEffect(() => {
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [emailParam]);

  const getReturnUrl = (): string => {
    const returnUrl = searchParams.get('returnUrl');
    if (returnUrl) {
      try {
        return decodeURIComponent(returnUrl);
      } catch {
        return '/';
      }
    }
    return '/';
  };

  const getForgotPasswordUrl = (): string => {
    const params: string[] = [];
    if (emailParam) {
      params.push(`email=${encodeURIComponent(emailParam)}`);
    } else if (email) {
      params.push(`prefillEmail=${encodeURIComponent(email)}`);
    }
    const returnUrl = searchParams.get('returnUrl');
    if (returnUrl) {
      params.push(`returnUrl=${encodeURIComponent(returnUrl)}`);
    }
    return params.length > 0 ? `/forgot-password?${params.join('&')}` : '/forgot-password';
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setIsLoading(true);
    setLocalError(null);
    setErrorFromPreviousPage(null);
    clearAuthError();

    try {
      const { seasons, clubs } = await signIn(email, password);
      const returnUrl = getReturnUrl();

      if (returnUrl === '/kudos' && seasons.length === 0 && clubs.length > 0) {
        void navigate('/promote-my-club');
      } else {
        void navigate(returnUrl);
      }
    } catch (error: unknown) {
      const message = (typeof error === 'object' && error !== null && 'message' in error)
        ? (error as { message?: unknown }).message
        : undefined;
      if (typeof message === 'string' && message.startsWith(AUTH_INIT_FAILED_PREFIX)) {
        setLocalError('Unexpected authentication initialisation error: reload the page and try again.');
        return;
      }

      const errorType = (error as Record<string, unknown>).__type
        ?? (error as Record<string, unknown>).code
        ?? (error as Record<string, unknown>).name;

      if (errorType === 'UserNotConfirmedException') {
        const returnUrl = getReturnUrl();
        const returnUrlParam = returnUrl !== '/' ? `&returnUrl=${encodeURIComponent(returnUrl)}` : '';
        void navigate(`/register?email=${encodeURIComponent(email)}&verify=true${returnUrlParam}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <MobileLayout>
      <PageContainer
        title="Log In"
        formProps={{ onSubmit: (e) => { void handleSubmit(e); } }}
        footer={
          <Button fullWidth type="submit" disabled={isLoading} data-testid="login-submit-button">
            {isLoading ? 'Signing in...' : 'Sign In'}
          </Button>
        }
      >
        <div className="space-y-4 sm:space-y-6 px-4">
          <FormField htmlFor="email" label="Email">
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); }}
              required
              locked={!!emailParam}
              placeholder="Enter your email"
            />
          </FormField>

          <FormField htmlFor="password" label="Password">
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); }}
              required
              placeholder="Enter your password"
              showPasswordToggle
            />
            <Link
              data-testid="login-forgot-password-link"
              to={getForgotPasswordUrl()}
              className="text-action-accent hover:underline text-sm sm:text-base"
            >
              Forgot your password?
            </Link>
          </FormField>

          {isPasswordJustReset && !shownError && (
            <p className="text-secondary-text text-sm sm:text-base leading-tight" data-testid="login-success-message">
              Your password has been reset. Log in with your new password.
            </p>
          )}

          {shownError && (
            <ErrorMessage testId="login-error-message">
              {shownError}
            </ErrorMessage>
          )}
        </div>
      </PageContainer>
    </MobileLayout>
  );
};
