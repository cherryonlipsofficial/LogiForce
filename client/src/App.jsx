import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
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
            <Route path="/" element={<Dashboard />} />
            <Route path="/drivers" element={<Drivers />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/salary" element={<Salary />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/reports" element={<Reports />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
