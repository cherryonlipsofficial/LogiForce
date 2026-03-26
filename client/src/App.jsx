import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import { UserPrefsProvider } from './hooks/useUserPrefs.jsx';
import ProtectedRoute from './components/layout/ProtectedRoute';
import MainLayout from './components/layout/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard/Dashboard';
import Drivers from './pages/Drivers/Drivers';
import Attendance from './pages/Attendance/Attendance';
import Salary from './pages/Salary/Salary';
import Invoices from './pages/Invoices/Invoices';
import Clients from './pages/Clients/Clients';
import Suppliers from './pages/Suppliers/Suppliers';
import Reports from './pages/Reports/Reports';
import VehiclesPage from './pages/Vehicles/Vehicles';
import Projects from './pages/Projects/Projects';
import Settings from './pages/Settings/Settings';
import NotFound from './pages/NotFound';

const queryClient = new QueryClient();

const ProtectedPage = ({ children, permission }) => (
  <ProtectedRoute permission={permission}>
    <MainLayout>{children}</MainLayout>
  </ProtectedRoute>
);

const RouterContent = () => (
  <>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<ProtectedPage><Dashboard /></ProtectedPage>} />
        <Route path="/drivers" element={<ProtectedPage permission="drivers.view"><Drivers /></ProtectedPage>} />
        <Route path="/attendance" element={<ProtectedPage permission="attendance.view"><Attendance /></ProtectedPage>} />
        <Route path="/salary" element={<ProtectedPage permission="salary.view"><Salary /></ProtectedPage>} />
        <Route path="/invoices" element={<ProtectedPage permission="invoices.view"><Invoices /></ProtectedPage>} />
        <Route path="/clients" element={<ProtectedPage permission="clients.view"><Clients /></ProtectedPage>} />
        <Route path="/projects" element={<ProtectedPage permission="projects.view"><Projects /></ProtectedPage>} />
        <Route path="/suppliers" element={<ProtectedPage permission="suppliers.view"><Suppliers /></ProtectedPage>} />
        <Route path="/vehicles" element={<ProtectedPage permission="vehicles.view"><VehiclesPage /></ProtectedPage>} />
        <Route path="/reports" element={<ProtectedPage permission="reports.view"><Reports /></ProtectedPage>} />
        <Route path="/settings" element={<ProtectedPage permission="users.view"><Settings /></ProtectedPage>} />
        <Route path="/users" element={<ProtectedPage permission="users.view"><Settings /></ProtectedPage>} />
        <Route path="/roles" element={<ProtectedPage permission="users.view"><Settings /></ProtectedPage>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
    <Toaster position="top-right" />
  </>
);

const AppWithAuth = () => {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#0d0f14', flexDirection: 'column', gap: 14,
      }}>
        <div style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 22, fontWeight: 600, color: '#e8eaf0',
        }}>LogiForce</div>
        <div style={{
          width: 32, height: 32, border: '2px solid #232840',
          borderTopColor: '#4f8ef7', borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }}/>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return <RouterContent />;
};

const App = () => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <UserPrefsProvider>
        <AuthProvider>
          <AppWithAuth />
        </AuthProvider>
        </UserPrefsProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
