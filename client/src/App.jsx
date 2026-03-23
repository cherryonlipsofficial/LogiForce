import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
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
import NotFound from './pages/NotFound';

const queryClient = new QueryClient();

const ProtectedPage = ({ children, roles }) => (
  <ProtectedRoute roles={roles}>
    <MainLayout>{children}</MainLayout>
  </ProtectedRoute>
);

const App = () => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <UserPrefsProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<ProtectedPage><Dashboard /></ProtectedPage>} />
              <Route path="/drivers" element={<ProtectedPage><Drivers /></ProtectedPage>} />
              <Route path="/attendance" element={<ProtectedPage roles={['admin', 'ops']}><Attendance /></ProtectedPage>} />
              <Route path="/salary" element={<ProtectedPage roles={['admin', 'accountant']}><Salary /></ProtectedPage>} />
              <Route path="/invoices" element={<ProtectedPage roles={['admin', 'accountant']}><Invoices /></ProtectedPage>} />
              <Route path="/clients" element={<ProtectedPage roles={['admin', 'accountant']}><Clients /></ProtectedPage>} />
              <Route path="/suppliers" element={<ProtectedPage roles={['admin']}><Suppliers /></ProtectedPage>} />
              <Route path="/reports" element={<ProtectedPage><Reports /></ProtectedPage>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
          <Toaster position="top-right" />
        </AuthProvider>
        </UserPrefsProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
