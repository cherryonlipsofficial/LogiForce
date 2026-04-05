import axios from 'axios';

// Extract tenant from current subdomain
// clienta.logiforce.app → "clienta"
// localhost:5173 → fallback to env variable
const getTenantId = () => {
  const hostname = window.location.hostname;
  const parts = hostname.split('.');
  if (parts.length >= 3) {
    return parts[0];
  }
  return import.meta.env.VITE_TENANT_ID || 'clienta';
};

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://logiforce.onrender.com/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

axiosInstance.interceptors.request.use((config) => {
  config.headers['x-tenant-id'] = getTenantId();

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
