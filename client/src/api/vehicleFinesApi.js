import axiosInstance from './axiosInstance';

// Fine list + filtering
export const getVehicleFines = (params) =>
  axiosInstance.get('/vehicle-fines', { params }).then((r) => r.data);

export const getFineSummary = () =>
  axiosInstance.get('/vehicle-fines/summary').then((r) => r.data);

export const getFinesByVehicle = (vehicleId, params) =>
  axiosInstance.get(`/vehicle-fines/vehicle/${vehicleId}`, { params }).then((r) => r.data);

export const getFinesByDriver = (driverId, params) =>
  axiosInstance.get(`/vehicle-fines/driver/${driverId}`, { params }).then((r) => r.data);

// Fine CRUD
export const createFine = (data) =>
  axiosInstance.post('/vehicle-fines', data).then((r) => r.data);

export const bulkCreateFines = (data) =>
  axiosInstance.post('/vehicle-fines/bulk', data).then((r) => r.data);

export const updateFine = (id, data) =>
  axiosInstance.put(`/vehicle-fines/${id}`, data).then((r) => r.data);

export const deleteFine = (id) =>
  axiosInstance.delete(`/vehicle-fines/${id}`).then((r) => r.data);

// Fine status actions
export const disputeFine = (id, data) =>
  axiosInstance.put(`/vehicle-fines/${id}/dispute`, data).then((r) => r.data);

export const waiveFine = (id, data) =>
  axiosInstance.put(`/vehicle-fines/${id}/waive`, data).then((r) => r.data);
