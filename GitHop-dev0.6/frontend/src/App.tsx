import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import RepositoryList from './RepositoryList';
import RepositoryDetail from './RepositoryDetail';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<RepositoryList />} />
        <Route path="/repo/:owner/:name" element={<RepositoryDetail />} />
      </Routes>
    </Router>
  );
}

export default App;