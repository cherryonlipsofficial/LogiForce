import axiosInstance from './axiosInstance';

export const getCompanySettings = () =>
  axiosInstance.get('/settings/company').then((r) => r.data);

export const updateCompanySettings = (data) =>
  axiosInstance.put('/settings/company', data).then((r) => r.data);

export const uploadCompanyLogo = (file) => {
  const formData = new FormData();
  formData.append('logo', file);
  return axiosInstance
    .post('/settings/company/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data);
};

export const uploadCompanyStamp = (file) => {
  const formData = new FormData();
  formData.append('stamp', file);
  return axiosInstance
    .post('/settings/company/stamp', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data);
};

export const uploadCompanySignature = (file) => {
  const formData = new FormData();
  formData.append('signature', file);
  return axiosInstance
    .post('/settings/company/signature', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data);
};
