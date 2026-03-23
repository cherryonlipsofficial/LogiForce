import axiosInstance from './axiosInstance';

export const generateInvoice = (data) =>
  axiosInstance.post('/invoices/generate', data).then(r => r.data);

export const getInvoices = (params) =>
  axiosInstance.get('/invoices', { params }).then(r => r.data);

export const getInvoice = (id) =>
  axiosInstance.get(`/invoices/${id}`).then(r => r.data);

export const updateStatus = (id, data) =>
  axiosInstance.patch(`/invoices/${id}/status`, data).then(r => r.data);

export const addCreditNote = (id, data) =>
  axiosInstance.post(`/invoices/${id}/credit-notes`, data).then(r => r.data);

export const downloadPdf = (id) =>
  axiosInstance.get(`/invoices/${id}/pdf`, { responseType: 'blob' }).then(r => r.data);
