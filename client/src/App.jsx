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
import ComplianceDashboard from './pages/Dashboard/ComplianceDashboard';
import SalesDashboard from './pages/Dashboard/SalesDashboard';
import Drivers from './pages/Drivers/Drivers';
import Attendance from './pages/Attendance/Attendance';
import Salary from './pages/Salary/Salary';
import Invoices from './pages/Invoices/Invoices';
import Clients from './pages/Clients/Clients';
import Suppliers from './pages/Suppliers/Suppliers';
import Reports from './pages/Reports/Reports';
import OpsDriverAvailability from './pages/Reports/OpsDriverAvailability';
import OpsAttendanceTracker from './pages/Reports/OpsAttendanceTracker';
import OpsDisputeLog from './pages/Reports/OpsDisputeLog';
import OpsAssignmentHistory from './pages/Reports/OpsAssignmentHistory';
import OpsVehicleUtilization from './pages/Reports/OpsVehicleUtilization';
import OpsVehicleReturn from './pages/Reports/OpsVehicleReturn';
import OpsOnboardingPipeline from './pages/Reports/OpsOnboardingPipeline';
import OpsSimAllocation from './pages/Reports/OpsSimAllocation';
import OpsSalaryPipeline from './pages/Reports/OpsSalaryPipeline';
import OpsHeadcountVsPlan from './pages/Reports/OpsHeadcountVsPlan';
import SalesRevenueByClient from './pages/Reports/SalesRevenueByClient';
import SalesClientProfitability from './pages/Reports/SalesClientProfitability';
import SalesCreditNoteImpact from './pages/Reports/SalesCreditNoteImpact';
import SalesContractPipeline from './pages/Reports/SalesContractPipeline';
import SalesFillRate from './pages/Reports/SalesFillRate';
import SalesNewDrivers from './pages/Reports/SalesNewDrivers';
import SalesRateComparison from './pages/Reports/SalesRateComparison';
import VehiclesPage from './pages/Vehicles/Vehicles';
import Projects from './pages/Projects/Projects';
import Settings from './pages/Settings/Settings';
import UsersPage from './pages/Users';
import RolesPage from './pages/Roles';
import GuaranteeExtensions from './pages/GuaranteeExtensions';
import GuaranteePassports from './pages/GuaranteePassports';
import ExpiredDocuments from './pages/ExpiredDocuments';
import ProfilePage from './pages/Profile';
import NotificationsPage from './pages/Notifications';
import Advances from './pages/Advances/Advances';
import CreditNotes from './pages/CreditNotes/CreditNotes';
import StatementOfAccounts from './pages/StatementOfAccounts/StatementOfAccounts';
import SimCards from './pages/SimCards/SimCards';
import DriverClearance from './pages/DriverClearance/DriverClearance';
import NotFound from './pages/NotFound';

const queryClient = new QueryClient();

const ProtectedPage = ({ children, permission }) => (
  <ProtectedRoute permission={permission}>
    <MainLayout>{children}</MainLayout>
  </ProtectedRoute>
);

const DashboardSwitch = () => {
  const { hasPermission } = useAuth();
  if (hasPermission('dashboard.compliance')) return <ComplianceDashboard />;
  if (hasPermission('dashboard.sales')) return <SalesDashboard />;
  return <Dashboard />;
};

const RouterContent = () => (
  <>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<ProtectedPage><DashboardSwitch /></ProtectedPage>} />
        <Route path="/drivers" element={<ProtectedPage permission="drivers.view"><Drivers /></ProtectedPage>} />
        <Route path="/attendance" element={<ProtectedPage permission="attendance.view"><Attendance /></ProtectedPage>} />
        <Route path="/salary" element={<ProtectedPage permission="salary.view"><Salary /></ProtectedPage>} />
        <Route path="/driver-clearance" element={<ProtectedPage permission="clearance.view"><DriverClearance /></ProtectedPage>} />
        <Route path="/invoices" element={<ProtectedPage permission="invoices.view"><Invoices /></ProtectedPage>} />
        <Route path="/credit-notes" element={<ProtectedPage permission="credit_notes.view"><CreditNotes /></ProtectedPage>} />
        <Route path="/advances" element={<ProtectedPage permission="advances.view"><Advances /></ProtectedPage>} />
        <Route path="/clients" element={<ProtectedPage permission="clients.view"><Clients /></ProtectedPage>} />
        <Route path="/projects" element={<ProtectedPage permission="projects.view"><Projects /></ProtectedPage>} />
        <Route path="/suppliers" element={<ProtectedPage permission="suppliers.view"><Suppliers /></ProtectedPage>} />
        <Route path="/vehicles" element={<ProtectedPage permission="vehicles.view"><VehiclesPage /></ProtectedPage>} />
        <Route path="/simcards" element={<ProtectedPage permission="simcards.view"><SimCards /></ProtectedPage>} />
        <Route path="/reports" element={<ProtectedPage permission="reports.view"><Reports /></ProtectedPage>} />
        <Route path="/reports/ops/driver-availability" element={<ProtectedPage permission="reports.ops_driver_availability"><OpsDriverAvailability /></ProtectedPage>} />
        <Route path="/reports/ops/attendance-tracker" element={<ProtectedPage permission="reports.ops_attendance_tracker"><OpsAttendanceTracker /></ProtectedPage>} />
        <Route path="/reports/ops/dispute-log" element={<ProtectedPage permission="reports.ops_dispute_log"><OpsDisputeLog /></ProtectedPage>} />
        <Route path="/reports/ops/assignment-history" element={<ProtectedPage permission="reports.ops_assignment_history"><OpsAssignmentHistory /></ProtectedPage>} />
        <Route path="/reports/ops/vehicle-utilization" element={<ProtectedPage permission="reports.ops_vehicle_utilization"><OpsVehicleUtilization /></ProtectedPage>} />
        <Route path="/reports/ops/vehicle-return" element={<ProtectedPage permission="reports.ops_vehicle_return"><OpsVehicleReturn /></ProtectedPage>} />
        <Route path="/reports/ops/onboarding-pipeline" element={<ProtectedPage permission="reports.ops_onboarding_pipeline"><OpsOnboardingPipeline /></ProtectedPage>} />
        <Route path="/reports/ops/sim-allocation" element={<ProtectedPage permission="reports.ops_sim_allocation"><OpsSimAllocation /></ProtectedPage>} />
        <Route path="/reports/ops/salary-pipeline" element={<ProtectedPage permission="reports.ops_salary_pipeline"><OpsSalaryPipeline /></ProtectedPage>} />
        <Route path="/reports/ops/headcount-vs-plan" element={<ProtectedPage permission="reports.ops_headcount_vs_plan"><OpsHeadcountVsPlan /></ProtectedPage>} />
        <Route path="/reports/sales/revenue-by-client" element={<ProtectedPage permission="reports.sales_revenue_by_client"><SalesRevenueByClient /></ProtectedPage>} />
        <Route path="/reports/sales/client-profitability" element={<ProtectedPage permission="reports.sales_client_profitability"><SalesClientProfitability /></ProtectedPage>} />
        <Route path="/reports/sales/credit-note-impact" element={<ProtectedPage permission="reports.sales_credit_note_impact"><SalesCreditNoteImpact /></ProtectedPage>} />
        <Route path="/reports/sales/contract-pipeline" element={<ProtectedPage permission="reports.sales_contract_pipeline"><SalesContractPipeline /></ProtectedPage>} />
        <Route path="/reports/sales/fill-rate" element={<ProtectedPage permission="reports.sales_fill_rate"><SalesFillRate /></ProtectedPage>} />
        <Route path="/reports/sales/new-drivers" element={<ProtectedPage permission="reports.sales_new_drivers"><SalesNewDrivers /></ProtectedPage>} />
        <Route path="/reports/sales/rate-comparison" element={<ProtectedPage permission="reports.sales_rate_comparison"><SalesRateComparison /></ProtectedPage>} />
        <Route path="/statement-of-accounts" element={<ProtectedPage permission="reports.statement_of_accounts"><StatementOfAccounts /></ProtectedPage>} />
        <Route path="/settings" element={<ProtectedPage permission="settings.view"><Settings /></ProtectedPage>} />
        <Route path="/users" element={<ProtectedPage permission="users.view"><UsersPage /></ProtectedPage>} />
        <Route path="/roles" element={<ProtectedPage permission="roles.manage"><RolesPage /></ProtectedPage>} />
        <Route path="/guarantee-extensions" element={<ProtectedPage permission="roles.manage"><GuaranteeExtensions /></ProtectedPage>} />
        <Route path="/guarantee-passports" element={<ProtectedPage permission="guarantee_passports.view"><GuaranteePassports /></ProtectedPage>} />
        <Route path="/expired-documents" element={<ProtectedPage permission="expired_documents.view"><ExpiredDocuments /></ProtectedPage>} />
        <Route path="/profile" element={<ProtectedPage><ProfilePage /></ProtectedPage>} />
        <Route path="/notifications" element={<ProtectedPage><NotificationsPage /></ProtectedPage>} />
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
        height: '100vh', background: 'var(--bg)', flexDirection: 'column', gap: 14,
      }}>
        <div style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 22, fontWeight: 600, color: 'var(--text)',
        }}>LogiForce</div>
        <div style={{
          width: 32, height: 32, border: '2px solid var(--surface3)',
          borderTopColor: 'var(--accent)', borderRadius: '50%',
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
