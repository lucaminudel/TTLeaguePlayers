import { createContext } from 'react';

export interface ActiveSeason {
  league: string;
  season: string;
  team_name: string;
  team_division: string;
  person_name: string;
  role: string;
  latest_kudos: number[];
}

export interface AuthContextType {
  isAuthenticated: boolean;
  /**
   * True while the AuthProvider is performing the initial authentication state check.
   * This includes checking for existing Cognito sessions and fetching user attributes.
   * Use this to avoid showing login redirects or loading spinners until the check completes.
   */
  isLoading: boolean;
  username: string | null;
  email: string | null;
  activeSeasons: ActiveSeason[];

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
