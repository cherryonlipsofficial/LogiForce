import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PlatformAuthContext } from './platformAuthContext';
import { getPlatformToken, setPlatformToken, clearPlatformToken } from '../api/platformAxios';
import { platformLogin, platformVerifyOtp, platformResendOtp, platformMe } from '../api/platformApi';

export default function PlatformAuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState(() => ({ user: null, isLoading: Boolean(getPlatformToken()) }));

  useEffect(() => {
    if (!getPlatformToken()) return;
    let cancelled = false;
    platformMe()
      .then((res) => { if (!cancelled) setState({ user: res.user, isLoading: false }); })
      .catch(() => {
        clearPlatformToken();
        if (!cancelled) setState({ user: null, isLoading: false });
      });
    return () => { cancelled = true; };
  }, []);

  // Step 1: email + password → a challenge; a 6-digit code is emailed.
  const startLogin = useCallback((email, password) => platformLogin(email, password), []);

  // Step 2: the code → a platform token, stored under 'platformToken' only.
  const verifyCode = useCallback(async (challengeToken, code) => {
    const res = await platformVerifyOtp(challengeToken, code);
    setPlatformToken(res.token);
    setState({ user: res.user, isLoading: false });
    return res.user;
  }, []);

  const resendCode = useCallback((challengeToken) => platformResendOtp(challengeToken), []);

  // Signs out of the console only; a company session in this browser is untouched.
  const logout = useCallback(() => {
    clearPlatformToken();
    queryClient.removeQueries({ queryKey: ['platform'] });
    setState({ user: null, isLoading: false });
  }, [queryClient]);

  const value = useMemo(() => ({
    user: state.user,
    isLoading: state.isLoading,
    isAuthenticated: Boolean(state.user),
    isOwner: state.user?.role === 'owner',
    startLogin,
    verifyCode,
    resendCode,
    logout,
  }), [state, startLogin, verifyCode, resendCode, logout]);

  return <PlatformAuthContext.Provider value={value}>{children}</PlatformAuthContext.Provider>;
}
