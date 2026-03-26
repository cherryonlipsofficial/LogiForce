import { useAuth } from '../../context/AuthContext';

/**
 * Conditionally render children based on permissions.
 *
 * Props:
 *   permission  — single key, user must have it
 *   permissions — array of keys, user must have ALL
 *   anyOf       — array of keys, user must have at least ONE
 *   fallback    — rendered when permission check fails (default: null)
 */
const PermissionGate = ({ permission, permissions, anyOf, fallback = null, children }) => {
  const { hasPermission } = useAuth();

  let allowed = true;

  if (permission) {
    allowed = hasPermission(permission);
  }

  if (allowed && permissions) {
    allowed = permissions.every((key) => hasPermission(key));
  }

  if (allowed && anyOf) {
    allowed = anyOf.some((key) => hasPermission(key));
  }

  return allowed ? children : fallback;
};

export default PermissionGate;
