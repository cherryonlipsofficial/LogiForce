import axiosInstance from './axiosInstance';

export const getCreditNotes = (params) =>
  axiosInstance.get('/credit-notes', { params }).then(r => r.data);

export const getCreditNote = (id) =>
  axiosInstance.get(`/credit-notes/${id}`).then(r => r.data);

export const createCreditNote = (data) =>
  axiosInstance.post('/credit-notes', data).then(r => r.data);

export const sendCreditNote = (id) =>
  axiosInstance.put(`/credit-notes/${id}/send`).then(r => r.data);

export const adjustCreditNote = (id, data) =>
  axiosInstance.put(`/credit-notes/${id}/adjust`, data).then(r => r.data);

export const resolveLine = (id, lineId, data) =>
  axiosInstance.put(`/credit-notes/${id}/lines/${lineId}/resolve`, data).then(r => r.data);

export const deleteCreditNote = (id) =>
  axiosInstance.delete(`/credit-notes/${id}`).then(r => r.data);

export const downloadCreditNotePdf = (id) =>
  axiosInstance.get(`/credit-notes/${id}/pdf`, { responseType: 'blob' }).then(r => r.data);

export const getSettlementSummary = () =>
  axiosInstance.get('/credit-notes/settlement-summary').then(r => r.data);

export const recordInvoicePayment = (invoiceId, data) =>
  axiosInstance.put(`/invoices/${invoiceId}/payment`, data).then(r => r.data);

export const getStatementOfAccounts = (params) =>
  axiosInstance.get('/reports/statement-of-accounts', { params }).then(r => r.data);
