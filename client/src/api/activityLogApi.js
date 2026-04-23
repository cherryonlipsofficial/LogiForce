import axiosInstance from './axiosInstance';

export const getActivityLog = (params = {}) =>
  axiosInstance.get('/activity-log', { params }).then((r) => r.data);

export const getActivityLogUsers = () =>
  axiosInstance.get('/activity-log/users').then((r) => r.data);

export const getActivityLogEntityTypes = () =>
  axiosInstance.get('/activity-log/entity-types').then((r) => r.data);
