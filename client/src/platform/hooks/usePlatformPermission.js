import { usePlatformAuth } from '../auth/platformAuthContext';

// What the signed-in platform user may do: the permissions of their platform
// role, as returned by the server (/auth/me, /auth/verify-otp). Used only to
// hide what the user can't do; the server checks every request itself.

/** True when the user holds `key`, e.g. usePlatformPermission('platform.tenants.create'). */
export const usePlatformPermission = (key) => {
  const auth = usePlatformAuth();
  return Boolean(auth?.user?.permissions?.includes(key));
};

/** A `can(key)` function, for pages that check several permissions. */
export const usePlatformCan = () => {
  const auth = usePlatformAuth();
  const permissions = auth?.user?.permissions || [];
  return (key) => permissions.includes(key);
};

export default usePlatformPermission;
