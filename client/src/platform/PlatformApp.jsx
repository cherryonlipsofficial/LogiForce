import { Routes, Route, Navigate } from 'react-router-dom';
import PlatformAuthProvider from './auth/PlatformAuthProvider';
import PlatformGuard from './components/PlatformGuard';
import PlatformLayout from './components/PlatformLayout';
import { NAV } from './components/nav';
import PlatformLogin from './pages/PlatformLogin';
import PlatformSetPassword from './pages/PlatformSetPassword';
import Companies from './pages/Companies';
import CompanyDetail from './pages/CompanyDetail';
import PlatformRoles from './pages/PlatformRoles';
import PlatformUsers from './pages/PlatformUsers';
import PlatformAccessRoles from './pages/PlatformAccessRoles';
import AuditLog from './pages/AuditLog';
import { usePlatformCan } from './hooks/usePlatformPermission';

// The first page this user may open.
function Home() {
  const can = usePlatformCan();
  const first = NAV.find((item) => item.any.some(can));
  if (!first) {
    return (
      <div style={{ fontSize: 13, color: 'var(--text2)' }}>
        Your platform role gives you no access to any page yet. Ask a Platform Owner.
      </div>
    );
  }
  return <Navigate to={first.to} replace />;
}

// Everything under /platform/*. Mounted outside the company AuthProvider, so
// the two sessions never see each other.
export default function PlatformApp() {
  return (
    <PlatformAuthProvider>
      <Routes>
        <Route path="login" element={<PlatformLogin />} />
        <Route path="set-password/:token" element={<PlatformSetPassword />} />
        <Route element={<PlatformGuard><PlatformLayout /></PlatformGuard>}>
          <Route index element={<Home />} />
          <Route path="companies" element={<Companies />} />
          <Route path="companies/:key" element={<CompanyDetail />} />
          <Route path="role-templates" element={<PlatformRoles />} />
          <Route path="roles" element={<Navigate to="/platform/role-templates" replace />} />
          <Route path="users" element={<PlatformUsers />} />
          <Route path="access-roles" element={<PlatformAccessRoles />} />
          <Route path="audit" element={<AuditLog />} />
          <Route path="*" element={<Navigate to="/platform" replace />} />
        </Route>
      </Routes>
    </PlatformAuthProvider>
  );
}
