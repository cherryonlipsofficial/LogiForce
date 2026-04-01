import axiosInstance from './axiosInstance';

export const getNotifications = (page = 1, { filter, type } = {}) => {
  const params = new URLSearchParams({ page });
  if (filter) params.append('filter', filter);
  if (type) params.append('type', type);
  return axiosInstance.get(`/notifications?${params.toString()}`);
};

export const getUnreadCount = () =>
  axiosInstance.get('/notifications/unread-count');

export const markAsRead = (id) =>
  axiosInstance.put(`/notifications/${id}/read`);

export const markAllAsRead = () =>
  axiosInstance.put('/notifications/mark-all-read');

export const getPendingApprovals = () =>
  axiosInstance.get('/notifications/pending-approvals');
