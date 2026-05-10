import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Initialization from './pages/Initialization';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <>
      {/* Background Orbs */}
      <div className="orb orb-1"></div>
      <div className="orb orb-2"></div>
      
      <Router>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/init" element={<Initialization />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </Router>
    </>
  );
}

export default App;
