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
import { TournamentsAndClubs } from './pages/TournamentsAndClubs';
import { About } from './pages/About';
import { ClubKudosStandings } from './pages/ClubKudosStandings';
import { ClubAddToTheList } from './pages/ClubAddToTheList';
import { ClubTournaments } from './pages/ClubTournaments';
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
        path="/club-kudos-standings"
        element={
          <ProtectedRoute>
            <ClubKudosStandings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/club-add-to-the-list"
        element={
          <ProtectedRoute>
            <ClubAddToTheList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/club-tounraments"
        element={
          <ProtectedRoute>
            <ClubTournaments />
          </ProtectedRoute>
        }
      />
      <Route path="/tournaments-and-clubs" element={<TournamentsAndClubs />} />
      <Route path="/about" element={<About />} />
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
