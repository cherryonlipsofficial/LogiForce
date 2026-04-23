import axiosInstance from './axiosInstance';

// Fleet summary
export const getFleetSummary = () =>
  axiosInstance.get('/vehicles/summary').then((r) => r.data);

// Vehicle list + detail
export const getVehicles = (params) =>
  axiosInstance.get('/vehicles', { params }).then((r) => r.data);

export const getVehicle = (id) =>
  axiosInstance.get(`/vehicles/${id}`).then((r) => r.data);

// Vehicle create / update
export const createVehicle = (data) =>
  axiosInstance.post('/vehicles', data).then((r) => r.data);

export const updateVehicle = (id, data) =>
  axiosInstance.put(`/vehicles/${id}`, data).then((r) => r.data);

// Vehicle categories (supplier catalog)
export const getCategories = (params) =>
  axiosInstance.get('/vehicles/categories', { params }).then((r) => r.data);

export const createCategory = (data) =>
  axiosInstance.post('/vehicles/categories', data).then((r) => r.data);

export const updateCategory = (id, data) =>
  axiosInstance.put(`/vehicles/categories/${id}`, data).then((r) => r.data);

// Assignment operations
export const assignVehicle = (vehicleId, data) =>
  axiosInstance.post(`/vehicles/${vehicleId}/assign`, data).then((r) => r.data);

export const returnVehicle = (assignmentId, data) =>
  axiosInstance.post(`/vehicles/assignments/${assignmentId}/return`, data).then((r) => r.data);

export const offHireVehicle = (vehicleId, data) =>
  axiosInstance.post(`/vehicles/${vehicleId}/off-hire`, data).then((r) => r.data);

// Contract operations
export const getActiveContract = (vehicleId) =>
  axiosInstance.get(`/vehicles/${vehicleId}/contract`).then((r) => r.data);

export const createContract = (vehicleId, data) =>
  axiosInstance.post(`/vehicles/${vehicleId}/contract`, data).then((r) => r.data);

export const renewContract = (vehicleId, data) =>
  axiosInstance.post(`/vehicles/${vehicleId}/contract/renew`, data).then((r) => r.data);

export const getExpiringContracts = (days) =>
  axiosInstance.get('/vehicles/contracts/expiring', { params: { days } }).then((r) => r.data);

export const terminateContract = (vehicleId, data) =>
  axiosInstance.put(`/vehicles/${vehicleId}/contract/terminate`, data).then((r) => r.data);

// Assignment history & current assignment
export const getVehicleAssignmentHistory = (vehicleId, page = 1, limit = 20) =>
  axiosInstance.get(`/vehicles/${vehicleId}/assignment-history`, { params: { page, limit } }).then((r) => r.data);

export const getCurrentAssignment = (vehicleId) =>
  axiosInstance.get(`/vehicles/${vehicleId}/current-assignment`).then((r) => r.data);

export const getCurrentDriverVehicle = (driverId) =>
  axiosInstance.get(`/drivers/${driverId}/current-vehicle`).then((r) => r.data);

export const getDriverVehicleHistory = (driverId, page = 1, limit = 20) =>
  axiosInstance.get(`/drivers/${driverId}/vehicle-history`, { params: { page, limit } }).then((r) => r.data);

// Fleet dashboard
export const getFleetDashboard = () =>
  axiosInstance.get('/vehicles/fleet-dashboard').then((r) => r.data);

// Vehicle timeline
export const getVehicleTimeline = (vehicleId) =>
  axiosInstance.get(`/vehicles/${vehicleId}/timeline`).then((r) => r.data);

// Mileage update
export const updateMileage = (vehicleId, data) =>
  axiosInstance.put(`/vehicles/${vehicleId}/mileage`, data).then((r) => r.data);

// Delete vehicle
export const deleteVehicle = (id) =>
  axiosInstance.delete(`/vehicles/${id}`).then((r) => r.data);

// Bulk import
export const bulkUploadVehicles = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return axiosInstance.post('/vehicles/bulk-upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);
};

export const downloadVehicleTemplate = () =>
  axiosInstance.get('/vehicles/bulk-template', { responseType: 'blob' }).then((r) => r);
