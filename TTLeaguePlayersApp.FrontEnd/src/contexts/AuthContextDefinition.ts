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

export interface ManagedClub {
  league: string;
  season: string;
  club_name: string;
  club_location: string;
  manager_name: string;
}

export interface SignInProfile {
  seasons: ActiveSeason[];
  clubs: ManagedClub[];
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
  userId: string | null;
  activeSeasons: ActiveSeason[];
  managedClubs: ManagedClub[];
  isPlayerOrCaptain: boolean;
  isClubManager: boolean;

  /**
   * Set when AuthProvider initialisation fails (e.g. loadConfig failure or missing Cognito config).
   * When set, AuthProvider methods will throw with an error that includes this value.
   */
  authInitialisationError: string | null;

  signIn: (email: string, password: string) => Promise<SignInProfile>;
  signUp: (email: string, password: string) => Promise<void>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  resendConfirmationCode: (email: string) => Promise<void>;
  signOut: () => void;
  getIdToken: () => Promise<string | null>;

  authError: string | null;
  clearAuthError: () => void;
  refreshActiveSeasons: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
