import { Routes, Route, Navigate } from 'react-router-dom';
import { isAuthenticated } from './lib/auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AgentsList from './pages/Agents/List';
import AgentDetail from './pages/Agents/Detail';
import Playground from './pages/Playground';
import PlaygroundHistory from './pages/PlaygroundHistory';
import PlaygroundDetail from './pages/PlaygroundDetail';
import Reports from './pages/Reports';
import ReportDetail from './pages/ReportDetail';
import SharedReport from './pages/SharedReport';
import Traces from './pages/Traces';
import Batches from './pages/Batches';
import BatchDetail from './pages/BatchDetail';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import Graphs from './pages/Graphs';
import GraphEditor from './pages/GraphEditor';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return isAuthenticated() ? <>{children}</> : <Navigate to="/login" replace />;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reports/shared/:token" element={<SharedReport />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/agents" element={<AgentsList />} />
                <Route path="/agents/:agentName" element={<AgentDetail />} />
                <Route path="/playground" element={<Playground />} />
                <Route path="/playground-history" element={<PlaygroundHistory />} />
                <Route path="/playground-history/:promptId" element={<PlaygroundDetail />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/reports/:reportId" element={<ReportDetail />} />
                <Route path="/traces" element={<Traces />} />
                <Route path="/batches" element={<Batches />} />
                <Route path="/batches/:batchId" element={<BatchDetail />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/graphs" element={<Graphs />} />
                <Route path="/graphs/:graphId" element={<GraphEditor />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
