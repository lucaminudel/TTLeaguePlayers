import { useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
  CognitoUserAttribute
} from 'amazon-cognito-identity-js';
import { getConfig } from '../config/environment';
import { AuthContext } from './AuthContextDefinition';

interface AuthProviderProps {
  children: ReactNode;
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name || 'Error'}: ${error.message || ''}`;
  }
  return 'Unknown error (unserialisable)';
}

interface InitialAuthState {
  userPool: CognitoUserPool | null;
  authInitialisationError: string | null;
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [{ userPool, authInitialisationError }] = useState<InitialAuthState>(() => createInitialAuthState());

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

  const throwInitAuthFailed = (extraInfo?: string): never => {
    const details = authInitialisationError
      ? ` authInitialisationError: ${authInitialisationError}`
      : '';

    const extra = extraInfo ? ` extraInfo: ${extraInfo}` : '';

    throw new Error(`AuthProvider.initAuth() has failed.${details}${extra}`);
  };

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
    setAuthError(null);
  }, [userPool]);

  useEffect(() => {
    // Session discovery is still async (callback-based) but userPool construction is synchronous.
    if (!userPool || authInitialisationError) {
      return;
    }

    const currentUser = userPool.getCurrentUser();
    if (!currentUser) {
      return;
    }

    currentUser.getSession((err: unknown, session: CognitoUserSession) => {
      if (!err && session.isValid()) {
        const idToken = session.getIdToken().getJwtToken();
        const extractedUsername = extractUsernameFromToken(idToken);
        const extractedEmail = extractEmailFromToken(idToken);
        setIsAuthenticated(true);
        setUsername(extractedUsername);
        setEmail(extractedEmail);
        return;
      }

      // If session discovery fails or the session is invalid, clear state.
      signOut();
    });
  }, [userPool, authInitialisationError, signOut]);

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

          setIsAuthenticated(true);
          setUsername(extractedUsername);
          setEmail(extractedEmail);
          resolve();
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

  const getIdToken = async (): Promise<string | null> => {
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
  };

  const clearAuthError = () => {
    setAuthError(null);
  };

  return (
    <AuthContext
      value={{
        isAuthenticated,
        username,
        email,
        authInitialisationError,
        signIn,
        signUp,
        confirmSignUp,
        resendConfirmationCode,
        signOut,
        getIdToken,
        authError,
        clearAuthError
      }}
    >
      {children}
    </AuthContext>
  );
}
