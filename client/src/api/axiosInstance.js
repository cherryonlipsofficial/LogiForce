import axios from 'axios';
import { currentTenantKey } from '../config/appDomain';

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://logiforce.onrender.com/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

axiosInstance.interceptors.request.use((config) => {
  // The company comes from the subdomain (or VITE_DEV_TENANT locally). With
  // neither, no header is sent and the server answers 400.
  const tenantKey = currentTenantKey();
  if (tenantKey) config.headers['x-tenant-id'] = tenantKey;

  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      return Promise.reject(error);
    }

    // Network error (no response received)
    if (!error.response) {
      error.message = 'Network error — please check your connection';
    }

    // Timeout
    if (error.code === 'ECONNABORTED') {
      error.message = 'Request timed out — please try again';
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
