import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { AuthProvider } from '../../../src/contexts/AuthContext';
import { useAuth } from '../../../src/hooks/useAuth';

interface MockSession {
  isValid: () => boolean;
  getIdToken: () => { getJwtToken: () => string };
}

interface MockAttribute {
  getName: () => string;
  getValue: () => string;
}

interface MockAuthenticationCallbacks {
  onSuccess: (session: MockSession) => void;
  onFailure: (error: Error) => void;
  newPasswordRequired: () => void;
}

const mocks = vi.hoisted(() => {
  const currentUser = {
    getSession: vi.fn<(callback: (error: unknown, session: MockSession | null) => void) => void>(),
    getUserAttributes: vi.fn<(callback: (error: Error | null, attributes: MockAttribute[] | null) => void) => void>(),
    authenticateUser: vi.fn<(details: unknown, callbacks: MockAuthenticationCallbacks) => void>(),
    confirmRegistration: vi.fn<(code: string, forceAliasCreation: boolean, callback: (error: Error | null) => void) => void>(),
    resendConfirmationCode: vi.fn<(callback: (error?: Error | null) => void) => void>(),
    forgotPassword: vi.fn<(callbacks: { onSuccess: () => void; onFailure: (error: Error) => void }) => void>(),
    confirmPassword: vi.fn<(code: string, password: string, callbacks: { onSuccess: () => void; onFailure: (error: Error) => void }) => void>(),
    signOut: vi.fn()
  };
  const userPool = {
    getCurrentUser: vi.fn(),
    signUp: vi.fn<(username: string, password: string, attributes: unknown[], validationData: unknown[], callback: (error?: Error) => void) => void>()
  };

  return {
    currentUser,
    userPool,
    authenticationDetails: vi.fn(),
    cognitoUserPool: vi.fn(),
    cognitoUser: vi.fn(),
    cognitoUserAttribute: vi.fn<(attribute: { Name: string; Value: string }) => { Name: string; Value: string }>(),
    setAuthTokenProvider: vi.fn<(provider: () => Promise<string | null>) => void>()
  };
});

const activeSeason = {
  league: 'CLTTL',
  season: '2025-2026',
  team_name: 'Eagles',
  team_division: 'Division 1',
  person_name: 'Player',
  role: 'PLAYER',
  latest_kudos: []
};
const managedClub = {
  league: 'CLTTL',
  season: '2025-2026',
  club_name: 'Eagles TTC',
  club_location: 'London',
  manager_name: 'Player'
};
const tokenFromClaims = (claims: unknown): string => `header.${btoa(JSON.stringify(claims))}.signature`;
const roleAttributes = [{
  getName: () => 'email',
  getValue: () => 'player@example.com'
}, {
  getName: () => 'sub',
  getValue: () => 'user-id'
}, {
  getName: () => 'custom:active_seasons',
  getValue: () => JSON.stringify([activeSeason])
}, {
  getName: () => 'custom:managed_clubs',
  getValue: () => JSON.stringify([managedClub])
}];

vi.mock('amazon-cognito-identity-js', () => ({
  CognitoUserPool: mocks.cognitoUserPool,
  CognitoUser: mocks.cognitoUser,
  AuthenticationDetails: mocks.authenticationDetails,
  CognitoUserAttribute: mocks.cognitoUserAttribute
}));

vi.mock('../../../src/api/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../src/api/api')>(),
  setAuthTokenProvider: mocks.setAuthTokenProvider
}));

vi.mock('../../../src/config/environment', () => ({
  getConfig: vi.fn()
}));

import { getConfig } from '../../../src/config/environment';

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

describe('AuthProvider role refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cognitoUserPool.mockImplementation(function () {
      return mocks.userPool;
    });
    mocks.cognitoUser.mockImplementation(function () {
      return mocks.currentUser;
    });
    mocks.userPool.getCurrentUser.mockReturnValue(mocks.currentUser);
    mocks.currentUser.getSession.mockImplementation((callback) => {
      callback(null, {
        isValid: () => true,
        getIdToken: () => ({
          getJwtToken: () => `header.${btoa(JSON.stringify({
            preferred_username: 'player',
            email: 'player@example.com',
            sub: 'user-id'
          }))}.signature`
        })
      });
    });

    vi.mocked(getConfig).mockReturnValue({
      Cognito: { UserPoolId: 'pool-id', ClientId: 'client-id' }
    } as ReturnType<typeof getConfig>);
  });

  it('clears stale role data when a successful attribute refresh returns no roles', async () => {
    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      callback(null, roleAttributes);
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestContext?.activeSeasons).toHaveLength(1);
      expect(latestContext?.managedClubs).toHaveLength(1);
    });

    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      callback(null, []);
    });
    await act(async () => {
      await requireContext(latestContext).refreshActiveSeasons();
    });

    await waitFor(() => {
      expect(latestContext?.activeSeasons).toEqual([]);
      expect(latestContext?.managedClubs).toEqual([]);
      expect(latestContext?.userAttributesLoadFailed).toBe(false);
      expect(latestContext?.isPlayerOrCaptain).toBe(false);
      expect(latestContext?.isClubManager).toBe(false);
    });
  });

  it('does not request role data while the provider is unauthenticated', async () => {
    mocks.userPool.getCurrentUser.mockReturnValue(null);

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestContext?.isLoading).toBe(false);
    });

    mocks.userPool.getCurrentUser.mockClear();
    await act(async () => {
      await requireContext(latestContext).refreshActiveSeasons();
    });

    expect(requireContext(latestContext).isAuthenticated).toBe(false);
    expect(mocks.userPool.getCurrentUser).not.toHaveBeenCalled();
    expect(mocks.currentUser.getSession).not.toHaveBeenCalled();
  });

  it('does not request a session when Cognito no longer has a current user', async () => {
    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      callback(null, roleAttributes);
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestContext?.activeSeasons).toEqual([activeSeason]);
      expect(latestContext?.managedClubs).toEqual([managedClub]);
    });

    const sessionRequestCount = mocks.currentUser.getSession.mock.calls.length;
    mocks.userPool.getCurrentUser.mockReturnValue(null);
    await act(async () => {
      await requireContext(latestContext).refreshActiveSeasons();
    });

    expect(requireContext(latestContext).isAuthenticated).toBe(true);
    expect(requireContext(latestContext).activeSeasons).toEqual([activeSeason]);
    expect(requireContext(latestContext).managedClubs).toEqual([managedClub]);
    expect(mocks.currentUser.getSession).toHaveBeenCalledTimes(sessionRequestCount);
  });

  it('ignores a session-refresh callback that arrives after sign-out', async () => {
    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      callback(null, roleAttributes);
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestContext?.activeSeasons).toEqual([activeSeason]);
      expect(latestContext?.managedClubs).toEqual([managedClub]);
    });

    let finishSessionRefresh: ((error: unknown, session: MockSession | null) => void) | null = null;
    mocks.currentUser.getSession.mockImplementationOnce((callback) => {
      finishSessionRefresh = callback;
    });
    const sessionRequestCount = mocks.currentUser.getSession.mock.calls.length;
    const attributeRequestCount = mocks.currentUser.getUserAttributes.mock.calls.length;
    const refresh = requireContext(latestContext).refreshActiveSeasons();
    await waitFor(() => {
      expect(finishSessionRefresh).not.toBeNull();
    });

    act(() => {
      requireContext(latestContext).signOut();
    });
    act(() => {
      finishSessionRefresh?.(null, {
        isValid: () => true,
        getIdToken: () => ({ getJwtToken: () => tokenFromClaims({ sub: 'user-id' }) })
      });
    });
    await act(async () => {
      await refresh;
    });

    expect(requireContext(latestContext).isAuthenticated).toBe(false);
    expect(requireContext(latestContext).activeSeasons).toEqual([]);
    expect(requireContext(latestContext).managedClubs).toEqual([]);
    expect(mocks.currentUser.getSession).toHaveBeenCalledTimes(sessionRequestCount + 1);
    expect(mocks.currentUser.getUserAttributes).toHaveBeenCalledTimes(attributeRequestCount);
  });

  it('preserves role data when the attribute refresh fails', async () => {
    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      callback(null, roleAttributes);
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestContext?.activeSeasons).toHaveLength(1);
      expect(latestContext?.managedClubs).toHaveLength(1);
    });

    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      callback(new Error('Temporary Cognito failure'), null);
    });
    await act(async () => {
      await requireContext(latestContext).refreshActiveSeasons();
    });

    expect(requireContext(latestContext).activeSeasons).toEqual([activeSeason]);
    expect(requireContext(latestContext).managedClubs).toEqual([managedClub]);
    expect(requireContext(latestContext).userAttributesLoadFailed).toBe(true);

    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      callback(null, roleAttributes);
    });
    await act(async () => {
      await requireContext(latestContext).refreshActiveSeasons();
    });

    expect(requireContext(latestContext).userAttributesLoadFailed).toBe(false);

    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      queueMicrotask(() => {
        callback(null, null);
      });
    });
    await act(async () => {
      await requireContext(latestContext).refreshActiveSeasons();
    });

    expect(requireContext(latestContext).activeSeasons).toEqual([activeSeason]);
    expect(requireContext(latestContext).managedClubs).toEqual([managedClub]);
    expect(requireContext(latestContext).userAttributesLoadFailed).toBe(true);
  });

  it('preserves authenticated role data when a refresh finds an invalid session', async () => {
    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      callback(null, roleAttributes);
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestContext?.isAuthenticated).toBe(true);
      expect(latestContext?.activeSeasons).toEqual([activeSeason]);
      expect(latestContext?.managedClubs).toEqual([managedClub]);
    });

    const initialAttributeRequestCount = mocks.currentUser.getUserAttributes.mock.calls.length;
    mocks.currentUser.getSession.mockImplementationOnce((callback) => {
      callback(null, {
        isValid: () => false,
        getIdToken: () => ({ getJwtToken: () => '' })
      });
    });

    await act(async () => {
      await requireContext(latestContext).refreshActiveSeasons();
    });

    const context = requireContext(latestContext);
    expect(context.isAuthenticated).toBe(true);
    expect(context.activeSeasons).toEqual([activeSeason]);
    expect(context.managedClubs).toEqual([managedClub]);
    expect(context.userAttributesLoadFailed).toBe(false);
    expect(mocks.currentUser.getUserAttributes).toHaveBeenCalledTimes(initialAttributeRequestCount);
  });

  it('preserves authenticated role data when a refresh returns no session without an error', async () => {
    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      callback(null, roleAttributes);
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestContext?.isAuthenticated).toBe(true);
      expect(latestContext?.activeSeasons).toEqual([activeSeason]);
      expect(latestContext?.managedClubs).toEqual([managedClub]);
    });

    const initialAttributeRequestCount = mocks.currentUser.getUserAttributes.mock.calls.length;
    mocks.currentUser.getSession.mockImplementationOnce((callback) => {
      callback(null, null);
    });

    await act(async () => {
      await requireContext(latestContext).refreshActiveSeasons();
    });

    const context = requireContext(latestContext);
    expect(context.isAuthenticated).toBe(true);
    expect(context.activeSeasons).toEqual([activeSeason]);
    expect(context.managedClubs).toEqual([managedClub]);
    expect(context.userAttributesLoadFailed).toBe(false);
    expect(mocks.currentUser.getUserAttributes).toHaveBeenCalledTimes(initialAttributeRequestCount);
  });

  it('uses the supported unprefixed role attribute names during refresh', async () => {
    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      callback(null, roleAttributes);
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestContext?.isAuthenticated).toBe(true);
    });

    const aliasAttributes = [{
      getName: () => 'active_seasons',
      getValue: () => JSON.stringify([{ ...activeSeason, team_name: 'Falcons' }])
    }, {
      getName: () => 'managed_clubs',
      getValue: () => JSON.stringify([{ ...managedClub, club_name: 'Falcons TTC' }])
    }];
    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      callback(null, aliasAttributes);
    });

    await act(async () => {
      await requireContext(latestContext).refreshActiveSeasons();
    });

    expect(requireContext(latestContext).activeSeasons[0]?.team_name).toBe('Falcons');
    expect(requireContext(latestContext).managedClubs[0]?.club_name).toBe('Falcons TTC');
  });

  it('exposes an attribute-load failure when Cognito throws synchronously during refresh', async () => {
    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      callback(null, roleAttributes);
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestContext?.activeSeasons).toEqual([activeSeason]);
    });

    const refreshError = new Error('Cognito attribute request could not start');
    mocks.currentUser.getUserAttributes.mockImplementation(() => {
      throw refreshError;
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await act(async () => {
      await requireContext(latestContext).refreshActiveSeasons();
    });

    expect(requireContext(latestContext).activeSeasons).toEqual([activeSeason]);
    expect(requireContext(latestContext).managedClubs).toEqual([managedClub]);
    expect(requireContext(latestContext).userAttributesLoadFailed).toBe(true);
    expect(consoleError).toHaveBeenCalledWith('Failed to refresh seasons:', refreshError);
    consoleError.mockRestore();
  });
});

describe('AuthProvider session bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cognitoUserPool.mockImplementation(function () {
      return mocks.userPool;
    });
    mocks.cognitoUser.mockImplementation(function () {
      return mocks.currentUser;
    });
    mocks.userPool.getCurrentUser.mockReturnValue(mocks.currentUser);
    mocks.currentUser.getSession.mockImplementation((callback) => {
      callback(null, {
        isValid: () => true,
        getIdToken: () => ({
          getJwtToken: () => `header.${btoa(JSON.stringify({
            preferred_username: 'player',
            email: 'player@example.com',
            sub: 'user-id'
          }))}.signature`
        })
      });
    });
    vi.mocked(getConfig).mockReturnValue({
      Cognito: { UserPoolId: 'pool-id', ClientId: 'client-id' }
    } as ReturnType<typeof getConfig>);
  });

  it('finishes loading without authenticating when session retrieval fails', async () => {
    mocks.currentUser.getSession.mockImplementation((callback) => {
      callback(new Error('No cached Cognito session'), null);
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestContext?.isLoading).toBe(false);
    });

    const context = requireContext(latestContext);
    expect(context.isAuthenticated).toBe(false);
    expect(context.username).toBeNull();
    expect(context.email).toBeNull();
    expect(context.userId).toBeNull();
    expect(context.activeSeasons).toEqual([]);
    expect(context.managedClubs).toEqual([]);
    expect(context.userAttributesLoadFailed).toBe(false);
    expect(context.authError).toBeNull();
    expect(mocks.currentUser.getUserAttributes).not.toHaveBeenCalled();
  });

  it('finishes loading without authenticating when the cached session is invalid', async () => {
    mocks.currentUser.getSession.mockImplementation((callback) => {
      callback(null, {
        isValid: () => false,
        getIdToken: () => ({ getJwtToken: () => '' })
      });
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestContext?.isLoading).toBe(false);
    });

    const context = requireContext(latestContext);
    expect(context.isAuthenticated).toBe(false);
    expect(context.username).toBeNull();
    expect(context.email).toBeNull();
    expect(context.userId).toBeNull();
    expect(context.activeSeasons).toEqual([]);
    expect(context.managedClubs).toEqual([]);
    expect(context.userAttributesLoadFailed).toBe(false);
    expect(context.authError).toBeNull();
    expect(mocks.currentUser.getUserAttributes).not.toHaveBeenCalled();
  });

  it('keeps loading until the initial Cognito session lookup completes', async () => {
    let finishSession: ((error: unknown, session: MockSession | null) => void) | null = null;
    mocks.currentUser.getSession.mockImplementation((callback) => {
      finishSession = callback;
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(finishSession).not.toBeNull();
    });

    expect(requireContext(latestContext).isLoading).toBe(true);

    act(() => {
      finishSession?.(new Error('No cached Cognito session'), null);
    });
    await waitFor(() => {
      expect(requireContext(latestContext).isLoading).toBe(false);
    });
  });

  it('keeps a valid session authenticated and exposes an attribute-load failure', async () => {
    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      callback(new Error('Temporary Cognito failure'), null);
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestContext?.isLoading).toBe(false);
      expect(latestContext?.userAttributesLoadFailed).toBe(true);
    });

    const context = requireContext(latestContext);
    expect(context.isAuthenticated).toBe(true);
    expect(context.username).toBe('player');
    expect(context.email).toBe('player@example.com');
    expect(context.userId).toBe('user-id');
    expect(context.activeSeasons).toEqual([]);
    expect(context.managedClubs).toEqual([]);
  });

  it('exposes an attribute-load failure when Cognito returns no attributes without an error', async () => {
    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      queueMicrotask(() => {
        callback(null, null);
      });
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestContext?.userAttributesLoadFailed).toBe(true);
    });

    expect(requireContext(latestContext).isAuthenticated).toBe(true);
  });

  it('loads the supported unprefixed role attributes during bootstrap', async () => {
    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      callback(null, [{
        getName: () => 'active_seasons',
        getValue: () => JSON.stringify([activeSeason])
      }, {
        getName: () => 'managed_clubs',
        getValue: () => JSON.stringify([managedClub])
      }]);
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestContext?.isAuthenticated).toBe(true);
      expect(latestContext?.activeSeasons).toEqual([activeSeason]);
      expect(latestContext?.managedClubs).toEqual([managedClub]);
    });
  });

  it('does not request attributes when session bootstrap finishes after unmount', async () => {
    let finishSession: ((error: unknown, session: MockSession | null) => void) | null = null;
    mocks.currentUser.getSession.mockImplementation((callback) => {
      finishSession = callback;
    });

    const { unmount } = render(
      <AuthProvider>
        <Harness onContext={() => undefined} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(finishSession).not.toBeNull();
    });

    unmount();
    act(() => {
      finishSession?.(null, {
        isValid: () => true,
        getIdToken: () => ({ getJwtToken: () => tokenFromClaims({ sub: 'user-id' }) })
      });
    });

    expect(mocks.currentUser.getUserAttributes).not.toHaveBeenCalled();
  });

  it('does not restore bootstrap state when session lookup finishes after sign-out', async () => {
    let finishSession: ((error: unknown, session: MockSession | null) => void) | null = null;
    mocks.currentUser.getSession.mockImplementation((callback) => {
      finishSession = callback;
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(finishSession).not.toBeNull();
    });

    act(() => {
      requireContext(latestContext).signOut();
    });
    act(() => {
      finishSession?.(null, {
        isValid: () => true,
        getIdToken: () => ({ getJwtToken: () => tokenFromClaims({ sub: 'user-id' }) })
      });
    });

    expect(requireContext(latestContext).isAuthenticated).toBe(false);
    expect(requireContext(latestContext).username).toBeNull();
    expect(mocks.currentUser.getUserAttributes).not.toHaveBeenCalled();
  });

  it('does not restore bootstrap state when attribute loading finishes after sign-out', async () => {
    let finishAttributes: ((error: Error | null, attributes: MockAttribute[] | null) => void) | null = null;
    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      finishAttributes = callback;
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(finishAttributes).not.toBeNull();
    });

    act(() => {
      requireContext(latestContext).signOut();
    });
    act(() => {
      finishAttributes?.(null, roleAttributes);
    });

    const context = requireContext(latestContext);
    expect(context.isAuthenticated).toBe(false);
    expect(context.username).toBeNull();
    expect(context.email).toBeNull();
    expect(context.userId).toBeNull();
    expect(context.activeSeasons).toEqual([]);
    expect(context.managedClubs).toEqual([]);
    expect(context.userAttributesLoadFailed).toBe(false);
  });

  it('authenticates a valid bootstrap session without warning when optional role attributes are absent', async () => {
    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      callback(null, []);
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestContext?.isAuthenticated).toBe(true);
      expect(latestContext?.isLoading).toBe(false);
    });

    const context = requireContext(latestContext);
    expect(context.activeSeasons).toEqual([]);
    expect(context.managedClubs).toEqual([]);
    expect(context.userAttributesLoadFailed).toBe(false);
  });

  it('clears the attribute-load failure when bootstrap successfully loads attributes', async () => {
    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      callback(null, roleAttributes);
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestContext?.activeSeasons).toEqual([activeSeason]);
      expect(latestContext?.managedClubs).toEqual([managedClub]);
    });

    expect(requireContext(latestContext).userAttributesLoadFailed).toBe(false);
  });
});

describe('AuthProvider sign-out', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.signOut.mockReset();
    mocks.cognitoUserPool.mockImplementation(function () {
      return mocks.userPool;
    });
    mocks.cognitoUser.mockImplementation(function () {
      return mocks.currentUser;
    });
    mocks.userPool.getCurrentUser.mockReturnValue(mocks.currentUser);
    mocks.currentUser.getSession.mockImplementation((callback) => {
      callback(null, {
        isValid: () => true,
        getIdToken: () => ({
          getJwtToken: () => `header.${btoa(JSON.stringify({
            preferred_username: 'player',
            email: 'player@example.com',
            sub: 'user-id'
          }))}.signature`
        })
      });
    });
    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      callback(null, roleAttributes);
    });
    vi.mocked(getConfig).mockReturnValue({
      Cognito: { UserPoolId: 'pool-id', ClientId: 'client-id' }
    } as ReturnType<typeof getConfig>);
  });

  it('clears Cognito and local auth state on sign-out', async () => {
    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestContext?.isAuthenticated).toBe(true);
      expect(latestContext?.activeSeasons).toEqual([activeSeason]);
      expect(latestContext?.managedClubs).toEqual([managedClub]);
    });

    act(() => {
      requireContext(latestContext).signOut();
    });

    const context = requireContext(latestContext);
    expect(mocks.currentUser.signOut).toHaveBeenCalledOnce();
    expect(context.isAuthenticated).toBe(false);
    expect(context.username).toBeNull();
    expect(context.email).toBeNull();
    expect(context.userId).toBeNull();
    expect(context.activeSeasons).toEqual([]);
    expect(context.managedClubs).toEqual([]);
    expect(context.userAttributesLoadFailed).toBe(false);
    expect(context.authError).toBeNull();
    expect(context.isLoading).toBe(false);
  });

  it('clears local auth state when Cognito has no current user', async () => {
    mocks.userPool.getCurrentUser.mockReturnValue(null);

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isLoading).toBe(false);
    });

    act(() => {
      requireContext(latestContext).signOut();
    });

    expect(mocks.currentUser.signOut).not.toHaveBeenCalled();
    expect(requireContext(latestContext).isAuthenticated).toBe(false);
    expect(requireContext(latestContext).activeSeasons).toEqual([]);
  });

  it('clears local state without throwing when Cognito could not be initialized', async () => {
    vi.mocked(getConfig).mockImplementationOnce(() => {
      throw new Error('Cognito configuration unavailable');
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isLoading).toBe(false);
    });

    act(() => {
      expect(() => {
        requireContext(latestContext).signOut();
      }).not.toThrow();
    });
    expect(requireContext(latestContext).isAuthenticated).toBe(false);
    expect(requireContext(latestContext).username).toBeNull();
    expect(requireContext(latestContext).activeSeasons).toEqual([]);
    expect(requireContext(latestContext).managedClubs).toEqual([]);
  });

  it('clears local auth state even if Cognito cache cleanup throws', async () => {
    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestContext?.isAuthenticated).toBe(true);
      expect(latestContext?.activeSeasons).toEqual([activeSeason]);
    });

    const cleanupError = new Error('Cognito storage cleanup failed');
    mocks.currentUser.signOut.mockImplementation(() => {
      throw cleanupError;
    });

    let thrownError: unknown;
    act(() => {
      try {
        requireContext(latestContext).signOut();
      } catch (error) {
        thrownError = error;
      }
    });
    expect(thrownError).toBe(cleanupError);

    const context = requireContext(latestContext);
    expect(context.isAuthenticated).toBe(false);
    expect(context.username).toBeNull();
    expect(context.activeSeasons).toEqual([]);
    expect(context.managedClubs).toEqual([]);
  });

  it('does not restore role data when an attribute refresh finishes after sign-out', async () => {
    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(latestContext?.isAuthenticated).toBe(true);
      expect(latestContext?.activeSeasons).toEqual([activeSeason]);
    });

    let finishAttributeRequest: ((error: Error | null, attributes: MockAttribute[] | null) => void) | null = null;
    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      finishAttributeRequest = callback;
    });

    const refresh = requireContext(latestContext).refreshActiveSeasons();
    expect(finishAttributeRequest).not.toBeNull();

    act(() => {
      requireContext(latestContext).signOut();
    });
    act(() => {
      finishAttributeRequest?.(null, roleAttributes);
    });
    await refresh;

    expect(requireContext(latestContext).isAuthenticated).toBe(false);
    expect(requireContext(latestContext).activeSeasons).toEqual([]);
    expect(requireContext(latestContext).managedClubs).toEqual([]);
  });
});

describe('AuthProvider ID-token retrieval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.signOut.mockReset();
    mocks.cognitoUserPool.mockImplementation(function () {
      return mocks.userPool;
    });
    mocks.cognitoUser.mockImplementation(function () {
      return mocks.currentUser;
    });
    mocks.userPool.getCurrentUser.mockReturnValue(mocks.currentUser);
    mocks.currentUser.getSession.mockImplementation((callback) => {
      callback(null, {
        isValid: () => true,
        getIdToken: () => ({
          getJwtToken: () => `header.${btoa(JSON.stringify({
            preferred_username: 'player',
            email: 'player@example.com',
            sub: 'user-id'
          }))}.signature`
        })
      });
    });
    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      callback(null, roleAttributes);
    });
    vi.mocked(getConfig).mockReturnValue({
      Cognito: { UserPoolId: 'pool-id', ClientId: 'client-id' }
    } as ReturnType<typeof getConfig>);
  });

  it('registers the current token provider after authentication state changes', async () => {
    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isAuthenticated).toBe(true);
      expect(mocks.setAuthTokenProvider).toHaveBeenCalled();
    });

    const registeredProvider = mocks.setAuthTokenProvider.mock.lastCall?.[0];
    expect(registeredProvider).toBeDefined();
    await expect(registeredProvider?.()).resolves.toBe(
      `header.${btoa(JSON.stringify({
        preferred_username: 'player',
        email: 'player@example.com',
        sub: 'user-id'
      }))}.signature`
    );
  });

  it('returns the ID token from the current valid session', async () => {
    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isAuthenticated).toBe(true);
    });

    await expect(requireContext(latestContext).getIdToken())
      .resolves.toBe(`header.${btoa(JSON.stringify({
        preferred_username: 'player',
        email: 'player@example.com',
        sub: 'user-id'
      }))}.signature`);
    expect(mocks.currentUser.getSession).toHaveBeenCalledTimes(2);
  });

  it('returns null on session-refresh failure without clearing authenticated profile state', async () => {
    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isAuthenticated).toBe(true);
      expect(latestContext?.activeSeasons).toEqual([activeSeason]);
    });

    mocks.currentUser.getSession.mockImplementationOnce((callback) => {
      callback(new Error('Cognito refresh failed'), null);
    });
    await expect(requireContext(latestContext).getIdToken()).resolves.toBeNull();

    const context = requireContext(latestContext);
    expect(context.isAuthenticated).toBe(true);
    expect(context.activeSeasons).toEqual([activeSeason]);
    expect(context.managedClubs).toEqual([managedClub]);
  });

  it.each([
    ['a missing session', null],
    ['an invalid session', {
      isValid: () => false,
      getIdToken: () => ({ getJwtToken: () => 'expired-token' })
    }]
  ])('returns null for %s without throwing', async (_description, session) => {
    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isAuthenticated).toBe(true);
    });

    mocks.currentUser.getSession.mockImplementationOnce((callback) => {
      callback(null, session);
    });
    await expect(requireContext(latestContext).getIdToken()).resolves.toBeNull();
    expect(requireContext(latestContext).isAuthenticated).toBe(true);
  });

  it('returns null if the Cognito user disappeared from the pool', async () => {
    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isAuthenticated).toBe(true);
    });

    mocks.userPool.getCurrentUser.mockReturnValue(null);
    await expect(requireContext(latestContext).getIdToken()).resolves.toBeNull();
  });

  it('does not retrieve a token when the provider is unauthenticated', async () => {
    let latestContext: ReturnType<typeof useAuth> | null = null;
    mocks.currentUser.getSession.mockImplementationOnce((callback) => {
      callback(null, {
        isValid: () => false,
        getIdToken: () => ({ getJwtToken: () => 'expired-token' })
      });
    });
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isLoading).toBe(false);
    });
    expect(requireContext(latestContext).isAuthenticated).toBe(false);

    await expect(requireContext(latestContext).getIdToken()).resolves.toBeNull();
    expect(mocks.currentUser.getSession).toHaveBeenCalledTimes(1);
  });

  it('does not return a token when session refresh completes after sign-out', async () => {
    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isAuthenticated).toBe(true);
    });

    let finishSessionRefresh: ((error: Error | null, session: MockSession | null) => void) | null = null;
    mocks.currentUser.getSession.mockImplementationOnce((callback) => {
      finishSessionRefresh = callback;
    });
    const tokenRequest = requireContext(latestContext).getIdToken();
    expect(finishSessionRefresh).not.toBeNull();

    act(() => {
      requireContext(latestContext).signOut();
    });
    act(() => {
      finishSessionRefresh?.(null, {
        isValid: () => true,
        getIdToken: () => ({ getJwtToken: () => 'late-token' })
      });
    });
    await expect(tokenRequest).resolves.toBeNull();
  });
});

describe('AuthProvider registration and password methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cognitoUserPool.mockImplementation(function () {
      return mocks.userPool;
    });
    mocks.cognitoUser.mockImplementation(function () {
      return mocks.currentUser;
    });
    mocks.cognitoUserAttribute.mockImplementation(function (attribute) {
      return attribute;
    });
    mocks.userPool.getCurrentUser.mockReturnValue(null);
    vi.mocked(getConfig).mockReturnValue({
      Cognito: { UserPoolId: 'pool-id', ClientId: 'client-id' }
    } as ReturnType<typeof getConfig>);
  });

  const renderAuth = () => {
    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    return () => requireContext(latestContext);
  };

  it('passes the email attribute to Cognito and resolves successful registration', async () => {
    mocks.userPool.signUp.mockImplementation((_username, _password, _attributes, _validationData, callback) => {
      callback();
    });
    const getContext = renderAuth();
    await waitFor(() => {
      expect(getContext().isLoading).toBe(false);
    });

    await act(async () => {
      await expect(getContext().signUp('player@example.com', 'password'))
        .resolves.toBeUndefined();
    });

    expect(mocks.cognitoUserAttribute).toHaveBeenCalledWith({
      Name: 'email',
      Value: 'player@example.com'
    });
    expect(mocks.userPool.signUp).toHaveBeenCalledWith(
      'player@example.com',
      'password',
      [{ Name: 'email', Value: 'player@example.com' }],
      [],
      expect.any(Function)
    );
  });

  it('rejects failed registration and exposes its error', async () => {
    const registrationError = new Error('Registration failed');
    mocks.userPool.signUp.mockImplementation((_username, _password, _attributes, _validationData, callback) => {
      callback(registrationError);
    });
    const getContext = renderAuth();
    await waitFor(() => {
      expect(getContext().isLoading).toBe(false);
    });

    await act(async () => {
      await expect(getContext().signUp('player@example.com', 'password'))
        .rejects.toBe(registrationError);
    });

    expect(getContext().authError).toBe('Registration failed');
  });

  it('uses fallback messages when registration callbacks return errors without messages', async () => {
    const getContext = renderAuth();
    await waitFor(() => {
      expect(getContext().isLoading).toBe(false);
    });

    mocks.userPool.signUp.mockImplementation((_username, _password, _attributes, _validationData, callback) => {
      callback(new Error(''));
    });
    await act(async () => {
      await expect(getContext().signUp('player@example.com', 'password')).rejects.toThrow();
    });
    expect(getContext().authError).toBe('Registration failed');

    mocks.currentUser.confirmRegistration.mockImplementation((_code, _forceAliasCreation, callback) => {
      callback(new Error(''));
    });
    await act(async () => {
      await expect(getContext().confirmSignUp('player@example.com', '123456')).rejects.toThrow();
    });
    expect(getContext().authError).toBe('Verification failed');

    mocks.currentUser.resendConfirmationCode.mockImplementation((callback) => {
      callback(new Error(''));
    });
    await act(async () => {
      await expect(getContext().resendConfirmationCode('player@example.com')).rejects.toThrow();
    });
    expect(getContext().authError).toBe('Failed to resend code');
  });

  it('confirms registration with force-alias creation and exposes Cognito errors', async () => {
    const verificationError = new Error('Invalid verification code');
    mocks.currentUser.confirmRegistration.mockImplementation((_code, forceAliasCreation, callback) => {
      expect(forceAliasCreation).toBe(true);
      callback(null);
    });
    const getContext = renderAuth();
    await waitFor(() => {
      expect(getContext().isLoading).toBe(false);
    });

    await act(async () => {
      await expect(getContext().confirmSignUp('player@example.com', '123456'))
        .resolves.toBeUndefined();
    });
    expect(getContext().authError).toBeNull();

    mocks.currentUser.confirmRegistration.mockImplementation((_code, forceAliasCreation, callback) => {
      expect(forceAliasCreation).toBe(true);
      callback(verificationError);
    });
    await act(async () => {
      await expect(getContext().confirmSignUp('player@example.com', '123456'))
        .rejects.toBe(verificationError);
    });

    expect(mocks.cognitoUser).toHaveBeenCalledWith({
      Username: 'player@example.com',
      Pool: mocks.userPool
    });
    expect(mocks.currentUser.confirmRegistration).toHaveBeenCalledWith(
      '123456',
      true,
      expect.any(Function)
    );
    expect(getContext().authError).toBe('Invalid verification code');
  });

  it('resends a confirmation code and records a Cognito failure', async () => {
    const resendError = new Error('Code resend failed');
    mocks.currentUser.resendConfirmationCode.mockImplementation((callback) => {
      callback();
    });
    const getContext = renderAuth();
    await waitFor(() => {
      expect(getContext().isLoading).toBe(false);
    });

    await act(async () => {
      await expect(getContext().resendConfirmationCode('player@example.com'))
        .resolves.toBeUndefined();
    });
    expect(mocks.cognitoUser).toHaveBeenCalledWith({
      Username: 'player@example.com',
      Pool: mocks.userPool
    });
    expect(getContext().authError).toBeNull();

    mocks.currentUser.resendConfirmationCode.mockImplementation((callback) => {
      callback(resendError);
    });
    await act(async () => {
      await expect(getContext().resendConfirmationCode('player@example.com'))
        .rejects.toBe(resendError);
    });

    expect(mocks.currentUser.resendConfirmationCode).toHaveBeenCalledTimes(2);
    expect(getContext().authError).toBe('Code resend failed');
  });

  it('handles password-reset request success and failure', async () => {
    const getContext = renderAuth();
    await waitFor(() => {
      expect(getContext().isLoading).toBe(false);
    });

    mocks.currentUser.forgotPassword.mockImplementation((callbacks) => {
      callbacks.onSuccess();
    });
    await act(async () => {
      await expect(getContext().forgotPassword('player@example.com'))
        .resolves.toBeUndefined();
    });
    expect(mocks.cognitoUser).toHaveBeenCalledWith({
      Username: 'player@example.com',
      Pool: mocks.userPool
    });
    expect(mocks.currentUser.forgotPassword).toHaveBeenCalledOnce();

    const requestError = new Error('Password reset request failed');
    mocks.currentUser.forgotPassword.mockImplementation((callbacks) => {
      callbacks.onFailure(requestError);
    });
    await act(async () => {
      await expect(getContext().forgotPassword('player@example.com'))
        .rejects.toBe(requestError);
    });
  });

  it('handles password-reset confirmation success and failure', async () => {
    const getContext = renderAuth();
    await waitFor(() => {
      expect(getContext().isLoading).toBe(false);
    });

    mocks.currentUser.confirmPassword.mockImplementation((_code, _password, callbacks) => {
      callbacks.onSuccess();
    });
    await act(async () => {
      await expect(getContext().confirmForgotPassword('player@example.com', '123456', 'NewPassword1!'))
        .resolves.toBeUndefined();
    });
    expect(mocks.cognitoUser).toHaveBeenCalledWith({
      Username: 'player@example.com',
      Pool: mocks.userPool
    });
    expect(mocks.currentUser.confirmPassword).toHaveBeenCalledWith(
      '123456',
      'NewPassword1!',
      expect.any(Object)
    );

    const confirmationError = new Error('Password reset confirmation failed');
    mocks.currentUser.confirmPassword.mockImplementation((_code, _password, callbacks) => {
      callbacks.onFailure(confirmationError);
    });
    await act(async () => {
      await expect(getContext().confirmForgotPassword('player@example.com', '123456', 'NewPassword1!'))
        .rejects.toBe(confirmationError);
    });
  });
});

describe('AuthProvider sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cognitoUserPool.mockImplementation(function () {
      return mocks.userPool;
    });
    mocks.cognitoUser.mockImplementation(function () {
      return mocks.currentUser;
    });
    mocks.userPool.getCurrentUser.mockReturnValue(mocks.currentUser);
    mocks.currentUser.getSession.mockImplementation((callback) => {
      callback(new Error('No cached Cognito session'), null);
    });
    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      callback(null, []);
    });
    vi.mocked(getConfig).mockReturnValue({
      Cognito: { UserPoolId: 'pool-id', ClientId: 'client-id' }
    } as ReturnType<typeof getConfig>);
  });

  it('sets authenticated identity and roles after successful credentials and attribute retrieval', async () => {
    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      callback(null, roleAttributes);
    });
    mocks.currentUser.authenticateUser.mockImplementation((_details, callbacks) => {
      callbacks.onSuccess({
        isValid: () => true,
        getIdToken: () => ({
          getJwtToken: () => `header.${btoa(JSON.stringify({
            preferred_username: 'player',
            email: 'player@example.com',
            sub: 'user-id'
          }))}.signature`
        })
      });
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isLoading).toBe(false);
    });

    await act(async () => {
      await expect(requireContext(latestContext).signIn('player@example.com', 'password'))
        .resolves.toEqual({ seasons: [activeSeason], clubs: [managedClub] });
    });

    expect(mocks.cognitoUserPool).toHaveBeenCalledWith({
      UserPoolId: 'pool-id',
      ClientId: 'client-id'
    });
    expect(mocks.authenticationDetails).toHaveBeenCalledWith({
      Username: 'player@example.com',
      Password: 'password'
    });
    expect(mocks.cognitoUser).toHaveBeenCalledWith({
      Username: 'player@example.com',
      Pool: mocks.userPool
    });

    await waitFor(() => {
      const context = requireContext(latestContext);
      expect(context.isAuthenticated).toBe(true);
      expect(context.username).toBe('player');
      expect(context.email).toBe('player@example.com');
      expect(context.userId).toBe('user-id');
      expect(context.activeSeasons).toEqual([activeSeason]);
      expect(context.managedClubs).toEqual([managedClub]);
      expect(context.isPlayerOrCaptain).toBe(true);
      expect(context.isClubManager).toBe(true);
      expect(context.authError).toBeNull();
    });
  });

  it('authenticates successfully when Cognito returns no optional role attributes', async () => {
    mocks.currentUser.authenticateUser.mockImplementation((_details, callbacks) => {
      callbacks.onSuccess({
        isValid: () => true,
        getIdToken: () => ({
          getJwtToken: () => `header.${btoa(JSON.stringify({
            preferred_username: 'player',
            email: 'player@example.com',
            sub: 'user-id'
          }))}.signature`
        })
      });
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isLoading).toBe(false);
    });

    await act(async () => {
      await expect(requireContext(latestContext).signIn('player@example.com', 'password'))
        .resolves.toEqual({ seasons: [], clubs: [] });
    });

    const context = requireContext(latestContext);
    expect(context.isAuthenticated).toBe(true);
    expect(context.email).toBe('player@example.com');
    expect(context.activeSeasons).toEqual([]);
    expect(context.managedClubs).toEqual([]);
  });

  it('uses supported unprefixed role attribute names after sign-in', async () => {
    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      callback(null, [{
        getName: () => 'active_seasons',
        getValue: () => JSON.stringify([activeSeason])
      }, {
        getName: () => 'managed_clubs',
        getValue: () => JSON.stringify([managedClub])
      }]);
    });
    mocks.currentUser.authenticateUser.mockImplementation((_details, callbacks) => {
      callbacks.onSuccess({
        isValid: () => true,
        getIdToken: () => ({
          getJwtToken: () => `header.${btoa(JSON.stringify({
            preferred_username: 'player',
            email: 'player@example.com',
            sub: 'user-id'
          }))}.signature`
        })
      });
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isLoading).toBe(false);
    });

    await act(async () => {
      await requireContext(latestContext).signIn('player@example.com', 'password');
    });

    expect(requireContext(latestContext).activeSeasons).toEqual([activeSeason]);
    expect(requireContext(latestContext).managedClubs).toEqual([managedClub]);
  });

  it.each([
    ['a null payload', null],
    ['an array payload', []],
    ['a primitive payload', 42]
  ])('uses safe identity fallbacks for %s', async (_description, claims) => {
    mocks.currentUser.authenticateUser.mockImplementation((_details, callbacks) => {
      callbacks.onSuccess({
        isValid: () => true,
        getIdToken: () => ({ getJwtToken: () => tokenFromClaims(claims) })
      });
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isLoading).toBe(false);
    });

    await act(async () => {
      await requireContext(latestContext).signIn('player@example.com', 'password');
    });

    expect(requireContext(latestContext).username).toBe('user');
    expect(requireContext(latestContext).email).toBeNull();
    expect(requireContext(latestContext).userId).toBeNull();
  });

  it('uses email and subject claims as username fallbacks in order', async () => {
    const claimsWithEmail = { email: 'player@example.com', sub: 'user-id' };
    mocks.currentUser.authenticateUser.mockImplementation((_details, callbacks) => {
      callbacks.onSuccess({
        isValid: () => true,
        getIdToken: () => ({ getJwtToken: () => tokenFromClaims(claimsWithEmail) })
      });
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isLoading).toBe(false);
    });

    await act(async () => {
      await requireContext(latestContext).signIn('player@example.com', 'password');
    });

    expect(requireContext(latestContext).username).toBe('player@example.com');
    expect(requireContext(latestContext).email).toBe('player@example.com');
    expect(requireContext(latestContext).userId).toBe('user-id');
  });

  it('uses the subject as username when earlier identity claims are absent', async () => {
    mocks.currentUser.authenticateUser.mockImplementation((_details, callbacks) => {
      callbacks.onSuccess({
        isValid: () => true,
        getIdToken: () => ({ getJwtToken: () => tokenFromClaims({ sub: 'user-id' }) })
      });
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isLoading).toBe(false);
    });

    await act(async () => {
      await requireContext(latestContext).signIn('player@example.com', 'password');
    });

    expect(requireContext(latestContext).username).toBe('user-id');
  });

  it('uses safe identity fallbacks for an empty ID token', async () => {
    mocks.currentUser.authenticateUser.mockImplementation((_details, callbacks) => {
      callbacks.onSuccess({
        isValid: () => true,
        getIdToken: () => ({ getJwtToken: () => '' })
      });
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isLoading).toBe(false);
    });

    await act(async () => {
      await requireContext(latestContext).signIn('player@example.com', 'password');
    });

    expect(requireContext(latestContext).username).toBe('user');
    expect(requireContext(latestContext).email).toBeNull();
    expect(requireContext(latestContext).userId).toBeNull();
  });

  it('keeps the user authenticated and flags a profile warning when sign-in returns no attributes', async () => {
    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      callback(null, null);
    });
    mocks.currentUser.authenticateUser.mockImplementation((_details, callbacks) => {
      callbacks.onSuccess({
        isValid: () => true,
        getIdToken: () => ({ getJwtToken: () => tokenFromClaims({ sub: 'user-id' }) })
      });
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isLoading).toBe(false);
    });

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await act(async () => {
      await expect(requireContext(latestContext).signIn('player@example.com', 'password'))
        .resolves.toEqual({ seasons: [], clubs: [] });
    });

    const context = requireContext(latestContext);
    expect(context.isAuthenticated).toBe(true);
    expect(context.username).toBe('user-id');
    expect(context.userId).toBe('user-id');
    expect(context.activeSeasons).toEqual([]);
    expect(context.managedClubs).toEqual([]);
    expect(context.userAttributesLoadFailed).toBe(true);
    expect(context.authError).toBeNull();
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to load user attributes during sign-in:',
      expect.objectContaining({ message: 'Cognito returned no user attributes.' })
    );
    consoleError.mockRestore();
  });

  it('rejects sign-in when Cognito requires a password change', async () => {
    mocks.currentUser.authenticateUser.mockImplementation((_details, callbacks) => {
      callbacks.newPasswordRequired();
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isLoading).toBe(false);
    });

    await act(async () => {
      await expect(requireContext(latestContext).signIn('player@example.com', 'password'))
        .rejects.toThrow('Password change required');
    });

    expect(requireContext(latestContext).isAuthenticated).toBe(false);
    expect(requireContext(latestContext).authError).toBe('Password change required. Please contact administrator.');
  });

  it('ignores malformed token claim types when setting the authenticated identity', async () => {
    mocks.currentUser.authenticateUser.mockImplementation((_details, callbacks) => {
      callbacks.onSuccess({
        isValid: () => true,
        getIdToken: () => ({
          getJwtToken: () => `header.${btoa(JSON.stringify({
            preferred_username: 42,
            name: 'Player Name',
            email: { address: 'player@example.com' },
            sub: 42
          }))}.signature`
        })
      });
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isLoading).toBe(false);
    });

    await act(async () => {
      await requireContext(latestContext).signIn('player@example.com', 'password');
    });

    expect(requireContext(latestContext).username).toBe('Player Name');
    expect(requireContext(latestContext).email).toBeNull();
    expect(requireContext(latestContext).userId).toBeNull();
  });

  it('uses safe identity fallbacks for an undecodable ID token', async () => {
    mocks.currentUser.authenticateUser.mockImplementation((_details, callbacks) => {
      callbacks.onSuccess({
        isValid: () => true,
        getIdToken: () => ({ getJwtToken: () => 'header.not-json.signature' })
      });
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isLoading).toBe(false);
    });

    await act(async () => {
      await requireContext(latestContext).signIn('player@example.com', 'password');
    });

    expect(requireContext(latestContext).isAuthenticated).toBe(true);
    expect(requireContext(latestContext).username).toBe('user');
    expect(requireContext(latestContext).email).toBeNull();
    expect(requireContext(latestContext).userId).toBeNull();
  });

  it('rejects failed credentials and exposes the Cognito error without authenticating', async () => {
    const authenticationError = new Error('Incorrect username or password.');
    mocks.currentUser.authenticateUser.mockImplementation((_details, callbacks) => {
      callbacks.onFailure(authenticationError);
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isLoading).toBe(false);
    });

    await act(async () => {
      await expect(requireContext(latestContext).signIn('player@example.com', 'wrong-password'))
        .rejects.toBe(authenticationError);
    });

    const context = requireContext(latestContext);
    expect(context.isAuthenticated).toBe(false);
    expect(context.activeSeasons).toEqual([]);
    expect(context.managedClubs).toEqual([]);
    expect(context.authError).toBe(authenticationError.message);
  });

  it('uses a fallback auth error when Cognito rejects without an error message', async () => {
    mocks.currentUser.authenticateUser.mockImplementation((_details, callbacks) => {
      callbacks.onFailure(new Error(''));
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isLoading).toBe(false);
    });

    await act(async () => {
      await expect(requireContext(latestContext).signIn('player@example.com', 'password'))
        .rejects.toThrow();
    });

    expect(requireContext(latestContext).authError).toBe('Authentication failed');
  });

  it('clears a previously recorded authentication error', async () => {
    const authenticationError = new Error('Incorrect username or password.');
    mocks.currentUser.authenticateUser.mockImplementation((_details, callbacks) => {
      callbacks.onFailure(authenticationError);
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isLoading).toBe(false);
    });

    await act(async () => {
      await expect(requireContext(latestContext).signIn('player@example.com', 'wrong-password'))
        .rejects.toBe(authenticationError);
    });
    expect(requireContext(latestContext).authError).toBe(authenticationError.message);

    act(() => {
      requireContext(latestContext).clearAuthError();
    });
    expect(requireContext(latestContext).authError).toBeNull();
  });

  it('keeps the user authenticated and flags a profile warning when attribute loading fails during sign-in', async () => {
    const attributeError = new Error('Temporary Cognito GetUser failure');
    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      callback(attributeError, null);
    });
    mocks.currentUser.authenticateUser.mockImplementation((_details, callbacks) => {
      callbacks.onSuccess({
        isValid: () => true,
        getIdToken: () => ({
          getJwtToken: () => `header.${btoa(JSON.stringify({
            preferred_username: 'player',
            email: 'player@example.com',
            sub: 'user-id'
          }))}.signature`
        })
      });
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isLoading).toBe(false);
    });

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await act(async () => {
      await expect(requireContext(latestContext).signIn('player@example.com', 'password'))
        .resolves.toEqual({ seasons: [], clubs: [] });
    });

    const context = requireContext(latestContext);
    expect(context.isAuthenticated).toBe(true);
    expect(context.username).toBe('player');
    expect(context.email).toBe('player@example.com');
    expect(context.userId).toBe('user-id');
    expect(context.activeSeasons).toEqual([]);
    expect(context.managedClubs).toEqual([]);
    expect(context.userAttributesLoadFailed).toBe(true);
    expect(context.authError).toBeNull();
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to load user attributes during sign-in:',
      attributeError
    );
    consoleError.mockRestore();
  });

  it('does not show a profile warning when sign-in succeeds without optional role attributes', async () => {
    mocks.currentUser.getUserAttributes.mockImplementation((callback) => {
      callback(null, []);
    });
    mocks.currentUser.authenticateUser.mockImplementation((_details, callbacks) => {
      callbacks.onSuccess({
        isValid: () => true,
        getIdToken: () => ({
          getJwtToken: () => `header.${btoa(JSON.stringify({
            preferred_username: 'player',
            email: 'player@example.com',
            sub: 'user-id'
          }))}.signature`
        })
      });
    });

    let latestContext: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Harness onContext={(ctx) => { latestContext = ctx; }} />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(latestContext?.isLoading).toBe(false);
    });

    await act(async () => {
      await expect(requireContext(latestContext).signIn('player@example.com', 'password'))
        .resolves.toEqual({ seasons: [], clubs: [] });
    });

    const context = requireContext(latestContext);
    expect(context.isAuthenticated).toBe(true);
    expect(context.activeSeasons).toEqual([]);
    expect(context.managedClubs).toEqual([]);
    expect(context.userAttributesLoadFailed).toBe(false);
  });
});
