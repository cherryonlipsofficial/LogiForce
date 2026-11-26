// The platform console lives at /platform/* in this app. LogiForce staff also
// reach it at admin.logiforce.app, a reserved subdomain (never a company key),
// where every path goes to the console.
export const PLATFORM_HOSTNAME = 'admin.logiforce.app';

export const isPlatformHost = (hostname = window.location.hostname) =>
  hostname === PLATFORM_HOSTNAME
  // local testing: http://admin.localhost:5173
  || hostname === 'admin.localhost';
