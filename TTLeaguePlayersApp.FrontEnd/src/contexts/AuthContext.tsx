import { useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
  CognitoUserAttribute
} from 'amazon-cognito-identity-js';
import { getConfig } from '../config/environment';
import { AuthContext, type ActiveSeason } from './AuthContextDefinition';
import { setAuthTokenProvider } from '../api/api';

interface AuthProviderProps {
  children: ReactNode;
}

interface InitialAuthState {
  userPool: CognitoUserPool | null;
  authInitialisationError: string | null;
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name || 'Error'}: ${error.message || ''}`;
  }
  return 'Unknown error (unserialisable)';
}

function createInitialAuthState(): InitialAuthState {
  try {
    const config = getConfig() as unknown as { Cognito?: { ClientId?: string; UserPoolId?: string } };
    const cognitoConfig = config.Cognito;

    if (!cognitoConfig?.ClientId) {
      return {
        userPool: null,
        authInitialisationError: 'Cognito config and/or ClientId info section is missing.'
      };
    }

    // Note: CognitoUserPool requires UserPoolId.
    // We keep the original behaviour of gating init on ClientId presence.
    const pool = new CognitoUserPool({
      UserPoolId: cognitoConfig.UserPoolId ?? '',
      ClientId: cognitoConfig.ClientId
    });

    return { userPool: pool, authInitialisationError: null };
  } catch (error: unknown) {
    return { userPool: null, authInitialisationError: formatUnknownError(error) };
  }
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [{ userPool, authInitialisationError }] = useState<InitialAuthState>(() => createInitialAuthState());

  // Initialize isLoading: true if we have a userPool to check for existing sessions, false otherwise
  const [isLoading, setIsLoading] = useState(() => !!(userPool && !authInitialisationError));
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeSeasons, setActiveSeasons] = useState<ActiveSeason[]>([]);

  const [authError, setAuthError] = useState<string | null>(null);

  const extractUsernameFromToken = (idToken: string): string => {
    if (!idToken || typeof idToken !== 'string') {
      return 'user';
    }
    try {
      const payload = JSON.parse(atob(idToken.split('.')[1])) as Record<string, unknown>;
      return (payload.preferred_username as string | undefined)
        ?? (payload.name as string | undefined)
        ?? (payload.email as string | undefined)
        ?? (payload.sub as string | undefined)
        ?? 'user';
    } catch {
      return 'user';
    }
  };

  const extractEmailFromToken = (idToken: string): string | null => {
    if (!idToken || typeof idToken !== 'string') {
      return null;
    }
    try {
      const payload = JSON.parse(atob(idToken.split('.')[1])) as Record<string, unknown>;
      return (payload.email as string | undefined) ?? null;
    } catch {
      return null;
    }
  };

  const extractSubFromToken = (idToken: string): string | null => {
    if (!idToken || typeof idToken !== 'string') {
      return null;
    }
    try {
      const payload = JSON.parse(atob(idToken.split('.')[1])) as Record<string, unknown>;
      return (payload.sub as string | undefined) ?? null;
    } catch {
      return null;
    }
  };

  const throwInitAuthFailed = (extraInfo?: string): never => {
    const details = authInitialisationError
      ? ` authInitialisationError: ${authInitialisationError}`
      : '';

    const extra = extraInfo ? ` extraInfo: ${extraInfo}` : '';

    throw new Error(`AuthProvider.initAuth() has failed.${details}${extra}`);
  };

  const parseActiveSeasonsJson = useCallback((value: string | null | undefined): ActiveSeason[] => {
    if (!value || typeof value !== 'string') {
      return [];
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.reduce((acc: ActiveSeason[], item: unknown) => {
        if (!item || typeof item !== 'object') return acc;

        const record = item as Record<string, unknown>;
        const isValidBase = typeof record.league === 'string'
          && typeof record.season === 'string'
          && typeof record.team_name === 'string'
          && typeof record.team_division === 'string'
          && typeof record.person_name === 'string'
          && typeof record.role === 'string';

        if (isValidBase) {
          const latestKudos = Array.isArray(record.latest_kudos)
            ? (record.latest_kudos as unknown[]).filter((k): k is number => typeof k === 'number')
            : [];

          acc.push({
            league: record.league as string,
            season: record.season as string,
            team_name: record.team_name as string,
            team_division: record.team_division as string,
            person_name: record.person_name as string,
            role: record.role as string,
            latest_kudos: latestKudos
          });
        }
        return acc;
      }, []);
    } catch {
      return [];
    }
  }, []);

  const fetchActiveSeasons = useCallback((cognitoUser: CognitoUser): Promise<ActiveSeason[]> => {
    return new Promise((resolve) => {
      cognitoUser.getUserAttributes((err, attributes) => {
        if (err || !attributes) {
          resolve([]);
          return;
        }

        const activeSeasonsAttribute = attributes.find((attr) => {
          const name = attr.getName();
          return name === 'custom:active_seasons' || name === 'active_seasons';
        });

        resolve(parseActiveSeasonsJson(activeSeasonsAttribute?.getValue()));
      });
    });
  }, [parseActiveSeasonsJson]);

  const assertAuthReady = (): CognitoUserPool => {
    if (authInitialisationError) {
      throwInitAuthFailed();
    }

    // With build-time configuration, userPool should either be initialised synchronously
    // or authInitialisationError should be set.
    if (!userPool) {
      throw new Error('User pool not initialized');
    }

    return userPool;
  };

  const signOut = useCallback(() => {
    if (userPool) {
      const currentUser = userPool.getCurrentUser();
      if (currentUser) {
        currentUser.signOut();
      }
    }

    setIsAuthenticated(false);
    setUsername(null);
    setEmail(null);
    setUserId(null);
    setActiveSeasons([]);
    setAuthError(null);
    setIsLoading(false);
  }, [userPool]);

  useEffect(() => {
    // Session discovery is still async (callback-based) but userPool construction is synchronous.
    // This effect only runs once on mount to check for existing sessions.
    if (!userPool || authInitialisationError) {
      // No userPool available - mark loading as complete asynchronously
      queueMicrotask(() => { setIsLoading(false); });
      return;
    }

    const currentUser = userPool.getCurrentUser();
    if (!currentUser) {
      // No existing session - mark loading as complete asynchronously
      queueMicrotask(() => { setIsLoading(false); });
      return;
    }

    let isMounted = true;

    currentUser.getSession((err: unknown, session: CognitoUserSession) => {
      if (!isMounted) {
        return;
      }

      if (!err && session.isValid()) {
        const idToken = session.getIdToken().getJwtToken();
        const extractedUsername = extractUsernameFromToken(idToken);
        const extractedEmail = extractEmailFromToken(idToken);
        const extractedUserId = extractSubFromToken(idToken);

        // Fetch active seasons synchronously to get the seasons data
        currentUser.getUserAttributes((userErr, attributes) => {
          if (!isMounted) return;

          let seasons: ActiveSeason[] = [];
          if (!userErr && attributes) {
            const activeSeasonsAttribute = attributes.find((attr) => {
              const name = attr.getName();
              return name === 'custom:active_seasons' || name === 'active_seasons';
            });
            seasons = parseActiveSeasonsJson(activeSeasonsAttribute?.getValue());
          }

          // Set all state together to avoid re-renders with incomplete data
          setIsAuthenticated(true);
          setUsername(extractedUsername);
          setEmail(extractedEmail);
          setUserId(extractedUserId);
          setActiveSeasons(seasons);
          setIsLoading(false);
        });
        return;
      }

      // If session discovery fails or the session is invalid, clear state.
      setIsAuthenticated(false);
      setUsername(null);
      setEmail(null);
      setUserId(null);
      setActiveSeasons([]);
      setAuthError(null);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [userPool, authInitialisationError, parseActiveSeasonsJson]);

  const signIn = async (emailInput: string, password: string): Promise<void> => {
    if (authInitialisationError) {
      throwInitAuthFailed();
    }

    const pool = assertAuthReady();

    setAuthError(null);

    return new Promise((resolve, reject) => {
      const authDetails = new AuthenticationDetails({
        Username: emailInput,
        Password: password
      });

      const cognitoUser = new CognitoUser({
        Username: emailInput,
        Pool: pool
      });

      cognitoUser.authenticateUser(authDetails, {
        onSuccess: (session: CognitoUserSession) => {
          const idToken = session.getIdToken().getJwtToken();
          const extractedUsername = extractUsernameFromToken(idToken);
          const extractedEmail = extractEmailFromToken(idToken);
          const extractedUserId = extractSubFromToken(idToken);

          void fetchActiveSeasons(cognitoUser).then((seasons) => {
            setIsAuthenticated(true);
            setUsername(extractedUsername);
            setEmail(extractedEmail);
            setUserId(extractedUserId);
            setActiveSeasons(seasons);
            resolve();
          });
        },
        onFailure: (err: Error) => {
          setAuthError(err.message || 'Authentication failed');
          reject(err);
        },
        newPasswordRequired: () => {
          setAuthError('Password change required. Please contact administrator.');
          reject(new Error('Password change required'));
        }
      });
    });
  };

  const signUp = async (emailInput: string, password: string): Promise<void> => {
    if (authInitialisationError) {
      throwInitAuthFailed();
    }

    const pool = assertAuthReady();

    setAuthError(null);

    const attributes = [new CognitoUserAttribute({ Name: 'email', Value: emailInput })];

    return new Promise((resolve, reject) => {
      pool.signUp(emailInput, password, attributes, [], (err: Error | undefined) => {
        if (err) {
          setAuthError(err.message || 'Registration failed');
          reject(err);
        } else {
          resolve();
        }
      });
    });
  };

  const confirmSignUp = async (emailInput: string, code: string): Promise<void> => {
    if (authInitialisationError) {
      throwInitAuthFailed();
    }

    const pool = assertAuthReady();

    setAuthError(null);

    const cognitoUser = new CognitoUser({ Username: emailInput, Pool: pool });

    return new Promise((resolve, reject) => {
      cognitoUser.confirmRegistration(code, true, (err: Error | null) => {
        if (err) {
          setAuthError(err.message || 'Verification failed');
          reject(err);
        } else {
          resolve();
        }
      });
    });
  };

  const resendConfirmationCode = async (emailInput: string): Promise<void> => {
    if (authInitialisationError) {
      throwInitAuthFailed();
    }

    const pool = assertAuthReady();

    setAuthError(null);

    const cognitoUser = new CognitoUser({ Username: emailInput, Pool: pool });

    return new Promise((resolve, reject) => {
      cognitoUser.resendConfirmationCode((err) => {
        if (err) {
          setAuthError(err.message || 'Failed to resend code');
          reject(err);
        } else {
          resolve();
        }
      });
    });
  };

  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (!userPool || !isAuthenticated) return null;

    return new Promise((resolve) => {
      const currentUser = userPool.getCurrentUser();
      if (!currentUser) {
        resolve(null);
        return;
      }

      currentUser.getSession((err: unknown, session: CognitoUserSession) => {
        if (err || !session.isValid()) {
          resolve(null);
          return;
        }
        resolve(session.getIdToken().getJwtToken());
      });
    });
  }, [userPool, isAuthenticated]);

  useEffect(() => {
    setAuthTokenProvider(getIdToken);
  }, [getIdToken]);

  const clearAuthError = () => {
    setAuthError(null);
  };

  const refreshActiveSeasons = useCallback(async (): Promise<void> => {
    if (!userPool || !isAuthenticated) {
      return;
    }

    const currentUser = userPool.getCurrentUser();
    if (!currentUser) {
      return;
    }

    return new Promise((resolve) => {
      currentUser.getSession((err: unknown, session: CognitoUserSession | null) => {
        if (err || !session?.isValid()) {
          resolve();
          return;
        }

        try {
          currentUser.getUserAttributes((attrErr, attributes) => {
            if (attrErr || !attributes) {
              resolve();
              return;
            }

            const activeSeasonsAttribute = attributes.find((attr) => {
              const name = attr.getName();
              return name === 'custom:active_seasons' || name === 'active_seasons';
            });

            const rawValue = activeSeasonsAttribute?.getValue();

            const seasons = parseActiveSeasonsJson(rawValue);

            if (seasons.length > 0) {
              setActiveSeasons(seasons);
            }
            resolve();
          });
        } catch (error) {
          console.error('Failed to refresh seasons:', error);
          resolve();
        }
      });
    });
  }, [userPool, isAuthenticated, parseActiveSeasonsJson]);

  return (
    <AuthContext
      value={{
        isAuthenticated,
        isLoading,
        username,
        email,
        userId,
        activeSeasons,
        authInitialisationError,
        signIn,
        signUp,
        confirmSignUp,
        resendConfirmationCode,
        signOut,
        getIdToken,
        authError,
        clearAuthError,
        refreshActiveSeasons
      }}
    >
      {children}
    </AuthContext>
  );
}
