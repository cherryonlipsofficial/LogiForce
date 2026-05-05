import axiosInstance from './axiosInstance';

export const getProfile = () =>
  axiosInstance.get('/auth/profile');

export const updateProfile = (data) =>
  axiosInstance.put('/auth/profile', data);

export const changePassword = (data) =>
  axiosInstance.put('/auth/change-password', data);

export const updatePreferences = (data) =>
  axiosInstance.put('/auth/profile/avatar', data);

export const forgotPassword = (email) =>
  axiosInstance.post('/auth/forgot-password', { email }).then(r => r.data);

export const verifyResetToken = (token) =>
  axiosInstance.get(`/auth/reset-password/${token}`).then(r => r.data);

export const resetPassword = (token, password) =>
  axiosInstance.post('/auth/reset-password', { token, password }).then(r => r.data);

// ─── OTP-based flows (no SMTP setup needed on the server side) ──────────────

export const registerWithOtp = ({ name, email, password }) =>
  axiosInstance.post('/auth/register-with-otp', { name, email, password }).then(r => r.data);

export const sendOtp = ({ email, purpose }) =>
  axiosInstance.post('/auth/send-otp', { email, purpose }).then(r => r.data);

// purpose: 'verify_email' | 'login' | 'password_reset'
// For password_reset, also pass `password` so the new password is set atomically.
export const verifyOtp = ({ email, code, purpose, password }) =>
  axiosInstance.post('/auth/verify-otp', { email, code, purpose, password }).then(r => r.data);

export const forgotPasswordOtp = (email) =>
  axiosInstance.post('/auth/forgot-password-otp', { email }).then(r => r.data);
