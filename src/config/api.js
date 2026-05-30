// API Base URL configuration
export const API_BASE_URL =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1')
    ? 'http://localhost:8787'
    : 'https://occultushub-worker-production.rkilpatrick4221.workers.dev'
