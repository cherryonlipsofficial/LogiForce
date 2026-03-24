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
