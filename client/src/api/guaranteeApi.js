import axiosInstance from './axiosInstance'

export const getPendingExtensions = () =>
  axiosInstance.get('/guarantee-passports/pending-extensions')

export const reviewExtension = (guaranteeId, data) =>
  axiosInstance.put(`/guarantee-passports/${guaranteeId}/review-extension`, data)

export const getExpiringGuarantees = (days = 7) =>
  axiosInstance.get(`/guarantee-passports/expiring?days=${days}`)

export const returnGuarantee = (guaranteeId, notes) =>
  axiosInstance.post(`/guarantee-passports/${guaranteeId}/return`, { notes })
