import { Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { useWebSocket } from './hooks/useWebSocket';
import { useAlerts } from './hooks/useAlerts';
import { ToastContainer } from './components/ToastContainer';
// Importing the theme store triggers immediate theme application from localStorage
import './stores/themeStore';
import Dashboard from './pages/Dashboard';
import ProcessList from './pages/ProcessList';
import ProcessTree from './pages/ProcessTree';
import CpuCores from './pages/CpuCores';
import MemoryView from './pages/MemoryView';
import ProcessCompare from './pages/ProcessCompare';

function App() {
  useWebSocket();
  useAlerts();

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/processes" element={<ProcessList />} />
            <Route path="/tree" element={<ProcessTree />} />
            <Route path="/cpu" element={<CpuCores />} />
            <Route path="/memory" element={<MemoryView />} />
            <Route path="/compare" element={<ProcessCompare />} />
          </Routes>
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}

export default App;
