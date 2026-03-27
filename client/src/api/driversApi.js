import axiosInstance from './axiosInstance';

export const getDrivers = (params) =>
  axiosInstance.get('/drivers', { params }).then(r => r.data);

export const getDriver = (id) =>
  axiosInstance.get(`/drivers/${id}`).then(r => r.data);

export const createDriver = (data) =>
  axiosInstance.post('/drivers', data).then(r => r.data);

export const updateDriver = (id, data) =>
  axiosInstance.put(`/drivers/${id}`, data).then(r => r.data);

export const getDriverLedger = (id, params) =>
  axiosInstance.get(`/drivers/${id}/ledger`, { params }).then(r => r.data);

export const changeDriverStatus = (id, data) =>
  axiosInstance.put(`/drivers/${id}/status`, data).then(r => r.data);

export const getDriverDocuments = (id) =>
  axiosInstance.get(`/drivers/${id}/documents`).then(r => r.data);

export const uploadDriverDocument = (id, formData) =>
  axiosInstance.post(`/drivers/${id}/documents`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);

export const getDocumentFileUrl = (fileKey) => {
  const base = axiosInstance.defaults.baseURL;
  return `${base}/drivers/uploads/${fileKey}`;
};

export const fetchDocumentFile = (fileKey) =>
  axiosInstance.get(`/drivers/uploads/${fileKey}`, { responseType: 'blob' }).then(r => r);

export const getDocumentDirectUrl = (fileUrl, fileKey) => {
  const base = axiosInstance.defaults.baseURL;
  return `${base}/drivers/uploads/${fileKey}`;
};

export const getDriverStatusCounts = () =>
  axiosInstance.get('/drivers/status-counts').then(r => r.data);

export const exportDriversCsv = (params) =>
  axiosInstance.get('/drivers/export', { params, responseType: 'blob' }).then(r => r);

export const bulkImportDrivers = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return axiosInstance.post('/drivers/bulk-import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};

export const downloadImportTemplate = () =>
  axiosInstance.get('/drivers/bulk-import/template', { responseType: 'blob' }).then(r => r);

export const verifyContacts = (driverId) =>
  axiosInstance.post(`/drivers/${driverId}/verify-contacts`).then(r => r.data);

export const setClientUserId = (driverId, clientUserId) =>
  axiosInstance.put(`/drivers/${driverId}/client-user-id`, { clientUserId }).then(r => r.data);

export const activateDriver = (driverId) =>
  axiosInstance.post(`/drivers/${driverId}/activate`).then(r => r.data);

export const getStatusSummary = (driverId) =>
  axiosInstance.get(`/drivers/${driverId}/status-summary`).then(r => r.data);

export const getDriverHistory = (driverId, page = 1) =>
  axiosInstance.get(`/drivers/${driverId}/history`, { params: { page, limit: 30 } }).then(r => r.data);
