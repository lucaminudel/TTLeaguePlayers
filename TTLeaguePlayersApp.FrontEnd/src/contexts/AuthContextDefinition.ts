import { createContext } from 'react';

export interface AuthContextType {
  isAuthenticated: boolean;
  username: string | null;
  email: string | null;

  /**
   * Set when AuthProvider initialisation fails (e.g. loadConfig failure or missing Cognito config).
   * When set, AuthProvider methods will throw with an error that includes this value.
   */
  authInitialisationError: string | null;

  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  resendConfirmationCode: (email: string) => Promise<void>;
  signOut: () => void;
  getIdToken: () => Promise<string | null>;

  authError: string | null;
  clearAuthError: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
