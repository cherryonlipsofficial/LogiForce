import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard/Dashboard';
import Drivers from './pages/Drivers/Drivers';
import Attendance from './pages/Attendance/Attendance';
import Salary from './pages/Salary/Salary';
import Invoices from './pages/Invoices/Invoices';
import Clients from './pages/Clients/Clients';
import Suppliers from './pages/Suppliers/Suppliers';
import Reports from './pages/Reports/Reports';

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/drivers" element={<ProtectedRoute><Drivers /></ProtectedRoute>} />
            <Route path="/attendance" element={<ProtectedRoute roles={['admin', 'ops']}><Attendance /></ProtectedRoute>} />
            <Route path="/salary" element={<ProtectedRoute roles={['admin', 'accountant']}><Salary /></ProtectedRoute>} />
            <Route path="/invoices" element={<ProtectedRoute roles={['admin', 'accountant']}><Invoices /></ProtectedRoute>} />
            <Route path="/clients" element={<ProtectedRoute roles={['admin', 'accountant']}><Clients /></ProtectedRoute>} />
            <Route path="/suppliers" element={<ProtectedRoute roles={['admin']}><Suppliers /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
