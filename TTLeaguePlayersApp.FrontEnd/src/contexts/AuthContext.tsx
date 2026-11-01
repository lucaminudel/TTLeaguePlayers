import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
  CognitoUserAttribute
} from 'amazon-cognito-identity-js';
import { getConfig } from '../config/environment';
import { AuthContext, type ActiveSeason, type ManagedClub } from './AuthContextDefinition';
import { parseActiveSeasonsJson, parseManagedClubsJson } from './AuthContextParsers';
import { hasCaptainRole } from '../utils/activeSeasonUtils';
import { setAuthTokenProvider } from '../api/api';

interface AuthProviderProps {
  children: ReactNode;
}

interface InitialAuthState {
  userPool: CognitoUserPool | null;
  authInitialisationError: string | null;
}

function getTokenClaims(idToken: string): Record<string, unknown> | null {
  if (!idToken || typeof idToken !== 'string') {
    return null;
  }

  try {
    const payload: unknown = JSON.parse(atob(idToken.split('.')[1]));
    return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function getStringClaim(claims: Record<string, unknown> | null, claim: string): string | undefined {
  const value = claims?.[claim];
  return typeof value === 'string' ? value : undefined;
}

function extractUsernameFromToken(idToken: string): string {
  const claims = getTokenClaims(idToken);
  return getStringClaim(claims, 'preferred_username')
    ?? getStringClaim(claims, 'name')
    ?? getStringClaim(claims, 'email')
    ?? getStringClaim(claims, 'sub')
    ?? 'user';
}

function extractEmailFromToken(idToken: string): string | null {
  return getStringClaim(getTokenClaims(idToken), 'email') ?? null;
}

function extractSubFromToken(idToken: string): string | null {
  return getStringClaim(getTokenClaims(idToken), 'sub') ?? null;
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
  const [managedClubs, setManagedClubs] = useState<ManagedClub[]>([]);
  const [userAttributesLoadFailed, setUserAttributesLoadFailed] = useState(false);
  const authSessionVersion = useRef(0);
  
  const [authError, setAuthError] = useState<string | null>(null);

  const throwInitAuthFailed = (extraInfo?: string): never => {
    const details = authInitialisationError
      ? ` authInitialisationError: ${authInitialisationError}`
      : '';

    const extra = extraInfo ? ` extraInfo: ${extraInfo}` : '';

    throw new Error(`AuthProvider.initAuth() has failed.${details}${extra}`);
  };

  const fetchCustomAttributes = useCallback((cognitoUser: CognitoUser): Promise<{ seasons: ActiveSeason[]; clubs: ManagedClub[] }> => {
    return new Promise((resolve, reject) => {
      cognitoUser.getUserAttributes((err, attributes) => {
        if (err) {
          reject(err);
          return;
        }

        if (!attributes) {
          reject(new Error('Cognito returned no user attributes.'));
          return;
        }

        const activeSeasonsAttribute = attributes.find((attr) => {
          const name = attr.getName();
          return name === 'custom:active_seasons' || name === 'active_seasons';
        });

        const managedClubsAttribute = attributes.find((attr) => {
          const name = attr.getName();
          return name === 'custom:managed_clubs' || name === 'managed_clubs';
        });

        resolve({
          seasons: parseActiveSeasonsJson(activeSeasonsAttribute?.getValue()),
          clubs: parseManagedClubsJson(managedClubsAttribute?.getValue())
        });
      });
    });
  }, []);

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
    try {
      if (userPool) {
        const currentUser = userPool.getCurrentUser();
        if (currentUser) {
          currentUser.signOut();
        }
      }
    } finally {
      authSessionVersion.current += 1;
      setIsAuthenticated(false);
      setUsername(null);
      setEmail(null);
      setUserId(null);
      setActiveSeasons([]);
      setManagedClubs([]);
      setUserAttributesLoadFailed(false);
      setAuthError(null);
      setIsLoading(false);
    }
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
    const sessionVersion = authSessionVersion.current;

    currentUser.getSession((err: unknown, session: CognitoUserSession) => {
      if (!isMounted || authSessionVersion.current !== sessionVersion) {
        return;
      }

      if (!err && session.isValid()) {
        const idToken = session.getIdToken().getJwtToken();
        const extractedUsername = extractUsernameFromToken(idToken);
        const extractedEmail = extractEmailFromToken(idToken);
        const extractedUserId = extractSubFromToken(idToken);

        // Load role attributes before completing session bootstrap.
        currentUser.getUserAttributes((userErr, attributes) => {
          if (!isMounted || authSessionVersion.current !== sessionVersion) return;

          let seasons: ActiveSeason[] = [];
          let clubs: ManagedClub[] = [];
          if (userErr || !attributes) {
            setUserAttributesLoadFailed(true);
          } else {
            setUserAttributesLoadFailed(false);
            const activeSeasonsAttribute = attributes.find((attr) => {
              const name = attr.getName();
              return name === 'custom:active_seasons' || name === 'active_seasons';
            });
            seasons = parseActiveSeasonsJson(activeSeasonsAttribute?.getValue());

            const managedClubsAttribute = attributes.find((attr) => {
              const name = attr.getName();
              return name === 'custom:managed_clubs' || name === 'managed_clubs';
            });
            clubs = parseManagedClubsJson(managedClubsAttribute?.getValue());
          }

          // Set all state together to avoid re-renders with incomplete data
          setIsAuthenticated(true);
          setUsername(extractedUsername);
          setEmail(extractedEmail);
          setUserId(extractedUserId);
          setActiveSeasons(seasons);
          setManagedClubs(clubs);
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
      setManagedClubs([]);
      setUserAttributesLoadFailed(false);
      setAuthError(null);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [userPool, authInitialisationError]);

  const signIn = async (emailInput: string, password: string): Promise<{ seasons: ActiveSeason[]; clubs: ManagedClub[] }> => {
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

          void fetchCustomAttributes(cognitoUser)
            .then(({ seasons, clubs }) => {
              setIsAuthenticated(true);
              setUsername(extractedUsername);
              setEmail(extractedEmail);
              setUserId(extractedUserId);
              setActiveSeasons(seasons);
              setManagedClubs(clubs);
              setUserAttributesLoadFailed(false);
              resolve({ seasons, clubs });
            })
            .catch((error: unknown) => {
              console.error('Failed to load user attributes during sign-in:', error);
              setIsAuthenticated(true);
              setUsername(extractedUsername);
              setEmail(extractedEmail);
              setUserId(extractedUserId);
              setActiveSeasons([]);
              setManagedClubs([]);
              setUserAttributesLoadFailed(true);
              resolve({ seasons: [], clubs: [] });
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

  const forgotPassword = async (emailInput: string): Promise<void> => {
    const pool = assertAuthReady();

    const cognitoUser = new CognitoUser({ Username: emailInput, Pool: pool });

    return new Promise((resolve, reject) => {
      cognitoUser.forgotPassword({
        onSuccess: () => { resolve(); },
        onFailure: (err: Error) => { reject(err); }
      });
    });
  };

  const confirmForgotPassword = async (emailInput: string, code: string, newPassword: string): Promise<void> => {
    const pool = assertAuthReady();

    const cognitoUser = new CognitoUser({ Username: emailInput, Pool: pool });

    return new Promise((resolve, reject) => {
      cognitoUser.confirmPassword(code, newPassword, {
        onSuccess: () => { resolve(); },
        onFailure: (err: Error) => { reject(err); }
      });
    });
  };

  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (!userPool || !isAuthenticated) return null;

    const sessionVersion = authSessionVersion.current;

    return new Promise((resolve) => {
      const currentUser = userPool.getCurrentUser();
      if (!currentUser) {
        resolve(null);
        return;
      }

      currentUser.getSession((err: unknown, session: CognitoUserSession | null) => {
        if (authSessionVersion.current !== sessionVersion || err || !session?.isValid()) {
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

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const refreshActiveSeasons = useCallback(async (): Promise<void> => {
    if (!userPool || !isAuthenticated) {
      return;
    }

    const currentUser = userPool.getCurrentUser();
    if (!currentUser) {
      return;
    }

    const sessionVersion = authSessionVersion.current;

    return new Promise((resolve) => {
      currentUser.getSession((err: unknown, session: CognitoUserSession | null) => {
        if (authSessionVersion.current !== sessionVersion) {
          resolve();
          return;
        }
        if (err || !session?.isValid()) {
          resolve();
          return;
        }

        try {
          currentUser.getUserAttributes((attrErr, attributes) => {
            if (authSessionVersion.current !== sessionVersion) {
              resolve();
              return;
            }
            if (attrErr || !attributes) {
              setUserAttributesLoadFailed(true);
              resolve();
              return;
            }

            const activeSeasonsAttribute = attributes.find((attr) => {
              const name = attr.getName();
              return name === 'custom:active_seasons' || name === 'active_seasons';
            });

            const rawValue = activeSeasonsAttribute?.getValue();

            const seasons = parseActiveSeasonsJson(rawValue);
            setActiveSeasons(seasons);

            const managedClubsAttribute = attributes.find((attr) => {
              const name = attr.getName();
              return name === 'custom:managed_clubs' || name === 'managed_clubs';
            });

            const clubs = parseManagedClubsJson(managedClubsAttribute?.getValue());
            setManagedClubs(clubs);
            setUserAttributesLoadFailed(false);
            resolve();
          });
        } catch (error) {
          console.error('Failed to refresh seasons:', error);
          setUserAttributesLoadFailed(true);
          resolve();
        }
      });
    });
  }, [userPool, isAuthenticated]);

  return (
    <AuthContext
      value={{
        isAuthenticated,
        isLoading,
        username,
        email,
        userId,
        activeSeasons,
        managedClubs,
        userAttributesLoadFailed,
        isPlayerOrCaptain: activeSeasons.length > 0,
        isClubManager: managedClubs.length > 0,
        isCaptain: hasCaptainRole(activeSeasons),
        authInitialisationError,
        signIn,
        signUp,
        confirmSignUp,
        resendConfirmationCode,
        forgotPassword,
        confirmForgotPassword,
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
