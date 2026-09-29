// Set VITE_API_BASE_URL when the frontend and API are hosted separately.
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
