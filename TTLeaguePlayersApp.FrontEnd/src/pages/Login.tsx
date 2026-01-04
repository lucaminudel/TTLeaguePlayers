import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { Button } from '../components/common/Button';

const AUTH_INIT_FAILED_PREFIX = 'AuthProvider.initAuth() has failed.';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { signIn, authError, clearAuthError } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setIsLoading(true);
    setLocalError(null);
    clearAuthError();

    try {
      await signIn(email, password);
      void navigate('/');
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
        void navigate(`/register?email=${encodeURIComponent(email)}&verify=true`);
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
          <Button fullWidth type="submit" disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign In'}
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

          {(localError ?? authError) && (
            <div className="error-message">
              {localError ?? authError}
            </div>
          )}
        </div>
      </PageContainer>
    </MobileLayout>
  );
};
