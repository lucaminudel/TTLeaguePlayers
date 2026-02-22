import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { FormField } from '../components/common/FormField';
import { ErrorMessage } from '../components/common/ErrorMessage';

const AUTH_INIT_FAILED_PREFIX = 'AuthProvider.initAuth() has failed.';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { signIn, authError, clearAuthError } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setIsLoading(true);
    setLocalError(null);
    clearAuthError();

    try {
      await signIn(email, password);
      const returnUrl = getReturnUrl();
      void navigate(returnUrl);
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
          </FormField>

          {(localError ?? authError) && (
            <ErrorMessage testId="login-error-message">
              {localError ?? authError}
            </ErrorMessage>
          )}
        </div>
      </PageContainer>
    </MobileLayout>
  );
};
