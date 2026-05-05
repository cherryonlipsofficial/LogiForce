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
