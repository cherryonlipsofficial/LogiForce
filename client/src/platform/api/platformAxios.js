import axios from 'axios';

// The platform console's own HTTP client. It is deliberately separate from
// api/axiosInstance.js (the company app's):
//   - it NEVER sends x-tenant-id: platform routes are not tied to a company;
//   - its token lives under its own key, so signing in or out of the console
//     never touches the company login ('token'), and the other way round.
export const PLATFORM_TOKEN_KEY = 'platformToken';

const apiBase = (import.meta.env.VITE_API_URL || 'https://logiforce.onrender.com/api').replace(/\/+$/, '');

export const getPlatformToken = () => {
  try { return localStorage.getItem(PLATFORM_TOKEN_KEY); } catch { return null; }
};
export const setPlatformToken = (token) => {
  try { localStorage.setItem(PLATFORM_TOKEN_KEY, token); } catch { /* storage blocked */ }
};
export const clearPlatformToken = () => {
  try { localStorage.removeItem(PLATFORM_TOKEN_KEY); } catch { /* storage blocked */ }
};

const platformAxios = axios.create({
  baseURL: `${apiBase}/platform`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000, // provisioning a company can take a while
});

platformAxios.interceptors.request.use((config) => {
  // Belt and braces: never let a company header through, whatever set it.
  if (config.headers?.delete) config.headers.delete('x-tenant-id');
  else if (config.headers) delete config.headers['x-tenant-id'];

  const token = getPlatformToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

platformAxios.interceptors.response.use(
  (response) => response,
  (error) => {
    // A signed-in request was refused: the platform session is over. (A 401
    // from the login form itself carries no token and is shown on the form.)
    const sentToken = Boolean(error.config?.headers?.Authorization);
    if (error.response?.status === 401 && sentToken) {
      clearPlatformToken();
      if (!window.location.pathname.startsWith('/platform/login')) {
        window.location.assign('/platform/login');
      }
    }
    if (!error.response) error.message = 'Network error — please check your connection';
    if (error.code === 'ECONNABORTED') error.message = 'Request timed out — please try again';
    return Promise.reject(error);
  }
);

/** The server's message for a failed request, or a fallback. */
export const platformErrorMessage = (err, fallback = 'Something went wrong') =>
  err?.response?.data?.message || err?.message || fallback;

export default platformAxios;
