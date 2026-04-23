import axiosInstance from './axiosInstance';

// Summary dashboard
export const getSimSummary = () =>
  axiosInstance.get('/simcards/summary').then(r => r.data);

// SIM CRUD
export const getSimCards = (params) =>
  axiosInstance.get('/simcards', { params }).then(r => r.data);

export const getSimCard = (id) =>
  axiosInstance.get(`/simcards/${id}`).then(r => r.data);

export const createSimCard = (data) =>
  axiosInstance.post('/simcards', data).then(r => r.data);

export const updateSimCard = (id, data) =>
  axiosInstance.put(`/simcards/${id}`, data).then(r => r.data);

export const deleteSimCard = (id) =>
  axiosInstance.delete(`/simcards/${id}`).then(r => r.data);

// Assignment
export const assignSim = (simId, data) =>
  axiosInstance.post(`/simcards/${simId}/assign`, data).then(r => r.data);

export const returnSim = (simId, data) =>
  axiosInstance.post(`/simcards/${simId}/return`, data).then(r => r.data);

export const getSimAssignmentHistory = (simId, params) =>
  axiosInstance.get(`/simcards/${simId}/assignment-history`, { params }).then(r => r.data);

export const getDriverSimHistory = (driverId, params) =>
  axiosInstance.get(`/simcards/driver/${driverId}/sim-history`, { params }).then(r => r.data);

// Bulk SIM import
export const bulkImportSims = (formData) =>
  axiosInstance.post('/simcards/bulk-import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  }).then(r => r.data);

// Bills
export const importSimBills = (formData) =>
  axiosInstance.post('/simcards/bills/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  }).then(r => r.data);

export const getSimBills = (params) =>
  axiosInstance.get('/simcards/bills', { params }).then(r => r.data);

export const getSimBill = (id) =>
  axiosInstance.get(`/simcards/bills/${id}`).then(r => r.data);

export const updateBillAllocations = (billId, data) =>
  axiosInstance.put(`/simcards/bills/${billId}/allocations`, data).then(r => r.data);

export const waiveBillAllocation = (billId, allocationIndex) =>
  axiosInstance.post(`/simcards/bills/${billId}/allocations/${allocationIndex}/waive`).then(r => r.data);
