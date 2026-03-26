import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * Check a single permission key.
 * Returns boolean.
 */
export const usePermission = (key) => {
  const { hasPermission } = useAuth();
  return hasPermission(key);
};

/**
 * Check multiple permission keys at once.
 * @param {Object} keyMap — e.g. { canCreate: 'drivers.create', canEdit: 'drivers.edit' }
 * @returns {Object} — e.g. { canCreate: true, canEdit: false }
 */
export const usePermissions = (keyMap) => {
  const { permissions } = useAuth();
  return useMemo(() => {
    const result = {};
    for (const [alias, key] of Object.entries(keyMap)) {
      result[alias] = permissions.includes(key);
    }
    return result;
  }, [permissions, keyMap]);
};

/**
 * Returns the full permissions array.
 */
export const useAllPermissions = () => {
  const { permissions } = useAuth();
  return permissions;
};
