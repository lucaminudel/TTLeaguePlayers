import { HashRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { Home } from './pages/Home';
import { Join } from './pages/Join';
import { Login } from './pages/Login';

function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/join/:inviteId" element={<Join />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}

export default App;
