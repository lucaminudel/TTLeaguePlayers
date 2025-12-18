import { HashRouter, Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { Join } from './pages/Join';

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/join/:inviteId" element={<Join />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
