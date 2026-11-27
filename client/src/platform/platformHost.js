import { APP_DOMAIN, PLATFORM_SUBDOMAIN } from '../config/appDomain';

// The platform console lives at /platform/* in this app. LogiForce staff also
// reach it at admin.<VITE_APP_DOMAIN>, a reserved subdomain (never a company
// key), where every path goes to the console.
export const PLATFORM_HOSTNAME = APP_DOMAIN ? `${PLATFORM_SUBDOMAIN}.${APP_DOMAIN}` : null;

export const isPlatformHost = (hostname = window.location.hostname) =>
  (PLATFORM_HOSTNAME !== null && hostname === PLATFORM_HOSTNAME)
  // local testing: http://admin.localhost:5173
  || hostname === `${PLATFORM_SUBDOMAIN}.localhost`;
