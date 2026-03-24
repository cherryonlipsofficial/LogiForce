import axiosInstance from './axiosInstance';

export const getVehicles = (params) =>
  axiosInstance.get('/vehicles', { params }).then((r) => r.data);

export const getVehicle = (id) =>
  axiosInstance.get(`/vehicles/${id}`).then((r) => r.data);

export const getVehicleSummary = () =>
  axiosInstance.get('/vehicles/summary').then((r) => r.data);

export const exportVehicles = (params) =>
  axiosInstance.get('/vehicles/export', { params, responseType: 'blob' }).then((r) => r.data);

export const createVehicle = (data) =>
  axiosInstance.post('/vehicles', data).then((r) => r.data);

export const updateVehicle = (id, data) =>
  axiosInstance.put(`/vehicles/${id}`, data).then((r) => r.data);

export const deleteVehicle = (id) =>
  axiosInstance.delete(`/vehicles/${id}`).then((r) => r.data);

export const assignVehicle = (id, driverId) =>
  axiosInstance.put(`/vehicles/${id}/assign`, { driverId }).then((r) => r.data);

export const unassignVehicle = (id) =>
  axiosInstance.put(`/vehicles/${id}/unassign`).then((r) => r.data);
