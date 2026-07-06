import { HashRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './hooks/useAuth';
import { Home } from './pages/Home';
import { Join } from './pages/Join';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Kudos } from './pages/Kudos';
import { AwardKudos } from './pages/AwardKudos';
import { KudosStandings } from './pages/KudosStandings';
import { ClubsAndTournaments } from './pages/ClubsAndTournaments';
import { AboutAndContactUs } from './pages/AboutAndContactUs';
import { MyClubStandings } from './pages/MyClubStandings';
import { PromoteMyClubAndTournaments } from './pages/PromoteMyClubAndTournaments';
import { MyClubTeams } from './pages/MyClubTeams';
import { ProtectedRoute } from './components/common/ProtectedRoute';

/**
 * InitializationGate shows a loading screen while the initial auth check is in progress.
 * Once auth is determined, it renders the routes.
 * This prevents race conditions where the router tries to decide route protection
 * before we know the user's authentication status.
 */
function InitializationGate() {
  const { isLoading } = useAuth();

  // While initial auth check is in progress, show loading screen
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Initializing...</p>
        </div>
      </div>
    );
  }

  // Only render routes after auth state is determined
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/:inviteId" element={<Home />} />
      <Route path="/join/:inviteId" element={<Join />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/kudos"
        element={
          <ProtectedRoute>
            <Kudos />
          </ProtectedRoute>
        }
      />
      <Route
        path="/award-kudos"
        element={
          <ProtectedRoute>
            <AwardKudos />
          </ProtectedRoute>
        }
      />
      <Route
        path="/kudos-standings"
        element={
          <ProtectedRoute>
            <KudosStandings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-club-standings"
        element={
          <ProtectedRoute>
            <MyClubStandings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/promote-my-club-and-tournaments"
        element={
          <ProtectedRoute>
            <PromoteMyClubAndTournaments />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-club-teams"
        element={
          <ProtectedRoute>
            <MyClubTeams />
          </ProtectedRoute>
        }
      />
      <Route path="/clubs-and-tournaments" element={<ClubsAndTournaments />} />
      <Route path="/about-and-contact-us" element={<AboutAndContactUs />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <InitializationGate />
      </HashRouter>
    </AuthProvider>
  );
}

export default App;
