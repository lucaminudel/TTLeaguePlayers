import { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
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

function InitialAuthStateProbe() {
  const context = useAuth();
  return (
    <output
      data-is-loading={String(context.isLoading)}
      data-is-authenticated={String(context.isAuthenticated)}
      data-username={String(context.username)}
      data-email={String(context.email)}
      data-user-id={String(context.userId)}
      data-active-seasons={String(context.activeSeasons.length)}
      data-managed-clubs={String(context.managedClubs.length)}
      data-attributes-load-failed={String(context.userAttributesLoadFailed)}
    />
  );
}

describe('AuthProvider initAuth() (build-time config) error handling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('starts in a resolved, empty auth state when configuration is invalid', () => {
    (getConfig as unknown as GetConfigMock).mockImplementationOnce(() => {
      throw new Error('boom');
    });

    const markup = renderToStaticMarkup(
      <AuthProvider>
        <InitialAuthStateProbe />
      </AuthProvider>
    );

    expect(markup).toContain('data-is-loading="false"');
    expect(markup).toContain('data-is-authenticated="false"');
    expect(markup).toContain('data-username="null"');
    expect(markup).toContain('data-email="null"');
    expect(markup).toContain('data-user-id="null"');
    expect(markup).toContain('data-active-seasons="0"');
    expect(markup).toContain('data-managed-clubs="0"');
    expect(markup).toContain('data-attributes-load-failed="false"');
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

    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(latestCtx?.authInitialisationError).toContain('Error: boom');
      expect(latestCtx?.isLoading).toBe(false);
    });

    const ctx = requireContext(latestCtx);

    await expect(ctx.signIn('a@b.com', 'pw')).rejects.toThrow(
      /AuthProvider\.initAuth\(\) has failed\./
    );

    await expect(ctx.signIn('a@b.com', 'pw')).rejects.toThrow(
      /authInitialisationError:/
    );
  });

  it('preserves the error type in the initialization failure message', async () => {
    (getConfig as unknown as GetConfigMock).mockImplementationOnce(() => {
      throw new TypeError('invalid configuration');
    });

    let latestCtx: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestCtx = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestCtx?.authInitialisationError).toBe('TypeError: invalid configuration');
    });
  });

  it('uses safe error-name and message fallbacks for empty Error fields', async () => {
    (getConfig as unknown as GetConfigMock).mockImplementationOnce(() => {
      const error = new Error('');
      error.name = '';
      throw error;
    });

    let latestCtx: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestCtx = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestCtx?.authInitialisationError).toBe('Error: ');
      expect(latestCtx?.isLoading).toBe(false);
    });
  });

  it('uses the generic initialization failure message for non-Error values', async () => {
    (getConfig as unknown as GetConfigMock).mockImplementationOnce(() => {
      const thrownValue = new Error('not an Error instance');
      Object.setPrototypeOf(thrownValue, null);
      throw thrownValue;
    });

    let latestCtx: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestCtx = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestCtx?.authInitialisationError).toBe('Unknown error (unserialisable)');
    });
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

    await expect(ctx.signUp('a@b.com', 'pw')).rejects.toThrow(
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

    await expect(ctx.confirmSignUp('a@b.com', '1234')).rejects.toThrow(
      "AuthProvider.initAuth() has failed. authInitialisationError: Cognito config and/or ClientId info section is missing."
    );
  });

  it('rejects the password-reset methods with the init failed error when Cognito ClientId is missing', async () => {
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
    const expectedInitFailedError = "AuthProvider.initAuth() has failed. authInitialisationError: Cognito config and/or ClientId info section is missing.";

    await expect(ctx.forgotPassword('a@b.com')).rejects.toThrow(expectedInitFailedError);
    await expect(ctx.confirmForgotPassword('a@b.com', '123456', 'aA1!56789012')).rejects.toThrow(expectedInitFailedError);
  });
});
