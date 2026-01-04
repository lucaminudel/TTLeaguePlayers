import { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { AuthProvider } from '../../../src/contexts/AuthContext';
import { useAuth } from '../../../src/hooks/useAuth';

interface MockedEnvironment {
  getConfig: ReturnType<typeof vi.fn>;
}

// Mock getConfig from environment
vi.mock('../../../src/config/environment', (): MockedEnvironment => ({
  getConfig: vi.fn()
}));

import { getConfig } from '../../../src/config/environment';

type GetConfigMock = ReturnType<typeof vi.fn>;

function Harness(props: { onContext: (ctx: ReturnType<typeof useAuth>) => void }) {
  const ctx = useAuth();

  useEffect(() => {
    props.onContext(ctx);
  }, [ctx, props]);

  return null;
}

function requireContext(ctx: ReturnType<typeof useAuth> | null): ReturnType<typeof useAuth> {
  expect(ctx).not.toBeNull();
  if (!ctx) {
    throw new Error('Expected context to be set');
  }
  return ctx;
}

describe('AuthProvider initAuth() (build-time config) error handling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('sets authInitialisationError when getConfig throws and auth methods throw enriched init failed error', async () => {
    (getConfig as unknown as GetConfigMock).mockImplementationOnce(() => {
      throw new Error('boom');
    });

    let latestCtx: ReturnType<typeof useAuth> | null = null;

    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestCtx = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestCtx?.authInitialisationError).toContain('Error: boom');
    });

    const ctx = requireContext(latestCtx);

    await expect(ctx.signIn('a@b.com', 'pw')).rejects.toThrowError(
      /AuthProvider\.initAuth\(\) has failed\./
    );

    await expect(ctx.signIn('a@b.com', 'pw')).rejects.toThrowError(
      /authInitialisationError:/
    );
  });

  it('sets authInitialisationError when Cognito section is missing', async () => {
    (getConfig as unknown as GetConfigMock).mockReturnValueOnce({
      Cognito: undefined
    } as unknown);

    let latestCtx: ReturnType<typeof useAuth> | null = null;

    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestCtx = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestCtx?.authInitialisationError).toBe('Cognito config and/or ClientId info section is missing.');
    });

    const ctx = requireContext(latestCtx);

    await expect(ctx.signUp('a@b.com', 'pw')).rejects.toThrowError(
      "AuthProvider.initAuth() has failed. authInitialisationError: Cognito config and/or ClientId info section is missing."
    );
  });

  it('sets authInitialisationError when Cognito ClientId is missing', async () => {
    (getConfig as unknown as GetConfigMock).mockReturnValueOnce({
      Cognito: { UserPoolId: 'pool', ClientId: '' }
    } as unknown);

    let latestCtx: ReturnType<typeof useAuth> | null = null;

    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestCtx = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestCtx?.authInitialisationError).toBe('Cognito config and/or ClientId info section is missing.');
    });

    const ctx = requireContext(latestCtx);

    await expect(ctx.confirmSignUp('a@b.com', '1234')).rejects.toThrowError(
      "AuthProvider.initAuth() has failed. authInitialisationError: Cognito config and/or ClientId info section is missing."
    );
  });
});
