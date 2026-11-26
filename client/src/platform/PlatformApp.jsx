import { Routes, Route, Navigate } from 'react-router-dom';
import PlatformAuthProvider from './auth/PlatformAuthProvider';
import PlatformGuard from './components/PlatformGuard';
import PlatformLayout from './components/PlatformLayout';
import PlatformLogin from './pages/PlatformLogin';
import PlatformSetPassword from './pages/PlatformSetPassword';
import Companies from './pages/Companies';
import CompanyDetail from './pages/CompanyDetail';
import PlatformRoles from './pages/PlatformRoles';
import AuditLog from './pages/AuditLog';

// Everything under /platform/*. Mounted outside the company AuthProvider, so
// the two sessions never see each other.
export default function PlatformApp() {
  return (
    <PlatformAuthProvider>
      <Routes>
        <Route path="login" element={<PlatformLogin />} />
        <Route path="set-password/:token" element={<PlatformSetPassword />} />
        <Route element={<PlatformGuard><PlatformLayout /></PlatformGuard>}>
          <Route index element={<Navigate to="companies" replace />} />
          <Route path="companies" element={<Companies />} />
          <Route path="companies/:key" element={<CompanyDetail />} />
          <Route path="roles" element={<PlatformRoles />} />
          <Route path="audit" element={<AuditLog />} />
          <Route path="*" element={<Navigate to="/platform/companies" replace />} />
        </Route>
      </Routes>
    </PlatformAuthProvider>
  );
}
