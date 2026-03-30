import axiosInstance from './axiosInstance';

export const getDrivers = (params) =>
  axiosInstance.get('/drivers', { params }).then(r => r.data);

export const getDriver = (id) =>
  axiosInstance.get(`/drivers/${id}`).then(r => r.data);

export const createDriver = (data) =>
  axiosInstance.post('/drivers', data).then(r => r.data);

export const updateDriver = (id, data) =>
  axiosInstance.put(`/drivers/${id}`, data).then(r => r.data);

export const deleteDriver = (id) =>
  axiosInstance.delete(`/drivers/${id}`).then(r => r.data);

export const getDriverLedger = (id, params) =>
  axiosInstance.get(`/drivers/${id}/ledger`, { params }).then(r => r.data);

export const exportDriverLedger = (id) =>
  axiosInstance.get(`/drivers/${id}/ledger/export`, { responseType: 'blob' }).then(r => r);

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

export const activateDriver = (driverId, { personalVerificationConfirmed } = {}) =>
  axiosInstance.post(`/drivers/${driverId}/activate`, { personalVerificationConfirmed }).then(r => r.data);

export const getStatusSummary = (driverId) =>
  axiosInstance.get(`/drivers/${driverId}/status-summary`).then(r => r.data);

export const getDriverHistory = (driverId, page = 1) =>
  axiosInstance.get(`/drivers/${driverId}/history`, { params: { page, limit: 30 } }).then(r => r.data);

export const getExpiringDocumentsByType = (days = 30) =>
  axiosInstance.get('/drivers/documents/expiring', { params: { days } }).then(r => r.data);

export const getDriverHistorySummary = (days = 30) =>
  axiosInstance.get('/drivers/history/summary', { params: { days } }).then(r => r.data);

export const getExpiredDocuments = (docType = 'all') =>
  axiosInstance.get('/drivers/expired-documents', { params: { docType } }).then(r => r.data);

export const getMyDrivers = (params) =>
  axiosInstance.get('/drivers/my', { params }).then(r => r.data);

// ── Guarantee Passport ──

export const submitOwnPassport = (driverId) =>
  axiosInstance.post(`/drivers/${driverId}/passport/own`).then(r => r.data);

export const recordGuaranteePassport = (driverId, data) =>
  axiosInstance.post(`/drivers/${driverId}/passport/guarantee`, data).then(r => r.data);

export const getActiveGuarantee = (driverId) =>
  axiosInstance.get(`/drivers/${driverId}/passport/guarantee`).then(r => r.data);

export const getGuaranteeHistory = (driverId) =>
  axiosInstance.get(`/drivers/${driverId}/passport/guarantee/history`).then(r => r.data);

export const requestGuaranteeExtension = (guaranteeId, data) =>
  axiosInstance.post(`/guarantee-passports/${guaranteeId}/request-extension`, data).then(r => r.data);

export const requestExtension = (guaranteeId, data) =>
  axiosInstance.post(`/guarantee-passports/${guaranteeId}/request-extension`, data).then(r => r.data);

export const reviewGuaranteeExtension = (guaranteeId, data) =>
  axiosInstance.put(`/guarantee-passports/${guaranteeId}/review-extension`, data).then(r => r.data);

export const returnGuaranteePassport = (guaranteeId, notes) =>
  axiosInstance.post(`/guarantee-passports/${guaranteeId}/return`, { notes }).then(r => r.data);
