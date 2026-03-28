import axiosInstance from './axiosInstance';

export const getGuaranteePassports = () =>
  axiosInstance.get('/guarantee-passports').then(r => r.data);
