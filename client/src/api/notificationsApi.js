import axiosInstance from './axiosInstance';

export const getNotifications = (page = 1) =>
  axiosInstance.get(`/notifications?page=${page}`);

export const getUnreadCount = () =>
  axiosInstance.get('/notifications/unread-count');

export const markAsRead = (id) =>
  axiosInstance.put(`/notifications/${id}/read`);

export const markAllAsRead = () =>
  axiosInstance.put('/notifications/mark-all-read');

export const getPendingApprovals = () =>
  axiosInstance.get('/notifications/pending-approvals');
