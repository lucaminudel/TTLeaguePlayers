import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { CognitoUserPool, CognitoUser, AuthenticationDetails, CognitoUserSession } from 'amazon-cognito-identity-js';
import { loadConfig } from '../config/environment';

interface AuthContextType {
  isAuthenticated: boolean;
  username: string | null;
  email: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  getIdToken: () => Promise<string | null>;
  authError: string | null;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [userPool, setUserPool] = useState<CognitoUserPool | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const extractUsernameFromToken = (idToken: string): string => {
    if (!idToken || typeof idToken !== 'string') {
      return 'user';
    }
    try {
      const payload = JSON.parse(atob(idToken.split('.')[1]));
      return payload.preferred_username || payload.name || payload.email || payload.sub || 'user';
    } catch (error) {
      return 'user';
    }
  };

  const extractEmailFromToken = (idToken: string): string | null => {
    if (!idToken || typeof idToken !== 'string') {
      return null;
    }
    try {
      const payload = JSON.parse(atob(idToken.split('.')[1]));
      return payload.email || null;
    } catch (error) {
      return null;
    }
  };

  useEffect(() => {
    async function initAuth() {
      try {
        const config = await loadConfig();
        if (config.Cognito && config.Cognito.ClientId) {
          const pool = new CognitoUserPool({
            UserPoolId: config.Cognito.UserPoolId,
            ClientId: config.Cognito.ClientId
          });
          setUserPool(pool);
          
          const currentUser = pool.getCurrentUser();
          if (currentUser) {
            currentUser.getSession((err: any, session: CognitoUserSession) => {
              if (!err && session.isValid()) {
                const idToken = session.getIdToken().getJwtToken();
                const extractedUsername = extractUsernameFromToken(idToken);
                const extractedEmail = extractEmailFromToken(idToken);
                setIsAuthenticated(true);
                setUsername(extractedUsername);
                setEmail(extractedEmail);
              }
            });
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
      }
    }
    
    initAuth();
  }, []);

  const signIn = async (email: string, password: string): Promise<void> => {
    if (!userPool) {
      throw new Error('User pool not initialized');
    }

    setAuthError(null);

    return new Promise((resolve, reject) => {
      const authDetails = new AuthenticationDetails({
        Username: email,
        Password: password
      });

      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool
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
        onFailure: (err) => {
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

  const signOut = () => {
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
  };

  const getIdToken = async (): Promise<string | null> => {
    if (!userPool || !isAuthenticated) return null;
    
    return new Promise((resolve) => {
      const currentUser = userPool.getCurrentUser();
      if (!currentUser) {
        resolve(null);
        return;
      }
      
      currentUser.getSession((err: any, session: CognitoUserSession) => {
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
    <AuthContext.Provider value={{
      isAuthenticated,
      username,
      email,
      signIn,
      signOut,
      getIdToken,
      authError,
      clearAuthError
    }}>
      {children}
    </AuthContext.Provider>
  );
}