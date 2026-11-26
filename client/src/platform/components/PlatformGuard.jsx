import { Navigate, useLocation } from 'react-router-dom';
import { usePlatformAuth } from '../auth/platformAuthContext';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

// Route guard for the console: only a signed-in platform user gets through.
// A company login does not count.
export default function PlatformGuard({ children }) {
  const { isAuthenticated, isLoading } = usePlatformAuth();
  const location = useLocation();
  if (isLoading) return <LoadingSpinner style={{ minHeight: '100vh' }} />;
  if (!isAuthenticated) {
    return <Navigate to="/platform/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return children;
}
