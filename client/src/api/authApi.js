import axiosInstance from './axiosInstance';

export const getProfile = () =>
  axiosInstance.get('/auth/profile');

export const updateProfile = (data) =>
  axiosInstance.put('/auth/profile', data);

export const changePassword = (data) =>
  axiosInstance.put('/auth/change-password', data);

export const updatePreferences = (data) =>
  axiosInstance.put('/auth/profile/avatar', data);
